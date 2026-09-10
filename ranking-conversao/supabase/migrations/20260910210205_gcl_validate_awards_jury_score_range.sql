create or replace function public.gcl_jury_score_entry(
  p_entry_id uuid,
  p_conversion_clarity numeric,
  p_user_experience numeric,
  p_technical_execution numeric,
  p_trust_persuasion numeric,
  p_originality numeric,
  p_note text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sac'
as $function$
declare
  u uuid := auth.uid();
  avg_score numeric;
begin
  if p_conversion_clarity is null or p_conversion_clarity < 0 or p_conversion_clarity > 10
     or p_user_experience is null or p_user_experience < 0 or p_user_experience > 10
     or p_technical_execution is null or p_technical_execution < 0 or p_technical_execution > 10
     or p_trust_persuasion is null or p_trust_persuasion < 0 or p_trust_persuasion > 10
     or p_originality is null or p_originality < 0 or p_originality > 10 then
    raise exception 'jury_score_out_of_range' using errcode='22023';
  end if;

  if u is null or not exists(
    select 1
    from sac.award_jury_members
    where user_id=u and active and season_code='GCL-2026'
  ) then
    raise exception 'jury_access_required' using errcode='42501';
  end if;

  if not exists(
    select 1
    from sac.awards_entries
    where id=p_entry_id and status='submitted' and nomination_status='nominee'
  ) then
    raise exception 'nominee_not_found';
  end if;

  insert into sac.award_jury_scores(
    entry_id,jury_user_id,conversion_clarity,user_experience,technical_execution,trust_persuasion,originality,note
  ) values(
    p_entry_id,u,p_conversion_clarity,p_user_experience,p_technical_execution,p_trust_persuasion,p_originality,left(p_note,2000)
  )
  on conflict(entry_id,jury_user_id) do update set
    conversion_clarity=excluded.conversion_clarity,
    user_experience=excluded.user_experience,
    technical_execution=excluded.technical_execution,
    trust_persuasion=excluded.trust_persuasion,
    originality=excluded.originality,
    note=excluded.note,
    updated_at=now();

  select round(avg((conversion_clarity+user_experience+technical_execution+trust_persuasion+originality)/5.0),2)
  into avg_score
  from sac.award_jury_scores
  where entry_id=p_entry_id;

  return jsonb_build_object('saved',true,'jury_average',avg_score);
end
$function$;
