CREATE OR REPLACE FUNCTION public.gcl_public_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'sac'
AS $function$
declare
  p jsonb;
  q jsonb;
  v_live_products int:=0;
  v_test_products int:=0;
  v_webhook_ok boolean:=false;
  v_ranking_ok boolean:=false;
  v_queue_open boolean:=false;
  v_machine_ready boolean:=false;
  v_machine_blockers jsonb:='[]'::jsonb;
begin
  p:=sac.ops_health_payload();
  q:=public.gcl_scan_queue_health();

  select count(*) filter(where provider_environment='live' and checkout_url is not null and status='active')::int,
         count(*) filter(where provider_environment='test' and checkout_url is not null and status in('draft','active'))::int
  into v_live_products,v_test_products
  from sac.commercial_products;

  v_webhook_ok:=coalesce((p->'payments'->>'webhook_failed_15m')::int,0)=0;
  v_ranking_ok:=coalesce((p->'ranking'->>'cache_age_seconds')::numeric,999999)<=300;
  v_queue_open:=coalesce(q->>'admission_state','')='open';
  v_machine_ready:=v_live_products>0 and v_webhook_ok and v_ranking_ok and v_queue_open;

  if v_live_products=0 then
    v_machine_blockers:=v_machine_blockers||jsonb_build_array('stripe_livemode');
  end if;
  if not v_webhook_ok then
    v_machine_blockers:=v_machine_blockers||jsonb_build_array('payment_webhook_health');
  end if;
  if not v_ranking_ok then
    v_machine_blockers:=v_machine_blockers||jsonb_build_array('ranking_cache_freshness');
  end if;
  if not v_queue_open then
    v_machine_blockers:=v_machine_blockers||jsonb_build_array('analysis_admission_capacity');
  end if;

  return jsonb_build_object(
    'status',p->>'status',
    'captured_at',p->'captured_at',
    'analysis_queue',q,
    'payments',jsonb_build_object(
      'operational',v_live_products>0 and v_webhook_ok,
      'live_ready',v_live_products>0,
      'sandbox_operational',v_test_products>0 and v_webhook_ok,
      'live_products',v_live_products,
      'test_products',v_test_products,
      'webhook_healthy',v_webhook_ok,
      'disclosure',case when v_live_products>0 then 'Live checkout is enabled for at least one active commercial product.' else 'Payment integration is healthy in sandbox, but no active live checkout product is enabled yet.' end
    ),
    'ranking',jsonb_build_object('operational',v_ranking_ok),
    'commercial_go_live',jsonb_build_object(
      'machine_checks_passed',v_machine_ready,
      'machine_blockers',v_machine_blockers,
      'external_attestation_required',true,
      'required_external_controls',jsonb_build_array(
        'auth_leaked_password_protection',
        'transactional_email_domain',
        'real_device_e2e',
        'heavy_worker_capacity',
        'legal_review',
        'incident_ownership'
      ),
      'disclosure','Operational health is not a commercial go-live attestation. External P0 controls must also be verified before paid traffic.'
    )
  );
end
$function$;
