alter table sac.blog_categories enable row level security;
alter table sac.platform_branding enable row level security;
alter table sac.community_badge_definitions enable row level security;
alter table sac.community_levels enable row level security;
alter table sac.community_missions enable row level security;

create policy blog_categories_public_read
on sac.blog_categories
for select
to anon, authenticated
using (true);

create policy platform_branding_public_read
on sac.platform_branding
for select
to anon, authenticated
using (true);

create policy community_badge_definitions_member_read
on sac.community_badge_definitions
for select
to authenticated
using (sac.has_active_community_access(auth.uid()));

create policy community_levels_member_read
on sac.community_levels
for select
to authenticated
using (sac.has_active_community_access(auth.uid()));

create policy community_missions_member_read
on sac.community_missions
for select
to authenticated
using (sac.has_active_community_access(auth.uid()));
