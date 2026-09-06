import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const page=await context.newPage()

try{
  await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'})
  await page.locator('.account-helper-link').waitFor()
  if(await page.locator('.operator-rail').count())throw new Error('operator launcher must not render before authentication')

  await page.getByLabel('E-mail').fill('cliente-e2e@example.com')
  await page.getByLabel('Senha').fill('senha-super-segura-123')
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await page.getByText(/DECISÃO DE HOJE/).waitFor({timeout:15000})
  await page.locator('.operator-rail').waitFor({timeout:3000})
  if(await page.locator('.account-helper-link').count())throw new Error('password recovery helper must disappear after authentication')

  const primaryLinks=page.locator('.operator-rail > a')
  if(await primaryLinks.count()!==4)throw new Error(`expected 4 persistent actions, got ${await primaryLinks.count()}`)
  await page.getByRole('link',{name:'Autopilot',exact:true}).waitFor()
  await page.getByRole('link',{name:'+ Pedido rápido',exact:true}).waitFor()
  await page.getByRole('link',{name:'Cozinha',exact:true}).waitFor()
  await page.getByRole('link',{name:'Caixa',exact:true}).waitFor()

  await page.keyboard.press('Control+k')
  const dialog=page.getByRole('dialog',{name:'Launcher do Cozinha 360'})
  await dialog.waitFor()
  await dialog.getByRole('heading',{name:'O que você precisa fazer agora?',exact:true}).waitFor()
  for(const group of ['Operar','Controlar','Crescer','Administrar'])await dialog.getByRole('heading',{name:group,exact:true}).waitFor()

  const search=dialog.getByLabel('Buscar função')
  await search.fill('crm')
  await dialog.getByRole('link',{name:/CRM de recompra/}).waitFor()
  if(await dialog.getByRole('link',{name:/Sistema 360/}).count())throw new Error('search must progressively disclose only matching actions')
  await page.keyboard.press('Escape')
  await dialog.waitFor({state:'detached'})

  await page.keyboard.press('Meta+k').catch(()=>{})
  if(!(await page.locator('.operator-launcher-backdrop').count()))await page.keyboard.press('Control+k')
  await page.screenshot({path:'/tmp/cozinha360-operator-launcher-v38.png',fullPage:true})
  await page.keyboard.press('Escape')

  await page.setViewportSize({width:390,height:844})
  await page.locator('.operator-rail').waitFor()
  const railBox=await page.locator('.operator-rail').boundingBox()
  if(!railBox||railBox.x>12||railBox.width<360)throw new Error(`mobile launcher is not edge-to-edge: ${JSON.stringify(railBox)}`)
  const cashBox=await page.getByRole('link',{name:'Caixa',exact:true}).boundingBox()
  if(cashBox)throw new Error('mobile rail should reduce persistent actions before the launcher')
  await page.getByRole('button',{name:/Mais/}).click()
  await dialog.waitFor()
  const panelBox=await page.locator('.operator-launcher-panel').boundingBox()
  if(!panelBox||panelBox.y<100||panelBox.width<380)throw new Error(`mobile launcher is not presented as a bottom sheet: ${JSON.stringify(panelBox)}`)
  await page.screenshot({path:'/tmp/cozinha360-operator-launcher-v38-mobile.png',fullPage:true})

  console.log('operator launcher v3.8 journey ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-operator-launcher-v38-failure.png',fullPage:true}).catch(()=>{})
  console.error(error)
  process.exitCode=1
}finally{
  await context.close()
  await browser.close()
}
