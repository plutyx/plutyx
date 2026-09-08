begin;

-- Dedicated server-only key for the Google Business Profile reconcile worker.
-- The function is portable: outside Supabase Vault it simply returns false.
create or replace function public.c360_verify_google_worker_key(p_value text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ok boolean := false;
begin
  if to_regnamespace('vault') is null then
    return false;
  end if;

  begin
    execute $sql$
      select coalesce(exists(
        select 1
          from vault.decrypted_secrets
         where name = $1
           and decrypted_secret = $2
      ), false)
    $sql$
    into v_ok
    using 'c360_google_worker_key', p_value;
  exception
    when undefined_table or invalid_schema_name then
      return false;
  end;

  return coalesce(v_ok, false);
end;
$function$;

revoke all on function public.c360_verify_google_worker_key(text) from public;
do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.c360_verify_google_worker_key(text) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.c360_verify_google_worker_key(text) from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.c360_verify_google_worker_key(text) to service_role';
  end if;
end $$;

-- Generate the worker key only on Supabase installations with Vault.
do $$
declare
  v_missing boolean := false;
begin
  if to_regnamespace('vault') is null then
    raise notice 'Skipping Google worker secret: Vault unavailable';
    return;
  end if;

  begin
    execute $sql$
      select not exists(
        select 1 from vault.secrets where name = 'c360_google_worker_key'
      )
    $sql$ into v_missing;
  exception
    when undefined_table or invalid_schema_name then
      raise notice 'Skipping Google worker secret: Vault tables unavailable';
      return;
  end;

  if v_missing then
    execute $sql$
      select vault.create_secret(
        encode(gen_random_bytes(32),'hex'),
        'c360_google_worker_key',
        'Internal key for Cozinha 360 Google Business Profile reconciliation'
      )
    $sql$;
  end if;
end $$;

-- Server-side reconciliation keeps locations/reviews fresh without browser probes.
-- Skip cleanly in plain PostgreSQL where pg_cron/pg_net/Vault do not exist.
do $$
declare
  v_job_id bigint;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
     or not exists(select 1 from pg_extension where extname='pg_net')
     or to_regnamespace('vault') is null then
    raise notice 'Skipping Google reconcile schedule: pg_cron/pg_net/Vault unavailable';
    return;
  end if;

  select jobid into v_job_id
    from cron.job
   where jobname='c360-google-business-15m';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'c360-google-business-15m',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-google-business-v75/reconcile',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-c360-google-key',(
            select decrypted_secret
              from vault.decrypted_secrets
             where name='c360_google_worker_key'
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
