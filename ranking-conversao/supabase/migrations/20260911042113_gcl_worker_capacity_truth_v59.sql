alter function public.gcl_public_health() rename to gcl_public_health_base_v59;

revoke all on function public.gcl_public_health_base_v59() from public, anon, authenticated;
grant execute on function public.gcl_public_health_base_v59() to service_role, postgres;

create or replace function public.gcl_worker_capacity_health()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','sac'
as $function$
declare
  v_slots int:=1;
  v_reserved int:=0;
  v_dispatch int:=1;
  v_soft int:=25;
  v_hard int:=100;
  v_completed_at timestamptz;
  v_worker_version text;
  v_total_ms numeric;
  v_lighthouse_available boolean;
  v_lighthouse_error text;
  v_category_profile text;
  v_cleanup_after int;
  v_cleanup_signals int;
  v_cleanup_ok boolean:=false;
  v_lab_status text:='no_observation';
begin
  select global_slots,reserved_paid_slots,dispatch_batch,queue_soft_limit,queue_hard_limit
    into v_slots,v_reserved,v_dispatch,v_soft,v_hard
  from sac.runtime_capacity where subsystem='fullscan' limit 1;

  select f.completed_at,
         f.response->'engine'->>'version',
         nullif(f.response->'audit'->>'duration_ms','')::numeric,
         coalesce((f.response->'lighthouse'->>'available')::boolean,false),
         f.response->'lighthouse'->>'error',
         f.response->'lighthouse'->>'category_profile',
         coalesce((f.response->'lighthouse'->'profile_cleanup'->>'matched_after')::int,0),
         coalesce((f.response->'lighthouse'->'profile_cleanup'->>'kill_signals_sent')::int,0)
    into v_completed_at,v_worker_version,v_total_ms,v_lighthouse_available,v_lighthouse_error,v_category_profile,v_cleanup_after,v_cleanup_signals
  from sac.fullscan_jobs f
  where f.status='completed'
    and f.response->'engine'->>'name'='convrank-gcl-audit'
    and f.response->'engine'->>'version' is not null
  order by f.completed_at desc nulls last
  limit 1;

  v_cleanup_ok:=v_completed_at is not null and coalesce(v_cleanup_after,0)=0;
  v_lab_status:=case
    when v_completed_at is null then 'no_observation'
    when v_lighthouse_available then 'operational'
    when coalesce(v_lighthouse_error,'') like 'lighthouse_budget_exceeded_%' then 'fail_soft_cpu_constrained'
    else 'fail_soft_degraded'
  end;

  return jsonb_build_object(
    'admission_model','bounded_single_slot',
    'global_slots',coalesce(v_slots,1),
    'reserved_paid_slots',coalesce(v_reserved,0),
    'dispatch_batch',coalesce(v_dispatch,1),
    'queue_soft_limit',coalesce(v_soft,25),
    'queue_hard_limit',coalesce(v_hard,100),
    'latest_observation',jsonb_build_object(
      'completed_at',v_completed_at,
      'worker_version',v_worker_version,
      'total_ms',v_total_ms,
      'local_lighthouse_available',v_lighthouse_available,
      'local_lighthouse_status',v_lab_status,
      'local_lighthouse_error',v_lighthouse_error,
      'category_profile',v_category_profile,
      'cleanup_verified',v_cleanup_ok,
      'cleanup_matched_after',coalesce(v_cleanup_after,0),
      'cleanup_kill_signals',coalesce(v_cleanup_signals,0)
    ),
    'local_lighthouse_fail_soft',true,
    'external_pagespeed_fallback',true,
    'paid_volume_attested',false,
    'lead_capture_blocked_by_worker',false,
    'disclosure','The heavy audit worker is intentionally limited to one active slot. Chromium cleanup is verified, but the current CPU plan can make local Lighthouse degrade on heavy pages. This does not block public lead capture; paid-volume capacity requires a separate infrastructure decision.'
  );
end;
$function$;

revoke all on function public.gcl_worker_capacity_health() from public, anon;
grant execute on function public.gcl_worker_capacity_health() to authenticated, service_role, postgres;

create or replace function public.gcl_public_health()
returns jsonb
language sql
stable
security definer
set search_path to 'public','sac'
as $function$
  select public.gcl_public_health_base_v59()
    || jsonb_build_object('heavy_worker', public.gcl_worker_capacity_health());
$function$;

revoke all on function public.gcl_public_health() from public, anon;
grant execute on function public.gcl_public_health() to authenticated, service_role, postgres;