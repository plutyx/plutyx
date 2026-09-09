import { hydrateDeploySecrets } from './secrets.mjs';

if (process.env.DEPLOY_ENABLED === '1') {
  await hydrateDeploySecrets();
}
await import('./deploy.mjs');
