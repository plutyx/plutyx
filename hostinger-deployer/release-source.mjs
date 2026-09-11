const COMMIT_SHA_RE = /^[0-9a-f]{40}$/i;
const RAW_BASE = 'https://raw.githubusercontent.com/plutyx/plutyx';

export function parseRemoteHead(output, expectedRef) {
  const ref = String(expectedRef || '').trim();
  const rows = String(output || '').trim().split(/\r?\n/).filter(Boolean);
  for (const row of rows) {
    const [sha, remoteRef] = row.trim().split(/\s+/, 2);
    if (remoteRef === ref && COMMIT_SHA_RE.test(sha || '')) return sha.toLowerCase();
  }
  throw new Error('release_branch_head_unavailable');
}

export function immutableProvenanceUrl(commitSha) {
  const sha = String(commitSha || '').trim().toLowerCase();
  if (!COMMIT_SHA_RE.test(sha)) throw new Error('invalid_release_branch_head');
  return `${RAW_BASE}/${sha}/gcl-build.json`;
}
