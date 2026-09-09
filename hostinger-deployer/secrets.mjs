import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export async function hydrateDeploySecrets() {
  if (process.env.HOSTINGER_SSH_PASSWORD || process.env.HOSTINGER_FTP_PASSWORD) {
    return { source: 'environment' };
  }

  const keyHex = process.env.DEPLOY_DECRYPT_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error('deploy_decrypt_key_missing_or_invalid');

  const fileUrl = new URL('./hostinger-secrets.enc.json', import.meta.url);
  const envelope = JSON.parse(await fs.readFile(fileUrl, 'utf8'));
  if (envelope.alg !== 'aes-256-gcm' || envelope.version !== 1) throw new Error('encrypted_payload_format_invalid');

  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const data = JSON.parse(plain.toString('utf8'));

  process.env.HOSTINGER_SSH_HOST = String(data.ssh_host || '');
  process.env.HOSTINGER_SSH_PORT = String(data.ssh_port || '65002');
  process.env.HOSTINGER_SSH_USER = String(data.ssh_user || '');
  process.env.HOSTINGER_SSH_PASSWORD = String(data.ssh_password || '');
  process.env.HOSTINGER_FTP_HOST = String(data.ftp_host || '');
  process.env.HOSTINGER_FTP_PORT = String(data.ftp_port || '21');
  process.env.HOSTINGER_FTP_USER = String(data.ftp_user || '');
  process.env.HOSTINGER_FTP_PASSWORD = String(data.ssh_password || '');
  process.env.HOSTINGER_DOMAIN = String(data.domain || 'plutyx.com');
  process.env.HOSTINGER_TARGET_SUBDIR = String(data.target_subdir || 'ranking-site');

  if (!process.env.HOSTINGER_SSH_HOST || !process.env.HOSTINGER_SSH_USER || !process.env.HOSTINGER_SSH_PASSWORD) {
    throw new Error('decrypted_credentials_incomplete');
  }
  return { source: 'aes-256-gcm-encrypted-payload' };
}
