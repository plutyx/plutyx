begin;

create table if not exists public.direct_order_checkouts (
  order_id bigint primary key references public.orders(id) on delete cascade,
  business_id bigint not null references public.businesses(id) on delete cascade,
  zone_id bigint references public.delivery_zones(id) on delete set null,
  promo_id bigint references public.delivery_promos(id) on delete set null,
  fulfillment varchar(20) not null default 'delivery' check (fulfillment in ('delivery','pickup')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  base_delivery_fee_cents integer not null default 0 check (base_delivery_fee_cents >= 0),
  charged_delivery_fee_cents integer not null default 0 check (charged_delivery_fee_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  final_total_cents integer not null check (final_total_cents >= 0),
  scheduled_for timestamptz,
  quote_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ix_direct_checkouts_business_created on public.direct_order_checkouts(business_id,created_at desc);
create index if not exists ix_direct_checkouts_promo on public.direct_order_checkouts(promo_id) where promo_id is not null;

alter table public.direct_order_checkouts enable row level security;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all privileges on table public.direct_order_checkouts from %I',role_name);
    end if;
  end loop;
end $$;

create or replace function public.c360_finalize_direct_order_v40(
  p_order_id bigint,
  p_business_id bigint,
  p_zone_id bigint default null,
  p_promo_code text default null,
  p_fulfillment text default 'delivery',
  p_address_line text default null,
  p_neighborhood text default null,
  p_postal_code text default null,
  p_address_reference text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_scheduled_for timestamptz default null,
  p_brand_consent boolean default false,
  p_quote_snapshot jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders%rowtype;
  v_zone public.delivery_zones%rowtype;
  v_promo public.delivery_promos%rowtype;
  v_existing public.direct_order_checkouts%rowtype;
  v_delivery public.deliveries%rowtype;
  v_subtotal integer;
  v_base_fee integer:=0;
  v_charged_fee integer:=0;
  v_discount integer:=0;
  v_final integer;
  v_now timestamptz:=now();
  v_settings public.delivery_settings%rowtype;
begin
  if p_fulfillment not in ('delivery','pickup') then raise exception 'FULFILLMENT_INVALID'; end if;
  select * into v_order from public.orders where id=p_order_id and business_id=p_business_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_existing from public.direct_order_checkouts where order_id=p_order_id;
  if found then
    return jsonb_build_object('id',v_order.id,'status',v_order.status,'total_cents',v_existing.final_total_cents,'subtotal_cents',v_existing.subtotal_cents,'delivery_fee_cents',v_existing.charged_delivery_fee_cents,'discount_cents',v_existing.discount_cents,'idempotent_replay',true);
  end if;

  v_subtotal:=v_order.total_cents;
  select * into v_settings from public.delivery_settings where business_id=p_business_id;

  if p_fulfillment='delivery' then
    if p_zone_id is null then raise exception 'DELIVERY_ZONE_REQUIRED'; end if;
    select * into v_zone from public.delivery_zones
      where id=p_zone_id and business_id=p_business_id and active=true
        and (brand_id is null or v_order.brand_id is null or brand_id=v_order.brand_id)
      for share;
    if not found then raise exception 'DELIVERY_ZONE_INVALID'; end if;
    if v_subtotal < v_zone.min_order_cents then raise exception 'DELIVERY_MIN_ORDER'; end if;
    v_base_fee:=v_zone.fee_cents;
    if v_zone.free_delivery_over_cents>0 and v_subtotal>=v_zone.free_delivery_over_cents then v_charged_fee:=0; else v_charged_fee:=v_base_fee; end if;
    if p_scheduled_for is not null then
      if coalesce(v_settings.scheduled_orders_enabled,true)=false then raise exception 'SCHEDULED_ORDER_DISABLED'; end if;
      if p_scheduled_for < v_now then raise exception 'SCHEDULED_ORDER_PAST'; end if;
      if p_scheduled_for > v_now + make_interval(days=>coalesce(v_settings.max_scheduled_days,7)) then raise exception 'SCHEDULED_ORDER_TOO_FAR'; end if;
    end if;
  else
    p_zone_id:=null;
  end if;

  if nullif(upper(trim(coalesce(p_promo_code,''))),'') is not null then
    select * into v_promo from public.delivery_promos
      where business_id=p_business_id and upper(code)=upper(trim(p_promo_code)) and active=true
        and (brand_id is null or v_order.brand_id is null or brand_id=v_order.brand_id)
      for update;
    if not found then raise exception 'PROMO_INVALID'; end if;
    if v_promo.starts_at is not null and v_promo.starts_at>v_now then raise exception 'PROMO_NOT_STARTED'; end if;
    if v_promo.ends_at is not null and v_promo.ends_at<v_now then raise exception 'PROMO_EXPIRED'; end if;
    if v_promo.max_uses is not null and v_promo.used_count>=v_promo.max_uses then raise exception 'PROMO_LIMIT_REACHED'; end if;
    if v_subtotal < v_promo.min_order_cents then raise exception 'PROMO_MIN_ORDER'; end if;
    if v_promo.discount_type='percent' then v_discount:=least(v_subtotal,round(v_subtotal::numeric*least(v_promo.value,100)/100)::integer);
    elsif v_promo.discount_type='fixed' then v_discount:=least(v_subtotal,v_promo.value);
    elsif v_promo.discount_type='free_delivery' then v_discount:=v_charged_fee;
    end if;
    update public.delivery_promos set used_count=used_count+1 where id=v_promo.id;
  end if;

  v_final:=greatest(0,v_subtotal+v_charged_fee-v_discount);
  update public.orders set total_cents=v_final,contribution_cents=v_final-variable_cost_cents,updated_at=v_now where id=v_order.id returning * into v_order;

  if p_fulfillment='delivery' then
    insert into public.deliveries(
      business_id,order_id,zone_id,status,fee_cents,promised_at,address_line,neighborhood,postal_code,address_reference,
      latitude,longitude,scheduled_for,tracking_enabled
    ) values(
      p_business_id,p_order_id,p_zone_id,'waiting',v_charged_fee,
      coalesce(p_scheduled_for,v_now+make_interval(mins=>coalesce(v_zone.eta_min,coalesce(v_settings.default_eta_min,45)))),
      left(nullif(trim(coalesce(p_address_line,'')),''),300),left(nullif(trim(coalesce(p_neighborhood,'')),''),120),
      left(nullif(trim(coalesce(p_postal_code,'')),''),20),left(nullif(trim(coalesce(p_address_reference,'')),''),220),
      p_latitude,p_longitude,p_scheduled_for,coalesce(v_settings.customer_tracking_enabled,false)
    )
    on conflict(order_id) do update set
      zone_id=excluded.zone_id,fee_cents=excluded.fee_cents,promised_at=excluded.promised_at,address_line=excluded.address_line,
      neighborhood=excluded.neighborhood,postal_code=excluded.postal_code,address_reference=excluded.address_reference,
      latitude=excluded.latitude,longitude=excluded.longitude,scheduled_for=excluded.scheduled_for,tracking_enabled=excluded.tracking_enabled
    returning * into v_delivery;
  end if;

  if p_brand_consent and v_order.customer_id is not null and v_order.brand_id is not null then
    insert into public.customer_brand_profiles(business_id,brand_id,customer_id,consent_marketing,opted_out_at)
    values(p_business_id,v_order.brand_id,v_order.customer_id,true,null)
    on conflict(business_id,brand_id,customer_id) do update set consent_marketing=true,opted_out_at=null;
  end if;

  insert into public.direct_order_checkouts(
    order_id,business_id,zone_id,promo_id,fulfillment,subtotal_cents,base_delivery_fee_cents,charged_delivery_fee_cents,
    discount_cents,final_total_cents,scheduled_for,quote_snapshot
  ) values(
    p_order_id,p_business_id,p_zone_id,case when v_promo.id is null then null else v_promo.id end,p_fulfillment,v_subtotal,v_base_fee,v_charged_fee,
    v_discount,v_final,p_scheduled_for,coalesce(p_quote_snapshot,'{}'::jsonb)
  );

  insert into public.outbox_events(business_id,topic,payload_json)
  values(p_business_id,'direct.order.checkout.finalized',jsonb_build_object('order_id',p_order_id,'fulfillment',p_fulfillment,'zone_id',p_zone_id,'promo_id',case when v_promo.id is null then null else v_promo.id end,'final_total_cents',v_final)::text);

  return jsonb_build_object('id',v_order.id,'status',v_order.status,'total_cents',v_final,'subtotal_cents',v_subtotal,'delivery_fee_cents',v_charged_fee,'base_delivery_fee_cents',v_base_fee,'discount_cents',v_discount,'delivery_id',case when v_delivery.id is null then null else v_delivery.id end,'promised_at',case when v_delivery.id is null then null else v_delivery.promised_at end,'idempotent_replay',false);
end $$;

revoke all on function public.c360_finalize_direct_order_v40(bigint,bigint,bigint,text,text,text,text,text,text,numeric,numeric,timestamptz,boolean,jsonb) from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then revoke all on function public.c360_finalize_direct_order_v40(bigint,bigint,bigint,text,text,text,text,text,text,numeric,numeric,timestamptz,boolean,jsonb) from anon; end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on function public.c360_finalize_direct_order_v40(bigint,bigint,bigint,text,text,text,text,text,text,numeric,numeric,timestamptz,boolean,jsonb) from authenticated; end if;
  if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.c360_finalize_direct_order_v40(bigint,bigint,bigint,text,text,text,text,text,text,numeric,numeric,timestamptz,boolean,jsonb) to service_role; end if;
end $$;

commit;
