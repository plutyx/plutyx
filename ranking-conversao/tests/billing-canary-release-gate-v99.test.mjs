import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260913201000_gcl_billing_canary_release_gate_v99.sql', import.meta.url);

async function sql() {
  return readFile(migrationUrl, 'utf8');
}

test('v99 stores private, bounded live billing-canary evidence for both commercial lifecycles', async () => {
  const body = await sql();
  assert.match(body, /create table if not exists sac\.gcl_billing_canary_attestations/i);
  assert.match(body, /flow_type[\s\S]*one_time[\s\S]*subscription/i);
  assert.match(body, /provider_environment[\s\S]*live/i);
  assert.match(body, /valid_until/i);
  assert.match(body, /enable row level security/i);
  assert.match(body, /revoke all on table sac\.gcl_billing_canary_attestations from public, anon, authenticated/i);
  assert.match(body, /grant select, insert on table sac\.gcl_billing_canary_attestations to service_role/i);
});

test('v99 verified attestations must be grounded in processed live Stripe ledger events and business state', async () => {
  const body = await sql();
  assert.match(body, /create or replace function public\.gcl_attest_billing_canary/i);
  assert.match(body, /auth\.role\(\)[\s\S]*service_role/i);
  assert.match(body, /sac\.payment_provider_events/i);
  assert.match(body, /livemode\s*=\s*true/i);
  assert.match(body, /processing_status\s*=\s*'processed'/i);
  assert.match(body, /checkout\.session\.completed/i);
  assert.match(body, /invoice\.paid/i);
  assert.match(body, /customer\.subscription\.deleted/i);
  assert.match(body, /sac\.purchases/i);
  assert.match(body, /sac\.memberships/i);
  assert.match(body, /billing_canary_evidence_invalid/i);
});

test('v99 readiness is fresh, requires one-time plus subscription, and commercial release fails closed without both', async () => {
  const body = await sql();
  assert.match(body, /create or replace function sac\.gcl_billing_canary_readiness/i);
  assert.match(body, /one_time_verified/i);
  assert.match(body, /subscription_verified/i);
  assert.match(body, /all_verified/i);
  assert.match(body, /valid_until\s*>\s*now\(\)/i);
  assert.match(body, /create or replace function public\.gcl_set_commercial_release_state/i);
  assert.match(body, /sac\.gcl_billing_canary_readiness\(\)/i);
  assert.match(body, /billing_canaries_not_verified/i);
});

test('v99 never opens release or seeds fabricated verified evidence', async () => {
  const body = await sql();
  assert.doesNotMatch(body, /update\s+sac\.commercial_release_control[\s\S]{0,300}state\s*=\s*'open'/i);
  assert.doesNotMatch(body, /insert\s+into\s+sac\.gcl_billing_canary_attestations[\s\S]{0,500}'verified'/i);
});
