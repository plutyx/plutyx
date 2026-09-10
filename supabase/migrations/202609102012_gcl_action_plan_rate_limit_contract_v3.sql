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
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if v_action not in ('list','upsert','delete') then
    raise exception 'invalid_action';
  end if;
  v_limit := case when v_action = 'list' then 120 else 30 end;
  v_result := sac.consume_rate_limit(
    'action-plan:' || v_action,
    v_uid::text,
    60,
    v_limit
  );
  if coalesce((v_result->>'allowed')::boolean, false) is false then
    raise exception 'rate_limit_exceeded';
  end if;
  return v_result;
end;
$$;

revoke all on function public.gcl_action_plan_rate_limit(text) from public, anon;
grant execute on function public.gcl_action_plan_rate_limit(text) to authenticated, service_role;

comment on function public.gcl_action_plan_rate_limit(text) is
  'Authenticated per-user rate gate for gcl-action-plan-api. list=120/min, upsert/delete=30/min; raises rate_limit_exceeded when exhausted.';
comment on function public.gcl_action_plan_list(uuid) is
  'PostgREST gateway for authenticated Action Plan reads; delegates ownership checks to sac.gcl_action_plan_list.';
comment on function public.gcl_action_plan_upsert(uuid,text,text,text,numeric,text,text) is
  'PostgREST gateway for authenticated Action Plan writes; delegates ownership checks to sac.gcl_action_plan_upsert.';
comment on function public.gcl_action_plan_delete(uuid) is
  'PostgREST gateway for authenticated Action Plan deletion; delegates ownership checks to sac.gcl_action_plan_delete.';

notify pgrst, 'reload schema';
