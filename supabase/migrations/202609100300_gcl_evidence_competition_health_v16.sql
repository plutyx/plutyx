create or replace function public.gcl_public_health()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','sac'
as $function$
declare
 p jsonb;
 v_live_products int:=0;
 v_test_products int:=0;
 v_webhook_ok boolean:=false;
begin
 p:=sac.ops_health_payload();
 select count(*) filter(where provider_environment='live' and checkout_url is not null and status='active')::int,
        count(*) filter(where provider_environment='test' and checkout_url is not null and status in('draft','active'))::int
 into v_live_products,v_test_products
 from sac.commercial_products;
 v_webhook_ok:=coalesce((p->'payments'->>'webhook_failed_15m')::int,0)=0;
 return jsonb_build_object(
   'status',p->>'status',
   'captured_at',p->'captured_at',
   'analysis_queue',public.gcl_scan_queue_health(),
   'payments',jsonb_build_object(
      'operational',v_live_products>0 and v_webhook_ok,
      'live_ready',v_live_products>0,
      'sandbox_operational',v_test_products>0 and v_webhook_ok,
      'live_products',v_live_products,
      'test_products',v_test_products,
      'webhook_healthy',v_webhook_ok,
      'disclosure',case when v_live_products>0 then 'Live checkout is enabled for at least one active commercial product.' else 'Payment integration is healthy in sandbox, but no active live checkout product is enabled yet.' end
   ),
   'ranking',jsonb_build_object('operational',coalesce((p->'ranking'->>'cache_age_seconds')::numeric,999999)<=300)
 );
end;$function$;

create or replace function sac.audit_evidence_matrix(p_audit_run_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'sac','public'
as $function$
with registry as (
  select mr.evidence_class,
         count(distinct mr.metric_code)::int registered,
         count(distinct mr.metric_code) filter(where mr.score_role='score_input')::int score_inputs,
         count(distinct mr.engine)::int engines
  from sac.metric_registry mr
  where coalesce(mr.status,'') <> 'deprecated'
  group by mr.evidence_class
), observed as (
  select mr.evidence_class,
         count(distinct mo.metric_code)::int observed,
         round(avg(coalesce(mo.confidence,0))::numeric,4) mean_confidence,
         count(distinct mr.engine)::int observed_engines
  from sac.metric_observations mo
  join sac.metric_registry mr on mr.metric_code=mo.metric_code
  where mo.audit_run_id=p_audit_run_id
  group by mr.evidence_class
), rows as (
  select r.evidence_class,r.registered,coalesce(o.observed,0) observed,
         greatest(r.registered-coalesce(o.observed,0),0)::int unlockable,
         r.score_inputs,r.engines,coalesce(o.observed_engines,0) observed_engines,
         case when r.registered>0 then round(coalesce(o.observed,0)::numeric/r.registered,4) else 0 end coverage,
         coalesce(o.mean_confidence,0) mean_confidence,
         case when r.evidence_class='first_party' then 'connect_account'
              when r.evidence_class='rum' then 'instrument_or_connect'
              when r.evidence_class='experiment' then 'connect_experiment'
              else 'autonomous' end acquisition_mode,
         r.evidence_class in ('first_party','rum','experiment') requires_customer_connection
  from registry r left join observed o using(evidence_class)
), engine_registry as (
  select mr.engine,
         count(distinct mr.metric_code)::int registered,
         count(distinct mr.metric_code) filter(where mr.evidence_class in ('first_party','rum','experiment'))::int connection_metrics,
         count(distinct mr.metric_code) filter(where mr.score_role='score_input')::int score_inputs
  from sac.metric_registry mr
  where coalesce(mr.status,'') <> 'deprecated'
  group by mr.engine
), engine_observed as (
  select mr.engine,count(distinct mo.metric_code)::int observed,
         round(avg(coalesce(mo.confidence,0))::numeric,4) mean_confidence
  from sac.metric_observations mo join sac.metric_registry mr on mr.metric_code=mo.metric_code
  where mo.audit_run_id=p_audit_run_id
  group by mr.engine
), engine_rows as (
  select r.engine,r.registered,coalesce(o.observed,0) observed,r.connection_metrics,r.score_inputs,o.mean_confidence,
         case when r.registered>0 then round(coalesce(o.observed,0)::numeric/r.registered,4) else 0 end coverage
  from engine_registry r left join engine_observed o using(engine)
), totals as (
  select sum(registered)::int registered,sum(observed)::int observed,sum(score_inputs)::int score_inputs from rows
)
select jsonb_build_object(
 'available',true,'audit_run_id',p_audit_run_id,
 'totals',(select jsonb_build_object('registered',registered,'observed',observed,'score_inputs',score_inputs,'coverage',case when registered>0 then round(observed::numeric/registered,4) else 0 end) from totals),
 'evidence_classes',coalesce((select jsonb_agg(to_jsonb(rows) order by case evidence_class when 'url_http' then 1 when 'browser_render' then 2 when 'lab' then 3 when 'public_dataset' then 4 when 'rum' then 5 when 'first_party' then 6 when 'experiment' then 7 else 8 end,evidence_class) from rows),'[]'::jsonb),
 'engines',coalesce((select jsonb_agg(to_jsonb(engine_rows) order by observed desc,registered desc,engine) from engine_rows),'[]'::jsonb),
 'disclosure','Observed means this audit materialized evidence for the metric. Missing evidence is not automatically a failure. First-party, RUM and experiment metrics may require a customer-authorized connection or site instrumentation.'
);
$function$;

create or replace function sac.competitive_mission_for_audit(p_audit_run_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'sac','public'
as $function$
declare
 v_domain uuid;
 v_category text;
 v_readiness jsonb;
 v_score numeric;
 v_tier text;
 v_rival record;
 v_official_count int:=0;
 v_projected_rank int;
 v_target numeric;
 v_target_name text;
 v_target_reason text;
 v_gap numeric;
 v_dimensions jsonb:='[]'::jsonb;
 v_defense record;
begin
 select ar.domain_id,d.category into v_domain,v_category
 from sac.audit_runs ar join sac.domains d on d.id=ar.domain_id
 where ar.id=p_audit_run_id;
 if v_domain is null then return jsonb_build_object('available',false,'reason','domain_not_found'); end if;
 v_readiness:=sac.autonomous_readiness_for_audit(p_audit_run_id);
 v_score:=nullif(v_readiness->>'score_100','')::numeric;
 v_tier:=v_readiness->>'tier';
 if v_score is null then
   return jsonb_build_object('available',false,'reason','score_not_available','eligibility_status',v_readiness->>'eligibility_status');
 end if;
 select count(*)::int into v_official_count
 from sac.autonomous_ranking_entries e join sac.domains d on d.id=e.domain_id
 where e.active and d.public_profile
   and exists(select 1 from sac.memberships m where m.domain_id=e.domain_id and m.status='active' and m.ranking_enabled);
 select e.domain_id,e.audit_run_id,e.score_100,e.tier,d.normalized_domain,d.company_name,d.category,
        1+(select count(*) from sac.autonomous_ranking_entries x join sac.domains dx on dx.id=x.domain_id
           where x.active and dx.public_profile and x.score_100>e.score_100
             and exists(select 1 from sac.memberships mx where mx.domain_id=x.domain_id and mx.status='active' and mx.ranking_enabled))::int official_rank
 into v_rival
 from sac.autonomous_ranking_entries e join sac.domains d on d.id=e.domain_id
 where e.active and e.domain_id<>v_domain and e.score_100>v_score and d.public_profile
   and exists(select 1 from sac.memberships m where m.domain_id=e.domain_id and m.status='active' and m.ranking_enabled)
 order by e.score_100 asc,e.evidence_confidence desc limit 1;
 select e.domain_id,e.audit_run_id,e.score_100,e.tier,d.normalized_domain,d.company_name
 into v_defense
 from sac.autonomous_ranking_entries e join sac.domains d on d.id=e.domain_id
 where e.active and e.domain_id<>v_domain and e.score_100<v_score and d.public_profile
   and exists(select 1 from sac.memberships m where m.domain_id=e.domain_id and m.status='active' and m.ranking_enabled)
 order by e.score_100 desc,e.evidence_confidence desc limit 1;
 select 1+count(*)::int into v_projected_rank
 from sac.autonomous_ranking_entries e join sac.domains d on d.id=e.domain_id
 where e.active and e.domain_id<>v_domain and e.score_100>v_score and d.public_profile
   and exists(select 1 from sac.memberships m where m.domain_id=e.domain_id and m.status='active' and m.ranking_enabled);
 if v_rival.domain_id is not null then
   v_target:=least(100,round(v_rival.score_100+0.1,1));
   v_target_name:='Ultrapassar '||coalesce(v_rival.company_name,v_rival.normalized_domain);
   v_target_reason:='overtake_rival';
   select coalesce(jsonb_agg(x order by (x->>'gap_to_rival')::numeric desc),'[]'::jsonb) into v_dimensions
   from (
     select jsonb_build_object('dimension_code',c.dimension_code,'label',xd.label,'current_score',round(coalesce(c.score_10,c.preliminary_score_10),2),'rival_score',round(coalesce(r.score_10,r.preliminary_score_10),2),'gap_to_rival',round(coalesce(r.score_10,r.preliminary_score_10)-coalesce(c.score_10,c.preliminary_score_10),2),'current_coverage',round(c.evidence_coverage,4),'rival_coverage',round(r.evidence_coverage,4)) x
     from sac.experience_dimension_scores c
     join sac.experience_dimension_scores r on r.audit_run_id=v_rival.audit_run_id and r.dimension_code=c.dimension_code
     join sac.experience_dimensions xd on xd.dimension_code=c.dimension_code
     where c.audit_run_id=p_audit_run_id and xd.group_code<>'composite'
       and coalesce(c.score_10,c.preliminary_score_10) is not null
       and coalesce(r.score_10,r.preliminary_score_10) is not null
       and coalesce(r.score_10,r.preliminary_score_10)>coalesce(c.score_10,c.preliminary_score_10)
     order by (coalesce(r.score_10,r.preliminary_score_10)-coalesce(c.score_10,c.preliminary_score_10)) desc limit 5
   ) q;
 else
   if v_score<60 then v_target:=60;v_target_name:='Building';
   elsif v_score<70 then v_target:=70;v_target_name:='Competitive';
   elsif v_score<80 then v_target:=80;v_target_name:='Advanced';
   elsif v_score<90 then v_target:=90;v_target_name:='Elite';
   else v_target:=least(100,ceil(v_score+2));v_target_name:='Personal best'; end if;
   v_target_reason:=case when v_official_count=0 then 'founding_season' else 'next_tier' end;
   select coalesce(jsonb_agg(x order by (x->>'current_score')::numeric asc),'[]'::jsonb) into v_dimensions
   from (
     select jsonb_build_object('dimension_code',eds.dimension_code,'label',xd.label,'current_score',round(coalesce(eds.score_10,eds.preliminary_score_10),2),'current_coverage',round(eds.evidence_coverage,4),'effective_confidence',round(eds.effective_confidence,4)) x
     from sac.experience_dimension_scores eds join sac.experience_dimensions xd on xd.dimension_code=eds.dimension_code
     where eds.audit_run_id=p_audit_run_id and xd.group_code<>'composite' and coalesce(eds.score_10,eds.preliminary_score_10) is not null
     order by coalesce(eds.score_10,eds.preliminary_score_10) asc,eds.evidence_coverage desc limit 5
   ) q;
 end if;
 v_gap:=greatest(0,round(v_target-v_score,1));
 return jsonb_build_object(
   'available',true,
   'mode',case when v_rival.domain_id is not null then 'rival_chase' when v_official_count=0 then 'founding_season' else 'tier_chase' end,
   'current_score',v_score,'current_tier',v_tier,'official_participants',v_official_count,'projected_official_rank',v_projected_rank,
   'target_score',v_target,'target_name',v_target_name,'target_reason',v_target_reason,'points_to_target',v_gap,
   'rival',case when v_rival.domain_id is null then null else jsonb_build_object('domain',v_rival.normalized_domain,'company_name',v_rival.company_name,'score',v_rival.score_100,'tier',v_rival.tier,'official_rank',v_rival.official_rank,'category',v_rival.category,'points_ahead',round(v_rival.score_100-v_score,1)) end,
   'defense',case when v_defense.domain_id is null then null else jsonb_build_object('domain',v_defense.normalized_domain,'company_name',v_defense.company_name,'score',v_defense.score_100,'tier',v_defense.tier,'points_behind',round(v_score-v_defense.score_100,1)) end,
   'dimension_missions',v_dimensions,
   'disclosure','Competitive missions use the audited GCL technical score and currently active public ranking members. A purchase never changes score; only a new audit with stronger evidence can do that.'
 );
end;$function$;

create or replace function public.sac_api_deep_report(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare v jsonb;v_run uuid;begin
  v:=public.sac_api_deep_report_core(p_token);
  if coalesce((v->>'found')::boolean,false) then
    v_run:=(v->>'audit_run_id')::uuid;
    v:=v||jsonb_build_object(
      'sales_architecture',sac.sales_architecture_summary(v_run),
      'ai_search',sac.ai_search_summary(v_run),
      'evidence_matrix',sac.audit_evidence_matrix(v_run),
      'competitive_mission',sac.competitive_mission_for_audit(v_run)
    );
  end if;
  return v;
end;$function$;
