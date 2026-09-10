create table if not exists sac.action_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_run_id uuid not null references sac.audit_runs(id) on delete cascade,
  domain_id uuid not null references sac.domains(id) on delete cascade,
  issue_key text not null,
  label text not null,
  recommendation text,
  status text not null default 'todo' check (status in ('todo','in_progress','done','dismissed')),
  source_points numeric,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id,audit_run_id,issue_key)
);

create index if not exists action_plan_items_user_audit_idx
  on sac.action_plan_items(user_id,audit_run_id,updated_at desc);
create index if not exists action_plan_items_domain_idx
  on sac.action_plan_items(domain_id,status,updated_at desc);

alter table sac.action_plan_items enable row level security;

drop policy if exists action_plan_items_self_read on sac.action_plan_items;
create policy action_plan_items_self_read
  on sac.action_plan_items
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists action_plan_items_self_write on sac.action_plan_items;
create policy action_plan_items_self_write
  on sac.action_plan_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function sac.gcl_can_manage_audit(p_audit_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = sac, public, auth
as $$
  select exists(
    select 1
    from sac.audit_runs a
    join sac.domains d on d.id = a.domain_id
    where a.id = p_audit_run_id
      and auth.uid() is not null
      and (a.requested_by = auth.uid() or d.owner_user_id = auth.uid())
  );
$$;

create or replace function sac.gcl_action_plan_list(p_audit_run_id uuid)
returns table(
  id uuid,
  audit_run_id uuid,
  domain_id uuid,
  issue_key text,
  label text,
  recommendation text,
  status text,
  source_points numeric,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = sac, public, auth
as $$
begin
  if not sac.gcl_can_manage_audit(p_audit_run_id) then
    raise exception 'audit_access_denied';
  end if;

  return query
    select
      i.id,
      i.audit_run_id,
      i.domain_id,
      i.issue_key,
      i.label,
      i.recommendation,
      i.status,
      i.source_points,
      i.note,
      i.created_at,
      i.updated_at,
      i.completed_at
    from sac.action_plan_items i
    where i.user_id = auth.uid()
      and i.audit_run_id = p_audit_run_id
    order by
      case i.status
        when 'in_progress' then 0
        when 'todo' then 1
        when 'done' then 2
        else 3
      end,
      i.updated_at desc;
end;
$$;

create or replace function sac.gcl_action_plan_upsert(
  p_audit_run_id uuid,
  p_issue_key text,
  p_label text,
  p_recommendation text default null,
  p_source_points numeric default null,
  p_status text default 'todo',
  p_note text default null
)
returns sac.action_plan_items
language plpgsql
security definer
set search_path = sac, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_domain uuid;
  v_row sac.action_plan_items;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  if p_status not in ('todo','in_progress','done','dismissed') then
    raise exception 'invalid_action_status';
  end if;

  if length(trim(coalesce(p_issue_key,''))) < 2
     or length(trim(coalesce(p_label,''))) < 2 then
    raise exception 'invalid_action_item';
  end if;

  if not sac.gcl_can_manage_audit(p_audit_run_id) then
    raise exception 'audit_access_denied';
  end if;

  select a.domain_id
    into v_domain
  from sac.audit_runs a
  where a.id = p_audit_run_id;

  insert into sac.action_plan_items(
    user_id,
    audit_run_id,
    domain_id,
    issue_key,
    label,
    recommendation,
    status,
    source_points,
    note,
    completed_at
  )
  values(
    v_uid,
    p_audit_run_id,
    v_domain,
    left(trim(p_issue_key),240),
    left(trim(p_label),500),
    nullif(left(trim(coalesce(p_recommendation,'')),4000),''),
    p_status,
    p_source_points,
    nullif(left(trim(coalesce(p_note,'')),2000),''),
    case when p_status = 'done' then now() else null end
  )
  on conflict(user_id,audit_run_id,issue_key)
  do update set
    label = excluded.label,
    recommendation = coalesce(excluded.recommendation,sac.action_plan_items.recommendation),
    status = excluded.status,
    source_points = coalesce(excluded.source_points,sac.action_plan_items.source_points),
    note = coalesce(excluded.note,sac.action_plan_items.note),
    completed_at = case
      when excluded.status = 'done' then coalesce(sac.action_plan_items.completed_at,now())
      else null
    end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function sac.gcl_action_plan_delete(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = sac, public, auth
as $$
declare
  v_count int;
begin
  delete from sac.action_plan_items
  where id = p_item_id
    and user_id = auth.uid();

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

grant execute on function sac.gcl_can_manage_audit(uuid)
  to authenticated, service_role;
grant execute on function sac.gcl_action_plan_list(uuid)
  to authenticated, service_role;
grant execute on function sac.gcl_action_plan_upsert(uuid,text,text,text,numeric,text,text)
  to authenticated, service_role;
grant execute on function sac.gcl_action_plan_delete(uuid)
  to authenticated, service_role;

revoke all on sac.action_plan_items from anon;
