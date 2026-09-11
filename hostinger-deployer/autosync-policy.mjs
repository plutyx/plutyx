const SHA_RE = /^[0-9a-f]{40}$/i;

export function validateReleaseProvenance(value) {
  const provenance = value && typeof value === 'object' ? value : {};
  const sourceSha = String(provenance.source_sha || '').trim().toLowerCase();

  if (!SHA_RE.test(sourceSha)) {
    return { ok: false, reason: 'release_source_sha_invalid' };
  }
  if (provenance.application !== 'Global Conversion League') {
    return { ok: false, reason: 'release_application_invalid' };
  }
  if (provenance.artifact !== 'hostinger-production-bundle') {
    return { ok: false, reason: 'release_artifact_invalid' };
  }
  if (provenance.base_path !== '/ranking-site/') {
    return { ok: false, reason: 'release_base_path_invalid' };
  }

  return { ok: true, sourceSha };
}

export function shouldSyncRelease(currentProduction, release) {
  const validation = validateReleaseProvenance(release);
  if (!validation.ok) {
    return { sync: false, reason: validation.reason };
  }

  const currentSha = String(currentProduction?.source_sha || '').trim().toLowerCase();
  if (currentSha === validation.sourceSha) {
    return { sync: false, reason: 'already_current', sourceSha: validation.sourceSha };
  }

  return { sync: true, sourceSha: validation.sourceSha };
}
