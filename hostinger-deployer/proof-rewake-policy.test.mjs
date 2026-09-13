import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(new URL('../.github/workflows/gcl-production-proof.yml',import.meta.url),'utf8');

test('exact-SHA polling re-wakes the Render control-plane after artifact publication races',()=>{
  const waitStep=workflow.match(/- name: Wait for Hostinger to serve this exact source SHA[\s\S]*?- name: Install Chromium for public browser proof/)?.[0]||'';
  assert.ok(waitStep.includes('plutyx-hostinger-ranking-site-deployer.onrender.com/health'),'SHA wait must re-wake Render, not rely on one earlier wake');
  assert.ok(waitStep.includes('?proof=${EXPECTED_SHA}'),'re-wake must be scoped to the expected release SHA');
  assert.ok(waitStep.includes('attempt=${attempt}'),'re-wake must happen inside the retry loop with attempt-scoped requests');
  const loopIndex=waitStep.indexOf('for attempt in $(seq 1 60)');
  const wakeIndex=waitStep.indexOf('plutyx-hostinger-ranking-site-deployer.onrender.com/health');
  assert.ok(loopIndex>=0&&wakeIndex>loopIndex,'Render wake must execute inside the exact-SHA retry loop');
});

test('exact-SHA polling surfaces autonomous deploy failures instead of treating HTTP 200 as deploy health',()=>{
  const waitStep=workflow.match(/- name: Wait for Hostinger to serve this exact source SHA[\s\S]*?- name: Install Chromium for public browser proof/)?.[0]||'';
  assert.ok(waitStep.includes('autosync.phase'),'proof must inspect the deployer autosync phase');
  assert.ok(waitStep.includes('autosync.ok'),'proof must inspect whether the last autosync cycle failed');
  assert.ok(waitStep.includes('autosync.error'),'proof must surface a sanitized autosync error when deployment fails');
  assert.ok(waitStep.includes('AUTOSYNC_FAILED'),'proof logs need a stable marker for autonomous deployment failures');
});
