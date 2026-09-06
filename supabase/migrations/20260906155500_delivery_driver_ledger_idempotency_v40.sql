begin;

create unique index if not exists ux_driver_ledger_delivery_fee_once
  on public.delivery_driver_ledger(delivery_id, entry_type)
  where delivery_id is not null and entry_type='delivery_fee';

commit;
