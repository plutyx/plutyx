do $$
begin
  if not exists (select 1 from vault.secrets where name='c360_whatsapp_worker_key') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      'c360_whatsapp_worker_key',
      'Cozinha 360 WhatsApp reconciliation worker'
    );
  end if;
end $$;

create or replace function public.c360_verify_whatsapp_worker_key(p_value text)
returns boolean
language sql
security definer
set search_path=public
as $$
  select coalesce(exists(
    select 1
      from vault.decrypted_secrets
     where name='c360_whatsapp_worker_key'
       and decrypted_secret=p_value
  ),false);
$$;

revoke all on function public.c360_verify_whatsapp_worker_key(text) from public, anon, authenticated;
grant execute on function public.c360_verify_whatsapp_worker_key(text) to service_role;

do $$
declare v_job_id bigint;
begin
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
