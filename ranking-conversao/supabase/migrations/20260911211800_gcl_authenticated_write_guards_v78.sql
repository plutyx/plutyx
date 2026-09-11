-- GCL authenticated write guards v78
-- Extends the already-homologated v71 database rate guard to dedicated
-- authenticated user-write surfaces only. Shared lifecycle/payment/admin
-- tables (profiles, awards entries, checkout, domain claims) are deliberately
-- excluded from this migration.

-- Experiments: user-created records only.
drop trigger if exists trg_gcl_rl_experiments_v78 on sac.community_experiments;
create trigger trg_gcl_rl_experiments_v78
before insert on sac.community_experiments
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:create_experiment', '12', '60');

-- Case studies: creation and authenticated verification updates.
-- Internal/service workflows bypass because auth.uid() is null.
drop trigger if exists trg_gcl_rl_case_studies_v78 on sac.community_case_studies;
create trigger trg_gcl_rl_case_studies_v78
before insert or update on sac.community_case_studies
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:case_study', '12', '60');

-- Awards votes: toggle creates/deletes a vote row.
drop trigger if exists trg_gcl_rl_award_votes_v78 on sac.award_entry_votes;
create trigger trg_gcl_rl_award_votes_v78
before insert or delete on sac.award_entry_votes
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:award_vote', '30', '60');

-- Community/content abuse reports: intentionally conservative burst limit.
drop trigger if exists trg_gcl_rl_content_reports_v78 on sac.content_reports;
create trigger trg_gcl_rl_content_reports_v78
before insert on sac.content_reports
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:report_content', '6', '300');

-- Mark-notification-read RPC may update many rows in one call. Charge once
-- per UPDATE statement instead of once per notification row.
drop trigger if exists trg_gcl_rl_notifications_read_v78 on sac.member_notifications;
create trigger trg_gcl_rl_notifications_read_v78
before update on sac.member_notifications
for each statement execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:notifications_read', '60', '60');

-- Personal action plan mutations.
drop trigger if exists trg_gcl_rl_action_plan_v78 on sac.action_plan_items;
create trigger trg_gcl_rl_action_plan_v78
before insert or update or delete on sac.action_plan_items
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:action_plan', '60', '60');

-- Monitoring schedule configuration by verified-domain members.
drop trigger if exists trg_gcl_rl_monitoring_schedule_v78 on sac.monitoring_schedules;
create trigger trg_gcl_rl_monitoring_schedule_v78
before insert or update on sac.monitoring_schedules
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:monitoring_schedule', '20', '60');

-- Action Plan is a member-only RPC surface. It previously inherited PUBLIC
-- execution, which made it callable by anon even though auth.uid() prevented
-- useful mutations. Close the unnecessary anonymous surface explicitly while
-- preserving authenticated users and service-role operations.
revoke execute on function sac.gcl_action_plan_list(uuid) from public, anon;
grant execute on function sac.gcl_action_plan_list(uuid) to authenticated, service_role;

revoke execute on function sac.gcl_action_plan_upsert(uuid, text, text, text, numeric, text, text) from public, anon;
grant execute on function sac.gcl_action_plan_upsert(uuid, text, text, text, numeric, text, text) to authenticated, service_role;

revoke execute on function sac.gcl_action_plan_delete(uuid) from public, anon;
grant execute on function sac.gcl_action_plan_delete(uuid) to authenticated, service_role;
