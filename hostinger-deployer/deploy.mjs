import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import SftpClient from 'ssh2-sftp-client';
import { Client as FtpClient } from 'basic-ftp';

const PORT = Number(process.env.PORT || 10000);
const DOMAIN = process.env.HOSTINGER_DOMAIN || 'plutyx.com';
const SUBDIR = process.env.HOSTINGER_TARGET_SUBDIR || 'ranking-site';
const LOCAL_DIST = path.resolve(process.env.LOCAL_DIST || 'ranking-conversao/dist');
const PUBLIC_URL = `https://${DOMAIN}/${SUBDIR}/`;

let state = {
  ok: true,
  phase: 'boot',
  deployed: false,
  publicUrl: PUBLIC_URL,
  transport: null,
  error: null,
  startedAt: new Date().toISOString(),
  finishedAt: null,
};

function safeError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return message
    .replaceAll(process.env.HOSTINGER_SSH_PASSWORD || '__never__', '[redacted]')
    .replaceAll(process.env.HOSTINGER_FTP_PASSWORD || '__never__', '[redacted]')
    .slice(0, 1500);
}

async function validateBundle() {
  const index = await fs.readFile(path.join(LOCAL_DIST, 'index.html'), 'utf8');
  const ht = await fs.readFile(path.join(LOCAL_DIST, '.htaccess'), 'utf8');
  if (!index.includes('/ranking-site/')) throw new Error('bundle_base_path_invalid');
  if (!ht.includes('RewriteBase /ranking-site/')) throw new Error('htaccess_rewrite_invalid');
  const names = await fs.readdir(LOCAL_DIST);
  if (!names.includes('assets')) throw new Error('bundle_assets_missing');
  const hash = crypto.createHash('sha256').update(index).update(ht).digest('hex');
  return { hash, indexBytes: Buffer.byteLength(index), rootEntries: names.length };
}

function normalizeRemote(p) {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

async function findSftpPublicRoot(sftp) {
  const user = process.env.HOSTINGER_SSH_USER;
  const cwd = normalizeRemote(await sftp.cwd());
  const candidates = [
    `${cwd}/domains/${DOMAIN}/public_html`,
    `${cwd}/public_html`,
    `/home/${user}/domains/${DOMAIN}/public_html`,
    `/home/${user}/public_html`,
    `/domains/${DOMAIN}/public_html`,
    `domains/${DOMAIN}/public_html`,
    'public_html',
  ];
  for (const raw of candidates) {
    const candidate = normalizeRemote(raw);
    try {
      if (await sftp.exists(candidate)) return candidate;
    } catch {}
  }
  throw new Error('hostinger_public_html_not_found');
}

async function deployViaSftp() {
  const host = process.env.HOSTINGER_SSH_HOST;
  const port = Number(process.env.HOSTINGER_SSH_PORT || 65002);
  const username = process.env.HOSTINGER_SSH_USER;
  const password = process.env.HOSTINGER_SSH_PASSWORD;
  if (!host || !username || !password) throw new Error('sftp_credentials_missing');

  const sftp = new SftpClient('plutyx-hostinger-deploy');
  await sftp.connect({ host, port, username, password, readyTimeout: 25000 });
  try {
    const publicRoot = await findSftpPublicRoot(sftp);
    const target = `${publicRoot}/${SUBDIR}`;
    const run = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const temp = `${publicRoot}/.${SUBDIR}.deploy-${run}`;
    const backup = `${publicRoot}/.${SUBDIR}.backup-${run}`;

    if (await sftp.exists(temp)) await sftp.rmdir(temp, true);
    await sftp.mkdir(temp, true);
    await sftp.uploadDir(LOCAL_DIST, temp);

    const indexRemote = await sftp.get(`${temp}/index.html`);
    const htRemote = await sftp.get(`${temp}/.htaccess`);
    const indexText = Buffer.from(indexRemote).toString('utf8');
    const htText = Buffer.from(htRemote).toString('utf8');
    if (!indexText.includes('/ranking-site/')) throw new Error('remote_index_validation_failed');
    if (!htText.includes('RewriteBase /ranking-site/')) throw new Error('remote_htaccess_validation_failed');

    let backedUp = false;
    if (await sftp.exists(target)) {
      await sftp.rename(target, backup);
      backedUp = true;
    }
    try {
      await sftp.rename(temp, target);
    } catch (err) {
      if (backedUp && !(await sftp.exists(target)) && await sftp.exists(backup)) {
        await sftp.rename(backup, target);
      }
      throw err;
    }

    // Keep only a bounded emergency backup. Failure to remove it never fails deploy.
    try {
      if (backedUp && await sftp.exists(backup)) {
        const list = await sftp.list(publicRoot);
        const old = list
          .filter(x => x.name.startsWith(`.${SUBDIR}.backup-`))
          .sort((a, b) => (b.modifyTime || 0) - (a.modifyTime || 0))
          .slice(2);
        for (const item of old) await sftp.rmdir(`${publicRoot}/${item.name}`, true);
      }
    } catch {}

    return { transport: 'sftp', publicRoot, target, backupCreated: backedUp };
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function connectFtp(secure) {
  const client = new FtpClient(25000);
  client.ftp.verbose = false;
  await client.access({
    host: process.env.HOSTINGER_FTP_HOST,
    port: Number(process.env.HOSTINGER_FTP_PORT || 21),
    user: process.env.HOSTINGER_FTP_USER,
    password: process.env.HOSTINGER_FTP_PASSWORD || process.env.HOSTINGER_SSH_PASSWORD,
    secure,
    secureOptions: secure ? { rejectUnauthorized: true } : undefined,
  });
  return client;
}

async function deployViaFtp() {
  if (!process.env.HOSTINGER_FTP_HOST || !process.env.HOSTINGER_FTP_USER) throw new Error('ftp_credentials_missing');
  let client;
  let mode = 'ftps';
  try {
    client = await connectFtp(true);
  } catch {
    mode = 'ftp';
    client = await connectFtp(false);
  }
  try {
    const baseCandidates = ['/public_html', 'public_html', '/'];
    let publicRoot = null;
    for (const candidate of baseCandidates) {
      try {
        await client.cd(candidate);
        publicRoot = candidate;
        break;
      } catch {}
    }
    if (!publicRoot) throw new Error('ftp_public_html_not_found');
    await client.cd(publicRoot);

    const run = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const tempName = `.${SUBDIR}.deploy-${run}`;
    const backupName = `.${SUBDIR}.backup-${run}`;
    try { await client.removeDir(tempName); } catch {}
    await client.ensureDir(tempName);
    await client.uploadFromDir(LOCAL_DIST);
    await client.cd('..');

    let backedUp = false;
    try {
      await client.rename(SUBDIR, backupName);
      backedUp = true;
    } catch {}
    try {
      await client.rename(tempName, SUBDIR);
    } catch (err) {
      if (backedUp) {
        try { await client.rename(backupName, SUBDIR); } catch {}
      }
      throw err;
    }
    return { transport: mode, publicRoot, target: `${publicRoot}/${SUBDIR}`, backupCreated: backedUp };
  } finally {
    client.close();
  }
}

async function publicSmoke() {
  let last = null;
  for (let i = 0; i < 12; i++) {
    try {
      const response = await fetch(PUBLIC_URL, { redirect: 'follow', cache: 'no-store' });
      const text = await response.text();
      if (response.ok && text.includes('Ranking Site') && text.includes('/ranking-site/assets/')) {
        const match = text.match(/(?:src|href)="([^"]+\/ranking-site\/assets\/[^"]+)"/);
        if (match) {
          const asset = new URL(match[1], PUBLIC_URL).toString();
          const ar = await fetch(asset, { cache: 'no-store' });
          if (!ar.ok) throw new Error(`asset_http_${ar.status}`);
        }
        return { status: response.status, verified: true };
      }
      last = `http_${response.status}`;
    } catch (err) {
      last = safeError(err);
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error(`public_smoke_failed:${last || 'unknown'}`);
}

async function runDeploy() {
  if (process.env.DEPLOY_ENABLED !== '1') {
    state = { ...state, phase: 'idle', ok: true, error: null };
    return;
  }
  try {
    state = { ...state, phase: 'validating' };
    const bundle = await validateBundle();
    state = { ...state, phase: 'uploading', bundle };
    let deployed;
    try {
      deployed = await deployViaSftp();
    } catch (sftpErr) {
      state = { ...state, phase: 'uploading_fallback', sftpError: safeError(sftpErr) };
      deployed = await deployViaFtp();
    }
    state = { ...state, phase: 'public_smoke', transport: deployed.transport, remoteTarget: deployed.target };
    const smoke = await publicSmoke();
    state = {
      ...state,
      ok: true,
      phase: 'completed',
      deployed: true,
      publicUrl: PUBLIC_URL,
      smoke,
      finishedAt: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    state = {
      ...state,
      ok: false,
      phase: 'failed',
      deployed: false,
      error: safeError(err),
      finishedAt: new Date().toISOString(),
    };
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (req.url === '/health') {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, service: 'plutyx-hostinger-deployer', phase: state.phase }));
    return;
  }
  res.statusCode = state.ok ? 200 : 500;
  res.end(JSON.stringify(state));
});

server.listen(PORT, '0.0.0.0', () => {
  runDeploy();
});
