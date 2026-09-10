import fs from 'node:fs/promises';
import { hydrateDeploySecrets } from './secrets.mjs';

const deployEnabled = process.env.DEPLOY_ENABLED === '1';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function readProvenance() {
  try {
    const fileUrl = new URL('../ranking-conversao/dist/gcl-build.json', import.meta.url);
    return JSON.parse(await fs.readFile(fileUrl, 'utf8'));
  } catch {
    return {};
  }
}

if (deployEnabled) {
  const secretState = await hydrateDeploySecrets();
  console.log(JSON.stringify({
    event: 'gcl_deployer_secrets_ready',
    source: secretState?.source || 'unknown',
    at: new Date().toISOString(),
  }));
}

const provenance = await readProvenance();
await import('./deploy.mjs');

if (deployEnabled) {
  const port = Number(process.env.PORT || 10000);
  const localStateUrl = `http://127.0.0.1:${port}/`;
  let terminalStateObserved = false;

  for (let attempt = 1; attempt <= 120; attempt += 1) {
    try {
      const response = await fetch(localStateUrl, { cache: 'no-store' });
      const state = await response.json();

      if (state.phase === 'completed') {
        console.log(JSON.stringify({
          event: 'gcl_hostinger_deploy_completed',
          sourceSha: provenance.source_sha || process.env.RENDER_GIT_COMMIT || null,
          publicUrl: state.publicUrl || null,
          transport: state.transport || null,
          remoteTarget: state.remoteTarget || null,
          bundleHash: state.bundle?.hash || null,
          smoke: state.smoke || null,
          finishedAt: state.finishedAt || null,
          at: new Date().toISOString(),
        }));
        terminalStateObserved = true;
        break;
      }

      if (state.phase === 'failed') {
        console.error(JSON.stringify({
          event: 'gcl_hostinger_deploy_failed',
          sourceSha: provenance.source_sha || process.env.RENDER_GIT_COMMIT || null,
          error: state.error || 'unknown',
          sftpError: state.sftpError || null,
          finishedAt: state.finishedAt || null,
          at: new Date().toISOString(),
        }));
        terminalStateObserved = true;
        break;
      }
    } catch (error) {
      if (attempt === 120) {
        console.error(JSON.stringify({
          event: 'gcl_hostinger_deploy_state_unreachable',
          sourceSha: provenance.source_sha || process.env.RENDER_GIT_COMMIT || null,
          error: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        }));
      }
    }

    await sleep(1000);
  }

  if (!terminalStateObserved) {
    console.error(JSON.stringify({
      event: 'gcl_hostinger_deploy_state_timeout',
      sourceSha: provenance.source_sha || process.env.RENDER_GIT_COMMIT || null,
      at: new Date().toISOString(),
    }));
  }
}
