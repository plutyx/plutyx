import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function migrationText() {
  const dir = path.join(root, 'supabase', 'migrations');
  const matches = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /gcl_paid_acquisition_attribution_v81\.sql$/.test(name))
    : [];
  assert.equal(matches.length, 1, 'v81 must have exactly one versioned migration');
  return fs.readFileSync(path.join(dir, matches[0]), 'utf8');
}

function read(relative) {
  const full = path.join(root, relative);
  assert.ok(fs.existsSync(full), `${relative} must exist`);
  return fs.readFileSync(full, 'utf8');
}

test('v81 persists first-party acquisition attribution on diagnostic leads', () => {
  const sql = migrationText();
  for (const field of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer','landing_path','gclid','fbclid','msclkid','ttclid','tracking_consent']) {
    assert.match(sql, new RegExp(field, 'i'), `migration must persist ${field}`);
  }
  assert.match(sql, /sac_api_save_lead_v81/i);
  assert.match(sql, /tracking_consent/i);
  assert.match(sql, /case\s+when\s+v_tracking/i);
  assert.match(sql, /revoke\s+execute[\s\S]*anon/i);
});

test('v81 browser helper keeps first touch in sessionStorage and releases click ids only with tracking consent', () => {
  const src = read('src/acquisition-attribution-v81.js');
  assert.match(src, /sessionStorage/);
  assert.doesNotMatch(src, /localStorage/);
  for (const param of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','msclkid','ttclid']) {
    assert.match(src, new RegExp(param));
  }
  assert.match(src, /document\.referrer/);
  assert.match(src, /trackingConsent|tracking_consent|TRACKING_CONSENT/);
  assert.match(src, /gclid[\s\S]*tracking|tracking[\s\S]*gclid/i);
});

test('v81 Edge save-lead route sanitizes attribution and calls the versioned RPC', () => {
  const src = read('supabase/functions/sac-public-api/index.ts');
  assert.match(src, /sac_api_save_lead_v81/);
  for (const field of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer','landing_path','gclid','fbclid','msclkid','ttclid','tracking_consent']) {
    assert.match(src, new RegExp(field));
  }
  assert.match(src, /slice\(|substring\(|sanitize/i);
});

test('v81 bootstrap loads before the app, enriches save-lead only, and adds no third-party pixels', () => {
  const html = read('index.html');
  assert.match(html, /src\/acquisition-attribution-v81\.js/);
  assert.ok(
    html.indexOf('/src/acquisition-attribution-v81.js') < html.indexOf('/src/platform-router.jsx'),
    'acquisition bootstrap must load before the application router'
  );

  const helper = read('src/acquisition-attribution-v81.js');
  assert.match(helper, /save-lead/);
  assert.match(helper, /attribution/);
  assert.match(helper, /FUNCTION_URL|sac-public-api/);
  assert.doesNotMatch(helper, /fbq\s*\(/);
  assert.doesNotMatch(helper, /gtag\s*\(/);
  assert.doesNotMatch(helper, /connect\.facebook\.net|googletagmanager\.com/i);
});

test('v81 runtime sends UTMs without click ids before tracking consent and releases click ids after consent', async () => {
  const store = new Map();
  const calls = [];
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalSessionStorage = globalThis.sessionStorage;

  globalThis.sessionStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
  };
  globalThis.document = { referrer: 'https://www.google.com/search?q=customer-secret' };
  globalThis.window = {
    location: {
      href: 'https://plutyx.com/ranking-site/?utm_source=google&utm_medium=cpc&utm_campaign=gcl_launch&gclid=CLICK-123&fbclid=FB-456',
      search: '?utm_source=google&utm_medium=cpc&utm_campaign=gcl_launch&gclid=CLICK-123&fbclid=FB-456',
    },
    fetch: async (input, init) => {
      calls.push({ input, init, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ saved: true }) };
    },
  };

  try {
    const helperUrl = pathToFileURL(path.join(root, 'src', 'acquisition-attribution-v81.js')).href + `?runtime=${Date.now()}`;
    const mod = await import(helperUrl);
    const endpoint = 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-public-api';

    await window.fetch(endpoint, { method: 'POST', body: JSON.stringify({ action: 'save-lead', preview_token: 'x' }) });
    assert.equal(calls[0].body.attribution.utm_source, 'google');
    assert.equal(calls[0].body.attribution.utm_medium, 'cpc');
    assert.equal(calls[0].body.attribution.utm_campaign, 'gcl_launch');
    assert.equal(calls[0].body.attribution.tracking_consent, false);
    assert.equal(calls[0].body.attribution.gclid, undefined);
    assert.equal(calls[0].body.attribution.fbclid, undefined);
    assert.doesNotMatch(calls[0].body.attribution.referrer, /customer-secret/);
    assert.doesNotMatch(calls[0].body.attribution.landing_path, /gclid|fbclid/);

    mod.setTrackingConsent(true);
    await window.fetch(endpoint, { method: 'POST', body: JSON.stringify({ action: 'save-lead', preview_token: 'x' }) });
    assert.equal(calls[1].body.attribution.tracking_consent, true);
    assert.equal(calls[1].body.attribution.gclid, 'CLICK-123');
    assert.equal(calls[1].body.attribution.fbclid, 'FB-456');
  } finally {
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = originalSessionStorage;
  }
});
