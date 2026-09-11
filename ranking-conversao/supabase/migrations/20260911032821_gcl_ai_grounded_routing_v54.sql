create or replace function sac.gcl_ai_public_evidence_payload(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare v jsonb;
begin
  if not exists(select 1 from sac.audit_runs where id=p_audit_run_id and status='completed') then raise exception 'completed_audit_required'; end if;
  select jsonb_build_object(
    'contract_version','GCL-AI-EVIDENCE-1.1','privacy_scope','public_web_evidence_only','diagnostic_only',true,'score_effect','none',
    'audit',jsonb_build_object('audit_run_id',ar.id,'audit_type',ar.audit_type,'methodology_version',ar.methodology_version,'completed_at',ar.completed_at,'pages_analyzed',ar.pages_analyzed,'domain',d.normalized_domain,'url',d.url,'company_name',d.company_name,'category',d.category,'country',d.country,'detected_archetype',d.detected_archetype),
    'pages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'evidence_ref','page:'||p.id::text,'page_id',p.id,'url',p.normalized_url,'page_type',p.page_type,'title',p.title,'meta_description',p.meta_description,'h1',p.h1,'word_count',p.word_count,'indexable',p.indexable,'internal_links',p.internal_links,'external_links',p.external_links,'images_count',p.images_count,'forms_count',p.forms_count,
        'semantic_facts',(select s.payload->'facts' from sac.source_snapshots s where s.source='semantic_embedding' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text order by s.fetched_at desc limit 1),
        'semantic_margins',(select s.payload->'margins' from sac.source_snapshots s where s.source='semantic_embedding' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text order by s.fetched_at desc limit 1),
        'pagespeed',(select coalesce(jsonb_agg(jsonb_build_object('evidence_ref','pagespeed:'||p.id::text||':'||coalesce(s.payload->>'strategy','unknown'),'strategy',s.payload->>'strategy','categories',s.payload->'categories','field_metrics',s.payload->'field_data'->'metrics','field_category',s.payload->'field_data'->>'overall_category','origin_field_metrics',s.payload->'origin_field_data'->'metrics','runtime_error',s.payload->'runtime_error','analysis_timestamp',s.payload->'analysis_timestamp') order by s.payload->>'strategy'),'[]'::jsonb) from sac.source_snapshots s where s.source='google_pagespeed' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text),
        'browser',(select jsonb_build_object('evidence_ref','browser:'||p.id::text,'mobile',jsonb_build_object('hero',s.payload->'rendered'->'mobile'->'hero','cta',s.payload->'rendered'->'mobile'->'cta','trust',s.payload->'rendered'->'mobile'->'trust','forms_detail',s.payload->'rendered'->'mobile'->'forms_detail','horizontal_overflow_px',s.payload->'rendered'->'mobile'->'horizontal_overflow_px','target_under_44',s.payload->'rendered'->'mobile'->'target_under_44','max_fixed_overlay_pct',s.payload->'rendered'->'mobile'->'max_fixed_overlay_pct'),'desktop',jsonb_build_object('hero',s.payload->'rendered'->'desktop'->'hero','cta',s.payload->'rendered'->'desktop'->'cta','trust',s.payload->'rendered'->'desktop'->'trust','forms_detail',s.payload->'rendered'->'desktop'->'forms_detail','horizontal_overflow_px',s.payload->'rendered'->'desktop'->'horizontal_overflow_px','max_fixed_overlay_pct',s.payload->'rendered'->'desktop'->'max_fixed_overlay_pct'),'axe',jsonb_build_object('available',s.payload->'rendered'->'axe'->'available','violations_count',s.payload->'rendered'->'axe'->'violations_count'),'javascript_executed',s.payload->'rendered'->'javascript_executed') from sac.source_snapshots s where s.source='snapshot_browser' and s.payload->>'audit_run_id'=p_audit_run_id::text and s.payload->>'page_id'=p.id::text order by s.fetched_at desc limit 1)
      ) order by case p.page_type when 'home' then 1 when 'landing' then 2 when 'service' then 3 when 'product' then 4 when 'pricing' then 5 else 9 end,p.created_at)
      from (select * from sac.pages where audit_run_id=p_audit_run_id order by case page_type when 'home' then 1 when 'landing' then 2 when 'service' then 3 when 'product' then 4 when 'pricing' then 5 else 9 end,created_at limit 8) p
    ),'[]'::jsonb),
    'domain_public_probe',(select jsonb_build_object(
      'evidence_ref','domain:'||p_audit_run_id::text,
      'http',s.payload->'http','https',s.payload->'https','robots',s.payload->'robots','sitemap',s.payload->'sitemap','security_txt',s.payload->'security_txt','normalization',s.payload->'normalization','root_semantics',s.payload->'root_semantics','ai_access',s.payload->'ai_access','ads_access',s.payload->'ads_access','llms_txt',s.payload->'llms_txt'
    ) from sac.source_snapshots s where s.source='domain_crawl_probe' and s.payload->>'audit_run_id'=p_audit_run_id::text order by s.fetched_at desc limit 1),
    'disclosure','Only public website/crawl/browser/PageSpeed/semantic evidence is eligible for this AI packet. User, purchase, membership, connected analytics/CRM and private first-party data are excluded. The AI interpretation never changes GCL Score or ranking.'
  ) into v from sac.audit_runs ar join sac.domains d on d.id=ar.domain_id where ar.id=p_audit_run_id;
  return v;
end;$function$;

create or replace function sac.ai_search_summary(p_audit_run_id uuid)
returns jsonb
language sql
stable security definer
set search_path to 'sac','public'
as $function$
with latest as (
  select distinct on (metric_code) metric_code,numeric_value,text_value,value,confidence,source_kind,observed_at
  from sac.metric_observations
  where audit_run_id=p_audit_run_id and metric_code in (
    'M-AI-LIVE-ACCESS-PCT','M-AI-LIVE-OAI-SEARCHBOT','M-AI-LIVE-CHATGPT-USER','M-AI-LIVE-CLAUDE-SEARCH','M-AI-LIVE-CLAUDE-USER','M-AI-LIVE-PERPLEXITYBOT','M-AI-LIVE-PERPLEXITY-USER','M-AI-LIVE-OAI-ADSBOT',
    'M-AI-SEMANTIC-LANDMARKS','M-AI-ROOT-JSONLD-BLOCKS','M-AI-LASTMOD-PRESENT','M-AI-LLMS-TXT-NONEMPTY',
    'M-AI-OAI-SEARCHBOT','M-AI-OAI-ADSBOT','M-AI-CHATGPT-USER','M-AI-CLAUDE-SEARCH','M-AI-PERPLEXITYBOT','M-AI-GOOGLE-EXT','M-AI-GPTBOT'
  ) order by metric_code,observed_at desc
), live as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'agent',case metric_code
      when 'M-AI-LIVE-OAI-SEARCHBOT' then 'OAI-SearchBot'
      when 'M-AI-LIVE-CHATGPT-USER' then 'ChatGPT-User'
      when 'M-AI-LIVE-CLAUDE-SEARCH' then 'Claude-SearchBot'
      when 'M-AI-LIVE-CLAUDE-USER' then 'Claude-User'
      when 'M-AI-LIVE-PERPLEXITYBOT' then 'PerplexityBot'
      when 'M-AI-LIVE-PERPLEXITY-USER' then 'Perplexity-User' end,
    'accessible',numeric_value=1,'robots_allowed',coalesce((value->>'robots_allowed')::boolean,false),'request_made',coalesce((value->>'request_made')::boolean,false),'http_status',nullif(value->>'status','')::int,'server',value->>'server','confidence',confidence,'evidence',value
  ) order by case metric_code when 'M-AI-LIVE-OAI-SEARCHBOT' then 1 when 'M-AI-LIVE-CHATGPT-USER' then 2 when 'M-AI-LIVE-CLAUDE-SEARCH' then 3 when 'M-AI-LIVE-CLAUDE-USER' then 4 when 'M-AI-LIVE-PERPLEXITYBOT' then 5 else 6 end),'[]'::jsonb) agents
  from latest where metric_code like 'M-AI-LIVE-%' and metric_code not in ('M-AI-LIVE-ACCESS-PCT','M-AI-LIVE-OAI-ADSBOT')
)
select jsonb_build_object(
  'available',exists(select 1 from latest where metric_code='M-AI-LIVE-ACCESS-PCT'),
  'live_access_percent',(select numeric_value from latest where metric_code='M-AI-LIVE-ACCESS-PCT'),
  'agents',(select agents from live),
  'semantic_landmarks',(select numeric_value from latest where metric_code='M-AI-SEMANTIC-LANDMARKS'),
  'root_jsonld_blocks',(select numeric_value from latest where metric_code='M-AI-ROOT-JSONLD-BLOCKS'),
  'last_modified_present',coalesce((select numeric_value=1 from latest where metric_code='M-AI-LASTMOD-PRESENT'),false),
  'llms_txt',jsonb_build_object('present_nonempty',coalesce((select numeric_value=1 from latest where metric_code='M-AI-LLMS-TXT-NONEMPTY'),false),'standardized',false,'score_effect','none','disclosure','Ecosystem convention only. Absence is not a GCL failure and does not imply reduced Google AI visibility.'),
  'chatgpt_ads_readiness',jsonb_build_object(
    'available',exists(select 1 from latest where metric_code='M-AI-LIVE-OAI-ADSBOT'),
    'robots_policy',(select text_value from latest where metric_code='M-AI-OAI-ADSBOT'),
    'landing_page_accessible',(select numeric_value=1 from latest where metric_code='M-AI-LIVE-OAI-ADSBOT'),
    'audited_landing_url',(select value->>'audited_landing_url' from latest where metric_code='M-AI-LIVE-OAI-ADSBOT'),
    'http_status',(select nullif(value->>'status','')::int from latest where metric_code='M-AI-LIVE-OAI-ADSBOT'),
    'diagnostic_only',true,'score_effect','none','disclosure','Observed OAI-AdsBot landing-page access only; this does not prove ad approval, delivery, ranking, citation, traffic or conversion.'
  ),
  'policy',jsonb_build_object('oai_searchbot',(select text_value from latest where metric_code='M-AI-OAI-SEARCHBOT'),'oai_adsbot',(select text_value from latest where metric_code='M-AI-OAI-ADSBOT'),'chatgpt_user',(select text_value from latest where metric_code='M-AI-CHATGPT-USER'),'claude_searchbot',(select text_value from latest where metric_code='M-AI-CLAUDE-SEARCH'),'perplexitybot',(select text_value from latest where metric_code='M-AI-PERPLEXITYBOT'),'google_extended',(select text_value from latest where metric_code='M-AI-GOOGLE-EXT'),'gptbot',(select text_value from latest where metric_code='M-AI-GPTBOT')),
  'methodology','robots policy + current root HTTP access with each permitted AI search/user-agent; OAI-AdsBot is measured separately against the audited landing-page URL; raw HTML semantics are diagnostic only',
  'disclosure','Technical accessibility and comprehension hints do not prove indexing, citation, model training, recommendation, traffic, leads, conversion or revenue.'
);$function$;

create or replace function sac.gcl_ai_enqueue_canary(p_audit_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare v_hash text; v_id uuid;
begin
  v_hash:=sac.gcl_ai_evidence_hash(p_audit_run_id);
  insert into sac.ai_enrichment_jobs(audit_run_id,purpose,evidence_hash,prompt_version,model_requested,status,updated_at)
  values(p_audit_run_id,'canary',v_hash,'GCL-AI-1.3','nex-agi/nex-n2.5-mini:free','queued',now())
  on conflict(audit_run_id,evidence_hash,prompt_version) do update set model_requested=excluded.model_requested,updated_at=now()
  returning id into v_id; return v_id;
end;$function$;

create or replace function sac.gcl_ai_enqueue_completed_checkouts(p_limit integer default 5)
returns integer
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare r record; v_hash text; v_n int:=0; v_rows int;
begin
  for r in select distinct on (i.scan_public_token) f.audit_run_id from sac.analysis_checkout_intents i join sac.fullscan_jobs f on f.public_token=i.scan_public_token where i.status='completed' and i.paid_at is not null and i.scan_public_token is not null and f.status='completed' and f.materialized_at is not null and f.audit_run_id is not null order by i.scan_public_token,f.completed_at desc limit greatest(1,least(coalesce(p_limit,5),10)) loop
    v_hash:=sac.gcl_ai_evidence_hash(r.audit_run_id);
    insert into sac.ai_enrichment_jobs(audit_run_id,purpose,evidence_hash,prompt_version,model_requested,status,updated_at)
    values(r.audit_run_id,'paid_analysis',v_hash,'GCL-AI-1.3','nex-agi/nex-n2.5-mini:free','queued',now())
    on conflict(audit_run_id,evidence_hash,prompt_version) do nothing;
    get diagnostics v_rows=row_count; v_n:=v_n+v_rows;
  end loop; return v_n;
end;$function$;