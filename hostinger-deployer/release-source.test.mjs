import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRemoteHead, immutableProvenanceUrl } from './release-source.mjs';

test('parses only the exact artifact branch head returned by git ls-remote', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const output = `${sha}\trefs/heads/convrank-hostinger-dist\n`;
  assert.equal(parseRemoteHead(output, 'refs/heads/convrank-hostinger-dist'), sha);
  assert.throws(
    () => parseRemoteHead(`${sha}\trefs/heads/other\n`, 'refs/heads/convrank-hostinger-dist'),
    /release_branch_head_unavailable/,
  );
});

test('builds provenance URL from an immutable commit SHA, never from a mutable branch name', () => {
  const sha = 'fedcba9876543210fedcba9876543210fedcba98';
  const url = immutableProvenanceUrl(sha);
  assert.equal(url, `https://raw.githubusercontent.com/plutyx/plutyx/${sha}/gcl-build.json`);
  assert.equal(url.includes('convrank-hostinger-dist'), false);
  assert.throws(() => immutableProvenanceUrl('convrank-hostinger-dist'), /invalid_release_branch_head/);
});
