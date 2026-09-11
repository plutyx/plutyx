-- GCL v79: narrow RPC-level abuse protection for sensitive authenticated writes.
-- Keeps existing fine-grained authorization in each SECURITY DEFINER function.

create or replace function sac.gcl_authenticated_rpc_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = sac, public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', ''),
    ''
  );
  v_route text;
  v_rate jsonb;
begin
  -- Preserve trusted server/database execution while rate-limiting real user JWT calls.
  if v_role = 'service_role' or v_role = '' then
    return;
  end if;

  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_route := case p_key
    when 'gcl:profile' then 'member:update_profile'
    when 'gcl:awards_submit' then 'member:submit_awards'
    when 'gcl:domain_claim_begin' then 'member:begin_domain_claim'
    when 'gcl:domain_claim_attempt' then 'member:domain_claim_attempt'
    when 'gcl:link_pending_purchases' then 'member:link_pending_purchases'
    when 'gcl:member_checkout' then 'member:checkout'
    when 'gcl:moderation_action' then 'member:moderation_action'
    when 'gcl:jury_score' then 'member:jury_score'
    else null
  end;

  if v_route is null then
    raise exception 'invalid_rate_limit_key' using errcode = '22023';
  end if;

  v_rate := sac.consume_rate_limit(
    v_route,
    'user:' || v_user::text,
    greatest(coalesce(p_window_seconds, 60), 1),
    greatest(coalesce(p_limit, 1), 1)
  );

  if coalesce((v_rate ->> 'allowed')::boolean, false) is not true then
    raise exception 'rate_limited'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'route', v_route,
              'reset_at', v_rate ->> 'reset_at'
            )::text;
  end if;
end;
$$;

revoke execute on function sac.gcl_authenticated_rpc_rate_limit(text, integer, integer)
from public, anon, authenticated, service_role;

-- Patch the live definitions in place. This deliberately fails closed if a target is
-- missing/overloaded or if its PL/pgSQL body no longer contains a BEGIN token.
do $$
declare
  rec record;
  target_oids oid[];
  function_def text;
  begin_pos integer;
  injected text;
  patched_def text;
begin
  for rec in
    select * from (values
      ('gcl_update_profile', 'gcl:profile', 20, 60),
      ('gcl_submit_awards_entry', 'gcl:awards_submit', 10, 60),
      ('gcl_begin_domain_claim', 'gcl:domain_claim_begin', 20, 60),
      ('gcl_record_domain_claim_attempt', 'gcl:domain_claim_attempt', 30, 60),
      ('gcl_link_pending_purchases', 'gcl:link_pending_purchases', 6, 60),
      ('gcl_prepare_member_checkout', 'gcl:member_checkout', 20, 60),
      ('gcl_moderate_report', 'gcl:moderation_action', 60, 60),
      ('gcl_jury_score_entry', 'gcl:jury_score', 30, 60)
    ) as v(proname, rate_key, rate_limit, window_seconds)
  loop
    select array_agg(p.oid order by p.oid)
      into target_oids
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = rec.proname;

    if cardinality(target_oids) is distinct from 1 then
      raise exception 'v79_patch_target_not_found:%', rec.proname;
    end if;

    function_def := pg_get_functiondef(target_oids[1]);

    if position('gcl_authenticated_rpc_rate_limit(' in function_def) > 0 then
      continue;
    end if;

    begin_pos := regexp_instr(function_def, E'\\mbegin\\M', 1, 1, 0, 'i');
    if begin_pos <= 0 then
      raise exception 'v79_patch_target_not_found:%', rec.proname;
    end if;

    injected := format(
      E'begin\n  perform sac.gcl_authenticated_rpc_rate_limit(%L, %s, %s);',
      rec.rate_key,
      rec.rate_limit,
      rec.window_seconds
    );

    patched_def := overlay(function_def placing injected from begin_pos for 5);
    execute patched_def;
  end loop;
end;
$$;
