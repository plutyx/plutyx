begin;

revoke all on function public.c360_emit_purchase_conversion() from public;

do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on function public.c360_emit_purchase_conversion() from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on function public.c360_emit_purchase_conversion() from authenticated;
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.c360_emit_purchase_conversion() to service_role;
  end if;
end $$;

commit;
