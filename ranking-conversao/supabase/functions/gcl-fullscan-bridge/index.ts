declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BRIDGE_VERSION = '0.1.0';
const MODES = new Set(['rendered_preview','lighthouse_full','full_paid','benchmark_deepening']);

type RuntimeConfig = {
  bridge_token: string;
  worker_url: string;
  worker_token: string;
  max_pages: number;
  worker_timeout_ms: number;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('bridge_runtime_env_missing');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'authorization': `Bearer ${SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc_${name}_failed_${res.status}`);
  return (text ? JSON.parse(text) : null) as T;
}

function safeContent(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {value: parsed};
  } catch {
    return {raw: text.slice(0, 200000)};
  }
}

function isCanaryUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'example.com';
  } catch { return false; }
}

async function runWorker(payload: any, cfg: RuntimeConfig) {
  const started = Date.now();
  let httpStatus: number | null = null;
  let timedOut = false;
  let error: string | null = null;
  let content: Record<string, unknown> = {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('worker_timeout'), Math.max(1000, Number(cfg.worker_timeout_ms || 120000)));
    try {
      const res = await fetch(`${String(cfg.worker_url).replace(/\/$/,'')}/audit`, {
        method: 'POST',
        headers: {'content-type':'application/json','x-sac-worker-token':String(cfg.worker_token)},
        body: JSON.stringify({
          url: payload.url,
          max_pages: Number(cfg.max_pages || 1),
          render_js: true,
          include_screenshot: false,
          job_class: payload.mode
        }),
        signal: controller.signal
      });
      httpStatus = res.status;
      content = safeContent(await res.text());
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    timedOut = String((e as any)?.name || '').toLowerCase().includes('abort') || String(e).includes('worker_timeout');
    error = timedOut ? 'worker_timeout' : 'worker_transport_error';
  }

  const evidence = {
    bridge_version: BRIDGE_VERSION,
    mode: payload.mode,
    worker_http_status: httpStatus,
    timed_out: timedOut,
    transport_error: error,
    bridge_background_duration_ms: Date.now() - started,
    worker_version: (content as any)?.engine?.version ?? null,
    worker_duration_ms: (content as any)?.audit?.duration_ms ?? null,
    lighthouse_available: (content as any)?.lighthouse?.available ?? null,
    lighthouse_profile: (content as any)?.lighthouse?.category_profile ?? null,
    profile_cleanup_matched_after: (content as any)?.lighthouse?.profile_cleanup?.matched_after ?? null,
    cgroup_after_bytes: (content as any)?.runtime_memory?.after_pipeline?.cgroup_current_bytes ?? null,
    cgroup_limit_bytes: (content as any)?.runtime_memory?.after_pipeline?.cgroup_limit_bytes ?? null
  };

  if (payload.action === 'canary') {
    await rpc('gcl_record_fullscan_bridge_canary', {p_evidence: evidence});
    return;
  }

  await rpc('gcl_finish_fullscan_bridge_job', {
    p_job_id: payload.job_id,
    p_attempt: payload.attempt,
    p_http_status: httpStatus,
    p_timed_out: timedOut,
    p_error: error,
    p_content: content
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ok:false,error:'method_not_allowed'},405);
  let payload: any;
  try { payload = await req.json(); } catch { return json({ok:false,error:'invalid_json'},400); }
  const action = String(payload?.action || '');
  const mode = String(payload?.mode || '');
  if (!['canary','dispatch'].includes(action)) return json({ok:false,error:'invalid_action'},400);
  if (!MODES.has(mode)) return json({ok:false,error:'invalid_mode'},400);
  if (typeof payload?.url !== 'string') return json({ok:false,error:'invalid_url'},400);
  if (action === 'canary' && !isCanaryUrl(payload.url)) return json({ok:false,error:'canary_url_not_allowed'},400);
  if (action === 'dispatch') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(payload?.job_id || '')))
      return json({ok:false,error:'invalid_job_id'},400);
    if (!Number.isInteger(payload?.attempt) || payload.attempt < 1 || payload.attempt > 10)
      return json({ok:false,error:'invalid_attempt'},400);
  }

  let cfg: RuntimeConfig;
  try { cfg = await rpc<RuntimeConfig>('gcl_fullscan_bridge_runtime',{p_mode:mode}); }
  catch { return json({ok:false,error:'bridge_runtime_unavailable'},503); }

  const provided = req.headers.get('x-gcl-bridge-token') || '';
  if (!provided || provided !== String(cfg.bridge_token || '')) return json({ok:false,error:'unauthorized'},401);

  EdgeRuntime.waitUntil(runWorker({...payload,action,mode},cfg).catch(() => undefined));
  return json({ok:true,accepted:true,transport:'gcl_fullscan_bridge_v94',bridge_version:BRIDGE_VERSION,action,job_id:action==='dispatch'?payload.job_id:null},202);
});
