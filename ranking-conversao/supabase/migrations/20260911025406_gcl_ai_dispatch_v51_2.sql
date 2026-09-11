create or replace function sac.gcl_ai_dispatch_one()
returns bigint language plpgsql security definer set search_path='sac','public','vault','net' as $$
declare v_token text; v_req bigint;
begin
  if not exists(select 1 from sac.ai_enrichment_jobs where status='queued') then return null; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name='gcl_ai_worker_token' limit 1;
  if coalesce(v_token,'')='' then raise exception 'gcl_ai_worker_token_missing'; end if;
  v_req:=net.http_post(
    url:='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/gcl-ai-enrichment-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-gcl-ai-worker-token',v_token),
    body:='{}'::jsonb,
    timeout_milliseconds:=115000
  );
  return v_req;
end;$$;
revoke all on function sac.gcl_ai_dispatch_one() from public,anon,authenticated;
grant execute on function sac.gcl_ai_dispatch_one() to service_role,postgres;