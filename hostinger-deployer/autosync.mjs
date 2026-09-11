import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shouldSyncRelease, validateReleaseProvenance } from './autosync-policy.mjs';

const RELEASE_BRANCH = 'convrank-hostinger-dist';
const REPOSITORY = 'https://github.com/plutyx/plutyx.git';
const RELEASE_PROVENANCE_URL = `https://raw.githubusercontent.com/plutyx/plutyx/${RELEASE_BRANCH}/gcl-build.json`;
const PRODUCTION_PROVENANCE_URL = 'https://plutyx.com/ranking-site/gcl-build.json';
const CI_RUNNER = fileURLToPath(new URL('./ci-run.mjs', import.meta.url));
const MIN_INTERVAL_MS = 15_000;
const DEFAULT_INTERVAL_MS = 30_000;

let timer = null;
let inFlight = false;
let lastResult = { ok: true, phase: 'not_started', at: null };

function intervalMs() {
  const requested = Number(process.env.DEPLOY_SYNC_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  return Number.isFinite(requested) ? Math.max(MIN_INTERVAL_MS, requested) : DEFAULT_INTERVAL_MS;
}

async function fetchJson(url, timeoutMs = 12_000) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'plutyx-gcl-release-sync/1.0' },
  });
  if (!response.ok) throw new Error(`http_${response.status}:${url}`);
  return response.json();
}

function runCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 180_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const keepTail = (current, chunk) => (current + chunk.toString()).slice(-16_000);
    child.stdout.on('data', chunk => { stdout = keepTail(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = keepTail(stderr, chunk); });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`command_timeout:${command}`));
    }, timeoutMs);

    child.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`command_failed:${command}:${code}:${stderr.slice(-1200)}`));
    });
  });
}

async function cloneValidatedRelease(expectedSha) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gcl-release-'));
  try {
    await runCommand('git', [
      'clone', '--depth=1', '--single-branch', '--branch', RELEASE_BRANCH,
      REPOSITORY, tempDir,
    ], { timeoutMs: 60_000 });

    const provenance = JSON.parse(await fs.readFile(path.join(tempDir, 'gcl-build.json'), 'utf8'));
    const validation = validateReleaseProvenance(provenance);
    if (!validation.ok) throw new Error(validation.reason);
    if (validation.sourceSha !== expectedSha) throw new Error('release_provenance_changed_during_sync');

    const required = ['index.html', '.htaccess', 'assets', 'gcl-build.json'];
    for (const entry of required) {
      await fs.access(path.join(tempDir, entry));
    }
    return { tempDir, provenance };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function waitForProductionSha(expectedSha) {
  let last = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const production = await fetchJson(PRODUCTION_PROVENANCE_URL);
      last = production?.source_sha || null;
      if (String(last).toLowerCase() === expectedSha) return production;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error(`production_sha_not_converged:${String(last || 'unavailable')}`);
}

export function getAutosyncState() {
  return { ...lastResult, inFlight, intervalMs: intervalMs() };
}

export async function syncReleaseOnce() {
  if (inFlight) return { ok: true, phase: 'skipped', reason: 'sync_in_flight' };
  inFlight = true;
  let tempDir = null;

  try {
    const [production, release] = await Promise.all([
      fetchJson(PRODUCTION_PROVENANCE_URL).catch(() => ({})),
      fetchJson(RELEASE_PROVENANCE_URL),
    ]);
    const decision = shouldSyncRelease(production, release);
    if (!decision.sync) {
      lastResult = { ok: true, phase: 'current', reason: decision.reason, sourceSha: decision.sourceSha || null, at: new Date().toISOString() };
      return lastResult;
    }

    lastResult = { ok: true, phase: 'preparing', sourceSha: decision.sourceSha, at: new Date().toISOString() };
    const cloned = await cloneValidatedRelease(decision.sourceSha);
    tempDir = cloned.tempDir;

    const port = randomInt(12_000, 20_000);
    lastResult = { ok: true, phase: 'deploying', sourceSha: decision.sourceSha, at: new Date().toISOString() };
    const child = await runCommand(process.execPath, [CI_RUNNER], {
      timeoutMs: 210_000,
      env: {
        ...process.env,
        DEPLOY_ENABLED: '1',
        DEPLOY_ON_BOOT: '1',
        LOCAL_DIST: tempDir,
        PORT: String(port),
      },
    });

    await waitForProductionSha(decision.sourceSha);
    lastResult = {
      ok: true,
      phase: 'completed',
      sourceSha: decision.sourceSha,
      childTail: child.stdout.slice(-1200),
      at: new Date().toISOString(),
    };
    console.log(JSON.stringify({ event: 'gcl_release_autosync_completed', sourceSha: decision.sourceSha, at: lastResult.at }));
    return lastResult;
  } catch (error) {
    lastResult = {
      ok: false,
      phase: 'failed',
      error: error instanceof Error ? error.message.slice(0, 1500) : String(error).slice(0, 1500),
      at: new Date().toISOString(),
    };
    console.error(JSON.stringify({ event: 'gcl_release_autosync_failed', error: lastResult.error, at: lastResult.at }));
    return lastResult;
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    inFlight = false;
  }
}

export function startReleaseAutosync() {
  if (timer) return timer;
  void syncReleaseOnce();
  timer = setInterval(() => { void syncReleaseOnce(); }, intervalMs());
  timer.unref?.();
  return timer;
}
