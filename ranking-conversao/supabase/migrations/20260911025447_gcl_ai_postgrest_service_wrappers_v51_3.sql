create or replace function public.gcl_ai_runtime_config()
returns jsonb language sql security definer set search_path='sac','public' as $$ select sac.gcl_ai_runtime_config(); $$;
revoke all on function public.gcl_ai_runtime_config() from public,anon,authenticated;
grant execute on function public.gcl_ai_runtime_config() to service_role,postgres;

create or replace function public.gcl_ai_claim_job()
returns table(id uuid,audit_run_id uuid,evidence_hash text,prompt_version text,model_requested text,purpose text)
language sql security definer set search_path='sac','public' as $$ select * from sac.gcl_ai_claim_job(); $$;
revoke all on function public.gcl_ai_claim_job() from public,anon,authenticated;
grant execute on function public.gcl_ai_claim_job() to service_role,postgres;

create or replace function public.gcl_ai_public_evidence_payload(p_audit_run_id uuid)
returns jsonb language sql security definer set search_path='sac','public' as $$ select sac.gcl_ai_public_evidence_payload(p_audit_run_id); $$;
revoke all on function public.gcl_ai_public_evidence_payload(uuid) from public,anon,authenticated;
grant execute on function public.gcl_ai_public_evidence_payload(uuid) to service_role,postgres;

create or replace function public.gcl_ai_external_evidence_payload(p_audit_run_id uuid)
returns jsonb language sql security definer set search_path='sac','public' as $$ select sac.gcl_ai_external_evidence_payload(p_audit_run_id); $$;
revoke all on function public.gcl_ai_external_evidence_payload(uuid) from public,anon,authenticated;
grant execute on function public.gcl_ai_external_evidence_payload(uuid) to service_role,postgres;

create or replace function public.gcl_ai_store_external_snapshot(p_audit_run_id uuid,p_source text,p_source_key text,p_normalized_url text,p_payload jsonb,p_ttl_hours integer default 24)
returns uuid language sql security definer set search_path='sac','public' as $$ select sac.gcl_ai_store_external_snapshot(p_audit_run_id,p_source,p_source_key,p_normalized_url,p_payload,p_ttl_hours); $$;
revoke all on function public.gcl_ai_store_external_snapshot(uuid,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.gcl_ai_store_external_snapshot(uuid,text,text,text,jsonb,integer) to service_role,postgres;

create or replace function public.gcl_ai_finish_job(p_job_id uuid,p_model text,p_provider text,p_payload jsonb,p_usage jsonb default '{}'::jsonb)
returns uuid language sql security definer set search_path='sac','public' as $$ select sac.gcl_ai_finish_job(p_job_id,p_model,p_provider,p_payload,p_usage); $$;
revoke all on function public.gcl_ai_finish_job(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gcl_ai_finish_job(uuid,text,text,jsonb,jsonb) to service_role,postgres;

create or replace function public.gcl_ai_fail_job(p_job_id uuid,p_error text,p_retryable boolean default true)
returns text language sql security definer set search_path='sac','public' as $$ select sac.gcl_ai_fail_job(p_job_id,p_error,p_retryable); $$;
revoke all on function public.gcl_ai_fail_job(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.gcl_ai_fail_job(uuid,text,boolean) to service_role,postgres;