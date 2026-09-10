import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const U = Deno.env.get('SUPABASE_URL')!;
const A = Deno.env.get('SUPABASE_ANON_KEY')!;
const allowed = new Set([
  'https://plutyx.com',
  'https://www.plutyx.com',
  'https://ranking-conversao-preview.onrender.com',
  'http://127.0.0.1:4173'
]);

function headers(origin: string | null) {
  const o = origin && allowed.has(origin) ? origin : 'https://plutyx.com';
  return {
    'access-control-allow-origin': o,
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'vary': 'Origin',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
}

function reply(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

async function rpc(name: string, args: Record<string, unknown>, token: string) {
  const r = await fetch(`${U}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: A,
      authorization: token,
      'content-type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new Error(String(data?.message || data?.hint || data?.details || `rpc_${r.status}`));
  return data;
}

Deno.serve(async req => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (origin && !allowed.has(origin)) return reply(origin, { error: 'origin_not_allowed' }, 403);
  if (req.method !== 'POST') return reply(origin, { error: 'method_not_allowed' }, 405);

  const token = req.headers.get('authorization') || '';
  if (!token.toLowerCase().startsWith('bearer ')) return reply(origin, { error: 'authentication_required' }, 401);

  try {
    const b = await req.json().catch(() => ({}));
    const action = String(b?.action || '').toLowerCase();
    if (!['list', 'upsert', 'delete'].includes(action)) return reply(origin, { error: 'unknown_action' }, 400);

    await rpc('gcl_action_plan_rate_limit', { p_action: action }, token);

    if (action === 'list') {
      return reply(origin, {
        ok: true,
        result: await rpc('gcl_action_plan_list', { p_audit_run_id: b.audit_run_id }, token)
      });
    }

    if (action === 'upsert') {
      return reply(origin, {
        ok: true,
        result: await rpc('gcl_action_plan_upsert', {
          p_audit_run_id: b.audit_run_id,
          p_issue_key: String(b.issue_key || ''),
          p_label: String(b.label || ''),
          p_recommendation: b.recommendation || null,
          p_source_points: b.source_points ?? null,
          p_status: String(b.status || 'todo'),
          p_note: b.note || null
        }, token)
      }, 201);
    }

    return reply(origin, {
      ok: true,
      result: await rpc('gcl_action_plan_delete', { p_item_id: b.item_id }, token)
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes('rate_limit_exceeded')) return reply(origin, { error: 'rate_limit_exceeded' }, 429);
    if (m.includes('audit_access_denied')) return reply(origin, { error: 'audit_access_denied' }, 403);
    if (m.includes('authentication_required') || m.includes('JWT')) return reply(origin, { error: 'authentication_required' }, 401);
    if (m.includes('invalid_action_status') || m.includes('invalid_action_item') || m.includes('invalid input syntax for type uuid')) {
      return reply(origin, { error: 'invalid_action_item' }, 400);
    }
    console.error('gcl-action-plan-api', m);
    return reply(origin, { error: 'request_failed' }, 500);
  }
});
