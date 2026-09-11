import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseProvenance, shouldSyncRelease } from './autosync-policy.mjs';

const currentSha = 'd2bac1dca4ccc6fb453c5a431790077680e53ec1';
const nextSha = '1111111111111111111111111111111111111111';

const validRelease = {
  source_sha: nextSha,
  application: 'Global Conversion League',
  artifact: 'hostinger-production-bundle',
  base_path: '/ranking-site/',
};

test('accepts only the scoped GCL Hostinger release provenance', () => {
  assert.deepEqual(validateReleaseProvenance(validRelease), {
    ok: true,
    sourceSha: nextSha,
  });
});

test('rejects provenance outside the ranking-site base path', () => {
  assert.deepEqual(validateReleaseProvenance({ ...validRelease, base_path: '/' }), {
    ok: false,
    reason: 'release_base_path_invalid',
  });
});

test('rejects provenance that is not the Hostinger production artifact', () => {
  assert.deepEqual(validateReleaseProvenance({ ...validRelease, artifact: 'preview-bundle' }), {
    ok: false,
    reason: 'release_artifact_invalid',
  });
});

test('rejects malformed source SHA values', () => {
  assert.deepEqual(validateReleaseProvenance({ ...validRelease, source_sha: 'main' }), {
    ok: false,
    reason: 'release_source_sha_invalid',
  });
});

test('syncs only when a valid release differs from production', () => {
  assert.deepEqual(shouldSyncRelease({ source_sha: currentSha }, validRelease), {
    sync: true,
    sourceSha: nextSha,
  });

  assert.deepEqual(
    shouldSyncRelease({ source_sha: nextSha }, validRelease),
    { sync: false, reason: 'already_current', sourceSha: nextSha },
  );
});
