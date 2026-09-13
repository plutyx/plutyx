import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafe(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function rpc(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = data as { message?: string; error?: string } | null;
    throw new Error(String(error?.message || error?.error || `rpc_${response.status}`));
  }
  return data;
}

async function webhookSecret(live: boolean) {
  return await rpc("gcl_runtime_secret", {
    p_name: live ? "gcl_stripe_webhook_secret_live" : "gcl_stripe_webhook_secret_test",
  });
}

async function verify(raw: string, signature: string, secret: string) {
  const parts = signature.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const candidates = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || candidates.length === 0) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${raw}`)));
  return candidates.some((candidate) => timingSafe(digest, candidate));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    const [liveSecret, testSecret] = await Promise.all([
      webhookSecret(true).catch(() => null),
      webhookSecret(false).catch(() => null),
    ]);
    return json({
      ok: true,
      service: "gcl-stripe-webhook",
      version: "3.0.0",
      mode: "dual-environment-signature-required",
      live_ready: Boolean(liveSecret),
      test_ready: Boolean(testSecret),
    });
  }

  if (request.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  try {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      return new Response("invalid_json", { status: 400 });
    }

    const live = event.livemode === true;
    const secret = await webhookSecret(live);
    if (!secret) {
      return new Response(live ? "live_webhook_secret_unconfigured" : "test_webhook_secret_unconfigured", {
        status: 503,
      });
    }
    if (!(await verify(raw, signature, String(secret)))) return new Response("invalid_signature", { status: 400 });

    const result = await rpc("gcl_process_stripe_event", { p_event: event });
    return json({ received: true, livemode: live, result });
  } catch (error) {
    console.error("gcl-stripe-webhook", error);
    return new Response("webhook_processing_failed", { status: 500 });
  }
});
