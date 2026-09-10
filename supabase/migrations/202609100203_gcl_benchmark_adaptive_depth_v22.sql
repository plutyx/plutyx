create or replace function sac.dispatch_fullscan_jobs(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path=sac,public,net,vault
as $$
declare j record;cfg sac.runtime_capacity%rowtype;v_preview_url text;v_lighthouse_url text;v_token text;v_target_url text;v_request bigint;v_timeout integer;v_max_pages integer;v_count int:=0;v_processing int:=0;v_processing_nonpaid int:=0;v_available int:=0;v_nonpaid_cap int:=0;v_batch int:=0;
begin
 if not pg_try_advisory_xact_lock(hashtext('gcl_fullscan_dispatch_v22')) then return 0; end if;
 select * into cfg from sac.runtime_capacity where subsystem='fullscan'; if cfg.subsystem is null then raise exception 'fullscan_capacity_config_missing'; end if;
 select count(*)::int,count(*) filter(where mode<>'full_paid')::int into v_processing,v_processing_nonpaid from sac.fullscan_jobs where status='processing';
 v_available:=greatest(0,cfg.global_slots-v_processing);v_nonpaid_cap:=greatest(0,cfg.global_slots-cfg.reserved_paid_slots);v_batch:=least(greatest(1,least(coalesce(p_limit,cfg.dispatch_batch),cfg.dispatch_batch)),v_available);if v_batch<=0 then return 0; end if;
 select decrypted_secret into v_preview_url from vault.decrypted_secrets where name='sac_render_worker_url' limit 1;select decrypted_secret into v_lighthouse_url from vault.decrypted_secrets where name='sac_render_lighthouse_worker_url' limit 1;select decrypted_secret into v_token from vault.decrypted_secrets where name='sac_render_worker_token' limit 1;if v_preview_url is null or v_token is null then raise exception 'SAC preview worker runtime secret missing'; end if;
 for j in select id,url,mode,attempts from sac.fullscan_jobs where status='queued' order by case when mode='full_paid' then 0 when mode='lighthouse_full' then 1 when mode='benchmark_deepening' then 9 else 2 end,created_at for update skip locked limit 25 loop
   exit when v_count>=v_batch;if j.mode<>'full_paid' and v_processing_nonpaid>=v_nonpaid_cap then continue;end if;
   if j.mode in('lighthouse_full','full_paid','benchmark_deepening') then
     if v_lighthouse_url is null then update sac.fullscan_jobs set status='failed',error='Lighthouse worker URL missing',updated_at=now(),completed_at=now() where id=j.id;continue;end if;
     v_target_url:=v_lighthouse_url;
     if j.mode='benchmark_deepening' then
       if j.attempts>=1 then v_timeout:=90000;v_max_pages:=2; else v_timeout:=105000;v_max_pages:=5; end if;
     else v_timeout:=120000;v_max_pages:=10;end if;
   else v_target_url:=v_preview_url;v_timeout:=45000;v_max_pages:=3;end if;
   update sac.fullscan_jobs set status='processing',attempts=attempts+1,started_at=coalesce(started_at,now()),updated_at=now(),error=null,
     response=case when mode='benchmark_deepening' then coalesce(response,'{}'::jsonb)||jsonb_build_object('dispatch_profile',case when j.attempts>=1 then 'adaptive_retry_2_pages_90s' else 'background_5_pages_105s' end,'requested_max_pages',v_max_pages,'requested_timeout_ms',v_timeout) else response end
   where id=j.id;
   v_request:=net.http_post(url:=rtrim(v_target_url,'/')||'/audit',headers:=jsonb_build_object('Content-Type','application/json','x-sac-worker-token',v_token),body:=jsonb_build_object('url',j.url,'max_pages',v_max_pages,'render_js',true,'include_screenshot',false,'job_class',j.mode),timeout_milliseconds:=v_timeout);
   update sac.fullscan_jobs set request_id=v_request,updated_at=now() where id=j.id;v_count:=v_count+1;v_processing:=v_processing+1;if j.mode<>'full_paid' then v_processing_nonpaid:=v_processing_nonpaid+1;end if;
 end loop;return v_count;
end;
$$;
