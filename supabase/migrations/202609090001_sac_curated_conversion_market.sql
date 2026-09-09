-- Sites de Alta Conversao: curated marketplace inspired by editorial marketplaces,
-- but ranked by observed audit gaps. Buying never changes SAC Score.

create table if not exists sac.market_categories (
  category_code text primary key,
  label text not null,
  description text not null,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sac.market_listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_code text not null references sac.market_categories(category_code),
  title text not null,
  summary text not null,
  description text,
  listing_type text not null check (listing_type in ('service','digital_product','template','plugin','tool','course','expert')),
  seller_name text not null,
  seller_url text,
  checkout_url text,
  preview_url text,
  price_from numeric,
  currency text not null default 'BRL',
  pricing_model text not null default 'custom' check (pricing_model in ('free','one_time','subscription','custom','external')),
  platforms text[] not null default '{}',
  tags text[] not null default '{}',
  fulfillment_mode text not null default 'configure_in_app',
  media jsonb not null default '[]'::jsonb,
  curation_status text not null default 'draft' check (curation_status in ('draft','submitted','review','published','rejected','archived')),
  editorial_featured boolean not null default false,
  free_tier boolean not null default false,
  anchor_engines text[] not null default '{}',
  verification_note text not null default 'A presença deste item no Market não altera o SAC Score. Pontos só mudam quando uma nova auditoria comprova melhoria real.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sac.market_listing_engines (
  listing_id uuid not null references sac.market_listings(id) on delete cascade,
  engine text not null,
  relevance_weight numeric not null default 1 check (relevance_weight > 0 and relevance_weight <= 5),
  primary key (listing_id, engine)
);

create table if not exists sac.market_submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_user_id uuid,
  seller_name text not null,
  contact_email text not null,
  title text not null,
  listing_type text not null,
  product_url text,
  preview_url text,
  price_from numeric,
  currency text not null default 'BRL',
  platforms text[] not null default '{}',
  notes text,
  status text not null default 'submitted' check (status in ('submitted','review','approved','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists market_listings_category_status_idx on sac.market_listings(category_code,curation_status);
create index if not exists market_listings_featured_idx on sac.market_listings(editorial_featured) where curation_status='published';
create index if not exists market_listing_engines_engine_idx on sac.market_listing_engines(engine,listing_id);
create index if not exists market_submissions_status_idx on sac.market_submissions(status,created_at);

revoke all on sac.market_categories,sac.market_listings,sac.market_listing_engines,sac.market_submissions from public,anon,authenticated;
grant select,insert,update,delete on sac.market_categories,sac.market_listings,sac.market_listing_engines,sac.market_submissions to service_role;

insert into sac.market_categories(category_code,label,description,sort_order) values
('conversion','Conversão & CRO','Landing pages, oferta, copy, CTA, arquitetura de conversão e testes.',10),
('performance','Performance & WPO','Core Web Vitals, frontend, rede, imagens, scripts e estabilidade.',20),
('seo','SEO & Descoberta','SEO técnico, conteúdo, schema, indexação, autoridade e AI visibility.',30),
('data','Tracking & Dados','GA4, GTM, pixels, eventos, consentimento e mensuração.',40),
('behavior','Comportamento & RUM','Sessões reais, rage/dead clicks, scroll, formulários e erros.',50),
('automation','CRM & Automação','CRM, roteamento, follow-up, APIs, webhooks e recuperação.',60),
('accessibility','Acessibilidade','WCAG, navegação, semântica, labels, contraste e remediação.',70),
('commerce','E-commerce & Checkout','Carrinho, checkout, custos, confiança, pagamentos e abandono.',80),
('intelligence','Inteligência Competitiva','Tráfego estimado, concorrentes, benchmarks e share of voice.',90),
('templates','Templates & Assets','Templates, componentes e recursos curados compatíveis com o stack.',100)
on conflict (category_code) do update set label=excluded.label,description=excluded.description,sort_order=excluded.sort_order,active=true;

insert into sac.market_listings(slug,category_code,title,summary,description,listing_type,seller_name,pricing_model,platforms,tags,fulfillment_mode,curation_status,editorial_featured,anchor_engines) values
('conversion-landing-build','conversion','Landing Page de Alta Conversão','Construção ou reconstrução da página a partir das lacunas comprovadas no scan.','Arquitetura, copy, UX, CTA, confiança, formulários, tracking-ready e reauditoria posterior.','service','Sites de Alta Conversão','custom',array['React','Tailwind','Framer','Webflow','WordPress'],array['landing-page','cro','copy','ux'],'configure_in_app','published',true,array['conversion_architecture','copy_offer']),
('performance-wpo-sprint','performance','Performance & WPO Sprint','Correção priorizada de gargalos de carregamento, estabilidade e frontend.','Foco em Core Web Vitals, scripts, imagens, rede, cache, renderização e regressões técnicas.','service','Sites de Alta Conversão','custom',array['Web'],array['performance','cwv','frontend'],'configure_in_app','published',true,array['performance']),
('seo-discovery-sprint','seo','SEO & Discovery Sprint','Correções técnicas e de conteúdo priorizadas pelo motor de auditoria.','Indexabilidade, headings, metadata, schema, arquitetura, conteúdo, links internos e sinais para busca/IA.','service','Sites de Alta Conversão','custom',array['Web'],array['seo','schema','content','ai-search'],'configure_in_app','published',false,array['seo_onpage','crawl_indexability']),
('tracking-data-foundation','data','Tracking & Data Foundation','Implantação de mensuração confiável para transformar suposições em dados próprios.','GA4/GTM/pixels, eventos de funil, consentimento e validação de coleta.','service','Sites de Alta Conversão','custom',array['GA4','GTM','Meta','Google Ads'],array['tracking','analytics','events'],'configure_in_app','published',true,array['analytics_tracking']),
('behavior-rum-setup','behavior','Behavior & RUM Setup','Instrumentação para enxergar frustração e experiência real de usuários.','Rage/dead clicks, quick backs, excessive scrolling, erros, scroll depth, CTA e formulários usando fontes próprias ou conectadas.','service','Sites de Alta Conversão','custom',array['Microsoft Clarity','GA4','Web'],array['rum','behavior','clarity','forms'],'configure_in_app','published',true,array['analytics_tracking','forms','ux']),
('crm-automation-layer','automation','CRM & Automation Layer','Conecta captura, roteamento, follow-up e recuperação sem pedir senhas no diagnóstico.','CRM, webhooks, lead routing, onboarding, recuperação de abandono e automações observáveis.','service','Sites de Alta Conversão','custom',array['CRM','Webhook','WhatsApp','Email'],array['crm','automation','webhook'],'configure_in_app','published',false,array['email_crm','funnel_integrations']),
('accessibility-remediation','accessibility','Accessibility Remediation','Corrige problemas automatizáveis e prepara revisão humana quando necessária.','Semântica, labels, foco, teclado, contraste e padrões WCAG; automação não é apresentada como certificação manual completa.','service','Sites de Alta Conversão','custom',array['Web'],array['wcag','a11y'],'configure_in_app','published',false,array['accessibility']),
('checkout-optimization','commerce','Checkout Optimization','Reduz fricção de carrinho e checkout usando evidência técnica e pesquisa de UX.','Guest checkout, custos e prazos visíveis, campos, erros, confiança, meios de pagamento e instrumentação do funil.','service','Sites de Alta Conversão','custom',array['Shopify','WooCommerce','Custom Commerce'],array['checkout','ecommerce','baymard'],'configure_in_app','published',true,array['ecommerce_checkout']),
('traffic-competitive-intelligence','intelligence','Competitive Traffic Intelligence','Adiciona contexto competitivo sem confundir estimativas de mercado com analytics próprios.','Visitas estimadas, canais, dispositivo, páginas líderes, crescimento, concorrentes e benchmarks quando houver provider autorizado.','service','Sites de Alta Conversão','custom',array['Traffic Provider'],array['traffic','competitors','benchmark'],'configure_in_app','published',false,array[]::text[]),
('experimentation-lab','conversion','Experimentation Lab','Estrutura testes quando há tráfego e dados suficientes, sem p-value de fachada.','A/B, MDE, poder, SRM, duração e uplift; bandits só quando o caso e o volume justificam.','service','Sites de Alta Conversão','custom',array['Experiment Platform'],array['ab-test','experimentation','statistics'],'configure_in_app','published',false,array['analytics_tracking','conversion_architecture','copy_offer'])
on conflict (slug) do update set category_code=excluded.category_code,title=excluded.title,summary=excluded.summary,description=excluded.description,listing_type=excluded.listing_type,seller_name=excluded.seller_name,pricing_model=excluded.pricing_model,platforms=excluded.platforms,tags=excluded.tags,fulfillment_mode=excluded.fulfillment_mode,curation_status=excluded.curation_status,editorial_featured=excluded.editorial_featured,anchor_engines=excluded.anchor_engines,updated_at=now();

with m(slug,engine,w) as (values
('conversion-landing-build','conversion_architecture',3.0),('conversion-landing-build','copy_offer',3.0),('conversion-landing-build','ux',2.5),('conversion-landing-build','forms',2.0),('conversion-landing-build','trust',1.5),
('performance-wpo-sprint','performance',3.0),('performance-wpo-sprint','frontend_network',2.5),('performance-wpo-sprint','image_intelligence',1.5),('performance-wpo-sprint','mobile',1.5),
('seo-discovery-sprint','seo_onpage',3.0),('seo-discovery-sprint','crawl_indexability',2.5),('seo-discovery-sprint','structured_data',2.0),('seo-discovery-sprint','content',2.0),('seo-discovery-sprint','ai_search',1.5),('seo-discovery-sprint','blog_authority',1.5),
('tracking-data-foundation','analytics_tracking',3.0),('tracking-data-foundation','privacy',1.5),('tracking-data-foundation','funnel_integrations',1.0),
('behavior-rum-setup','ux',1.5),('behavior-rum-setup','forms',2.0),('behavior-rum-setup','analytics_tracking',1.5),('behavior-rum-setup','performance',1.0),
('crm-automation-layer','email_crm',3.0),('crm-automation-layer','funnel_integrations',3.0),('crm-automation-layer','analytics_tracking',1.0),
('accessibility-remediation','accessibility',4.0),('accessibility-remediation','mobile',1.0),
('checkout-optimization','ecommerce_checkout',4.0),('checkout-optimization','forms',2.0),('checkout-optimization','trust',1.5),('checkout-optimization','conversion_architecture',1.5),
('traffic-competitive-intelligence','analytics_tracking',1.0),('traffic-competitive-intelligence','blog_authority',1.0),('traffic-competitive-intelligence','ai_search',1.0),
('experimentation-lab','conversion_architecture',2.0),('experimentation-lab','copy_offer',1.5),('experimentation-lab','analytics_tracking',2.5)
)
insert into sac.market_listing_engines(listing_id,engine,relevance_weight)
select l.id,m.engine,m.w from m join sac.market_listings l on l.slug=m.slug
on conflict (listing_id,engine) do update set relevance_weight=excluded.relevance_weight;

create or replace function sac.recommend_market_listings(p_audit_run_id uuid,p_limit integer default 8)
returns jsonb language sql security invoker set search_path=sac,public as $$
with gaps as (
  select ac.engine,count(*)::int gap_count,
         sum(case ae.status when 'warning' then 1 when 'fail' then 1.25 when 'needs_connection' then .7 else 0 end)::numeric severity_weight
  from sac.atomic_evaluations ae join sac.atomic_checks ac on ac.check_code=ae.check_code
  where ae.audit_run_id=p_audit_run_id and ae.status in ('warning','fail','needs_connection') group by ac.engine
), scored as (
  select l.id,l.slug,l.category_code,l.title,l.summary,l.listing_type,l.seller_name,l.checkout_url,l.preview_url,l.price_from,l.currency,l.pricing_model,l.platforms,l.tags,l.fulfillment_mode,l.editorial_featured,l.verification_note,l.anchor_engines,
         coalesce(sum(g.gap_count*le.relevance_weight),0)::numeric match_points,
         coalesce(sum(g.severity_weight*le.relevance_weight),0)::numeric impact_signal,
         coalesce(sum(g.gap_count),0)::int matched_gaps,
         coalesce(jsonb_agg(distinct jsonb_build_object('engine',le.engine,'gaps',g.gap_count,'weight',le.relevance_weight)) filter (where g.engine is not null),'[]'::jsonb) engine_matches,
         case when cardinality(l.anchor_engines)=0 then true else exists(select 1 from gaps ga where ga.engine=any(l.anchor_engines) and ga.gap_count>0) end anchor_met
  from sac.market_listings l join sac.market_listing_engines le on le.listing_id=l.id left join gaps g on g.engine=le.engine
  where l.curation_status='published' group by l.id
), ranked as (
  select *,row_number() over(order by (match_points+case when editorial_featured then 1 else 0 end) desc,impact_signal desc,title) rn
  from scored where anchor_met and (match_points>0 or cardinality(anchor_engines)=0)
)
select coalesce(jsonb_agg(jsonb_build_object('slug',slug,'category',category_code,'title',title,'summary',summary,'listing_type',listing_type,'seller_name',seller_name,'checkout_url',checkout_url,'preview_url',preview_url,'price_from',price_from,'currency',currency,'pricing_model',pricing_model,'platforms',platforms,'tags',tags,'fulfillment_mode',fulfillment_mode,'featured',editorial_featured,'matched_gaps',matched_gaps,'match_points',round(match_points,2),'impact_signal',round(impact_signal,2),'engine_matches',engine_matches,'score_disclosure',verification_note) order by rn),'[]'::jsonb)
from ranked where rn<=greatest(1,least(coalesce(p_limit,8),24));
$$;

create or replace function public.sac_api_market_for_token(p_token uuid,p_limit integer default 8)
returns jsonb language plpgsql security definer set search_path=public,sac as $$
declare v_audit uuid;v_recs jsonb;v_categories jsonb;begin
 select audit_run_id into v_audit from sac.fullscan_jobs where public_token=p_token order by created_at desc limit 1;
 if v_audit is null then return jsonb_build_object('found',false); end if;
 v_recs:=sac.recommend_market_listings(v_audit,p_limit);
 select coalesce(jsonb_agg(jsonb_build_object('code',category_code,'label',label,'description',description) order by sort_order),'[]'::jsonb) into v_categories from sac.market_categories where active;
 return jsonb_build_object('found',true,'audit_run_id',v_audit,'categories',v_categories,'recommendations',v_recs,'policy',jsonb_build_object('pay_to_win',false,'score_changes_only_after_reaudit',true,'market_is_curated',true));
end;$$;

create or replace function public.sac_api_market_catalog(p_limit integer default 12)
returns jsonb language plpgsql security definer set search_path=public,sac as $$
declare v_categories jsonb;v_listings jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('code',category_code,'label',label,'description',description) order by sort_order),'[]'::jsonb) into v_categories from sac.market_categories where active;
 select coalesce(jsonb_agg(x.obj order by x.featured desc,x.title),'[]'::jsonb) into v_listings from (
   select l.editorial_featured featured,l.title,jsonb_build_object('slug',l.slug,'category',l.category_code,'title',l.title,'summary',l.summary,'listing_type',l.listing_type,'seller_name',l.seller_name,'checkout_url',l.checkout_url,'preview_url',l.preview_url,'price_from',l.price_from,'currency',l.currency,'pricing_model',l.pricing_model,'platforms',l.platforms,'tags',l.tags,'fulfillment_mode',l.fulfillment_mode,'featured',l.editorial_featured,'free_tier',l.free_tier,'score_disclosure',l.verification_note) obj
   from sac.market_listings l where l.curation_status='published' order by l.editorial_featured desc,l.updated_at desc,l.title limit greatest(1,least(coalesce(p_limit,12),30))
 ) x;
 return jsonb_build_object('found',true,'categories',v_categories,'listings',v_listings,'policy',jsonb_build_object('curated',true,'pay_to_win',false,'score_changes_only_after_reaudit',true,'external_sellers_supported',true));
end;$$;

revoke all on function public.sac_api_market_for_token(uuid,integer) from public,anon,authenticated;
revoke all on function public.sac_api_market_catalog(integer) from public,anon,authenticated;
grant execute on function public.sac_api_market_for_token(uuid,integer) to service_role;
grant execute on function public.sac_api_market_catalog(integer) to service_role;
