create or replace function sac.run_due_monitoring(p_limit integer default 1)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $$
declare
  s record;
  jid uuid;
  cfg sac.runtime_capacity%rowtype;
  queued int:=0;
  skipped int:=0;
  active_jobs int:=0;
  paid_waiting int:=0;
begin
  if not pg_try_advisory_xact_lock(hashtext('gcl_monitoring_dispatch_v40')) then
    return jsonb_build_object('queued',0,'deferred','dispatcher_busy','checked_at',now());
  end if;

  select * into cfg from sac.runtime_capacity where subsystem='fullscan';
  if cfg.subsystem is null then
    return jsonb_build_object('queued',0,'deferred','capacity_config_missing','checked_at',now());
  end if;

  select count(*)::int,
         count(*) filter(where mode='full_paid')::int
    into active_jobs,paid_waiting
  from sac.fullscan_jobs
  where status in ('queued','processing');

  if paid_waiting>0 then
    return jsonb_build_object('queued',0,'deferred','paid_queue','active_jobs',active_jobs,'checked_at',now());
  end if;
  if active_jobs>=cfg.queue_soft_limit then
    return jsonb_build_object('queued',0,'deferred','queue_soft_limit','active_jobs',active_jobs,'checked_at',now());
  end if;

  for s in
    select ms.*,d.url,d.normalized_domain
    from sac.monitoring_schedules ms
    join sac.domains d on d.id=ms.domain_id
    where ms.enabled
      and ms.next_run_at is not null
      and ms.next_run_at<=now()
      and exists(select 1 from sac.domain_members dm where dm.domain_id=ms.domain_id and dm.user_id=ms.user_id and dm.verified)
      and sac.has_active_ranking_access(ms.user_id,ms.domain_id)
    order by ms.next_run_at
    for update of ms skip locked
    limit 1
  loop
    if s.last_job_id is not null and exists(
      select 1 from sac.fullscan_jobs f where f.id=s.last_job_id and f.status in ('queued','processing')
    ) then
      skipped:=skipped+1;
      update sac.monitoring_schedules set last_status='in_flight',updated_at=now() where id=s.id;
      continue;
    end if;

    if exists(select 1 from sac.fullscan_jobs where status in ('queued','processing') and mode='full_paid') then
      update sac.monitoring_schedules set last_status='deferred_paid_queue',updated_at=now() where id=s.id;
      return jsonb_build_object('queued',queued,'skipped_in_flight',skipped,'deferred','paid_queue','checked_at',now());
    end if;

    insert into sac.fullscan_jobs(owner_user_id,url,mode,status,response)
    values(
      s.user_id,
      s.url,
      'lighthouse_full',
      'queued',
      jsonb_build_object(
        'source','scheduled_monitoring',
        'schedule_id',s.id,
        'domain_id',s.domain_id,
        'domain',s.normalized_domain,
        'cadence',s.cadence,
        'priority_policy','yield_to_full_paid'
      )
    ) returning id into jid;

    update sac.monitoring_schedules
      set last_job_id=jid,
          last_run_at=now(),
          next_run_at=sac.monitoring_next_time(s.cadence,now()),
          last_status='queued_deep_reaudit',
          updated_at=now()
    where id=s.id;
    queued:=queued+1;
  end loop;

  return jsonb_build_object(
    'queued',queued,
    'skipped_in_flight',skipped,
    'scan_mode','lighthouse_full',
    'priority_policy','yield_to_full_paid',
    'checked_at',now()
  );
end;
$$;

revoke all on function sac.run_due_monitoring(integer) from public,anon,authenticated;
grant execute on function sac.run_due_monitoring(integer) to service_role,postgres;

create or replace function sac.gcl_monitoring_status()
returns jsonb
language sql
stable security definer
set search_path to 'sac','public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'domain_id',s.domain_id,
    'domain',d.normalized_domain,
    'url',d.url,
    'cadence',s.cadence,
    'enabled',s.enabled,
    'next_run_at',s.next_run_at,
    'last_run_at',s.last_run_at,
    'last_status',coalesce(j.status,s.last_status),
    'last_job_id',s.last_job_id,
    'last_audit_run_id',j.audit_run_id,
    'last_scan_mode',j.mode,
    'last_audit_at',d.last_audit_at,
    'current_score',d.current_score,
    'current_tier',d.current_tier,
    'policy',jsonb_build_object('scan_mode','lighthouse_full','priority','yield_to_full_paid')
  ) order by s.updated_at desc),'[]'::jsonb)
  from sac.monitoring_schedules s
  join sac.domains d on d.id=s.domain_id
  left join sac.fullscan_jobs j on j.id=s.last_job_id
  where s.user_id=auth.uid();
$$;

grant execute on function sac.gcl_monitoring_status() to authenticated,service_role;

create or replace function sac.gcl_monitoring_job_notify_trg()
returns trigger
language plpgsql
security definer
set search_path to 'sac','public'
as $$
declare
  s record;
  a record;
  v_completed boolean:=false;
  v_failed boolean:=false;
begin
  v_completed := new.status='completed' and new.audit_run_id is not null and (
    old.status is distinct from new.status or old.audit_run_id is distinct from new.audit_run_id
  );
  v_failed := new.status='failed' and old.status is distinct from new.status;
  if not v_completed and not v_failed then return new; end if;

  for s in
    select ms.id,ms.user_id,ms.domain_id,d.normalized_domain
    from sac.monitoring_schedules ms
    join sac.domains d on d.id=ms.domain_id
    where ms.last_job_id=new.id
  loop
    if v_completed then
      select ar.overall_score,ar.official_score,ar.ranking_eligible,ar.completed_at
        into a
      from sac.audit_runs ar where ar.id=new.audit_run_id;

      update sac.monitoring_schedules
        set last_status='completed_deep_reaudit',updated_at=now()
      where id=s.id;

      insert into sac.member_notifications(user_id,notification_type,title,body,link_url,payload,dedupe_key)
      values(
        s.user_id,
        'scheduled_reaudit_completed',
        'Reauditoria automática concluída',
        'A nova rodada de '||s.normalized_domain||' terminou'||case when a.overall_score is not null then '. Score observado: '||round(a.overall_score,1)::text||'.' else '.' end||' O Ranking só muda quando a evidência elegível é materializada.',
        '/ranking-site/account/',
        jsonb_build_object('domain_id',s.domain_id,'fullscan_job_id',new.id,'audit_run_id',new.audit_run_id,'score',a.overall_score,'official_score',a.official_score,'ranking_eligible',a.ranking_eligible,'scan_mode',new.mode),
        'scheduled-reaudit:'||new.id::text||':completed'
      ) on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    else
      update sac.monitoring_schedules
        set last_status='failed_deep_reaudit',updated_at=now()
      where id=s.id;

      insert into sac.member_notifications(user_id,notification_type,title,body,link_url,payload,dedupe_key)
      values(
        s.user_id,
        'scheduled_reaudit_failed',
        'Reauditoria automática não concluiu',
        'A rodada automática de '||s.normalized_domain||' falhou nesta tentativa. Nenhuma pontuação foi alterada; a próxima janela permanece programada.',
        '/ranking-site/account/',
        jsonb_build_object('domain_id',s.domain_id,'fullscan_job_id',new.id,'error',left(coalesce(new.error,'unknown'),300),'scan_mode',new.mode),
        'scheduled-reaudit:'||new.id::text||':failed'
      ) on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function sac.gcl_monitoring_job_notify_trg() from public,anon,authenticated;

drop trigger if exists trg_gcl_monitoring_job_notify on sac.fullscan_jobs;
create trigger trg_gcl_monitoring_job_notify
after update of status,audit_run_id on sac.fullscan_jobs
for each row execute function sac.gcl_monitoring_job_notify_trg();