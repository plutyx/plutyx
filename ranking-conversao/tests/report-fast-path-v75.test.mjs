import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../supabase/functions/sac-ranking-site-api/index.ts', import.meta.url), 'utf8');

test('public report action uses one pre-shaped RPC and returns raw text without JSON round-trip', () => {
  assert.match(source, /async function rpcPassthrough\(/, 'Edge function must expose a passthrough helper for large JSON responses');
  assert.match(source, /sac_api_public_deep_report_v75/, 'report action must use the pre-shaped public report RPC');
  assert.match(source, /const text=await r\.text\(\);/, 'passthrough helper must read the upstream body as raw text');
  assert.match(source, /return new Response\(text,\{status:200,headers:cors\(origin\)\}\)/, 'passthrough helper must return the upstream text directly');
  assert.doesNotMatch(
    source,
    /Promise\.all\(\[rpc\("sac_api_deep_report"[\s\S]*?rpc\("sac_api_competition_context"/,
    'report action must not parse two large RPC responses inside the Edge worker',
  );
  assert.match(
    source,
    /if\(action==="report"\)[\s\S]*?return rpcPassthrough\("sac_api_public_deep_report_v75"/,
    'report action must return the PostgREST response through the passthrough helper',
  );
});
