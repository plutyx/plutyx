import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../supabase/migrations');

function migrationText() {
  const files = fs.readdirSync(migrationsDir).filter(name => name.endsWith('_gcl_external_control_registry_v80.sql'));
  assert.equal(files.length, 1, 'v80 must have exactly one versioned migration');
  return fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
}

test('v80 creates an append-only external control attestation registry with deny-by-default access', () => {
  const sql = migrationText();
  assert.match(sql, /create table if not exists sac\.gcl_external_control_attestations/i);
  assert.match(sql, /control_code\s+text\s+not null/i);
  assert.match(sql, /status\s+text\s+not null/i);
  assert.match(sql, /check\s*\(status in \('verified','blocked','unknown'\)\)/i);
  assert.match(sql, /observed_at\s+timestamptz\s+not null/i);
  assert.match(sql, /valid_until\s+timestamptz/i);
  assert.match(sql, /evidence\s+jsonb\s+not null/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on sac\.gcl_external_control_attestations from public, anon, authenticated/i);
});

test('v80 exposes a service-role-only writer and a sanitized public readiness projection', () => {
  const sql = migrationText();
  assert.match(sql, /create or replace function public\.gcl_record_external_control_attestation/i);
  assert.match(sql, /service_role_required/i);
  assert.match(sql, /grant execute on function public\.gcl_record_external_control_attestation[^;]+to service_role/i);
  assert.match(sql, /revoke execute on function public\.gcl_record_external_control_attestation[^;]+from public, anon, authenticated/i);
  assert.match(sql, /create or replace function public\.gcl_external_control_readiness\(\)/i);
  assert.match(sql, /auth_leaked_password_protection/i);
  assert.match(sql, /transactional_email_domain/i);
  assert.match(sql, /real_device_e2e/i);
  assert.match(sql, /heavy_worker_capacity/i);
  assert.match(sql, /legal_review/i);
  assert.match(sql, /incident_ownership/i);
  assert.match(sql, /all_verified/i);
  assert.match(sql, /external_blockers|blockers/i);
});

test('v80 folds fresh external attestations into commercial readiness without weakening machine checks', () => {
  const sql = migrationText();
  assert.match(sql, /create or replace function public\.gcl_public_health\(\)/i);
  assert.match(sql, /gcl_public_health_base_v59/i);
  assert.match(sql, /gcl_worker_capacity_health/i);
  assert.match(sql, /gcl_external_control_readiness/i);
  assert.match(sql, /machine_checks_passed/i);
  assert.match(sql, /external_attestations_passed/i);
  assert.match(sql, /commercial_ready/i);
});

test('v80 seeds only observed blockers and never fabricates verified external controls', () => {
  const sql = migrationText();
  assert.match(sql, /supabase_security_advisor/i);
  assert.match(sql, /resend_domain/i);
  assert.match(sql, /'auth_leaked_password_protection'\s*,\s*'blocked'/i);
  assert.match(sql, /'transactional_email_domain'\s*,\s*'blocked'/i);
  assert.doesNotMatch(sql, /'auth_leaked_password_protection'\s*,\s*'verified'/i);
  assert.doesNotMatch(sql, /'transactional_email_domain'\s*,\s*'verified'/i);
});
