import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.route("**/cozinha360-public-integrations-v58/capabilities", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      version: "5.8.0",
      providers: [
        { id: "whatsapp", authorization: "Meta OAuth", platform_ready: false, state: "platform_setup_required", user_action: "none" },
        { id: "ifood", authorization: "iFood distributed authorization", platform_ready: true, state: "ready_to_authorize", user_action: "authorize_account" },
        { id: "mercadopago", authorization: "Mercado Pago OAuth + PKCE", platform_ready: false, state: "platform_setup_required", user_action: "none" },
        { id: "google", authorization: "Google OAuth 2.0", platform_ready: false, state: "platform_setup_required", user_action: "none" },
        { id: "meta_ads", authorization: "Meta OAuth", platform_ready: false, state: "platform_setup_required", user_action: "none" },
      ],
      ready_count: 1,
      total_count: 5,
      secrets_exposed: false,
    }),
  }),
);

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });

  const lab = page.locator('[data-operational-playground-host]');
  await lab.getByRole("button", { name: /Venda sem sobra/ }).click();

  const galaxy = page.locator("[data-plug-play-galaxy-host]");
  await galaxy
    .getByRole("heading", { name: "Sua rota acende só o que precisa.", exact: true })
    .waitFor({ timeout: 15000 });

  const readiness = galaxy.locator("[data-galaxy-readiness-coach]");
  await readiness.getByText("REALIDADE DA PLATAFORMA", { exact: true }).waitFor();
  await readiness.getByText("1/5 autorizáveis agora", { exact: true }).waitFor();
  await readiness.locator('[data-readiness-provider="ifood"]').getByText("AUTORIZAR", { exact: true }).waitFor();
  await readiness.locator('[data-readiness-provider="mercadopago"]').getByText("PLATAFORMA", { exact: true }).waitFor();

  const desktopIfood = galaxy.locator('button[title="iFood"]');
  await desktopIfood.waitFor();
  if ((await desktopIfood.getAttribute("data-platform-ready")) !== "true") {
    throw new Error("iFood galaxy node did not receive real readiness state");
  }
  const desktopMercado = galaxy.locator('button[title="Mercado Pago"]');
  if ((await desktopMercado.getAttribute("data-platform-ready")) !== "false") {
    throw new Error("Mercado Pago galaxy node did not receive platform-wait state");
  }

  // The readiness belt may guide the user back to the node, but it must only explore.
  await readiness.locator('[data-readiness-provider="ifood"]').click();
  await galaxy.locator("aside").getByText("iFood", { exact: true }).waitFor();

  const mercadoNode = galaxy.getByRole("button", { name: /Mercado Pago/ }).first();
  await mercadoNode.click();
  await galaxy.locator("aside").getByText("SUGERIDA", { exact: true }).waitFor();
  await galaxy
    .getByRole("button", { name: /Adicionar à minha rota/ })
    .click();

  const ifoodNode = galaxy.getByRole("button", { name: /iFood/ }).first();
  await ifoodNode.click();
  await galaxy.locator("aside").getByText("SUGERIDA", { exact: true }).waitFor();
  await galaxy
    .getByRole("button", { name: /Adicionar à minha rota/ })
    .click();

  const state = await page.evaluate(() => ({
    intent: JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null"),
    readiness: JSON.parse(localStorage.getItem("c360_public_capabilities_snapshot") || "null"),
  }));
  const intent = state.intent;
  if (!intent || intent.signal !== "margin") {
    throw new Error(`unexpected discovery signal: ${JSON.stringify(intent)}`);
  }
  if (!intent.providers?.includes("mercadopago") || !intent.providers?.includes("ifood")) {
    throw new Error(`connection intent did not persist explicit choices: ${JSON.stringify(intent)}`);
  }
  if (intent.providers?.includes("google") || intent.providers?.includes("whatsapp")) {
    throw new Error(`galaxy persisted a provider the user did not choose: ${JSON.stringify(intent)}`);
  }
  if (state.readiness?.providers?.find((item) => item.id === "ifood")?.platform_ready !== true) {
    throw new Error(`sanitized capability snapshot missing: ${JSON.stringify(state.readiness)}`);
  }
  if (JSON.stringify(state.readiness).toLowerCase().includes("secret") || JSON.stringify(state.readiness).toLowerCase().includes("token")) {
    throw new Error("public readiness snapshot must not contain secrets or tokens");
  }

  await page.screenshot({
    path: "/tmp/cozinha360-discovery-galaxy.png",
    fullPage: false,
  });

  await page.reload({ waitUntil: "networkidle" });
  const restoredGalaxy = page.locator("[data-plug-play-galaxy-host]");
  await restoredGalaxy
    .getByRole("heading", { name: "Sua rota acende só o que precisa.", exact: true })
    .waitFor({ timeout: 15000 });
  await restoredGalaxy.getByText("2/5", { exact: true }).waitFor();

  // Persistence belongs to the constellation, while the detail panel intentionally
  // reopens on its default node. Re-select the provider, then assert the stateful CTA.
  await restoredGalaxy.getByRole("button", { name: /Mercado Pago/ }).first().click();
  await restoredGalaxy.locator("aside").getByRole("button", { name: /Remover da minha rota/ }).waitFor();

  const restoredIntent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null"),
  );
  if (!restoredIntent?.providers?.includes("mercadopago") || !restoredIntent?.providers?.includes("ifood")) {
    throw new Error(`connection intent was not restored after reload: ${JSON.stringify(restoredIntent)}`);
  }

  console.log("discovery galaxy + real readiness + explicit intent persistence ok");
} catch (error) {
  await page
    .screenshot({ path: "/tmp/cozinha360-discovery-galaxy-failure.png", fullPage: true })
    .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
