begin;

create or replace function public.c360_record_inventory_count_v50(
  p_business_id bigint,
  p_ingredient_id bigint,
  p_user_id bigint,
  p_counted_milliunits integer,
  p_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ingredient public.ingredients%rowtype;
  v_count public.inventory_counts%rowtype;
  v_previous integer;
begin
  if p_counted_milliunits is null or p_counted_milliunits < 0 then
    raise exception 'INVALID_COUNT';
  end if;

  select * into v_ingredient
    from public.ingredients
   where id = p_ingredient_id
     and business_id = p_business_id
     and soft_deleted = false
   for update;

  if not found then
    raise exception 'INGREDIENT_NOT_FOUND';
  end if;

  v_previous := coalesce(v_ingredient.on_hand_milliunits,0);

  insert into public.inventory_counts(
    business_id,ingredient_id,counted_by_user_id,counted_milliunits,note
  ) values (
    p_business_id,p_ingredient_id,p_user_id,p_counted_milliunits,left(coalesce(p_note,''),500)
  ) returning * into v_count;

  update public.ingredients
     set on_hand_milliunits = p_counted_milliunits,
         version = coalesce(version,1) + 1,
         updated_at = now()
   where id = p_ingredient_id;

  insert into public.audit_logs(
    business_id,actor_user_id,action,entity_type,entity_id,payload_json
  ) values (
    p_business_id,p_user_id,'inventory.counted','inventory_count',v_count.id::text,
    jsonb_build_object(
      'ingredient_id',p_ingredient_id,
      'system_before_milliunits',v_previous,
      'physical_count_milliunits',p_counted_milliunits,
      'adjustment_milliunits',p_counted_milliunits-v_previous
    )::text
  );

  return jsonb_build_object(
    'id',v_count.id,
    'ingredient_id',p_ingredient_id,
    'system_before_milliunits',v_previous,
    'counted_milliunits',p_counted_milliunits,
    'adjustment_milliunits',p_counted_milliunits-v_previous,
    'ingredient_version',coalesce(v_ingredient.version,1)+1,
    'created_at',v_count.created_at
  );
end;
$$;

revoke all on function public.c360_record_inventory_count_v50(bigint,bigint,bigint,integer,text) from public;
do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on function public.c360_record_inventory_count_v50(bigint,bigint,bigint,integer,text) from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on function public.c360_record_inventory_count_v50(bigint,bigint,bigint,integer,text) from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.c360_record_inventory_count_v50(bigint,bigint,bigint,integer,text) to service_role';
  end if;
end $$;

commit;
