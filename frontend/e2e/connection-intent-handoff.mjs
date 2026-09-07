import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

await page.addInitScript(() => {
  localStorage.setItem("c360_token", "browser-test-token");
  localStorage.setItem(
    "c360_discovery_connection_intent",
    JSON.stringify({
      providers: ["ifood", "mercadopago"],
      signal: "margin",
      updated_at: new Date().toISOString(),
    }),
  );
});

await page.route("**/api/me", (route) =>
  route.fulfill(
    json({
      user: { id: 1, email: "cliente@example.com", full_name: "Cliente" },
      businesses: [
        { id: 1, name: "Cozinha Cliente", city: "Mogi das Cruzes", role: "owner", preferences: {} },
      ],
    }),
  ),
);
await page.route("**/api/businesses/1/memory", (route) =>
  route.fulfill(json({ business_id: 1, states: {} })),
);

let savedProfile = null;
let profile = {
  business_id: 1,
  order_source: "direct",
  use_mercadopago: false,
  use_google: false,
  use_meta_ads: false,
  configured_at: null,
  updated_by_user_id: null,
};

const recommended = () => [
  ...(profile.order_source === "whatsapp"
    ? ["whatsapp"]
    : profile.order_source === "ifood"
      ? ["ifood"]
      : profile.order_source === "mixed"
        ? ["whatsapp", "ifood"]
        : []),
  ...(profile.use_mercadopago ? ["mercadopago"] : []),
  ...(profile.use_google ? ["google"] : []),
  ...(profile.use_meta_ads ? ["meta_ads"] : []),
];

await page.route("**/cozinha360-profile-v31/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (!path.endsWith("/businesses/1/profile")) {
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  }
  if (request.method() === "GET") {
    return route.fulfill(
      json({ profile, recommended_order: recommended(), internal_order_ready: profile.order_source === "direct" }),
    );
  }
  if (request.method() === "PUT") {
    savedProfile = request.postDataJSON();
    profile = {
      ...profile,
      ...savedProfile,
      configured_at: new Date().toISOString(),
      updated_by_user_id: 1,
    };
    return route.fulfill(
      json({ profile, recommended_order: recommended(), internal_order_ready: profile.order_source === "direct" }),
    );
  }
  return route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
});

const provider = (key, name, category) => ({
  key,
  name,
  category,
  impact: "Impacto operacional.",
  why: "Autorização oficial.",
  mode: key === "ifood" ? "device_code" : "oauth",
  eta: "~2 min",
  platform_ready: true,
  missing: [],
  optional_missing: [],
  connection: null,
  operational: false,
  asset_count: 0,
  selection_required: false,
  assets: [],
  selected_asset: null,
});

await page.route("**/cozinha360-integrations-v29/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (request.method() === "GET" && path.endsWith("/businesses/1/integrations")) {
    return route.fulfill(
      json({
        business_id: 1,
        recommended_order: recommended(),
        providers: [
          provider("whatsapp", "WhatsApp Business", "Vendas & CRM"),
          provider("mercadopago", "Mercado Pago / Pix", "Pagamentos"),
          provider("google", "Google Business + Ads", "Aquisição local"),
          provider("ifood", "iFood", "Marketplace"),
          provider("meta_ads", "Meta Ads", "Aquisição"),
        ],
      }),
    );
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
});

try {
  await page.goto("http://127.0.0.1:5173/?connections=1", { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Conecte sua operação, não APIs.", exact: true })
    .waitFor({ timeout: 15000 });

  await page.getByText("Sua rota da exploração já veio com você.", { exact: true }).waitFor();

  if (!savedProfile) throw new Error("discovery intent was not applied to the connection profile");
  if (
    savedProfile.order_source !== "ifood" ||
    savedProfile.use_mercadopago !== true ||
    savedProfile.use_google !== false ||
    savedProfile.use_meta_ads !== false
  ) {
    throw new Error(`unexpected restored profile: ${JSON.stringify(savedProfile)}`);
  }

  await page.getByText("iFood", { exact: true }).first().waitFor();
  await page.getByText("Pix automático", { exact: true }).waitFor();
  if (await page.getByRole("heading", { name: "Como sua cozinha realmente vende?", exact: true }).count()) {
    throw new Error("setup wizard repeated questions already answered during discovery");
  }

  const applied = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("c360_discovery_connection_intent_applied") || "null"),
  );
  if (applied?.business_id !== 1 || !applied.providers?.includes("ifood")) {
    throw new Error(`handoff marker missing: ${JSON.stringify(applied)}`);
  }

  await page.screenshot({ path: "/tmp/cozinha360-connection-intent-handoff.png", fullPage: true });
  console.log("discovery intent -> real connection profile handoff ok");
} catch (error) {
  await page
    .screenshot({ path: "/tmp/cozinha360-connection-intent-handoff-failure.png", fullPage: true })
    .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
