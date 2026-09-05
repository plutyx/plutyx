begin;

create index if not exists ix_orders_business_customer_completed
  on public.orders(business_id, customer_id, completed_at desc)
  where customer_id is not null and status = 'completed';

create or replace function public.c360_customer_lifecycle(
  p_business_id bigint,
  p_dormant_days integer default 30
) returns table(
  customer_id bigint,
  customer_name text,
  phone text,
  email text,
  can_contact boolean,
  completed_orders bigint,
  revenue_cents bigint,
  contribution_cents bigint,
  first_order_at timestamptz,
  last_order_at timestamptz,
  days_since_last_order integer,
  segment text,
  suggested_action text
)
language sql
security definer
set search_path = public
stable
as $$
  with customer_orders as (
    select
      c.id as customer_id,
      c.name as customer_name,
      c.phone,
      c.email,
      (c.consent_marketing and c.opted_out_at is null) as can_contact,
      count(o.id) filter (where o.status='completed') as completed_orders,
      coalesce(sum(o.total_cents) filter (where o.status='completed'),0)::bigint as revenue_cents,
      coalesce(sum(o.contribution_cents) filter (where o.status='completed'),0)::bigint as contribution_cents,
      min(coalesce(o.completed_at,o.created_at)) filter (where o.status='completed') as first_order_at,
      max(coalesce(o.completed_at,o.created_at)) filter (where o.status='completed') as last_order_at
    from public.customers c
    left join public.orders o
      on o.business_id=c.business_id and o.customer_id=c.id
    where c.business_id=p_business_id
    group by c.id,c.name,c.phone,c.email,c.consent_marketing,c.opted_out_at
  ), classified as (
    select
      co.*,
      case
        when co.last_order_at is null then null
        else greatest(0, floor(extract(epoch from (now()-co.last_order_at))/86400)::integer)
      end as days_since_last_order,
      case
        when co.completed_orders=0 then 'prospect'
        when co.last_order_at < now() - make_interval(days => greatest(1,coalesce(p_dormant_days,30))) then 'dormant'
        when co.completed_orders=1 then 'new'
        else 'repeat'
      end as segment
    from customer_orders co
  )
  select
    x.customer_id,
    x.customer_name::text,
    x.phone::text,
    x.email::text,
    x.can_contact,
    x.completed_orders,
    x.revenue_cents,
    x.contribution_cents,
    x.first_order_at,
    x.last_order_at,
    x.days_since_last_order,
    x.segment,
    case
      when not x.can_contact then 'do_not_contact'
      when x.segment='dormant' then 'win_back'
      when x.segment='new' then 'second_order'
      when x.segment='repeat' then 'retain'
      else 'await_first_order'
    end::text as suggested_action
  from classified x
  order by
    case x.segment when 'dormant' then 1 when 'new' then 2 when 'repeat' then 3 else 4 end,
    x.last_order_at nulls last,
    x.customer_name;
$$;

revoke all on function public.c360_customer_lifecycle(bigint,integer) from public;
do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.c360_customer_lifecycle(bigint,integer) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.c360_customer_lifecycle(bigint,integer) from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.c360_customer_lifecycle(bigint,integer) to service_role';
  end if;
end $$;

commit;
