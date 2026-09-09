-- GCL Community v13.1: reaction points are single-source-of-truth in the ledger.
-- They now reflect reaction type, update correctly, and disappear when a reaction is removed.

create or replace function sac.community_reaction_weight(p_reaction text)
returns integer
language sql
immutable
as $$
select case p_reaction when 'insight' then 8 when 'useful' then 5 when 'win' then 3 when 'support' then 2 else 0 end;
$$;

revoke all on function sac.community_reaction_weight(text) from public,anon,authenticated;

create or replace function sac.community_reaction_count_trg()
returns trigger
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  author_id uuid;
  actor_id uuid:=coalesce(new.user_id,old.user_id);
  post_id uuid:=coalesce(new.post_id,old.post_id);
  key text;
begin
  select author_user_id into author_id from sac.community_posts where id=post_id;
  key:='post-reaction:'||post_id::text||':'||actor_id::text;

  if tg_op='INSERT' then
    update sac.community_posts set reaction_count=reaction_count+1 where id=new.post_id;
    if author_id is not null and author_id<>new.user_id then
      insert into sac.community_point_ledger(user_id,points,reason,reference_type,reference_id,idempotency_key)
      values(author_id,sac.community_reaction_weight(new.reaction),'peer_value_received','post',new.post_id::text,key)
      on conflict(idempotency_key) do update set
        points=excluded.points,reason=excluded.reason,reference_type=excluded.reference_type,reference_id=excluded.reference_id;
      perform sac.recalculate_member_points(author_id);
    end if;
    return new;
  elsif tg_op='UPDATE' then
    if author_id is not null and author_id<>new.user_id and old.reaction is distinct from new.reaction then
      update sac.community_point_ledger
      set points=sac.community_reaction_weight(new.reaction),reason='peer_value_received'
      where idempotency_key=key;
      if not found then
        insert into sac.community_point_ledger(user_id,points,reason,reference_type,reference_id,idempotency_key)
        values(author_id,sac.community_reaction_weight(new.reaction),'peer_value_received','post',new.post_id::text,key)
        on conflict(idempotency_key) do update set points=excluded.points,reason=excluded.reason;
      end if;
      perform sac.recalculate_member_points(author_id);
    end if;
    return new;
  elsif tg_op='DELETE' then
    update sac.community_posts set reaction_count=greatest(0,reaction_count-1) where id=old.post_id;
    delete from sac.community_point_ledger where idempotency_key=key;
    if author_id is not null and author_id<>old.user_id then perform sac.recalculate_member_points(author_id); end if;
    return old;
  end if;
  return coalesce(new,old);
end;
$$;

create or replace function sac.community_comment_reaction_count_trg()
returns trigger
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  author_id uuid;
  actor_id uuid:=coalesce(new.user_id,old.user_id);
  comment_id uuid:=coalesce(new.comment_id,old.comment_id);
  key text;
begin
  select author_user_id into author_id from sac.community_comments where id=comment_id;
  key:='comment-reaction:'||comment_id::text||':'||actor_id::text;

  if tg_op='INSERT' then
    update sac.community_comments set reaction_count=reaction_count+1,updated_at=now() where id=new.comment_id;
    if author_id is not null and author_id<>new.user_id then
      insert into sac.community_point_ledger(user_id,points,reason,reference_type,reference_id,idempotency_key)
      values(author_id,sac.community_reaction_weight(new.reaction),'peer_value_received','comment',new.comment_id::text,key)
      on conflict(idempotency_key) do update set
        points=excluded.points,reason=excluded.reason,reference_type=excluded.reference_type,reference_id=excluded.reference_id;
      perform sac.recalculate_member_points(author_id);
    end if;
    return new;
  elsif tg_op='UPDATE' then
    if author_id is not null and author_id<>new.user_id and old.reaction is distinct from new.reaction then
      update sac.community_point_ledger
      set points=sac.community_reaction_weight(new.reaction),reason='peer_value_received'
      where idempotency_key=key;
      if not found then
        insert into sac.community_point_ledger(user_id,points,reason,reference_type,reference_id,idempotency_key)
        values(author_id,sac.community_reaction_weight(new.reaction),'peer_value_received','comment',new.comment_id::text,key)
        on conflict(idempotency_key) do update set points=excluded.points,reason=excluded.reason;
      end if;
      perform sac.recalculate_member_points(author_id);
    end if;
    return new;
  elsif tg_op='DELETE' then
    update sac.community_comments set reaction_count=greatest(0,reaction_count-1),updated_at=now() where id=old.comment_id;
    delete from sac.community_point_ledger where idempotency_key=key;
    if author_id is not null and author_id<>old.user_id then perform sac.recalculate_member_points(author_id); end if;
    return old;
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_community_reaction_count on sac.community_post_reactions;
create trigger trg_community_reaction_count
after insert or update of reaction or delete on sac.community_post_reactions
for each row execute function sac.community_reaction_count_trg();

drop trigger if exists trg_community_comment_reaction_count on sac.community_comment_reactions;
create trigger trg_community_comment_reaction_count
after insert or update of reaction or delete on sac.community_comment_reactions
for each row execute function sac.community_comment_reaction_count_trg();

-- Reconcile historical point rows against reactions that still exist.
update sac.community_point_ledger l
set points=sac.community_reaction_weight(r.reaction),reason='peer_value_received'
from sac.community_post_reactions r
where l.idempotency_key='post-reaction:'||r.post_id::text||':'||r.user_id::text
  and l.user_id=(select p.author_user_id from sac.community_posts p where p.id=r.post_id);

update sac.community_point_ledger l
set points=sac.community_reaction_weight(r.reaction),reason='peer_value_received'
from sac.community_comment_reactions r
where l.idempotency_key='comment-reaction:'||r.comment_id::text||':'||r.user_id::text
  and l.user_id=(select c.author_user_id from sac.community_comments c where c.id=r.comment_id);

insert into sac.community_point_ledger(user_id,points,reason,reference_type,reference_id,idempotency_key)
select p.author_user_id,sac.community_reaction_weight(r.reaction),'peer_value_received','post',r.post_id::text,
  'post-reaction:'||r.post_id::text||':'||r.user_id::text
from sac.community_post_reactions r join sac.community_posts p on p.id=r.post_id
where p.author_user_id<>r.user_id
on conflict(idempotency_key) do update set points=excluded.points,reason=excluded.reason;

insert into sac.community_point_ledger(user_id,points,reason,reference_type,reference_id,idempotency_key)
select c.author_user_id,sac.community_reaction_weight(r.reaction),'peer_value_received','comment',r.comment_id::text,
  'comment-reaction:'||r.comment_id::text||':'||r.user_id::text
from sac.community_comment_reactions r join sac.community_comments c on c.id=r.comment_id
where c.author_user_id<>r.user_id
on conflict(idempotency_key) do update set points=excluded.points,reason=excluded.reason;

delete from sac.community_point_ledger l
where l.reason in ('useful_reaction_received','comment_reaction_received','peer_value_received')
  and ((l.reference_type='post' and not exists(
    select 1 from sac.community_post_reactions r
    where 'post-reaction:'||r.post_id::text||':'||r.user_id::text=l.idempotency_key
  )) or (l.reference_type='comment' and not exists(
    select 1 from sac.community_comment_reactions r
    where 'comment-reaction:'||r.comment_id::text||':'||r.user_id::text=l.idempotency_key
  )));

create or replace function sac.community_value_points(
  p_user uuid,
  p_since timestamptz default '-infinity'::timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=sac,public
as $$
declare
  v_missions bigint:=0;
  v_peer bigint:=0;
  v_other bigint:=0;
  v_cases bigint:=0;
  v_total bigint:=0;
begin
  if p_user is null then return jsonb_build_object('total',0); end if;

  select coalesce(sum(points) filter(where reason='mission_completed'),0)::bigint,
         coalesce(sum(points) filter(where reason='peer_value_received'),0)::bigint,
         coalesce(sum(points) filter(where reason not in ('mission_completed','peer_value_received')),0)::bigint
    into v_missions,v_peer,v_other
  from sac.community_point_ledger
  where user_id=p_user and created_at>=p_since;

  select coalesce(sum(100+least(250,greatest(0,round(coalesce(score_delta,0)*25)))),0)::bigint
    into v_cases
  from sac.community_case_studies
  where user_id=p_user and verification_status='score_verified' and updated_at>=p_since;

  v_total:=v_missions+v_peer+v_other+v_cases;
  return jsonb_build_object(
    'total',v_total,'mission_points',v_missions,'peer_value_points',v_peer,
    'verified_result_points',v_cases,'other_points',v_other,
    'rules',jsonb_build_object('insight_received',8,'useful_received',5,'win_received',3,'support_received',2,'verified_case_base',100,'score_delta_point_value',25,'score_delta_case_cap',250)
  );
end;
$$;

create or replace function sac.community_leaderboard(p_period text default 'week',p_limit integer default 25)
returns jsonb
language sql
stable
security definer
set search_path=sac,public
as $$
with bounds as (
  select case p_period when 'day' then now()-interval '1 day' when 'month' then now()-interval '30 days' when 'all' then '-infinity'::timestamptz else now()-interval '7 days' end since
),
ledger as (
  select l.user_id,sum(l.points)::bigint points from sac.community_point_ledger l,bounds b where l.created_at>=b.since group by l.user_id
),
results as (
  select c.user_id,sum(100+least(250,greatest(0,round(coalesce(c.score_delta,0)*25))))::bigint points
  from sac.community_case_studies c,bounds b
  where c.verification_status='score_verified' and c.updated_at>=b.since group by c.user_id
),
all_points as (
  select user_id,sum(points)::bigint points from (select * from ledger union all select * from results) x group by user_id
),
ranked as (
  select row_number() over(order by p.points desc,up.contribution_score desc,up.created_at asc)::int rank,
    p.points,up.user_id,up.profile_slug,up.display_name,up.avatar_url,up.headline,up.member_type,up.community_level,up.contribution_score
  from all_points p join sac.user_profiles up on up.user_id=p.user_id
  where p.points>0
  order by p.points desc,up.contribution_score desc
  limit greatest(1,least(coalesce(p_limit,25),100))
)
select coalesce(jsonb_agg(to_jsonb(r) order by rank),'[]'::jsonb) from ranked r;
$$;

-- Recalculate only members who currently have community-related points/activity.
do $$
declare r record;
begin
  for r in
    select distinct user_id from sac.community_point_ledger
    union select distinct author_user_id from sac.community_posts
    union select distinct author_user_id from sac.community_comments
  loop
    perform sac.recalculate_member_points(r.user_id);
  end loop;
end;
$$;
