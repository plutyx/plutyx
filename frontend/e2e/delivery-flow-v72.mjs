import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const now = Date.now();
const at = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
let mutations = 0;

const overview = {
  version: "4.1.0",
  business: { id: 1, name: "Delivery Fluxo v7.2", city: "Mogi das Cruzes", currency: "BRL" },
  summary: { open_orders: 5, delayed_orders: 1, paid_orders: 4, revenue_cents: 15400, contribution_cents: 6200, available_drivers: 1, active_zones: 1, scheduled_deliveries: 0, in_transit: 1, overdue_deliveries: 0, open_routes: 1 },
  plan: { key: "professional", status: "active", brand_limit: 3, driver_limit: 5, route_quota: 50 },
  plan_catalog: [],
  settings: { scheduled_orders_enabled: true, auto_accept_direct_orders: false, route_provider: "manual", route_optimization_enabled: false, customer_tracking_enabled: false, whatsapp_status_updates: false, brand_crm_isolation: true, prep_target_min: 25, default_eta_min: 45, sla_warning_minutes: 10, max_scheduled_days: 7 },
  brands: [{ id: 1, name: "Brasa 360", slug: "brasa-360", active: true, primary_channel: "direct", sort_order: 0 }],
  brand_stats: [{ brand_id: 1, orders: 6, open_orders: 5, revenue_cents: 15400, contribution_cents: 6200 }],
  channels: [
    { id: 1, name: "WhatsApp", fee_bps: 0, fixed_fee_cents: 0, delivery_cents: 0, promo_cents: 0, media_cents: 0, traffic_active: true },
    { id: 2, name: "iFood", fee_bps: 1200, fixed_fee_cents: 0, delivery_cents: 0, promo_cents: 0, media_cents: 0, traffic_active: true },
    { id: 3, name: "Canal próprio", fee_bps: 0, fixed_fee_cents: 0, delivery_cents: 0, promo_cents: 0, media_cents: 0, traffic_active: true },
  ],
  orders: [
    { id: 101, brand_id: 1, channel_id: 1, customer_id: 1, status: "new", source: "whatsapp", total_cents: 2100, contribution_cents: 900, paid: false, delayed: false, error_flag: false, version: 1, created_at: at(2), brand: { id: 1, name: "Brasa 360" }, channel: { id: 1, name: "WhatsApp" }, customer: { id: 1, name: "Ana" }, delivery: null, items: [] },
    { id: 102, brand_id: 1, channel_id: 2, customer_id: 2, status: "production", source: "ifood", total_cents: 3200, contribution_cents: 1100, paid: true, delayed: true, error_flag: false, version: 1, created_at: at(18), brand: { id: 1, name: "Brasa 360" }, channel: { id: 2, name: "iFood" }, customer: { id: 2, name: "Beto" }, delivery: null, items: [] },
    { id: 103, brand_id: 1, channel_id: 3, customer_id: 3, status: "checking", source: "direct_store", total_cents: 2500, contribution_cents: 1000, paid: true, delayed: false, error_flag: false, version: 1, created_at: at(13), brand: { id: 1, name: "Brasa 360" }, channel: { id: 3, name: "Canal próprio" }, customer: { id: 3, name: "Clara" }, delivery: null, items: [] },
    { id: 104, brand_id: 1, channel_id: 1, customer_id: 4, status: "awaiting_delivery", source: "whatsapp", total_cents: 2700, contribution_cents: 1000, paid: true, delayed: false, error_flag: false, version: 1, created_at: at(28), brand: { id: 1, name: "Brasa 360" }, channel: { id: 1, name: "WhatsApp" }, customer: { id: 4, name: "Dani" }, delivery: { id: 204, order_id: 104, driver_id: 1, zone_id: 1, status: "assigned", fee_cents: 500, driver_payout_cents: 350, version: 1, promised_at: null }, items: [] },
    { id: 105, brand_id: 1, channel_id: 3, customer_id: 5, status: "awaiting_delivery", source: "direct_store", total_cents: 2300, contribution_cents: 900, paid: true, delayed: false, error_flag: false, version: 1, created_at: at(35), brand: { id: 1, name: "Brasa 360" }, channel: { id: 3, name: "Canal próprio" }, customer: { id: 5, name: "Eva" }, delivery: { id: 205, order_id: 105, driver_id: 1, zone_id: 1, status: "picked_up", fee_cents: 500, driver_payout_cents: 350, version: 1, promised_at: null }, items: [] },
    { id: 106, brand_id: 1, channel_id: 2, customer_id: 6, status: "completed", source: "ifood", total_cents: 2600, contribution_cents: 1300, paid: true, delayed: false, error_flag: false, version: 1, created_at: at(48), brand: { id: 1, name: "Brasa 360" }, channel: { id: 2, name: "iFood" }, customer: { id: 6, name: "Fê" }, delivery: { id: 206, order_id: 106, driver_id: 1, zone_id: 1, status: "delivered", fee_cents: 500, driver_payout_cents: 350, version: 1, promised_at: null }, items: [] },
  ],
  zones: [{ id: 1, brand_id: null, name: "Centro", zone_type: "neighborhood", match_value: "Centro", fee_cents: 500, min_order_cents: 0, eta_min: 35, active: true, version: 1 }],
  drivers: [{ id: 1, name: "Rider", phone: "11999999999", vehicle: "moto", status: "available", active: true, version: 1 }],
  deliveries: [
    { id: 204, order_id: 104, driver_id: 1, zone_id: 1, status: "assigned", fee_cents: 500, driver_payout_cents: 350, version: 1, promised_at: null },
    { id: 205, order_id: 105, driver_id: 1, zone_id: 1, status: "picked_up", fee_cents: 500, driver_payout_cents: 350, version: 1, promised_at: null },
    { id: 206, order_id: 106, driver_id: 1, zone_id: 1, status: "delivered", fee_cents: 500, driver_payout_cents: 350, version: 1, promised_at: null },
  ],
  loyalty: { mode: "off", points_per_real: 1, cashback_bps: 0, redeem_threshold: 0, active: false },
  promos: [],
  storefronts: [{ id: 1, brand_id: 1, slug: "brasa-360", display_name: "Brasa 360", active: true }],
  connections: [
    { id: 1, provider: "whatsapp", display_name: "WhatsApp Brasa", status: "active", mode: "oauth", last_success_at: at(1), last_error: null },
    { id: 2, provider: "ifood", display_name: "iFood Brasa", status: "active", mode: "device_code", last_success_at: at(1), last_error: null },
  ],
  customer_brand_profiles: [],
  routes: [],
  driver_ledger_summary: [{ driver_id: 1, name: "Rider", balance_cents: 350 }],
};

await page.addInitScript(() => {
  localStorage.setItem("c360_token", "delivery-flow-v72-token");
  sessionStorage.setItem("c360-cycle-v61-open", "0");
});
await page.route("**/api/me", (route) => route.fulfill(json({ user: { id: 1, email: "delivery@example.com", full_name: "Operador" }, businesses: [{ id: 1, name: "Delivery Fluxo v7.2", city: "Mogi das Cruzes", role: "owner", preferences: {} }] })));
await page.route("**/api/businesses/1/orders", (route) => route.fulfill(json(overview.orders)));
await page.route("**/api/businesses/1/kds", (route) => route.fulfill(json({ orders: overview.orders.filter((x) => ["production", "checking"].includes(x.status)).map((x) => ({ ...x, age_minutes: 12, items: [] })) })));
await page.route("**/api/businesses/1/inventory/alerts", (route) => route.fulfill(json([])));
await page.route("**/api/businesses/1/dashboard", (route) => route.fulfill(json({ pulse: { revenue_cents: 15400, contribution_cents: 6200, loss_cents: 0 }, open_orders: 5, delay_rate: 0.2, error_rate: 0, next_action: { code: "delivery", title: "Revisar pedido 102", severity: "high" } })));
await page.route("**/api/businesses/1/finance/summary?days=30", (route) => route.fulfill(json({ period_days: 30, revenue_cents: 15400, variable_costs_cents: 9200, contribution_cents: 6200, contribution_margin_bps: 4026, loss_cents: 0, purchases_landed_cents: 0, order_count: 6 })));
await page.route("**/cozinha360-delivery-v40/**", async (route) => {
  if (route.request().method() !== "GET") {
    mutations += 1;
    return route.fulfill(json({ detail: "visual flow must not mutate" }, 500));
  }
  return route.fulfill(json(overview));
});

try {
  await page.goto("http://127.0.0.1:5173/?delivery=1", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Controle a cozinha inteira/ }).waitFor({ timeout: 15000 });
  const flow = page.locator("[data-delivery-flow-v72]");
  await flow.waitFor({ state: "visible", timeout: 12000 });
  await flow.getByRole("heading", { name: "Um pedido. Uma linha.", exact: true }).waitFor();
  await flow.getByText("6/6", { exact: true }).waitFor();
  await flow.getByText("1 atenção", { exact: true }).waitFor();
  await flow.getByText("iFood", { exact: true }).first().waitFor();
  await flow.getByText("WhatsApp", { exact: true }).first().waitFor();
  await flow.getByText(/R\$\s*62,00/).waitFor();

  const expected = { entered: "#101", kitchen: "#102", checking: "#103", dispatch: "#104", route: "#105", done: "#106" };
  for (const [stage, orderId] of Object.entries(expected)) {
    const column = flow.locator(`[data-delivery-stage="${stage}"]`);
    await column.getByText(orderId, { exact: true }).waitFor();
  }
  const delayed = flow.locator('[data-delivery-stage="kitchen"] .df72-order').filter({ hasText: "#102" });
  if (!(await delayed.getAttribute("class"))?.includes("attention")) throw new Error("delayed iFood order did not become an attention card");
  await delayed.getByText("pago", { exact: true }).waitFor();
  await flow.locator('[data-delivery-stage="entered"] .df72-order').filter({ hasText: "#101" }).getByText("a receber", { exact: true }).waitFor();

  await delayed.click();
  const realRow = page.locator(".deliverym-order").filter({ hasText: "#102" });
  await realRow.waitFor();
  await page.waitForFunction(() => Boolean(document.querySelector('.deliverym-order[data-delivery-flow-focus="true"]')));
  if (mutations !== 0) throw new Error(`read-only delivery flow triggered ${mutations} mutation(s)`);

  await page.screenshot({ path: "/tmp/cozinha360-delivery-flow-v72.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.getByRole("heading", { name: /Controle a cozinha inteira/ }).waitFor({ timeout: 15000 });
  const mobileFlow = page.locator("[data-delivery-flow-v72]");
  await mobileFlow.waitFor({ state: "visible", timeout: 12000 });
  const box = await mobileFlow.boundingBox();
  if (!box || box.x < 0 || box.width > 390) throw new Error(`delivery flow v7.2 overflows mobile shell: ${JSON.stringify(box)}`);
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (pageOverflow) throw new Error("delivery flow v7.2 introduced horizontal page overflow");
  const pipeline = mobileFlow.locator(".df72-pipeline");
  const scrollable = await pipeline.evaluate((el) => el.scrollWidth > el.clientWidth);
  if (!scrollable) throw new Error("mobile delivery flow should scroll-snap internally across stages");
  await page.screenshot({ path: "/tmp/cozinha360-delivery-flow-v72-mobile.png", fullPage: true });

  console.log("delivery flow v7.2 maps real order/channel/payment/delivery states, focuses the real operational row, remains read-only and mobile-safe");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-delivery-flow-v72-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
