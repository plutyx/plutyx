begin;

create extension if not exists pgcrypto;

-- Reconciliation scheduling is a Supabase capability. On plain PostgreSQL this
-- migration becomes a safe no-op so domain CI does not depend on pg_cron/Vault.
do $$
declare
  platform_ready boolean;
begin
  platform_ready :=
    exists(select 1 from pg_available_extensions where name='pg_cron')
    and exists(select 1 from pg_available_extensions where name='pg_net')
    and to_regnamespace('vault') is not null
    and exists(select 1 from pg_roles where rolname='service_role');

  if not platform_ready then
    raise notice 'Skipping Supabase Mercado Pago reconciler scheduling: pg_cron/pg_net/Vault unavailable';
    return;
  end if;

  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';

  execute $sql$
    create or replace function public.c360_verify_payments_worker_key(p_value text)
    returns boolean
    language sql
    security definer
    set search_path to 'public'
    as $function$
      select coalesce(exists(
        select 1
          from vault.decrypted_secrets
         where name='c360_payments_worker_key'
           and decrypted_secret = p_value
      ),false);
    $function$;
  $sql$;

  execute 'revoke all on function public.c360_verify_payments_worker_key(text) from public';
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.c360_verify_payments_worker_key(text) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.c360_verify_payments_worker_key(text) from authenticated';
  end if;
  execute 'grant execute on function public.c360_verify_payments_worker_key(text) to service_role';

  if not exists(select 1 from vault.secrets where name='c360_payments_worker_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'c360_payments_worker_key');
  end if;
end $$;

do $$
declare
  platform_ready boolean;
  v_job_id bigint;
begin
  platform_ready :=
    exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net')
    and to_regnamespace('vault') is not null;

  if not platform_ready then
    return;
  end if;

  select jobid into v_job_id from cron.job where jobname='c360-mercadopago-reconcile-60s';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'c360-mercadopago-reconcile-60s',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-payments-v56/reconcile',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-c360-worker-key',(
            select decrypted_secret
              from vault.decrypted_secrets
             where name='c360_payments_worker_key'
             limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $cron$
  );
end $$;

commit;
