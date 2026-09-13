import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'..');
const repository=path.resolve(project,'..');
const migration=fs.readFileSync(path.join(repository,'supabase/migrations/20260913050616_gcl_sales_lead_ops_v87.sql'),'utf8');
const memberApi=fs.readFileSync(path.join(project,'supabase/functions/gcl-member-api/index.ts'),'utf8');
const client=fs.readFileSync(path.join(project,'src/sales-ops-v87.js'),'utf8');

test('v87 keeps lead PII private and gates both sales RPCs to owner/admin',()=>{
  assert.match(migration,/create table if not exists sac\.analysis_interest_lead_events/i);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/revoke all on sac\.analysis_interest_lead_events from public, anon, authenticated/i);
  assert.match(migration,/create or replace function sac\.is_gcl_sales_operator/i);
  assert.match(migration,/role in \('admin', 'owner'\)/i);
  assert.match(migration,/raise exception 'sales_operator_required'/i);
  assert.match(migration,/revoke execute on function public\.gcl_sales_lead_inbox[^;]+from public, anon/i);
  assert.match(migration,/revoke execute on function public\.gcl_update_sales_lead[^;]+from public, anon/i);
});

test('v87 records every sales-stage mutation and protects terminal outcomes',()=>{
  assert.match(migration,/insert into sac\.analysis_interest_lead_events/i);
  assert.match(migration,/from_stage,\s*to_stage/i);
  assert.match(migration,/stage not in \('converted','lost'\)/i);
  assert.match(migration,/follow_up_at/i);
  assert.match(migration,/last_contacted_at/i);
  assert.match(migration,/lead_note_too_long/i);
});

test('v87 exposes sales actions only through the authenticated member edge',()=>{
  assert.match(memberApi,/action==='sales_leads'/);
  assert.match(memberApi,/gcl_sales_lead_inbox/);
  assert.match(memberApi,/action==='update_sales/);
  assert.match(memberApi,/gcl_update_sales_lead/);
  assert.match(memberApi,/sales_operator_required/);
  assert.doesNotMatch(client,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(client,/REVENUE OPERATIONS · STAFF/);
  assert.match(client,/owner\/admin/);
});
