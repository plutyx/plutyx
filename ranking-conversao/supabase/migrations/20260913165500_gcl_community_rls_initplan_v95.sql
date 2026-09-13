-- GCL v95: preserve Community authorization while avoiding per-row auth.uid() re-evaluation.
-- Supabase recommends wrapping auth helpers in SELECT so PostgreSQL can treat them as initplans.

alter policy community_badge_definitions_member_read
  on sac.community_badge_definitions
  using (sac.has_active_community_access((select auth.uid())));

alter policy community_levels_member_read
  on sac.community_levels
  using (sac.has_active_community_access((select auth.uid())));

alter policy community_missions_member_read
  on sac.community_missions
  using (sac.has_active_community_access((select auth.uid())));
