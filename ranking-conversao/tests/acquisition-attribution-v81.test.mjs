import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  for (const field of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer','landing_path','gclid','fbclid','msclkid','ttclid']) {
    assert.match(sql, new RegExp(field, 'i'), `migration must persist ${field}`);
  }
  assert.match(sql, /sac_api_save_lead_v81/i);
  assert.match(sql, /marketing_consent/i);
  assert.match(sql, /revoke\s+execute[\s\S]*anon/i);
});

test('v81 browser helper keeps first touch in sessionStorage and releases click ids only with marketing consent', () => {
  const src = read('src/acquisition-attribution-v81.js');
  assert.match(src, /sessionStorage/);
  assert.doesNotMatch(src, /localStorage/);
  for (const param of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','msclkid','ttclid']) {
    assert.match(src, new RegExp(param));
  }
  assert.match(src, /document\.referrer/);
  assert.match(src, /marketingConsent|marketing_consent/);
  assert.match(src, /gclid[\s\S]*marketing|marketing[\s\S]*gclid/i);
});

test('v81 Edge save-lead route sanitizes attribution and calls the versioned RPC', () => {
  const src = read('supabase/functions/sac-public-api/index.ts');
  assert.match(src, /sac_api_save_lead_v81/);
  for (const field of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','referrer','landing_path','gclid','fbclid','msclkid','ttclid']) {
    assert.match(src, new RegExp(field));
  }
  assert.match(src, /marketing_consent|marketingConsent/);
  assert.match(src, /slice\(|substring\(|sanitize/i);
});

test('v81 diagnostic form sends acquisition context explicitly and does not add third-party pixels', () => {
  const main = read('src/main.jsx');
  assert.match(main, /acquisition-attribution-v81/);
  assert.match(main, /captureAcquisitionAttribution|getAcquisitionAttribution/);
  assert.match(main, /save-lead[\s\S]*attribution/);

  const helper = read('src/acquisition-attribution-v81.js');
  assert.doesNotMatch(helper, /fbq\s*\(/);
  assert.doesNotMatch(helper, /gtag\s*\(/);
  assert.doesNotMatch(helper, /connect\.facebook\.net|googletagmanager\.com/i);
});
