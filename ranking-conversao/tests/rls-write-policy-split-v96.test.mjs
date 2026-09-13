import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260913170500_gcl_rls_write_policy_split_v96.sql', import.meta.url), 'utf8');

for (const [table, legacy, prefix, ownerColumn] of [
  ['action_plan_items', 'action_plan_items_self_write', 'action_plan_items_self', 'user_id'],
  ['user_profiles', 'user_profiles_self_write', 'user_profiles_self', 'user_id'],
]) {
  test(`v96 makes ${table} write policy write-only without changing ownership predicate`, () => {
    assert.match(sql, new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${legacy}\\s+on\\s+sac\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`create\\s+policy\\s+${prefix}_insert\\s+on\\s+sac\\.${table}\\s+for\\s+insert`, 'i'));
    assert.match(sql, new RegExp(`create\\s+policy\\s+${prefix}_update\\s+on\\s+sac\\.${table}\\s+for\\s+update`, 'i'));
    assert.match(sql, new RegExp(`create\\s+policy\\s+${prefix}_delete\\s+on\\s+sac\\.${table}\\s+for\\s+delete`, 'i'));

    const ownership = new RegExp(`${ownerColumn}\\s*=\\s*\\(\\s*select\\s+auth\\.uid\\(\\)\\s*\\)`, 'gi');
    assert.ok((sql.match(ownership) || []).length >= 4, `${table} must keep owner-only USING/WITH CHECK semantics`);
  });
}

test('v96 leaves existing SELECT policy definitions untouched and creates no permissive SELECT policy', () => {
  assert.doesNotMatch(sql, /alter\s+policy\s+action_plan_items_self_read/i);
  assert.doesNotMatch(sql, /alter\s+policy\s+user_profiles_self_select/i);
  assert.doesNotMatch(sql, /create\s+policy[\s\S]{0,120}for\s+select/i);
  assert.equal((sql.match(/for\s+insert/gi) || []).length, 2);
  assert.equal((sql.match(/for\s+update/gi) || []).length, 2);
  assert.equal((sql.match(/for\s+delete/gi) || []).length, 2);
});
