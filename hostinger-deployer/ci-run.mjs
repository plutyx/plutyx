import { hydrateDeploySecrets } from './secrets.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = Number(process.env.PORT || 10000);

process.env.DEPLOY_ENABLED = '1';
const secretState = await hydrateDeploySecrets();

if (String(process.env.HOSTINGER_DOMAIN || '') !== 'plutyx.com') {
  throw new Error('ci_deploy_domain_not_allowed');
}
if (String(process.env.HOSTINGER_TARGET_SUBDIR || '') !== 'ranking-site') {
  throw new Error('ci_deploy_target_not_allowed');
}

console.log(JSON.stringify({
  event: 'gcl_ci_deploy_secrets_ready',
  source: secretState?.source || 'unknown',
  target: 'plutyx.com/ranking-site',
  at: new Date().toISOString(),
}));

await import('./deploy.mjs');

let lastState = null;
for (let attempt = 1; attempt <= 150; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { cache: 'no-store' });
    lastState = await response.json();

    if (lastState.phase === 'completed') {
      if (lastState.deployed !== true || lastState.smoke?.verified !== true) {
        console.error(JSON.stringify({ event: 'gcl_ci_deploy_invalid_terminal_state', state: lastState }));
        process.exit(1);
      }
      console.log(JSON.stringify({
        event: 'gcl_ci_hostinger_deploy_completed',
        publicUrl: lastState.publicUrl || null,
        transport: lastState.transport || null,
        remoteTarget: lastState.remoteTarget || null,
        smoke: lastState.smoke || null,
        finishedAt: lastState.finishedAt || null,
      }));
      process.exit(0);
    }

    if (lastState.phase === 'failed') {
      console.error(JSON.stringify({
        event: 'gcl_ci_hostinger_deploy_failed',
        error: lastState.error || 'unknown',
        sftpError: lastState.sftpError || null,
        finishedAt: lastState.finishedAt || null,
      }));
      process.exit(1);
    }
  } catch (error) {
    if (attempt === 150) {
      console.error(JSON.stringify({
        event: 'gcl_ci_hostinger_deploy_state_unreachable',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  await sleep(1000);
}

console.error(JSON.stringify({
  event: 'gcl_ci_hostinger_deploy_timeout',
  phase: lastState?.phase || 'unknown',
}));
process.exit(1);
