import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
let partnerRequested = false;
let partnerPost = null;

await page.addInitScript(() => {
  localStorage.setItem("c360_token", "browser-test-token");
  sessionStorage.setItem("c360-cycle-v61-open", "0");
});

await page.route("**/api/me", (route) =>
  route.fulfill(json({
    user: { id: 1, email: "cliente@example.com", full_name: "Cliente" },
    businesses: [{ id: 1, name: "Cozinha Cliente", city: "Mogi das Cruzes", role: "owner", preferences: {} }],
  })),
);
await page.route("**/api/businesses/1/memory", (route) => route.fulfill(json({ business_id: 1, states: {} })));
await page.route("**/api/businesses/1/orders", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/kds", (route) => route.fulfill(json({ orders: [] })));
await page.route("**/api/businesses/1/dashboard", (route) => route.fulfill(json({
  pulse: { revenue_cents: 0, contribution_cents: 0, loss_cents: 0 },
  open_orders: 0,
  delay_rate: 0,
  error_rate: 0,
  next_action: null,
})));
await page.route("**/api/businesses/1/inventory/alerts", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/finance/summary?days=30", (route) => route.fulfill(json({
  period_days: 30,
  revenue_cents: 0,
  variable_costs_cents: 0,
  contribution_cents: 0,
  contribution_margin_bps: 0,
  loss_cents: 0,
  purchases_landed_cents: 0,
  order_count: 0,
})));

const profile = {
  business_id: 1,
  order_source: "whatsapp",
  use_mercadopago: false,
  use_google: true,
  use_meta_ads: false,
  configured_at: new Date().toISOString(),
  updated_by_user_id: 1,
};
await page.route("**/cozinha360-profile-v31/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/profile")) {
    return route.fulfill(json({ profile, recommended_order: ["whatsapp", "google"], internal_order_ready: false }));
  }
  return route.fulfill(json({ detail: "profile mock route not found" }, 404));
});

const connection = (key, name, status, lastSuccess = new Date().toISOString()) => ({
  id: key.length,
  provider: key,
  external_account_ref: `${key}-account`,
  display_name: `${name} Conta`,
  status,
  last_success_at: lastSuccess,
  last_error: status === "degraded" ? "Autorização precisa de atenção" : null,
});
const provider = (key, name, category, platformReady, conn = null, operational = false) => ({
  key,
  name,
  category,
  impact: "Impacto operacional.",
  why: "Autorização oficial.",
  mode: key === "ifood" ? "device_code" : "oauth",
  eta: "~2 min",
  platform_ready: platformReady,
  missing: platformReady ? [] : ["platform"],
  optional_missing: [],
  connection: conn,
  operational,
  asset_count: conn ? 1 : 0,
  selection_required: false,
  assets: [],
  selected_asset: conn ? { ref: `${key}-account`, label: `${name} Conta` } : null,
});

await page.route("**/cozinha360-integrations-v29/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/integrations")) {
    return route.fulfill(json({
      business_id: 1,
      recommended_order: ["whatsapp", "google"],
      providers: [
        provider("whatsapp", "WhatsApp Business", "Vendas & CRM", true, connection("whatsapp", "WhatsApp Business", "active"), true),
        provider("ifood", "iFood", "Marketplace", true),
        provider("mercadopago", "Mercado Pago / Pix", "Pagamentos", false),
        provider("google", "Google Business + Ads", "Aquisição local", true, connection("google", "Google Business", "active", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()), true),
        provider("meta_ads", "Meta Ads", "Aquisição", true),
      ],
    }));
  }
  return route.fulfill(json({ detail: "integration mock route not found" }, 404));
});

await page.route("**/cozinha360-pagbank-v59/businesses/1/status", (route) => route.fulfill(json({
  ok: true,
  readiness: { platform_ready: true, state: "ready_to_authorize", authorization: "PagBank Connect Authorization", environment: "production", homologated: true },
  connection: null,
})));

function passport() {
  const native = [
    {
      key: "whatsapp", name: "WhatsApp Business", category: "Pedidos & CRM", capability: "Atendimento, pedidos e recuperação", mode: "oauth", eta: "~2 min", platform_ready: true,
      state: "healthy", score: 3, evidence: { authorization: true, account_linked: true, health: true },
      connection: { status: "active", display_name: "WhatsApp Business Conta", external_account_ref: "whatsapp-account", last_success_at: new Date().toISOString(), last_error: null },
    },
    {
      key: "ifood", name: "iFood", category: "Marketplace", capability: "Pedidos no mesmo fluxo operacional", mode: "device_code", eta: "~3 min", platform_ready: true,
      state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null,
    },
    {
      key: "mercadopago", name: "Mercado Pago", category: "Pagamento", capability: "Pix e conciliação automática", mode: "oauth", eta: "~1 min", platform_ready: false,
      state: "platform_setup", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null,
    },
    {
      key: "pagbank", name: "PagBank", category: "Pagamento", capability: "Pix, checkout e conciliação", mode: "oauth", eta: "~2 min", platform_ready: true,
      state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null,
    },
    {
      key: "google", name: "Google Business", category: "Descoberta", capability: "Perfil local e presença no Google", mode: "oauth", eta: "~2 min", platform_ready: true,
      state: "stale", score: 2, evidence: { authorization: true, account_linked: true, health: false },
      connection: { status: "active", display_name: "Google Conta", external_account_ref: "google-account", last_success_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), last_error: null },
    },
    {
      key: "meta_ads", name: "Meta Ads", category: "Aquisição", capability: "Campanhas ligadas a venda e margem", mode: "oauth", eta: "~2 min", platform_ready: true,
      state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null,
    },
  ];
  const partners = ["99food", "keeta", "stone", "cielo", "getnet", "rede"].map((key) => ({
    key,
    name: key === "99food" ? "99Food" : key === "keeta" ? "Keeta" : key[0].toUpperCase() + key.slice(1),
    category: ["99food", "keeta"].includes(key) ? "Marketplace" : "POS & Pagamento",
    capability: ["99food", "keeta"].includes(key) ? "Pedidos no painel único" : "Pagamento presencial e conciliação",
    state: key === "99food" && partnerRequested ? "requested" : "available",
    requested_at: key === "99food" && partnerRequested ? new Date().toISOString() : null,
  }));
  return {
    ok: true,
    version: "6.5.0",
    business_id: 1,
    generated_at: new Date().toISOString(),
    summary: { native_total: 6, healthy: 1, attention: 1, ready: 3, platform_setup: 1, evidence_score: 5, evidence_max: 18, progress_percent: 28 },
    native,
    partners,
    principles: { restaurant_secrets_required: false, platform_managed_credentials: true, proof_model: ["authorization", "account_linked", "health"] },
  };
}

await page.route("**/cozinha360-connect-orchestrator-v65/**", async (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  if (req.method() === "GET" && path.endsWith("/businesses/1/passport")) return route.fulfill(json(passport()));
  if (req.method() === "POST" && path.endsWith("/businesses/1/partners/99food")) {
    partnerPost = req.postDataJSON();
    partnerRequested = true;
    return route.fulfill(json({ ok: true, provider: "99food", state: "requested", requested_at: new Date().toISOString() }));
  }
  return route.fulfill(json({ detail: `orchestrator mock route not found: ${req.method()} ${path}` }, 404));
});

try {
  await page.goto("http://127.0.0.1:5173/?connections=1", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Conecte sua operação, não APIs.", exact: true }).waitFor({ timeout: 15000 });

  const passportUi = page.locator("[data-integration-passport-v65]");
  await passportUi.waitFor({ state: "visible", timeout: 10000 });
  await passportUi.getByText("28%", { exact: true }).waitFor();
  await passportUi.getByRole("heading", { name: "LIGANDO PONTOS", exact: true }).waitFor();

  const whatsapp = passportUi.locator('[data-passport-provider="whatsapp"]');
  if ((await whatsapp.getAttribute("data-passport-state")) !== "healthy") throw new Error("WhatsApp passport state did not derive healthy evidence");
  await whatsapp.getByText("VIVO", { exact: true }).waitFor();
  await whatsapp.getByText("AUTH", { exact: true }).waitFor();
  await whatsapp.getByText("CONTA", { exact: true }).waitFor();
  await whatsapp.getByText("PULSO", { exact: true }).waitFor();

  const google = passportUi.locator('[data-passport-provider="google"]');
  if ((await google.getAttribute("data-passport-state")) !== "stale") throw new Error("Google passport did not expose stale health state");
  await google.getByText("REVALIDAR", { exact: true }).waitFor();

  if (await passportUi.locator('input[type="password"],input[name*="secret" i],input[name*="token" i]').count()) {
    throw new Error("integration passport exposed credential-entry fields to the restaurant");
  }

  await passportUi.getByRole("button", { name: /EXPANDIR ECOSSISTEMA/ }).click();
  const food99 = passportUi.locator('[data-partner-provider="99food"]');
  await food99.waitFor();
  if ((await food99.getAttribute("data-partner-state")) !== "available") throw new Error("99Food should start as partner activation, not fake live connection");
  await food99.getByText("Ativar pelo 360 · sem credenciais", { exact: true }).waitFor();
  await food99.click();
  await passportUi.getByText("99Food: ativação registrada. O restaurante não precisa configurar credenciais.", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-partner-provider="99food"]')?.getAttribute('data-partner-state') === 'requested');

  if (!partnerPost || partnerPost.source !== "integration_passport_v65") throw new Error(`partner activation was not persisted through orchestrator: ${JSON.stringify(partnerPost)}`);
  await food99.getByText("Ativação registrada pelo 360", { exact: true }).waitFor();

  await page.screenshot({ path: "/tmp/cozinha360-integration-passport-v65.png", fullPage: true });
  console.log("integration passport v6.5 derives real proof states and persists partner activation without restaurant secrets");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-integration-passport-v65-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
