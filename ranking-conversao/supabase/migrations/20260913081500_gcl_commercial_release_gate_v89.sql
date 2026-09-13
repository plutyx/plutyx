-- GCL v89 — explicit global financial release gate.
-- Public live checkout remains closed until one auditable service-role action opens it.

create table if not exists sac.commercial_release_control (
  release_key text primary key,
  state text not null default 'closed' check (state in ('closed','open')),
  note text not null default 'initial_fail_closed',
  changed_at timestamptz not null default now(),
  changed_by text not null default 'migration',
  check (release_key='gcl_public_checkout')
);

insert into sac.commercial_release_control(release_key,state,note,changed_by)
values('gcl_public_checkout','closed','v89_initial_fail_closed','migration')
on conflict (release_key) do nothing;

alter table sac.commercial_release_control enable row level security;
revoke all on sac.commercial_release_control from public, anon, authenticated;
grant select,insert,update,delete on sac.commercial_release_control to service_role;

create or replace function sac.gcl_commercial_release_is_open()
returns boolean
language sql
stable
security definer
set search_path to 'sac'
as $function$
  select coalesce((select state='open' from sac.commercial_release_control where release_key='gcl_public_checkout'),false);
$function$;

revoke all on function sac.gcl_commercial_release_is_open() from public, anon, authenticated;
grant execute on function sac.gcl_commercial_release_is_open() to service_role;

create or replace function public.gcl_commercial_release_status()
returns jsonb
language sql
stable
security definer
set search_path to 'public','sac'
as $function$
  select jsonb_build_object(
    'release_key',c.release_key,
    'state',c.state,
    'public_checkout_open',c.state='open',
    'note',c.note,
    'changed_at',c.changed_at,
    'changed_by',c.changed_by
  )
  from sac.commercial_release_control c
  where c.release_key='gcl_public_checkout';
$function$;

grant execute on function public.gcl_commercial_release_status() to anon, authenticated, service_role;

create or replace function public.gcl_set_commercial_release_state(p_state text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare
  v_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
  v_external jsonb;
  v_canonical_ready int:=0;
  v_registry_ready int:=0;
begin
  if v_role<>'service_role' then raise exception 'service_role_required'; end if;
  if p_state not in ('closed','open') then raise exception 'invalid_release_state'; end if;

  if p_state='open' then
    v_external:=public.gcl_external_control_readiness();
    if not coalesce((v_external->>'all_verified')::boolean,false) then
      raise exception 'external_controls_not_verified';
    end if;

    select count(*)::int into v_canonical_ready
    from sac.commercial_products
    where product_code in (
      'sac_analysis_2026','sac_ranking_monthly','sac_community_monthly',
      'sac_ranking_community_monthly','sac_awards_entry_2026','sac_complete_entry_2026'
    )
      and provider_environment='live'
      and status='active'
      and checkout_url is not null;
    if v_canonical_ready<>6 then raise exception 'canonical_live_catalog_not_ready'; end if;

    select count(*)::int into v_registry_ready
    from sac.commercial_provider_configs
    where product_code in (
      'sac_analysis_2026','sac_ranking_monthly','sac_community_monthly',
      'sac_ranking_community_monthly','sac_awards_entry_2026','sac_complete_entry_2026'
    )
      and provider='stripe'
      and provider_environment='live'
      and status='active'
      and provider_product_id is not null
      and provider_price_id is not null
      and checkout_url is not null;
    if v_registry_ready<>6 then raise exception 'live_provider_registry_not_ready'; end if;
  end if;

  update sac.commercial_release_control
  set state=p_state,
      note=coalesce(nullif(btrim(p_note),''),case when p_state='closed' then 'manual_fail_closed' else 'explicit_commercial_release' end),
      changed_at=now(),
      changed_by='service_role'
  where release_key='gcl_public_checkout';

  return public.gcl_commercial_release_status();
end
$function$;

revoke all on function public.gcl_set_commercial_release_state(text,text) from public, anon, authenticated;
grant execute on function public.gcl_set_commercial_release_state(text,text) to service_role;

create or replace function public.gcl_prepare_member_checkout(p_product_code text,p_domain_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac','auth'
as $function$
declare uid uuid:=auth.uid(); p sac.commercial_products%rowtype; i sac.checkout_intents%rowtype; needs_domain boolean;
begin
  perform sac.gcl_authenticated_rpc_rate_limit('gcl:member_checkout',20,60);
  if uid is null then raise exception 'authentication_required'; end if;
  select * into p from sac.commercial_products where product_code=p_product_code;
  if not found then raise exception 'product_not_found'; end if;
  if p.provider_environment='live' then
    if not sac.gcl_commercial_release_is_open() or p.status<>'active' or p.checkout_url is null then raise exception 'checkout_unavailable'; end if;
  elsif p.provider_environment='test' then
    if p.status not in ('draft','active') or p.checkout_url is null then raise exception 'checkout_unavailable'; end if;
  else raise exception 'checkout_unavailable'; end if;
  needs_domain:=coalesce(p.grants && array['public_ranking_candidate','public_ranking','award_submission_2026','award_profile']::text[],false);
  if needs_domain and p_domain_id is null then raise exception 'domain_required'; end if;
  if p_domain_id is not null and not exists(select 1 from sac.domains d where d.id=p_domain_id and d.owner_user_id=uid) then raise exception 'domain_not_owned'; end if;
  insert into sac.checkout_intents(user_id,domain_id,product_code,provider) values(uid,p_domain_id,p_product_code,p.provider) returning * into i;
  return jsonb_build_object('checkout_intent',i.public_token,'product_code',p.product_code,'provider_environment',p.provider_environment,'url',sac.checkout_url_for(p.product_code,i.public_token),'expires_at',i.expires_at,'grants',p.grants,'domain_required',needs_domain);
end
$function$;

create or replace function public.gcl_analysis_checkout_url(p_intent_token uuid,p_sandbox boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare i sac.analysis_checkout_intents%rowtype; p sac.commercial_products%rowtype; ready boolean:=false;
begin
  select * into i from sac.analysis_checkout_intents where public_token=p_intent_token and status='prepared' and expires_at>now();
  if not found then raise exception 'analysis_intent_not_found'; end if;
  select * into p from sac.commercial_products where product_code=i.product_code;
  if not found then raise exception 'product_not_found'; end if;
  if p.provider_environment='live' then
    ready:=sac.gcl_commercial_release_is_open() and p.status='active' and p.checkout_url is not null;
  elsif p.provider_environment='test' then
    ready:=p_sandbox and p.status in ('draft','active') and p.checkout_url is not null;
  end if;
  return jsonb_build_object('checkout_ready',ready,'provider_environment',p.provider_environment,'release_open',sac.gcl_commercial_release_is_open(),'url',case when ready then sac.checkout_url_for(p.product_code,p_intent_token) else null end);
end
$function$;

create or replace function public.sac_api_prepare_analysis_core(p_url text,p_bucket_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare v_url text:=btrim(p_url); v_bucket text:=left(coalesce(nullif(btrim(p_bucket_key),''),'anonymous'),128); v_domain text; v record; v_product sac.commercial_products%rowtype; v_source sac.benchmark_sources%rowtype; v_checkout_ready boolean:=false; v_release_open boolean:=false;
begin
  if v_url is null or length(v_url)<8 or length(v_url)>2048 or v_url !~* '^https?://' then raise exception 'invalid_url' using errcode='22023'; end if;
  v_domain:=lower(split_part(regexp_replace(v_url,'^https?://','','i'),'/',1));
  v_domain:=regexp_replace(v_domain,'^www[.]','','i');
  select * into v_product from sac.commercial_products where product_code='sac_analysis_2026';
  select * into v_source from sac.benchmark_sources order by created_at desc limit 1;
  v_release_open:=sac.gcl_commercial_release_is_open();
  v_checkout_ready:=v_release_open and v_product.status='active' and v_product.provider_environment='live' and v_product.checkout_url is not null;
  select * into v from sac.analysis_checkout_intents where bucket_key=v_bucket and normalized_domain=v_domain and status in ('prepared','paid','scan_queued') and expires_at>now() order by created_at desc limit 1;
  if v.id is null then insert into sac.analysis_checkout_intents(url,normalized_domain,bucket_key,product_code,price_snapshot,currency) values(v_url,v_domain,v_bucket,'sac_analysis_2026',v_product.price,v_product.currency) returning * into v; end if;
  return jsonb_build_object('intent_token',v.public_token,'status',v.status,'url',v.url,'domain',v.normalized_domain,'expires_at',v.expires_at,
    'offer',jsonb_build_object('product_code',v_product.product_code,'name',v_product.name,'price',v_product.price,'currency',v_product.currency,'checkout_url',case when v_checkout_ready then v_product.checkout_url else null end,'checkout_ready',v_checkout_ready,'provider_environment',v_product.provider_environment,'release_open',v_release_open),
    'benchmark',jsonb_build_object('source',v_source.name,'urls_processed',v_source.audited_count,'successful_audits',v_source.successful_count,'failed_access',v_source.failed_count,'claim_10k_success_ready',coalesce(v_source.successful_count,0)>10000),
    'next_step',case when v_checkout_ready then 'checkout' else 'payment_provider_pending' end);
end
$function$;

create or replace function public.sac_api_offer_catalog()
returns jsonb
language sql
stable security definer
set search_path to 'public','sac'
as $function$
with gate as (select sac.gcl_commercial_release_is_open() as release_open),
p as (
 select cp.*,g.release_open,
   (g.release_open and cp.status='active' and cp.provider_environment='live' and cp.checkout_url is not null) as live_ready,
   (cp.status in ('draft','active') and cp.provider_environment='test' and cp.checkout_url is not null) as sandbox_ready
 from sac.commercial_products cp cross join gate g
), obj as (
 select product_code,jsonb_build_object('product_code',product_code,'name',name,'price',price,'currency',currency,'billing_interval',billing_interval,'checkout_url',case when live_ready then checkout_url else null end,'checkout_ready',live_ready,'sandbox_ready',sandbox_ready,'provider_environment',provider_environment,'release_open',release_open,'grants',grants) j from p
), vals as (
 select (select price from p where product_code='sac_complete_entry_2026') entry_price,(select price from p where product_code='sac_ranking_community_monthly') recurring_price
)
select jsonb_build_object(
 'analysis',(select j from obj where product_code='sac_analysis_2026'),'awards',(select j from obj where product_code='sac_awards_entry_2026'),'ranking',(select j from obj where product_code='sac_ranking_monthly'),'community',(select j from obj where product_code='sac_community_monthly'),'club',(select j from obj where product_code='sac_ranking_community_monthly'),
 'complete',jsonb_build_object('entry',(select j from obj where product_code='sac_complete_entry_2026'),'recurring',(select j from obj where product_code='sac_ranking_community_monthly'),'bundle',jsonb_build_object('product_code','gcl_season_pass_2026','name','GCL Season Pass 2026','currency','BRL','entry_price',(select entry_price from vals),'recurring_price',(select recurring_price from vals),'initial_total',(select entry_price+recurring_price from vals),'billing_interval','entry + monthly','checkout_ready',false,'checkout_strategy','entry_then_membership','includes',jsonb_build_array('GCL Conversion Audit','Global Conversion Awards 2026','GCL Ranking','GCL Community'))),
 'rules',jsonb_build_object('analysis_required_before_awards',true,'ranking_is_subscription',true,'community_is_subscription',true,'awards_entry_is_one_time_per_site_season',true,'complete_bundle_initial_charge_contains_entry_plus_first_month',true,'buying_services_never_buys_score',true,'score_changes_only_after_reaudit',true,'public_checkout_requires_live_provider',true,'public_checkout_requires_global_release',true));
$function$;

create or replace function public.gcl_public_health()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','sac'
as $function$
declare v_base jsonb; v_external jsonb; v_commercial jsonb; v_payments jsonb; v_machine boolean; v_external_ok boolean; v_live_staged int:=0; v_release_open boolean:=false;
begin
  v_base:=public.gcl_public_health_base_v59() || jsonb_build_object('heavy_worker',public.gcl_worker_capacity_health());
  v_external:=public.gcl_external_control_readiness();
  v_machine:=coalesce((v_base->'commercial_go_live'->>'machine_checks_passed')::boolean,false);
  v_external_ok:=coalesce((v_external->>'all_verified')::boolean,false);
  v_release_open:=sac.gcl_commercial_release_is_open();
  select count(*)::int into v_live_staged from sac.commercial_provider_configs where provider='stripe' and provider_environment='live' and status='paused' and provider_product_id is not null and provider_price_id is not null and provider_payment_link_id is null and checkout_url is null;
  v_payments:=coalesce(v_base->'payments','{}'::jsonb)||jsonb_build_object('live_staged_products',v_live_staged,'live_catalog_staged',v_live_staged=6,'commercial_release_open',v_release_open,'live_catalog_public_checkout_open',v_release_open and coalesce((v_base->'payments'->>'live_ready')::boolean,false));
  v_base:=jsonb_set(v_base,'{payments}',v_payments,true);
  v_commercial:=(v_base->'commercial_go_live')||jsonb_build_object('external_controls',v_external,'external_attestations_passed',v_external_ok,'external_blockers',v_external->'blockers','commercial_release_open',v_release_open,'commercial_ready',v_machine and v_external_ok and v_release_open);
  return jsonb_set(v_base,'{commercial_go_live}',v_commercial,true);
end
$function$;
