import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260913165500_gcl_community_rls_initplan_v95.sql', import.meta.url);

async function migration() {
  return readFile(migrationUrl, 'utf8');
}

test('v95 preserves the three Community read policies while caching auth.uid once per statement', async () => {
  const sql = await migration();
  for (const [table, policy] of [
    ['community_badge_definitions', 'community_badge_definitions_member_read'],
    ['community_levels', 'community_levels_member_read'],
    ['community_missions', 'community_missions_member_read'],
  ]) {
    assert.match(sql, new RegExp(`alter\\s+policy\\s+${policy}\\s+on\\s+sac\\.${table}`, 'i'));
  }

  const optimized = sql.match(/sac\.has_active_community_access\s*\(\s*\(\s*select\s+auth\.uid\(\)\s*\)\s*\)/gi) || [];
  assert.equal(optimized.length, 3, 'all three policies must use initplan-cached auth.uid()');
});

test('v95 does not broaden the authorization rule or alter non-SELECT policy behavior', async () => {
  const sql = await migration();
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /with\s+check/i);
  assert.doesNotMatch(sql, /drop\s+policy/i);
  assert.doesNotMatch(sql, /create\s+policy/i);
  assert.equal((sql.match(/alter\s+policy/gi) || []).length, 3);
});
