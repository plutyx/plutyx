import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });

  const lab = page.locator('[data-operational-playground-host]');
  await lab.getByRole("button", { name: /Venda sem sobra/ }).click();

  const galaxy = page.locator("[data-plug-play-galaxy-host]");
  await galaxy
    .getByRole("heading", { name: "Sua rota acende só o que precisa.", exact: true })
    .waitFor({ timeout: 15000 });

  const mercadoNode = galaxy.getByRole("button", { name: /Mercado Pago/ });
  await mercadoNode.click();
  await galaxy.locator("aside").getByText("SUGERIDA", { exact: true }).waitFor();
  await galaxy
    .getByRole("button", { name: /Adicionar à minha rota/ })
    .click();

  const ifoodNode = galaxy.getByRole("button", { name: /iFood/ });
  await ifoodNode.click();
  await galaxy.locator("aside").getByText("SUGERIDA", { exact: true }).waitFor();
  await galaxy
    .getByRole("button", { name: /Adicionar à minha rota/ })
    .click();

  const intent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null"),
  );
  if (!intent || intent.signal !== "margin") {
    throw new Error(`unexpected discovery signal: ${JSON.stringify(intent)}`);
  }
  if (!intent.providers?.includes("mercadopago") || !intent.providers?.includes("ifood")) {
    throw new Error(`connection intent did not persist explicit choices: ${JSON.stringify(intent)}`);
  }
  if (intent.providers?.includes("google") || intent.providers?.includes("whatsapp")) {
    throw new Error(`galaxy persisted a provider the user did not choose: ${JSON.stringify(intent)}`);
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
  await restoredGalaxy.locator("aside").getByText("Mercado Pago", { exact: true }).waitFor();
  await restoredGalaxy.locator("aside").getByRole("button", { name: /Remover da minha rota/ }).waitFor();

  console.log("discovery connection galaxy + explicit intent persistence ok");
} catch (error) {
  await page
    .screenshot({ path: "/tmp/cozinha360-discovery-galaxy-failure.png", fullPage: true })
    .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
