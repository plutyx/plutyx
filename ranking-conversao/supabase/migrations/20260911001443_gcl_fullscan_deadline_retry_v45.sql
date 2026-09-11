-- Complement the worker-wide deadline with bounded queue recovery.
create or replace function sac.collect_fullscan_jobs()
returns table(completed integer, failed integer)
language plpgsql security definer
set search_path to 'public','sac','net'
as $$
declare
  j record;
  r record;
  v_json jsonb;
  v_completed int:=0;
  v_failed int:=0;
begin
  if not pg_try_advisory_xact_lock(hashtext('gcl_fullscan_collect_v45')) then
    return query select 0,0;
    return;
  end if;
  for j in
    select id,request_id,attempts,mode,updated_at
    from sac.fullscan_jobs where status='processing'
    for update skip locked
  loop
    select * into r from net._http_response where id=j.request_id order by created desc limit 1;
    if not found then
      -- Includes transport disappearance after a worker restart and the 210s
      -- background transport; never leave a second stale attempt processing forever.
      if j.updated_at < now()-interval '4 minutes' then
        if j.attempts < 2 then
          update sac.fullscan_jobs set status='queued',request_id=null,error='retry_stale_request',
            updated_at=now(),completed_at=null where id=j.id;
        else
          update sac.fullscan_jobs set status='failed',error='request_stale_after_retry',
            updated_at=now(),completed_at=now() where id=j.id;
          v_failed:=v_failed+1;
        end if;
      end if;
      continue;
    end if;
    if r.status_code between 200 and 299 and r.error_msg is null and not coalesce(r.timed_out,false) then
      begin v_json:=r.content::jsonb;
      exception when others then v_json:=jsonb_build_object('raw',r.content);
      end;
      update sac.fullscan_jobs set status='completed',response=v_json,completed_at=now(),updated_at=now(),error=null where id=j.id;
      v_completed:=v_completed+1;
    elsif (coalesce(r.timed_out,false) or r.status_code in (429,502,503,504)) and j.attempts < 2 then
      update sac.fullscan_jobs set status='queued',request_id=null,
        error=case when coalesce(r.timed_out,false) then 'retry_after_timeout' else 'retry_after_http_'||r.status_code end,
        updated_at=now(),completed_at=null where id=j.id;
    else
      update sac.fullscan_jobs set status='failed',error=coalesce(r.error_msg,'HTTP '||coalesce(r.status_code::text,'unknown')),
        response=jsonb_build_object('raw',r.content),completed_at=now(),updated_at=now() where id=j.id;
      v_failed:=v_failed+1;
    end if;
  end loop;
  return query select v_completed,v_failed;
end;
$$;
revoke all on function sac.collect_fullscan_jobs() from public,anon,authenticated;
grant execute on function sac.collect_fullscan_jobs() to service_role;

-- Preserve the active dispatch implementation and its paid-job capacity policy.
do $$
declare v_definition text; v_guard text:=$guard$where status='queued'
      and (error is null or error not like 'retry_%' or updated_at < now()-interval '30 seconds')$guard$;
begin
  v_definition:=pg_get_functiondef('sac.dispatch_fullscan_jobs(integer)'::regprocedure);
  if position(v_guard in v_definition)=0 then
    if position($needle$where status='queued'$needle$ in v_definition)=0 then
      raise exception 'dispatch_queue_predicate_changed';
    end if;
    execute replace(v_definition,$needle$where status='queued'$needle$,v_guard);
  end if;
end;
$$;
