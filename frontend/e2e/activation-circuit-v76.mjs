import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1180 } })
await page.addInitScript(() => localStorage.setItem('c360_token', 'c76-browser-token'))
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
let ifoodActive = false
let externalWrites = 0
let catalogReads = 0
const now = () => new Date().toISOString()

await page.route('**/api/me', route => route.fulfill(json({
  user: { id: 1, email: 'operador@cozinha360.test', full_name: 'Operador 360' },
  businesses: [{ id: 1, name: 'Cozinha Circuito', city: 'Mogi das Cruzes', role: 'owner', preferences: {} }]
})))
await page.route('**/api/businesses/1/memory', route => route.fulfill(json({ business_id: 1, states: {} })))
await page.route('**/cozinha360-profile-v31/**', route => route.fulfill(json({
  profile: { business_id: 1, order_source: 'mixed', use_mercadopago: true, use_google: true, use_meta_ads: true, configured_at: now() },
  recommended_order: ['whatsapp', 'ifood', 'mercadopago', 'google', 'meta_ads'],
  internal_order_ready: true
})))
await page.route('**/cozinha360-integration-health-v73/businesses/1/health', route => route.fulfill(json({
  ok: true,
  version: '7.3.0',
  business_id: 1,
  generated_at: now(),
  summary: { healthy: ifoodActive ? 2 : 1, degrading: 0, review: 0, recovered: 0, total: ifoodActive ? 2 : 1 },
  items: [
    { connection_id: 3, provider: 'google', name: 'Perfil local', connection_status: 'active', state: 'healthy', effective_state: 'healthy', last_checked_at: now(), last_success_at: now() },
    ...(ifoodActive ? [{ connection_id: 7, provider: 'ifood', name: 'Loja iFood', connection_status: 'active', state: 'healthy', effective_state: 'healthy', last_checked_at: now(), last_success_at: now() }] : [])
  ],
  principles: { server_side: true, operational_errors_preserved: true }
})))
await page.route('**/cozinha360-connect-orchestrator-v65/**', route => route.fulfill(json({
  summary: { healthy: ifoodActive ? 2 : 1, attention: 0, ready: 3, platform_setup: 1, progress_percent: ifoodActive ? 40 : 20 },
  native: [
    { key: 'google', name: 'Google Business', category: 'presenca', state: 'healthy', score: 100 },
    { key: 'ifood', name: 'iFood', category: 'pedidos', state: ifoodActive ? 'healthy' : 'ready', score: ifoodActive ? 100 : 70 }
  ],
  partners: []
})))

const connection = (id, provider, displayName) => ({ id, provider, external_account_ref: `${provider}-1`, display_name: displayName, status: 'active', last_success_at: now(), last_error: null })
const provider = (key, name, category, options = {}) => ({
  key, name, category,
  impact: options.impact || 'Resultado operacional ligado ao mesmo circuito.',
  why: 'Conexão segura e guiada.',
  mode: key === 'ifood' ? 'device_code' : 'oauth',
  eta: '~2 min',
  platform_ready: options.platform_ready ?? true,
  missing: options.platform_ready === false ? ['PLATFORM_SETUP'] : [],
  optional_missing: [],
  operational: options.operational || false,
  selection_required: options.selection_required || false,
  connection: options.connection || null,
  asset_count: options.operational ? 1 : 0,
  selected_asset: options.operational ? { ref: `${key}-1`, label: options.connection?.display_name || name } : null
})

await page.route('**/cozinha360-integrations-v29/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  const method = request.method()
  if (method !== 'GET') {
    externalWrites += 1
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'write blocked by v7.6 gate' }) })
  }
  if (url.pathname.endsWith('/businesses/1/integrations')) {
    catalogReads += 1
    return route.fulfill(json({
      business_id: 1,
      recommended_order: ['whatsapp', 'ifood', 'mercadopago', 'google', 'meta_ads'],
      providers: [
        provider('whatsapp', 'WhatsApp Business', 'Vendas & CRM'),
        provider('ifood', 'iFood', 'Marketplace', ifoodActive ? { operational: true, connection: connection(7, 'ifood', 'Loja iFood') } : {}),
        provider('mercadopago', 'Mercado Pago / Pix', 'Pagamentos', { platform_ready: false }),
        provider('google', 'Google Business + Ads', 'Aquisição local', { operational: true, connection: connection(3, 'google', 'Perfil local') }),
        provider('meta_ads', 'Meta Ads', 'Aquisição')
      ]
    }))
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: `unmocked GET ${url.pathname}` }) })
})

try {
  await page.goto('http://127.0.0.1:5173/?connections=1', { waitUntil: 'networkidle' })
  const circuit = page.locator('[data-activation-circuit-v76]')
  await circuit.waitFor({ state: 'visible', timeout: 15000 })
  await circuit.getByText('CIRCUITO VIVO · V7.6', { exact: true }).waitFor()
  await circuit.getByText('PROVA OPERACIONAL', { exact: true }).waitFor()
  if (catalogReads < 1) throw new Error('v7.6 did not read the real integration catalog')
  if (externalWrites !== 0) throw new Error(`opening circuit performed ${externalWrites} external write(s)`)

  const embedded = await page.evaluate(() => {
    const hero = document.querySelector('.cx-hero')
    const host = hero?.nextElementSibling
    return Boolean(host && host instanceof HTMLElement && host.dataset.c76Host === 'true')
  })
  if (!embedded) throw new Error('v7.6 circuit must be embedded immediately after the Connections hero')

  const google = circuit.locator('[data-c76-provider="google"]')
  const ifood = circuit.locator('[data-c76-provider="ifood"]')
  const mercado = circuit.locator('[data-c76-provider="mercadopago"]')
  if (await google.getAttribute('data-c76-state') !== 'live') throw new Error('Google operational state was not rendered as live')
  if (await ifood.getAttribute('data-c76-state') !== 'ready') throw new Error('iFood inactive state was not rendered as ready')
  if (await mercado.getAttribute('data-c76-state') !== 'platform') throw new Error('platform-owned Mercado Pago setup was not rendered as platform')
  if (await page.getByText('CAPACIDADE ACESA DE VERDADE', { exact: true }).count()) throw new Error('first read must establish a baseline, not celebrate')

  await ifood.click()
  await page.waitForTimeout(350)
  if (externalWrites !== 0) throw new Error(`capability navigation performed ${externalWrites} external write(s)`)
  const ifoodCard = page.locator('.cx-card').filter({ hasText: 'iFood' }).first()
  await ifoodCard.waitFor({ state: 'visible' })

  await page.screenshot({ path: '/tmp/cozinha360-activation-circuit-v76.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(250)
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (mobileOverflow > 1) throw new Error(`v7.6 creates ${mobileOverflow}px horizontal overflow on mobile`)
  const mobileBox = await circuit.boundingBox()
  if (!mobileBox || mobileBox.width > 391) throw new Error(`invalid mobile circuit width ${JSON.stringify(mobileBox)}`)
  await page.screenshot({ path: '/tmp/cozinha360-activation-circuit-v76-mobile.png', fullPage: true })

  // A new operational state may be observed on a later server read or page return.
  // Session storage remembers only the previous live set; it is not a source of truth.
  ifoodActive = true
  await page.setViewportSize({ width: 1440, height: 1180 })
  await page.reload({ waitUntil: 'networkidle' })
  const refreshed = page.locator('[data-activation-circuit-v76]')
  await refreshed.waitFor({ state: 'visible', timeout: 15000 })
  if (await refreshed.locator('[data-c76-provider="ifood"]').getAttribute('data-c76-state') !== 'live') throw new Error('server-confirmed iFood transition did not turn live')
  await page.getByText('CAPACIDADE ACESA DE VERDADE', { exact: true }).waitFor({ timeout: 5000 })
  await page.getByText('iFood', { exact: true }).last().waitFor()
  if (externalWrites !== 0) throw new Error(`v7.6 performed ${externalWrites} external write(s) while observing transition`)

  console.log('activation circuit v7.6 real-state, passive, embedded, mobile-safe journey ok')
} catch (error) {
  await page.screenshot({ path: '/tmp/cozinha360-activation-circuit-v76-failure.png', fullPage: true }).catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
