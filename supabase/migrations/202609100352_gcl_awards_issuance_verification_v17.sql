-- Global Conversion Awards v17: automated evidence-bound issuance + public verification.
alter table sac.award_definitions drop constraint if exists award_definitions_award_family_check;
alter table sac.award_definitions add constraint award_definitions_award_family_check check (award_family = any(array['participation','experience','developer','conversion','ranking','special','jury','community']::text[]));

insert into sac.award_definitions(award_code,label,award_family,description,score_source,threshold,minimum_coverage,requires_official_score,requires_active_membership,rank_ceiling,period_scope,badge_style,verification_required,display_order,active,metadata)
values
('JURY_CHOICE','Jury Choice','jury','Reconhecimento editorial da temporada com base na avaliação ponderada do júri.','jury_weighted_score',null,0.50,false,false,null,'year','jury',true,120,true,jsonb_build_object('track','jury','minimum_jury_votes',3,'weights',jsonb_build_object('conversion_clarity',0.30,'user_experience',0.25,'technical_execution',0.20,'trust_persuasion',0.15,'originality',0.10),'conversion_score_effect',false)),
('COMMUNITY_CHOICE','Community Choice','community','Reconhecimento da candidatura mais apoiada pela comunidade ativa durante a janela oficial de votação.','community_votes',null,0.50,false,false,null,'year','community',true,130,true,jsonb_build_object('track','community','one_vote_per_member',true,'self_vote_allowed',false,'conversion_score_effect',false))
on conflict(award_code) do update set label=excluded.label,award_family=excluded.award_family,description=excluded.description,score_source=excluded.score_source,minimum_coverage=excluded.minimum_coverage,requires_active_membership=excluded.requires_active_membership,period_scope=excluded.period_scope,badge_style=excluded.badge_style,metadata=excluded.metadata,active=true;

update sac.award_definitions set metadata=metadata||jsonb_build_object('automatic_issuance',false,'reason','Monthly period snapshots are not yet materialized independently from the current official ranking.') where award_code='SITE_OF_MONTH';

create or replace function sac.issue_award_once(p_domain_id uuid,p_award_code text,p_season_code text,p_score numeric,p_rank integer,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path='sac','public','extensions' as $function$
declare v_id uuid; v_code text;
begin
 select id into v_id from sac.awards where domain_id=p_domain_id and award_code=p_award_code and season_code=p_season_code limit 1;
 if v_id is not null then return v_id; end if;
 v_code:='GCL-'||upper(substr(p_season_code,5,4))||'-'||upper(encode(extensions.gen_random_bytes(7),'hex'));
 insert into sac.awards(domain_id,award_code,season_code,score,rank_value,verification_code,status,metadata)
 values(p_domain_id,p_award_code,p_season_code,p_score,p_rank,v_code,'active',coalesce(p_snapshot,'{}'::jsonb))
 on conflict(domain_id,award_code,season_code) do nothing returning id into v_id;
 if v_id is null then select id into v_id from sac.awards where domain_id=p_domain_id and award_code=p_award_code and season_code=p_season_code limit 1; end if;
 return v_id;
end;$function$;
revoke all on function sac.issue_award_once(uuid,text,text,numeric,integer,jsonb) from public,anon,authenticated;
grant execute on function sac.issue_award_once(uuid,text,text,numeric,integer,jsonb) to service_role;

create or replace function public.gcl_award_verify(p_code text)
returns jsonb language sql stable security definer set search_path='public','sac' as $function$
select to_jsonb(x) from (
 select a.verification_code,a.status,(a.status='active') valid,a.award_code,d.label,d.award_family,d.description,d.badge_style,a.season_code,a.score,a.rank_value,a.issued_at,a.expires_at,
   dom.normalized_domain,dom.company_name,dom.category,a.metadata->>'track' track,a.metadata->>'methodology_version' methodology_version,
   nullif(a.metadata->>'score_100','')::numeric score_100,nullif(a.metadata->>'metric_coverage','')::numeric metric_coverage,
   nullif(a.metadata->>'evidence_confidence','')::numeric evidence_confidence,nullif(a.metadata->>'dimension_code','') dimension_code,
   nullif(a.metadata->>'dimension_coverage','')::numeric dimension_coverage,a.metadata->>'public_slug' nominee_slug,
   case when a.status='active' then 'Verified award issued by Global Conversion League.' when a.status='revoked' then 'This award was revoked and is no longer valid.' else 'This award is historical and is no longer active.' end verification_message,
   'Award verification confirms the recorded GCL decision and evidence snapshot at issuance. It does not guarantee future conversion rate, revenue or unchanged site quality.' disclosure
 from sac.awards a join sac.award_definitions d on d.award_code=a.award_code join sac.domains dom on dom.id=a.domain_id
 where upper(a.verification_code)=upper(trim(p_code)) limit 1
) x;
$function$;
grant execute on function public.gcl_award_verify(text) to anon,authenticated,service_role;

create or replace function sac.reconcile_awards(p_season_code text default 'GCL-2026')
returns jsonb language plpgsql security definer set search_path='sac','public' as $function$
declare s sac.award_seasons%rowtype; rec record; ad sac.award_definitions%rowtype; dim sac.experience_dimension_scores%rowtype; v_id uuid; v_before int:=0; v_after int:=0; v_winner_domain uuid; v_winner_score numeric; v_winner_votes int;
begin
 select * into s from sac.award_seasons where season_code=p_season_code limit 1;
 if s.season_code is null then raise exception 'award_season_not_found'; end if;
 select count(*)::int into v_before from sac.awards where season_code=p_season_code;

 for rec in select e.id entry_id,e.domain_id,e.public_slug,e.category,e.submitted_at,ar.audit_run_id,ar.methodology_version,ar.score_100,ar.metric_coverage,ar.evidence_confidence,ar.eligibility_status,ar.tier from sac.awards_entries e join sac.autonomous_ranking_entries ar on ar.domain_id=e.domain_id where e.season_code=p_season_code and e.status='submitted' and e.nomination_status='nominee' and ar.active loop
   for ad in select * from sac.award_definitions where active and award_code in('SAC_NOMINEE','CONVERSION_EXCELLENCE') loop
     if rec.score_100 is not null and rec.metric_coverage>=ad.minimum_coverage and rec.eligibility_status='eligible' and (ad.threshold is null or rec.score_100>=ad.threshold) then
       v_id:=sac.issue_award_once(rec.domain_id,ad.award_code,p_season_code,rec.score_100,null,jsonb_build_object('track','technical','audit_run_id',rec.audit_run_id,'methodology_version',rec.methodology_version,'score_100',rec.score_100,'metric_coverage',rec.metric_coverage,'evidence_confidence',rec.evidence_confidence,'tier',rec.tier,'entry_id',rec.entry_id,'public_slug',rec.public_slug,'criterion',jsonb_build_object('score_source',ad.score_source,'threshold',ad.threshold,'minimum_coverage',ad.minimum_coverage),'issued_by','gcl_awards_reconciler_v17_3'));
     end if;
   end loop;
   for ad in select * from sac.award_definitions where active and award_code in('EXPERIENCE_EXCELLENCE','DEVELOPER_EXCELLENCE','MOBILE_EXCELLENCE','ACCESSIBILITY_EXCELLENCE','PERFORMANCE_EXCELLENCE') loop
     dim:=null; select * into dim from sac.experience_dimension_scores where audit_run_id=rec.audit_run_id and dimension_code=ad.score_source limit 1;
     if dim.audit_run_id is not null and dim.score_10 is not null and dim.evidence_coverage>=ad.minimum_coverage and (ad.threshold is null or dim.score_10>=ad.threshold) then
       v_id:=sac.issue_award_once(rec.domain_id,ad.award_code,p_season_code,dim.score_10,null,jsonb_build_object('track','technical_dimension','audit_run_id',rec.audit_run_id,'methodology_version',rec.methodology_version,'dimension_code',ad.score_source,'score_10',dim.score_10,'dimension_coverage',dim.evidence_coverage,'effective_confidence',dim.effective_confidence,'overall_score_100',rec.score_100,'overall_metric_coverage',rec.metric_coverage,'entry_id',rec.entry_id,'public_slug',rec.public_slug,'criterion',jsonb_build_object('threshold',ad.threshold,'minimum_dimension_coverage',ad.minimum_coverage),'issued_by','gcl_awards_reconciler_v17_3'));
     end if;
   end loop;
 end loop;

 for rec in with official as(select ar.domain_id,ar.audit_run_id,ar.methodology_version,ar.score_100,ar.metric_coverage,ar.evidence_confidence,ar.tier,row_number() over(order by ar.score_100 desc nulls last,ar.evidence_confidence desc,dom.normalized_domain)::int official_rank from sac.autonomous_ranking_entries ar join sac.domains dom on dom.id=ar.domain_id where ar.active and ar.eligibility_status='eligible' and dom.public_profile and exists(select 1 from sac.memberships m where m.domain_id=ar.domain_id and m.status='active' and m.ranking_enabled and (m.current_period_end is null or m.current_period_end>now()))) select e.id entry_id,e.domain_id,e.public_slug,o.audit_run_id,o.methodology_version,o.score_100,o.metric_coverage,o.evidence_confidence,o.tier,o.official_rank from sac.awards_entries e join official o on o.domain_id=e.domain_id where e.season_code=p_season_code and e.status='submitted' and e.nomination_status='nominee' loop
   for ad in select * from sac.award_definitions where active and award_code in('TOP_100','TOP_10') loop
     if rec.metric_coverage>=ad.minimum_coverage and rec.official_rank<=ad.rank_ceiling then v_id:=sac.issue_award_once(rec.domain_id,ad.award_code,p_season_code,rec.score_100,rec.official_rank,jsonb_build_object('track','official_ranking','audit_run_id',rec.audit_run_id,'methodology_version',rec.methodology_version,'score_100',rec.score_100,'metric_coverage',rec.metric_coverage,'evidence_confidence',rec.evidence_confidence,'official_rank',rec.official_rank,'entry_id',rec.entry_id,'public_slug',rec.public_slug,'membership_required',true,'issued_by','gcl_awards_reconciler_v17_3')); end if;
   end loop;
   if now()>=s.awards_at and rec.official_rank=1 and rec.metric_coverage>=0.90 then v_id:=sac.issue_award_once(rec.domain_id,'SITE_OF_YEAR',p_season_code,rec.score_100,rec.official_rank,jsonb_build_object('track','season_final','audit_run_id',rec.audit_run_id,'methodology_version',rec.methodology_version,'score_100',rec.score_100,'metric_coverage',rec.metric_coverage,'evidence_confidence',rec.evidence_confidence,'official_rank',rec.official_rank,'entry_id',rec.entry_id,'public_slug',rec.public_slug,'season_closed_at',s.awards_at,'issued_by','gcl_awards_reconciler_v17_3')); end if;
 end loop;

 if now()>=s.awards_at then
   v_winner_domain:=null; v_winner_score:=null;
   select x.domain_id,x.weighted_score into v_winner_domain,v_winner_score from (select e.domain_id,round(avg(j.conversion_clarity*0.30+j.user_experience*0.25+j.technical_execution*0.20+j.trust_persuasion*0.15+j.originality*0.10),3) weighted_score,count(*) jury_votes,coalesce(ar.score_100,0) technical_score from sac.awards_entries e join sac.award_jury_scores j on j.entry_id=e.id left join sac.autonomous_ranking_entries ar on ar.domain_id=e.domain_id where e.season_code=p_season_code and e.status='submitted' and e.nomination_status='nominee' group by e.domain_id,ar.score_100 having count(*)>=3 order by weighted_score desc,technical_score desc,e.domain_id limit 1)x;
   if v_winner_domain is not null then v_id:=sac.issue_award_once(v_winner_domain,'JURY_CHOICE',p_season_code,v_winner_score,null,jsonb_build_object('track','jury','weighted_score',v_winner_score,'weights',jsonb_build_object('conversion_clarity',0.30,'user_experience',0.25,'technical_execution',0.20,'trust_persuasion',0.15,'originality',0.10),'minimum_jury_votes',3,'season_closed_at',s.awards_at,'issued_by','gcl_awards_reconciler_v17_3')); end if;
   v_winner_domain:=null; v_winner_votes:=null;
   select x.domain_id,x.votes into v_winner_domain,v_winner_votes from (select e.domain_id,count(v.user_id)::int votes,coalesce(ar.score_100,0) technical_score from sac.awards_entries e join sac.award_entry_votes v on v.entry_id=e.id left join sac.autonomous_ranking_entries ar on ar.domain_id=e.domain_id where e.season_code=p_season_code and e.status='submitted' and e.nomination_status='nominee' group by e.domain_id,ar.score_100 having count(v.user_id)>0 order by votes desc,technical_score desc,e.domain_id limit 1)x;
   if v_winner_domain is not null then v_id:=sac.issue_award_once(v_winner_domain,'COMMUNITY_CHOICE',p_season_code,v_winner_votes,null,jsonb_build_object('track','community','community_votes',v_winner_votes,'one_vote_per_member',true,'self_vote_allowed',false,'season_closed_at',s.awards_at,'issued_by','gcl_awards_reconciler_v17_3')); end if;
 end if;

 select count(*)::int into v_after from sac.awards where season_code=p_season_code;
 if v_after<>v_before then delete from sac.public_payload_cache where cache_key='home'; end if;
 return jsonb_build_object('season_code',p_season_code,'processed_at',now(),'submitted_nominees',(select count(*) from sac.awards_entries where season_code=p_season_code and status='submitted' and nomination_status='nominee'),'active_awards',(select count(*) from sac.awards where season_code=p_season_code and status='active'),'new_awards',greatest(0,v_after-v_before),'site_of_month_automatic',false);
end;$function$;
revoke all on function sac.reconcile_awards(text) from public,anon,authenticated;
grant execute on function sac.reconcile_awards(text) to service_role;

create or replace function sac.build_public_home_payload(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='sac','public' as $function$
declare v jsonb; v_source_id uuid; v_http_ok int:=0; v_processed int:=0; v_awards int:=0;
begin
 v:=sac.build_public_home_payload_core(p_limit);
 select id,coalesce(audited_count,0) into v_source_id,v_processed from sac.benchmark_sources order by created_at desc limit 1;
 if v_source_id is not null then select count(*)::int into v_http_ok from sac.benchmark_results where source_id=v_source_id and http_status between 200 and 399; end if;
 select count(*)::int into v_awards from sac.awards where status='active';
 v:=jsonb_set(v,'{stats,benchmark_http_successful}',to_jsonb(v_http_ok),true);
 v:=jsonb_set(v,'{stats,awards_issued}',to_jsonb(v_awards),true);
 v:=jsonb_set(v,'{benchmark_story,http_successful_audits}',to_jsonb(v_http_ok),true);
 v:=jsonb_set(v,'{benchmark_story,claim_10k_success_ready}',to_jsonb(v_http_ok>10000),true);
 v:=jsonb_set(v,'{benchmark_story,safe_headline}',to_jsonb(case when v_http_ok>10000 then 'Metodologia construída sobre mais de 10.000 respostas HTTP válidas analisadas pelo GCL Intelligence.' else format('GCL Intelligence: %s URLs processadas; %s respostas HTTP 2xx/3xx válidas.',v_processed,v_http_ok) end),true);
 v:=jsonb_set(v,'{benchmark_story,success_definition}',to_jsonb('HTTP 2xx/3xx com HTML público coletável; jobs concluídos com status HTTP de erro não contam para a headline de 10.000+.'::text),true);
 return v;
end;$function$;

delete from sac.public_payload_cache where cache_key='home';
do $block$ declare j record; begin for j in select jobid from cron.job where jobname='gcl-awards-reconcile-hourly' loop perform cron.unschedule(j.jobid); end loop; end $block$;
select cron.schedule('gcl-awards-reconcile-hourly','17 * * * *',$cmd$select sac.reconcile_awards('GCL-2026');$cmd$);