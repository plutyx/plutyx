function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function directPathIsScoped(path) {
  const normalized = String(path || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized === '/' || normalized === '.') return false;
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) === 'ranking-site';
}

export function chooseDeployStrategy(env = process.env) {
  const directValues = [
    env.HOSTINGER_FTP_SERVER,
    env.HOSTINGER_FTP_USERNAME,
    env.HOSTINGER_FTP_PASSWORD,
    env.HOSTINGER_FTP_PATH,
  ];
  const directAny = directValues.some(present);
  const directComplete = directValues.every(present);

  if (directComplete) {
    if (!directPathIsScoped(env.HOSTINGER_FTP_PATH)) {
      return { mode: 'none', reason: 'direct_path_not_scoped' };
    }
    return { mode: 'direct_ftps', reason: 'direct_credentials_complete' };
  }

  const encryptedValues = [env.DEPLOY_PART_A, env.DEPLOY_PART_B, env.DEPLOY_PART_C];
  const encryptedComplete = encryptedValues.every(value => present(value) && String(value).trim().length >= 8);

  if (encryptedComplete && !directAny) {
    return { mode: 'encrypted_deployer', reason: 'encrypted_fragments_complete' };
  }

  return { mode: 'none', reason: 'deployment_credentials_unavailable' };
}
