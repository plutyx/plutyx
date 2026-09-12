import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => {
  const full = path.join(root, relative);
  assert.ok(fs.existsSync(full), `${relative} must exist`);
  return fs.readFileSync(full, 'utf8');
};
const migration = () => {
  const dir = path.join(root, 'supabase', 'migrations');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => /gcl_consent_conversion_events_v82\.sql$/.test(n)) : [];
  assert.equal(files.length, 1, 'v82 must have exactly one versioned migration');
  return fs.readFileSync(path.join(dir, files[0]), 'utf8');
};

test('v82 stores a private first-party acquisition event ledger with a service-role-only writer', () => {
  const sql = migration();
  assert.match(sql, /create table[\s\S]*sac\.gcl_acquisition_events/i);
  assert.match(sql, /landing_view|diagnostic_started|lead_saved|consent_updated/i);
  assert.match(sql, /session_id/i);
  assert.match(sql, /utm_source/i);
  assert.match(sql, /gclid/i);
  assert.match(sql, /analytics_consent/i);
  assert.match(sql, /ads_consent/i);
  assert.match(sql, /gcl_record_acquisition_event/i);
  assert.match(sql, /revoke all[\s\S]*anon[\s\S]*authenticated/i);
  assert.match(sql, /grant execute[\s\S]*service_role/i);
  assert.match(sql, /case\s+when\s+p_ads_consent/i);
});

test('v82 consent center defaults non-essential categories to denied and persists only the consent decision', () => {
  const src = read('src/consent-center-v82.js');
  assert.match(src, /analytics\s*:\s*false/);
  assert.match(src, /ads\s*:\s*false/);
  assert.match(src, /localStorage/);
  assert.match(src, /setTrackingConsent/);
  assert.match(src, /Somente necessários|Rejeitar não essenciais/i);
  assert.match(src, /Aceitar medição|Aceitar/i);
  assert.match(src, /\/privacy\//);
  assert.match(src, /\/cookies\//);
  assert.match(src, /\.gcl-consent82-card\{[^}]*pointer-events:none/i, 'consent card background must not block necessary product interactions');
  assert.match(src, /\.gcl-consent82-card a,[\s\S]*pointer-events:auto/i, 'only consent controls should capture pointer input');
  assert.doesNotMatch(src, /gclid|fbclid|msclkid|ttclid/i, 'consent storage must not contain acquisition identifiers');
  assert.doesNotMatch(src, /connect\.facebook\.net|googletagmanager\.com|fbq\s*\(|gtag\s*\(/i);
});

test('v82 first-party event client uses a publishable API key and ships no legacy JWT', () => {
  const src = read('src/acquisition-events-v82.js');
  assert.match(src, /sessionStorage/);
  assert.match(src, /crypto\.randomUUID/);
  assert.match(src, /landing_view/);
  assert.match(src, /diagnostic_started/);
  assert.match(src, /consent_updated/);
  assert.match(src, /acquisition-event/);
  assert.match(src, /analytics/);
  assert.match(src, /ads/);
  assert.match(src, /sb_publishable_[A-Za-z0-9_-]+/, 'public browser calls must use the rotatable publishable key');
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, 'legacy JWTs must never ship in the browser bundle');
  assert.doesNotMatch(src, /Authorization\s*:/, 'anonymous public API calls must not duplicate the publishable key into Authorization');
  assert.doesNotMatch(src, /connect\.facebook\.net|googletagmanager\.com|fbq\s*\(|gtag\s*\(/i);
});

test('v82 Edge validates public apikey itself and accepts only sanitized acquisition events', () => {
  const src = read('supabase/functions/sac-public-api/index.ts');
  assert.match(src, /SUPABASE_PUBLISHABLE_KEYS/);
  assert.match(src, /SUPABASE_ANON_KEY/);
  assert.match(src, /req\.headers\.get\(["']apikey["']\)/);
  assert.match(src, /invalid_apikey|unauthorized_apikey/i);
  assert.match(src, /gcl_record_acquisition_event/);
  assert.match(src, /acquisition-event/);
  assert.match(src, /lead_saved/);
  assert.match(src, /analytics_consent/);
  assert.match(src, /ads_consent/);
  assert.match(src, /sanitize/i);
});

test('v82 first-touch and paid lead interception boot before the app while URL hygiene runs after attribution capture', () => {
  const html = read('index.html');
  const attribution = html.indexOf('/src/acquisition-attribution-v81.js');
  const hygiene = html.indexOf('/src/url-hygiene-v1.js');
  const consent = html.indexOf('/src/consent-center-v82.js');
  const events = html.indexOf('/src/acquisition-events-v82.js');
  const paidGate = html.indexOf('/src/paid-analysis-gate-v15.js');
  const router = html.indexOf('/src/platform-router.jsx');
  assert.ok(attribution > -1 && hygiene > -1 && consent > -1 && events > -1 && paidGate > -1 && router > -1);
  assert.ok(attribution < hygiene, 'first-touch attribution must capture campaign params before URL hygiene removes UTMs');
  assert.ok(hygiene < consent && consent < events && events < paidGate && paidGate < router, 'consent, event and lead-interception gates must be installed before the app router renders interactive forms');
  const legal = read('src/legal-center-v37.js');
  assert.match(legal, /privacy/);
  assert.match(legal, /cookies/);
});
