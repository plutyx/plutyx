import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260913190000_gcl_community_case_hot_index_v98.sql', import.meta.url);

test('v98 adds one workload-backed covering index for Community case-study progression', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create\s+index\s+if\s+not\s+exists\s+community_case_studies_user_verified_updated_idx\s+on\s+sac\.community_case_studies\s*\(\s*user_id\s*,\s*verification_status\s*,\s*updated_at\s+desc\s*\)/i);
});

test('v98 stays deliberately narrow and does not bulk-index every advisor finding', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const creates = sql.match(/create\s+index\s+if\s+not\s+exists/gi) ?? [];
  assert.equal(creates.length, 1);
  assert.doesNotMatch(sql, /analysis_interest_leads_assigned_to_idx/i);
  assert.doesNotMatch(sql, /page_link_edges_source_page_id_idx/i);
  assert.doesNotMatch(sql, /ranking_entries_audit_run_id_idx/i);
});
