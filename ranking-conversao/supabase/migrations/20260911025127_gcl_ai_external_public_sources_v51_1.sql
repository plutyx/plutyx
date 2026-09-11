create or replace function sac.gcl_ai_store_external_snapshot(p_audit_run_id uuid,p_source text,p_source_key text,p_normalized_url text,p_payload jsonb,p_ttl_hours integer default 24)
returns uuid language plpgsql security definer set search_path='sac','public' as $$
declare v_id uuid; v_source text:=lower(trim(p_source));
begin
  if v_source not in ('mdn_http_observatory','w3c_nu') then raise exception 'unsupported_gcl_ai_external_source'; end if;
  if not exists(select 1 from sac.audit_runs where id=p_audit_run_id) then raise exception 'audit_not_found'; end if;
  insert into sac.source_snapshots(normalized_url,source,source_key,captured_at,fetched_at,expires_at,payload)
  values(trim(p_normalized_url),v_source,p_source_key,now(),now(),now()+make_interval(hours=>greatest(1,least(coalesce(p_ttl_hours,24),168))),coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('audit_run_id',p_audit_run_id,'source',v_source))
  on conflict(source,source_key) do update set normalized_url=excluded.normalized_url,captured_at=excluded.captured_at,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,payload=excluded.payload
  returning id into v_id;
  return v_id;
end;$$;
revoke all on function sac.gcl_ai_store_external_snapshot(uuid,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function sac.gcl_ai_store_external_snapshot(uuid,text,text,text,jsonb,integer) to service_role,postgres;

create or replace function sac.gcl_ai_external_evidence_payload(p_audit_run_id uuid)
returns jsonb language sql security definer set search_path='sac','public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'evidence_ref',case when s.source='mdn_http_observatory' then 'mdn:'||p_audit_run_id::text else 'w3c:'||coalesce(s.payload->>'page_id',s.source_key) end,
    'source',s.source,'url',s.normalized_url,'captured_at',s.captured_at,'expires_at',s.expires_at,'payload',s.payload-'audit_run_id'-'source'
  ) order by s.source,s.normalized_url),'[]'::jsonb)
  from sac.source_snapshots s
  where s.source in ('mdn_http_observatory','w3c_nu') and s.payload->>'audit_run_id'=p_audit_run_id::text;
$$;
revoke all on function sac.gcl_ai_external_evidence_payload(uuid) from public,anon,authenticated;
grant execute on function sac.gcl_ai_external_evidence_payload(uuid) to service_role,postgres;