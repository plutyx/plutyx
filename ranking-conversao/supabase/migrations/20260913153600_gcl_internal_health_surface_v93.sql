-- GCL v93 — keep raw queue/worker telemetry internal.
-- Trusted SECURITY DEFINER callers can still consume these helpers as owner;
-- direct PostgREST execution by anon/authenticated clients is unnecessary.

revoke all on function public.gcl_scan_queue_health() from public, anon, authenticated;
revoke all on function public.gcl_worker_capacity_health() from public, anon, authenticated;

grant execute on function public.gcl_scan_queue_health() to service_role;
grant execute on function public.gcl_worker_capacity_health() to service_role;

comment on function public.gcl_scan_queue_health() is
  'Internal queue telemetry helper. Client execution revoked; consumed only by trusted SECURITY DEFINER surfaces.';
comment on function public.gcl_worker_capacity_health() is
  'Internal worker-capacity telemetry helper. Client execution revoked; consumed only by trusted aggregate health surfaces.';
