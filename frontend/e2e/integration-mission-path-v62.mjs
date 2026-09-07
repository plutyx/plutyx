import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const today = new Date().toISOString();

await page.addInitScript(() => {
  localStorage.setItem("c360_token", "browser-test-token");
  sessionStorage.setItem("c360-cycle-v61-open", "0");
});

await page.route("**/api/me", (route) =>
  route.fulfill(
    json({
      user: { id: 1, email: "cliente@example.com", full_name: "Cliente" },
      businesses: [{ id: 1, name: "Cozinha Cliente", city: "Mogi das Cruzes", role: "owner", preferences: {} }],
    }),
  ),
);
await page.route("**/api/businesses/1/memory", (route) =>
  route.fulfill(json({ business_id: 1, states: {} })),
);
await page.route("**/api/businesses/1/orders", (route) =>
  route.fulfill(
    json([
      {
        id: 101,
        status: "production",
        source: "whatsapp",
        total_cents: 3200,
        contribution_cents: 1400,
        paid: true,
        delayed: false,
        inventory_consumed: true,
        created_at: today,
      },
    ]),
  ),
);
await page.route("**/api/businesses/1/kds", (route) =>
  route.fulfill(
    json({
      orders: [
        {
          id: 101,
          status: "production",
          source: "whatsapp",
          total_cents: 3200,
          age_minutes: 5,
          delayed: false,
          version: 1,
          items: [{ product_id: 1, name: "Wrap", quantity: 1 }],
        },
      ],
    }),
  ),
);
await page.route("**/api/businesses/1/dashboard", (route) =>
  route.fulfill(
    json({
      pulse: { revenue_cents: 3200, contribution_cents: 1400, loss_cents: 0 },
      open_orders: 1,
      delay_rate: 0,
      error_rate: 0,
      next_action: null,
    }),
  ),
);
await page.route("**/api/businesses/1/inventory/alerts", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/finance/summary?days=30", (route) =>
  route.fulfill(
    json({
      period_days: 30,
      revenue_cents: 3200,
      variable_costs_cents: 1800,
      contribution_cents: 1400,
      contribution_margin_bps: 4375,
      loss_cents: 0,
      purchases_landed_cents: 0,
      order_count: 1,
    }),
  ),
);

const provider = (key, name, status = null, operational = false) => ({
  key,
  name,
  category: "Operação",
  impact: "Impacto operacional.",
  why: "Autorização oficial.",
  mode: "oauth",
  eta: "~2 min",
  platform_ready: true,
  missing: [],
  optional_missing: [],
  connection: status
    ? {
        id: key.length,
        provider: key,
        external_account_ref: `${key}-account`,
        display_name: `${name} Conta`,
        status,
        last_success_at: new Date().toISOString(),
        last_error: null,
      }
    : null,
  operational,
  asset_count: 0,
  selection_required: false,
  assets: [],
  selected_asset: null,
});

await page.route("**/cozinha360-integrations-v29/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (route.request().method() === "GET" && path.endsWith("/businesses/1/integrations")) {
    return route.fulfill(
      json({
        business_id: 1,
        providers: [
          provider("whatsapp", "WhatsApp Business", "active", true),
          provider("ifood", "iFood"),
          provider("mercadopago", "Mercado Pago"),
          provider("google", "Google Business"),
          provider("meta_ads", "Meta Ads"),
        ],
        recommended_order: ["whatsapp"],
      }),
    );
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
});

await page.route("**/cozinha360-pagbank-v59/businesses/1/status", (route) =>
  route.fulfill(
    json({
      ok: true,
      connection: {
        provider: "pagbank",
        status: "active",
        display_name: "Conta PagBank",
        external_account_ref: "PB-1",
        last_success_at: new Date().toISOString(),
        last_error: null,
      },
    }),
  ),
);

try {
  await page.goto("http://127.0.0.1:5173/?connections=1", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Conecte sua operação, não APIs.", exact: true }).waitFor({ timeout: 15000 });

  const path = page.locator("[data-integration-mission-path-v62]");
  await path.waitFor({ state: "visible", timeout: 10000 });
  await path.getByText("5/5", { exact: true }).waitFor({ timeout: 10000 });
  await path.getByText("CICLO DE IMPLANTAÇÃO COMPLETO", { exact: true }).waitFor();

  for (const key of ["channel", "payment", "order", "kitchen", "margin"]) {
    const mission = path.locator(`[data-integration-mission="${key}"]`);
    await mission.waitFor();
    const state = await mission.getAttribute("data-mission-state");
    if (state !== "done") throw new Error(`integration mission ${key} did not derive real completion: ${state}`);
  }

  const resultSummary = path.getByRole("paragraph").filter({ hasText: /R\$\s*32,00 de receita/ });
  await resultSummary.waitFor();
  await resultSummary.filter({ hasText: /R\$\s*14,00 de contribuição/ }).waitFor();

  const cycle = page.locator("[data-operational-cycle-v61]");
  await cycle.getByRole("button", { name: "Abrir fluxo vivo da operação" }).waitFor();

  await page.screenshot({ path: "/tmp/cozinha360-integration-missions-v62.png", fullPage: true });
  console.log("plug-and-play integration missions derive 5/5 completion from real connection and operation contracts");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-integration-missions-v62-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
