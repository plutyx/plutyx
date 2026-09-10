const endpoint = process.env.GCL_MARKET_ENDPOINT || 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/gcl-market-request';
const allowedOrigin = 'https://plutyx.com';

async function read(r) {
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: r.status, body };
}

async function expect(name, request, status, predicate = () => true) {
  const result = await read(await request());
  const ok = result.status === status && predicate(result.body);
  console.log(JSON.stringify({ name, ok, expected_status: status, ...result }));
  if (!ok) throw new Error(`${name}_failed`);
}

await expect('method_guard', () => fetch(endpoint), 405, b => b?.error === 'method_not_allowed');

await expect('origin_guard', () => fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' },
  body: JSON.stringify({ listing_slug: 'none', email: 'bot@example.com' }),
}), 403, b => b?.error === 'origin_not_allowed');

await expect('honeypot_absorbs_without_persisting', () => fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: allowedOrigin },
  body: JSON.stringify({ company_website_confirm: 'https://spam.invalid', listing_slug: 'ignored', email: 'bot@example.com' }),
}), 201, b => b?.ok === true && b?.result?.saved === true);

await expect('payload_guard', () => fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: allowedOrigin },
  body: JSON.stringify({ filler: 'x'.repeat(17_000) }),
}), 413, b => b?.error === 'payload_too_large');

console.log('gcl-market-edge-smoke: ok');
