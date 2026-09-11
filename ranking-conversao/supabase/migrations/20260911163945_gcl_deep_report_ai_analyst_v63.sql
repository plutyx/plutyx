create or replace function public.sac_api_deep_report(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare
  v jsonb;
  v_run uuid;
  v_domain uuid;
  v_dist jsonb;
  v_arch jsonb;
  v_rank jsonb;
  v_summary jsonb;
  v_audit jsonb;
  v_total numeric:=0;
  v_observed numeric:=0;
  v_atomic_cov numeric:=0;
  v_prelim int:=0;
  v_ready int:=0;
  v_score_status text:='diagnostic';
  v_official boolean:=false;
  v_collector_cov jsonb;
  v_collector_observed jsonb;
  v_collector_active jsonb;
  v_autonomous_overall jsonb;
  v_autonomous_category jsonb;
  v_autonomous_percentile jsonb;
  v_autonomous_previous jsonb;
  v_autonomous_delta jsonb;
begin
  v:=public.sac_api_deep_report_core(p_token);
  if coalesce((v->>'found')::boolean,false) then
    v_run:=(v->>'audit_run_id')::uuid;
    v_domain=nullif(v->'domain'->>'id','')::uuid;
    v_arch:=sac.infer_domain_archetype_v1(v_run);
    if coalesce((v_arch->>'available')::boolean,false) then
      v:=jsonb_set(v,'{domain}',coalesce(v->'domain','{}'::jsonb) || jsonb_build_object('detected_archetype',v_arch->>'archetype','archetype_confidence',(v_arch->>'confidence')::numeric),true);
    end if;

    v_dist:=sac.gcl_score_distribution(v_domain,v_run);
    v_summary:=coalesce(v->'status_summary','{}'::jsonb);
    v_audit:=coalesce(v->'audit','{}'::jsonb);
    v_rank:=coalesce(v->'ranking','{}'::jsonb);
    v_total:=coalesce((v_summary->>'pass')::numeric,0)+coalesce((v_summary->>'warning')::numeric,0)+coalesce((v_summary->>'fail')::numeric,0)+coalesce((v_summary->>'not_applicable')::numeric,0)+coalesce((v_summary->>'not_verifiable')::numeric,0)+coalesce((v_summary->>'needs_connection')::numeric,0);
    v_observed:=coalesce((v_summary->>'pass')::numeric,0)+coalesce((v_summary->>'warning')::numeric,0)+coalesce((v_summary->>'fail')::numeric,0);
    v_atomic_cov:=case when v_total>0 then round(v_observed/v_total,4) else 0 end;
    v_prelim:=coalesce((v_dist->>'preliminary_axes')::int,0);
    v_ready:=coalesce((v_dist->>'ready_axes')::int,0);
    v_official:=coalesce((v_audit->>'official_score')::boolean,false) and coalesce((v_audit->>'ranking_eligible')::boolean,false);
    v_score_status:=case when v_official then 'official' when v_prelim>0 then 'provisional' else 'diagnostic' end;

    v_collector_cov:=v_rank->'metric_coverage';
    v_collector_observed:=v_rank->'observed_metrics';
    v_collector_active:=v_rank->'active_metrics';
    v_autonomous_overall:=v_rank->'overall_rank';
    v_autonomous_category:=v_rank->'category_rank';
    v_autonomous_percentile:=v_rank->'percentile';
    v_autonomous_previous:=v_rank->'previous_rank';
    v_autonomous_delta:=v_rank->'rank_delta';

    v_rank:=v_rank || jsonb_build_object(
      'score_status',v_score_status,
      'ranking_scope',case when v_official then 'official_competition' else 'autonomous_diagnostic' end,
      'official_competition_eligible',v_official,
      'autonomous_ranking_eligibility_status',v_rank->>'eligibility_status',
      'autonomous_overall_rank',v_autonomous_overall,
      'autonomous_category_rank',v_autonomous_category,
      'autonomous_percentile',v_autonomous_percentile,
      'autonomous_previous_rank',v_autonomous_previous,
      'autonomous_rank_delta',v_autonomous_delta,
      'collector_metric_coverage',v_collector_cov,
      'collector_observed_metrics',v_collector_observed,
      'collector_active_metrics',v_collector_active,
      'atomic_verification_coverage',v_atomic_cov,
      'ready_axes',v_ready,
      'preliminary_axes',v_prelim,
      'metric_coverage',v_atomic_cov,
      'observed_metrics',v_observed::int,
      'active_metrics',v_total::int,
      'eligibility_status',case when v_official then coalesce(v_rank->>'eligibility_status','eligible') else v_score_status end,
      'overall_rank',case when v_official then v_autonomous_overall else 'null'::jsonb end,
      'category_rank',case when v_official then v_autonomous_category else 'null'::jsonb end,
      'percentile',case when v_official then v_autonomous_percentile else 'null'::jsonb end,
      'previous_rank',case when v_official then v_autonomous_previous else 'null'::jsonb end,
      'rank_delta',case when v_official then v_autonomous_delta else 'null'::jsonb end
    );
    v:=jsonb_set(v,'{ranking}',v_rank,true);

    v_dist:=coalesce(v_dist,'{}'::jsonb) || jsonb_build_object(
      'score_status',v_score_status,
      'ranking_scope',case when v_official then 'official_competition' else 'autonomous_diagnostic' end,
      'official_competition_eligible',v_official,
      'autonomous_ranking_eligibility_status',v_dist->>'eligibility_status',
      'collector_metric_coverage',v_dist->'metric_coverage',
      'atomic_verification_coverage',v_atomic_cov,
      'metric_coverage',v_atomic_cov,
      'eligibility_status',case when v_official then coalesce(v_dist->>'eligibility_status','eligible') else v_score_status end,
      'disclosure',case when v_official then v_dist->>'disclosure' else 'Score provisório de diagnóstico autônomo. Não representa participação, colocação ou elegibilidade no ranking oficial. A cobertura global exibida usa checks atômicos verificados; a cobertura de sinais do coletor é informada separadamente.' end
    );

    v:=v||jsonb_build_object(
      'sales_architecture',sac.sales_architecture_summary(v_run),
      'ai_search',sac.ai_search_summary(v_run),
      'ai_analyst',sac.gcl_ai_enrichment_for_audit(v_run),
      'evidence_matrix',sac.audit_evidence_matrix(v_run),
      'metric_architecture',sac.audit_metric_architecture_v2(v_run),
      'competitive_mission',sac.competitive_mission_for_audit(v_run),
      'score_distribution',v_dist,
      'diagnostic_truth',jsonb_build_object(
        'score_status',v_score_status,'official_competition_eligible',v_official,
        'collector_metric_coverage',v_collector_cov,'atomic_verification_coverage',v_atomic_cov,
        'collector_observed_metrics',v_collector_observed,'collector_active_metrics',v_collector_active,
        'atomic_total',v_total,'atomic_observed',v_observed,'ready_axes',v_ready,'preliminary_axes',v_prelim,
        'disclosure','Cobertura de sinais do coletor e cobertura de verificação atômica usam denominadores diferentes. Elegibilidade no ranking autônomo interno não significa elegibilidade na competição oficial. Scores com eixos preliminares são diagnósticos provisórios.'
      )
    );
  end if;
  return v;
end;
$function$;
