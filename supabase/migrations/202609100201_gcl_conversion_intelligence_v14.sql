create or replace function sac.conversion_intelligence(p_audit_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'sac','public'
as $function$
declare
  v_domain_id uuid;
  v_domain text;
  v_category text;
  v_rank jsonb:='{}'::jsonb;
  v_benchmark jsonb:='{}'::jsonb;
  v_benchmark_gaps jsonb:='[]'::jsonb;
  v_benchmark_wins jsonb:='[]'::jsonb;
  v_weakest jsonb:='[]'::jsonb;
  v_strongest jsonb:='[]'::jsonb;
  v_market jsonb:='[]'::jsonb;
  v_cohort_size int:=0;
  v_cohort_median numeric;
  v_cohort_p75 numeric;
  v_cohort_p90 numeric;
  v_site_score numeric;
  v_site_percentile numeric;
  v_fail int:=0;
  v_warning int:=0;
  v_needs_connection int:=0;
  v_headline text;
begin
  select ar.domain_id,d.normalized_domain,coalesce(nullif(d.category,''),nullif(d.detected_archetype,''),'unclassified')
    into v_domain_id,v_domain,v_category
  from sac.audit_runs ar
  join sac.domains d on d.id=ar.domain_id
  where ar.id=p_audit_run_id;

  if v_domain_id is null then
    return jsonb_build_object('available',false,'reason','audit_not_found');
  end if;

  select coalesce(to_jsonb(x),'{}'::jsonb),x.score_100
    into v_rank,v_site_score
  from (
    select e.score_100,e.raw_score_100,e.metric_coverage,e.observed_metrics,e.active_metrics,
           e.evidence_confidence,e.tier,e.eligibility_status,e.overall_rank,e.previous_rank,
           e.rank_delta,e.category_rank,e.percentile,e.calculated_at
    from sac.autonomous_ranking_entries e
    where e.domain_id=v_domain_id
  ) x;

  v_rank:=coalesce(v_rank,'{}'::jsonb);
  v_benchmark:=coalesce(sac.audit_public_benchmark_compare(p_audit_run_id),'{}'::jsonb);

  if coalesce((v_benchmark->>'available')::boolean,false) then
    select coalesce(jsonb_agg(q.item order by q.delta_pp asc),'[]'::jsonb)
      into v_benchmark_gaps
    from (
      select e item,(e->>'delta_pp')::numeric delta_pp
      from jsonb_array_elements(coalesce(v_benchmark->'comparison','[]'::jsonb)) e
      where nullif(e->>'delta_pp','') is not null and (e->>'delta_pp')::numeric < 0
      order by delta_pp asc
      limit 5
    ) q;

    select coalesce(jsonb_agg(q.item order by q.delta_pp desc),'[]'::jsonb)
      into v_benchmark_wins
    from (
      select e item,(e->>'delta_pp')::numeric delta_pp
      from jsonb_array_elements(coalesce(v_benchmark->'comparison','[]'::jsonb)) e
      where nullif(e->>'delta_pp','') is not null and (e->>'delta_pp')::numeric > 0
      order by delta_pp desc
      limit 5
    ) q;
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.score asc nulls last),'[]'::jsonb)
    into v_weakest
  from (
    select eds.dimension_code,ed.label,ed.group_code,
           coalesce(eds.score_10,eds.preliminary_score_10) score,
           eds.evidence_coverage,eds.effective_confidence,
           eds.pass_count,eds.warning_count,eds.fail_count
    from sac.experience_dimension_scores eds
    join sac.experience_dimensions ed on ed.dimension_code=eds.dimension_code
    where eds.audit_run_id=p_audit_run_id
      and ed.active and ed.group_code<>'composite'
      and coalesce(eds.score_10,eds.preliminary_score_10) is not null
    order by score asc nulls last,eds.evidence_coverage desc
    limit 5
  ) q;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.score desc nulls last),'[]'::jsonb)
    into v_strongest
  from (
    select eds.dimension_code,ed.label,ed.group_code,
           coalesce(eds.score_10,eds.preliminary_score_10) score,
           eds.evidence_coverage,eds.effective_confidence,
           eds.pass_count,eds.warning_count,eds.fail_count
    from sac.experience_dimension_scores eds
    join sac.experience_dimensions ed on ed.dimension_code=eds.dimension_code
    where eds.audit_run_id=p_audit_run_id
      and ed.active and ed.group_code<>'composite'
      and coalesce(eds.score_10,eds.preliminary_score_10) is not null
    order by score desc nulls last,eds.evidence_coverage desc
    limit 3
  ) q;

  select count(*)::int,
         percentile_cont(.5) within group(order by e.score_100),
         percentile_cont(.75) within group(order by e.score_100),
         percentile_cont(.9) within group(order by e.score_100)
    into v_cohort_size,v_cohort_median,v_cohort_p75,v_cohort_p90
  from sac.autonomous_ranking_entries e
  join sac.domains d on d.id=e.domain_id
  where e.score_100 is not null
    and coalesce(nullif(d.category,''),nullif(d.detected_archetype,''),'unclassified')=v_category;

  if v_cohort_size>=20 and v_site_score is not null then
    select round(100.0*count(*) filter(where e.score_100<=v_site_score)/nullif(count(*),0),1)
      into v_site_percentile
    from sac.autonomous_ranking_entries e
    join sac.domains d on d.id=e.domain_id
    where e.score_100 is not null
      and coalesce(nullif(d.category,''),nullif(d.detected_archetype,''),'unclassified')=v_category;
  end if;

  select count(*) filter(where status='fail')::int,
         count(*) filter(where status='warning')::int,
         count(*) filter(where status='needs_connection')::int
    into v_fail,v_warning,v_needs_connection
  from sac.atomic_evaluations where audit_run_id=p_audit_run_id;

  v_market:=coalesce(sac.recommend_market_listings(p_audit_run_id,6),'[]'::jsonb);

  v_headline:=case
    when v_site_score is not null and v_cohort_size>=20 then
      format('Seu site está no percentil %s da categoria %s; o painel mostra a distância até a mediana e o top 10%% sem confundir benchmark com taxa de conversão.',coalesce(v_site_percentile,0),v_category)
    when jsonb_array_length(v_benchmark_gaps)>0 then
      format('A comparação técnica encontrou %s lacunas abaixo do benchmark observável. Priorize as maiores diferenças antes da próxima auditoria.',jsonb_array_length(v_benchmark_gaps))
    when jsonb_array_length(v_weakest)>0 then
      'O diagnóstico já identificou as dimensões mais fracas. A amostra de scores completos ainda está em calibração, então o sistema não inventa percentis.'
    else
      'A coleta ainda precisa de mais evidência antes de produzir uma posição comparativa confiável.'
  end;

  return jsonb_build_object(
    'available',true,
    'version','CI-1.0',
    'headline',v_headline,
    'positioning',jsonb_build_object(
      'domain',v_domain,'category',v_category,'score',v_site_score,
      'ranking',v_rank,
      'score_cohort',jsonb_build_object(
        'available',v_cohort_size>=20,
        'minimum_required',20,
        'current_size',v_cohort_size,
        'site_percentile',case when v_cohort_size>=20 then v_site_percentile else null end,
        'median',case when v_cohort_size>=20 then round(v_cohort_median,1) else null end,
        'p75',case when v_cohort_size>=20 then round(v_cohort_p75,1) else null end,
        'p90',case when v_cohort_size>=20 then round(v_cohort_p90,1) else null end,
        'disclosure','Percentis de GCL Score só são publicados quando há pelo menos 20 scores completos comparáveis na mesma categoria.'
      )
    ),
    'technical_benchmark',jsonb_build_object(
      'available',coalesce((v_benchmark->>'available')::boolean,false),
      'sample_pages',v_benchmark->'sample_pages',
      'gaps',v_benchmark_gaps,
      'advantages',v_benchmark_wins,
      'source',v_benchmark->'benchmark_source',
      'disclosure',coalesce(v_benchmark->>'interpretation','Benchmark técnico observável; não representa sozinho taxa de conversão, receita ou vendas.')
    ),
    'dimension_map',jsonb_build_object('weakest',v_weakest,'strongest',v_strongest),
    'execution',jsonb_build_object(
      'failures',coalesce(v_fail,0),'warnings',coalesce(v_warning,0),'connections_needed',coalesce(v_needs_connection,0),
      'market_recommendations',v_market,
      'reaudit_required_to_change_score',true
    ),
    'methodology',jsonb_build_object(
      'observed_estimated_first_party_separated',true,
      'benchmark_is_not_conversion_rate',true,
      'market_purchase_never_buys_points',true,
      'insufficient_score_cohort_is_hidden',v_cohort_size<20
    )
  );
end;
$function$;

create or replace function public.sac_api_deep_report(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare v jsonb; v_run uuid;begin
  v:=public.sac_api_deep_report_core(p_token);
  if coalesce((v->>'found')::boolean,false) then
    v_run:=(v->>'audit_run_id')::uuid;
    v:=v||jsonb_build_object(
      'sales_architecture',sac.sales_architecture_summary(v_run),
      'ai_search',sac.ai_search_summary(v_run),
      'conversion_intelligence',sac.conversion_intelligence(v_run)
    );
  end if;
  return v;
end;$function$;
