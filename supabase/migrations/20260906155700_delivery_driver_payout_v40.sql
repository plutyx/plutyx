begin;

alter table public.deliveries
  add column if not exists driver_payout_cents integer not null default 0 check (driver_payout_cents >= 0);

commit;
