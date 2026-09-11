-- GCL public report fast path v75
-- Move public score/competition shaping into Postgres so the Edge worker can
-- stream the ~380 KB report without a parse -> clone -> stringify CPU round-trip.

create or replace function public.sac_api_public_deep_report_v75(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'sac'
as $$
declare
  v_report jsonb;
  v_competition jsonb;
  v_rank jsonb;
  v_dist jsonb;
  v_truth jsonb;
  v_preliminary_axes numeric := 0;
  v_ready_axes numeric := 0;
  v_measured_axes numeric := 0;
  v_score_text text;
  v_score_finite boolean := false;
  v_technical_eligible boolean := false;
  v_official boolean := false;
  v_has_estimate boolean := false;
  v_visibility text := 'forming';
  v_visible_score jsonb := 'null'::jsonb;
  v_visible_raw jsonb := 'null'::jsonb;
  v_dimensions jsonb;
  v_public_competition jsonb;
  v_forming_disclosure constant text := 'Score em formação: a estimativa pública só aparece depois que a auditoria atende ao gate técnico e possui evidência em pelo menos 5 dimensões. Evidência ausente continua desconhecida.';
  v_forming_truth_disclosure constant text := 'Score em formação: ainda não há evidência suficiente para exibir uma estimativa numérica pública.';
  v_provisional_truth_disclosure constant text := 'Estimativa diagnóstica provisória; não é posição oficial nem taxa de conversão medida.';
  v_official_truth_disclosure constant text := 'Score oficial conforme o contrato explícito de competição.';
begin
  v_report := coalesce(public.sac_api_deep_report(p_token), '{}'::jsonb);
  v_competition := coalesce(public.sac_api_competition_context(p_token), '{}'::jsonb);
  v_rank := coalesce(v_report->'ranking', '{}'::jsonb);
  v_dist := coalesce(v_report->'score_distribution', '{}'::jsonb);
  v_truth := coalesce(v_report->'diagnostic_truth', '{}'::jsonb);

  begin
    v_preliminary_axes := coalesce(
      nullif(v_truth->>'preliminary_axes','')::numeric,
      nullif(v_rank->>'preliminary_axes','')::numeric,
      nullif(v_dist->>'preliminary_axes','')::numeric,
      0
    );
  exception when others then v_preliminary_axes := 0; end;

  begin
    v_ready_axes := coalesce(
      nullif(v_truth->>'ready_axes','')::numeric,
      nullif(v_rank->>'ready_axes','')::numeric,
      nullif(v_dist->>'ready_axes','')::numeric,
      0
    );
  exception when others then v_ready_axes := 0; end;

  begin
    v_measured_axes := coalesce(nullif(v_dist->>'measured_axes','')::numeric, v_preliminary_axes + v_ready_axes, 0);
  exception when others then v_measured_axes := 0; end;

  v_score_text := nullif(v_rank->>'score_100','');
  if v_score_text is not null then
    begin
      perform v_score_text::double precision;
      v_score_finite := isfinite(v_score_text::double precision);
    exception when others then
      v_score_finite := false;
    end;
  end if;

  v_technical_eligible := coalesce((v_competition->>'eligible_technically')::boolean, false);
  v_official :=
    v_rank->>'score_status' = 'official'
    and v_rank->>'ranking_scope' = 'official_competition'
    and coalesce((v_rank->>'official_competition_eligible')::boolean, false)
    and coalesce((v_competition->>'official_participant')::boolean, false);
  v_has_estimate := v_score_finite and v_technical_eligible and v_measured_axes >= 5;
  v_visibility := case when v_official then 'official' when v_has_estimate then 'provisional' else 'forming' end;

  if v_visibility <> 'forming' then
    v_visible_score := coalesce(v_rank->'score_100', 'null'::jsonb);
    v_visible_raw := coalesce(v_rank->'raw_score_100', 'null'::jsonb);
  end if;

  v_rank := v_rank || jsonb_build_object(
    'score_100', v_visible_score,
    'raw_score_100', v_visible_raw,
    'score_status', v_visibility,
    'score_visibility', v_visibility,
    'minimum_public_axes', 5,
    'public_axes_observed', v_measured_axes,
    'official_competition_eligible', v_official,
    'ranking_scope', case when v_official then 'official_competition' else 'autonomous_diagnostic' end,
    'overall_rank', case when v_official then coalesce(v_rank->'overall_rank','null'::jsonb) else 'null'::jsonb end,
    'category_rank', case when v_official then coalesce(v_rank->'category_rank','null'::jsonb) else 'null'::jsonb end,
    'percentile', case when v_official then coalesce(v_rank->'percentile','null'::jsonb) else 'null'::jsonb end,
    'previous_rank', case when v_official then coalesce(v_rank->'previous_rank','null'::jsonb) else 'null'::jsonb end,
    'rank_delta', case when v_official then coalesce(v_rank->'rank_delta','null'::jsonb) else 'null'::jsonb end,
    'position_kind', case when v_official then to_jsonb('official'::text) else 'null'::jsonb end,
    'official_participant', coalesce((v_competition->>'official_participant')::boolean, false),
    'score_visibility_reason', case
      when v_official then 'official_contract_met'
      when v_has_estimate then 'autonomous_evidence_gate_met'
      when v_score_finite then 'minimum_evidence_gate_not_met'
      else 'no_weighted_evidence'
    end
  );

  v_dist := v_dist || jsonb_build_object(
    'gcl_score_100', case
      when v_visibility = 'forming' then 'null'::jsonb
      else coalesce(nullif(v_dist->'gcl_score_100','null'::jsonb), v_visible_score, 'null'::jsonb)
    end,
    'score_status', v_visibility,
    'score_visibility', v_visibility,
    'minimum_public_axes', 5,
    'public_axes_observed', v_measured_axes,
    'official_competition_eligible', v_official,
    'ranking_scope', case when v_official then 'official_competition' else 'autonomous_diagnostic' end,
    'disclosure', case when v_visibility = 'forming' then v_forming_disclosure else v_dist->>'disclosure' end
  );

  v_truth := v_truth || jsonb_build_object(
    'score_status', v_visibility,
    'score_visibility', v_visibility,
    'minimum_public_axes', 5,
    'public_axes_observed', v_measured_axes,
    'official_competition_eligible', v_official,
    'public_score_disclosure', case
      when v_visibility = 'forming' then v_forming_truth_disclosure
      when v_visibility = 'provisional' then v_provisional_truth_disclosure
      else v_official_truth_disclosure
    end
  );

  if v_visibility = 'forming' and jsonb_typeof(v_report->'dimensions') = 'array' then
    select coalesce(jsonb_agg(
      case when elem->>'dimension_code' = 'site_experience_index'
        then elem || jsonb_build_object('score_10','null'::jsonb,'preliminary_score_10','null'::jsonb)
        else elem end order by ord
    ), '[]'::jsonb)
    into v_dimensions
    from jsonb_array_elements(v_report->'dimensions') with ordinality as d(elem, ord);
  else
    v_dimensions := v_report->'dimensions';
  end if;

  v_public_competition := v_competition || jsonb_build_object(
    'technical_score', case
      when v_visibility = 'forming' then 'null'::jsonb
      else coalesce(nullif(v_competition->'technical_score','null'::jsonb), v_visible_score, 'null'::jsonb)
    end,
    'official_position', case when v_official then coalesce(v_rank->'overall_rank','null'::jsonb) else 'null'::jsonb end
  );

  v_report := v_report || jsonb_build_object(
    'ranking', v_rank,
    'score_distribution', v_dist,
    'diagnostic_truth', v_truth,
    'dimensions', v_dimensions,
    'competition', v_public_competition
  );

  return jsonb_build_object('ok', true, 'result', v_report);
end;
$$;

revoke all on function public.sac_api_public_deep_report_v75(uuid) from public, anon, authenticated;
grant execute on function public.sac_api_public_deep_report_v75(uuid) to service_role;
