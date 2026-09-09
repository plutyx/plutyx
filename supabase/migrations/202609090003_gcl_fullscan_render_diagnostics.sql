-- GCL v13: promote already-collected rendered/fullscan evidence to first-class diagnostics.
-- These metrics are diagnostic only. They do not change the official GCL score until calibration.

insert into sac.metric_registry(
  metric_code,engine,name,unit,evidence_class,collection_mode,audit_scope,score_role,
  threshold,evidence_requirements,source_reference,methodology_version,status,updated_at
) values
  ('M-A11Y-AXE-VIOLATIONS','accessibility','axe-core automated violations','count','browser_render','fullscan_rendered','url_core','diagnostic','{"good_eq":0}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core rendered audit payload','SAC-METRICS-1.2','experimental',now()),
  ('M-A11Y-AXE-PASSES','accessibility','axe-core automated passes','count','browser_render','fullscan_rendered','url_core','diagnostic','{}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core rendered audit payload','SAC-METRICS-1.2','experimental',now()),
  ('M-A11Y-AXE-INCOMPLETE','accessibility','axe-core incomplete checks requiring review','count','browser_render','fullscan_rendered','url_core','diagnostic','{}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core rendered audit payload','SAC-METRICS-1.2','experimental',now()),
  ('M-A11Y-AXE-INAPPLICABLE','accessibility','axe-core inapplicable checks','count','browser_render','fullscan_rendered','url_core','diagnostic','{}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core rendered audit payload','SAC-METRICS-1.2','experimental',now()),
  ('M-BRW-CONSOLE-ERRORS','frontend_network','Browser console errors observed during rendered audit','count','browser_render','fullscan_rendered','url_core','diagnostic','{}'::jsonb,'{"requires":"rendered.available=true"}'::jsonb,'Rendered browser console event capture','SAC-METRICS-1.2','experimental',now()),
  ('M-BRW-RESOURCE-COUNT','performance','Rendered page resource count','count','browser_render','fullscan_rendered','url_core','diagnostic','{}'::jsonb,'{"requires":"PerformanceResourceTiming"}'::jsonb,'Browser Performance API resource entries','SAC-METRICS-1.2','experimental',now()),
  ('M-BRW-NAV-TTFB-MS','performance','Browser navigation TTFB','ms','browser_render','fullscan_rendered','url_core','diagnostic','{"good_lte":800,"needs_improvement_lte":1800}'::jsonb,'{"requires":"PerformanceNavigationTiming"}'::jsonb,'Browser PerformanceNavigationTiming','SAC-METRICS-1.2','experimental',now()),
  ('M-BRW-DCL-MS','performance','DOMContentLoaded timing','ms','browser_render','fullscan_rendered','url_core','diagnostic','{}'::jsonb,'{"requires":"PerformanceNavigationTiming"}'::jsonb,'Browser PerformanceNavigationTiming','SAC-METRICS-1.2','experimental',now()),
  ('M-BRW-LOAD-MS','performance','Window load timing','ms','browser_render','fullscan_rendered','url_core','diagnostic','{}'::jsonb,'{"requires":"PerformanceNavigationTiming"}'::jsonb,'Browser PerformanceNavigationTiming','SAC-METRICS-1.2','experimental',now())
on conflict(metric_code) do update set
  engine=excluded.engine,
  name=excluded.name,
  unit=excluded.unit,
  evidence_class=excluded.evidence_class,
  collection_mode=excluded.collection_mode,
  audit_scope=excluded.audit_scope,
  score_role=excluded.score_role,
  threshold=excluded.threshold,
  evidence_requirements=excluded.evidence_requirements,
  source_reference=excluded.source_reference,
  methodology_version=excluded.methodology_version,
  status=excluded.status,
  updated_at=now();

insert into sac.metric_collection_capabilities(
  metric_code,availability,autonomous,requires_connection,implemented,provider_dependency,methodology_note,updated_at
)
select metric_code,'autonomous_browser',true,false,true,null,
       'Materialized from the rendered payload already produced by the authenticated fullscan worker; diagnostic only until calibration.',now()
from sac.metric_registry
where metric_code in (
  'M-A11Y-AXE-VIOLATIONS','M-A11Y-AXE-PASSES','M-A11Y-AXE-INCOMPLETE','M-A11Y-AXE-INAPPLICABLE',
  'M-BRW-CONSOLE-ERRORS','M-BRW-RESOURCE-COUNT','M-BRW-NAV-TTFB-MS','M-BRW-DCL-MS','M-BRW-LOAD-MS'
)
on conflict(metric_code) do update set
  availability=excluded.availability,
  autonomous=excluded.autonomous,
  requires_connection=excluded.requires_connection,
  implemented=excluded.implemented,
  provider_dependency=excluded.provider_dependency,
  methodology_note=excluded.methodology_note,
  updated_at=now();

create or replace function sac.materialize_fullscan_render_diagnostics(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  j sac.fullscan_jobs%rowtype;
  v_page_id uuid;
  v_rendered jsonb;
  v_metrics jsonb;
  v_axe jsonb;
  v_timing jsonb;
  v_console_errors integer;
  v_count integer := 0;
  v_prov jsonb;
begin
  select * into j from sac.fullscan_jobs where id=p_job_id;
  if not found or j.status<>'completed' or j.response is null or j.audit_run_id is null then
    return jsonb_build_object('materialized',0,'reason','job_not_ready');
  end if;

  select p.id into v_page_id
  from sac.pages p
  where p.audit_run_id=j.audit_run_id
  order by case when p.page_type='home' then 0 else 1 end,p.id
  limit 1;
  if v_page_id is null then
    return jsonb_build_object('materialized',0,'reason','page_missing');
  end if;

  v_rendered:=coalesce(j.response->'rendered','{}'::jsonb);
  if coalesce((v_rendered->>'available')::boolean,false)=false then
    return jsonb_build_object('materialized',0,'reason','render_unavailable');
  end if;
  v_metrics:=coalesce(v_rendered->'metrics','{}'::jsonb);
  v_axe:=coalesce(v_rendered->'axe','{}'::jsonb);
  v_timing:=coalesce(v_metrics->'timing','{}'::jsonb);
  v_prov:=jsonb_build_object(
    'job_id',j.id,
    'worker_version',coalesce(j.response->'engine'->>'version','unknown'),
    'completed_at',j.completed_at,
    'source','fullscan_rendered',
    'ranking_impact','diagnostic_only'
  );

  if coalesce((v_axe->>'available')::boolean,false) then
    if jsonb_typeof(v_axe->'violations_count')='number' then
      perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-VIOLATIONS',(v_axe->>'violations_count')::numeric,null,v_axe->'violations', 'fullscan_rendered',null,0.95,v_prov||jsonb_build_object('axe_version',v_axe->>'version'));
      v_count:=v_count+1;
    end if;
    if jsonb_typeof(v_axe->'passes_count')='number' then
      perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-PASSES',(v_axe->>'passes_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.95,v_prov||jsonb_build_object('axe_version',v_axe->>'version'));
      v_count:=v_count+1;
    end if;
    if jsonb_typeof(v_axe->'incomplete_count')='number' then
      perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-INCOMPLETE',(v_axe->>'incomplete_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov||jsonb_build_object('axe_version',v_axe->>'version'));
      v_count:=v_count+1;
    end if;
    if jsonb_typeof(v_axe->'inapplicable_count')='number' then
      perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-INAPPLICABLE',(v_axe->>'inapplicable_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.95,v_prov||jsonb_build_object('axe_version',v_axe->>'version'));
      v_count:=v_count+1;
    end if;
  end if;

  if jsonb_typeof(v_rendered->'console_errors')='array' then
    v_console_errors:=jsonb_array_length(v_rendered->'console_errors');
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-CONSOLE-ERRORS',v_console_errors,null,
      jsonb_build_object('sample',coalesce(v_rendered->'console_errors','[]'::jsonb)),
      'fullscan_rendered',null,0.90,v_prov);
    v_count:=v_count+1;
  end if;

  if jsonb_typeof(v_metrics->'resource_count')='number' then
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-RESOURCE-COUNT',(v_metrics->>'resource_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.94,v_prov);
    v_count:=v_count+1;
  end if;
  if jsonb_typeof(v_timing->'ttfb_ms')='number' then
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-NAV-TTFB-MS',(v_timing->>'ttfb_ms')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov);
    v_count:=v_count+1;
  end if;
  if jsonb_typeof(v_timing->'dom_content_loaded_ms')='number' then
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-DCL-MS',(v_timing->>'dom_content_loaded_ms')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov);
    v_count:=v_count+1;
  end if;
  if jsonb_typeof(v_timing->'load_ms')='number' then
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-LOAD-MS',(v_timing->>'load_ms')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov);
    v_count:=v_count+1;
  end if;

  return jsonb_build_object('materialized',v_count,'audit_run_id',j.audit_run_id,'page_id',v_page_id);
end;
$$;

revoke all on function sac.materialize_fullscan_render_diagnostics(uuid) from public,anon,authenticated;

create or replace function sac.trg_materialize_fullscan_render_diagnostics()
returns trigger
language plpgsql
security definer
set search_path=sac,public
as $$
begin
  if new.status='completed' and new.audit_run_id is not null and old.audit_run_id is distinct from new.audit_run_id then
    perform sac.materialize_fullscan_render_diagnostics(new.id);
  end if;
  return new;
end;
$$;

revoke all on function sac.trg_materialize_fullscan_render_diagnostics() from public,anon,authenticated;

drop trigger if exists trg_materialize_fullscan_render_diagnostics on sac.fullscan_jobs;
create trigger trg_materialize_fullscan_render_diagnostics
after update of audit_run_id on sac.fullscan_jobs
for each row
execute function sac.trg_materialize_fullscan_render_diagnostics();

-- Backfill recent already-materialized full scans so reports benefit immediately.
do $$
declare r record;
begin
  for r in
    select id from sac.fullscan_jobs
    where status='completed' and audit_run_id is not null and response is not null
    order by completed_at desc nulls last
    limit 500
  loop
    perform sac.materialize_fullscan_render_diagnostics(r.id);
  end loop;
end;
$$;
