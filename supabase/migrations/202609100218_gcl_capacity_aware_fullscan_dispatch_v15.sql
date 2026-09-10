create table if not exists sac.runtime_capacity (
  subsystem text primary key,
  global_slots int not null check(global_slots between 1 and 50),
  reserved_paid_slots int not null check(reserved_paid_slots between 0 and global_slots),
  dispatch_batch int not null check(dispatch_batch between 1 and 20),
  queue_soft_limit int not null check(queue_soft_limit>=1),
  queue_hard_limit int not null check(queue_hard_limit>=queue_soft_limit),
  updated_at timestamptz not null default now()
);
insert into sac.runtime_capacity(subsystem,global_slots,reserved_paid_slots,dispatch_batch,queue_soft_limit,queue_hard_limit)
values('fullscan',5,2,5,25,100) on conflict(subsystem) do nothing;
revoke all on sac.runtime_capacity from anon,authenticated;

create or replace function sac.dispatch_fullscan_jobs(p_limit integer default 5)
returns integer language plpgsql security definer set search_path to 'sac','public','net','vault' as $function$
declare j record;cfg sac.runtime_capacity%rowtype;v_preview_url text;v_lighthouse_url text;v_token text;v_target_url text;v_request bigint;v_timeout integer;v_max_pages integer;v_count int:=0;v_processing int:=0;v_processing_nonpaid int:=0;v_available int:=0;v_nonpaid_cap int:=0;v_batch int:=0;
begin
 if not pg_try_advisory_xact_lock(hashtext('gcl_fullscan_dispatch_v15')) then return 0; end if;
 select * into cfg from sac.runtime_capacity where subsystem='fullscan';if cfg.subsystem is null then raise exception 'fullscan_capacity_config_missing';end if;
 select count(*)::int,count(*) filter(where mode<>'full_paid')::int into v_processing,v_processing_nonpaid from sac.fullscan_jobs where status='processing';
 v_available:=greatest(0,cfg.global_slots-v_processing);v_nonpaid_cap:=greatest(0,cfg.global_slots-cfg.reserved_paid_slots);v_batch:=least(greatest(1,least(coalesce(p_limit,cfg.dispatch_batch),cfg.dispatch_batch)),v_available);if v_batch<=0 then return 0;end if;
 select decrypted_secret into v_preview_url from vault.decrypted_secrets where name='sac_render_worker_url' limit 1;select decrypted_secret into v_lighthouse_url from vault.decrypted_secrets where name='sac_render_lighthouse_worker_url' limit 1;select decrypted_secret into v_token from vault.decrypted_secrets where name='sac_render_worker_token' limit 1;if v_preview_url is null or v_token is null then raise exception 'SAC preview worker runtime secret missing';end if;
 for j in select id,url,mode from sac.fullscan_jobs where status='queued' order by case when mode='full_paid' then 0 when mode='lighthouse_full' then 1 else 2 end,created_at for update skip locked limit 25 loop
  exit when v_count>=v_batch;if j.mode<>'full_paid' and v_processing_nonpaid>=v_nonpaid_cap then continue;end if;
  if j.mode in('lighthouse_full','full_paid') then if v_lighthouse_url is null then update sac.fullscan_jobs set status='failed',error='Lighthouse worker URL missing',updated_at=now(),completed_at=now() where id=j.id;continue;end if;v_target_url:=v_lighthouse_url;v_timeout:=120000;v_max_pages:=10;else v_target_url:=v_preview_url;v_timeout:=45000;v_max_pages:=3;end if;
  update sac.fullscan_jobs set status='processing',attempts=attempts+1,started_at=coalesce(started_at,now()),updated_at=now(),error=null where id=j.id;
  v_request:=net.http_post(url:=rtrim(v_target_url,'/')||'/audit',headers:=jsonb_build_object('Content-Type','application/json','x-sac-worker-token',v_token),body:=jsonb_build_object('url',j.url,'max_pages',v_max_pages,'render_js',true,'include_screenshot',false),timeout_milliseconds:=v_timeout);
  update sac.fullscan_jobs set request_id=v_request,updated_at=now() where id=j.id;v_count:=v_count+1;v_processing:=v_processing+1;if j.mode<>'full_paid' then v_processing_nonpaid:=v_processing_nonpaid+1;end if;
 end loop;return v_count;
end;$function$;

create or replace function public.gcl_scan_queue_health()
returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare cfg sac.runtime_capacity%rowtype;q int;p int;qp int;qn int;pp int;pn int;avg_sec numeric;p95_sec numeric;done24 int;available int;nonpaid_slots int;
begin
 select * into cfg from sac.runtime_capacity where subsystem='fullscan';
 select count(*) filter(where status='queued')::int,count(*) filter(where status='processing')::int,count(*) filter(where status='queued' and mode='full_paid')::int,count(*) filter(where status='queued' and mode<>'full_paid')::int,count(*) filter(where status='processing' and mode='full_paid')::int,count(*) filter(where status='processing' and mode<>'full_paid')::int into q,p,qp,qn,pp,pn from sac.fullscan_jobs;
 select round(avg(extract(epoch from(completed_at-started_at)))::numeric,1),round(percentile_cont(.95) within group(order by extract(epoch from(completed_at-started_at)))::numeric,1),count(*)::int into avg_sec,p95_sec,done24 from sac.fullscan_jobs where status='completed' and started_at is not null and completed_at is not null and completed_at>now()-interval '24 hours';
 available:=greatest(0,coalesce(cfg.global_slots,5)-p);nonpaid_slots:=greatest(1,coalesce(cfg.global_slots,5)-coalesce(cfg.reserved_paid_slots,2));
 return jsonb_build_object('queued',q,'processing',p,'queued_paid',qp,'queued_nonpaid',qn,'processing_paid',pp,'processing_nonpaid',pn,'available_slots',available,'avg_processing_seconds_24h',avg_sec,'p95_processing_seconds_24h',p95_sec,'completed_24h',done24,'estimated_wait_seconds',case when coalesce(avg_sec,0)>0 then ceil(q::numeric/greatest(1,coalesce(cfg.global_slots,5)))*avg_sec else null end,'estimated_paid_wait_seconds',case when coalesce(avg_sec,0)>0 then ceil(qp::numeric/greatest(1,coalesce(cfg.global_slots,5)))*avg_sec else null end,'estimated_nonpaid_wait_seconds',case when coalesce(avg_sec,0)>0 then ceil(qn::numeric/nonpaid_slots)*avg_sec else null end,'admission_state',case when q>=coalesce(cfg.queue_hard_limit,100) then 'hard_limited' when q>=coalesce(cfg.queue_soft_limit,25) then 'throttled' else 'open' end,'policy',jsonb_build_object('global_slots',coalesce(cfg.global_slots,5),'reserved_paid_slots',coalesce(cfg.reserved_paid_slots,2),'dispatch_batch',coalesce(cfg.dispatch_batch,5),'queue_soft_limit',coalesce(cfg.queue_soft_limit,25),'queue_hard_limit',coalesce(cfg.queue_hard_limit,100),'paid_priority',true,'queue_first',true,'idempotent_per_audit',true,'user_requests_are_async',true));
end;$function$;
