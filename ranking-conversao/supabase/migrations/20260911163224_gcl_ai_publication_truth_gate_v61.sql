create or replace function sac.gcl_ai_publication_payload(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare
  v_payload jsonb;
  v_evidence jsonb;
  v_absence_reliable boolean := false;
  v_item jsonb;
  v_kept jsonb := '[]'::jsonb;
  v_filtered int := 0;
  v_text text;
  v_profile jsonb;
  v_summary text;
  v_risk_pattern text := '(não[[:space:]]+há|não[[:space:]]+possui|não[[:space:]]+apresenta|não[[:space:]]+foi[[:space:]]+detectad|não[[:space:]]+foram[[:space:]]+identificad|ausente|ausência[[:space:]]+de|cta[[:space:]]+ausente|sem[[:space:]]+(um|uma)[[:space:]]+(cta|formul|link|garantia|preço|prova|selo))';
begin
  select e.payload into v_payload
  from sac.ai_enrichments e
  where e.audit_run_id=p_audit_run_id
  order by e.generated_at desc
  limit 1;

  if v_payload is null then
    return null;
  end if;

  v_evidence := sac.gcl_ai_public_evidence_payload(p_audit_run_id);
  select coalesce(bool_and(coalesce((p->'browser'->>'absence_claims_reliable')::boolean,false)),false)
    into v_absence_reliable
  from jsonb_array_elements(coalesce(v_evidence->'pages','[]'::jsonb)) p
  where p ? 'browser';

  -- A limited browser capture can support positive observations, but not categorical
  -- claims that an element does not exist. Filter only those risky absence statements.
  if not v_absence_reliable then
    v_kept := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_payload->'conversion_leaks','[]'::jsonb))
    loop
      v_text := lower(concat_ws(' ',v_item->>'title',v_item->>'insight',v_item->>'fix'));
      if v_text ~* v_risk_pattern then
        v_filtered := v_filtered + 1;
      else
        v_kept := v_kept || jsonb_build_array(v_item);
      end if;
    end loop;
    v_payload := jsonb_set(v_payload,'{conversion_leaks}',v_kept,true);

    v_kept := '[]'::jsonb;
    for v_item in select value from jsonb_array_elements(coalesce(v_payload->'objections','[]'::jsonb))
    loop
      v_text := lower(concat_ws(' ',v_item->>'title',v_item->>'response'));
      if v_text ~* v_risk_pattern then
        v_filtered := v_filtered + 1;
      else
        v_kept := v_kept || jsonb_build_array(v_item);
      end if;
    end loop;
    v_payload := jsonb_set(v_payload,'{objections}',v_kept,true);

    v_profile := coalesce(v_payload->'strategic_profile','{}'::jsonb);
    v_text := lower(coalesce(v_profile->>'primary_action',''));
    if v_text ~* v_risk_pattern then
      v_profile := jsonb_set(v_profile,'{primary_action}',to_jsonb('Não confirmado pelo pacote público atual.'::text),true);
      v_payload := jsonb_set(v_payload,'{strategic_profile}',v_profile,true);
      v_filtered := v_filtered + 1;
    end if;

    v_summary := coalesce(v_payload->>'executive_summary','');
    if lower(v_summary) ~* v_risk_pattern then
      v_payload := jsonb_set(
        v_payload,
        '{executive_summary}',
        to_jsonb('Análise estratégica baseada em evidências públicas observadas. A captura visual deste audit não executou JavaScript por completo; por isso afirmações categóricas de ausência foram omitidas. Consulte os pontos grounded e os experimentos abaixo.'::text),
        true
      );
      v_filtered := v_filtered + 1;
    end if;
  end if;

  v_payload := v_payload || jsonb_build_object(
    'publication_gate',jsonb_build_object(
      'status',case when v_filtered>0 then 'safe_partial' else 'safe' end,
      'browser_absence_reliable',v_absence_reliable,
      'filtered_items',v_filtered,
      'rule','incomplete_browser_zero_is_unknown',
      'disclosure','Quando JavaScript não foi executado por completo, zero/null no snapshot visual não prova ausência. Afirmações categóricas de ausência são omitidas da camada pública.'
    )
  );
  return v_payload;
end;
$function$;

revoke all on function sac.gcl_ai_publication_payload(uuid) from public, anon, authenticated;
grant execute on function sac.gcl_ai_publication_payload(uuid) to service_role, postgres;

create or replace function sac.gcl_ai_enrichment_for_audit(p_audit_run_id uuid)
returns jsonb
language sql
security definer
set search_path to 'sac','public'
as $function$
  select case
    when e.id is null then jsonb_build_object(
      'available',false,
      'status',coalesce((select j.status from sac.ai_enrichment_jobs j where j.audit_run_id=p_audit_run_id order by j.created_at desc limit 1),'not_requested')
    )
    else jsonb_build_object(
      'available',true,
      'status','completed',
      'version',e.prompt_version,
      'model',e.model,
      'generated_at',e.generated_at,
      'diagnostic_only',true,
      'public_evidence_only',true,
      'score_effect','none',
      'analysis',sac.gcl_ai_publication_payload(p_audit_run_id),
      'disclosure','Interpretação de IA sobre evidências públicas observadas pelo GCL. Não altera o GCL Score, ranking ou elegibilidade. Quando a captura visual é incompleta, ausência não observada é tratada como desconhecida.'
    )
  end
  from (select 1) q
  left join lateral (
    select * from sac.ai_enrichments x
    where x.audit_run_id=p_audit_run_id
    order by x.generated_at desc
    limit 1
  ) e on true;
$function$;

revoke all on function sac.gcl_ai_enrichment_for_audit(uuid) from public, anon, authenticated;
grant execute on function sac.gcl_ai_enrichment_for_audit(uuid) to service_role, postgres;
