-- GCL v99 — grounded live billing canary gate.
-- Commercial release remains fail-closed until two short-lived, ledger-backed live canaries exist:
--   1) one_time: processed Stripe live checkout + approved purchase
--   2) subscription: processed Stripe live checkout + paid invoice + deleted subscription + cancelled membership
-- This migration never creates live transactions, never seeds verified evidence, and never opens checkout.

create table if not exists sac.gcl_billing_canary_attestations (
  id uuid primary key default gen_random_uuid(),
  flow_type text not null check (flow_type in ('one_time','subscription')),
  provider text not null default 'stripe' check (provider='stripe'),
  provider_environment text not null default 'live' check (provider_environment='live'),
  status text not null default 'verified' check (status in ('verified','blocked')),
  provider_event_ids text[] not null check (cardinality(provider_event_ids) > 0),
  purchase_id uuid references sac.purchases(id) on delete restrict,
  membership_id uuid references sac.memberships(id) on delete restrict,
  provider_subscription_id text,
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  valid_until timestamptz not null,
  attested_by text not null default 'service_role',
  created_at timestamptz not null default now(),
  check (valid_until > observed_at),
  check (
    (flow_type='one_time' and purchase_id is not null and membership_id is null)
    or
    (flow_type='subscription' and membership_id is not null and provider_subscription_id is not null)
  )
);

create index if not exists gcl_billing_canary_attestations_flow_fresh_idx
  on sac.gcl_billing_canary_attestations(flow_type,status,valid_until desc,observed_at desc);

alter table sac.gcl_billing_canary_attestations enable row level security;
revoke all on table sac.gcl_billing_canary_attestations from public, anon, authenticated;
grant select, insert on table sac.gcl_billing_canary_attestations to service_role;

comment on table sac.gcl_billing_canary_attestations is
'Append-only, short-lived evidence that a real Stripe live billing lifecycle completed and mutated the expected GCL business state. No canary is auto-created.';

create or replace function public.gcl_attest_billing_canary(
  p_flow_type text,
  p_provider_event_ids text[],
  p_purchase_id uuid default null,
  p_membership_id uuid default null,
  p_valid_minutes integer default 60,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac','auth'
as $function$
declare
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role',true), '');
  v_event_ids text[];
  v_purchase sac.purchases%rowtype;
  v_membership sac.memberships%rowtype;
  v_subscription_id text;
  v_checkout_count int := 0;
  v_invoice_paid_count int := 0;
  v_deleted_count int := 0;
  v_attestation sac.gcl_billing_canary_attestations%rowtype;
begin
  if v_role <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_flow_type not in ('one_time','subscription') then
    raise exception 'invalid_billing_canary_flow';
  end if;

  if p_provider_event_ids is null or cardinality(p_provider_event_ids)=0 then
    raise exception 'billing_canary_evidence_invalid';
  end if;

  select array_agg(distinct nullif(btrim(x),''))
    into v_event_ids
  from unnest(p_provider_event_ids) x
  where nullif(btrim(x),'') is not null;

  if v_event_ids is null or cardinality(v_event_ids)=0 then
    raise exception 'billing_canary_evidence_invalid';
  end if;

  -- Keep evidence intentionally short-lived. This is a release canary, not a permanent compliance attestation.
  if p_valid_minutes is null or p_valid_minutes < 5 or p_valid_minutes > 120 then
    raise exception 'invalid_billing_canary_validity';
  end if;

  if p_flow_type='one_time' then
    if p_purchase_id is null or p_membership_id is not null then
      raise exception 'billing_canary_evidence_invalid';
    end if;

    select * into v_purchase
    from sac.purchases
    where id=p_purchase_id
      and provider='stripe'
      and status='approved'
      and approved_at is not null;

    if not found then
      raise exception 'billing_canary_evidence_invalid';
    end if;

    select count(*)::int into v_checkout_count
    from sac.payment_provider_events e
    where e.provider='stripe'
      and e.provider_event_id = any(v_event_ids)
      and e.provider_event_id=v_purchase.provider_event_id
      and e.event_type='checkout.session.completed'
      and e.livemode = true
      and e.processing_status = 'processed'
      and e.processed_at is not null
      and e.processed_at >= now() - interval '24 hours';

    if v_checkout_count <> 1 then
      raise exception 'billing_canary_evidence_invalid';
    end if;

    insert into sac.gcl_billing_canary_attestations(
      flow_type,provider_environment,status,provider_event_ids,purchase_id,evidence,observed_at,valid_until,attested_by
    ) values (
      'one_time','live','verified',v_event_ids,v_purchase.id,
      jsonb_strip_nulls(jsonb_build_object(
        'purchase_status',v_purchase.status,
        'product_code',v_purchase.product_code,
        'currency',v_purchase.currency,
        'note',nullif(btrim(p_note),'')
      )),
      now(),now()+make_interval(mins=>p_valid_minutes),'service_role'
    ) returning * into v_attestation;

  else
    if p_membership_id is null or p_purchase_id is not null then
      raise exception 'billing_canary_evidence_invalid';
    end if;

    select * into v_membership
    from sac.memberships
    where id=p_membership_id
      and provider='stripe'
      and provider_subscription_id is not null
      and status='cancelled';

    if not found then
      raise exception 'billing_canary_evidence_invalid';
    end if;

    v_subscription_id:=v_membership.provider_subscription_id;

    -- Checkout must be a processed live Stripe event tied to the same subscription.
    select count(*)::int into v_checkout_count
    from sac.payment_provider_events e
    where e.provider='stripe'
      and e.provider_event_id = any(v_event_ids)
      and e.event_type='checkout.session.completed'
      and e.livemode = true
      and e.processing_status = 'processed'
      and e.processed_at is not null
      and e.processed_at >= now() - interval '24 hours'
      and e.payload->'data'->'object'->>'subscription'=v_subscription_id;

    -- Paid invoice must be processed live and point to the same subscription.
    select count(*)::int into v_invoice_paid_count
    from sac.payment_provider_events e
    where e.provider='stripe'
      and e.provider_event_id = any(v_event_ids)
      and e.event_type='invoice.paid'
      and e.livemode = true
      and e.processing_status = 'processed'
      and e.processed_at is not null
      and e.processed_at >= now() - interval '24 hours'
      and coalesce(
        e.payload->'data'->'object'->>'subscription',
        e.payload->'data'->'object'->'parent'->'subscription_details'->>'subscription'
      )=v_subscription_id;

    -- Cancellation must be observed by the webhook and reflected in memberships.status='cancelled'.
    select count(*)::int into v_deleted_count
    from sac.payment_provider_events e
    where e.provider='stripe'
      and e.provider_event_id = any(v_event_ids)
      and e.event_type='customer.subscription.deleted'
      and e.livemode = true
      and e.processing_status = 'processed'
      and e.processed_at is not null
      and e.processed_at >= now() - interval '24 hours'
      and e.payload->'data'->'object'->>'id'=v_subscription_id;

    if v_checkout_count <> 1 or v_invoice_paid_count <> 1 or v_deleted_count <> 1 then
      raise exception 'billing_canary_evidence_invalid';
    end if;

    insert into sac.gcl_billing_canary_attestations(
      flow_type,provider_environment,status,provider_event_ids,membership_id,provider_subscription_id,evidence,observed_at,valid_until,attested_by
    ) values (
      'subscription','live','verified',v_event_ids,v_membership.id,v_subscription_id,
      jsonb_strip_nulls(jsonb_build_object(
        'membership_status',v_membership.status,
        'plan_code',v_membership.plan_code,
        'note',nullif(btrim(p_note),'')
      )),
      now(),now()+make_interval(mins=>p_valid_minutes),'service_role'
    ) returning * into v_attestation;
  end if;

  return jsonb_build_object(
    'id',v_attestation.id,
    'flow_type',v_attestation.flow_type,
    'status',v_attestation.status,
    'provider_environment',v_attestation.provider_environment,
    'observed_at',v_attestation.observed_at,
    'valid_until',v_attestation.valid_until
  );
end
$function$;

revoke all on function public.gcl_attest_billing_canary(text,text[],uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.gcl_attest_billing_canary(text,text[],uuid,uuid,integer,text) to service_role;

create or replace function sac.gcl_billing_canary_readiness()
returns jsonb
language sql
stable
security definer
set search_path to 'sac'
as $function$
with latest as (
  select distinct on (flow_type)
    flow_type,status,observed_at,valid_until
  from sac.gcl_billing_canary_attestations
  where provider='stripe'
    and provider_environment='live'
    and status='verified'
    and valid_until > now()
  order by flow_type, observed_at desc
), flags as (
  select
    exists(select 1 from latest where flow_type='one_time') as one_time_verified,
    exists(select 1 from latest where flow_type='subscription') as subscription_verified,
    max(observed_at) filter(where flow_type='one_time') as one_time_observed_at,
    max(valid_until) filter(where flow_type='one_time') as one_time_valid_until,
    max(observed_at) filter(where flow_type='subscription') as subscription_observed_at,
    max(valid_until) filter(where flow_type='subscription') as subscription_valid_until
  from latest
)
select jsonb_build_object(
  'one_time_verified',one_time_verified,
  'subscription_verified',subscription_verified,
  'all_verified',one_time_verified and subscription_verified,
  'one_time_observed_at',one_time_observed_at,
  'one_time_valid_until',one_time_valid_until,
  'subscription_observed_at',subscription_observed_at,
  'subscription_valid_until',subscription_valid_until,
  'policy','Both Stripe live billing lifecycles must be ledger-backed and fresh before commercial release.'
)
from flags;
$function$;

revoke all on function sac.gcl_billing_canary_readiness() from public, anon, authenticated;
grant execute on function sac.gcl_billing_canary_readiness() to service_role;

-- Patch v89 release setter without weakening any existing gate.
create or replace function public.gcl_set_commercial_release_state(p_state text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','sac'
as $function$
declare
  v_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
  v_canaries jsonb;
  v_external jsonb;
  v_canonical_ready int:=0;
  v_registry_ready int:=0;
begin
  if v_role<>'service_role' then raise exception 'service_role_required'; end if;
  if p_state not in ('closed','open') then raise exception 'invalid_release_state'; end if;

  if p_state='open' then
    v_canaries:=sac.gcl_billing_canary_readiness();
    if not coalesce((v_canaries->>'all_verified')::boolean,false) then
      raise exception 'billing_canaries_not_verified';
    end if;

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

comment on function public.gcl_set_commercial_release_state(text,text) is
'GCL commercial kill/release switch. Opening requires fresh grounded one-time and subscription live billing canaries, all external P0 controls, six canonical live offers, and six active live provider mappings.';
