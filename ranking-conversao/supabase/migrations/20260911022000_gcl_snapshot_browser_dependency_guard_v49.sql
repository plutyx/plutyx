-- GCL v49 — browser snapshot dependency admission must be exact and fail-closed.
-- Production incident: fullscan materialization could roll back with
-- current_snapshot_missing because browser jobs were admitted from a URL-only
-- snapshot match before current probe had created the exact audit/page snapshot.

create or replace function sac.enqueue_snapshot_browser_jobs(p_audit_id uuid, p_limit integer default 8)
returns integer
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare
  r record;
  v_n int:=0;
  v_row int:=0;
  v_token uuid;
begin
  for r in
    select p.id,p.normalized_url
    from sac.pages p
    where p.audit_run_id=p_audit_id
      and exists(
        select 1
        from sac.source_snapshots s
        where s.source='current_supabase_edge'
          and s.normalized_url=p.normalized_url
          and s.payload->>'audit_run_id'=p_audit_id::text
          and s.payload->>'page_id'=p.id::text
          and coalesce(s.payload->>'html','')<>''
      )
    order by case p.page_type when 'home' then 1 when 'service' then 2 when 'tool' then 3 when 'article' then 4 else 5 end,p.created_at
    limit greatest(1,least(coalesce(p_limit,8),12))
  loop
    v_token:=sac.issue_snapshot_replay_token(p_audit_id,r.id,45);
    insert into sac.snapshot_browser_jobs(audit_run_id,page_id,url,snapshot_token,status,updated_at)
    values(p_audit_id,r.id,r.normalized_url,v_token,'queued',now())
    on conflict(audit_run_id,page_id) do nothing;
    get diagnostics v_row=row_count;
    v_n:=v_n+v_row;
  end loop;
  return v_n;
end;
$function$;

revoke all on function sac.enqueue_snapshot_browser_jobs(uuid,integer) from public, anon, authenticated;
grant execute on function sac.enqueue_snapshot_browser_jobs(uuid,integer) to service_role;

create or replace function sac.materialize_pending_fullscans(p_limit integer default 10)
returns table(materialized integer, errors integer)
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare j record; v_ok int:=0; v_err int:=0; v_audit_id uuid;begin
  for j in
    select id,audit_run_id from sac.fullscan_jobs
    where status='completed' and response is not null and materialized_at is null
    order by completed_at nulls last,created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,10),50))
  loop
    begin
      v_audit_id:=sac.materialize_fullscan_job(j.id);
      perform sac.materialize_lighthouse_findings(j.id);
      perform sac.materialize_lighthouse_metrics(j.id);
      perform sac.materialize_site_sample_pages(j.id);
      if v_audit_id is not null then
        perform sac.materialize_crawl_graph_metrics(v_audit_id);
        perform sac.evaluate_atomic_lighthouse_metrics(v_audit_id);
        perform sac.enqueue_current_probe_jobs(v_audit_id,8);
        perform sac.enqueue_pagespeed_probe_jobs(v_audit_id);
        perform sac.enqueue_domain_probe(v_audit_id);
        perform sac.enqueue_origin_timing_jobs(v_audit_id,8);
        perform sac.enqueue_snapshot_browser_jobs(v_audit_id,8);
      end if;
      update sac.fullscan_jobs set materialized_at=now(),error=null,updated_at=now() where id=j.id;
      v_ok:=v_ok+1;
    exception when others then
      update sac.fullscan_jobs set error='materialize: '||sqlerrm,updated_at=now() where id=j.id;
      v_err:=v_err+1;
    end;
  end loop;
  return query select v_ok,v_err;
end;
$function$;

revoke all on function sac.materialize_pending_fullscans(integer) from public, anon, authenticated;
grant execute on function sac.materialize_pending_fullscans(integer) to service_role;
