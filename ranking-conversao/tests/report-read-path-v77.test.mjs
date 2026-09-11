import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationUrl = new URL('../supabase/migrations/20260911203500_gcl_report_read_path_v77.sql', import.meta.url);

test('deep report read path does not refresh the global autonomous ranking', () => {
  assert.equal(fs.existsSync(migrationUrl), true, 'v77 migration must exist');
  const sql = fs.readFileSync(migrationUrl, 'utf8');
  assert.match(sql, /pg_get_functiondef\('public\.sac_api_deep_report_core\(uuid\)'::regprocedure\)/, 'migration must patch the exact deployed function');
  assert.match(sql, /replace\([\s\S]*perform sac\.refresh_autonomous_ranking\(\);/, 'migration must remove the read-time global ranking refresh');
  assert.match(sql, /cron\.job[\s\S]*refresh_autonomous_ranking/, 'migration must fail closed unless the background ranking refresh exists');
  assert.match(sql, /expected_refresh_call_not_found/, 'migration must fail closed if the deployed function no longer matches the expected contract');
});
