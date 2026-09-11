-- GCL v64: fair multi-user fullscan scheduler.
-- Keep the heavy browser worker at one safe slot, but make the Postgres queue
-- priority-aware, fair between requesters/domains, and observable with matching ETA semantics.

create or replace function sac.fullscan_priority_rank(p_mode text)
returns integer
language sql
immutable
parallel safe
set search_path to 'sac','public'
as $$
  select case
    when p_mode='full_paid' then 0
    when p_mode='lighthouse_full' then 1
    when p_mode='benchmark_deepening' then 9
    else 2
  end;
$$;

create or replace function sac.fullscan_fairness_key(p_owner uuid, p_url text)
returns text
language sql
immutable
parallel safe
set search_path to 'sac','public'
as $$
  select case
    when p_owner is not null then 'owner:' || p_owner::text
    else 'domain:' || coalesce(
      nullif(
        regexp_replace(
          lower(split_part(split_part(regexp_replace(trim(coalesce(p_url,'')), '^https?://', '', 'i'), '/', 1), ':', 1)),
          '^www\.', '', 'i'
        ),
        ''
      ),
      'unknown:' || md5(lower(trim(coalesce(p_url,''))))
    )
  end;
$$;

create or replace function sac.fullscan_dispatch_plan_v1()
returns table(
  job_id uuid,
  priority_rank integer,
  fair_round bigint,
  queue_position bigint
)
language sql
stable
security invoker
set search_path to 'sac','public'
as $$
  with eligible as (
    select
      j.id,
      j.created_at,
      sac.fullscan_priority_rank(j.mode) as priority_rank,
      sac.fullscan_fairness_key(j.owner_user_id,j.url) as fairness_key
    from sac.fullscan_jobs j
    where j.status='queued'
      and (j.error is null or j.error not like 'retry_%' or j.updated_at < now()-interval '30 seconds')
  ),
  ranked as (
    select
      e.*,
      row_number() over(
        partition by e.priority_rank,e.fairness_key
        order by e.created_at,e.id
      ) as fair_round
    from eligible e
  ),
  recent_service as (
    select
      sac.fullscan_priority_rank(h.mode) as priority_rank,
      sac.fullscan_fairness_key(h.owner_user_id,h.url) as fairness_key,
      max(h.started_at) as last_started_at
    from sac.fullscan_jobs h
    where h.started_at is not null
      and h.started_at > now()-interval '24 hours'
    group by 1,2
  ),
  ordered as (
    select
      r.id,
      r.priority_rank,
      r.fair_round,
      row_number() over(
        order by
          r.priority_rank,
          r.fair_round,
          s.last_started_at nulls first,
          r.created_at,
          r.id
      ) as queue_position
    from ranked r
    left join recent_service s
      on s.priority_rank=r.priority_rank
     and s.fairness_key=r.fairness_key
  )
  select o.id,o.priority_rank,o.fair_round,o.queue_position
  from ordered o
  order by o.queue_position;
$$;

revoke all on function sac.fullscan_priority_rank(text) from public,anon,authenticated;
revoke all on function sac.fullscan_fairness_key(uuid,text) from public,anon,authenticated;
revoke all on function sac.fullscan_dispatch_plan_v1() from public,anon,authenticated;

grant execute on function sac.fullscan_priority_rank(text) to service_role;
grant execute on function sac.fullscan_fairness_key(uuid,text) to service_role;
grant execute on function sac.fullscan_dispatch_plan_v1() to service_role;

create or replace function sac.dispatch_fullscan_jobs(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path to 'sac','public','net','vault'
as $function$
declare
  j record;
  cfg sac.runtime_capacity%rowtype;
  v_preview_url text;
  v_lighthouse_url text;
  v_token text;
  v_target_url text;
  v_request bigint;
  v_timeout integer;
  v_max_pages integer;
  v_count int:=0;
  v_processing int:=0;
  v_processing_nonpaid int:=0;
  v_available int:=0;
  v_nonpaid_cap int:=0;
  v_batch int:=0;
begin
  if not pg_try_advisory_xact_lock(hashtext('gcl_fullscan_dispatch_v64')) then return 0; end if;
  select * into cfg from sac.runtime_capacity where subsystem='fullscan';
  if cfg.subsystem is null then raise exception 'fullscan_capacity_config_missing'; end if;

  select count(*)::int,count(*) filter(where mode<>'full_paid')::int
    into v_processing,v_processing_nonpaid
  from sac.fullscan_jobs where status='processing';

  v_available:=greatest(0,cfg.global_slots-v_processing);
  v_nonpaid_cap:=greatest(0,cfg.global_slots-cfg.reserved_paid_slots);
  v_batch:=least(greatest(1,least(coalesce(p_limit,cfg.dispatch_batch),cfg.dispatch_batch)),v_available);
  if v_batch<=0 then return 0; end if;

  select decrypted_secret into v_preview_url from vault.decrypted_secrets where name='sac_render_worker_url' limit 1;
  select decrypted_secret into v_lighthouse_url from vault.decrypted_secrets where name='sac_render_lighthouse_worker_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='sac_render_worker_token' limit 1;
  if v_preview_url is null or v_token is null then raise exception 'SAC preview worker runtime secret missing'; end if;

  for j in
    select f.id,f.url,f.mode,f.attempts,p.queue_position,p.fair_round
    from sac.fullscan_dispatch_plan_v1() p
    join sac.fullscan_jobs f on f.id=p.job_id
    order by p.queue_position
    for update of f skip locked
    limit 25
  loop
    exit when v_count>=v_batch;
    if j.mode<>'full_paid' and v_processing_nonpaid>=v_nonpaid_cap then continue; end if;

    if j.mode in('lighthouse_full','full_paid','benchmark_deepening') then
      if v_lighthouse_url is null then
        update sac.fullscan_jobs set status='failed',error='Lighthouse worker URL missing',updated_at=now(),completed_at=now() where id=j.id;
        continue;
      end if;
      v_target_url:=v_lighthouse_url;
      if j.mode='benchmark_deepening' then
        v_timeout:=210000;
        v_max_pages:=1;
      else
        v_timeout:=150000;
        v_max_pages:=10;
      end if;
    else
      v_target_url:=v_preview_url;
      v_timeout:=45000;
      v_max_pages:=3;
    end if;

    update sac.fullscan_jobs
      set status='processing',attempts=attempts+1,started_at=coalesce(started_at,now()),updated_at=now(),error=null,
          response=coalesce(response,'{}'::jsonb)||jsonb_build_object(
            'dispatch_scheduler','priority_fair_round_robin_v1',
            'dispatch_queue_position',j.queue_position,
            'dispatch_fair_round',j.fair_round
          )||case when mode='benchmark_deepening' then jsonb_build_object(
            'dispatch_profile',case when j.attempts>=1 then 'background_root_retry_210s' else 'background_root_210s' end,
            'requested_max_pages',v_max_pages,
            'requested_timeout_ms',v_timeout,
            'pipeline_note','render+axe then lighthouse; background transport includes cold-start margin'
          ) else '{}'::jsonb end
    where id=j.id;

    v_request:=net.http_post(
      url:=rtrim(v_target_url,'/')||'/audit',
      headers:=jsonb_build_object('Content-Type','application/json','x-sac-worker-token',v_token),
      body:=jsonb_build_object('url',j.url,'max_pages',v_max_pages,'render_js',true,'include_screenshot',false,'job_class',j.mode),
      timeout_milliseconds:=v_timeout
    );
    update sac.fullscan_jobs set request_id=v_request,updated_at=now() where id=j.id;
    v_count:=v_count+1;
    v_processing:=v_processing+1;
    if j.mode<>'full_paid' then v_processing_nonpaid:=v_processing_nonpaid+1; end if;
  end loop;
  return v_count;
end;
$function$;

create or replace function sac.scan_queue_position_v1(p_token uuid)
returns jsonb
language plpgsql
stable
set search_path to 'sac','public'
as $function$
declare
  j sac.fullscan_jobs%rowtype;
  cfg sac.runtime_capacity%rowtype;
  v_position bigint;
  v_fair_round bigint;
  v_ahead int:=0;
  v_processing int:=0;
  v_avg numeric;
  v_p95 numeric;
  v_slots int:=1;
  v_eta_avg int:=0;
  v_eta_p95 int:=0;
begin
  select * into j from sac.fullscan_jobs where public_token=p_token order by created_at desc limit 1;
  if j.id is null then return jsonb_build_object('available',false,'reason','job_not_found'); end if;
  select * into cfg from sac.runtime_capacity where subsystem='fullscan';
  v_slots:=greatest(1,coalesce(cfg.global_slots,1));
  select round(avg(extract(epoch from(completed_at-started_at)))::numeric,1),
         round(percentile_cont(.95) within group(order by extract(epoch from(completed_at-started_at)))::numeric,1)
    into v_avg,v_p95
  from sac.fullscan_jobs
  where status='completed' and started_at is not null and completed_at is not null
    and completed_at>now()-interval '24 hours';

  if j.status='processing' then
    return jsonb_build_object(
      'available',true,'status','processing','position',0,'jobs_ahead',0,
      'priority',case when j.mode='full_paid' then 'paid' when j.mode='lighthouse_full' then 'priority' when j.mode='benchmark_deepening' then 'benchmark' else 'standard' end,
      'started_at',j.started_at,'avg_processing_seconds_24h',v_avg,'p95_processing_seconds_24h',v_p95,
      'scheduler','priority_fair_round_robin_v1',
      'message','Scan em processamento no worker.'
    );
  elsif j.status<>'queued' then
    return jsonb_build_object('available',true,'status',j.status,'position',null,'jobs_ahead',0,'avg_processing_seconds_24h',v_avg,'p95_processing_seconds_24h',v_p95,'scheduler','priority_fair_round_robin_v1');
  end if;

  select p.queue_position,p.fair_round into v_position,v_fair_round
  from sac.fullscan_dispatch_plan_v1() p where p.job_id=j.id;
  if v_position is null then
    return jsonb_build_object('available',true,'status','queued','position',null,'jobs_ahead',null,'scheduler','priority_fair_round_robin_v1','message','Scan aguardando janela de retry antes de retornar à fila elegível.');
  end if;

  v_ahead:=greatest(0,(v_position-1)::int);
  select count(*)::int into v_processing from sac.fullscan_jobs where status='processing';
  if coalesce(v_avg,0)>0 then v_eta_avg:=ceil((v_processing+v_ahead)::numeric/v_slots)*v_avg; end if;
  if coalesce(v_p95,0)>0 then v_eta_p95:=ceil((v_processing+v_ahead)::numeric/v_slots)*v_p95; end if;

  return jsonb_build_object(
    'available',true,'status','queued','position',v_position,'jobs_ahead',v_ahead,
    'priority',case when j.mode='full_paid' then 'paid' when j.mode='lighthouse_full' then 'priority' when j.mode='benchmark_deepening' then 'benchmark' else 'standard' end,
    'fair_round',v_fair_round,
    'estimated_start_seconds',case when v_avg is null then null else v_eta_avg end,
    'estimated_start_seconds_p95',case when v_p95 is null then null else v_eta_p95 end,
    'avg_processing_seconds_24h',v_avg,'p95_processing_seconds_24h',v_p95,
    'global_slots',v_slots,
    'scheduler','priority_fair_round_robin_v1',
    'admission_state',case when (select count(*) from sac.fullscan_jobs where status='queued')>=coalesce(cfg.queue_hard_limit,100) then 'hard_limited' when (select count(*) from sac.fullscan_jobs where status='queued')>=coalesce(cfg.queue_soft_limit,25) then 'throttled' else 'open' end,
    'message',case when v_ahead=0 and v_processing=0 then 'Próximo scan a ser despachado.' when j.mode='full_paid' then 'Fila prioritária de análises pagas com justiça entre solicitantes.' else 'Aguardando capacidade do worker em fila justa entre solicitantes.' end
  );
end;
$function$;

create or replace function public.gcl_scan_queue_health()
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare cfg sac.runtime_capacity%rowtype;q int;p int;qp int;qn int;pp int;pn int;qb int;pb int;doneb int;avg_sec numeric;p95_sec numeric;done24 int;available int;nonpaid_slots int;pol sac.benchmark_deepening_policy%rowtype;
begin
 select * into cfg from sac.runtime_capacity where subsystem='fullscan';select * into pol from sac.benchmark_deepening_policy where id=1;
 select count(*) filter(where status='queued')::int,count(*) filter(where status='processing')::int,count(*) filter(where status='queued' and mode='full_paid')::int,count(*) filter(where status='queued' and mode<>'full_paid')::int,count(*) filter(where status='processing' and mode='full_paid')::int,count(*) filter(where status='processing' and mode<>'full_paid')::int,count(*) filter(where status='queued' and mode='benchmark_deepening')::int,count(*) filter(where status='processing' and mode='benchmark_deepening')::int into q,p,qp,qn,pp,pn,qb,pb from sac.fullscan_jobs;
 select round(avg(extract(epoch from(completed_at-started_at)))::numeric,1),round(percentile_cont(.95) within group(order by extract(epoch from(completed_at-started_at)))::numeric,1),count(*)::int into avg_sec,p95_sec,done24 from sac.fullscan_jobs where status='completed' and started_at is not null and completed_at is not null and completed_at>now()-interval '24 hours';
 select count(*)::int into doneb from sac.fullscan_jobs where mode='benchmark_deepening' and status='completed' and completed_at>=date_trunc('day',now());
 available:=greatest(0,coalesce(cfg.global_slots,5)-p);nonpaid_slots:=greatest(1,coalesce(cfg.global_slots,5)-coalesce(cfg.reserved_paid_slots,2));
 return jsonb_build_object('queued',q,'processing',p,'queued_paid',qp,'queued_nonpaid',qn,'processing_paid',pp,'processing_nonpaid',pn,'queued_benchmark',qb,'processing_benchmark',pb,'benchmark_completed_today',doneb,'available_slots',available,'avg_processing_seconds_24h',avg_sec,'p95_processing_seconds_24h',p95_sec,'completed_24h',done24,'estimated_wait_seconds',case when coalesce(avg_sec,0)>0 then ceil(q::numeric/greatest(1,coalesce(cfg.global_slots,5)))*avg_sec else null end,'estimated_paid_wait_seconds',case when coalesce(avg_sec,0)>0 then ceil(qp::numeric/greatest(1,coalesce(cfg.global_slots,5)))*avg_sec else null end,'estimated_nonpaid_wait_seconds',case when coalesce(avg_sec,0)>0 then ceil(qn::numeric/nonpaid_slots)*avg_sec else null end,'admission_state',case when q>=coalesce(cfg.queue_hard_limit,100) then 'hard_limited' when q>=coalesce(cfg.queue_soft_limit,25) then 'throttled' else 'open' end,'policy',jsonb_build_object('global_slots',coalesce(cfg.global_slots,5),'reserved_paid_slots',coalesce(cfg.reserved_paid_slots,2),'dispatch_batch',coalesce(cfg.dispatch_batch,5),'queue_soft_limit',coalesce(cfg.queue_soft_limit,25),'queue_hard_limit',coalesce(cfg.queue_hard_limit,100),'paid_priority',true,'queue_first',true,'idempotent_per_audit',true,'user_requests_are_async',true,'scheduler','priority_fair_round_robin_v1','fairness_scope','owner_then_domain','fair_rounds',true,'benchmark_background_enabled',coalesce(pol.enabled,false),'benchmark_max_concurrent',coalesce(pol.max_concurrent,0),'benchmark_daily_budget',coalesce(pol.daily_budget,0),'benchmark_requires_customer_queue_empty',coalesce(pol.require_customer_queue_empty,true)));
end;$function$;

comment on function sac.fullscan_dispatch_plan_v1() is 'Internal GCL v64 queue planner: paid/priority classes first, then fair rounds per authenticated owner or anonymous domain. Does not expose fairness keys.';
