import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

await page.route("**/cozinha360-public-integrations-v58/capabilities", (route) =>
  route.fulfill(
    json({
      ok: true,
      version: "5.8.0",
      providers: [
        { id: "whatsapp", authorization: "Meta OAuth", platform_ready: false, state: "platform_setup_required", user_action: "none" },
        { id: "ifood", authorization: "iFood authorization", platform_ready: false, state: "platform_setup_required", user_action: "none" },
        { id: "mercadopago", authorization: "Mercado Pago OAuth", platform_ready: false, state: "platform_setup_required", user_action: "none" },
        { id: "google", authorization: "Google OAuth", platform_ready: false, state: "platform_setup_required", user_action: "none" },
        { id: "meta_ads", authorization: "Meta OAuth", platform_ready: false, state: "platform_setup_required", user_action: "none" },
      ],
    }),
  ),
);

await page.route("**/cozinha360-pagbank-v59/health", (route) =>
  route.fulfill(
    json({
      ok: true,
      service: "cozinha360-pagbank-v59",
      version: "5.9.0",
      readiness: {
        provider: "pagbank",
        platform_ready: true,
        state: "ready_to_authorize",
        authorization: "PagBank Connect Authorization",
        user_action: "authorize_account",
        configured: true,
        homologated: true,
      },
    }),
  ),
);

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });

  const orbit = page.locator("[data-ecosystem-expansion]");
  await orbit.getByText("ÓRBITAS DE EXPANSÃO", { exact: true }).waitFor({ timeout: 15000 });
  await orbit.getByText("0/2", { exact: true }).waitFor();

  const pagbank = orbit.locator('[data-ecosystem-node="pagbank"]').first();
  await pagbank.click();
  const pagbankDetail = orbit.locator('[data-ecosystem-detail="pagbank"]');
  await pagbankDetail.getByText("PRONTO", { exact: true }).waitFor();
  await pagbankDetail.getByText("Adaptador v5.9 pronto para autorização", { exact: true }).waitFor();
  if (await pagbankDetail.getByRole("button", { name: /Conectar|Autorizar/ }).count()) {
    throw new Error("public expansion orbit must not authorize PagBank; real authorization belongs to authenticated hub");
  }

  await orbit.locator('[data-ecosystem-node="99food"]').first().click();
  const food99 = orbit.locator('[data-ecosystem-detail="99food"]');
  await food99.getByText("PARCEIRO", { exact: true }).waitFor();
  await food99.getByText("CAMINHO OFICIAL", { exact: true }).waitFor();
  for (const step of ["Certificação", "App de teste", "Depuração", "Aceitação", "Autorização", "Produção"]) {
    await food99.getByText(step, { exact: true }).waitFor();
  }
  if (await food99.getByRole("button", { name: /Conectar/ }).count()) {
    throw new Error("99Food must not expose a fake connect CTA before technical partnership");
  }
  await food99.locator('[data-ecosystem-priority="99food"]').click();
  await orbit.getByText("1/2", { exact: true }).waitFor();

  await orbit.locator('[data-ecosystem-node="keeta"]').first().click();
  const keeta = orbit.locator('[data-ecosystem-detail="keeta"]');
  await keeta.getByText("PARCEIRO", { exact: true }).waitFor();
  await keeta.getByText("API existe. Credencial ainda não.", { exact: true }).waitFor();
  if (await keeta.getByRole("button", { name: /Conectar/ }).count()) {
    throw new Error("Keeta must not expose a fake connect CTA before partner access");
  }
  await keeta.locator('[data-ecosystem-priority="keeta"]').click();
  await orbit.getByText("2/2", { exact: true }).waitFor();

  const state = await page.evaluate(() => ({
    interest: JSON.parse(localStorage.getItem("c360_ecosystem_interest") || "null"),
    explicitIntent: JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null"),
  }));
  if (state.interest?.providers?.join(",") !== "99food,keeta") {
    throw new Error(`partner interest did not preserve explicit order: ${JSON.stringify(state.interest)}`);
  }
  if (state.explicitIntent?.providers?.includes("99food") || state.explicitIntent?.providers?.includes("keeta")) {
    throw new Error("future partner interest leaked into executable connection intent");
  }

  await page.screenshot({ path: "/tmp/cozinha360-ecosystem-expansion.png", fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  const restored = page.locator("[data-ecosystem-expansion]");
  await restored.getByText("2/2", { exact: true }).waitFor({ timeout: 15000 });

  console.log("ecosystem expansion orbit keeps partner interest separate from executable integrations");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-ecosystem-expansion-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
