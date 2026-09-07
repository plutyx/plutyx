revoke execute on function public.c360_validate_brand_fiscal_profile() from public, anon, authenticated;
revoke execute on function public.c360_validate_brand_integration_binding() from public, anon, authenticated;

grant execute on function public.c360_validate_brand_fiscal_profile() to service_role;
grant execute on function public.c360_validate_brand_integration_binding() to service_role;
