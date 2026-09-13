-- GCL v96: remove redundant permissive SELECT evaluation from two owner-only ALL policies.
-- Existing SELECT policies remain unchanged. INSERT/UPDATE/DELETE semantics stay owner-only.

-- action_plan_items_self_write previously applied to ALL commands with the exact
-- same owner predicate already covered by action_plan_items_self_read for SELECT.
drop policy if exists action_plan_items_self_write on sac.action_plan_items;

create policy action_plan_items_self_insert
  on sac.action_plan_items
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy action_plan_items_self_update
  on sac.action_plan_items
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy action_plan_items_self_delete
  on sac.action_plan_items
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- user_profiles_self_write also applied to ALL commands. Its SELECT branch was
-- redundant because user_profiles_self_select already includes user_id = auth.uid().
drop policy if exists user_profiles_self_write on sac.user_profiles;

create policy user_profiles_self_insert
  on sac.user_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy user_profiles_self_update
  on sac.user_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_profiles_self_delete
  on sac.user_profiles
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
