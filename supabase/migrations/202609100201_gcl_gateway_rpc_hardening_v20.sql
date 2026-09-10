-- GCL v20: keep gateway-only RPCs behind Edge Functions/service_role.
alter function sac.community_reaction_weight(text) set search_path = sac, public;

revoke execute on function public.gcl_award_verify(text) from public, anon, authenticated;
revoke execute on function public.gcl_awards_methodology() from public, anon, authenticated;
revoke execute on function public.gcl_benchmark_deepening_status() from public, anon, authenticated;
revoke execute on function public.gcl_capture_analysis_interest(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke execute on function public.gcl_market_request(text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke execute on function public.gcl_analysis_checkout_url(uuid,boolean) from public, anon, authenticated;

grant execute on function public.gcl_award_verify(text) to service_role;
grant execute on function public.gcl_awards_methodology() to service_role;
grant execute on function public.gcl_benchmark_deepening_status() to service_role;
grant execute on function public.gcl_capture_analysis_interest(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.gcl_market_request(text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.gcl_analysis_checkout_url(uuid,boolean) to service_role;
