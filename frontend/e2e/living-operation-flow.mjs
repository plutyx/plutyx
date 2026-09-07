import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.addInitScript(() => {
    localStorage.setItem(
      "c360_discovery_exploration",
      JSON.stringify({
        signals: ["margin"],
        last_signal: "margin",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );
    localStorage.setItem(
      "c360_discovery_connection_intent",
      JSON.stringify({
        providers: ["mercadopago"],
        signal: "margin",
        updated_at: new Date().toISOString(),
      }),
    );
  });

  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });

  const flow = page.locator("[data-living-operation-flow]");
  await flow.getByRole("heading", { name: "Veja sua operação respirar.", exact: true }).waitFor({ timeout: 15000 });
  await flow.getByText("1 CONEXÕES NA ROTA", { exact: true }).waitFor();
  await flow.getByText("Mercado Pago", { exact: true }).waitFor();

  if (await flow.getByText("WhatsApp", { exact: true }).count()) {
    throw new Error("living flow surfaced a provider the user did not choose");
  }

  for (const label of ["Entrada", "Pagamento", "Produção", "Entrega", "Retorno"]) {
    await flow.getByRole("button", { name: new RegExp(label) }).click();
  }

  await flow.getByText("5/5", { exact: true }).waitFor();
  await flow.getByText("CICLO VISÍVEL", { exact: true }).waitFor();

  const memory = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("c360_living_flow") || "null"),
  );
  if (!memory || memory.last_stage !== "retorno" || memory.visited?.length !== 5) {
    throw new Error(`living flow memory is incomplete: ${JSON.stringify(memory)}`);
  }

  await page.screenshot({
    path: "/tmp/cozinha360-living-operation-flow.png",
    fullPage: false,
  });

  console.log("living operation flow + explicit connection context ok");
} catch (error) {
  await page
    .screenshot({ path: "/tmp/cozinha360-living-operation-flow-failure.png", fullPage: true })
    .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
