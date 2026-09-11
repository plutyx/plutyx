alter function sac.compute_experience_scorecards(uuid) rename to compute_experience_scorecards_unlocked_v44;

create function sac.compute_experience_scorecards(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('gcl-scorecard:'||p_audit_run_id::text,0));
  return sac.compute_experience_scorecards_unlocked_v44(p_audit_run_id);
end;
$$;

revoke all on function sac.compute_experience_scorecards(uuid) from public, anon, authenticated;
grant execute on function sac.compute_experience_scorecards(uuid) to service_role;
revoke all on function sac.compute_experience_scorecards_unlocked_v44(uuid) from public, anon, authenticated;
grant execute on function sac.compute_experience_scorecards_unlocked_v44(uuid) to service_role;
