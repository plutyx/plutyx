import { chromium, request as playwrightRequest } from "playwright";

const browser = await chromium.launch({ headless: true });
const api = await playwrightRequest.newContext({ baseURL: "http://127.0.0.1:8000" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });

async function expectOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed: ${response.status()} ${await response.text()}`);
  return response.json();
}

try {
  const signup = await expectOk(await api.post("/auth/signup", { data: {
    email: "product-map-v71@example.com",
    password: "product-map-v71-secure-123",
    full_name: "Produto v7.1 E2E",
  } }), "signup");
  const token = signup.access_token;
  const headers = { Authorization: `Bearer ${token}` };

  const business = await expectOk(await api.post("/businesses", { headers, data: {
    name: "Cozinha Composição v7.1",
    city: "Mogi das Cruzes",
  } }), "business");
  const businessId = Number(business.id);

  const ingredient = await expectOk(await api.post(`/businesses/${businessId}/ingredients`, { headers, data: {
    name: "Frango composição v7.1",
    unit: "g",
    price_cents: 1000,
    purchase_qty_milliunits: 1000,
    usable_qty_milliunits: 1000,
  } }), "ingredient");
  const ingredientId = Number(ingredient.id);

  await expectOk(await api.post(`/businesses/${businessId}/purchases`, { headers, data: {
    ingredient_id: ingredientId,
    quantity_milliunits: 1000,
    total_cents: 1000,
    freight_cents: 0,
    tax_cents: 0,
    idempotency_key: "product-map-v71-stock",
  } }), "purchase");

  const configured = await expectOk(await api.patch(`/businesses/${businessId}/ingredients/${ingredientId}/inventory`, { headers, data: {
    on_hand_milliunits: 1000,
    par_level_milliunits: 300,
    reorder_target_milliunits: 1200,
    expected_version: 2,
  } }), "inventory configuration");
  if (Number(configured.version) !== 3) throw new Error(`unexpected inventory version after setup: ${JSON.stringify(configured)}`);

  const product = await expectOk(await api.post(`/businesses/${businessId}/products`, { headers, data: {
    name: "Wrap composição v7.1",
    category: "wrap",
    active: true,
    units_per_batch: 1,
    packaging_cents_per_unit: 100,
    energy_cents_per_batch: 30,
    labor_cents_per_batch: 70,
  } }), "product");
  const productId = Number(product.id);

  await expectOk(await api.put(`/businesses/${businessId}/products/${productId}/recipe/${ingredientId}`, { headers, data: {
    ingredient_id: ingredientId,
    qty_used_milliunits: 200,
  } }), "recipe");

  const serverCost = await expectOk(await api.get(`/businesses/${businessId}/products/${productId}/cost-preview`, { headers }), "cost preview");
  if (serverCost.ingredients_cents !== 200 || serverCost.packaging_cents !== 100 || serverCost.energy_cents !== 30 || serverCost.labor_cents !== 70 || serverCost.direct_cost_per_unit_cents !== 400) {
    throw new Error(`unexpected server cost contract: ${JSON.stringify(serverCost)}`);
  }

  await page.addInitScript((value) => localStorage.setItem("c360_token", value), token);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Cozinha Composição v7.1", exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Produtos", exact: true }).click();

  // The primary editor intentionally auto-selects products[0] when no productId is set.
  // The visual map must follow that exact real selection, never invent its own default.
  const recipePanel = page.locator(".recipe-panel");
  await recipePanel.getByRole("heading", { name: "Wrap composição v7.1", exact: true }).waitFor({ timeout: 10000 });
  const map = page.locator("[data-product-composition-v71]");
  await map.waitFor({ state: "visible", timeout: 12000 });
  await map.getByRole("heading", { name: "Veja o produto por dentro.", exact: true }).waitFor();
  await map.locator(".pc71-core").getByRole("heading", { name: "Wrap composição v7.1", exact: true }).waitFor();
  await map.locator(".pc71-core").getByText(/R\$\s*4,00/).waitFor();

  // Explicit row selection must keep the same canonical product attached to the map.
  await page.locator(".row-button").filter({ hasText: "Wrap composição v7.1" }).click();
  await map.locator(".pc71-core").getByRole("heading", { name: "Wrap composição v7.1", exact: true }).waitFor();

  const node = map.getByRole("button", { name: /Frango composição v7\.1: 200 g na ficha; estoque cobre 5× esta ficha\. Editar ingrediente\./ });
  await node.waitFor();
  await map.locator(".pc71-cost-bento").getByText(/R\$\s*2,00/).waitFor();
  await map.locator(".pc71-cost-bento").getByText(/R\$\s*1,00/).waitFor();
  await map.locator(".pc71-cost-bento").getByText(/R\$\s*0,30/).waitFor();
  await map.locator(".pc71-cost-bento").getByText(/R\$\s*0,70/).waitFor();

  await node.click();
  const recipeSelect = page.locator(".recipe-panel select");
  const editorState = await recipeSelect.evaluate((select) => ({ value: select.value, focused: document.activeElement === select }));
  if (editorState.value !== String(ingredientId) || !editorState.focused) {
    throw new Error(`ingredient node did not focus the real recipe editor: ${JSON.stringify(editorState)}`);
  }

  const changed = await expectOk(await api.patch(`/businesses/${businessId}/ingredients/${ingredientId}/inventory`, { headers, data: {
    on_hand_milliunits: 100,
    par_level_milliunits: 300,
    reorder_target_milliunits: 1200,
    expected_version: 3,
  } }), "live inventory change");
  if (Number(changed.version) !== 4) throw new Error(`unexpected inventory version after live change: ${JSON.stringify(changed)}`);

  await map.getByRole("button", { name: "Atualizar mapa da ficha", exact: true }).click();
  await map.getByRole("button", { name: /Frango composição v7\.1: 200 g na ficha; estoque não cobre 1× esta ficha\. Editar ingrediente\./ }).waitFor({ timeout: 10000 });
  const refreshedNode = map.getByRole("button", { name: /Frango composição v7\.1: 200 g na ficha/ });
  if (!(await refreshedNode.first().getAttribute("class"))?.includes("pc71-critical")) {
    throw new Error("live stock rupture did not become a critical composition node");
  }

  await page.screenshot({ path: "/tmp/cozinha360-product-composition-v71.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.getByRole("heading", { name: "Cozinha Composição v7.1", exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Produtos", exact: true }).click();
  await page.locator(".recipe-panel").getByRole("heading", { name: "Wrap composição v7.1", exact: true }).waitFor({ timeout: 10000 });
  const mobileMap = page.locator("[data-product-composition-v71]");
  await mobileMap.waitFor({ state: "visible", timeout: 12000 });
  const box = await mobileMap.boundingBox();
  if (!box || box.x < 0 || box.width > 390) throw new Error(`Product composition v7.1 overflows mobile viewport: ${JSON.stringify(box)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error("Product composition v7.1 introduced horizontal page overflow on mobile");
  await page.screenshot({ path: "/tmp/cozinha360-product-composition-v71-mobile.png", fullPage: true });

  console.log("product composition v7.1 follows the real selected product, uses server cost, live stock coverage and the existing editor");
} catch (error) {
  await page.screenshot({ path: "/tmp/cozinha360-product-composition-v71-failure.png", fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await api.dispose();
  await browser.close();
}
