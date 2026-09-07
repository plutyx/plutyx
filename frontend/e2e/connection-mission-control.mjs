import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

await page.addInitScript(() => {
  localStorage.setItem("c360_token", "browser-test-token");
  localStorage.setItem(
    "c360_ecosystem_interest",
    JSON.stringify({ providers: ["99food"], updated_at: new Date().toISOString() }),
  );
});

await page.route("**/api/me", (route) =>
  route.fulfill(
    json({
      user: { id: 1, email: "cliente@example.com", full_name: "Cliente" },
      businesses: [{ id: 1, name: "Cozinha Cliente", city: "Mogi das Cruzes", role: "owner", preferences: {} }],
    }),
  ),
);
await page.route("**/api/businesses/1/memory", (route) => route.fulfill(json({ business_id: 1, states: {} })));

const profile = {
  business_id: 1,
  order_source: "whatsapp",
  use_mercadopago: false,
  use_google: true,
  use_meta_ads: false,
  configured_at: new Date().toISOString(),
  updated_by_user_id: 1,
};
await page.route("**/cozinha360-profile-v31/**", (route) =>
  route.fulfill(json({ profile, recommended_order: ["whatsapp", "google"], internal_order_ready: false })),
);

const provider = (key, name, category, platformReady, status = null, operational = false) => ({
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
  connection: status
    ? {
        id: key.length,
        provider: key,
        external_account_ref: `${key}-account`,
        display_name: `${name} Conta`,
        status,
        last_success_at: status === "active" ? new Date().toISOString() : null,
        last_error: status === "degraded" ? "Autorização expirada" : null,
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
        recommended_order: ["whatsapp", "google"],
        providers: [
          provider("whatsapp", "WhatsApp Business", "Vendas & CRM", true, "active", true),
          provider("mercadopago", "Mercado Pago / Pix", "Pagamentos", false),
          provider("google", "Google Business + Ads", "Aquisição local", true, "degraded", false),
          provider("ifood", "iFood", "Marketplace", true),
          provider("meta_ads", "Meta Ads", "Aquisição", false),
        ],
      }),
    );
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
});

await page.route("**/cozinha360-pagbank-v59/businesses/1/status", (route) =>
  route.fulfill(
    json({
      ok: true,
      version: "5.9.0",
      readiness: { platform_ready: true, state: "ready_to_authorize", authorization: "PagBank Connect Authorization", environment: "production", homologated: true },
      connection: { provider: "pagbank", status: "active", display_name: "Conta PagBank", external_account_ref: "PB-1", last_success_at: new Date().toISOString(), last_error: null },
    }),
  ),
);

try {
  await page.goto("http://127.0.0.1:5173/?connections=1", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Conecte sua operação, não APIs.", exact: true }).waitFor({ timeout: 15000 });

  const operatorExperience = page.locator('[data-operator-experience="v6.0"]');
  await operatorExperience.waitFor({ state: "attached", timeout: 10000 });
  const operatorState = await page.evaluate(() => document.documentElement.dataset.c360Operator);
  if (operatorState !== "1") throw new Error("operator experience v6.0 was not activated for authenticated app");

  const mission = page.locator("[data-connection-mission-control]");
  await mission.getByText("MISSION CONTROL", { exact: true }).waitFor({ timeout: 10000 });
  await mission.getByText("2 ATIVAS", { exact: true }).waitFor();
  await mission.getByText("2 AÇÕES", { exact: true }).waitFor();

  const whatsapp = mission.locator('[data-mission-node="whatsapp"]');
  await whatsapp.getByText("ATIVO", { exact: true }).waitFor();
  const ifood = mission.locator('[data-mission-node="ifood"]');
  await ifood.getByText("AUTORIZAR", { exact: true }).waitFor();
  const google = mission.locator('[data-mission-node="google"]');
  await google.getByText("REVISAR", { exact: true }).waitFor();
  const mp = mission.locator('[data-mission-node="mercadopago"]');
  await mp.getByText("PLATAFORMA", { exact: true }).waitFor();
  const pagbank = mission.locator('[data-mission-node="pagbank"]');
  await pagbank.getByText("ATIVO", { exact: true }).waitFor();
  const future = mission.locator('[data-mission-node="99food"]');
  await future.getByText("PRIORIDADE", { exact: true }).waitFor();

  await ifood.click();
  const ifoodCard = page.locator(".cx-card").filter({ has: page.getByRole("heading", { name: "iFood", exact: true }) });
  await ifoodCard.waitFor();
  await page.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll(".cx-card"));
    const card = cards.find((element) => element.querySelector("h2")?.textContent?.trim() === "iFood");
    if (!card) return false;
    const top = card.getBoundingClientRect().top;
    return top >= -200 && top <= 1100;
  }, undefined, { timeout: 2500 });

  await mission.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-connection-mission-control]');
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
  const beforeFuture = await page.evaluate(() => window.scrollY);
  await future.click();
  await page.waitForTimeout(160);
  const afterFuture = await page.evaluate(() => window.scrollY);
  if (Math.abs(afterFuture - beforeFuture) > 40) {
    throw new Error("future partner priority attempted to navigate to an executable connector card");
  }
  await mission.getByText("Prioridade descoberta na home.", { exact: false }).waitFor();

  const local = await page.evaluate(() => ({
    interest: JSON.parse(localStorage.getItem("c360_ecosystem_interest") || "null"),
    intent: JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null"),
  }));
  if (local.interest?.providers?.join(",") !== "99food") throw new Error("future priority was mutated by Mission Control");
  if (local.intent?.providers?.includes("99food")) throw new Error("future priority leaked into executable connection intent");

  await page.screenshot({ path: "/tmp/cozinha360-connection-mission-control.png", fullPage: true });
  console.log("Mission Control + operator experience v6.0 map live/ready/degraded/platform/future states without auto-authorization");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-connection-mission-control-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
