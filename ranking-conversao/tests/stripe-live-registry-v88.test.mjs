import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../supabase/migrations');

function migrationText() {
  const files = fs.readdirSync(migrationsDir).filter(name => name.endsWith('_gcl_stripe_live_registry_v88.sql'));
  assert.equal(files.length, 1, 'v88 must have exactly one Stripe live registry migration');
  return fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
}

test('v88 stores test and live provider mappings separately with deny-by-default access', () => {
  const sql = migrationText();
  assert.match(sql, /create table if not exists sac\.commercial_provider_configs/i);
  assert.match(sql, /primary key \(product_code, provider, provider_environment\)/i);
  assert.match(sql, /provider_environment in \('test','live'\)/i);
  assert.match(sql, /status in \('draft','paused','active','retired'\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on sac\.commercial_provider_configs from public, anon, authenticated/i);
});

test('v88 stages exactly the six GCL live offers without creating a public checkout', () => {
  const sql = migrationText();
  for (const code of [
    'sac_analysis_2026',
    'sac_ranking_monthly',
    'sac_community_monthly',
    'sac_ranking_community_monthly',
    'sac_awards_entry_2026',
    'sac_complete_entry_2026',
  ]) assert.match(sql, new RegExp(`'${code}'\\s*,\\s*'stripe'\\s*,\\s*'live'`, 'i'));
  assert.match(sql, /provider_payment_link_id=null/i);
  assert.match(sql, /checkout_url=null/i);
  assert.match(sql, /status='paused'/i);
  assert.match(sql, /gcl_sac_analysis_2026_live/i);
  assert.match(sql, /gcl_sac_ranking_community_monthly_live/i);
});

test('v88 makes live member checkout fail closed unless the canonical offer is active and has a URL', () => {
  const sql = migrationText();
  assert.match(sql, /create or replace function public\.gcl_prepare_member_checkout/i);
  assert.match(sql, /if p\.provider_environment='live' then[\s\S]*p\.status<>'active'[\s\S]*p\.checkout_url is null[\s\S]*checkout_unavailable/i);
  assert.match(sql, /elsif p\.provider_environment='test' then[\s\S]*p\.status not in \('draft','active'\)/i);
});

test('v88 prevents public qualification from leaking Stripe test links', () => {
  const sql = migrationText();
  assert.match(sql, /create or replace function public\.sac_api_prepare_analysis_core/i);
  assert.match(sql, /v_checkout_ready:=v_product\.status='active'[\s\S]*v_product\.provider_environment='live'[\s\S]*v_product\.checkout_url is not null/i);
  assert.match(sql, /'checkout_url',case when v_checkout_ready then v_product\.checkout_url else null end/i);
  assert.match(sql, /'next_step',case when v_checkout_ready then 'checkout' else 'payment_provider_pending' end/i);
});

test('v88 preserves an explicit sandbox-only escape hatch and surfaces staged-live health separately', () => {
  const sql = migrationText();
  assert.match(sql, /create or replace function public\.gcl_analysis_checkout_url\(p_intent_token uuid, p_sandbox boolean default false\)/i);
  assert.match(sql, /ready:=p_sandbox and p\.status in \('draft','active'\)/i);
  assert.match(sql, /live_staged_products/i);
  assert.match(sql, /live_catalog_staged/i);
  assert.match(sql, /live_catalog_public_checkout_open/i);
});
