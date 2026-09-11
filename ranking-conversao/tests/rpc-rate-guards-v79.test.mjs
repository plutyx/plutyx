import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../supabase/migrations');

function migrationText() {
  const files = fs.readdirSync(migrationsDir).filter(name => name.endsWith('_gcl_rpc_rate_guards_v79.sql'));
  assert.equal(files.length, 1, 'v79 must have exactly one versioned migration');
  return fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
}

test('v79 installs one private authenticated RPC rate-limit helper', () => {
  const sql = migrationText();
  assert.match(sql, /create or replace function sac\.gcl_authenticated_rpc_rate_limit\s*\(/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path\s*=\s*sac,\s*public,\s*auth/i);
  assert.match(sql, /sac\.consume_rate_limit/i);
  assert.match(sql, /raise exception 'rate_limited'/i);
  assert.match(sql, /revoke execute on function sac\.gcl_authenticated_rpc_rate_limit\([^;]+from public, anon, authenticated, service_role/i,
    'helper must remain private to privileged function execution');
});

test('v79 rate-limits only the selected sensitive RPCs and preserves their existing authorization model', () => {
  const sql = migrationText();
  const expected = [
    ['gcl_update_profile', 'profile'],
    ['gcl_submit_awards_entry', 'awards_submit'],
    ['gcl_begin_domain_claim', 'domain_claim_begin'],
    ['gcl_record_domain_claim_attempt', 'domain_claim_attempt'],
    ['gcl_link_pending_purchases', 'link_pending_purchases'],
    ['gcl_prepare_member_checkout', 'member_checkout'],
    ['gcl_moderate_report', 'moderation_action'],
    ['gcl_jury_score_entry', 'jury_score'],
  ];

  assert.match(sql, /n\.nspname\s*=\s*'public'/i,
    'dynamic patch lookup must be restricted to the public schema');

  for (const [fn, key] of expected) {
    assert.match(sql, new RegExp(`['\"]${fn}['\"]`, 'i'), `${fn} must be included in the patch set`);
    assert.match(sql, new RegExp(`gcl_authenticated_rpc_rate_limit\\('gcl:${key}'`, 'i'), `${fn} must receive its dedicated bucket`);
  }

  assert.doesNotMatch(sql, /revoke execute on function public\.gcl_(update_profile|submit_awards_entry|begin_domain_claim|record_domain_claim_attempt|link_pending_purchases|prepare_member_checkout|moderate_report|jury_score_entry)[^;]+from authenticated/i,
    'v79 must not break legitimate authenticated RPC access');
  assert.match(sql, /auth\.uid\(\)/i, 'helper must key authenticated limits to the caller identity');
  assert.match(sql, /service_role/i, 'trusted service-role calls must be explicitly considered');
});

test('v79 patching is fail-closed and does not copy whole RPC definitions by hand', () => {
  const sql = migrationText();
  assert.match(sql, /pg_get_functiondef/i);
  assert.match(sql, /regexp_instr/i);
  assert.match(sql, /raise exception 'v79_patch_target_not_found:/i);
  assert.match(sql, /execute patched_def/i);
});
