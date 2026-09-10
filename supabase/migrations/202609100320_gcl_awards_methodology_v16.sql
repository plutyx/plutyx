update sac.award_definitions set label='GCL Nominee',description='Site com inscrição válida, domínio verificado e auditoria elegível para a temporada.' where award_code='SAC_NOMINEE';
update sac.award_definitions set threshold=80 where award_code='CONVERSION_EXCELLENCE' and threshold>100;
update sac.award_definitions set requires_active_membership=false where award_code in('SAC_NOMINEE','EXPERIENCE_EXCELLENCE','DEVELOPER_EXCELLENCE','CONVERSION_EXCELLENCE','MOBILE_EXCELLENCE','ACCESSIBILITY_EXCELLENCE','PERFORMANCE_EXCELLENCE');
update sac.award_definitions set requires_active_membership=true where award_code in('TOP_100','TOP_10','SITE_OF_MONTH','SITE_OF_YEAR');

create or replace function public.gcl_awards_methodology()
returns jsonb language sql stable security definer set search_path to 'public','sac' as $function$
select jsonb_build_object(
 'version','GCA-2026.1',
 'season',jsonb_build_object('season_code',s.season_code,'name',s.name,'status',s.status,'starts_at',s.starts_at,'submissions_open_at',s.submissions_open_at,'submissions_close_at',s.submissions_close_at,'community_voting_open_at',s.community_voting_open_at,'community_voting_close_at',s.community_voting_close_at,'awards_at',s.awards_at),
 'entry',jsonb_build_object('product_code',p.product_code,'price',p.price,'currency',p.currency,'payment_type','one_time','verified_domain_required',true,'analysis_required',true,'ranking_membership_required_to_submit',false,'disclosure','Awards entry and Ranking membership are separate products. Paying the entry fee makes a site eligible to submit; it does not buy an award or ranking position.'),
 'technical_track',jsonb_build_object('scale','0-100 GCL technical score plus 0-10 evidence-backed dimensions','separate_from_jury',true,'separate_from_community_votes',true,'dimensions',jsonb_build_array('Design','Usability','Creativity','Content','Semantics / SEO','Animations / Transitions','Accessibility','WPO','Responsive Design','Markup / Metadata','Conversion Readiness')),
 'jury_track',jsonb_build_object('scale','0-10','minimum_jury_votes_for_featured_decision',3,'weights',jsonb_build_object('conversion_clarity',0.30,'user_experience',0.25,'technical_execution',0.20,'trust_persuasion',0.15,'originality',0.10),'disclosure','Jury scoring is editorial and does not modify the GCL technical score or official ranking position.'),
 'community_track',jsonb_build_object('one_vote_per_member_per_entry',true,'self_vote_allowed',false,'active_community_membership_required',true,'disclosure','Community votes are a separate popularity/reputation signal and do not modify the GCL technical score.'),
 'award_catalog',(select coalesce(jsonb_agg(jsonb_build_object('award_code',ad.award_code,'label',ad.label,'family',ad.award_family,'description',ad.description,'score_source',ad.score_source,'threshold',ad.threshold,'minimum_coverage',ad.minimum_coverage,'requires_ranking_membership',ad.requires_active_membership,'rank_ceiling',ad.rank_ceiling,'period_scope',ad.period_scope,'badge_style',ad.badge_style) order by ad.display_order),'[]'::jsonb) from sac.award_definitions ad where ad.active)
) from sac.award_seasons s left join sac.commercial_products p on p.product_code='sac_awards_entry_2026' where s.season_code='GCL-2026' limit 1;
$function$;

create or replace function public.gcl_awards_nominees(p_category text default null::text,p_limit integer default 50)
returns jsonb language sql stable security definer set search_path to 'public','sac' as $function$
select coalesce(jsonb_agg(to_jsonb(x) order by x.featured desc,x.community_votes desc,x.jury_weighted_score desc nulls last,x.score_100 desc nulls last,x.submitted_at desc),'[]'::jsonb)
from (
 select e.id,e.public_slug,e.season_code,e.category,e.technology_tags,e.submission_story,e.submitted_at,e.featured,d.id domain_id,d.normalized_domain,d.company_name,d.detected_archetype,r.score_100,r.overall_rank,r.metric_coverage,r.evidence_confidence,r.tier,
 (select count(*)::int from sac.award_entry_votes v where v.entry_id=e.id) community_votes,
 (select round(avg(j.conversion_clarity*.30+j.user_experience*.25+j.technical_execution*.20+j.trust_persuasion*.15+j.originality*.10),2) from sac.award_jury_scores j where j.entry_id=e.id) jury_weighted_score,
 (select round(avg(j.conversion_clarity*.30+j.user_experience*.25+j.technical_execution*.20+j.trust_persuasion*.15+j.originality*.10),2) from sac.award_jury_scores j where j.entry_id=e.id) jury_average,
 (select jsonb_build_object('conversion_clarity',round(avg(j.conversion_clarity),2),'user_experience',round(avg(j.user_experience),2),'technical_execution',round(avg(j.technical_execution),2),'trust_persuasion',round(avg(j.trust_persuasion),2),'originality',round(avg(j.originality),2),'votes',count(*)::int) from sac.award_jury_scores j where j.entry_id=e.id) jury_breakdown,
 (select count(*)::int from sac.award_jury_scores j where j.entry_id=e.id) jury_votes
 from sac.awards_entries e join sac.domains d on d.id=e.domain_id left join sac.autonomous_ranking_entries r on r.domain_id=d.id
 where e.season_code='GCL-2026' and e.status='submitted' and e.nomination_status='nominee' and (p_category is null or e.category=p_category)
 order by e.featured desc,community_votes desc,jury_weighted_score desc nulls last,r.score_100 desc nulls last,e.submitted_at desc limit greatest(1,least(coalesce(p_limit,50),100))
) x;
$function$;

create or replace function public.gcl_awards_entry_detail(p_slug text)
returns jsonb language sql stable security definer set search_path to 'public','sac' as $function$
select to_jsonb(x) from (
 select e.id,e.public_slug,e.season_code,e.category,e.technology_tags,e.submission_story,e.submitted_at,e.featured,d.normalized_domain,d.company_name,d.detected_archetype,d.current_score,d.current_tier,r.score_100,r.overall_rank,r.metric_coverage,r.evidence_confidence,r.tier,
 (select count(*)::int from sac.award_entry_votes v where v.entry_id=e.id) community_votes,
 (select round(avg(j.conversion_clarity*.30+j.user_experience*.25+j.technical_execution*.20+j.trust_persuasion*.15+j.originality*.10),2) from sac.award_jury_scores j where j.entry_id=e.id) jury_weighted_score,
 (select round(avg(j.conversion_clarity*.30+j.user_experience*.25+j.technical_execution*.20+j.trust_persuasion*.15+j.originality*.10),2) from sac.award_jury_scores j where j.entry_id=e.id) jury_average,
 (select jsonb_build_object('conversion_clarity',round(avg(j.conversion_clarity),2),'user_experience',round(avg(j.user_experience),2),'technical_execution',round(avg(j.technical_execution),2),'trust_persuasion',round(avg(j.trust_persuasion),2),'originality',round(avg(j.originality),2),'votes',count(*)::int) from sac.award_jury_scores j where j.entry_id=e.id) jury_breakdown,
 (select jsonb_agg(jsonb_build_object('label',ad.label,'award_code',a.award_code,'issued_at',a.issued_at,'verification_code',a.verification_code)) from sac.awards a join sac.award_definitions ad on ad.award_code=a.award_code where a.domain_id=e.domain_id and a.status='active') awards,
 public.gcl_awards_methodology() methodology
 from sac.awards_entries e join sac.domains d on d.id=e.domain_id left join sac.autonomous_ranking_entries r on r.domain_id=d.id where e.public_slug=p_slug and e.status='submitted' and e.nomination_status='nominee' limit 1
) x;
$function$;
