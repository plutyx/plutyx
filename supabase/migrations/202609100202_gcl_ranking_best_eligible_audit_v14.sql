create or replace function sac.refresh_autonomous_ranking()
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare rec record; v_prev int; v_upserts int:=0; v_active int:=0;
begin
  for rec in
    with recent as (
      select ar.id audit_run_id,ar.domain_id,ar.methodology_version,ar.completed_at,
             row_number() over(partition by ar.domain_id order by ar.completed_at desc,ar.created_at desc) rn
      from sac.audit_runs ar
      where ar.status='completed' and ar.completed_at is not null
        and exists(select 1 from sac.metric_observations mo where mo.audit_run_id=ar.id)
    ), calculated as (
      select r.*,sac.autonomous_readiness_for_audit(r.audit_run_id) calc
      from recent r where r.rn<=12
    ), chosen as (
      select distinct on (domain_id) audit_run_id,domain_id,methodology_version,completed_at,calc
      from calculated
      order by domain_id,
        ((calc->>'eligibility_status')='eligible') desc,
        case when (calc->>'eligibility_status')='eligible' then completed_at end desc nulls last,
        coalesce((calc->>'metric_coverage')::numeric,0) desc,
        coalesce((calc->>'observed_metrics')::int,0) desc,
        coalesce((calc->>'evidence_confidence')::numeric,0) desc,
        completed_at desc
    ) select * from chosen
  loop
    select overall_rank into v_prev from sac.autonomous_ranking_entries where domain_id=rec.domain_id;
    insert into sac.autonomous_ranking_entries(
      domain_id,audit_run_id,methodology_version,score_100,raw_score_100,metric_coverage,observed_metrics,active_metrics,
      evidence_confidence,observed_atomic,dimensions_used,tier,eligibility_status,previous_rank,active,calculated_at
    ) values (
      rec.domain_id,rec.audit_run_id,coalesce(rec.methodology_version,'GCL-1.0'),nullif(rec.calc->>'score_100','')::numeric,
      nullif(rec.calc->>'raw_score_100','')::numeric,coalesce((rec.calc->>'metric_coverage')::numeric,0),coalesce((rec.calc->>'observed_metrics')::int,0),
      coalesce((rec.calc->>'active_metrics')::int,0),coalesce((rec.calc->>'evidence_confidence')::numeric,0),coalesce((rec.calc->>'observed_atomic')::int,0),
      coalesce((rec.calc->>'dimensions_used')::int,0),rec.calc->>'tier',rec.calc->>'eligibility_status',v_prev,(rec.calc->>'eligibility_status')='eligible',now()
    )
    on conflict(domain_id) do update set previous_rank=sac.autonomous_ranking_entries.overall_rank,audit_run_id=excluded.audit_run_id,
      methodology_version=excluded.methodology_version,score_100=excluded.score_100,raw_score_100=excluded.raw_score_100,
      metric_coverage=excluded.metric_coverage,observed_metrics=excluded.observed_metrics,active_metrics=excluded.active_metrics,
      evidence_confidence=excluded.evidence_confidence,observed_atomic=excluded.observed_atomic,dimensions_used=excluded.dimensions_used,
      tier=excluded.tier,eligibility_status=excluded.eligibility_status,active=excluded.active,calculated_at=now();
    v_upserts:=v_upserts+1;
  end loop;

  with ranked as (
    select e.domain_id,
           row_number() over(order by e.score_100 desc nulls last,e.metric_coverage desc,e.evidence_confidence desc,e.calculated_at asc)::int rn,
           round((cume_dist() over(order by e.score_100 asc nulls first,e.metric_coverage asc,e.evidence_confidence asc)*100)::numeric,1) pct
    from sac.autonomous_ranking_entries e where e.active
  )
  update sac.autonomous_ranking_entries e set overall_rank=ranked.rn,percentile=ranked.pct,
    rank_delta=case when e.previous_rank is null then 0 else e.previous_rank-ranked.rn end
  from ranked where ranked.domain_id=e.domain_id;

  with cat_ranked as (
    select e.domain_id,row_number() over(partition by coalesce(nullif(d.category,''),nullif(d.detected_archetype,''),'unclassified') order by e.score_100 desc nulls last,e.metric_coverage desc,e.evidence_confidence desc)::int cr
    from sac.autonomous_ranking_entries e join sac.domains d on d.id=e.domain_id where e.active
  )
  update sac.autonomous_ranking_entries e set category_rank=cat_ranked.cr from cat_ranked where cat_ranked.domain_id=e.domain_id;

  update sac.autonomous_ranking_entries set overall_rank=null,category_rank=null,percentile=null,rank_delta=null where not active;
  insert into sac.autonomous_ranking_history(domain_id,audit_run_id,score_100,metric_coverage,evidence_confidence,overall_rank,percentile,tier,recorded_at)
  select domain_id,audit_run_id,score_100,metric_coverage,evidence_confidence,overall_rank,percentile,tier,calculated_at from sac.autonomous_ranking_entries
  on conflict(audit_run_id) do nothing;
  select count(*)::int into v_active from sac.autonomous_ranking_entries where active;
  return jsonb_build_object(
    'refreshed',v_upserts,'active_ranked',v_active,'generated_at',now(),
    'selection_policy','latest eligible audit; otherwise best-evidence audit among the 12 most recent completed runs',
    'percentile_semantics','higher is better; 100 means at or above all scored peers in the current autonomous cohort'
  );
end;
$function$;
