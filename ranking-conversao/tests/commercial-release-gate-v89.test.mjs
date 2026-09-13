import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../supabase/migrations');

function sql() {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('_gcl_commercial_release_gate_v89.sql'));
  assert.equal(files.length, 1, 'v89 commercial release gate migration must be unique');
  return fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
}

test('global release control defaults fail closed and is not client writable', () => {
  const source = sql();
  assert.match(source, /create table if not exists sac\.commercial_release_control/i);
  assert.match(source, /state text not null default 'closed'/i);
  assert.match(source, /values\('gcl_public_checkout','closed'/i);
  assert.match(source, /enable row level security/i);
  assert.match(source, /revoke all on sac\.commercial_release_control from public, anon, authenticated/i);
});

test('opening release is a service-role action guarded by external readiness and six live offers', () => {
  const source = sql();
  assert.match(source, /create or replace function public\.gcl_set_commercial_release_state/i);
  assert.match(source, /service_role_required/i);
  assert.match(source, /external_controls_not_verified/i);
  assert.match(source, /canonical_live_catalog_not_ready/i);
  assert.match(source, /live_provider_registry_not_ready/i);
  assert.match(source, /v_canonical_ready<>6/i);
  assert.match(source, /v_registry_ready<>6/i);
});

test('public analysis requires global release plus live active product and URL', () => {
  const source = sql();
  assert.match(source, /v_release_open:=sac\.gcl_commercial_release_is_open\(\)/i);
  assert.match(source, /v_checkout_ready:=v_release_open and v_product\.status='active' and v_product\.provider_environment='live' and v_product\.checkout_url is not null/i);
  assert.match(source, /'checkout_url',case when v_checkout_ready then v_product\.checkout_url else null end/i);
});

test('authenticated live checkout also requires the global release gate', () => {
  const source = sql();
  assert.match(source, /if p\.provider_environment='live' then[\s\S]*not sac\.gcl_commercial_release_is_open\(\)[\s\S]*checkout_unavailable/i);
});

test('offer catalog and health expose the gate without implying readiness', () => {
  const source = sql();
  assert.match(source, /public_checkout_requires_global_release/i);
  assert.match(source, /commercial_release_open/i);
  assert.match(source, /live_catalog_public_checkout_open/i);
  assert.match(source, /commercial_ready',v_machine and v_external_ok and v_release_open/i);
});
