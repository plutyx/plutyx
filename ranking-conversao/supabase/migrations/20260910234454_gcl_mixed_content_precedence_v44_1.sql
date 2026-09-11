create or replace function sac.evaluate_atomic_mixed_content_v2(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $$
declare
  v_pages int:=0;
  v_mixed int:=0;
  v_updates int:=0;
begin
  with s as (
    select distinct on ((payload->>'page_id')::uuid) payload
    from sac.source_snapshots
    where source='current_supabase_edge'
      and payload->>'audit_run_id'=p_audit_run_id::text
      and payload ? 'page_id'
      and payload ? 'html'
    order by (payload->>'page_id')::uuid,fetched_at desc
  )
  select count(*)::int,
         count(*) filter(where
           coalesce(payload->>'html','') ~* '<(?:script|img|iframe|source|video|audio|embed)[^>]+src\s*=\s*["'']http://'
           or coalesce(payload->>'html','') ~* '<object[^>]+data\s*=\s*["'']http://'
           or coalesce(payload->>'html','') ~* '<link[^>]+rel\s*=\s*["''][^"'']*(?:stylesheet|preload|modulepreload|icon)[^"'']*["''][^>]+href\s*=\s*["'']http://'
           or coalesce(payload->>'html','') ~* '<link[^>]+href\s*=\s*["'']http://[^"'']+["''][^>]+rel\s*=\s*["''][^"'']*(?:stylesheet|preload|modulepreload|icon)[^"'']*["'']'
         )::int
    into v_pages,v_mixed
  from s;

  if v_pages=0 then return jsonb_build_object('updated',0,'reason','no_current_snapshots'); end if;

  v_updates:=v_updates+sac.set_atomic_signal(
    p_audit_run_id,'frontend_network','mixed content',
    case when v_mixed=0 then 'pass' else 'fail' end,0.99,'current_supabase_edge',
    jsonb_build_object('methodology','GCL-MIXED-CONTENT-2.0','pages_with_active_http_subresources',v_mixed,'sampled_pages',v_pages,'excluded_nonresource_http_namespaces',true),
    'Mixed content v2 checks active HTTP subresources only; namespace/profile links such as w3.org SVG and XFN are excluded.'
  );
  v_updates:=v_updates+sac.set_atomic_signal(
    p_audit_run_id,'security','mixed content',
    case when v_mixed=0 then 'pass' else 'fail' end,0.99,'current_supabase_edge',
    jsonb_build_object('methodology','GCL-MIXED-CONTENT-2.0','pages_with_active_http_subresources',v_mixed,'sampled_pages',v_pages,'excluded_nonresource_http_namespaces',true),
    'Mixed content v2 checks active HTTP subresources only; namespace/profile links such as w3.org SVG and XFN are excluded.'
  );
  return jsonb_build_object('updated',v_updates,'sampled_pages',v_pages,'pages_with_active_http_subresources',v_mixed,'methodology','GCL-MIXED-CONTENT-2.0');
end;
$$;
revoke all on function sac.evaluate_atomic_mixed_content_v2(uuid) from public, anon, authenticated;
grant execute on function sac.evaluate_atomic_mixed_content_v2(uuid) to service_role;
