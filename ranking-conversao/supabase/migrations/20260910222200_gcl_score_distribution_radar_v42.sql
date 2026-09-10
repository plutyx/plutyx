create or replace function sac.gcl_score_distribution(
  p_domain_id uuid,
  p_preferred_audit_run_id uuid default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'sac','public'
as $$
declare
  v_source_run uuid;
  v_rank_run uuid;
  v_score numeric;
  v_coverage numeric;
  v_confidence numeric;
  v_tier text;
  v_eligibility text;
  v_source_matches boolean:=false;
begin
  if p_domain_id is null then
    return jsonb_build_object('available',false,'reason','domain_required','version','GCL-RADAR-1.0');
  end if;

  select e.audit_run_id,e.score_100,e.metric_coverage,e.evidence_confidence,e.tier,e.eligibility_status
    into v_rank_run,v_score,v_coverage,v_confidence,v_tier,v_eligibility
  from sac.autonomous_ranking_entries e
  where e.domain_id=p_domain_id
  limit 1;

  if v_rank_run is not null and exists(
    select 1 from sac.experience_dimension_scores s
    where s.audit_run_id=v_rank_run
      and s.dimension_code in ('design','usability','conversion_readiness','wpo','semantics_seo','accessibility')
      and coalesce(s.score_10,s.preliminary_score_10) is not null
  ) then
    v_source_run:=v_rank_run;
    v_source_matches:=true;
  elsif p_preferred_audit_run_id is not null and exists(
    select 1 from sac.audit_runs ar
    where ar.id=p_preferred_audit_run_id and ar.domain_id=p_domain_id
  ) and exists(
    select 1 from sac.experience_dimension_scores s
    where s.audit_run_id=p_preferred_audit_run_id
      and s.dimension_code in ('design','usability','conversion_readiness','wpo','semantics_seo','accessibility')
      and coalesce(s.score_10,s.preliminary_score_10) is not null
  ) then
    v_source_run:=p_preferred_audit_run_id;
  else
    select ar.id into v_source_run
    from sac.audit_runs ar
    where ar.domain_id=p_domain_id
      and exists(
        select 1 from sac.experience_dimension_scores s
        where s.audit_run_id=ar.id
          and s.dimension_code in ('design','usability','conversion_readiness','wpo','semantics_seo','accessibility')
          and coalesce(s.score_10,s.preliminary_score_10) is not null
      )
    order by ar.completed_at desc nulls last,ar.created_at desc
    limit 1;
    v_source_matches:=v_source_run is not null and v_source_run=v_rank_run;
  end if;

  if v_source_run is null then
    return jsonb_build_object(
      'available',false,'reason','dimension_evidence_not_materialized','version','GCL-RADAR-1.0',
      'scale',jsonb_build_object('min',0,'max',100),'gcl_score_100',v_score,
      'metric_coverage',v_coverage,'evidence_confidence',v_confidence,'tier',v_tier,'eligibility_status',v_eligibility
    );
  end if;

  return (
    with desired(code,label,display_order) as (
      values
        ('design'::text,'Design & Craft'::text,10),
        ('usability'::text,'UX & Usabilidade'::text,20),
        ('conversion_readiness'::text,'Conversão'::text,30),
        ('wpo'::text,'Performance'::text,40),
        ('semantics_seo'::text,'SEO & Semântica'::text,50),
        ('accessibility'::text,'Acessibilidade'::text,60)
    ), axis_rows as (
      select
        d.code,d.label,d.display_order,
        case when s.score_10 is not null then round(s.score_10*10,1)
             when s.preliminary_score_10 is not null then round(s.preliminary_score_10*10,1)
             else null end as score_100,
        s.score_10 is null and s.preliminary_score_10 is not null as preliminary,
        round(coalesce(s.evidence_coverage,0)*100,1) as coverage_100,
        round(coalesce(s.effective_confidence,0)*100,1) as confidence_100,
        s.status,s.observed_checks,s.eligible_checks,s.pass_count,s.warning_count,s.fail_count
      from desired d
      left join sac.experience_dimension_scores s
        on s.audit_run_id=v_source_run and s.dimension_code=d.code
    ), numeric_axes as (
      select * from axis_rows where score_100 is not null
    )
    select jsonb_build_object(
      'available',(select count(*)>=3 from numeric_axes),
      'version','GCL-RADAR-1.0','kind','diagnostic_score_distribution',
      'source_audit_run_id',v_source_run,'source_matches_gcl_score',v_source_matches,
      'gcl_score_100',v_score,'metric_coverage',v_coverage,'evidence_confidence',v_confidence,
      'tier',v_tier,'eligibility_status',v_eligibility,'scale',jsonb_build_object('min',0,'max',100),
      'axes',coalesce((select jsonb_agg(to_jsonb(a) order by a.display_order) from axis_rows a),'[]'::jsonb),
      'measured_axes',(select count(*) from numeric_axes),'ready_axes',(select count(*) from axis_rows where status='ready' and score_100 is not null),
      'preliminary_axes',(select count(*) from axis_rows where preliminary),
      'strongest',(select jsonb_build_object('code',code,'label',label,'score_100',score_100,'preliminary',preliminary,'coverage_100',coverage_100) from numeric_axes order by score_100 desc,display_order limit 1),
      'weakest',(select jsonb_build_object('code',code,'label',label,'score_100',score_100,'preliminary',preliminary,'coverage_100',coverage_100) from numeric_axes order by score_100 asc,display_order limit 1),
      'disclosure','Os eixos são dimensões diagnósticas observadas e não parcelas aditivas do GCL Score. Quando a cobertura mínima da dimensão ainda não foi atingida, o valor é exibido como preliminar e acompanhado de cobertura/confiança.'
    )
  );
end;
$$;

revoke all on function sac.gcl_score_distribution(uuid,uuid) from public,anon,authenticated;
grant execute on function sac.gcl_score_distribution(uuid,uuid) to service_role,postgres;

create or replace function public.sac_api_deep_report(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $$
declare
  v jsonb;
  v_run uuid;
  v_domain uuid;
begin
  v:=public.sac_api_deep_report_core(p_token);
  if coalesce((v->>'found')::boolean,false) then
    v_run:=(v->>'audit_run_id')::uuid;
    v_domain=nullif(v->'domain'->>'id','')::uuid;
    v:=v||jsonb_build_object(
      'sales_architecture',sac.sales_architecture_summary(v_run),
      'ai_search',sac.ai_search_summary(v_run),
      'evidence_matrix',sac.audit_evidence_matrix(v_run),
      'metric_architecture',sac.audit_metric_architecture_v2(v_run),
      'competitive_mission',sac.competitive_mission_for_audit(v_run),
      'score_distribution',sac.gcl_score_distribution(v_domain,v_run)
    );
  end if;
  return v;
end;
$$;

create or replace function public.gcl_member_analyses()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','sac'
as $$
declare
  uid uuid:=auth.uid();
  out jsonb;
begin
  if uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into out from (
    select
      i.public_token as intent_token,i.normalized_domain,i.url,i.status,i.price_snapshot,i.currency,i.scan_public_token,i.created_at,i.paid_at,
      j.status as scan_status,j.mode,j.completed_at as scan_completed_at,j.audit_run_id,
      e.score_100,e.overall_rank,e.tier,e.metric_coverage,e.evidence_confidence,
      case when i.scan_public_token is not null then '/ranking-site/?scan='||i.scan_public_token::text else null end as report_path,
      case when d.id is not null and j.audit_run_id is not null then sac.gcl_score_distribution(d.id,j.audit_run_id) else null end as score_distribution
    from sac.analysis_checkout_intents i
    left join sac.fullscan_jobs j on j.public_token=i.scan_public_token
    left join sac.audit_runs ar on ar.id=j.audit_run_id
    left join sac.domains d on d.id=ar.domain_id
    left join sac.autonomous_ranking_entries e on e.domain_id=d.id
    where i.owner_user_id=uid
  ) x;
  return out;
end;
$$;

grant execute on function public.gcl_member_analyses() to authenticated,service_role;
