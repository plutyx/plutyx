import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
let paymentPosts = 0;
let postedPayload = null;
const taxId = "12345678909";
const token = "22222222-2222-4222-8222-222222222222";

const store = {
  storefront: { id: 10, slug: "pagbank-lab", display_name: "Cozinha PagBank Lab", brand_id: null, channel_id: 3 },
  business: { id: 5, name: "Cozinha PagBank Lab", city: "Mogi das Cruzes", currency: "BRL" },
  brand: null,
  products: [{ id: 202, name: "Shawarma Verde", category: "Wraps", brand_id: null, sale_price_cents: 3200 }],
  fulfillment: { pickup: true, delivery: false, scheduled_orders: false, max_scheduled_days: 7, customer_tracking: false },
};
const quote = {
  items: [{ product_id: 202, quantity: 1 }],
  fulfillment: "pickup",
  subtotal_cents: 3200,
  zone: null,
  base_delivery_fee_cents: 0,
  delivery_fee_cents: 0,
  discount_cents: 0,
  promo: null,
  total_cents: 3200,
  scheduled_for: null,
};

try {
  await page.route("**/cozinha360-direct-v17/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === "GET" && url.includes("/store/pagbank-lab")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(store) });
    }
    if (request.method() === "POST" && url.includes("/store/pagbank-lab/quote")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(quote) });
    }
    if (request.method() === "POST" && url.includes("/store/pagbank-lab")) {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 888, total_cents: 3200, subtotal_cents: 3200, delivery_fee_cents: 0, discount_cents: 0 }),
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "mock route missing" }) });
  });

  await page.route("**/cozinha360-checkout-payments-v57/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === "GET" && url.includes("/capability/5")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pix: {
            available: true,
            reason: "ready",
            provider: "pagbank",
            preferred: "pagbank",
            requires_tax_id: true,
            providers: [{ key: "pagbank", label: "PagBank", requires_tax_id: true, reason: "ready" }],
          },
        }),
      });
    }
    if (request.method() === "POST" && url.endsWith("/pix")) {
      paymentPosts += 1;
      postedPayload = request.postDataJSON();
      if (postedPayload.business_id !== 5 || postedPayload.order_id !== 888 || postedPayload.provider !== "pagbank" || postedPayload.payer_email !== "pagbank@example.com" || postedPayload.payer_tax_id !== taxId) {
        throw new Error(`unexpected PagBank Pix payload: ${JSON.stringify(postedPayload)}`);
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          provider: "pagbank",
          payment: {
            token,
            provider: "pagbank",
            status: "processing",
            status_detail: "WAITING",
            paid: false,
            amount_cents: 3200,
            qr_code: "00020101021226890014br.gov.bcb.pix.pagbank",
            qr_code_base64: null,
            ticket_url: null,
            expires_at: "2026-09-07T21:30:00Z",
          },
        }),
      });
    }
    if (request.method() === "GET" && url.includes(`/status/${token}`)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          payment: {
            token,
            provider: "pagbank",
            status: "processing",
            status_detail: "WAITING",
            paid: false,
            amount_cents: 3200,
            qr_code: "00020101021226890014br.gov.bcb.pix.pagbank",
            qr_code_base64: null,
            ticket_url: null,
            expires_at: "2026-09-07T21:30:00Z",
          },
        }),
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "mock payment route missing" }) });
  });

  await page.goto("http://127.0.0.1:5173/?loja=pagbank-lab", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Cozinha PagBank Lab", exact: true }).waitFor();
  await page.getByRole("button", { name: /Adicionar Shawarma Verde/ }).click();
  await page.getByLabel("Nome").fill("Cliente PagBank");
  await page.getByLabel("WhatsApp").fill("11977777777");
  await page.getByLabel("E-mail").fill("pagbank@example.com");
  await page.getByRole("button", { name: /Enviar pedido/ }).click();

  await page.getByText("Pedido #888 recebido", { exact: true }).waitFor();
  const pixCard = page.locator("[data-pix-checkout-experience]");
  await pixCard.waitFor();
  if ((await pixCard.getAttribute("data-pix-provider")) !== "pagbank") throw new Error("PagBank was not selected from live capability");
  await page.getByText("ROTA PIX PRONTA", { exact: true }).waitFor();
  await page.getByText("PagBank", { exact: true }).waitFor();
  await page.getByLabel("CPF ou CNPJ para este Pix").waitFor();
  await page.getByText("usado só para criar este Pix · não é salvo pelo Cozinha 360", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Gerar Pix", exact: true }).click();
  if (paymentPosts !== 0) throw new Error("PagBank Pix posted before required tax ID was provided");
  await page.getByLabel("CPF ou CNPJ para este Pix").fill(taxId);
  await page.getByRole("button", { name: "Gerar Pix", exact: true }).click();
  await page.getByText("Aguardando confirmação", { exact: true }).waitFor();
  await page.getByText("CONCILIANDO · PAGBANK", { exact: true }).waitFor();
  if (paymentPosts !== 1) throw new Error(`expected one PagBank Pix creation, got ${paymentPosts}`);

  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  const serializedStorage = JSON.stringify(storage);
  if (serializedStorage.includes(taxId)) throw new Error("payer tax ID leaked into browser storage");

  await page.screenshot({ path: "/tmp/cozinha360-pagbank-pix-checkout.png", fullPage: false });
  console.log("PagBank Pix route requires transient tax ID and keeps it out of browser storage");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-pagbank-pix-checkout-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
