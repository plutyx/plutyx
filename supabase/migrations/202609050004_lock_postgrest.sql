begin;

alter function public.touch_updated_at() set search_path = public;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','businesses','memberships','team_invites','ingredients','suppliers','purchases','products','recipe_items',
    'channels','product_channel_prices','customers','orders','order_items','production_batches','losses','capacity_steps',
    'audit_logs','webhook_events','outbox_events'
  ]
  LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    EXECUTE format('revoke all privileges on table public.%I from anon, authenticated', t);
  END LOOP;
END $$;

revoke all privileges on all sequences in schema public from anon, authenticated;

commit;
