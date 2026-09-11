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
  values(p_audit_run_id,'canary',v_hash,'GCL-AI-1.1','nvidia/nemotron-3-ultra-550b-a55b:free','queued',now())
  on conflict(audit_run_id,evidence_hash,prompt_version) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end;$function$;

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
    where i.status='completed' and i.paid_at is not null and i.scan_public_token is not null
      and f.status='completed' and f.materialized_at is not null and f.audit_run_id is not null
    order by i.scan_public_token,f.completed_at desc
    limit greatest(1,least(coalesce(p_limit,5),10))
  loop
    v_hash:=sac.gcl_ai_evidence_hash(r.audit_run_id);
    insert into sac.ai_enrichment_jobs(audit_run_id,purpose,evidence_hash,prompt_version,model_requested,status,updated_at)
    values(r.audit_run_id,'paid_analysis',v_hash,'GCL-AI-1.1','nvidia/nemotron-3-ultra-550b-a55b:free','queued',now())
    on conflict(audit_run_id,evidence_hash,prompt_version) do nothing;
    get diagnostics v_rows=row_count;
    v_n:=v_n+v_rows;
  end loop;
  return v_n;
end;$function$;

create or replace function sac.gcl_ai_claim_job()
returns table(id uuid, audit_run_id uuid, evidence_hash text, prompt_version text, model_requested text, purpose text)
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
begin
  update sac.ai_enrichment_jobs
  set status='queued',error='stale_processing_requeued',updated_at=now()
  where status='processing' and started_at<now()-interval '4 minutes' and attempts<3;

  update sac.ai_enrichment_jobs
  set status='failed',error=coalesce(error,'retry_budget_exhausted'),completed_at=coalesce(completed_at,now()),updated_at=now()
  where status in ('queued','processing') and attempts>=3;

  return query with pick as (
    select j.id
    from sac.ai_enrichment_jobs j
    where j.status='queued'
      and (j.purpose='canary' or (select count(*) from sac.ai_enrichment_jobs x where x.started_at>=date_trunc('day',now()) and x.purpose='paid_analysis')<20)
    order by case when j.purpose='canary' then 0 else 1 end,j.created_at
    for update skip locked limit 1
  ), upd as (
    update sac.ai_enrichment_jobs j
    set status='processing',attempts=j.attempts+1,started_at=now(),updated_at=now(),error=null
    from pick where j.id=pick.id
    returning j.id,j.audit_run_id,j.evidence_hash,j.prompt_version,j.model_requested,j.purpose
  ) select * from upd;
end;$function$;

create or replace function sac.gcl_ai_dispatch_one()
returns bigint
language plpgsql
security definer
set search_path to 'sac','public','vault','net'
as $function$
declare v_token text; v_req bigint;
begin
  if not exists(select 1 from sac.ai_enrichment_jobs where status='queued') then return null; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='gcl_ai_worker_token' limit 1;
  if coalesce(v_token,'')='' then raise exception 'gcl_ai_worker_token_missing'; end if;
  v_req:=net.http_post(
    url:='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/gcl-ai-enrichment-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-gcl-ai-worker-token',v_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=15000
  );
  return v_req;
end;$function$;