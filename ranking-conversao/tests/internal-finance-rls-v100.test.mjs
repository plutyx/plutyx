import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260913204000_gcl_internal_finance_rls_v100.sql', import.meta.url);

async function sql() {
  return readFile(migrationUrl, 'utf8');
}

const hardenedTables = [
  'commercial_products',
  'purchases',
  'memberships',
  'billing_webhooks',
  'runtime_capacity',
  'edge_rate_limits',
  'public_payload_cache',
  'registry_sync_state',
  'official_ranking_history',
  'benchmark_deepening_policy',
];

test('v100 enables RLS on internal finance and control tables without inventing client policies', async () => {
  const body = await sql();
  for (const table of hardenedTables) {
    assert.match(body, new RegExp(`alter table sac\\.${table} enable row level security`, 'i'));
  }
  assert.doesNotMatch(body, /create\s+policy/i);
});

test('v100 removes direct public client privileges but preserves service gateways', async () => {
  const body = await sql();
  for (const table of hardenedTables) {
    assert.match(body, new RegExp(`revoke all on table sac\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(body, /revoke\s+all[\s\S]*service_role/i);
  assert.doesNotMatch(body, /alter\s+function/i);
});

test('v100 is defense-in-depth only and cannot change commercial release state', async () => {
  const body = await sql();
  assert.doesNotMatch(body, /commercial_release_control[\s\S]*state\s*=/i);
  assert.doesNotMatch(body, /gcl_set_commercial_release_state/i);
  assert.doesNotMatch(body, /insert\s+into\s+sac\.payment_provider_events/i);
});
