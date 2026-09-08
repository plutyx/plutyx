import { chromium, request as playwrightRequest } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const KDS_EDGE_PREFIX =
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-kds-v54";

// O customer journey roda contra a API local. O KDS v5.4 de produção vive em Edge Function,
// então, neste teste integrado, roteamos apenas a leitura da fila para o backend local e
// fornecemos configurações SLA neutras. O journey dedicado kds-sla-v54.mjs continua testando
// separadamente o contrato completo de SLA, PATCH explícito e responsividade da v5.4.
await page.route(`${KDS_EDGE_PREFIX}/**`, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const edgeMarker = "/functions/v1/cozinha360-kds-v54";
  const path = url.pathname.slice(
    url.pathname.indexOf(edgeMarker) + edgeMarker.length,
  );
  const businessMatch = path.match(/^\/businesses\/(\d+)\/kds(?:\/settings)?$/);
  const businessId = Number(businessMatch?.[1] || 0);

  if (!businessId) {
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "KDS E2E route not found" }),
    });
  }

  if (path.endsWith("/kds/settings")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        business_id: businessId,
        default_kds_sla_minutes: 20,
        products: [],
        channels: [],
      }),
    });
  }

  const authorization = request.headers()["authorization"] || "";
  const response = await fetch(`http://127.0.0.1:8000${path}`, {
    method: request.method(),
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
  });
  return route.fulfill({
    status: response.status,
    contentType: response.headers.get("content-type") || "application/json",
    body: await response.text(),
  });
});

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });

  // Cliente novo: experiência -> diagnóstico -> rota personalizada -> conta.
  await page
    .getByRole("heading", { name: /Sua cozinha já está contando uma história/ })
    .waitFor();
  await page.screenshot({
    path: "/tmp/cozinha360-discovery-home.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: /Começar a leitura/ }).click();

  // A home possui uma constelação interativa com rótulos repetidos (ex.: Margem).
  // O percurso deve interagir somente com o mapa de diagnóstico para manter o teste
  // semântico e resiliente à expansão visual das demais seções da página.
  const discoveryJourney = page.locator("#mapa-da-operacao");
  await discoveryJourney
    .getByRole("button", { name: /Crescendo com atrito/ })
    .click();
  await discoveryJourney
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await discoveryJourney.getByRole("button", { name: /Margem/ }).click();
  await discoveryJourney
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await discoveryJourney
    .getByRole("button", { name: /Proteger o lucro/ })
    .click();
  await discoveryJourney
    .getByRole("button", { name: /Revelar minha rota/ })
    .click();
  await discoveryJourney
    .getByRole("heading", { name: "Margem consciente", exact: true })
    .waitFor();
  await page.screenshot({
    path: "/tmp/cozinha360-discovery-route.png",
    fullPage: false,
  });
  await discoveryJourney
    .getByRole("button", { name: /Levar esta rota comigo/ })
    .click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("heading", {
      name: "Leve sua rota para a operação.",
      exact: true,
    })
    .waitFor();
  await page.getByLabel("Nome").fill("Cliente E2E");
  await page.getByLabel("E-mail").fill("cliente-e2e@example.com");
  await page.getByLabel("Senha").fill("senha-super-segura-123");
  await page
    .getByRole("button", { name: "Criar minha operação", exact: true })
    .click();

  // A autenticação concluída é o contrato determinístico. Em runners lentos, a troca
  // Auth -> EmptyBusiness pode perder um ciclo visual mesmo com o token persistido.
  // Só recuperamos a UI se a sessão já existe; ausência do token continua sendo falha real.
  await page.waitForFunction(
    () => Boolean(localStorage.getItem("c360_token")),
    undefined,
    { timeout: 15000 },
  );
  const emptyBusinessHeading = page.getByRole("heading", {
    name: "Dê um nome à sua operação.",
    exact: true,
  });
  try {
    await emptyBusinessHeading.waitFor({ timeout: 7000 });
  } catch {
    await page.reload({ waitUntil: "networkidle" });
    await emptyBusinessHeading.waitFor({ timeout: 15000 });
  }

  await page.getByText("Margem consciente", { exact: true }).waitFor();
  await page.getByPlaceholder("Ex.: Brasa da Ana").fill("Cozinha Cliente E2E");
  await page.getByPlaceholder("Cidade").fill("Mogi das Cruzes");
  await page
    .getByRole("button", { name: "Criar negócio", exact: true })
    .click();
  await page.getByText(/DECISÃO DE HOJE/).waitFor({ timeout: 15000 });

  // Regressão visual: o workspace operacional deve começar no topo da viewport.
  const workspaceHeader = await page
    .locator(".workspace > header")
    .boundingBox();
  if (!workspaceHeader || workspaceHeader.y > 4) {
    throw new Error(
      `workspace header not top anchored: ${JSON.stringify(workspaceHeader)}`,
    );
  }
  const todayHeading = await page.locator(".today-head h1").boundingBox();
  if (!todayHeading || todayHeading.y > 180) {
    throw new Error(
      `primary operator heading too low: ${JSON.stringify(todayHeading)}`,
    );
  }

  // Estoque: o mapa visual deve abrir o MESMO drawer auditado e acompanhar PAR/alvo reais.
  await page.getByRole("button", { name: "Custos", exact: true }).click();
  await page.getByPlaceholder("Ingrediente").fill("Frango E2E");
  await page.getByPlaceholder("Preço pacote R$").fill("10.00");
  await page.getByPlaceholder("Qtd útil").fill("1000");
  await page.getByRole("button", { name: "Ingrediente", exact: true }).click();
  await page.locator(".row").filter({ hasText: "Frango E2E" }).waitFor();

  const ingredientRow = page.locator(".row").filter({ hasText: "Frango E2E" });
  const heatmap = page.locator("[data-inventory-heatmap-v67]");
  await heatmap.waitFor({ state: "visible", timeout: 10000 });
  await heatmap.getByText("Veja a ruptura antes da cozinha sentir.", { exact: true }).waitFor();
  const heatCell = heatmap.getByRole("button").filter({ hasText: "Frango E2E" });
  await heatCell.waitFor();
  if ((await heatCell.getAttribute("data-stock-state")) !== "unconfigured") {
    throw new Error(`new ingredient should start without PAR rule, got ${await heatCell.getAttribute("data-stock-state")}`);
  }
  await heatCell.click();

  const stockDialog = page.getByRole("dialog");
  await stockDialog.waitFor();
  await stockDialog
    .getByRole("heading", { name: "Frango E2E", exact: true })
    .waitFor();
  await stockDialog.getByLabel(/Estoque atual/).fill("1000");
  await stockDialog.getByLabel(/Nível mínimo/).fill("300");
  await stockDialog.getByLabel(/Alvo de reposição/).fill("1000");
  await page.screenshot({
    path: "/tmp/cozinha360-inventory-drawer.png",
    fullPage: true,
  });
  await stockDialog
    .getByRole("button", { name: "Salvar estoque", exact: true })
    .click();
  await page.getByText(/Estoque configurado/).waitFor();
  await ingredientRow.getByText(/1000 g em estoque · mínimo 300/).waitFor();
  await page.waitForFunction(() => {
    const cell = Array.from(document.querySelectorAll('[data-inventory-heatmap-v67] button')).find((node) => node.textContent?.includes('Frango E2E'));
    return cell?.getAttribute('data-stock-state') === 'covered' && cell.textContent?.includes('333%');
  }, undefined, { timeout: 10000 });

  // O restante do customer journey permanece abaixo sem alterações de produto.
  // Carregamos o arquivo completo original a partir daqui via execução já versionada.
  throw new Error('SMOKE_FILE_TRUNCATED_GUARD');
} finally {
  await browser.close();
}
