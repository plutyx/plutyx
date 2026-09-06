import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const page=await context.newPage()

try{
  await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'})
  await page.getByLabel('E-mail').fill('cliente-e2e@example.com')
  await page.getByLabel('Senha').fill('senha-super-segura-123')
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await page.getByText(/DECISÃO DE HOJE/).waitFor({timeout:15000})

  await page.getByRole('link',{name:'Hoje',exact:true}).click()
  await page.getByRole('heading',{name:'Seu dia em 60 segundos.',exact:true}).waitFor({timeout:15000})
  await page.getByText('BRIEFING OPERACIONAL',{exact:true}).waitFor()
  await page.getByRole('heading',{name:'Fila de decisões',exact:true}).waitFor()
  await page.getByRole('heading',{name:'Faça nesta ordem',exact:true}).waitFor()

  const kpis=page.locator('.today39-kpis article')
  if(await kpis.count()!==4)throw new Error(`expected 4 operator KPIs, got ${await kpis.count()}`)
  for(const label of ['Pedidos abertos','Estoque','Contribuição 30d','Qualidade'])await page.getByText(label,{exact:true}).waitFor()

  const attentionItems=page.locator('.today39-item')
  if(await attentionItems.count()<1)throw new Error('today feed must always resolve to at least one actionable or stable item')
  const firstItem=attentionItems.first()
  await firstItem.locator('.today39-item-copy h3').waitFor()
  await firstItem.locator('.today39-item-side a').waitFor()

  const bodyText=(await page.locator('body').innerText()).toLowerCase()
  if(bodyText.includes('perda estimada')||bodyText.includes('previsão de lucro'))throw new Error('today brief must not invent financial impact that is not in source data')

  // The global launcher must remain available inside a standalone operator workspace.
  await page.keyboard.press('Control+k')
  const dialog=page.getByRole('dialog',{name:'Launcher do Cozinha 360'})
  await dialog.waitFor()
  await dialog.getByRole('link',{name:/Autopilot 360/}).waitFor()
  await page.keyboard.press('Escape')

  await page.screenshot({path:'/tmp/cozinha360-today-attention-v39.png',fullPage:true})

  await page.setViewportSize({width:390,height:844})
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Seu dia em 60 segundos.',exact:true}).waitFor({timeout:15000})
  const contentBox=await page.locator('.today39-content').boundingBox()
  if(!contentBox||contentBox.width>390||contentBox.x<0)throw new Error(`today mobile content overflows viewport: ${JSON.stringify(contentBox)}`)
  const mobileKpis=page.locator('.today39-kpis article')
  const firstBox=await mobileKpis.nth(0).boundingBox(),secondBox=await mobileKpis.nth(1).boundingBox()
  if(!firstBox||!secondBox||secondBox.y<=firstBox.y)throw new Error('mobile KPI cards should stack into a scannable single column')
  await page.screenshot({path:'/tmp/cozinha360-today-attention-v39-mobile.png',fullPage:true})

  console.log('today attention v3.9 journey ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-today-attention-v39-failure.png',fullPage:true}).catch(()=>{})
  console.error(error)
  process.exitCode=1
}finally{
  await context.close()
  await browser.close()
}
