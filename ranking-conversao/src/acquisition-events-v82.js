import { getConsentDecision, CONSENT_EVENT } from './consent-center-v82.js';
import { getAcquisitionAttribution } from './acquisition-attribution-v81.js';

const FUNCTION_URL = 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-public-api';
const PUBLIC_KEY = 'sb_publishable_9XFsYS96Qe7eG4nTlQT07A_HsOz1qFF';
const SESSION_KEY = 'gcl_acquisition_session_v82';
const LANDING_SENT_KEY = 'gcl_landing_view_sent_v82';

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getAcquisitionSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = uuid();
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return uuid();
  }
}

function eventPayload(eventName, extra = {}) {
  const consent = getConsentDecision();
  const attribution = getAcquisitionAttribution();
  return {
    action: 'acquisition-event',
    event_name: eventName,
    session_id: getAcquisitionSessionId(),
    preview_token: extra.preview_token || null,
    analytics_consent: consent.analytics === true,
    ads_consent: consent.ads === true,
    attribution,
    metadata: extra.metadata || {},
  };
}

function withPublicKey(init = {}, body) {
  const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
  headers.apikey = PUBLIC_KEY;
  const next = { ...init, headers };
  if (body !== undefined) next.body = body;
  return next;
}

async function sendEventWith(fetchImpl, eventName, extra = {}) {
  const consent = getConsentDecision();
  if (['landing_view', 'diagnostic_started'].includes(eventName) && consent.analytics !== true) return { recorded: false, reason: 'analytics_consent_required' };
  try {
    const response = await fetchImpl(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: PUBLIC_KEY,
      },
      body: JSON.stringify(eventPayload(eventName, extra)),
    });
    return await response.json().catch(() => ({ recorded: response.ok }));
  } catch {
    return { recorded: false, reason: 'network_error' };
  }
}

function isPublicApiRequest(input, init) {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
  return target.startsWith(FUNCTION_URL) && String(init?.method || 'GET').toUpperCase() === 'POST' && typeof init?.body === 'string';
}

async function recordLandingOnce(fetchImpl) {
  const consent = getConsentDecision();
  if (!consent.analytics) return;
  try {
    if (sessionStorage.getItem(LANDING_SENT_KEY) === '1') return;
    sessionStorage.setItem(LANDING_SENT_KEY, '1');
  } catch {}
  await sendEventWith(fetchImpl, 'landing_view', { metadata: { path: location.pathname } });
}

export function installAcquisitionEventsV82() {
  if (typeof window === 'undefined' || window.__GCL_ACQUISITION_EVENTS_V82_INSTALLED__) return;
  const originalFetch = window.fetch.bind(window);

  window.addEventListener(CONSENT_EVENT, (event) => {
    const decision = event?.detail || getConsentDecision();
    void sendEventWith(originalFetch, 'consent_updated', {
      metadata: { necessary: true, analytics: decision.analytics === true, ads: decision.ads === true },
    });
    if (decision.analytics === true) void recordLandingOnce(originalFetch);
  });

  window.fetch = async (input, init = {}) => {
    if (!isPublicApiRequest(input, init)) return originalFetch(input, init);
    let payload;
    try { payload = JSON.parse(init.body); } catch { return originalFetch(input, withPublicKey(init)); }

    if (payload?.action === 'save-lead') {
      const consent = getConsentDecision();
      const enriched = {
        ...payload,
        acquisition_session_id: getAcquisitionSessionId(),
        consent: { analytics: consent.analytics === true, ads: consent.ads === true },
      };
      return originalFetch(input, withPublicKey(init, JSON.stringify(enriched)));
    }

    if (payload?.action === 'request-preview') {
      const response = await originalFetch(input, withPublicKey(init));
      if (response.ok && getConsentDecision().analytics === true) {
        let previewToken = null;
        try {
          const clone = response.clone();
          const data = await clone.json();
          previewToken = data?.public_token || data?.preview_token || data?.token || null;
        } catch {}
        void sendEventWith(originalFetch, 'diagnostic_started', { preview_token: previewToken });
      }
      return response;
    }

    return originalFetch(input, withPublicKey(init));
  };

  void recordLandingOnce(originalFetch);
  window.__GCL_ACQUISITION_EVENTS_V82_INSTALLED__ = true;
}

installAcquisitionEventsV82();
