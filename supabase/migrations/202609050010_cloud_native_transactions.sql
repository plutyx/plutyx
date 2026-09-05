begin;

create or replace function public.c360_create_order(
  p_business_id bigint,
  p_source text,
  p_paid boolean,
  p_customer_id bigint,
  p_channel_id bigint,
  p_items jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.orders%rowtype;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_total integer := 0;
  v_cost integer := 0;
  v_qty integer;
  v_price integer;
  v_unit_cost integer;
begin
  if p_idempotency_key is not null and length(p_idempotency_key) > 0 then
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || p_idempotency_key, 0));
    select * into v_existing
      from public.orders
     where business_id = p_business_id
       and idempotency_key = p_idempotency_key
     limit 1;
    if found then
      return jsonb_build_object('id',v_existing.id,'version',v_existing.version,'idempotent_replay',true);
    end if;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_ITEMS_REQUIRED';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(coalesce((v_item->>'quantity')::integer,1),1);
    v_price := greatest(coalesce((v_item->>'unit_price_cents')::integer,0),0);
    v_unit_cost := greatest(coalesce((v_item->>'unit_variable_cost_cents')::integer,0),0);
    v_total := v_total + v_qty * v_price;
    v_cost := v_cost + v_qty * v_unit_cost;
  end loop;

  insert into public.orders(
    business_id,customer_id,channel_id,status,source,total_cents,
    variable_cost_cents,contribution_cents,paid,idempotency_key
  ) values (
    p_business_id,p_customer_id,p_channel_id,'new',coalesce(nullif(p_source,''),'manual'),
    v_total,v_cost,v_total-v_cost,coalesce(p_paid,false),nullif(p_idempotency_key,'')
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items(
      business_id,order_id,product_id,quantity,unit_price_cents,unit_variable_cost_cents
    ) values (
      p_business_id,
      v_order.id,
      (v_item->>'product_id')::bigint,
      greatest(coalesce((v_item->>'quantity')::integer,1),1),
      greatest(coalesce((v_item->>'unit_price_cents')::integer,0),0),
      greatest(coalesce((v_item->>'unit_variable_cost_cents')::integer,0),0)
    );
  end loop;

  insert into public.outbox_events(business_id,topic,payload_json)
  values(p_business_id,'order.created',jsonb_build_object('order_id',v_order.id)::text);

  return jsonb_build_object(
    'id',v_order.id,
    'version',v_order.version,
    'total_cents',v_total,
    'variable_cost_cents',v_cost,
    'contribution_cents',v_total-v_cost,
    'idempotent_replay',false
  );
end;
$$;

create or replace function public.c360_set_recipe(
  p_business_id bigint,
  p_product_id bigint,
  p_items jsonb,
  p_actor_user_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if not exists(
    select 1 from public.products
     where id = p_product_id
       and business_id = p_business_id
       and soft_deleted = false
  ) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_RECIPE';
  end if;

  delete from public.recipe_items where product_id = p_product_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not exists(
      select 1 from public.ingredients
       where id = (v_item->>'ingredient_id')::bigint
         and business_id = p_business_id
         and soft_deleted = false
    ) then
      raise exception 'INGREDIENT_NOT_FOUND';
    end if;

    insert into public.recipe_items(product_id,ingredient_id,qty_used_milliunits)
    values(
      p_product_id,
      (v_item->>'ingredient_id')::bigint,
      greatest((v_item->>'qty_used_milliunits')::integer,1)
    );
    v_count := v_count + 1;
  end loop;

  update public.products
     set version = version + 1,
         updated_at = now()
   where id = p_product_id;

  insert into public.audit_logs(
    business_id,actor_user_id,action,entity_type,entity_id,payload_json
  ) values (
    p_business_id,p_actor_user_id,'recipe.updated','product',p_product_id::text,
    jsonb_build_object('items',v_count)::text
  );

  return jsonb_build_object('product_id',p_product_id,'items',v_count);
end;
$$;

create or replace function public.c360_complete_order(
  p_business_id bigint,
  p_order_id bigint,
  p_expected_version integer,
  p_actor_user_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_row record;
  v_total_qty integer;
  v_per_unit integer;
begin
  select * into v_order
    from public.orders
   where id = p_order_id
     and business_id = p_business_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status = 'completed' then
    return jsonb_build_object(
      'id',v_order.id,'version',v_order.version,'status',v_order.status,'already_completed',true
    );
  end if;

  if v_order.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  if not v_order.inventory_consumed then
    insert into public.order_completion_snapshots(business_id,order_id)
    values(p_business_id,p_order_id)
    on conflict(order_id) do nothing;

    for v_row in
      select
        oi.id as order_item_id,
        oi.product_id,
        oi.quantity as ordered_quantity,
        ri.ingredient_id,
        ri.qty_used_milliunits,
        p.units_per_batch
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      join public.recipe_items ri on ri.product_id = oi.product_id
      where oi.order_id = p_order_id
        and oi.business_id = p_business_id
    loop
      v_per_unit := greatest(
        round(v_row.qty_used_milliunits::numeric / greatest(v_row.units_per_batch,1))::integer,0
      );
      v_total_qty := greatest(
        round((v_row.qty_used_milliunits::numeric * v_row.ordered_quantity) / greatest(v_row.units_per_batch,1))::integer,0
      );

      insert into public.order_recipe_snapshots(
        business_id,order_id,order_item_id,product_id,ingredient_id,
        ordered_quantity,qty_per_unit_milliunits,total_qty_milliunits
      ) values (
        p_business_id,p_order_id,v_row.order_item_id,v_row.product_id,v_row.ingredient_id,
        v_row.ordered_quantity,v_per_unit,v_total_qty
      ) on conflict do nothing;

      update public.ingredients
         set on_hand_milliunits = on_hand_milliunits - v_total_qty,
             version = version + 1,
             updated_at = now()
       where id = v_row.ingredient_id
         and business_id = p_business_id;
    end loop;
  end if;

  update public.orders
     set status = 'completed',
         paid = true,
         inventory_consumed = true,
         completed_at = coalesce(completed_at,now()),
         version = version + 1,
         updated_at = now()
   where id = p_order_id
   returning * into v_order;

  insert into public.audit_logs(
    business_id,actor_user_id,action,entity_type,entity_id,payload_json
  ) values (
    p_business_id,p_actor_user_id,'order.completed','order',p_order_id::text,
    jsonb_build_object('version',v_order.version)::text
  );

  insert into public.outbox_events(business_id,topic,payload_json)
  values(p_business_id,'order.completed',jsonb_build_object('order_id',p_order_id)::text);

  return jsonb_build_object(
    'id',v_order.id,'version',v_order.version,'status',v_order.status,'already_completed',false
  );
end;
$$;

revoke all on function public.c360_create_order(bigint,text,boolean,bigint,bigint,jsonb,text)
  from public;
revoke all on function public.c360_set_recipe(bigint,bigint,jsonb,bigint)
  from public;
revoke all on function public.c360_complete_order(bigint,bigint,integer,bigint)
  from public;

-- Supabase roles do not exist in vanilla PostgreSQL CI. Grant only when present.
do $$
begin
  if exists(select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.c360_create_order(bigint,text,boolean,bigint,bigint,jsonb,text) from anon';
    execute 'revoke all on function public.c360_set_recipe(bigint,bigint,jsonb,bigint) from anon';
    execute 'revoke all on function public.c360_complete_order(bigint,bigint,integer,bigint) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.c360_create_order(bigint,text,boolean,bigint,bigint,jsonb,text) from authenticated';
    execute 'revoke all on function public.c360_set_recipe(bigint,bigint,jsonb,bigint) from authenticated';
    execute 'revoke all on function public.c360_complete_order(bigint,bigint,integer,bigint) from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.c360_create_order(bigint,text,boolean,bigint,bigint,jsonb,text) to service_role';
    execute 'grant execute on function public.c360_set_recipe(bigint,bigint,jsonb,bigint) to service_role';
    execute 'grant execute on function public.c360_complete_order(bigint,bigint,integer,bigint) to service_role';
  end if;
end $$;

commit;
