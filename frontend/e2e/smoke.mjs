import { chromium, request as playwrightRequest } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })

  // Cliente novo: conta -> primeira operação.
  await page.getByRole('button', { name: 'Ainda não tenho conta', exact: true }).click()
  await page.getByLabel('Nome').fill('Cliente E2E')
  await page.getByLabel('E-mail').fill('cliente-e2e@example.com')
  await page.getByLabel('Senha').fill('senha-super-segura-123')
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await page.getByText('Crie sua primeira operação').waitFor()
  await page.getByPlaceholder('Ex.: Brasa da Ana').fill('Cozinha Cliente E2E')
  await page.getByPlaceholder('Cidade').fill('Mogi das Cruzes')
  await page.getByRole('button', { name: 'Criar negócio', exact: true }).click()
  await page.getByText(/DECISÃO DE HOJE/).waitFor({ timeout: 15000 })

  // Estoque: ingrediente + configuração de par/target usando a UI atual.
  await page.getByRole('button', { name: 'Custos', exact: true }).click()
  await page.getByPlaceholder('Ingrediente').fill('Frango E2E')
  await page.getByPlaceholder('Preço pacote R$').fill('10.00')
  await page.getByPlaceholder('Qtd útil').fill('1000')
  await page.getByRole('button', { name: 'Ingrediente', exact: true }).click()
  await page.getByText('Frango E2E').waitFor()

  let dialogStep = 0
  page.on('dialog', async dialog => {
    const values = ['1000', '300', '1000']
    await dialog.accept(values[dialogStep++] || '0')
  })
  const ingredientRow = page.locator('.row').filter({ hasText: 'Frango E2E' })
  await ingredientRow.getByRole('button', { name: 'Estoque', exact: true }).click()
  await page.getByText('Estoque configurado.').waitFor()

  // Produto + ficha técnica.
  await page.getByRole('button', { name: 'Produtos', exact: true }).click()
  await page.getByPlaceholder('Nome do produto').fill('Wrap E2E')
  await page.getByPlaceholder('Categoria').fill('wrap')
  await page.getByRole('button', { name: 'Produto', exact: true }).click()
  const productRow = page.locator('.row-button').filter({ hasText: 'Wrap E2E' })
  await productRow.waitFor()
  await productRow.click()
  await page.locator('.recipe-panel select').selectOption({ label: 'Frango E2E' })
  await page.getByPlaceholder('Quantidade usada').fill('200')
  await page.getByRole('button', { name: 'Salvar ingrediente', exact: true }).click()
  await page.getByText('Ficha técnica atualizada.').waitFor()

  // Pedido real atravessando o KDS até conclusão.
  await page.getByRole('button', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('button', { name: 'Pedido', exact: true }).click()
  await page.locator('.inline-form select').selectOption({ label: 'Wrap E2E' })
  const orderInputs = page.locator('.inline-form input')
  await orderInputs.nth(0).fill('2')
  await orderInputs.nth(1).fill('20.00')
  await orderInputs.nth(2).fill('8.00')
  await page.getByRole('button', { name: 'Registrar', exact: true }).click()
  await page.getByText('Pedido registrado no KDS.').waitFor()

  for (const label of ['Confirmado', 'Produção', 'Conferência', 'Entrega', 'Concluído']) {
    const ticket = page.locator('.ticket').first()
    await ticket.waitFor()
    await ticket.getByRole('button', { name: label, exact: true }).click()
    await page.waitForTimeout(250)
  }
  await page.getByText('Pedido concluído e estoque teórico atualizado.').waitFor()

  // Como cliente, espero ver a venda no financeiro e o estoque consumido.
  await page.getByRole('button', { name: 'Financeiro', exact: true }).click()
  await page.getByText(/R\$\s*40,00/).first().waitFor()
  await page.getByText(/R\$\s*24,00/).first().waitFor()

  await page.getByRole('button', { name: 'Custos', exact: true }).click()
  await page.locator('.row').filter({ hasText: 'Frango E2E' }).getByText(/600 g em estoque/).waitFor()

  // Readiness é uma condição de infraestrutura, não apenas uma tela carregada.
  const api = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:8000' })
  const ready = await api.get('/readyz')
  if (!ready.ok()) throw new Error(`readyz returned ${ready.status()}`)
  const readyBody = await ready.json()
  if (readyBody.schema !== 'current') throw new Error(`unexpected readiness: ${JSON.stringify(readyBody)}`)
  await api.dispose()

  await page.screenshot({ path: '/tmp/cozinha360-e2e-success.png', fullPage: true })
  console.log('browser customer journey ok')
} catch (error) {
  await page.screenshot({ path: '/tmp/cozinha360-e2e-failure.png', fullPage: true }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
