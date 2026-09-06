begin;

revoke all on function public.c360_emit_purchase_conversion() from public, anon, authenticated;
grant execute on function public.c360_emit_purchase_conversion() to service_role;

commit;
