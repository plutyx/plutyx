import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const allowedOrigins = new Set([
  "https://plutyx.com",
  "https://www.plutyx.com",
  "https://ranking-conversao-preview.onrender.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function cors(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://plutyx.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}

function reply(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function validUuid(token: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, { error: "method_not_allowed" }, 405);
  if (origin && !allowedOrigins.has(origin)) return reply(origin, { error: "origin_not_allowed" }, 403);

  try {
    const payload = await req.json();
    const action = String(payload?.action || "browse");
    const limit = Math.max(1, Math.min(Number(payload?.limit || 12), 30));

    if (action === "browse") {
      const { data, error } = await db.rpc("sac_api_market_catalog", { p_limit: limit });
      if (error) throw error;
      return reply(origin, data, 200);
    }

    if (action === "recommendations") {
      const token = String(payload?.token || "");
      if (!validUuid(token)) return reply(origin, { error: "invalid_token" }, 400);
      const { data, error } = await db.rpc("sac_api_market_for_token", { p_token: token, p_limit: Math.min(limit, 24) });
      if (error) throw error;
      if (!data?.found) return reply(origin, { found: false }, 404);
      return reply(origin, data, 200);
    }

    return reply(origin, { error: "unknown_action" }, 400);
  } catch (err) {
    console.error("sac-public-market", err);
    return reply(origin, { error: "internal_error" }, 500);
  }
});
