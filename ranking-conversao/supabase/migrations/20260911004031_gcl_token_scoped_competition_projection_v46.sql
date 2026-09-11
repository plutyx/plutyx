create or replace function public.sac_api_competition_context(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $$
declare
  v_run uuid;
  v_domain uuid;
  v_calc jsonb;
  v_score numeric;
  v_eligible boolean:=false;
  v_participant boolean:=false;
  v_count int:=0;
  v_projected int;
  v_percentile numeric;
  v_projection_status text:='unavailable';
begin
  select audit_run_id into v_run
  from sac.fullscan_jobs
  where public_token=p_token
  order by created_at desc
  limit 1;

  if v_run is null then
    return jsonb_build_object('available',false,'reason','audit_run_not_found');
  end if;

  select domain_id into v_domain from sac.audit_runs where id=v_run;
  if v_domain is null then
    return jsonb_build_object('available',false,'reason','domain_not_found');
  end if;

  v_calc:=sac.autonomous_readiness_for_audit(v_run);
  v_score:=nullif(v_calc->>'score_100','')::numeric;
  v_eligible:=coalesce(v_calc->>'eligibility_status','')='eligible';

  select exists(
    select 1
    from sac.memberships m
    join sac.domains d on d.id=m.domain_id
    where m.domain_id=v_domain
      and m.status='active'
      and m.ranking_enabled
      and d.public_profile
  ) into v_participant;

  select count(*)::int into v_count
  from sac.autonomous_ranking_entries e
  join sac.domains d on d.id=e.domain_id
  where e.active
    and d.public_profile
    and exists(
      select 1 from sac.memberships m
      where m.domain_id=e.domain_id
        and m.status='active'
        and m.ranking_enabled
    );

  if not v_eligible or v_score is null then
    v_projection_status:='technical_ineligible';
  elsif v_count=0 then
    v_projection_status:='insufficient_cohort';
  else
    select 1+count(*) into v_projected
    from sac.autonomous_ranking_entries e
    join sac.domains d on d.id=e.domain_id
    where e.active
      and e.domain_id<>v_domain
      and e.score_100>v_score
      and d.public_profile
      and exists(
        select 1 from sac.memberships m
        where m.domain_id=e.domain_id
          and m.status='active'
          and m.ranking_enabled
      );
    v_percentile:=round(100*(1-(v_projected-1)::numeric/(v_count+1)),1);
    v_projection_status:='available';
  end if;

  return jsonb_build_object(
    'available',true,
    'official_participant',v_participant,
    'official_participants',v_count,
    'projected_rank',case when v_projection_status='available' then v_projected else null end,
    'projected_percentile',case when v_projection_status='available' then v_percentile else null end,
    'projection_status',v_projection_status,
    'projection_population_size',v_count,
    'technical_score',v_score,
    'eligible_technically',v_eligible,
    'source_audit_run_id',v_run,
    'membership_required_for_public_listing',true,
    'projection_disclosure',case
      when not v_eligible then 'Projection unavailable because this audit does not meet the autonomous technical evidence gate.'
      when v_count=0 then 'Projection unavailable because there are no enrolled public ranking participants in the current cohort.'
      else 'Projected rank compares this audit-specific diagnostic score with currently enrolled public ranking members. It is not an official position and can change as members are added or reaudited.'
    end
  );
end;
$$;

comment on function public.sac_api_competition_context(uuid) is 'Token-scoped competition context. Projections are withheld when the audit is technically ineligible or the official participant cohort is empty; projected values never constitute official placement.';
