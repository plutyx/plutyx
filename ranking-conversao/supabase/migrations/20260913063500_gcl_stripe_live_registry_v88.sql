-- GCL v88 — stage the MyAds Stripe live catalog without opening public checkout.
-- Keeps sandbox usable for controlled homologation while storing live provider IDs separately.

create table if not exists sac.commercial_provider_configs (
  product_code text not null references sac.commercial_products(product_code) on update cascade on delete cascade,
  provider text not null,
  provider_environment text not null check (provider_environment in ('test','live')),
  provider_product_id text,
  provider_price_id text,
  provider_payment_link_id text,
  checkout_url text,
  status text not null default 'draft' check (status in ('draft','paused','active','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_code, provider, provider_environment),
  check (status <> 'active' or (provider_price_id is not null and checkout_url is not null))
);

create index if not exists commercial_provider_configs_environment_status_idx
  on sac.commercial_provider_configs(provider, provider_environment, status);

alter table sac.commercial_provider_configs enable row level security;
revoke all on sac.commercial_provider_configs from public, anon, authenticated;
grant select, insert, update, delete on sac.commercial_provider_configs to service_role;

-- Preserve the already-homologated Stripe test mapping in a dedicated environment row.
insert into sac.commercial_provider_configs(
  product_code, provider, provider_environment,
  provider_product_id, provider_price_id, provider_payment_link_id,
  checkout_url, status, metadata, updated_at
)
select
  product_code,
  'stripe',
  'test',
  provider_product_id,
  provider_price_id,
  provider_payment_link_id,
  checkout_url,
  case when status='active' then 'active' when status='paused' then 'paused' else 'draft' end,
  jsonb_build_object('source','commercial_products_snapshot','captured_for','gcl_v88'),
  now()
from sac.commercial_products
where provider_environment='test' and provider like 'stripe%'
on conflict (product_code, provider, provider_environment) do update set
  provider_product_id=excluded.provider_product_id,
  provider_price_id=excluded.provider_price_id,
  provider_payment_link_id=excluded.provider_payment_link_id,
  checkout_url=excluded.checkout_url,
  status=excluded.status,
  metadata=excluded.metadata,
  updated_at=now();

-- Live catalog created in MyAds Stripe. Deliberately paused: no Payment Link and no checkout URL.
insert into sac.commercial_provider_configs(
  product_code, provider, provider_environment,
  provider_product_id, provider_price_id, provider_payment_link_id,
  checkout_url, status, metadata, updated_at
) values
  ('sac_analysis_2026','stripe','live','prod_VFbbHqQxttduap','price_1UF6O46JsTcafgwgc3VQ81p6',null,null,'paused',jsonb_build_object('brand','GCL','operator','MyAds','lookup_key','gcl_sac_analysis_2026_live','amount_brl',97)),
  ('sac_ranking_monthly','stripe','live','prod_VFbcwA2SNtqRda','price_1UF6Q96JsTcafgwgls2bNWKg',null,null,'paused',jsonb_build_object('brand','GCL','operator','MyAds','lookup_key','gcl_sac_ranking_monthly_live','amount_brl',59,'interval','month')),
  ('sac_community_monthly','stripe','live','prod_VFbcxpHlmMvcWe','price_1UF6QI6JsTcafgwgObJTNj6j',null,null,'paused',jsonb_build_object('brand','GCL','operator','MyAds','lookup_key','gcl_sac_community_monthly_live','amount_brl',39,'interval','month')),
  ('sac_ranking_community_monthly','stripe','live','prod_VFbcyk52BhHhqm','price_1UF6QR6JsTcafgwgWJ8hv6zB',null,null,'paused',jsonb_build_object('brand','GCL','operator','MyAds','lookup_key','gcl_sac_ranking_community_monthly_live','amount_brl',79,'interval','month')),
  ('sac_awards_entry_2026','stripe','live','prod_VFbcue0oYkHOvb','price_1UF6Qa6JsTcafgwgayHcu1IC',null,null,'paused',jsonb_build_object('brand','GCL','operator','MyAds','lookup_key','gcl_sac_awards_entry_2026_live','amount_brl',297)),
  ('sac_complete_entry_2026','stripe','live','prod_VFbdaSBU6KBfHL','price_1UF6Qj6JsTcafgwgfHy4V1Y7',null,null,'paused',jsonb_build_object('brand','GCL','operator','MyAds','lookup_key','gcl_sac_complete_entry_2026_live','amount_brl',349))
on conflict (product_code, provider, provider_environment) do update set
  provider_product_id=excluded.provider_product_id,
  provider_price_id=excluded.provider_price_id,
  provider_payment_link_id=null,
  checkout_url=null,
  status='paused',
  metadata=excluded.metadata,
  updated_at=now();

-- Fail closed for authenticated member checkout. Test remains usable only for draft/active sandbox offers;
-- live requires an explicitly active product and a configured checkout URL.
create or replace function public.gcl_prepare_member_checkout(p_product_code text, p_domain_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sac', 'auth'
as $function$
declare
  uid uuid:=auth.uid();
  p sac.commercial_products%rowtype;
  i sac.checkout_intents%rowtype;
  needs_domain boolean;
begin
  perform sac.gcl_authenticated_rpc_rate_limit('gcl:member_checkout', 20, 60);
  if uid is null then raise exception 'authentication_required'; end if;
  select * into p from sac.commercial_products where product_code=p_product_code;
  if not found then raise exception 'product_not_found'; end if;

  if p.provider_environment='live' then
    if p.status<>'active' or p.checkout_url is null then raise exception 'checkout_unavailable'; end if;
  elsif p.provider_environment='test' then
    if p.status not in ('draft','active') or p.checkout_url is null then raise exception 'checkout_unavailable'; end if;
  else
    raise exception 'checkout_unavailable';
  end if;

  needs_domain:=coalesce(p.grants && array['public_ranking_candidate','public_ranking','award_submission_2026','award_profile']::text[],false);
  if needs_domain and p_domain_id is null then raise exception 'domain_required'; end if;
  if p_domain_id is not null and not exists(select 1 from sac.domains d where d.id=p_domain_id and d.owner_user_id=uid) then raise exception 'domain_not_owned'; end if;
  insert into sac.checkout_intents(user_id,domain_id,product_code,provider)
  values(uid,p_domain_id,p_product_code,p.provider)
  returning * into i;
  return jsonb_build_object(
    'checkout_intent',i.public_token,
    'product_code',p.product_code,
    'provider_environment',p.provider_environment,
    'url',sac.checkout_url_for(p.product_code,i.public_token),
    'expires_at',i.expires_at,
    'grants',p.grants,
    'domain_required',needs_domain
  );
end
$function$;

-- Public analysis checkout must never surface sandbox links. p_sandbox=true is the explicit homologation escape hatch.
create or replace function public.gcl_analysis_checkout_url(p_intent_token uuid, p_sandbox boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sac'
as $function$
declare
  i sac.analysis_checkout_intents%rowtype;
  p sac.commercial_products%rowtype;
  ready boolean:=false;
begin
  select * into i from sac.analysis_checkout_intents
  where public_token=p_intent_token and status='prepared' and expires_at>now();
  if not found then raise exception 'analysis_intent_not_found'; end if;
  select * into p from sac.commercial_products where product_code=i.product_code;
  if not found then raise exception 'product_not_found'; end if;

  if p.provider_environment='live' then
    ready:=p.status='active' and p.checkout_url is not null;
  elsif p.provider_environment='test' then
    ready:=p_sandbox and p.status in ('draft','active') and p.checkout_url is not null;
  end if;

  return jsonb_build_object(
    'checkout_ready',ready,
    'provider_environment',p.provider_environment,
    'url',case when ready then sac.checkout_url_for(p.product_code,p_intent_token) else null end
  );
end
$function$;

-- Qualify/prepare is public. It may describe the offer, but only emits a checkout URL when live is explicitly active.
create or replace function public.sac_api_prepare_analysis_core(p_url text, p_bucket_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'sac'
as $function$
declare
  v_url text:=btrim(p_url);
  v_bucket text:=left(coalesce(nullif(btrim(p_bucket_key),''),'anonymous'),128);
  v_domain text;
  v record;
  v_product sac.commercial_products%rowtype;
  v_source sac.benchmark_sources%rowtype;
  v_checkout_ready boolean:=false;
begin
  if v_url is null or length(v_url)<8 or length(v_url)>2048 or v_url !~* '^https?://' then raise exception 'invalid_url' using errcode='22023'; end if;
  v_domain:=lower(split_part(regexp_replace(v_url,'^https?://','','i'),'/',1));
  v_domain:=regexp_replace(v_domain,'^www\\.','','i');
  select * into v_product from sac.commercial_products where product_code='sac_analysis_2026';
  select * into v_source from sac.benchmark_sources order by created_at desc limit 1;

  v_checkout_ready:=v_product.status='active'
    and v_product.provider_environment='live'
    and v_product.checkout_url is not null;

  select * into v from sac.analysis_checkout_intents
  where bucket_key=v_bucket and normalized_domain=v_domain
    and status in ('prepared','paid','scan_queued') and expires_at>now()
  order by created_at desc limit 1;
  if v.id is null then
    insert into sac.analysis_checkout_intents(url,normalized_domain,bucket_key,product_code,price_snapshot,currency)
    values(v_url,v_domain,v_bucket,'sac_analysis_2026',v_product.price,v_product.currency)
    returning * into v;
  end if;

  return jsonb_build_object(
    'intent_token',v.public_token,
    'status',v.status,
    'url',v.url,
    'domain',v.normalized_domain,
    'expires_at',v.expires_at,
    'offer',jsonb_build_object(
      'product_code',v_product.product_code,
      'name',v_product.name,
      'price',v_product.price,
      'currency',v_product.currency,
      'checkout_url',case when v_checkout_ready then v_product.checkout_url else null end,
      'checkout_ready',v_checkout_ready,
      'provider_environment',v_product.provider_environment
    ),
    'benchmark',jsonb_build_object(
      'source',v_source.name,
      'urls_processed',v_source.audited_count,
      'successful_audits',v_source.successful_count,
      'failed_access',v_source.failed_count,
      'claim_10k_success_ready',coalesce(v_source.successful_count,0)>10000
    ),
    'next_step',case when v_checkout_ready then 'checkout' else 'payment_provider_pending' end
  );
end
$function$;

-- Tighten sandbox projection too: paused test configurations are not sandbox-ready.
create or replace function public.sac_api_offer_catalog()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'sac'
as $function$
with p as (
 select *,
   (status='active' and provider_environment='live' and checkout_url is not null) as live_ready,
   (status in ('draft','active') and provider_environment='test' and checkout_url is not null) as sandbox_ready
 from sac.commercial_products
), obj as (
 select product_code,jsonb_build_object(
   'product_code',product_code,'name',name,'price',price,'currency',currency,
   'billing_interval',billing_interval,
   'checkout_url',case when live_ready then checkout_url else null end,
   'checkout_ready',live_ready,'sandbox_ready',sandbox_ready,
   'provider_environment',provider_environment,'grants',grants
 ) j from p
), vals as (
 select
  (select price from p where product_code='sac_complete_entry_2026') entry_price,
  (select price from p where product_code='sac_ranking_community_monthly') recurring_price
)
select jsonb_build_object(
 'analysis',(select j from obj where product_code='sac_analysis_2026'),
 'awards',(select j from obj where product_code='sac_awards_entry_2026'),
 'ranking',(select j from obj where product_code='sac_ranking_monthly'),
 'community',(select j from obj where product_code='sac_community_monthly'),
 'club',(select j from obj where product_code='sac_ranking_community_monthly'),
 'complete',jsonb_build_object(
   'entry',(select j from obj where product_code='sac_complete_entry_2026'),
   'recurring',(select j from obj where product_code='sac_ranking_community_monthly'),
   'bundle',jsonb_build_object(
      'product_code','gcl_season_pass_2026',
      'name','GCL Season Pass 2026',
      'currency','BRL',
      'entry_price',(select entry_price from vals),
      'recurring_price',(select recurring_price from vals),
      'initial_total',(select entry_price+recurring_price from vals),
      'billing_interval','entry + monthly',
      'checkout_ready',false,
      'checkout_strategy','entry_then_membership',
      'includes',jsonb_build_array('GCL Conversion Audit','Global Conversion Awards 2026','GCL Ranking','GCL Community')
   )
 ),
 'rules',jsonb_build_object(
   'analysis_required_before_awards',true,
   'ranking_is_subscription',true,
   'community_is_subscription',true,
   'awards_entry_is_one_time_per_site_season',true,
   'complete_bundle_initial_charge_contains_entry_plus_first_month',true,
   'buying_services_never_buys_score',true,
   'score_changes_only_after_reaudit',true,
   'public_checkout_requires_live_provider',true
 )
);
$function$;

-- Health distinguishes staged live catalog from commercially active live checkout.
create or replace function public.gcl_public_health()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'sac'
as $function$
declare
  v_base jsonb;
  v_external jsonb;
  v_commercial jsonb;
  v_payments jsonb;
  v_machine boolean;
  v_external_ok boolean;
  v_live_staged int:=0;
begin
  v_base := public.gcl_public_health_base_v59()
    || jsonb_build_object('heavy_worker', public.gcl_worker_capacity_health());
  v_external := public.gcl_external_control_readiness();
  v_machine := coalesce((v_base->'commercial_go_live'->>'machine_checks_passed')::boolean,false);
  v_external_ok := coalesce((v_external->>'all_verified')::boolean,false);

  select count(*)::int into v_live_staged
  from sac.commercial_provider_configs
  where provider='stripe' and provider_environment='live' and status='paused'
    and provider_product_id is not null and provider_price_id is not null
    and provider_payment_link_id is null and checkout_url is null;

  v_payments := coalesce(v_base->'payments','{}'::jsonb) || jsonb_build_object(
    'live_staged_products',v_live_staged,
    'live_catalog_staged',v_live_staged=6,
    'live_catalog_public_checkout_open',coalesce((v_base->'payments'->>'live_ready')::boolean,false)
  );
  v_base := jsonb_set(v_base,'{payments}',v_payments,true);

  v_commercial := (v_base->'commercial_go_live') || jsonb_build_object(
    'external_controls',v_external,
    'external_attestations_passed',v_external_ok,
    'external_blockers',v_external->'blockers',
    'commercial_ready',v_machine and v_external_ok
  );

  return jsonb_set(v_base,'{commercial_go_live}',v_commercial,true);
end;
$function$;
