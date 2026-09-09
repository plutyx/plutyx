-- Bridge already-collected browser/HTTP metrics into atomic SAC checks.
-- Conservative policy: objective geometry gets high confidence; design heuristics stay low-confidence proxies.

create or replace function sac.evaluate_atomic_browser_metrics(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  v_mob_overflow numeric; v_desk_overflow numeric; v_body_font numeric;
  v_target_u24 numeric; v_target_u44 numeric; v_missing_labels numeric;
  v_unnamed_buttons numeric; v_unnamed_links numeric; v_img_no_alt numeric;
  v_heading_jumps numeric; v_pos_tabindex numeric; v_main_landmarks numeric; v_nav_landmarks numeric;
  v_dialogs numeric; v_fixed_sticky numeric; v_max_overlay numeric;
  v_font_families numeric; v_font_sizes numeric; v_text_colors numeric; v_bg_colors numeric; v_button_variants numeric;
  v_para_avg numeric; v_para_max numeric; v_h1_ratio_min numeric; v_h1_ratio_max numeric;
  v_focusable numeric; v_focus_unique numeric; v_focus_novis numeric;
  v_cache text; v_cdn text;
  v_update int:=0; v_metric_pages int:=0;
begin
  with latest as (
    select distinct on (coalesce(page_id,'00000000-0000-0000-0000-000000000000'::uuid),metric_code)
      page_id,metric_code,numeric_value,text_value,confidence,observed_at
    from sac.metric_observations
    where audit_run_id=p_audit_run_id
    order by coalesce(page_id,'00000000-0000-0000-0000-000000000000'::uuid),metric_code,observed_at desc,id desc
  )
  select
    max(numeric_value) filter(where metric_code='M-BRW-MOB-OVERFLOW'),
    max(numeric_value) filter(where metric_code='M-BRW-DESK-OVERFLOW'),
    min(numeric_value) filter(where metric_code='M-BRW-BODY-FONT'),
    max(numeric_value) filter(where metric_code='M-BRW-TARGET-U24'),
    max(numeric_value) filter(where metric_code='M-BRW-TARGET-U44'),
    max(numeric_value) filter(where metric_code='M-BRW-MISSING-LABELS'),
    max(numeric_value) filter(where metric_code='M-BRW-UNNAMED-BUTTONS'),
    max(numeric_value) filter(where metric_code='M-BRW-UNNAMED-LINKS'),
    max(numeric_value) filter(where metric_code='M-BRW-IMG-NO-ALT'),
    max(numeric_value) filter(where metric_code='M-BRW-HEADING-JUMPS'),
    max(numeric_value) filter(where metric_code='M-BRW-POS-TABINDEX'),
    min(numeric_value) filter(where metric_code='M-BRW-MAIN-LANDMARKS'),
    min(numeric_value) filter(where metric_code='M-BRW-NAV-LANDMARKS'),
    max(numeric_value) filter(where metric_code='M-BRW-DIALOGS'),
    max(numeric_value) filter(where metric_code='M-BRW-FIXED-STICKY'),
    max(numeric_value) filter(where metric_code='M-BRW-MAX-OVERLAY'),
    max(numeric_value) filter(where metric_code='M-BRW-FONT-FAMILIES'),
    max(numeric_value) filter(where metric_code='M-BRW-FONT-SIZES'),
    max(numeric_value) filter(where metric_code='M-BRW-TEXT-COLORS'),
    max(numeric_value) filter(where metric_code='M-BRW-BG-COLORS'),
    max(numeric_value) filter(where metric_code='M-BRW-BUTTON-VARIANTS'),
    avg(numeric_value) filter(where metric_code='M-BRW-PARAGRAPH-WAVG'),
    max(numeric_value) filter(where metric_code='M-BRW-PARAGRAPH-WMAX'),
    min(numeric_value) filter(where metric_code='M-BRW-H1-BODY-RATIO'),
    max(numeric_value) filter(where metric_code='M-BRW-H1-BODY-RATIO'),
    max(numeric_value) filter(where metric_code='M-BRW-FOCUSABLE'),
    min(numeric_value) filter(where metric_code='M-BRW-FOCUS-UNIQUE'),
    max(numeric_value) filter(where metric_code='M-BRW-FOCUS-NOVIS'),
    max(text_value) filter(where metric_code='M-INF-CACHE'),
    max(text_value) filter(where metric_code='M-INF-CDN'),
    count(distinct page_id) filter(where metric_code like 'M-BRW-%')
  into v_mob_overflow,v_desk_overflow,v_body_font,v_target_u24,v_target_u44,v_missing_labels,
       v_unnamed_buttons,v_unnamed_links,v_img_no_alt,v_heading_jumps,v_pos_tabindex,v_main_landmarks,v_nav_landmarks,
       v_dialogs,v_fixed_sticky,v_max_overlay,v_font_families,v_font_sizes,v_text_colors,v_bg_colors,v_button_variants,
       v_para_avg,v_para_max,v_h1_ratio_min,v_h1_ratio_max,v_focusable,v_focus_unique,v_focus_novis,v_cache,v_cdn,v_metric_pages
  from latest;

  if coalesce(v_metric_pages,0)=0 then return jsonb_build_object('updated',0,'reason','no_browser_metrics'); end if;

  if v_mob_overflow is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'mobile','horizontal overflow',case when v_mob_overflow<=0 then 'pass' when v_mob_overflow<=8 then 'warning' else 'fail' end,0.96,'snapshot_browser',jsonb_build_object('max_overflow_px',v_mob_overflow,'pages_observed',v_metric_pages),'Overflow horizontal medido em viewport móvel pelo browser.');
  end if;
  if v_body_font is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'mobile','font legibility',case when v_body_font>=16 then 'pass' when v_body_font>=14 then 'warning' else 'fail' end,0.91,'snapshot_browser',jsonb_build_object('minimum_body_font_px',v_body_font,'threshold_note','16px is a readability heuristic, not a WCAG conformance threshold'),'Tamanho computado do texto-base observado no viewport móvel; o limiar é heurístico e não equivale a conformidade WCAG.');
  end if;
  if v_target_u24 is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'mobile','touch target size',case when v_target_u24=0 then 'pass' else 'warning' end,0.84,'snapshot_browser',jsonb_build_object('targets_under_24px',v_target_u24,'wcag_exceptions_evaluated',false),'Alvos abaixo de 24 px foram contados no browser; exceções do WCAG 2.2 não são totalmente classificadas, portanto presença gera alerta, não falha automática.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'mobile','touch target spacing',case when v_target_u24=0 then 'pass' else 'warning' end,0.76,'snapshot_browser',jsonb_build_object('targets_under_24px',v_target_u24,'targets_under_44px',v_target_u44,'limitation','Spacing exceptions are not fully classified'),'Proxy de espaçamento/tamanho de alvos; usado como diagnóstico e não como certificação.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'mobile','tap spacing',case when v_target_u24=0 then 'pass' else 'warning' end,0.76,'snapshot_browser',jsonb_build_object('targets_under_24px',v_target_u24),'Alvos pequenos elevam risco de toques acidentais; exceções permanecem explícitas.');
  end if;
  if v_max_overlay is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'mobile','sticky obstruction',case when v_max_overlay<=0.20 then 'pass' when v_max_overlay<=0.40 then 'warning' else 'fail' end,0.82,'snapshot_browser',jsonb_build_object('max_fixed_overlay_ratio',v_max_overlay,'heuristic_thresholds',jsonb_build_object('pass_lte',0.20,'warning_lte',0.40)),'Maior área fixa sobre o viewport móvel foi medida; thresholds são heurísticos de obstrução.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'mobile','modal fit',case when coalesce(v_dialogs,0)=0 then 'not_applicable' when v_max_overlay<=0.90 then 'pass' else 'warning' end,0.80,'snapshot_browser',jsonb_build_object('dialogs',v_dialogs,'max_fixed_overlay_ratio',v_max_overlay),'Fit de modais usa área fixa observada; interação interna ainda exige teste funcional.');
  end if;

  if v_missing_labels is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','form labels',case when v_missing_labels=0 then 'pass' else 'warning' end,0.97,'snapshot_browser',jsonb_build_object('visible_controls_missing_programmatic_label',v_missing_labels),'Labels programáticos foram inspecionados no DOM renderizado.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','accessible names',case when v_missing_labels=0 and coalesce(v_unnamed_buttons,0)=0 and coalesce(v_unnamed_links,0)=0 then 'pass' else 'warning' end,0.93,'snapshot_browser',jsonb_build_object('missing_labels',v_missing_labels,'unnamed_buttons',v_unnamed_buttons,'unnamed_links',v_unnamed_links),'Nomes acessíveis são avaliados por sinais do DOM renderizado; axe continua sendo fonte complementar.');
  end if;
  if v_unnamed_buttons is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','button names',case when v_unnamed_buttons=0 then 'pass' else 'warning' end,0.96,'snapshot_browser',jsonb_build_object('unnamed_buttons',v_unnamed_buttons),'Botões sem nome acessível detectável foram contados no DOM renderizado.');
  end if;
  if v_unnamed_links is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','link names',case when v_unnamed_links=0 then 'pass' else 'warning' end,0.94,'snapshot_browser',jsonb_build_object('unnamed_links',v_unnamed_links),'Links sem nome acessível detectável foram contados no DOM renderizado.');
  end if;
  if v_heading_jumps is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','heading order',case when v_heading_jumps=0 then 'pass' else 'warning' end,0.92,'snapshot_browser',jsonb_build_object('heading_level_jumps',v_heading_jumps),'Saltos de nível em headings foram observados na estrutura renderizada.');
  end if;
  if v_pos_tabindex is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','tab order',case when v_pos_tabindex=0 then 'pass' else 'warning' end,0.96,'snapshot_browser',jsonb_build_object('positive_tabindex_elements',v_pos_tabindex),'tabindex positivo foi verificado porque pode alterar a ordem natural de navegação.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','focus order',case when v_pos_tabindex=0 then 'pass' else 'warning' end,0.90,'snapshot_browser',jsonb_build_object('positive_tabindex_elements',v_pos_tabindex,'focus_probe_unique',v_focus_unique),'Ordem de foco combina tabindex positivo e cobertura do probe de teclado.');
  end if;
  if v_focus_novis is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','focus visible',case when v_focus_novis=0 then 'pass' else 'warning' end,0.82,'snapshot_browser',jsonb_build_object('tab_stops_without_detected_visual_focus',v_focus_novis,'detector_limitation','Not all possible focus cues are detected'),'Probe de teclado não detectou sinal visual de foco em alguns tab stops; o detector não cobre todas as formas possíveis de focus indicator.');
  end if;
  if v_focusable is not null and v_focus_unique is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','keyboard navigation',case when v_focusable=0 then 'not_applicable' when v_focus_unique>=least(v_focusable,40) then 'pass' when v_focus_unique>0 then 'warning' else 'fail' end,0.84,'snapshot_browser',jsonb_build_object('focusable_elements_max',v_focusable,'unique_reached_min',v_focus_unique,'probe_cap_note','Probe may be capped for safety'),'Navegação por teclado foi exercitada pelo browser até o limite seguro do probe.');
  end if;
  if v_mob_overflow is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','reflow',case when v_mob_overflow<=0 then 'pass' else 'warning' end,0.86,'snapshot_browser',jsonb_build_object('mobile_horizontal_overflow_px',v_mob_overflow,'limitation','Viewport reflow proxy; not a full 320 CSS px WCAG manual test'),'Overflow em viewport móvel funciona como proxy automatizado de reflow; não substitui teste manual completo.');
  end if;
  if v_target_u24 is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','target size',case when v_target_u24=0 then 'pass' else 'warning' end,0.82,'snapshot_browser',jsonb_build_object('targets_under_24px',v_target_u24,'wcag_exceptions_evaluated',false),'Target Size mínimo é triado automaticamente; exceções do critério 2.5.8 exigem contexto adicional.');
  end if;
  if v_main_landmarks is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','landmarks',case when v_main_landmarks=1 then 'pass' when v_main_landmarks>0 then 'warning' else 'fail' end,0.97,'snapshot_browser',jsonb_build_object('minimum_main_landmarks',v_main_landmarks,'minimum_nav_landmarks',v_nav_landmarks),'Landmarks computados no DOM renderizado.');
  end if;
  if v_img_no_alt is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'accessibility','image alt',case when v_img_no_alt=0 then 'pass' else 'warning' end,0.98,'snapshot_browser',jsonb_build_object('rendered_images_missing_alt',v_img_no_alt),'Atributo alt foi verificado nas imagens renderizadas; qualidade semântica permanece separada.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'image_intelligence','alt presence',case when v_img_no_alt=0 then 'pass' else 'warning' end,0.98,'snapshot_browser',jsonb_build_object('rendered_images_missing_alt',v_img_no_alt),'Presença de alt validada na renderização atual.');
  end if;

  if v_max_overlay is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'ux','sticky interference',case when v_max_overlay<=0.20 then 'pass' when v_max_overlay<=0.40 then 'warning' else 'fail' end,0.82,'snapshot_browser',jsonb_build_object('max_fixed_overlay_ratio',v_max_overlay,'fixed_sticky_count',v_fixed_sticky),'Interferência sticky usa ocupação real do viewport como proxy automatizado.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'ux','modal friction',case when coalesce(v_dialogs,0)=0 then 'not_applicable' when v_max_overlay<=0.90 then 'pass' else 'warning' end,0.78,'snapshot_browser',jsonb_build_object('dialogs',v_dialogs,'max_fixed_overlay_ratio',v_max_overlay),'Fricção modal automatizada considera quantidade e obstrução; clareza do conteúdo permanece semântica.');
  end if;
  if v_nav_landmarks is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'ux','navigation clarity',case when v_nav_landmarks>0 then 'pass' else 'warning' end,0.72,'snapshot_browser',jsonb_build_object('minimum_nav_landmarks',v_nav_landmarks,'limitation','Presence does not prove label clarity'),'Landmark de navegação prova estrutura navegável, não qualidade editorial dos rótulos.');
  end if;
  if v_button_variants is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'ux','interaction consistency',case when v_button_variants<=4 then 'pass' else 'warning' end,0.70,'snapshot_browser',jsonb_build_object('max_button_style_variants',v_button_variants,'heuristic',true),'Variação visual de botões é um proxy de consistência, não uma regra universal de design.');
  end if;
  if v_para_max is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'ux','content scanning',case when v_para_max<=760 then 'pass' else 'warning' end,0.70,'snapshot_browser',jsonb_build_object('paragraph_max_width_px',v_para_max,'paragraph_avg_width_px',round(v_para_avg,2),'heuristic',true),'Largura de blocos textuais é usada como proxy de escaneabilidade; idioma, fonte e contexto também importam.');
  end if;

  if v_h1_ratio_min is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'visual_design','typography hierarchy',case when v_h1_ratio_min>=1.5 and v_h1_ratio_max<=6 then 'pass' else 'warning' end,0.78,'snapshot_browser',jsonb_build_object('h1_body_ratio_min',v_h1_ratio_min,'h1_body_ratio_max',v_h1_ratio_max,'heuristic',true),'Relação H1/corpo mede hierarquia tipográfica observável; não avalia mérito estético.');
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'visual_design','visual hierarchy',case when v_h1_ratio_min>=1.5 then 'pass' else 'warning' end,0.68,'snapshot_browser',jsonb_build_object('h1_body_ratio_min',v_h1_ratio_min,'proxy_only',true),'Proxy automático de hierarquia por escala tipográfica; composição completa continua no score visual-semântico.');
  end if;
  if v_para_max is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'visual_design','line length',case when v_para_max<=760 then 'pass' else 'warning' end,0.73,'snapshot_browser',jsonb_build_object('max_paragraph_width_px',v_para_max,'avg_paragraph_width_px',round(v_para_avg,2),'proxy_only',true),'Largura de parágrafo funciona como proxy geométrico; contagem real de caracteres por linha pode variar.');
  end if;
  if v_button_variants is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'visual_design','button consistency',case when v_button_variants<=4 then 'pass' else 'warning' end,0.74,'snapshot_browser',jsonb_build_object('max_button_style_variants',v_button_variants,'heuristic',true),'Número de variantes computadas de botão é usado como proxy de consistência.');
  end if;
  if v_font_families is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'visual_design','brand cohesion',case when v_font_families<=3 then 'pass' else 'warning' end,0.65,'snapshot_browser',jsonb_build_object('font_family_variants',v_font_families,'text_color_variants',v_text_colors,'background_color_variants',v_bg_colors,'proxy_only',true),'Coesão usa variabilidade tipográfica/cromática como proxy; identidade de marca não é inferida apenas por CSS.');
  end if;
  if v_mob_overflow is not null and v_desk_overflow is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'visual_design','responsive composition',case when v_mob_overflow=0 and v_desk_overflow=0 then 'pass' else 'warning' end,0.82,'snapshot_browser',jsonb_build_object('mobile_overflow_px',v_mob_overflow,'desktop_overflow_px',v_desk_overflow),'Composição responsiva usa overflow real em dois viewports; adaptação semântica continua separada.');
  end if;

  if v_cache is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'performance','cache policy',case when length(trim(v_cache))>0 then 'pass' else 'warning' end,0.94,'origin_timing',jsonb_build_object('cache_control',v_cache),'Cache-Control foi observado na resposta real; qualidade fina da política pode variar por recurso.');
  end if;
  if v_cdn is not null then
    v_update:=v_update+sac.set_atomic_signal(p_audit_run_id,'performance','CDN usage',case when lower(v_cdn) ~ '(cloudflare|fastly|akamai|cloudfront|vercel|netlify|fly|render)' then 'pass' else 'not_verifiable' end,0.88,'origin_timing',jsonb_build_object('server_or_edge_hint',v_cdn),'CDN/edge só é afirmado quando há sinal identificável no response path.');
  end if;

  perform sac.enforce_atomic_confidence_floor(p_audit_run_id);
  return jsonb_build_object('updated',v_update,'metric_pages',v_metric_pages,'browser',jsonb_build_object('mobile_overflow_px',v_mob_overflow,'body_font_px',v_body_font,'targets_under_24px',v_target_u24,'missing_labels',v_missing_labels,'focus_without_visual',v_focus_novis,'max_overlay_ratio',v_max_overlay));
end;
$$;

-- The auxiliary cron must run the bridge after materializing browser metrics.
create or replace function sac.run_auxiliary_evidence_cycle(p_audit_limit integer default 12)
returns jsonb
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  v_origin_col record; v_browser_col record; collected_domain int:=0;
  dispatched_origin int:=0; dispatched_browser int:=0; dispatched_domain int:=0;
  r record; processed int:=0; browser_snapshots int:=0; highlights_materialized int:=0;
  obs jsonb; dom jsonb; atom jsonb; browser_atom jsonb; scorecards jsonb;
  scorecards_computed int:=0; browser_atomic_updates int:=0;
begin
  select * into v_origin_col from sac.collect_origin_timing_jobs();
  select * into v_browser_col from sac.collect_snapshot_browser_jobs();
  collected_domain:=sac.collect_domain_probe_jobs();

  for r in
    select audit_run_id,max(t) newest from (
      select audit_run_id,coalesce(updated_at,completed_at,created_at) t from sac.origin_timing_jobs where status='completed'
      union all select audit_run_id,coalesce(updated_at,completed_at,created_at) t from sac.snapshot_browser_jobs where status='completed'
      union all select audit_run_id,coalesce(completed_at,created_at) t from sac.domain_probe_jobs where status='completed'
    ) x group by audit_run_id order by max(t) desc limit greatest(1,least(coalesce(p_audit_limit,12),30))
  loop
    begin
      browser_snapshots:=browser_snapshots+sac.materialize_snapshot_browser_results(r.audit_run_id);
      obs:=sac.materialize_observed_metrics(r.audit_run_id);
      dom:=sac.materialize_domain_probe_metrics(r.audit_run_id);
      atom:=sac.evaluate_domain_probe_atomic(r.audit_run_id);
      browser_atom:=sac.evaluate_atomic_browser_metrics(r.audit_run_id);
      browser_atomic_updates:=browser_atomic_updates+coalesce((browser_atom->>'updated')::int,0);
      perform sac.enforce_atomic_confidence_floor(r.audit_run_id);
      scorecards:=sac.compute_experience_scorecards(r.audit_run_id);
      scorecards_computed:=scorecards_computed+1;
      highlights_materialized:=highlights_materialized+sac.materialize_site_highlights(r.audit_run_id);
      processed:=processed+1;
    exception when others then null;
    end;
  end loop;

  dispatched_domain:=sac.dispatch_domain_probe_jobs(2);
  dispatched_origin:=sac.dispatch_origin_timing_jobs(6);
  dispatched_browser:=sac.dispatch_snapshot_browser_jobs(2);
  return jsonb_build_object(
    'collected',jsonb_build_object('origin',jsonb_build_object('completed',coalesce(v_origin_col.completed,0),'failed',coalesce(v_origin_col.failed,0),'requeued',coalesce(v_origin_col.requeued,0)),'browser',jsonb_build_object('completed',coalesce(v_browser_col.completed,0),'failed',coalesce(v_browser_col.failed,0),'requeued',coalesce(v_browser_col.requeued,0)),'domain',collected_domain),
    'dispatched',jsonb_build_object('origin',dispatched_origin,'browser',dispatched_browser,'domain',dispatched_domain),
    'audits_processed',processed,'browser_snapshots_materialized',browser_snapshots,'browser_atomic_updates',browser_atomic_updates,
    'experience_scorecards_computed',scorecards_computed,'highlights_materialized',highlights_materialized);
end;
$$;
