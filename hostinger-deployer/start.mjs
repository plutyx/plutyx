import { hydrateDeploySecrets } from './secrets.mjs';

await hydrateDeploySecrets();
await import('./deploy.mjs');
