create table if not exists sac.ai_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid not null references sac.audit_runs(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  purpose text not null default 'paid_analysis' check (purpose in ('paid_analysis','canary')),
  evidence_hash text not null,
  prompt_version text not null default 'GCL-AI-1.0',
  model_requested text not null default 'nvidia/nemotron-3-ultra-550b-a55b:free',
  model_used text,
  provider text,
  attempts integer not null default 0,
  error text,
  usage jsonb,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(audit_run_id,evidence_hash,prompt_version)
);
create index if not exists ai_enrichment_jobs_queue_idx on sac.ai_enrichment_jobs(status,created_at) where status in ('queued','processing');

create table if not exists sac.ai_enrichments (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid not null references sac.audit_runs(id) on delete cascade,
  evidence_hash text not null,
  prompt_version text not null,
  model text not null,
  provider text,
  payload jsonb not null,
  usage jsonb,
  diagnostic_only boolean not null default true check (diagnostic_only),
  public_evidence_only boolean not null default true check (public_evidence_only),
  generated_at timestamptz not null default now(),
  unique(audit_run_id,evidence_hash,prompt_version)
);
create index if not exists ai_enrichments_audit_idx on sac.ai_enrichments(audit_run_id,generated_at desc);
revoke all on sac.ai_enrichment_jobs from public,anon,authenticated;
revoke all on sac.ai_enrichments from public,anon,authenticated;
grant select,insert,update on sac.ai_enrichment_jobs to service_role;
grant select,insert,update on sac.ai_enrichments to service_role;

create or replace function sac.gcl_ai_runtime_config()
returns jsonb language plpgsql security definer set search_path='sac','public','vault' as $$
declare v_key text; v_token text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='gcl_openrouter_api_key' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='gcl_ai_worker_token' limit 1;
  if coalesce(v_key,'')='' or coalesce(v_token,'')='' then raise exception 'gcl_ai_runtime_secret_missing'; end if;
  return jsonb_build_object('openrouter_api_key',v_key,'worker_token',v_token,'primary_model','nvidia/nemotron-3-ultra-550b-a55b:free','fallback_model','openrouter/free');
end;$$;
revoke all on function sac.gcl_ai_runtime_config() from public,anon,authenticated;
grant execute on function sac.gcl_ai_runtime_config() to service_role,postgres;

create or replace function sac.gcl_ai_public_evidence_payload(p_audit_run_id uuid)
returns jsonb language plpgsql security definer set search_path='sac','public' as $$
declare v jsonb;
begin
  if not exists(select 1 from sac.audit_runs where id=p_audit_run_id and status='completed') then raise exception 'completed_audit_required'; end if;
  select jsonb_build_object(
    'contract_version','GCL-AI-EVIDENCE-1.0','privacy_scope','public_web_evidence_only','diagnostic_only',true,'score_effect','none',
    'audit',jsonb_build_object('audit_run_id',ar.id,'audit_type',ar.audit_type,'methodology_version',ar.methodology_version,'completed_at',ar.completed_at,'pages_analyzed',ar.pages_analyzed,'domain',d.normalized_domain,'url',d.url,'company_name',d.company_name,'category',d.category,'country',d.country,'detected_archetype',d.detected_archetype),
    'pages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'evidence_ref','page:'||p.id::text,'page_id',p.id,'url',p.normalized_url,'page_type',p.page_type,'title',p.title,'meta_description',p.meta_description,'h1',p.h1,'word_count',p.word_count,'indexable',p.indexable,'internal_links',p.internal_links,'external_links',p.external_links,'images_count',p.images_count,'forms_count',p.forms_count,
        'semantic_facts',(select s.payload->'facts' from sac.source_snapshots s where s.source='semantic_embedding' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text order by s.fetched_at desc limit 1),
        'semantic_margins',(select s.payload->'margins' from sac.source_snapshots s where s.source='semantic_embedding' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text order by s.fetched_at desc limit 1),
        'pagespeed',(select coalesce(jsonb_agg(jsonb_build_object('evidence_ref','pagespeed:'||p.id::text||':'||coalesce(s.payload->>'strategy','unknown'),'strategy',s.payload->>'strategy','categories',s.payload->'categories','field_metrics',s.payload->'field_data'->'metrics','field_category',s.payload->'field_data'->>'overall_category','origin_field_metrics',s.payload->'origin_field_data'->'metrics','runtime_error',s.payload->'runtime_error','analysis_timestamp',s.payload->'analysis_timestamp') order by s.payload->>'strategy'),'[]'::jsonb) from sac.source_snapshots s where s.source='google_pagespeed' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text),
        'browser',(select jsonb_build_object('evidence_ref','browser:'||p.id::text,'mobile',jsonb_build_object('hero',s.payload->'rendered'->'mobile'->'hero','cta',s.payload->'rendered'->'mobile'->'cta','trust',s.payload->'rendered'->'mobile'->'trust','forms_detail',s.payload->'rendered'->'mobile'->'forms_detail','horizontal_overflow_px',s.payload->'rendered'->'mobile'->'horizontal_overflow_px','target_under_44',s.payload->'rendered'->'mobile'->'target_under_44','max_fixed_overlay_pct',s.payload->'rendered'->'mobile'->'max_fixed_overlay_pct'),'desktop',jsonb_build_object('hero',s.payload->'rendered'->'desktop'->'hero','cta',s.payload->'rendered'->'desktop'->'cta','trust',s.payload->'rendered'->'desktop'->'trust','forms_detail',s.payload->'rendered'->'desktop'->'forms_detail','horizontal_overflow_px',s.payload->'rendered'->'desktop'->'horizontal_overflow_px','max_fixed_overlay_pct',s.payload->'rendered'->'desktop'->'max_fixed_overlay_pct'),'axe',jsonb_build_object('available',s.payload->'rendered'->'axe'->'available','violations_count',s.payload->'rendered'->'axe'->'violations_count'),'javascript_executed',s.payload->'rendered'->'javascript_executed') from sac.source_snapshots s where s.source='snapshot_browser' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text order by s.fetched_at desc limit 1)
      ) order by case p.page_type when 'home' then 1 when 'landing' then 2 when 'service' then 3 when 'product' then 4 when 'pricing' then 5 else 9 end,p.created_at)
      from (select * from sac.pages where audit_run_id=p_audit_run_id order by case page_type when 'home' then 1 when 'landing' then 2 when 'service' then 3 when 'product' then 4 when 'pricing' then 5 else 9 end,created_at limit 8) p
    ),'[]'::jsonb),
    'domain_public_probe',(select jsonb_build_object('evidence_ref','domain:'||p_audit_run_id::text,'http',s.payload->'http','https',s.payload->'https','robots',s.payload->'robots','sitemap',s.payload->'sitemap','security_txt',s.payload->'security_txt','normalization',s.payload->'normalization','root_semantics',s.payload->'root_semantics','ai_access',s.payload->'ai_access','llms_txt',s.payload->'llms_txt') from sac.source_snapshots s where s.source='domain_crawl_probe' and s.payload->>'audit_run_id'=p_audit_run_id::text order by s.fetched_at desc limit 1),
    'disclosure','Only public website/crawl/browser/PageSpeed/semantic evidence is eligible for this AI packet. User, purchase, membership, connected analytics/CRM and private first-party data are excluded. The AI interpretation never changes GCL Score or ranking.'
  ) into v from sac.audit_runs ar join sac.domains d on d.id=ar.domain_id where ar.id=p_audit_run_id;
  return v;
end;$$;
revoke all on function sac.gcl_ai_public_evidence_payload(uuid) from public,anon,authenticated;
grant execute on function sac.gcl_ai_public_evidence_payload(uuid) to service_role,postgres;

create or replace function sac.gcl_ai_evidence_hash(p_audit_run_id uuid)
returns text language sql security definer set search_path='sac','public','extensions' as $$
  select encode(extensions.digest(sac.gcl_ai_public_evidence_payload(p_audit_run_id)::text,'sha256'),'hex');
$$;
revoke all on function sac.gcl_ai_evidence_hash(uuid) from public,anon,authenticated;
grant execute on function sac.gcl_ai_evidence_hash(uuid) to service_role,postgres;

create or replace function sac.gcl_ai_enqueue_canary(p_audit_run_id uuid)
returns uuid language plpgsql security definer set search_path='sac','public' as $$
declare v_hash text; v_id uuid;
begin
  v_hash:=sac.gcl_ai_evidence_hash(p_audit_run_id);
  insert into sac.ai_enrichment_jobs(audit_run_id,purpose,evidence_hash,prompt_version,model_requested,status,updated_at)
  values(p_audit_run_id,'canary',v_hash,'GCL-AI-1.0','nvidia/nemotron-3-ultra-550b-a55b:free','queued',now())
  on conflict(audit_run_id,evidence_hash,prompt_version) do update set updated_at=now()
  returning id into v_id; return v_id;
end;$$;
revoke all on function sac.gcl_ai_enqueue_canary(uuid) from public,anon,authenticated;
grant execute on function sac.gcl_ai_enqueue_canary(uuid) to service_role,postgres;

create or replace function sac.gcl_ai_enqueue_completed_checkouts(p_limit integer default 5)
returns integer language plpgsql security definer set search_path='sac','public' as $$
declare r record; v_hash text; v_n int:=0; v_rows int;
begin
  for r in select distinct on (i.scan_public_token) f.audit_run_id from sac.analysis_checkout_intents i join sac.fullscan_jobs f on f.public_token=i.scan_public_token where i.status='completed' and i.paid_at is not null and i.scan_public_token is not null and f.status='completed' and f.materialized_at is not null and f.audit_run_id is not null order by i.scan_public_token,f.completed_at desc limit greatest(1,least(coalesce(p_limit,5),10)) loop
    v_hash:=sac.gcl_ai_evidence_hash(r.audit_run_id);
    insert into sac.ai_enrichment_jobs(audit_run_id,purpose,evidence_hash,prompt_version,model_requested,status,updated_at) values(r.audit_run_id,'paid_analysis',v_hash,'GCL-AI-1.0','nvidia/nemotron-3-ultra-550b-a55b:free','queued',now()) on conflict(audit_run_id,evidence_hash,prompt_version) do nothing;
    get diagnostics v_rows=row_count; v_n:=v_n+v_rows;
  end loop; return v_n;
end;$$;
revoke all on function sac.gcl_ai_enqueue_completed_checkouts(integer) from public,anon,authenticated;
grant execute on function sac.gcl_ai_enqueue_completed_checkouts(integer) to service_role,postgres;

create or replace function sac.gcl_ai_claim_job()
returns table(id uuid,audit_run_id uuid,evidence_hash text,prompt_version text,model_requested text,purpose text)
language plpgsql security definer set search_path='sac','public' as $$
begin
  update sac.ai_enrichment_jobs set status='queued',error='stale_processing_requeued',updated_at=now() where status='processing' and started_at<now()-interval '8 minutes' and attempts<3;
  update sac.ai_enrichment_jobs set status='failed',error=coalesce(error,'retry_budget_exhausted'),completed_at=coalesce(completed_at,now()),updated_at=now() where status in ('queued','processing') and attempts>=3;
  return query with pick as (
    select j.id from sac.ai_enrichment_jobs j where j.status='queued' and (j.purpose='canary' or (select count(*) from sac.ai_enrichment_jobs x where x.started_at>=date_trunc('day',now()) and x.purpose='paid_analysis')<20) order by case when j.purpose='canary' then 0 else 1 end,j.created_at for update skip locked limit 1
  ), upd as (
    update sac.ai_enrichment_jobs j set status='processing',attempts=j.attempts+1,started_at=now(),updated_at=now(),error=null from pick where j.id=pick.id returning j.id,j.audit_run_id,j.evidence_hash,j.prompt_version,j.model_requested,j.purpose
  ) select * from upd;
end;$$;
revoke all on function sac.gcl_ai_claim_job() from public,anon,authenticated;
grant execute on function sac.gcl_ai_claim_job() to service_role,postgres;

create or replace function sac.gcl_ai_finish_job(p_job_id uuid,p_model text,p_provider text,p_payload jsonb,p_usage jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='sac','public' as $$
declare j sac.ai_enrichment_jobs%rowtype; v_id uuid;
begin
  select * into j from sac.ai_enrichment_jobs where id=p_job_id for update;
  if j.id is null or j.status<>'processing' then raise exception 'ai_job_not_processing'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'ai_payload_must_be_object'; end if;
  if coalesce(p_payload->>'diagnostic_only','true')<>'true' or coalesce(p_payload->>'score_effect','none')<>'none' then raise exception 'ai_payload_score_contract_violation'; end if;
  insert into sac.ai_enrichments(audit_run_id,evidence_hash,prompt_version,model,provider,payload,usage,diagnostic_only,public_evidence_only,generated_at) values(j.audit_run_id,j.evidence_hash,j.prompt_version,coalesce(nullif(p_model,''),j.model_requested),p_provider,p_payload,coalesce(p_usage,'{}'::jsonb),true,true,now()) on conflict(audit_run_id,evidence_hash,prompt_version) do update set model=excluded.model,provider=excluded.provider,payload=excluded.payload,usage=excluded.usage,generated_at=now() returning id into v_id;
  update sac.ai_enrichment_jobs set status='completed',model_used=coalesce(nullif(p_model,''),model_requested),provider=p_provider,result=p_payload,usage=coalesce(p_usage,'{}'::jsonb),completed_at=now(),updated_at=now(),error=null where id=p_job_id;
  return v_id;
end;$$;
revoke all on function sac.gcl_ai_finish_job(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function sac.gcl_ai_finish_job(uuid,text,text,jsonb,jsonb) to service_role,postgres;

create or replace function sac.gcl_ai_fail_job(p_job_id uuid,p_error text,p_retryable boolean default true)
returns text language plpgsql security definer set search_path='sac','public' as $$
declare v_attempts int; v_status text;
begin
  select attempts into v_attempts from sac.ai_enrichment_jobs where id=p_job_id for update;
  if v_attempts is null then raise exception 'ai_job_not_found'; end if;
  v_status:=case when p_retryable and v_attempts<3 then 'queued' else 'failed' end;
  update sac.ai_enrichment_jobs set status=v_status,error=left(coalesce(p_error,'ai_worker_failed'),2000),completed_at=case when v_status='failed' then now() else null end,updated_at=now() where id=p_job_id; return v_status;
end;$$;
revoke all on function sac.gcl_ai_fail_job(uuid,text,boolean) from public,anon,authenticated;
grant execute on function sac.gcl_ai_fail_job(uuid,text,boolean) to service_role,postgres;

create or replace function sac.gcl_ai_enrichment_for_audit(p_audit_run_id uuid)
returns jsonb language sql security definer set search_path='sac','public' as $$
  select case when e.id is null then jsonb_build_object('available',false,'status',coalesce((select j.status from sac.ai_enrichment_jobs j where j.audit_run_id=p_audit_run_id order by j.created_at desc limit 1),'not_requested')) else jsonb_build_object('available',true,'status','completed','version',e.prompt_version,'model',e.model,'generated_at',e.generated_at,'diagnostic_only',true,'public_evidence_only',true,'score_effect','none','analysis',e.payload,'disclosure','Interpretação de IA sobre evidências públicas observadas pelo GCL. Não altera o GCL Score, ranking ou elegibilidade e não substitui validação humana.') end from (select 1) q left join lateral (select * from sac.ai_enrichments x where x.audit_run_id=p_audit_run_id order by x.generated_at desc limit 1) e on true;
$$;
revoke all on function sac.gcl_ai_enrichment_for_audit(uuid) from public,anon,authenticated;
grant execute on function sac.gcl_ai_enrichment_for_audit(uuid) to service_role,postgres;