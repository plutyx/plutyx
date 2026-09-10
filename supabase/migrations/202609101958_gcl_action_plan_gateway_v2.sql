create or replace function public.gcl_action_plan_list(p_audit_run_id uuid)
returns table(
  id uuid,
  audit_run_id uuid,
  domain_id uuid,
  issue_key text,
  label text,
  recommendation text,
  status text,
  source_points numeric,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language sql
security invoker
set search_path = public, sac, auth
as $$
  select * from sac.gcl_action_plan_list(p_audit_run_id);
$$;

create or replace function public.gcl_action_plan_upsert(
  p_audit_run_id uuid,
  p_issue_key text,
  p_label text,
  p_recommendation text default null,
  p_source_points numeric default null,
  p_status text default 'todo',
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = public, sac, auth
as $$
  select to_jsonb(sac.gcl_action_plan_upsert(
    p_audit_run_id,
    p_issue_key,
    p_label,
    p_recommendation,
    p_source_points,
    p_status,
    p_note
  ));
$$;

create or replace function public.gcl_action_plan_delete(p_item_id uuid)
returns boolean
language sql
security invoker
set search_path = public, sac, auth
as $$
  select sac.gcl_action_plan_delete(p_item_id);
$$;

create or replace function public.gcl_action_plan_rate_limit(p_action text)
returns jsonb
language plpgsql
security invoker
set search_path = public, sac, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action,'')));
  v_limit integer;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if v_action not in ('list','upsert','delete') then
    raise exception 'invalid_action';
  end if;
  v_limit := case when v_action = 'list' then 120 else 30 end;
  return sac.consume_rate_limit(
    'action-plan:' || v_action,
    v_uid::text,
    60,
    v_limit
  );
end;
$$;

revoke all on function public.gcl_action_plan_list(uuid) from public, anon;
revoke all on function public.gcl_action_plan_upsert(uuid,text,text,text,numeric,text,text) from public, anon;
revoke all on function public.gcl_action_plan_delete(uuid) from public, anon;
revoke all on function public.gcl_action_plan_rate_limit(text) from public, anon;
grant execute on function public.gcl_action_plan_list(uuid) to authenticated, service_role;
grant execute on function public.gcl_action_plan_upsert(uuid,text,text,text,numeric,text,text) to authenticated, service_role;
grant execute on function public.gcl_action_plan_delete(uuid) to authenticated, service_role;
grant execute on function public.gcl_action_plan_rate_limit(text) to authenticated, service_role;

notify pgrst, 'reload schema';
