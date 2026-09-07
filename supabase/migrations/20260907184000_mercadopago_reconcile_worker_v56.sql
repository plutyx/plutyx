begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

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

revoke all on function public.c360_verify_payments_worker_key(text) from public;
revoke all on function public.c360_verify_payments_worker_key(text) from anon;
revoke all on function public.c360_verify_payments_worker_key(text) from authenticated;
grant execute on function public.c360_verify_payments_worker_key(text) to service_role;

do $$
begin
  if not exists(select 1 from vault.secrets where name='c360_payments_worker_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'c360_payments_worker_key');
  end if;
end $$;

do $$
declare
  v_job_id bigint;
begin
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
