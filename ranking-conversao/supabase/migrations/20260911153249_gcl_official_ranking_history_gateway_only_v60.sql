revoke all on function public.gcl_official_ranking_history(text,text,integer) from public, anon, authenticated;
grant execute on function public.gcl_official_ranking_history(text,text,integer) to service_role, postgres;

comment on function public.gcl_official_ranking_history(text,text,integer) is 'Internal GCL official ranking history reader. Direct browser/PostgREST execution is disabled; public product surfaces must use the server-side GCL gateway.';
