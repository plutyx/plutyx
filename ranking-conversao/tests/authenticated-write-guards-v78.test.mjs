import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../supabase/migrations');

function migrationText() {
  const files = fs.readdirSync(migrationsDir).filter(name => name.endsWith('_gcl_authenticated_write_guards_v78.sql'));
  assert.equal(files.length, 1, 'v78 must have exactly one versioned migration');
  return fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
}

test('v78 rate-limits only dedicated authenticated write surfaces', () => {
  const sql = migrationText();
  for (const trigger of [
    'trg_gcl_rl_experiments_v78',
    'trg_gcl_rl_case_studies_v78',
    'trg_gcl_rl_award_votes_v78',
    'trg_gcl_rl_content_reports_v78',
    'trg_gcl_rl_notifications_read_v78',
    'trg_gcl_rl_action_plan_v78',
    'trg_gcl_rl_monitoring_schedule_v78',
  ]) assert.match(sql, new RegExp(trigger), `${trigger} must be installed`);

  assert.match(sql, /before update on sac\.member_notifications\s+for each statement/i,
    'notification read guard must charge once per RPC statement, not once per notification row');
  assert.doesNotMatch(sql, /create trigger[^;]+on sac\.user_profiles/is,
    'profile writes share lifecycle traffic and must not be broadly trigger-limited in v78');
  assert.doesNotMatch(sql, /create trigger[^;]+on sac\.awards_entries/is,
    'awards entries share purchase/admin flows and must not be broadly trigger-limited in v78');
});

test('v78 closes anonymous Action Plan RPC execution without breaking authenticated/service access', () => {
  const sql = migrationText();
  for (const fn of ['gcl_action_plan_list', 'gcl_action_plan_upsert', 'gcl_action_plan_delete']) {
    assert.match(sql, new RegExp(`revoke execute on function sac\\.${fn}\\(`, 'i'), `${fn} must revoke anonymous/public execution`);
    assert.match(sql, new RegExp(`grant execute on function sac\\.${fn}\\(`, 'i'), `${fn} must explicitly restore intended roles`);
  }
  assert.match(sql, /from public, anon/i);
  assert.match(sql, /to authenticated, service_role/i);
});
