import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const U = Deno.env.get('SUPABASE_URL')!;
const K = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_BODY_BYTES = 16_384;
const exact = new Set([
  'https://plutyx.com',
  'https://www.plutyx.com',
  'https://ranking-conversao-preview.onrender.com',
  'https://ranking-conversao-plutyx.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function allowed(o: string | null) {
  return !o || exact.has(o) || /^https:\/\/[a-z0-9-]+--ranking-conversao-plutyx\.netlify\.app$/i.test(o);
}
function headers(o: string | null) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': o && allowed(o) ? o : 'https://plutyx.com',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
  };
}
function out(o: string | null, b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: headers(o) });
}
async function rpc(name: string, body: Record<string, unknown>) {
  const r = await fetch(`${U}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: K, authorization: `Bearer ${K}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let d: any;
  try { d = t ? JSON.parse(t) : null; } catch { d = { raw: t.slice(0, 500) }; }
  if (!r.ok) throw new Error(String(d?.message || d?.error || `rpc_${r.status}`));
  return d;
}
function clean(v: unknown, max: number) {
  return typeof v === 'string' ? v.trim().slice(0, max) : null;
}
async function hash(s: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
function normalizeWebsite(v: unknown) {
  const raw = clean(v, 2048);
  if (!raw) return null;
  let s = raw;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('invalid_url');
  u.hash = '';
  return u.toString();
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  const o = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(o) });
  if (!allowed(o)) return out(o, { error: 'origin_not_allowed' }, 403);
  if (req.method !== 'POST') return out(o, { error: 'method_not_allowed' }, 405);

  const len = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) return out(o, { error: 'payload_too_large' }, 413);

  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return out(o, { error: 'payload_too_large' }, 413);
    const b = JSON.parse(raw || '{}');

    if (clean(b?.company_website_confirm, 300)) return out(o, { ok: true, result: { saved: true } }, 201);

    const slug = clean(b?.listing_slug, 180) || '';
    const email = clean(b?.email, 254) || '';
    const website = normalizeWebsite(b?.website_url);
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim();

    const ipBucket = await hash(ip);
    const ipLimit = await rpc('consume_rate_limit', {
      p_route: 'public:market_request:ip',
      p_bucket: ipBucket,
      p_window_seconds: 900,
      p_limit: 12,
    });
    if (!ipLimit?.allowed) return out(o, { error: 'rate_limited', reset_at: ipLimit.reset_at }, 429);

    const comboBucket = await hash(`${ip}|${email.toLowerCase()}|${slug}`);
    const comboLimit = await rpc('consume_rate_limit', {
      p_route: 'public:market_request',
      p_bucket: comboBucket,
      p_window_seconds: 300,
      p_limit: 5,
    });
    if (!comboLimit?.allowed) return out(o, { error: 'rate_limited', reset_at: comboLimit.reset_at }, 429);

    const scan = clean(b?.scan_token, 64);
    const data = await rpc('gcl_market_request', {
      p_listing_slug: slug,
      p_email: email,
      p_phone: clean(b?.phone, 80),
      p_company_name: clean(b?.company_name, 180),
      p_role_title: clean(b?.role_title, 140),
      p_website_url: website,
      p_scan_token: scan && uuid.test(scan) ? scan : null,
      p_message: clean(b?.message, 4000),
      p_source_path: clean(b?.source_path, 500) || '/ranking-site/services/',
      p_referrer: clean(b?.referrer, 1000),
      p_utm_source: clean(b?.utm_source, 160),
      p_utm_medium: clean(b?.utm_medium, 160),
      p_utm_campaign: clean(b?.utm_campaign, 240),
      p_utm_content: clean(b?.utm_content, 240),
      p_utm_term: clean(b?.utm_term, 240),
      p_marketing_consent: Boolean(b?.marketing_consent),
    });
    return out(o, { ok: true, result: data }, 201);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes('invalid_email')) return out(o, { error: 'invalid_email' }, 400);
    if (m.includes('invalid_url')) return out(o, { error: 'invalid_url' }, 400);
    if (m.includes('listing_not_found')) return out(o, { error: 'listing_not_found' }, 404);
    if (m.includes('rate_limited')) return out(o, { error: 'rate_limited' }, 429);
    if (m.includes('JSON')) return out(o, { error: 'invalid_payload' }, 400);
    console.error('gcl-market-request', m);
    return out(o, { error: 'request_failed' }, 500);
  }
});
