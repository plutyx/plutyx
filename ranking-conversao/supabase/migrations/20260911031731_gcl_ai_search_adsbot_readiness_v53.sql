insert into sac.metric_registry(metric_code,engine,name,unit,evidence_class,collection_mode,audit_scope,score_role,threshold,evidence_requirements,source_reference,methodology_version,status,updated_at)
values(
  'M-AI-LIVE-OAI-ADSBOT','ai_search','OAI-AdsBot live root accessibility','boolean','url_http','domain_crawl_probe','public_enrichment','diagnostic','{}'::jsonb,
  jsonb_build_object('meaning','observed HTTP accessibility only','requires','robots policy permits agent','purpose','ChatGPT advertising landing-page validation; separate from AI search visibility'),
  'OPENAI-ADVERTISER-CRAWLERS-2026','SAC-METRICS-1.4','experimental',now()
)
on conflict(metric_code) do update set
  engine=excluded.engine,name=excluded.name,unit=excluded.unit,evidence_class=excluded.evidence_class,collection_mode=excluded.collection_mode,
  audit_scope=excluded.audit_scope,score_role=excluded.score_role,threshold=excluded.threshold,evidence_requirements=excluded.evidence_requirements,
  source_reference=excluded.source_reference,methodology_version=excluded.methodology_version,status=excluded.status,updated_at=now();

insert into sac.metric_collection_capabilities(metric_code,availability,autonomous,requires_connection,implemented,provider_dependency,methodology_note,updated_at)
values('M-AI-LIVE-OAI-ADSBOT','autonomous_public',true,false,true,null,
  'Observed public root HTTP accessibility for OAI-AdsBot only when robots policy permits it. This is an advertising landing-page readiness diagnostic and does not prove ad approval, delivery, ranking, citation, traffic or conversion.',now())
on conflict(metric_code) do update set availability=excluded.availability,autonomous=excluded.autonomous,requires_connection=excluded.requires_connection,
  implemented=excluded.implemented,provider_dependency=excluded.provider_dependency,methodology_note=excluded.methodology_note,updated_at=now();

create or replace function sac.materialize_ai_live_access(p_audit_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'sac','public'
as $function$
declare s record; j jsonb; acc jsonb; ads jsonb; sid uuid; applicable int; accessible int; pct numeric; n int:=0;
begin
  select id,payload,captured_at,normalized_url into s
  from sac.source_snapshots
  where source='domain_crawl_probe' and payload->>'audit_run_id'=p_audit_run_id::text
  order by fetched_at desc limit 1;
  if not found then return jsonb_build_object('updated',0,'reason','domain_probe_missing'); end if;
  j:=s.payload; sid:=s.id;
  if coalesce(j->>'probe_version','')<'1.1.0' or not (j ? 'ai_access') then
    return jsonb_build_object('updated',0,'reason','probe_version_without_live_ai','probe_version',j->>'probe_version');
  end if;

  if j ? 'root_semantics' then
    perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-SEMANTIC-LANDMARKS',coalesce(nullif(j->'root_semantics'->>'semantic_landmarks','')::numeric,0),null,j->'root_semantics','domain_crawl_probe',sid,0.92,jsonb_build_object('raw_html_root_only',true,'probe_version',j->>'probe_version')); n:=n+1;
    perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-ROOT-JSONLD-BLOCKS',coalesce(nullif(j->'root_semantics'->>'jsonld_blocks','')::numeric,0),null,j->'root_semantics'->'jsonld_blocks','domain_crawl_probe',sid,0.92,jsonb_build_object('raw_html_root_only',true,'probe_version',j->>'probe_version')); n:=n+1;
  end if;

  perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LASTMOD-PRESENT',case when nullif(j->'freshness'->>'last_modified_header','') is not null then 1 else 0 end,null,j->'freshness','domain_crawl_probe',sid,0.90,jsonb_build_object('absence_is_failure',false,'probe_version',j->>'probe_version')); n:=n+1;
  perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LLMS-TXT-NONEMPTY',case when coalesce((j->'llms_txt'->>'available')::boolean,false) and coalesce((j->'llms_txt'->>'nonempty')::boolean,false) then 1 else 0 end,null,j->'llms_txt','domain_crawl_probe',sid,0.88,jsonb_build_object('standardized',false,'absence_is_failure',false,'probe_version',j->>'probe_version')); n:=n+1;

  applicable:=coalesce(nullif(j->'ai_access'->>'applicable_count','')::int,0);
  accessible:=coalesce(nullif(j->'ai_access'->>'robots_and_live_access_count','')::int,0);
  if applicable>0 then
    pct:=round(accessible::numeric*100/applicable,2);
    perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LIVE-ACCESS-PCT',pct,null,j->'ai_access','domain_crawl_probe',sid,0.99,jsonb_build_object('denominator',applicable,'accessible',accessible,'probe_version',j->>'probe_version','excludes_oai_adsbot',true)); n:=n+1;
  end if;

  for acc in select value from jsonb_array_elements(coalesce(j->'ai_access'->'agents','[]'::jsonb)) loop
    case lower(acc->>'agent')
      when 'oai-searchbot' then perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LIVE-OAI-SEARCHBOT',case when coalesce((acc->>'accessible')::boolean,false) then 1 else 0 end,case when coalesce((acc->>'accessible')::boolean,false) then 'accessible' else 'blocked_or_unavailable' end,acc,'domain_crawl_probe',sid,0.99,jsonb_build_object('probe_version',j->>'probe_version')); n:=n+1;
      when 'chatgpt-user' then perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LIVE-CHATGPT-USER',case when coalesce((acc->>'accessible')::boolean,false) then 1 else 0 end,case when coalesce((acc->>'accessible')::boolean,false) then 'accessible' else 'blocked_or_unavailable' end,acc,'domain_crawl_probe',sid,0.98,jsonb_build_object('probe_version',j->>'probe_version')); n:=n+1;
      when 'claude-searchbot' then perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LIVE-CLAUDE-SEARCH',case when coalesce((acc->>'accessible')::boolean,false) then 1 else 0 end,case when coalesce((acc->>'accessible')::boolean,false) then 'accessible' else 'blocked_or_unavailable' end,acc,'domain_crawl_probe',sid,0.98,jsonb_build_object('probe_version',j->>'probe_version')); n:=n+1;
      when 'claude-user' then perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LIVE-CLAUDE-USER',case when coalesce((acc->>'accessible')::boolean,false) then 1 else 0 end,case when coalesce((acc->>'accessible')::boolean,false) then 'accessible' else 'blocked_or_unavailable' end,acc,'domain_crawl_probe',sid,0.98,jsonb_build_object('probe_version',j->>'probe_version')); n:=n+1;
      when 'perplexitybot' then perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LIVE-PERPLEXITYBOT',case when coalesce((acc->>'accessible')::boolean,false) then 1 else 0 end,case when coalesce((acc->>'accessible')::boolean,false) then 'accessible' else 'blocked_or_unavailable' end,acc,'domain_crawl_probe',sid,0.98,jsonb_build_object('probe_version',j->>'probe_version')); n:=n+1;
      when 'perplexity-user' then perform sac.upsert_metric_observation(p_audit_run_id,null,'M-AI-LIVE-PERPLEXITY-USER',case when coalesce((acc->>'accessible')::boolean,false) then 1 else 0 end,case when coalesce((acc->>'accessible')::boolean,false) then 'accessible' else 'blocked_or_unavailable' end,acc,'domain_crawl_probe',sid,0.98,jsonb_build_object('probe_version',j->>'probe_version')); n:=n+1;
      else null;
    end case;
  end loop;

  ads:=j->'ads_access';
  if ads is not null and jsonb_typeof(ads)='object' then
    perform sac.upsert_metric_observation(
      p_audit_run_id,null,'M-AI-LIVE-OAI-ADSBOT',
      case when coalesce((ads->>'accessible')::boolean,false) then 1 else 0 end,
      case when coalesce((ads->>'accessible')::boolean,false) then 'accessible' else 'blocked_or_unavailable' end,
      ads,'domain_crawl_probe',sid,0.99,
      jsonb_build_object('probe_version',j->>'probe_version','separate_from_ai_search_access_percent',true,'purpose','chatgpt_ad_landing_page_readiness')
    ); n:=n+1;
  end if;

  return jsonb_build_object('updated',n,'live_access_percent',pct,'adsbot_observed',ads is not null,'probe_version',j->>'probe_version');
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
    'accessible',numeric_value=1,
    'robots_allowed',coalesce((value->>'robots_allowed')::boolean,false),
    'request_made',coalesce((value->>'request_made')::boolean,false),
    'http_status',nullif(value->>'status','')::int,
    'server',value->>'server','confidence',confidence,'evidence',value
  ) order by case metric_code
      when 'M-AI-LIVE-OAI-SEARCHBOT' then 1 when 'M-AI-LIVE-CHATGPT-USER' then 2 when 'M-AI-LIVE-CLAUDE-SEARCH' then 3 when 'M-AI-LIVE-CLAUDE-USER' then 4 when 'M-AI-LIVE-PERPLEXITYBOT' then 5 else 6 end),'[]'::jsonb) agents
  from latest where metric_code like 'M-AI-LIVE-%' and metric_code not in ('M-AI-LIVE-ACCESS-PCT','M-AI-LIVE-OAI-ADSBOT')
)
select jsonb_build_object(
  'available',exists(select 1 from latest where metric_code='M-AI-LIVE-ACCESS-PCT'),
  'live_access_percent',(select numeric_value from latest where metric_code='M-AI-LIVE-ACCESS-PCT'),
  'agents',(select agents from live),
  'semantic_landmarks',(select numeric_value from latest where metric_code='M-AI-SEMANTIC-LANDMARKS'),
  'root_jsonld_blocks',(select numeric_value from latest where metric_code='M-AI-ROOT-JSONLD-BLOCKS'),
  'last_modified_present',coalesce((select numeric_value=1 from latest where metric_code='M-AI-LASTMOD-PRESENT'),false),
  'llms_txt',jsonb_build_object(
    'present_nonempty',coalesce((select numeric_value=1 from latest where metric_code='M-AI-LLMS-TXT-NONEMPTY'),false),
    'standardized',false,
    'score_effect','none',
    'disclosure','Ecosystem convention only. Absence is not a GCL failure and does not imply reduced Google AI visibility.'
  ),
  'chatgpt_ads_readiness',jsonb_build_object(
    'available',exists(select 1 from latest where metric_code='M-AI-LIVE-OAI-ADSBOT'),
    'robots_policy',(select text_value from latest where metric_code='M-AI-OAI-ADSBOT'),
    'root_accessible',(select numeric_value=1 from latest where metric_code='M-AI-LIVE-OAI-ADSBOT'),
    'http_status',(select nullif(value->>'status','')::int from latest where metric_code='M-AI-LIVE-OAI-ADSBOT'),
    'diagnostic_only',true,
    'score_effect','none',
    'disclosure','Observed OAI-AdsBot landing-page access only; this does not prove ad approval, delivery, ranking, citation, traffic or conversion.'
  ),
  'policy',jsonb_build_object(
    'oai_searchbot',(select text_value from latest where metric_code='M-AI-OAI-SEARCHBOT'),
    'oai_adsbot',(select text_value from latest where metric_code='M-AI-OAI-ADSBOT'),
    'chatgpt_user',(select text_value from latest where metric_code='M-AI-CHATGPT-USER'),
    'claude_searchbot',(select text_value from latest where metric_code='M-AI-CLAUDE-SEARCH'),
    'perplexitybot',(select text_value from latest where metric_code='M-AI-PERPLEXITYBOT'),
    'google_extended',(select text_value from latest where metric_code='M-AI-GOOGLE-EXT'),
    'gptbot',(select text_value from latest where metric_code='M-AI-GPTBOT')
  ),
  'methodology','robots policy + current root HTTP access with each permitted AI search/user-agent; OAI-AdsBot is measured separately; raw HTML semantics are diagnostic only',
  'disclosure','Technical accessibility and comprehension hints do not prove indexing, citation, model training, recommendation, traffic, leads, conversion or revenue.'
);$function$;