-- GCL v97: collapse the SELECT side of four permissive policy pairs into an exact logical union,
-- then make the former ALL write policy operation-specific. This preserves access semantics.

-- community_case_studies
alter policy cases_members_read
  on sac.community_case_studies
  using (
    user_id = (select auth.uid())
    or (public_to_members and sac.has_active_community_access((select auth.uid())))
  );

drop policy if exists cases_self_write on sac.community_case_studies;

create policy cases_self_insert
  on sac.community_case_studies
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
    and sac.is_domain_member((select auth.uid()), domain_id)
  );

create policy cases_self_update
  on sac.community_case_studies
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
    and sac.is_domain_member((select auth.uid()), domain_id)
  );

create policy cases_self_delete
  on sac.community_case_studies
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- community_experiments
alter policy experiments_members_read
  on sac.community_experiments
  using (
    user_id = (select auth.uid())
    or (public_to_members and sac.has_active_community_access((select auth.uid())))
  );

drop policy if exists experiments_self_write on sac.community_experiments;

create policy experiments_self_insert
  on sac.community_experiments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
    and sac.is_domain_member((select auth.uid()), domain_id)
  );

create policy experiments_self_update
  on sac.community_experiments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
    and sac.is_domain_member((select auth.uid()), domain_id)
  );

create policy experiments_self_delete
  on sac.community_experiments
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- community_projects
alter policy projects_member_read
  on sac.community_projects
  using (
    author_user_id = (select auth.uid())
    or sac.has_active_community_access((select auth.uid()))
  );

drop policy if exists projects_author_write on sac.community_projects;

create policy projects_author_insert
  on sac.community_projects
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
  );

create policy projects_author_update
  on sac.community_projects
  for update to authenticated
  using (author_user_id = (select auth.uid()))
  with check (
    author_user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
  );

create policy projects_author_delete
  on sac.community_projects
  for delete to authenticated
  using (author_user_id = (select auth.uid()));

-- professional_services
alter policy professional_services_member_read
  on sac.professional_services
  using (
    user_id = (select auth.uid())
    or (active and sac.has_active_community_access((select auth.uid())))
  );

drop policy if exists professional_services_self_write on sac.professional_services;

create policy professional_services_self_insert
  on sac.professional_services
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
  );

create policy professional_services_self_update
  on sac.professional_services
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and sac.has_active_community_access((select auth.uid()))
  );

create policy professional_services_self_delete
  on sac.professional_services
  for delete to authenticated
  using (user_id = (select auth.uid()));
