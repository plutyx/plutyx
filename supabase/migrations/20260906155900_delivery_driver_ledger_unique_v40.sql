begin;

drop index if exists public.ux_driver_ledger_delivery_fee_once;
create unique index if not exists ux_driver_ledger_delivery_entry
  on public.delivery_driver_ledger(delivery_id, entry_type);

commit;
