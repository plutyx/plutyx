import { hydrateDeploySecrets } from './secrets.mjs';
import { startReleaseAutosync, getAutosyncState, syncReleaseOnce } from './autosync.mjs';

const deployEnabled = process.env.DEPLOY_ENABLED === '1';

if (deployEnabled) {
  const secretState = await hydrateDeploySecrets();
  console.log(JSON.stringify({
    event: 'gcl_deployer_secrets_ready',
    source: secretState?.source || 'unknown',
    mode: 'validated_release_autosync',
    at: new Date().toISOString(),
  }));

  // Render free instances may pause wall-clock timers while idle. Expose only an
  // internal in-process callback to the control plane so a health wake can ask
  // for one idempotent sync cycle. No request input can select a branch/SHA.
  globalThis.__GCL_RELEASE_CONTROL__ = {
    syncRelease: syncReleaseOnce,
    getAutosyncState,
  };
}

// The long-lived Render process is control-plane only. It must never deploy its
// baked-in bundle on wake/cold start because that bundle may be older than the
// already-published Hostinger release. Actual deploys run in isolated child
// processes with DEPLOY_ENABLED=1 and LOCAL_DIST pointed at the validated
// convrank-hostinger-dist artifact.
process.env.DEPLOY_ENABLED = '0';
await import('./deploy.mjs');

if (deployEnabled) {
  startReleaseAutosync();
  console.log(JSON.stringify({
    event: 'gcl_release_autosync_started',
    state: getAutosyncState(),
    releaseBranch: 'convrank-hostinger-dist',
    publicUrl: 'https://plutyx.com/ranking-site/',
    at: new Date().toISOString(),
  }));
}
