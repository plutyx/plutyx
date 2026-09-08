import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
let integrationTestPosts = 0;
let healthPosts = 0;

await page.addInitScript(() => {
  localStorage.setItem("c360_token", "health-v73-browser-token");
  sessionStorage.setItem("c360-cycle-v61-open", "0");
});

await page.route("**/api/me", (route) => route.fulfill(json({
  user: { id: 1, email: "cliente@example.com", full_name: "Cliente" },
  businesses: [{ id: 1, name: "Cozinha Health", city: "Mogi das Cruzes", role: "owner", preferences: {} }],
})));
await page.route("**/api/businesses/1/memory", (route) => route.fulfill(json({ business_id: 1, states: {} })));
await page.route("**/api/businesses/1/orders", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/kds", (route) => route.fulfill(json({ orders: [] })));
await page.route("**/api/businesses/1/dashboard", (route) => route.fulfill(json({ pulse: { revenue_cents: 0, contribution_cents: 0, loss_cents: 0 }, open_orders: 0, delay_rate: 0, error_rate: 0, next_action: null })));
await page.route("**/api/businesses/1/inventory/alerts", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/finance/summary?days=30", (route) => route.fulfill(json({ period_days: 30, revenue_cents: 0, variable_costs_cents: 0, contribution_cents: 0, contribution_margin_bps: 0, loss_cents: 0, purchases_landed_cents: 0, order_count: 0 })));

const profile = { business_id: 1, order_source: "mixed", use_mercadopago: false, use_google: true, use_meta_ads: false, configured_at: new Date().toISOString(), updated_by_user_id: 1 };
await page.route("**/cozinha360-profile-v31/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/profile")) return route.fulfill(json({ profile, recommended_order: ["whatsapp", "ifood", "google"], internal_order_ready: false }));
  return route.fulfill(json({ detail: "profile mock route not found" }, 404));
});

const conn = (id, provider, name) => ({ id, provider, external_account_ref: `${provider}-account`, display_name: `${name} Conta`, status: "active", last_success_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), last_error: null, last_error_at: null });
const providers = [
  { key: "whatsapp", name: "WhatsApp Business", category: "Vendas & CRM", impact: "Pedidos e atendimento.", why: "OAuth oficial.", mode: "oauth", eta: "~2 min", platform_ready: true, missing: [], optional_missing: [], connection: conn(1, "whatsapp", "WhatsApp"), operational: true, asset_count: 1, selection_required: false },
  { key: "ifood", name: "iFood", category: "Marketplace", impact: "Pedidos iFood.", why: "Autorização oficial.", mode: "device_code", eta: "~3 min", platform_ready: true, missing: [], optional_missing: [], connection: conn(2, "ifood", "iFood"), operational: true, asset_count: 1, selection_required: false },
  { key: "mercadopago", name: "Mercado Pago / Pix", category: "Pagamentos", impact: "Pix.", why: "OAuth oficial.", mode: "oauth", eta: "~1 min", platform_ready: true, missing: [], optional_missing: [], connection: null, operational: false, asset_count: 0, selection_required: false },
  { key: "google", name: "Google Business", category: "Aquisição local", impact: "Google local.", why: "OAuth oficial.", mode: "oauth", eta: "~2 min", platform_ready: true, missing: [], optional_missing: [], connection: conn(3, "google", "Google"), operational: true, asset_count: 1, selection_required: false },
  { key: "meta_ads", name: "Meta Ads", category: "Aquisição", impact: "Campanhas.", why: "OAuth oficial.", mode: "oauth", eta: "~2 min", platform_ready: true, missing: [], optional_missing: [], connection: null, operational: false, asset_count: 0, selection_required: false },
];
await page.route("**/cozinha360-integrations-v29/**", (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  if (req.method() === "POST" && path.endsWith("/test")) {
    integrationTestPosts += 1;
    return route.fulfill(json({ detail: "browser must not auto-probe integrations" }, 500));
  }
  if (req.method() === "GET" && path.endsWith("/businesses/1/integrations")) return route.fulfill(json({ business_id: 1, recommended_order: ["whatsapp", "ifood", "google"], providers }));
  return route.fulfill(json({ detail: `integration mock route not found: ${req.method()} ${path}` }, 404));
});

await page.route("**/cozinha360-pagbank-v59/businesses/1/status", (route) => route.fulfill(json({ ok: true, readiness: { platform_ready: true, state: "ready_to_authorize" }, connection: null })));

const native = providers.map((p) => ({
  key: p.key,
  name: p.name.replace(" / Pix", ""),
  category: p.category,
  capability: p.impact,
  mode: p.mode,
  eta: p.eta,
  platform_ready: p.platform_ready,
  state: p.connection ? "stale" : "ready",
  score: p.connection ? 2 : 0,
  evidence: { authorization: Boolean(p.connection), account_linked: Boolean(p.connection), health: false },
  connection: p.connection,
}));
const partners = [
  { key: "99food", name: "99Food", category: "Marketplace", capability: "Expansão de marketplace", state: "available" },
  { key: "keeta", name: "Keeta", category: "Marketplace", capability: "Expansão de marketplace", state: "available" },
];
await page.route("**/cozinha360-connect-orchestrator-v65/**", (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/passport")) return route.fulfill(json({ ok: true, version: "6.5.0", business_id: 1, generated_at: new Date().toISOString(), summary: { native_total: 5, healthy: 0, attention: 3, ready: 2, platform_setup: 0, evidence_score: 6, evidence_max: 15, progress_percent: 40 }, native, partners, principles: { restaurant_secrets_required: false, platform_managed_credentials: true, proof_model: ["authorization", "account_linked", "health"] } }));
  return route.fulfill(json({ detail: "orchestrator mock route not found" }, 404));
});

await page.route("**/cozinha360-integration-health-v73/businesses/1/health", (route) => {
  if (route.request().method() !== "GET") healthPosts += 1;
  return route.fulfill(json({
    ok: true,
    version: "7.3.0",
    business_id: 1,
    generated_at: new Date().toISOString(),
    summary: { healthy: 1, degrading: 1, review: 0, recovered: 1, total: 3 },
    items: [
      { connection_id: 1, provider: "whatsapp", name: "WhatsApp Conta", connection_status: "active", state: "recovered", effective_state: "recovered", strategy: "probe", consecutive_failures: 0, last_checked_at: new Date().toISOString(), last_probe_ok_at: new Date().toISOString(), last_probe_error_at: null, last_probe_error: null, next_check_at: null, last_success_at: new Date().toISOString(), operational_error_at: null, operational_error_present: false, operational_error: null },
      { connection_id: 2, provider: "ifood", name: "iFood Conta", connection_status: "active", state: "healthy", effective_state: "healthy", strategy: "signal", consecutive_failures: 0, last_checked_at: new Date().toISOString(), last_probe_ok_at: new Date().toISOString(), last_probe_error_at: null, last_probe_error: null, next_check_at: null, last_success_at: new Date().toISOString(), operational_error_at: null, operational_error_present: false, operational_error: null },
      { connection_id: 3, provider: "google", name: "Google Conta", connection_status: "active", state: "degrading", effective_state: "degrading", strategy: "probe", consecutive_failures: 1, last_checked_at: new Date().toISOString(), last_probe_ok_at: null, last_probe_error_at: new Date().toISOString(), last_probe_error: "temporary probe failure", next_check_at: null, last_success_at: null, operational_error_at: null, operational_error_present: false, operational_error: null },
    ],
    principles: { server_side: true, ifood_passive_signal: true, operational_errors_preserved: true },
  }));
});

try {
  await page.goto("http://127.0.0.1:5173/?connections=1", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Conecte sua operação, não APIs.", exact: true }).waitFor({ timeout: 15000 });

  // v7.4 is a pure experience layer: visible, animated when allowed, but never owns business writes.
  await page.waitForFunction(() => document.documentElement.dataset.c360Experience === "v74");
  await page.locator(".x74-pulse-rail").waitFor({ state: "visible" });
  const orbit = page.locator("[data-connection-orbit-v74]").filter({ hasText: "CONSTELAÇÃO 360 · V7.4" });
  await orbit.waitFor({ state: "visible", timeout: 10000 });
  const orbitGoogle = orbit.locator('[data-orbit-provider="google"]');
  await orbitGoogle.waitFor();
  if ((await orbitGoogle.getAttribute("data-orbit-state")) !== "stale") throw new Error("connection orbit must derive Google stale state from the real Passport contract");
  await orbit.getByText("99Food", { exact: true }).waitFor();
  await orbit.getByText("Keeta", { exact: true }).waitFor();
  await orbit.getByRole("button", { name: "Fechar constelação" }).click();
  await page.getByRole("button", { name: /CONSTELAÇÃO/ }).click();
  await page.locator("[data-orbit-provider=\"ifood\"]").waitFor();

  const pulse = page.locator("[data-integration-health-v73]");
  await pulse.waitFor({ state: "visible", timeout: 10000 });
  await pulse.getByText("SAUDÁVEL", { exact: true }).waitFor();
  await pulse.locator('[data-health-summary="healthy"] b').getByText("1", { exact: true }).waitFor();
  await pulse.locator('[data-health-summary="degrading"] b').getByText("1", { exact: true }).waitFor();
  await pulse.locator('[data-health-summary="recovered"] b').getByText("1", { exact: true }).waitFor();
  await pulse.getByText(/iFood usa o polling existente/).waitFor();

  const passport = page.locator('[data-passport-provider="google"]');
  await passport.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-passport-provider="google"]')?.getAttribute('data-health-state') === 'degrading');
  await page.waitForFunction(() => document.querySelector('[data-passport-provider="ifood"]')?.getAttribute('data-health-state') === 'healthy');

  const mission = page.locator('[data-mission-node="google"]');
  await mission.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-mission-node="google"]')?.getAttribute('data-health-state') === 'degrading');

  // Mobile gate: visual overlays may not create horizontal overflow or erase the underlying controls.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (overflow.scroll > overflow.client) throw new Error(`v7.4 mobile horizontal overflow: ${JSON.stringify(overflow)}`);
  await page.getByRole("heading", { name: "Conecte sua operação, não APIs.", exact: true }).waitFor();

  await page.waitForTimeout(750);
  if (integrationTestPosts !== 0) throw new Error(`browser issued ${integrationTestPosts} automatic integration /test POST(s)`);
  if (healthPosts !== 0) throw new Error(`browser issued ${healthPosts} automatic health write(s)`);
  await page.screenshot({ path: "/tmp/cozinha360-integration-health-v73.png", fullPage: true });
  console.log("integration health v7.3 + experience v7.4 stay browser-read-only, preserve Passport/Mission Control truth and pass mobile overflow gate");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-integration-health-v73-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
