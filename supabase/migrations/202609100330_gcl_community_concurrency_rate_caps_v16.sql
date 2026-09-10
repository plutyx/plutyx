create or replace function public.gcl_toggle_post_reaction(p_post_id uuid,p_reaction text default 'useful'::text)
returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare u uuid:=auth.uid();old_reaction text;cnt int;breakdown jsonb;
begin
 if u is null or not sac.has_active_community_access(u) then raise exception 'community_access_required' using errcode='42501';end if;
 if p_reaction not in('useful','insight','win','support') then raise exception 'invalid_reaction';end if;
 if not exists(select 1 from sac.community_posts where id=p_post_id and status='published') then raise exception 'post_not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended('gcl:post-reaction:'||u::text||':'||p_post_id::text,0));
 select reaction into old_reaction from sac.community_post_reactions where post_id=p_post_id and user_id=u;
 if old_reaction is null then insert into sac.community_post_reactions(post_id,user_id,reaction) values(p_post_id,u,p_reaction);
 elsif old_reaction=p_reaction then delete from sac.community_post_reactions where post_id=p_post_id and user_id=u;
 else update sac.community_post_reactions set reaction=p_reaction,created_at=now() where post_id=p_post_id and user_id=u;end if;
 select reaction_count into cnt from sac.community_posts where id=p_post_id;
 select coalesce(jsonb_object_agg(reaction,c),'{}'::jsonb) into breakdown from(select reaction,count(*)::int c from sac.community_post_reactions where post_id=p_post_id group by reaction)x;
 return jsonb_build_object('active',old_reaction is distinct from p_reaction,'reaction',case when old_reaction=p_reaction then null else p_reaction end,'count',cnt,'breakdown',breakdown);
end;$function$;

create or replace function public.gcl_toggle_comment_reaction(p_comment_id uuid,p_reaction text default 'useful'::text)
returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare u uuid:=auth.uid();old_reaction text;cnt int;breakdown jsonb;
begin
 if u is null or not sac.has_active_community_access(u) then raise exception 'community_access_required' using errcode='42501';end if;
 if p_reaction not in('useful','insight','win','support') then raise exception 'invalid_reaction';end if;
 if not exists(select 1 from sac.community_comments where id=p_comment_id and status='published') then raise exception 'comment_not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended('gcl:comment-reaction:'||u::text||':'||p_comment_id::text,0));
 select reaction into old_reaction from sac.community_comment_reactions where comment_id=p_comment_id and user_id=u;
 if old_reaction is null then insert into sac.community_comment_reactions(comment_id,user_id,reaction) values(p_comment_id,u,p_reaction);
 elsif old_reaction=p_reaction then delete from sac.community_comment_reactions where comment_id=p_comment_id and user_id=u;
 else update sac.community_comment_reactions set reaction=p_reaction,created_at=now() where comment_id=p_comment_id and user_id=u;end if;
 select reaction_count into cnt from sac.community_comments where id=p_comment_id;
 select coalesce(jsonb_object_agg(reaction,c),'{}'::jsonb) into breakdown from(select reaction,count(*)::int c from sac.community_comment_reactions where comment_id=p_comment_id group by reaction)x;
 return jsonb_build_object('active',old_reaction is distinct from p_reaction,'reaction',case when old_reaction=p_reaction then null else p_reaction end,'count',cnt,'breakdown',breakdown);
end;$function$;

create or replace function public.gcl_toggle_save_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare u uuid:=auth.uid();ex boolean;
begin
 if u is null or not sac.has_active_community_access(u) then raise exception 'community_access_required' using errcode='42501';end if;
 if not exists(select 1 from sac.community_posts where id=p_post_id and status='published') then raise exception 'post_not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended('gcl:post-save:'||u::text||':'||p_post_id::text,0));
 select exists(select 1 from sac.community_post_saves where post_id=p_post_id and user_id=u) into ex;
 if ex then delete from sac.community_post_saves where post_id=p_post_id and user_id=u;else insert into sac.community_post_saves(post_id,user_id) values(p_post_id,u);end if;
 return jsonb_build_object('saved',not ex);
end;$function$;

create or replace function public.gcl_toggle_follow_member(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare u uuid:=auth.uid();ex boolean;followers int;
begin
 if u is null or not sac.has_active_community_access(u) then raise exception 'community_access_required' using errcode='42501';end if;
 if p_user_id is null or p_user_id=u or not exists(select 1 from sac.user_profiles where user_id=p_user_id) then raise exception 'invalid_member';end if;
 perform pg_advisory_xact_lock(hashtextextended('gcl:follow:'||u::text||':'||p_user_id::text,0));
 select exists(select 1 from sac.community_follows where follower_user_id=u and followed_user_id=p_user_id) into ex;
 if ex then delete from sac.community_follows where follower_user_id=u and followed_user_id=p_user_id;else insert into sac.community_follows(follower_user_id,followed_user_id) values(u,p_user_id);end if;
 select count(*)::int into followers from sac.community_follows where followed_user_id=p_user_id;
 return jsonb_build_object('following',not ex,'followers',followers);
end;$function$;

create or replace function sac.consume_rate_limit(p_route text,p_bucket text,p_window_seconds integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path to 'sac','public' as $function$
declare w timestamptz;h int;v_limit int;v_window int;
begin
 v_window:=greatest(coalesce(p_window_seconds,60),1);v_limit:=greatest(coalesce(p_limit,1),1);
 v_limit:=case p_route
   when 'member:create_post' then least(v_limit,6)
   when 'member:comment' then least(v_limit,24)
   when 'member:create_project' then least(v_limit,10)
   when 'member:submit_hot_seat' then least(v_limit,10)
   when 'member:create_experiment' then least(v_limit,10)
   when 'member:create_case' then least(v_limit,10)
   when 'member:update_profile' then least(v_limit,20)
   when 'member:submit_awards' then least(v_limit,10)
   when 'member:jury_score' then least(v_limit,30)
   when 'member:checkout' then least(v_limit,20)
   when 'member:begin_domain_claim' then least(v_limit,20)
   else v_limit end;
 w:=to_timestamp(floor(extract(epoch from now())/v_window)*v_window);
 insert into sac.edge_rate_limits(route,bucket_key,window_start,hits) values(p_route,p_bucket,w,1)
 on conflict(route,bucket_key,window_start) do update set hits=sac.edge_rate_limits.hits+1 returning hits into h;
 return jsonb_build_object('allowed',h<=v_limit,'hits',h,'limit',v_limit,'requested_limit',p_limit,'reset_at',w+make_interval(secs=>v_window));
end;$function$;
