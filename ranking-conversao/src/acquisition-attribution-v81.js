const ATTRIBUTION_KEY = 'gcl_acquisition_first_touch_v81';
const TRACKING_CONSENT_KEY = 'gcl_tracking_consent_v1';
const FUNCTION_URL = 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-public-api';
const CLICK_IDS = ['gclid', 'fbclid', 'msclkid', 'ttclid'];
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function clean(value, max = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function safeReferrer() {
  const raw = document.referrer;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return clean(url.toString(), 2048);
  } catch {
    return null;
  }
}

function safeLandingPath() {
  const url = new URL(window.location.href);
  for (const key of CLICK_IDS) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  return clean(`${url.pathname}${query ? `?${query}` : ''}`, 1024);
}

function readStored() {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function captureAcquisitionAttribution() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return {};
  const existing = readStored();
  if (existing) return existing;

  const params = new URLSearchParams(window.location.search);
  const firstTouch = {
    captured_at: new Date().toISOString(),
    landing_path: safeLandingPath(),
    referrer: safeReferrer(),
  };

  for (const key of [...UTM_KEYS, ...CLICK_IDS]) {
    const value = clean(params.get(key));
    if (value) firstTouch[key] = value;
  }

  try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(firstTouch)); } catch {}
  return firstTouch;
}

export function setTrackingConsent(granted) {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(TRACKING_CONSENT_KEY, granted === true ? 'granted' : 'denied'); } catch {}
}

function hasTrackingConsent() {
  try { return sessionStorage.getItem(TRACKING_CONSENT_KEY) === 'granted'; } catch { return false; }
}

export function getAcquisitionAttribution() {
  const firstTouch = captureAcquisitionAttribution();
  const trackingConsent = hasTrackingConsent();
  const attribution = {
    utm_source: clean(firstTouch.utm_source),
    utm_medium: clean(firstTouch.utm_medium),
    utm_campaign: clean(firstTouch.utm_campaign),
    utm_content: clean(firstTouch.utm_content),
    utm_term: clean(firstTouch.utm_term),
    referrer: clean(firstTouch.referrer, 2048),
    landing_path: clean(firstTouch.landing_path, 1024),
    tracking_consent: trackingConsent,
  };

  // Click IDs can identify an ad interaction and are intentionally not released
  // from session-only storage until separate tracking consent is granted.
  if (trackingConsent) {
    attribution.gclid = clean(firstTouch.gclid);
    attribution.fbclid = clean(firstTouch.fbclid);
    attribution.msclkid = clean(firstTouch.msclkid);
    attribution.ttclid = clean(firstTouch.ttclid);
  }

  return attribution;
}

function isLeadRequest(input, init) {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
  return target.startsWith(FUNCTION_URL) && String(init?.method || 'GET').toUpperCase() === 'POST' && typeof init?.body === 'string';
}

export function installAcquisitionAttributionV81() {
  if (typeof window === 'undefined' || window.__GCL_ATTRIBUTION_V81_INSTALLED__) return;
  captureAcquisitionAttribution();
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    if (!isLeadRequest(input, init)) return originalFetch(input, init);
    try {
      const payload = JSON.parse(init.body);
      if (payload?.action !== 'save-lead') return originalFetch(input, init);
      const attribution = getAcquisitionAttribution();
      return originalFetch(input, {
        ...init,
        body: JSON.stringify({ ...payload, attribution }),
      });
    } catch {
      return originalFetch(input, init);
    }
  };

  window.__GCL_ATTRIBUTION_V81_INSTALLED__ = true;
}

installAcquisitionAttributionV81();
