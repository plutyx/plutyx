alter table public.businesses
  add column if not exists default_kds_sla_minutes integer not null default 20;

alter table public.products
  add column if not exists prep_sla_minutes integer;

alter table public.channels
  add column if not exists order_sla_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_default_kds_sla_minutes_check'
  ) then
    alter table public.businesses
      add constraint businesses_default_kds_sla_minutes_check
      check (default_kds_sla_minutes between 5 and 240);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_prep_sla_minutes_check'
  ) then
    alter table public.products
      add constraint products_prep_sla_minutes_check
      check (prep_sla_minutes is null or prep_sla_minutes between 1 and 240);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'channels_order_sla_minutes_check'
  ) then
    alter table public.channels
      add constraint channels_order_sla_minutes_check
      check (order_sla_minutes is null or order_sla_minutes between 1 and 360);
  end if;
end $$;

comment on column public.businesses.default_kds_sla_minutes is
  'Default kitchen SLA in minutes when product/channel overrides are not configured.';
comment on column public.products.prep_sla_minutes is
  'Optional expected preparation SLA in minutes for this product.';
comment on column public.channels.order_sla_minutes is
  'Optional maximum order SLA in minutes promised for this sales channel.';
