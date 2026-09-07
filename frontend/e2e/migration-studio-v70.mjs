import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const migrationKey = "tk_test_browser_e2e_migration_key";
let connected = false;
let connectBody = null;
const applyBodies = [];

await page.addInitScript(() => {
  localStorage.setItem("c360_token", "browser-test-token");
  sessionStorage.setItem("c360-cycle-v61-open", "0");
});

await page.route("**/api/me", (route) => route.fulfill(json({
  user: { id: 1, email: "migration@example.com", full_name: "Migração E2E" },
  businesses: [{ id: 1, name: "Cozinha Migrada", city: "Mogi das Cruzes", role: "owner", preferences: {} }],
})));
await page.route("**/api/businesses/1/memory", (route) => route.fulfill(json({ business_id: 1, states: {} })));
await page.route("**/api/businesses/1/orders", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/kds", (route) => route.fulfill(json({ orders: [] })));
await page.route("**/api/businesses/1/dashboard", (route) => route.fulfill(json({ pulse: { revenue_cents: 0, contribution_cents: 0, loss_cents: 0 }, open_orders: 0, delay_rate: 0, error_rate: 0, next_action: null })));
await page.route("**/api/businesses/1/inventory/alerts", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/finance/summary?days=30", (route) => route.fulfill(json({ period_days: 30, revenue_cents: 0, variable_costs_cents: 0, contribution_cents: 0, contribution_margin_bps: 0, loss_cents: 0, purchases_landed_cents: 0, order_count: 0 })));

const profile = { business_id: 1, order_source: "direct", use_mercadopago: false, use_google: false, use_meta_ads: false, configured_at: new Date().toISOString(), updated_by_user_id: 1 };
await page.route("**/cozinha360-profile-v31/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/profile")) return route.fulfill(json({ profile, recommended_order: [], internal_order_ready: true }));
  return route.fulfill(json({ detail: "profile mock route not found" }, 404));
});

const provider = (key, name) => ({ key, name, category: "Operação", impact: "Impacto.", why: "Autorização oficial.", mode: "oauth", eta: "~2 min", platform_ready: true, missing: [], optional_missing: [], connection: null, operational: false, asset_count: 0, selection_required: false, assets: [], selected_asset: null });
await page.route("**/cozinha360-integrations-v29/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/integrations")) return route.fulfill(json({ business_id: 1, recommended_order: [], providers: [provider("whatsapp", "WhatsApp Business"), provider("ifood", "iFood"), provider("mercadopago", "Mercado Pago / Pix"), provider("google", "Google Business + Ads"), provider("meta_ads", "Meta Ads")] }));
  return route.fulfill(json({ detail: "integration mock route not found" }, 404));
});
await page.route("**/cozinha360-pagbank-v59/businesses/1/status", (route) => route.fulfill(json({ ok: true, readiness: { platform_ready: true, state: "ready_to_authorize" }, connection: null })));

const passport = () => ({
  ok: true,
  version: "6.5.0",
  business_id: 1,
  generated_at: new Date().toISOString(),
  summary: { native_total: 6, healthy: 0, attention: 0, ready: 5, platform_setup: 1, evidence_score: 0, evidence_max: 18, progress_percent: 0 },
  native: [
    { key: "whatsapp", name: "WhatsApp Business", category: "Pedidos", capability: "Pedidos", mode: "oauth", eta: "~2 min", platform_ready: true, state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null },
    { key: "ifood", name: "iFood", category: "Marketplace", capability: "Pedidos", mode: "device_code", eta: "~3 min", platform_ready: true, state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null },
    { key: "mercadopago", name: "Mercado Pago", category: "Pagamento", capability: "Pix", mode: "oauth", eta: "~1 min", platform_ready: false, state: "platform_setup", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null },
    { key: "pagbank", name: "PagBank", category: "Pagamento", capability: "Pix", mode: "oauth", eta: "~2 min", platform_ready: true, state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null },
    { key: "google", name: "Google Business", category: "Descoberta", capability: "Perfil", mode: "oauth", eta: "~2 min", platform_ready: true, state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null },
    { key: "meta_ads", name: "Meta Ads", category: "Aquisição", capability: "Ads", mode: "oauth", eta: "~2 min", platform_ready: true, state: "ready", score: 0, evidence: { authorization: false, account_linked: false, health: false }, connection: null },
  ],
  partners: [],
});
await page.route("**/cozinha360-connect-orchestrator-v65/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/passport")) return route.fulfill(json(passport()));
  return route.fulfill(json({ detail: "orchestrator mock route not found" }, 404));
});

const preview = {
  ok: true,
  resources: {
    products: { available: true, count: 12, conflicts: 2, error: null },
    inputs: { available: true, count: 8, conflicts: 1, review_required: 1, error: null },
    customers: { available: true, count: 34, conflicts: 3, error: null, consent_policy: "reset_false" },
  },
  samples: {
    products: [{ name: "Smash Clássico", category: "Burgers" }, { name: "Batata P", category: "Acompanhamentos" }],
    inputs: [{ name: "Carne", unit: "kg", quantity: "5" }, { name: "Pão", unit: "un", quantity: "NaN", needs_review: true }],
    customers: [{ name: "Cliente A", visits: 4, favorite_product: "Smash Clássico" }, { name: "Cliente B", visits: 2, favorite_product: "Batata P" }],
  },
  warnings: ["Produtos são importados como cadastro base; preços por canal permanecem para revisão no Cozinha 360.", "Clientes importados começam sem consentimento de marketing.", "Campos não equivalentes não são inventados nem sobrescritos.", "1 insumo(s) possuem número legado inválido e ficarão para revisão em vez de virar zero."],
};

await page.route("**/cozinha360-migration-v70/**", async (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  if (req.method() === "GET" && path.endsWith("/businesses/1/takeat/status")) {
    return route.fulfill(json({ ok: true, version: "7.0.1", provider: "takeat_import", connection: connected ? { provider: "takeat_import", status: "active", display_name: "Takeat · importação", external_account_ref: null, last_success_at: new Date().toISOString(), last_error: null } : null, scopes: connected ? ["products:read", "inputs:read", "clube:read"] : [], auth: { current: "api_key_exchange", recommended_for_saas: "oauth_pkce", client_id_configured: false } }));
  }
  if (req.method() === "POST" && path.endsWith("/businesses/1/takeat/connect")) {
    connectBody = req.postDataJSON();
    connected = true;
    return route.fulfill(json({ ok: true, connection: { provider: "takeat_import", status: "active", display_name: "Takeat · importação", last_success_at: new Date().toISOString(), last_error: null }, scopes: ["products:read", "inputs:read", "clube:read"], api_key_stored: false, next: "preview" }));
  }
  if (req.method() === "POST" && path.endsWith("/businesses/1/takeat/preview")) return route.fulfill(json(preview));
  if (req.method() === "POST" && path.endsWith("/businesses/1/takeat/apply")) {
    const body = req.postDataJSON();
    applyBodies.push(body);
    return route.fulfill(json({ ok: true, result: { products: { created: body.products ? 10 : 0, skipped: body.products ? 2 : 0 }, inputs: { created: body.inputs ? 6 : 0, skipped: body.inputs ? 1 : 0, review: body.inputs ? 1 : 0 }, customers: { created: body.customers ? 31 : 0, skipped: body.customers ? 3 : 0, consent_reset: body.customers ? 31 : 0 } }, review_required: { product_channel_prices: Boolean(body.products), customer_marketing_consent: Boolean(body.customers), invalid_input_numbers: body.inputs ? 1 : 0, unknown_fields_not_imported: true } }));
  }
  if (req.method() === "DELETE" && path.endsWith("/businesses/1/takeat")) {
    connected = false;
    return route.fulfill(json({ ok: true, connection: { provider: "takeat_import", status: "inactive" }, local_tokens_removed: true, remote_revoke: { required: true, action: "revoke_api_key_in_takeat_ai_builders" } }));
  }
  return route.fulfill(json({ detail: `migration mock route not found: ${req.method()} ${path}` }, 404));
});

try {
  await page.goto("http://127.0.0.1:5173/?connections=1", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Conecte sua operação, não APIs.", exact: true }).waitFor({ timeout: 15000 });
  const studio = page.locator("[data-migration-studio-v70]");
  await studio.waitFor({ state: "visible", timeout: 12000 });
  await studio.getByRole("heading", { name: "Sua operação não começa do zero.", exact: true }).waitFor();
  await studio.getByText("CONECTAR", { exact: true }).waitFor();

  const keyInput = studio.getByLabel("Chave Takeat");
  await keyInput.fill(migrationKey);
  await studio.getByRole("button", { name: "Autorizar e ler minha operação", exact: true }).click();
  await studio.getByText("Leitura concluída. Nada foi gravado ainda.", { exact: true }).waitFor({ timeout: 10000 });
  if (!connectBody || connectBody.api_key !== migrationKey) throw new Error(`one-time Takeat key was not sent to connect endpoint: ${JSON.stringify(connectBody)}`);
  await keyInput.waitFor({ state: "detached", timeout: 5000 });
  if (await studio.getByLabel("Chave Takeat").count()) throw new Error("Takeat API key field remained in the DOM after authorization");
  const persistedSecrets = await page.evaluate(() => [...Object.entries(localStorage), ...Object.entries(sessionStorage)].map(([key, value]) => `${key}:${value}`).join("\n"));
  if (persistedSecrets.includes("tk_test_browser_e2e_migration_key")) throw new Error("Takeat API key leaked into browser storage");

  for (const [label, count] of [["Cardápio", "12"], ["Estoque", "8"], ["Relações", "34"]]) {
    const card = studio.locator(".migration70-resource").filter({ hasText: label });
    await card.getByText(count, { exact: true }).waitFor();
  }
  const products = studio.locator(".migration70-resource").filter({ hasText: "Cardápio" });
  const inputs = studio.locator(".migration70-resource").filter({ hasText: "Estoque" });
  const customers = studio.locator(".migration70-resource").filter({ hasText: "Relações" });
  if ((await products.getAttribute("aria-pressed")) !== "true") throw new Error("products should be selected by default");
  if ((await inputs.getAttribute("aria-pressed")) !== "true") throw new Error("inputs should be selected by default");
  if ((await customers.getAttribute("aria-pressed")) !== "false") throw new Error("customers must start unselected because marketing consent is not inherited");
  await customers.getByText("Desligado por padrão. Consentimento de marketing será reiniciado.", { exact: true }).waitFor();
  await studio.getByText("2", { exact: true }).first().waitFor();
  await studio.getByText("1", { exact: true }).first().waitFor();

  await studio.getByRole("button", { name: /Trazer para o Cozinha 360/ }).click();
  await studio.getByText("MIGRAÇÃO CONCLUÍDA", { exact: true }).waitFor();
  if (applyBodies.length !== 1 || applyBodies[0].products !== true || applyBodies[0].inputs !== true || applyBodies[0].customers !== false) {
    throw new Error(`default migration payload should exclude customers: ${JSON.stringify(applyBodies)}`);
  }

  await page.reload({ waitUntil: "networkidle" });
  const secondStudio = page.locator("[data-migration-studio-v70]");
  await secondStudio.waitFor({ state: "visible", timeout: 12000 });
  await secondStudio.getByRole("button", { name: "Ler agora", exact: true }).click();
  await secondStudio.getByText("Leitura concluída. Nada foi gravado ainda.", { exact: true }).waitFor();
  const secondCustomers = secondStudio.locator(".migration70-resource").filter({ hasText: "Relações" });
  if ((await secondCustomers.getAttribute("aria-pressed")) !== "false") throw new Error("customer import must reset to opt-in after reload");
  await secondCustomers.click();
  if ((await secondCustomers.getAttribute("aria-pressed")) !== "true") throw new Error("explicit customer migration choice did not activate");
  await secondStudio.getByRole("button", { name: /Trazer para o Cozinha 360/ }).click();
  await secondStudio.getByText("31 clientes criados.", { exact: false }).waitFor();
  if (applyBodies.length !== 2 || applyBodies[1].customers !== true) throw new Error(`explicit customer import was not sent: ${JSON.stringify(applyBodies)}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const mobile = page.locator("[data-migration-studio-v70]");
  await mobile.waitFor({ state: "visible", timeout: 12000 });
  const box = await mobile.boundingBox();
  if (!box || box.x < 0 || box.width > 390) throw new Error(`Migration Studio overflows mobile viewport: ${JSON.stringify(box)}`);

  await page.screenshot({ path: "/tmp/cozinha360-migration-studio-v70.png", fullPage: true });
  console.log("Migration Studio v7.0.1 keeps Takeat key ephemeral, previews first, surfaces invalid inputs, and requires explicit customer import consent reset");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-migration-studio-v70-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
