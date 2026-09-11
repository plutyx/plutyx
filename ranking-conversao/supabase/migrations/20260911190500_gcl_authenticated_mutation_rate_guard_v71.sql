-- GCL authenticated mutation rate guard v71
-- Defense in depth for direct PostgREST RPC calls that bypass the gcl-member-api
-- edge rate limiter. Service-role/internal work remains unaffected because
-- auth.uid() is null outside an end-user JWT context.

create or replace function sac.gcl_authenticated_mutation_rate_limit_trg()
returns trigger
language plpgsql
security definer
set search_path = 'sac', 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_route text := nullif(trim(coalesce(tg_argv[0], '')), '');
  v_limit integer := greatest(coalesce(nullif(tg_argv[1], '')::integer, 1), 1);
  v_window integer := greatest(coalesce(nullif(tg_argv[2], '')::integer, 60), 1);
  v_rate jsonb;
begin
  if v_user is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_route is null then
    raise exception 'rate_limit_route_required';
  end if;

  v_rate := sac.consume_rate_limit(
    v_route,
    'user:' || v_user::text,
    v_window,
    v_limit
  );

  if coalesce((v_rate ->> 'allowed')::boolean, false) is not true then
    raise exception 'rate_limited'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'route', v_route,
              'reset_at', v_rate ->> 'reset_at'
            )::text;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function sac.gcl_authenticated_mutation_rate_limit_trg() from public;
revoke all on function sac.gcl_authenticated_mutation_rate_limit_trg() from anon;
revoke all on function sac.gcl_authenticated_mutation_rate_limit_trg() from authenticated;

-- Content creation. Existing AFTER triggers for counters/reputation remain intact.
drop trigger if exists trg_gcl_rl_community_posts on sac.community_posts;
create trigger trg_gcl_rl_community_posts
before insert on sac.community_posts
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:create_post', '6', '60');

drop trigger if exists trg_gcl_rl_community_comments on sac.community_comments;
create trigger trg_gcl_rl_community_comments
before insert on sac.community_comments
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:comment', '24', '60');

-- Reactions are toggles: insert, delete, or update when reaction type changes.
drop trigger if exists trg_gcl_rl_post_reactions on sac.community_post_reactions;
create trigger trg_gcl_rl_post_reactions
before insert or update or delete on sac.community_post_reactions
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:post_reaction', '60', '60');

drop trigger if exists trg_gcl_rl_comment_reactions on sac.community_comment_reactions;
create trigger trg_gcl_rl_comment_reactions
before insert or update or delete on sac.community_comment_reactions
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:comment_reaction', '60', '60');

-- Save/follow toggles.
drop trigger if exists trg_gcl_rl_post_saves on sac.community_post_saves;
create trigger trg_gcl_rl_post_saves
before insert or delete on sac.community_post_saves
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:save_post', '40', '60');

drop trigger if exists trg_gcl_rl_follows on sac.community_follows;
create trigger trg_gcl_rl_follows
before insert or delete on sac.community_follows
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:follow_member', '40', '60');

-- Unique view recording can be frequent, but must still be bounded for direct RPC abuse.
drop trigger if exists trg_gcl_rl_post_views on sac.community_post_views;
create trigger trg_gcl_rl_post_views
before insert on sac.community_post_views
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:view_post', '120', '60');

-- High-value workflows.
drop trigger if exists trg_gcl_rl_projects on sac.community_projects;
create trigger trg_gcl_rl_projects
before insert on sac.community_projects
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:create_project', '10', '60');

drop trigger if exists trg_gcl_rl_project_applications on sac.community_project_applications;
create trigger trg_gcl_rl_project_applications
before insert or update on sac.community_project_applications
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:apply_project', '20', '60');

drop trigger if exists trg_gcl_rl_hot_seats on sac.hot_seat_submissions;
create trigger trg_gcl_rl_hot_seats
before insert on sac.hot_seat_submissions
for each row execute function sac.gcl_authenticated_mutation_rate_limit_trg('db:gcl:submit_hot_seat', '10', '60');
