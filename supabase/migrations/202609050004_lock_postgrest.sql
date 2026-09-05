begin;

alter function public.touch_updated_at() set search_path = public;

DO $$
DECLARE
  t text;
  has_anon boolean := exists(select 1 from pg_roles where rolname='anon');
  has_authenticated boolean := exists(select 1 from pg_roles where rolname='authenticated');
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','businesses','memberships','team_invites','ingredients','suppliers','purchases','products','recipe_items',
    'channels','product_channel_prices','customers','orders','order_items','production_batches','losses','capacity_steps',
    'audit_logs','webhook_events','outbox_events'
  ]
  LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    IF has_anon THEN
      EXECUTE format('revoke all privileges on table public.%I from anon', t);
    END IF;
    IF has_authenticated THEN
      EXECUTE format('revoke all privileges on table public.%I from authenticated', t);
    END IF;
  END LOOP;

  IF has_anon THEN
    EXECUTE 'revoke all privileges on all sequences in schema public from anon';
  END IF;
  IF has_authenticated THEN
    EXECUTE 'revoke all privileges on all sequences in schema public from authenticated';
  END IF;
END $$;

commit;
