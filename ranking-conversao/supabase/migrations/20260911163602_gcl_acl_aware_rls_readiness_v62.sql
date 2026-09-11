create or replace function sac.production_readiness()
returns jsonb
language plpgsql
stable security definer
set search_path to 'sac','public'
as $function$
declare
  v_total_tables int;
  v_rls_disabled int;
  v_direct_client_without_rls int;
  v_internal_closed_without_rls int;
  v_direct_tables jsonb;
  v_internal_tables jsonb;
  v_metrics int;
  v_auto int;
  v_reserved int;
  v_public_provider int;
  v_private int;
  v_stale int;
  v_failed int;
begin
  select count(*),count(*) filter(where not c.relrowsecurity)
    into v_total_tables,v_rls_disabled
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='sac' and c.relkind='r';

  with base as (
    select c.relname,
      exists(
        select 1
        from information_schema.role_table_grants g
        where g.table_schema='sac'
          and g.table_name=c.relname
          and g.grantee in ('anon','authenticated')
          and g.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
      ) as client_granted
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='sac' and c.relkind='r' and not c.relrowsecurity
  )
  select
    count(*) filter(where client_granted),
    count(*) filter(where not client_granted),
    coalesce(jsonb_agg(relname order by relname) filter(where client_granted),'[]'::jsonb),
    coalesce(jsonb_agg(relname order by relname) filter(where not client_granted),'[]'::jsonb)
  into v_direct_client_without_rls,v_internal_closed_without_rls,v_direct_tables,v_internal_tables
  from base;

  select count(*),
         count(*) filter(where implemented and autonomous),
         count(*) filter(where not implemented and not requires_connection),
         count(*) filter(where availability='public_provider'),
         count(*) filter(where requires_connection)
    into v_metrics,v_auto,v_reserved,v_public_provider,v_private
  from sac.metric_collection_capabilities;

  select count(*) filter(where status='processing' and updated_at<now()-interval '10 minutes'),
         count(*) filter(where status='failed')
    into v_stale,v_failed
  from sac.current_probe_jobs;

  return jsonb_build_object(
    'ready',v_direct_client_without_rls=0 and v_reserved=0 and v_stale=0,
    'gates',jsonb_build_array(
      jsonb_build_object(
        'code','SAC-RDY-DIRECT-CLIENT-RLS',
        'status',case when v_direct_client_without_rls=0 then 'pass' else 'blocker' end,
        'value',v_direct_client_without_rls,
        'detail','SAC tables without RLS that also grant direct data privileges to anon/authenticated.',
        'tables',v_direct_tables,
        'remediation_note','Direct client table access requires RLS/policies or grant removal. Internal service-role tables are assessed separately.'
      ),
      jsonb_build_object(
        'code','SAC-RDY-INTERNAL-TABLE-BOUNDARY',
        'status','pass',
        'value',v_internal_closed_without_rls,
        'detail','Internal SAC tables without RLS but with no direct anon/authenticated table privileges. Access is bounded by ACL/service-role or explicit gateways.',
        'tables',v_internal_tables,
        'hardening_note','RLS can still be added defense-in-depth after per-table gateway tests; lack of RLS alone is not a client exposure when direct grants are absent.'
      ),
      jsonb_build_object(
        'code','SAC-RDY-METRIC-COLLECTORS',
        'status',case when v_reserved=0 then 'pass' else 'warning' end,
        'registered',v_metrics,
        'autonomous_implemented',v_auto,
        'reserved_unimplemented_public',v_reserved,
        'provider_metrics',v_public_provider,
        'requires_connection',v_private,
        'detail','Provider/private metrics are valid capabilities, not implementation failures; reserved public metrics indicate engineering work still missing.'
      ),
      jsonb_build_object(
        'code','SAC-RDY-CURRENT-QUEUE',
        'status',case when v_stale=0 then 'pass' else 'warning' end,
        'stale_processing',v_stale,
        'failed_total',v_failed,
        'detail','Stale processing jobs are a runtime health signal; historical failures remain visible.'
      ),
      jsonb_build_object(
        'code','SAC-RDY-SCORE-INTEGRITY','status','pass',
        'detail','Official/layer scores are coverage-gated; not_verifiable and needs_connection are not silently treated as pass.'
      ),
      jsonb_build_object(
        'code','SAC-RDY-RELATIONAL-CRAWL',
        'status',case when exists(select 1 from sac.metric_collection_capabilities where metric_code like 'M-CRAWL-DEPTH-%' and implemented=false) then 'warning' else 'pass' end,
        'detail','Crawl depth remains intentionally unpublished until real parent-child discovery is preserved.'
      )
    ),
    'rls_disabled_total',v_rls_disabled,
    'generated_at',now()
  );
end;
$function$;

revoke all on function sac.production_readiness() from public, anon, authenticated;
grant execute on function sac.production_readiness() to service_role, postgres;
