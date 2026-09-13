-- GCL v92 — restrict administrative SECURITY DEFINER RPCs to service_role.
-- These functions are consumed by trusted aggregate/internal surfaces and must
-- not be directly executable through PostgREST by anon/authenticated clients.

revoke all on function public.gcl_commercial_release_status() from public, anon, authenticated;
revoke all on function public.gcl_external_control_readiness() from public, anon, authenticated;

grant execute on function public.gcl_commercial_release_status() to service_role;
grant execute on function public.gcl_external_control_readiness() to service_role;

comment on function public.gcl_commercial_release_status() is
  'GCL internal commercial release status. Direct client execution revoked; use trusted aggregate surfaces.';
comment on function public.gcl_external_control_readiness() is
  'GCL internal external-control readiness. Direct client execution revoked; use trusted aggregate surfaces.';
