begin;

create table if not exists public.integration_health_states (
  connection_id bigint primary key references public.integration_connections(id) on delete cascade,
  business_id bigint not null references public.businesses(id) on delete cascade,
  provider varchar(40) not null,
  state varchar(20) not null default 'healthy'
    check (state in ('healthy','degrading','review','recovered')),
  strategy varchar(20) not null default 'probe'
    check (strategy in ('probe','signal')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_checked_at timestamptz,
  last_probe_ok_at timestamptz,
  last_probe_error_at timestamptz,
  last_probe_error text,
  last_transition_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_integration_health_business
  on public.integration_health_states(business_id, provider);
create index if not exists ix_integration_health_due
  on public.integration_health_states(next_check_at)
  where next_check_at is not null;

alter table public.integration_health_states enable row level security;

revoke all privileges on table public.integration_health_states from public;
do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all privileges on table public.integration_health_states from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all privileges on table public.integration_health_states from authenticated';
  end if;
end $$;

comment on table public.integration_health_states is
  'Server-owned automatic integration pulse. Probe failures never overwrite operational integration_errors/last_error.';
comment on column public.integration_health_states.last_probe_error is
  'Health-probe error only. Operational event errors remain on integration_connections/integration_events.';

create or replace function public.c360_verify_health_worker_key(p_value text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(exists(
    select 1
      from vault.decrypted_secrets
     where name='c360_health_worker_key'
       and decrypted_secret = p_value
  ),false);
$function$;

revoke all on function public.c360_verify_health_worker_key(text) from public;
do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.c360_verify_health_worker_key(text) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.c360_verify_health_worker_key(text) from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.c360_verify_health_worker_key(text) to service_role';
  end if;
end $$;

-- The health worker has a dedicated Vault key. Its value never leaves Postgres.
do $$
begin
  if to_regnamespace('vault') is not null
     and not exists(select 1 from vault.secrets where name='c360_health_worker_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'c360_health_worker_key',
      'Internal key for the Cozinha 360 integration health worker'
    );
  end if;
end $$;

-- Replace the schedule idempotently. iFood itself is not polled here: the worker
-- only reads the presence signal already produced by c360-ifood-poll-30s.
do $$
declare
  v_job_id bigint;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
     or not exists(select 1 from pg_extension where extname='pg_net')
     or to_regnamespace('vault') is null then
    raise notice 'Skipping health schedule: pg_cron/pg_net/Vault unavailable';
    return;
  end if;

  select jobid into v_job_id
    from cron.job
   where jobname='c360-integration-health-5m';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'c360-integration-health-5m',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integration-health-v73/run',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-c360-health-key',(
            select decrypted_secret
              from vault.decrypted_secrets
             where name='c360_health_worker_key'
             limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
      );
    $cron$
  );
end $$;

commit;
