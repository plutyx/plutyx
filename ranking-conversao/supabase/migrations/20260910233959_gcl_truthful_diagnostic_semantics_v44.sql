alter table sac.domains alter column country set default 'ZZ';

create or replace function sac.infer_domain_archetype_v1(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $$
declare
  v_domain uuid;
  v_pages int:=0;
  v_forms int:=0;
  v_service_pages int:=0;
  v_lead_pages int:=0;
  v_ecommerce_pages int:=0;
  v_saas_pages int:=0;
  v_article_pages int:=0;
  v_archetype text:='generic_web';
  v_conf numeric:=0.55;
begin
  select domain_id into v_domain from sac.audit_runs where id=p_audit_run_id;
  if v_domain is null then return jsonb_build_object('available',false,'reason','audit_not_found'); end if;

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
         coalesce(sum(coalesce((payload->'forms'->>'count')::int,0)),0)::int,
         count(*) filter(where lower(coalesce(payload->>'html','')) ~ '(marketing agency|sem agency|seo agency|digital marketing agency|our services|what we do|consultation|talk to an expert|work with us|request (?:a |for )?proposal|free marketing plan|contact us)')::int,
         count(*) filter(where lower(coalesce(payload->>'html','')) ~ '(free consultation|talk to an expert|work with us|request (?:a |for )?proposal|contact us|get started|book (?:a )?(?:call|demo)|schedule (?:a )?(?:call|demo)|free marketing plan)')::int,
         count(*) filter(where lower(coalesce(payload->>'html','')) ~ '(add to cart|/cart(?:/|[?"'' ])|/checkout(?:/|[?"'' ])|buy now|shopify|woocommerce|wc-ajax)')::int,
         count(*) filter(where lower(coalesce(payload->>'html','')) ~ '(free trial|start trial|/signup(?:/|[?"'' ])|/sign-up(?:/|[?"'' ])|/pricing(?:/|[?"'' ])|book a demo|request a demo)')::int
  into v_pages,v_forms,v_service_pages,v_lead_pages,v_ecommerce_pages,v_saas_pages
  from s;

  select count(*)::int into v_article_pages from sac.pages where audit_run_id=p_audit_run_id and page_type='article';

  if v_pages=0 then
    return jsonb_build_object('available',false,'reason','no_current_page_evidence');
  elsif v_ecommerce_pages>0 then
    v_archetype:='ecommerce';
    v_conf:=least(0.97,0.78 + 0.04*v_ecommerce_pages);
  elsif v_service_pages>0 and (v_lead_pages>0 or v_forms>0) then
    v_archetype:='lead_generation_service';
    v_conf:=least(0.98,0.82 + 0.03*least(v_service_pages,3) + 0.03*least(v_lead_pages,2) + case when v_forms>0 then 0.03 else 0 end);
  elsif v_saas_pages>0 then
    v_archetype:='saas';
    v_conf:=least(0.95,0.76 + 0.05*v_saas_pages);
  elsif v_article_pages>=greatest(2,ceil(v_pages/2.0)::int) then
    v_archetype:='content_publisher';
    v_conf:=0.82;
  end if;

  update sac.domains
     set detected_archetype=v_archetype,
         archetype_confidence=round(v_conf,3)
   where id=v_domain;

  return jsonb_build_object(
    'available',true,'archetype',v_archetype,'confidence',round(v_conf,3),
    'evidence',jsonb_build_object('sampled_current_pages',v_pages,'forms',v_forms,'service_pages',v_service_pages,'lead_cta_pages',v_lead_pages,'ecommerce_pages',v_ecommerce_pages,'saas_pages',v_saas_pages,'article_pages',v_article_pages),
    'methodology','GCL-ARCHETYPE-1.0',
    'disclosure','Archetype is inferred from current public page architecture and is not a statement about the company legal entity or revenue model.'
  );
end;
$$;

revoke all on function sac.infer_domain_archetype_v1(uuid) from public, anon, authenticated;
grant execute on function sac.infer_domain_archetype_v1(uuid) to service_role;

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
    case when v_mixed=0 then 'pass' else 'fail' end,0.98,'current_supabase_edge_v2',
    jsonb_build_object('pages_with_active_http_subresources',v_mixed,'sampled_pages',v_pages,'excluded_nonresource_http_namespaces',true),
    'Mixed content v2 checks active HTTP subresources only; namespace/profile links such as w3.org SVG and XFN are excluded.'
  );
  v_updates:=v_updates+sac.set_atomic_signal(
    p_audit_run_id,'security','mixed content',
    case when v_mixed=0 then 'pass' else 'fail' end,0.98,'current_supabase_edge_v2',
    jsonb_build_object('pages_with_active_http_subresources',v_mixed,'sampled_pages',v_pages,'excluded_nonresource_http_namespaces',true),
    'Mixed content v2 checks active HTTP subresources only; namespace/profile links such as w3.org SVG and XFN are excluded.'
  );
  return jsonb_build_object('updated',v_updates,'sampled_pages',v_pages,'pages_with_active_http_subresources',v_mixed,'methodology','GCL-MIXED-CONTENT-2.0');
end;
$$;

revoke all on function sac.evaluate_atomic_mixed_content_v2(uuid) from public, anon, authenticated;
grant execute on function sac.evaluate_atomic_mixed_content_v2(uuid) to service_role;

alter function sac.evaluate_atomic_current_static(uuid) rename to evaluate_atomic_current_static_legacy_v1;

create function sac.evaluate_atomic_current_static(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $$
declare
  v_base jsonb;
  v_mixed jsonb;
begin
  v_base:=sac.evaluate_atomic_current_static_legacy_v1(p_audit_run_id);
  v_mixed:=sac.evaluate_atomic_mixed_content_v2(p_audit_run_id);
  return coalesce(v_base,'{}'::jsonb) || jsonb_build_object('mixed_content_v2',v_mixed);
end;
$$;

revoke all on function sac.evaluate_atomic_current_static(uuid) from public, anon, authenticated;
grant execute on function sac.evaluate_atomic_current_static(uuid) to service_role;
revoke all on function sac.evaluate_atomic_current_static_legacy_v1(uuid) from public, anon, authenticated;
grant execute on function sac.evaluate_atomic_current_static_legacy_v1(uuid) to service_role;

create or replace function sac.sales_architecture_summary(p_audit_run_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'sac','public'
as $$
with m as (
 select metric_code,sum(coalesce(numeric_value,0)) total,max(coalesce(numeric_value,0)) max_value,max(confidence) confidence
 from sac.metric_observations where audit_run_id=p_audit_run_id and metric_code like 'M-SALES-%' group by metric_code
), c as (
 select coalesce(max(max_value) filter(where metric_code='M-SALES-OFFER-COMPONENTS'),0) components,
 coalesce(sum(total) filter(where metric_code='M-SALES-VIDEO-EMBEDS'),0) videos,
 coalesce(sum(total) filter(where metric_code='M-SALES-CHECKOUT-LINKS'),0) checkout_links,
 coalesce(sum(total) filter(where metric_code='M-SALES-UPSELL-PATHS'),0) upsell_paths,
 coalesce(sum(total) filter(where metric_code='M-SALES-WEBINAR-CHALLENGE-PATHS'),0) lead_funnel_paths,
 coalesce(sum(total) filter(where metric_code='M-SALES-PAYMENT-PLATFORMS'),0) payment_platforms,
 coalesce(sum(total) filter(where metric_code='M-SALES-GUARANTEE-MENTIONS'),0) guarantee_mentions,
 coalesce(sum(total) filter(where metric_code='M-SALES-BONUS-MENTIONS'),0) bonus_mentions,
 coalesce(sum(total) filter(where metric_code='M-SALES-TESTIMONIAL-MENTIONS'),0) proof_mentions,
 coalesce(max(max_value) filter(where metric_code='M-SALES-OBJECTION-FAQ'),0) objection_footprint,
 coalesce(max(max_value) filter(where metric_code='M-SALES-COUNTDOWN-FOOTPRINT'),0) countdown_footprint
 from m
), p as (
 select count(*)::int sampled_pages,
        coalesce(sum(coalesce((payload->'forms'->>'count')::int,0)),0)::int forms_observed,
        count(*) filter(where lower(coalesce(payload->>'html','')) ~ '(free consultation|talk to an expert|work with us|request (?:a |for )?proposal|contact us|get started|book (?:a )?(?:call|demo)|schedule (?:a )?(?:call|demo)|free marketing plan)')::int lead_cta_pages
 from (
   select distinct on ((payload->>'page_id')::uuid) payload
   from sac.source_snapshots
   where source='current_supabase_edge' and payload->>'audit_run_id'=p_audit_run_id::text and payload ? 'page_id'
   order by (payload->>'page_id')::uuid,fetched_at desc
 ) q
), d as (
 select d.detected_archetype,d.archetype_confidence
 from sac.audit_runs ar join sac.domains d on d.id=ar.domain_id where ar.id=p_audit_run_id
), x as (
 select c.*,p.*,
        coalesce(d.detected_archetype,
          case when c.checkout_links>0 or c.payment_platforms>0 then 'ecommerce'
               when p.lead_cta_pages>0 or p.forms_observed>0 then 'lead_generation_service'
               else 'generic_web' end) archetype,
        d.archetype_confidence
 from c cross join p cross join d
)
select jsonb_build_object(
 'methodology','GCL-SALES-1.1',
 'label',case when archetype='lead_generation_service' then 'Lead Generation / Service Conversion Architecture'
              when archetype='ecommerce' then 'Commerce Conversion Architecture'
              when archetype='saas' then 'SaaS Acquisition Architecture'
              else 'Revenue Architecture / Direct Response' end,
 'status','experimental_observed_readiness',
 'archetype',archetype,
 'archetype_confidence',archetype_confidence,
 'sampled_current_pages',sampled_pages,
 'forms_observed',forms_observed,
 'lead_cta_pages',lead_cta_pages,
 'offer_component_diversity',components,
 'readiness_100',round(least(100,case when archetype='lead_generation_service' then
      (case when lead_cta_pages>0 then 25 else 0 end)+
      (case when forms_observed>0 then 20 else 0 end)+
      (case when proof_mentions>0 then 25 else 0 end)+
      (case when objection_footprint>0 then 10 else 0 end)+
      (case when components>=3 then 10 else 0 end)
    else components/8.0*100 end),1),
 'checkout_applicability',case when archetype='lead_generation_service' then 'not_applicable' when archetype='ecommerce' then 'expected' else 'context_dependent' end,
 'video_embeds',videos,'checkout_links',checkout_links,'upsell_downsell_paths',upsell_paths,'lead_funnel_paths',lead_funnel_paths,
 'payment_platform_footprints',payment_platforms,'guarantee_mentions',guarantee_mentions,'bonus_mentions',bonus_mentions,'proof_mentions',proof_mentions,
 'objection_handling_footprint',objection_footprint>0,'countdown_footprint',countdown_footprint>0,
 'disclosure','Observed public architecture only. Readiness is archetype-aware: checkout/payment is not required for a lead-generation service site. Proof/guarantee counts are text footprints, not independent validation of business claims or conversion rate.'
) from x;
$$;

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

    v_rank:=v_rank || jsonb_build_object(
      'score_status',v_score_status,
      'ranking_scope',case when v_official then 'official_competition' else 'autonomous_diagnostic' end,
      'official_competition_eligible',v_official,
      'autonomous_ranking_eligibility_status',v_rank->>'eligibility_status',
      'collector_metric_coverage',v_rank->'metric_coverage',
      'atomic_verification_coverage',v_atomic_cov,
      'ready_axes',v_ready,
      'preliminary_axes',v_prelim
    );
    v:=jsonb_set(v,'{ranking}',v_rank,true);
    v_dist:=coalesce(v_dist,'{}'::jsonb) || jsonb_build_object(
      'score_status',v_score_status,
      'ranking_scope',case when v_official then 'official_competition' else 'autonomous_diagnostic' end,
      'official_competition_eligible',v_official,
      'autonomous_ranking_eligibility_status',v_dist->>'eligibility_status',
      'collector_metric_coverage',v_dist->'metric_coverage',
      'atomic_verification_coverage',v_atomic_cov
    );

    v:=v||jsonb_build_object(
      'sales_architecture',sac.sales_architecture_summary(v_run),
      'ai_search',sac.ai_search_summary(v_run),
      'evidence_matrix',sac.audit_evidence_matrix(v_run),
      'metric_architecture',sac.audit_metric_architecture_v2(v_run),
      'competitive_mission',sac.competitive_mission_for_audit(v_run),
      'score_distribution',v_dist,
      'diagnostic_truth',jsonb_build_object(
        'score_status',v_score_status,'official_competition_eligible',v_official,
        'collector_metric_coverage',v_rank->'metric_coverage','atomic_verification_coverage',v_atomic_cov,
        'atomic_total',v_total,'atomic_observed',v_observed,'ready_axes',v_ready,'preliminary_axes',v_prelim,
        'disclosure','Collector metric coverage measures distinct implemented signals observed. Atomic verification coverage measures checks with pass/warning/fail evidence. They are different denominators and must not be presented as the same coverage. Autonomous ranking eligibility is not official competition eligibility.'
      )
    );
  end if;
  return v;
end;
$$;

create or replace function public.sac_api_preview_status(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $$
declare
  v_base jsonb;
  v_extra jsonb;
  v_queue jsonb;
  v_run uuid;
  v_edge_pages int:=0;
  v_access_limited boolean:=false;
  v_archived boolean:=false;
begin
  v_base:=public.sac_api_preview_status_base_v1(p_token);
  if coalesce((v_base->>'found')::boolean,false) then
    v_extra:=public.sac_api_preview_enrichment(p_token);
    if coalesce((v_extra->>'available')::boolean,false) then
      v_run=(v_extra->>'audit_run_id')::uuid;
      v_base:=v_base || jsonb_build_object(
        'audit_run_id',v_extra->>'audit_run_id',
        'evidence_dashboard',v_extra->'evidence_dashboard',
        'priority_actions',v_extra->'priority_actions',
        'methodology_disclosure',v_extra->'methodology_disclosure'
      );
    else
      v_base:=v_base || jsonb_build_object('evidence_dashboard',jsonb_build_object('available',false,'reason',v_extra->>'reason'));
    end if;

    v_access_limited:=coalesce((v_base->'coverage'->>'access_limited')::boolean,false);
    v_archived:=coalesce((v_base->'coverage'->>'archived_site_content')::boolean,false);
    if v_run is not null then
      select count(distinct payload->>'page_id')::int into v_edge_pages
      from sac.source_snapshots
      where source='current_supabase_edge' and payload->>'audit_run_id'=v_run::text and payload ? 'page_id';
    end if;
    if v_access_limited and v_edge_pages>0 then
      v_base:=jsonb_set(v_base,'{content_source}',jsonb_build_object(
        'kind','current_edge_observation','current',true,'direct_worker_origin_access',false,'provider','Supabase Edge HTTP fetch',
        'sampled_pages',v_edge_pages,'worker_origin_access_limited',true,
        'disclosure','The primary browser worker was blocked by access controls, but current HTTP page evidence was collected independently from a Supabase Edge region. Browser-render evidence is not inferred from this fetch.'
      ),true);
    elsif v_access_limited and not v_archived then
      v_base:=jsonb_set(v_base,'{content_source}',jsonb_build_object(
        'kind','current_origin_unavailable','current',false,'direct_worker_origin_access',false,'worker_origin_access_limited',true,
        'disclosure','The primary worker was blocked and no usable current or archived content source was available at this stage.'
      ),true);
    end if;
    v_base:=v_base||jsonb_build_object('source_semantics',jsonb_build_object(
      'direct_worker_origin_access',not v_access_limited,
      'current_edge_pages',v_edge_pages,
      'archived_content',v_archived,
      'disclosure','Current edge HTTP observations, direct browser-worker observations, public provider measurements, and archived snapshots are separate evidence classes.'
    ));
    v_queue:=sac.scan_queue_position_v1(p_token);
    v_base:=v_base || jsonb_build_object('queue',v_queue);
  end if;
  return v_base;
end;
$$;