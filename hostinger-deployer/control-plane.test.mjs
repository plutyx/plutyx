import test from 'node:test';
import assert from 'node:assert/strict';
import { handleControlPlaneRequest } from './control-plane.mjs';

test('health wake with query string requests an immediate idempotent release sync', async () => {
  let calls = 0;
  const result = handleControlPlaneRequest('/health?proof=abc123&attempt=2', {
    serviceState: { ok: true, phase: 'idle' },
    getAutosyncState: () => ({ ok: true, phase: 'current', sourceSha: 'old' }),
    syncRelease: async () => { calls += 1; return { ok: true, phase: 'completed', sourceSha: 'new' }; },
  });

  assert.equal(result.status, 200);
  assert.equal(result.kind, 'health');
  assert.equal(result.body.ok, true);
  assert.equal(result.body.syncRequested, true);
  assert.equal(result.body.autosync.sourceSha, 'old');
  await result.syncPromise;
  assert.equal(calls, 1);
});

test('ordinary state request never triggers release sync', async () => {
  let calls = 0;
  const result = handleControlPlaneRequest('/state', {
    serviceState: { ok: true, phase: 'idle', deployed: false },
    getAutosyncState: () => ({ ok: true, phase: 'current' }),
    syncRelease: async () => { calls += 1; },
  });

  assert.equal(result.status, 200);
  assert.equal(result.kind, 'state');
  assert.equal(result.body.phase, 'idle');
  assert.equal(result.syncPromise, null);
  assert.equal(calls, 0);
});

test('child deploy health remains healthy when no release-sync callback exists', () => {
  const result = handleControlPlaneRequest('/health', {
    serviceState: { ok: true, phase: 'public_smoke' },
    getAutosyncState: null,
    syncRelease: null,
  });

  assert.equal(result.status, 200);
  assert.equal(result.kind, 'health');
  assert.equal(result.body.syncRequested, false);
  assert.equal(result.body.phase, 'public_smoke');
});
