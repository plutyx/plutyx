const SLUG = "cozinha360-public-integrations-v58";
const VERSION = "5.8.0";
const env = (name: string) => (Deno.env.get(name) || "").trim();

const origins = new Set([
  "https://cozinha-360-os-v41.onrender.com",
  "https://cozinha-360-os.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origins.has(origin)
      ? origin
      : "https://cozinha-360-os.netlify.app",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function reply(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(req) });
}

const definitions = [
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    mode: "oauth",
    authorization: "Meta OAuth",
    needs: ["META_APP_ID", "META_APP_SECRET"],
    partner_access: "meta_app_configuration",
  },
  {
    id: "ifood",
    name: "iFood",
    mode: "device_code",
    authorization: "iFood distributed authorization",
    needs: ["IFOOD_CLIENT_ID", "IFOOD_CLIENT_SECRET"],
    partner_access: "ifood_partner_access",
  },
  {
    id: "mercadopago",
    name: "Mercado Pago",
    mode: "oauth_pkce",
    authorization: "Mercado Pago OAuth + PKCE",
    needs: ["MERCADOPAGO_CLIENT_ID", "MERCADOPAGO_CLIENT_SECRET"],
    partner_access: "mercadopago_application",
  },
  {
    id: "google",
    name: "Google Business Profile",
    mode: "oauth",
    authorization: "Google OAuth 2.0",
    needs: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    partner_access: "google_business_profile_access",
  },
  {
    id: "meta_ads",
    name: "Meta Ads",
    mode: "oauth",
    authorization: "Meta OAuth",
    needs: ["META_APP_ID", "META_APP_SECRET"],
    partner_access: "meta_app_configuration",
  },
] as const;

function catalog() {
  return definitions.map(({ needs, ...provider }) => {
    const platformReady = needs.every((name) => Boolean(env(name)));
    return {
      ...provider,
      platform_ready: platformReady,
      state: platformReady ? "ready_to_authorize" : "platform_setup_required",
      user_action: platformReady ? "authorize_account" : "none",
    };
  });
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers(req) });
  }
  if (req.method !== "GET") return reply(req, { detail: "Método não permitido" }, 405);

  const raw = req.url.split("?")[0];
  if (raw.endsWith("/livez")) {
    return reply(req, { ok: true, service: SLUG, version: VERSION });
  }
  if (raw.endsWith("/readyz")) {
    return reply(req, { ok: true, service: SLUG, version: VERSION, catalog: "ready" });
  }
  if (raw.endsWith("/capabilities")) {
    const providers = catalog();
    return reply(req, {
      ok: true,
      version: VERSION,
      providers,
      ready_count: providers.filter((provider) => provider.platform_ready).length,
      total_count: providers.length,
      secrets_exposed: false,
    });
  }
  return reply(req, { detail: "Rota não encontrada" }, 404);
});