do $$
declare
  vdef text;
  v_cron_ok boolean;
begin
  select exists (
    select 1
    from cron.job
    where active
      and command ilike '%refresh_autonomous_ranking()%'
  ) into v_cron_ok;

  if not v_cron_ok then
    raise exception 'autonomous_ranking_refresh_cron_required';
  end if;

  vdef := pg_get_functiondef('public.sac_api_deep_report_core(uuid)'::regprocedure);

  if position('perform sac.refresh_autonomous_ranking();' in vdef) = 0 then
    raise exception 'expected_refresh_call_not_found';
  end if;

  vdef := replace(vdef, E'  perform sac.refresh_autonomous_ranking();\n', '');
  execute vdef;
end
$$;

comment on function public.sac_api_deep_report_core(uuid) is
'GCL deep report core v77: read-only report hydration no longer refreshes the global autonomous ranking synchronously; ranking freshness is maintained by the active cron refresh.';
