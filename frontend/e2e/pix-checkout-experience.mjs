import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let paymentPosts = 0;
let statusGets = 0;

const store = {
  storefront: { id: 9, slug: "pix-lab", display_name: "Cozinha Pix Lab", brand_id: null, channel_id: 3 },
  business: { id: 4, name: "Cozinha Pix Lab", city: "Mogi das Cruzes", currency: "BRL" },
  brand: null,
  products: [{ id: 101, name: "Wrap da Casa", category: "Wraps", brand_id: null, sale_price_cents: 2500 }],
  fulfillment: { pickup: true, delivery: false, scheduled_orders: false, max_scheduled_days: 7, customer_tracking: false },
};
const quote = {
  items: [{ product_id: 101, quantity: 1 }],
  fulfillment: "pickup",
  subtotal_cents: 2500,
  zone: null,
  base_delivery_fee_cents: 0,
  delivery_fee_cents: 0,
  discount_cents: 0,
  promo: null,
  total_cents: 2500,
  scheduled_for: null,
};
const token = "11111111-1111-4111-8111-111111111111";

try {
  await page.route("**/cozinha360-direct-v17/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === "GET" && url.includes("/store/pix-lab")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(store) });
    }
    if (request.method() === "POST" && url.includes("/store/pix-lab/quote")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(quote) });
    }
    if (request.method() === "POST" && url.includes("/store/pix-lab")) {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 777, total_cents: 2500, subtotal_cents: 2500, delivery_fee_cents: 0, discount_cents: 0 }),
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "mock route missing" }) });
  });

  await page.route("**/cozinha360-checkout-payments-v57/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === "GET" && url.includes("/capability/4")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ pix: { available: true, reason: "ready" } }) });
    }
    if (request.method() === "POST" && url.endsWith("/pix")) {
      paymentPosts += 1;
      const payload = request.postDataJSON();
      if (payload.business_id !== 4 || payload.order_id !== 777 || !payload.client_order_key || payload.payer_email !== "cliente@example.com" || payload.provider !== "mercadopago") {
        throw new Error(`unexpected Pix payload: ${JSON.stringify(payload)}`);
      }
      if (payload.payer_tax_id) throw new Error("Mercado Pago route received PagBank tax ID field");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          provider: "mercadopago",
          payment: {
            token,
            provider: "mercadopago",
            status: "processing",
            status_detail: "pending_waiting_payment",
            paid: false,
            amount_cents: 2500,
            qr_code: "00020101021226890014br.gov.bcb.pix",
            qr_code_base64: null,
            ticket_url: null,
            expires_at: "2026-09-07T20:00:00Z",
          },
        }),
      });
    }
    if (request.method() === "GET" && url.includes(`/status/${token}`)) {
      statusGets += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          payment: {
            token,
            provider: "mercadopago",
            status: "processed",
            status_detail: "accredited",
            paid: true,
            amount_cents: 2500,
            qr_code: null,
            qr_code_base64: null,
            ticket_url: null,
            expires_at: "2026-09-07T20:00:00Z",
          },
        }),
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "mock payment route missing" }) });
  });

  await page.goto("http://127.0.0.1:5173/?loja=pix-lab", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Cozinha Pix Lab", exact: true }).waitFor();
  await page.getByRole("button", { name: /Adicionar Wrap da Casa/ }).click();
  await page.getByLabel("Nome").fill("Cliente Teste");
  await page.getByLabel("WhatsApp").fill("11999999999");
  await page.getByLabel("E-mail").fill("cliente@example.com");
  await page.getByRole("button", { name: /Enviar pedido/ }).click();

  await page.getByText("Pedido #777 recebido", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Finalize por Pix quando quiser.", exact: true }).waitFor();
  if (paymentPosts !== 0) throw new Error("Pix was created before explicit customer action");

  const pixCard = page.locator("[data-pix-checkout-experience]");
  if ((await pixCard.getAttribute("data-pix-provider")) !== "mercadopago") throw new Error("legacy Pix did not default to Mercado Pago");
  await page.getByRole("button", { name: "Gerar Pix", exact: true }).click();
  await page.getByText("Aguardando confirmação", { exact: true }).waitFor();
  if (paymentPosts !== 1) throw new Error(`expected one Pix creation, got ${paymentPosts}`);

  await page.getByText("Pix confirmado", { exact: true }).waitFor({ timeout: 10000 });
  if (statusGets < 1) throw new Error("Pix status was not refreshed while checkout was visible");

  await page.screenshot({ path: "/tmp/cozinha360-pix-checkout.png", fullPage: false });
  console.log("progressive Mercado Pago Pix checkout experience ok");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-pix-checkout-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
