begin;

-- Dedicated server-only key for the WhatsApp reconciliation worker.
-- Outside Supabase Vault this verifier fails closed instead of breaking plain PostgreSQL.
create or replace function public.c360_verify_whatsapp_worker_key(p_value text)
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
    using 'c360_whatsapp_worker_key', p_value;
  exception
    when undefined_table or invalid_schema_name then
      return false;
  end;

  return coalesce(v_ok, false);
end;
$function$;

revoke all on function public.c360_verify_whatsapp_worker_key(text) from public;
do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.c360_verify_whatsapp_worker_key(text) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.c360_verify_whatsapp_worker_key(text) from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.c360_verify_whatsapp_worker_key(text) to service_role';
  end if;
end $$;

-- Generate the worker key only on Supabase installations with Vault.
do $$
declare
  v_missing boolean := false;
begin
  if to_regnamespace('vault') is null then
    raise notice 'Skipping WhatsApp worker secret: Vault unavailable';
    return;
  end if;

  begin
    execute $sql$
      select not exists(
        select 1 from vault.secrets where name = 'c360_whatsapp_worker_key'
      )
    $sql$ into v_missing;
  exception
    when undefined_table or invalid_schema_name then
      raise notice 'Skipping WhatsApp worker secret: Vault tables unavailable';
      return;
  end;

  if v_missing then
    execute $sql$
      select vault.create_secret(
        replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
        'c360_whatsapp_worker_key',
        'Cozinha 360 WhatsApp reconciliation worker'
      )
    $sql$;
  end if;
end $$;

-- Reconcile server-side only when the Supabase runtime capabilities exist.
do $$
declare
  v_job_id bigint;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
     or not exists(select 1 from pg_extension where extname='pg_net')
     or to_regnamespace('vault') is null then
    raise notice 'Skipping WhatsApp reconcile schedule: pg_cron/pg_net/Vault unavailable';
    return;
  end if;

  select jobid into v_job_id
    from cron.job
   where jobname='c360-whatsapp-reconcile-5m'
   limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'c360-whatsapp-reconcile-5m',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-whatsapp-v74/reconcile',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-c360-whatsapp-key',(
            select decrypted_secret
              from vault.decrypted_secrets
             where name='c360_whatsapp_worker_key'
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
