-- GCL v84: keep prior AI results immutable while moving the proven faster
-- free Nemotron Lightning refiner to the primary route for new analyses.
create or replace function sac.gcl_ai_enqueue_canary(p_audit_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare v_hash text; v_id uuid;
begin
  v_hash:=sac.gcl_ai_evidence_hash(p_audit_run_id);
  insert into sac.ai_enrichment_jobs(audit_run_id,purpose,evidence_hash,prompt_version,model_requested,status,updated_at)
  values(p_audit_run_id,'canary',v_hash,'GCL-AI-2.2','nex-agi/nex-n2.5-mini:free','queued',now())
  on conflict(audit_run_id,evidence_hash,prompt_version)
  do update set
    model_requested=excluded.model_requested,
    status=case when sac.ai_enrichment_jobs.status='completed' then 'completed' else 'queued' end,
    error=null,
    completed_at=case when sac.ai_enrichment_jobs.status='completed' then sac.ai_enrichment_jobs.completed_at else null end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function sac.gcl_ai_enqueue_completed_checkouts(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare r record; v_hash text; v_n int:=0; v_rows int;
begin
  for r in
    select distinct on (i.scan_public_token) f.audit_run_id
    from sac.analysis_checkout_intents i
    join sac.fullscan_jobs f on f.public_token=i.scan_public_token
    where i.status='completed'
      and i.paid_at is not null
      and i.scan_public_token is not null
      and f.status='completed'
      and f.materialized_at is not null
      and f.audit_run_id is not null
    order by i.scan_public_token,f.completed_at desc
    limit greatest(1,least(coalesce(p_limit,5),10))
  loop
    v_hash:=sac.gcl_ai_evidence_hash(r.audit_run_id);
    insert into sac.ai_enrichment_jobs(audit_run_id,purpose,evidence_hash,prompt_version,model_requested,status,updated_at)
    values(r.audit_run_id,'paid_analysis',v_hash,'GCL-AI-2.2','nex-agi/nex-n2.5-mini:free','queued',now())
    on conflict(audit_run_id,evidence_hash,prompt_version) do nothing;
    get diagnostics v_rows=row_count;
    v_n:=v_n+v_rows;
  end loop;
  return v_n;
end;
$function$;

revoke all on function sac.gcl_ai_enqueue_canary(uuid) from public,anon,authenticated;
revoke all on function sac.gcl_ai_enqueue_completed_checkouts(integer) from public,anon,authenticated;
grant execute on function sac.gcl_ai_enqueue_canary(uuid) to service_role,postgres;
grant execute on function sac.gcl_ai_enqueue_completed_checkouts(integer) to service_role,postgres;
