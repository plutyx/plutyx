revoke execute on function public.c360_validate_brand_fiscal_profile() from public;
revoke execute on function public.c360_validate_brand_integration_binding() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.c360_validate_brand_fiscal_profile() from anon';
    execute 'revoke execute on function public.c360_validate_brand_integration_binding() from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.c360_validate_brand_fiscal_profile() from authenticated';
    execute 'revoke execute on function public.c360_validate_brand_integration_binding() from authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.c360_validate_brand_fiscal_profile() to service_role';
    execute 'grant execute on function public.c360_validate_brand_integration_binding() to service_role';
  end if;
end $$;
