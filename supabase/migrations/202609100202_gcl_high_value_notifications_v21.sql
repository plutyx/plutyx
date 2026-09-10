create unique index if not exists member_notifications_user_dedupe_uidx
on sac.member_notifications(user_id,dedupe_key)
where dedupe_key is not null;

create index if not exists member_notifications_user_unread_created_idx
on sac.member_notifications(user_id,created_at desc)
where read_at is null;

create or replace function sac.gcl_high_value_notify_trg()
returns trigger
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  v_target uuid;
  v_title text;
  v_actor text;
  v_label text;
  v_prev_rank int;
  v_delta int;
  v_user uuid;
begin
  if tg_table_name='community_project_applications' and tg_op='INSERT' then
    select author_user_id,title into v_target,v_title from sac.community_projects where id=new.project_id;
    if v_target is not null and v_target<>new.applicant_user_id then
      select coalesce(display_name,'Membro GCL') into v_actor from sac.user_profiles where user_id=new.applicant_user_id;
      insert into sac.member_notifications(user_id,notification_type,title,body,link_url,payload,dedupe_key)
      values(v_target,'project_application','Nova proposta no seu projeto',coalesce(v_actor,'Membro GCL')||' enviou uma proposta para “'||left(coalesce(v_title,'seu projeto'),90)||'”.','/ranking-site/community/?space=projects',jsonb_build_object('project_id',new.project_id,'applicant_user_id',new.applicant_user_id,'proposed_price',new.proposed_price,'currency',new.currency),'project-application:'||new.project_id::text||':'||new.applicant_user_id::text)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
    return new;
  end if;
  if tg_table_name='hot_seat_submissions' and tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status in ('selected','scheduled','live','completed','rejected') then
      insert into sac.member_notifications(user_id,notification_type,title,body,link_url,payload,dedupe_key)
      values(new.user_id,'hot_seat_status',case new.status when 'selected' then 'Seu Hot Seat foi selecionado' when 'scheduled' then 'Hot Seat agendado' when 'live' then 'Seu Hot Seat está ao vivo' when 'completed' then 'Hot Seat concluído' else 'Atualização do seu Hot Seat' end,case new.status when 'selected' then 'Sua página foi selecionada para análise pela comunidade.' when 'scheduled' then 'Sua auditoria ao vivo foi agendada.' when 'live' then 'A sessão de auditoria da sua página começou.' when 'completed' then 'Sua sessão foi concluída. Revise os feedbacks e transforme-os em uma missão de evolução.' else 'Sua submissão recebeu uma atualização.' end,'/ranking-site/community/?space=hot-seats',jsonb_build_object('submission_id',new.id,'status',new.status,'event_id',new.event_id),'hot-seat:'||new.id::text||':'||new.status)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
    return new;
  end if;
  if tg_table_name='awards' and tg_op='INSERT' then
    select e.user_id into v_target from sac.awards_entries e where e.domain_id=new.domain_id and e.season_code=new.season_code order by e.submitted_at desc nulls last,e.created_at desc limit 1;
    if v_target is null then select dm.user_id into v_target from sac.domain_members dm where dm.domain_id=new.domain_id and dm.verified order by case when dm.role='owner' then 0 else 1 end,dm.created_at limit 1; end if;
    if v_target is not null then
      select label into v_label from sac.award_definitions where award_code=new.award_code;
      insert into sac.member_notifications(user_id,notification_type,title,body,link_url,payload,dedupe_key)
      values(v_target,'award_issued','Novo reconhecimento GCL',coalesce(v_label,new.award_code)||' foi emitido para o seu site. Código: '||new.verification_code,'/ranking-site/awards/?verify='||new.verification_code,jsonb_build_object('award_id',new.id,'award_code',new.award_code,'verification_code',new.verification_code,'period_key',new.period_key),'award:'||new.id::text)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
    return new;
  end if;
  if tg_table_name='official_ranking_history' and tg_op='INSERT' and new.active and new.overall_rank is not null then
    select h.overall_rank into v_prev_rank from sac.official_ranking_history h where h.domain_id=new.domain_id and h.season_code=new.season_code and h.id<>new.id and h.active and h.overall_rank is not null order by h.recorded_at desc,h.id desc limit 1;
    if v_prev_rank is not null then v_delta:=v_prev_rank-new.overall_rank; end if;
    if (v_delta is not null and abs(v_delta)>=3) or (new.overall_rank<=10 and coalesce(v_prev_rank,999)>10) or (new.overall_rank<=100 and coalesce(v_prev_rank,999)>100) then
      for v_user in select dm.user_id from sac.domain_members dm where dm.domain_id=new.domain_id and dm.verified loop
        insert into sac.member_notifications(user_id,notification_type,title,body,link_url,payload,dedupe_key)
        values(v_user,'ranking_move',case when new.overall_rank<=10 and coalesce(v_prev_rank,999)>10 then 'Seu site entrou no Top 10' when new.overall_rank<=100 and coalesce(v_prev_rank,999)>100 then 'Seu site entrou no Top 100' when v_delta>0 then 'Seu site subiu no Ranking' else 'Mudança no Ranking GCL' end,case when v_prev_rank is null then 'Seu site agora ocupa a posição #'||new.overall_rank::text||'.' else 'Posição #'||v_prev_rank::text||' → #'||new.overall_rank::text||'. Score atual: '||round(new.score,1)::text||'.' end,'/ranking-site/ranking/?domain='||(select normalized_domain from sac.domains where id=new.domain_id),jsonb_build_object('domain_id',new.domain_id,'previous_rank',v_prev_rank,'rank',new.overall_rank,'delta',v_delta,'score',new.score,'season_code',new.season_code),'ranking:'||new.domain_id::text||':'||new.season_code||':'||new.id::text)
        on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      end loop;
    end if;
    return new;
  end if;
  return new;
end;
$$;
revoke all on function sac.gcl_high_value_notify_trg() from public,anon,authenticated;
drop trigger if exists trg_gcl_project_application_notify on sac.community_project_applications;
create trigger trg_gcl_project_application_notify after insert on sac.community_project_applications for each row execute function sac.gcl_high_value_notify_trg();
drop trigger if exists trg_gcl_hot_seat_status_notify on sac.hot_seat_submissions;
create trigger trg_gcl_hot_seat_status_notify after update of status on sac.hot_seat_submissions for each row execute function sac.gcl_high_value_notify_trg();
drop trigger if exists trg_gcl_award_issued_notify on sac.awards;
create trigger trg_gcl_award_issued_notify after insert on sac.awards for each row execute function sac.gcl_high_value_notify_trg();
drop trigger if exists trg_gcl_ranking_move_notify on sac.official_ranking_history;
create trigger trg_gcl_ranking_move_notify after insert on sac.official_ranking_history for each row execute function sac.gcl_high_value_notify_trg();
