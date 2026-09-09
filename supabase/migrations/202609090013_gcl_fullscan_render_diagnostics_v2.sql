-- GCL autonomous metrics v13.2: derive additional diagnostics from evidence already collected by the fullscan browser.

insert into sac.metric_registry(metric_code,engine,name,unit,evidence_class,collection_mode,audit_scope,score_role,threshold,evidence_requirements,source_reference,methodology_version,status,updated_at)
values
('M-A11Y-AXE-CRITICAL','accessibility','axe-core critical violations','count','browser_render','fullscan_rendered','url_core','diagnostic','{"good_eq":0}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core violations[].impact','SAC-METRICS-1.2','experimental',now()),
('M-A11Y-AXE-SERIOUS','accessibility','axe-core serious violations','count','browser_render','fullscan_rendered','url_core','diagnostic','{"good_eq":0}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core violations[].impact','SAC-METRICS-1.2','experimental',now()),
('M-A11Y-AXE-MODERATE','accessibility','axe-core moderate violations','count','browser_render','fullscan_rendered','url_core','diagnostic','{"good_eq":0}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core violations[].impact','SAC-METRICS-1.2','experimental',now()),
('M-A11Y-AXE-MINOR','accessibility','axe-core minor violations','count','browser_render','fullscan_rendered','url_core','diagnostic','{"good_eq":0}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'axe-core violations[].impact','SAC-METRICS-1.2','experimental',now()),
('M-A11Y-AXE-AFFECTED-NODES','accessibility','axe-core affected DOM nodes','count','browser_render','fullscan_rendered','url_core','diagnostic','{"good_eq":0}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'Sum of rendered.axe.violations[].nodes_count','SAC-METRICS-1.2','experimental',now()),
('M-A11Y-AXE-TARGET-VALID','accessibility','axe audit target validity','boolean','browser_render','fullscan_rendered','url_core','context','{"good_eq":1}'::jsonb,'{"requires":"rendered.axe.available=true"}'::jsonb,'rendered.axe.valid_for_target','SAC-METRICS-1.2','experimental',now()),
('M-BRW-IMG-ALT-COVERAGE','accessibility','Rendered image alt coverage','percent','browser_render','fullscan_rendered','url_core','diagnostic','{"good_gte":100}'::jsonb,'{"requires":"rendered.metrics.images>0"}'::jsonb,'Rendered DOM images vs images_missing_alt','SAC-METRICS-1.2','experimental',now()),
('M-BRW-FORM-LABEL-COVERAGE','accessibility','Rendered form label coverage','percent','browser_render','fullscan_rendered','url_core','diagnostic','{"good_gte":100}'::jsonb,'{"requires":"rendered.metrics.form_controls>0"}'::jsonb,'Rendered DOM form_controls vs form_controls_missing_label','SAC-METRICS-1.2','experimental',now()),
('M-BRW-RENDER-DURATION-MS','frontend_network','Audit browser render duration','ms','browser_render','fullscan_rendered','url_core','context','{}'::jsonb,'{"requires":"rendered.available=true"}'::jsonb,'Fullscan browser worker duration; operational diagnostic, not page load time','SAC-METRICS-1.2','experimental',now()),
('M-BRW-RENDERED-H1-COUNT','seo','Rendered DOM H1 count','count','browser_render','fullscan_rendered','url_core','diagnostic','{"good_eq":1}'::jsonb,'{"requires":"rendered.available=true"}'::jsonb,'Rendered DOM h1_count','SAC-METRICS-1.2','experimental',now())
on conflict(metric_code) do update set name=excluded.name,engine=excluded.engine,unit=excluded.unit,evidence_class=excluded.evidence_class,collection_mode=excluded.collection_mode,audit_scope=excluded.audit_scope,score_role=excluded.score_role,threshold=excluded.threshold,evidence_requirements=excluded.evidence_requirements,source_reference=excluded.source_reference,methodology_version=excluded.methodology_version,status=excluded.status,updated_at=now();

insert into sac.metric_collection_capabilities(metric_code,availability,autonomous,requires_connection,implemented,provider_dependency,methodology_note,updated_at)
select metric_code,'autonomous_browser',true,false,true,null,'Derived only from the authenticated rendered fullscan payload already produced in production; diagnostic/context until population calibration.',now()
from sac.metric_registry where metric_code in (
'M-A11Y-AXE-CRITICAL','M-A11Y-AXE-SERIOUS','M-A11Y-AXE-MODERATE','M-A11Y-AXE-MINOR','M-A11Y-AXE-AFFECTED-NODES','M-A11Y-AXE-TARGET-VALID','M-BRW-IMG-ALT-COVERAGE','M-BRW-FORM-LABEL-COVERAGE','M-BRW-RENDER-DURATION-MS','M-BRW-RENDERED-H1-COUNT')
on conflict(metric_code) do update set availability=excluded.availability,autonomous=excluded.autonomous,requires_connection=excluded.requires_connection,implemented=excluded.implemented,provider_dependency=excluded.provider_dependency,methodology_note=excluded.methodology_note,updated_at=now();

create or replace function sac.materialize_fullscan_render_diagnostics(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  j sac.fullscan_jobs%rowtype;
  v_page_id uuid;
  v_rendered jsonb; v_metrics jsonb; v_axe jsonb; v_timing jsonb;
  v_console_errors integer; v_count integer:=0; v_prov jsonb;
  v_critical integer:=0; v_serious integer:=0; v_moderate integer:=0; v_minor integer:=0; v_nodes integer:=0;
  v_images numeric; v_missing_alt numeric; v_controls numeric; v_missing_labels numeric;
begin
  select * into j from sac.fullscan_jobs where id=p_job_id;
  if not found or j.status<>'completed' or j.response is null or j.audit_run_id is null then return jsonb_build_object('materialized',0,'reason','job_not_ready'); end if;
  select p.id into v_page_id from sac.pages p where p.audit_run_id=j.audit_run_id order by case when p.page_type='home' then 0 else 1 end,p.id limit 1;
  if v_page_id is null then return jsonb_build_object('materialized',0,'reason','page_missing'); end if;

  v_rendered:=coalesce(j.response->'rendered','{}'::jsonb);
  if coalesce((v_rendered->>'available')::boolean,false)=false then return jsonb_build_object('materialized',0,'reason','render_unavailable'); end if;
  v_metrics:=coalesce(v_rendered->'metrics','{}'::jsonb); v_axe:=coalesce(v_rendered->'axe','{}'::jsonb); v_timing:=coalesce(v_metrics->'timing','{}'::jsonb);
  v_prov:=jsonb_build_object('job_id',j.id,'worker_version',coalesce(j.response->'engine'->>'version','unknown'),'completed_at',j.completed_at,'source','fullscan_rendered','ranking_impact','diagnostic_or_context_only');

  if coalesce((v_axe->>'available')::boolean,false) then
    if jsonb_typeof(v_axe->'violations_count')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-VIOLATIONS',(v_axe->>'violations_count')::numeric,null,v_axe->'violations','fullscan_rendered',null,0.95,v_prov||jsonb_build_object('axe_version',v_axe->>'version')); v_count:=v_count+1; end if;
    if jsonb_typeof(v_axe->'passes_count')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-PASSES',(v_axe->>'passes_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.95,v_prov||jsonb_build_object('axe_version',v_axe->>'version')); v_count:=v_count+1; end if;
    if jsonb_typeof(v_axe->'incomplete_count')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-INCOMPLETE',(v_axe->>'incomplete_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov||jsonb_build_object('axe_version',v_axe->>'version')); v_count:=v_count+1; end if;
    if jsonb_typeof(v_axe->'inapplicable_count')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-INAPPLICABLE',(v_axe->>'inapplicable_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.95,v_prov||jsonb_build_object('axe_version',v_axe->>'version')); v_count:=v_count+1; end if;

    select count(*) filter(where x->>'impact'='critical')::int,count(*) filter(where x->>'impact'='serious')::int,count(*) filter(where x->>'impact'='moderate')::int,count(*) filter(where x->>'impact'='minor')::int,coalesce(sum(coalesce((x->>'nodes_count')::int,0)),0)::int
      into v_critical,v_serious,v_moderate,v_minor,v_nodes
    from jsonb_array_elements(coalesce(v_axe->'violations','[]'::jsonb)) x;
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-CRITICAL',v_critical,null,'{}'::jsonb,'fullscan_rendered',null,0.95,v_prov); v_count:=v_count+1;
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-SERIOUS',v_serious,null,'{}'::jsonb,'fullscan_rendered',null,0.95,v_prov); v_count:=v_count+1;
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-MODERATE',v_moderate,null,'{}'::jsonb,'fullscan_rendered',null,0.94,v_prov); v_count:=v_count+1;
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-MINOR',v_minor,null,'{}'::jsonb,'fullscan_rendered',null,0.94,v_prov); v_count:=v_count+1;
    perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-AFFECTED-NODES',v_nodes,null,'{}'::jsonb,'fullscan_rendered',null,0.94,v_prov); v_count:=v_count+1;
    if v_axe ? 'valid_for_target' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-A11Y-AXE-TARGET-VALID',case when coalesce((v_axe->>'valid_for_target')::boolean,false) then 1 else 0 end,null,'{}'::jsonb,'fullscan_rendered',null,0.98,v_prov); v_count:=v_count+1; end if;
  end if;

  if jsonb_typeof(v_rendered->'console_errors')='array' then v_console_errors:=jsonb_array_length(v_rendered->'console_errors'); perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-CONSOLE-ERRORS',v_console_errors,null,jsonb_build_object('sample',coalesce(v_rendered->'console_errors','[]'::jsonb)),'fullscan_rendered',null,0.90,v_prov); v_count:=v_count+1; end if;
  if jsonb_typeof(v_metrics->'resource_count')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-RESOURCE-COUNT',(v_metrics->>'resource_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.94,v_prov); v_count:=v_count+1; end if;
  if jsonb_typeof(v_timing->'ttfb_ms')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-NAV-TTFB-MS',(v_timing->>'ttfb_ms')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov); v_count:=v_count+1; end if;
  if jsonb_typeof(v_timing->'dom_content_loaded_ms')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-DCL-MS',(v_timing->>'dom_content_loaded_ms')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov); v_count:=v_count+1; end if;
  if jsonb_typeof(v_timing->'load_ms')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-LOAD-MS',(v_timing->>'load_ms')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.92,v_prov); v_count:=v_count+1; end if;

  if jsonb_typeof(v_rendered->'duration_ms')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-RENDER-DURATION-MS',(v_rendered->>'duration_ms')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.99,v_prov); v_count:=v_count+1; end if;
  if jsonb_typeof(v_metrics->'h1_count')='number' then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-RENDERED-H1-COUNT',(v_metrics->>'h1_count')::numeric,null,'{}'::jsonb,'fullscan_rendered',null,0.95,v_prov); v_count:=v_count+1; end if;

  if jsonb_typeof(v_metrics->'images')='number' then v_images:=(v_metrics->>'images')::numeric; end if;
  if jsonb_typeof(v_metrics->'images_missing_alt')='number' then v_missing_alt:=(v_metrics->>'images_missing_alt')::numeric; end if;
  if coalesce(v_images,0)>0 and v_missing_alt is not null then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-IMG-ALT-COVERAGE',round(100*(v_images-v_missing_alt)/v_images,2),null,jsonb_build_object('images',v_images,'missing_alt',v_missing_alt),'fullscan_rendered',null,0.95,v_prov); v_count:=v_count+1; end if;

  if jsonb_typeof(v_metrics->'form_controls')='number' then v_controls:=(v_metrics->>'form_controls')::numeric; end if;
  if jsonb_typeof(v_metrics->'form_controls_missing_label')='number' then v_missing_labels:=(v_metrics->>'form_controls_missing_label')::numeric; end if;
  if coalesce(v_controls,0)>0 and v_missing_labels is not null then perform sac.upsert_metric_observation(j.audit_run_id,v_page_id,'M-BRW-FORM-LABEL-COVERAGE',round(100*(v_controls-v_missing_labels)/v_controls,2),null,jsonb_build_object('controls',v_controls,'missing_labels',v_missing_labels),'fullscan_rendered',null,0.95,v_prov); v_count:=v_count+1; end if;

  return jsonb_build_object('materialized',v_count,'audit_run_id',j.audit_run_id,'page_id',v_page_id);
end;
$$;

-- Re-run recent completed full scans to populate the new derived diagnostics.
do $$ declare r record; begin
  for r in select id from sac.fullscan_jobs where status='completed' and audit_run_id is not null and response is not null order by completed_at desc nulls last limit 500 loop
    perform sac.materialize_fullscan_render_diagnostics(r.id);
  end loop;
end; $$;
