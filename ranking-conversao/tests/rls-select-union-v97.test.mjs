import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260913172000_gcl_rls_select_union_v97.sql', import.meta.url), 'utf8');

const cases = [
  ['community_case_studies','cases_members_read','cases_self_write','user_id'],
  ['community_experiments','experiments_members_read','experiments_self_write','user_id'],
  ['community_projects','projects_member_read','projects_author_write','author_user_id'],
  ['professional_services','professional_services_member_read','professional_services_self_write','user_id'],
];

for (const [table, readPolicy, writePolicy, ownerColumn] of cases) {
  test(`v97 preserves SELECT union and makes ${table} writes operation-specific`, () => {
    assert.match(sql, new RegExp(`alter\\s+policy\\s+${readPolicy}\\s+on\\s+sac\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`${ownerColumn}\\s*=\\s*\\(\\s*select\\s+auth\\.uid\\(\\)\\s*\\)`, 'i'));
    assert.match(sql, new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${writePolicy}\\s+on\\s+sac\\.${table}`, 'i'));
    for (const action of ['insert','update','delete']) {
      assert.match(sql, new RegExp(`create\\s+policy[\\s\\S]{0,120}on\\s+sac\\.${table}[\\s\\S]{0,80}for\\s+${action}`, 'i'));
    }
  });
}

test('v97 retains the original member/public predicates instead of widening SELECT to true', () => {
  assert.match(sql, /public_to_members\s+and\s+sac\.has_active_community_access/i);
  assert.match(sql, /active\s+and\s+sac\.has_active_community_access/i);
  assert.match(sql, /projects_member_read[\s\S]*sac\.has_active_community_access/i);
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
});

test('v97 preserves domain-membership write checks for case studies and experiments', () => {
  assert.ok((sql.match(/sac\.is_domain_member\s*\(\s*\(\s*select\s+auth\.uid\(\)\s*\)\s*,\s*domain_id\s*\)/gi) || []).length >= 4);
});
