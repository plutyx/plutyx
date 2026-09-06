import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const page=await context.newPage()

let brands=[]
let zones=[]
let drivers=[]
let promos=[]
let loyalty={business_id:1,mode:'off',points_per_real:1,cashback_bps:0,redeem_threshold:0,active:false}
let ids={brand:10,zone:20,driver:30,promo:40}

function overview(){
  return {
    business_id:1,period_days:30,
    metrics:{orders_paid:18,revenue_cents:126000,contribution_cents:50400,open_orders:2,delayed_orders:1,source_mix:{whatsapp:9,direct:6,ifood:3}},
    readiness:{own_channel:true,delivery_zones:zones.some(x=>x.active),couriers:drivers.some(x=>x.active),loyalty:Boolean(loyalty.active),multibrand:brands.filter(x=>x.active).length>1},
    brands:brands.map(x=>({...x,metrics:{orders:x.id===10?8:0,revenue_cents:x.id===10?56000:0,contribution_cents:x.id===10?22400:0}})),
    zones,drivers,loyalty,promos,
    storefronts:[{id:1,brand_id:null,slug:'cozinha-e2e',display_name:'Cozinha E2E',active:true}],
    channels:[{id:1,name:'Pedido direto',traffic_active:true}],
  }
}

await page.route('**/cozinha360-delivery-v40/**',async route=>{
  const req=route.request();const url=new URL(req.url());const path=url.pathname.split('/cozinha360-delivery-v40')[1]||'/';const method=req.method()
  let input={};try{input=req.postDataJSON()||{}}catch{}
  if(path==='/livez')return route.fulfill({status:200,json:{ok:true,version:'4.0.0'}})
  if(path==='/readyz')return route.fulfill({status:200,json:{ok:true,database:'ready',version:'4.0.0'}})
  if(path.match(/\/businesses\/\d+\/delivery\/overview$/)&&method==='GET')return route.fulfill({status:200,json:overview()})
  if(path.match(/\/businesses\/\d+\/delivery\/brands$/)&&method==='POST'){
    const row={id:ids.brand++,name:input.name,slug:input.slug||String(input.name).toLowerCase().replace(/[^a-z0-9]+/g,'-'),active:true,primary_channel:input.primary_channel||'direct',sort_order:0}
    brands.push(row);return route.fulfill({status:201,json:row})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/brands\/\d+$/)&&method==='PATCH'){
    const id=Number(path.split('/').at(-1));const row=brands.find(x=>x.id===id);Object.assign(row,input);return route.fulfill({status:200,json:row})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/zones$/)&&method==='POST'){
    const row={id:ids.zone++,business_id:1,brand_id:input.brand_id||null,name:input.name,zone_type:input.zone_type,match_value:input.match_value,fee_cents:input.fee_cents,min_order_cents:input.min_order_cents,eta_min:input.eta_min,active:true,version:1};zones.push(row);return route.fulfill({status:201,json:row})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/zones\/\d+$/)&&method==='PATCH'){
    const id=Number(path.split('/').at(-1));const row=zones.find(x=>x.id===id);Object.assign(row,input,{version:row.version+1});return route.fulfill({status:200,json:row})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/drivers$/)&&method==='POST'){
    const row={id:ids.driver++,business_id:1,name:input.name,phone:input.phone||'',vehicle:input.vehicle,status:input.status||'available',active:true,version:1};drivers.push(row);return route.fulfill({status:201,json:row})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/drivers\/\d+$/)&&method==='PATCH'){
    const id=Number(path.split('/').at(-1));const row=drivers.find(x=>x.id===id);Object.assign(row,input,{version:row.version+1});return route.fulfill({status:200,json:row})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/loyalty$/)&&method==='PUT'){
    loyalty={...loyalty,...input,business_id:1};return route.fulfill({status:200,json:loyalty})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/promos$/)&&method==='POST'){
    const row={id:ids.promo++,business_id:1,brand_id:input.brand_id||null,code:input.code,discount_type:input.discount_type,value:input.value,min_order_cents:input.min_order_cents||0,max_uses:null,used_count:0,starts_at:null,ends_at:null,active:true};promos.push(row);return route.fulfill({status:201,json:row})
  }
  if(path.match(/\/businesses\/\d+\/delivery\/promos\/\d+$/)&&method==='PATCH'){
    const id=Number(path.split('/').at(-1));const row=promos.find(x=>x.id===id);Object.assign(row,input);return route.fulfill({status:200,json:row})
  }
  return route.fulfill({status:404,json:{detail:'mock route not found'}})
})

try{
  await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'})
  await page.getByLabel('E-mail').fill('cliente-e2e@example.com')
  await page.getByLabel('Senha').fill('senha-super-segura-123')
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await page.getByText(/DECISÃO DE HOJE/).waitFor({timeout:15000})

  await page.goto('http://127.0.0.1:5173/?delivery=1',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Da entrada do pedido à recompra, sem trocar de sistema.',exact:true}).waitFor({timeout:15000})
  await page.getByText('18',{exact:true}).first().waitFor()
  await page.getByText(/R\$\s*1\.260,00/).waitFor()
  await page.getByText(/1 pedido\(s\) passando de 30 min/).waitFor()
  await page.getByText('Cadastre a primeira marca',{exact:true}).waitFor()
  await page.screenshot({path:'/tmp/cozinha360-delivery-os-v40-command.png',fullPage:true})

  // Dark kitchen: crio uma marca sem abrir outra conta/operação.
  await page.getByRole('button',{name:'Marcas',exact:true}).click()
  await page.getByLabel('Nome da marca').fill('Smash E2E')
  await page.getByLabel('Slug').fill('smash-e2e')
  await page.getByLabel('Canal principal').selectOption('whatsapp')
  await page.getByRole('button',{name:/Adicionar marca/}).click()
  await page.getByText('Marca criada.',{exact:true}).waitFor()
  await page.getByRole('heading',{name:'Smash E2E',exact:true}).waitFor()

  // Logística: zona com taxa/minimum/ETA e entregador próprio.
  await page.getByRole('button',{name:'Entrega',exact:true}).click()
  const panels=page.locator('.delivery-panel')
  const area=panels.filter({hasText:'Taxa, mínimo e ETA'})
  await area.getByLabel('Nome').fill('Raio 5 km')
  await area.getByLabel('Regra').selectOption('radius')
  await area.getByLabel('Distância').fill('5 km')
  await area.getByLabel('Marca').selectOption({label:'Smash E2E'})
  await area.getByLabel('Taxa R$').fill('7.90')
  await area.getByLabel('Mínimo R$').fill('35.00')
  await area.getByLabel('ETA min').fill('45')
  await area.getByRole('button',{name:/Criar área/}).click()
  await page.getByText('Área de entrega criada.',{exact:true}).waitFor()
  await area.getByText('Raio 5 km',{exact:true}).waitFor()
  await area.getByText(/R\$\s*7,90/).waitFor()

  const driver=panels.filter({hasText:'Disponibilidade da rua'})
  await driver.getByLabel('Nome').fill('Moto E2E')
  await driver.getByLabel('WhatsApp / telefone').fill('(11) 99999-9999')
  await driver.getByLabel('Modal').selectOption('moto')
  await driver.getByRole('button',{name:/Adicionar entregador/}).click()
  await page.getByText('Entregador adicionado.',{exact:true}).waitFor()
  await driver.getByText('Moto E2E',{exact:true}).waitFor()
  await driver.getByRole('button',{name:'Marcar em entrega',exact:true}).click()
  await page.getByText('Status atualizado.',{exact:true}).waitFor()
  await driver.getByText('Em entrega',{exact:true}).waitFor()

  // Retenção: cashback + cupom sem fingir que incentivo é lucro.
  await page.getByRole('button',{name:'Recompra',exact:true}).click()
  const loyaltyPanel=page.locator('.delivery-panel').filter({hasText:'Uma regra simples e legível'})
  await loyaltyPanel.getByLabel('Modelo').selectOption('cashback')
  await loyaltyPanel.getByLabel('Cashback %').fill('5')
  await loyaltyPanel.getByRole('button',{name:'Salvar fidelidade',exact:true}).click()
  await page.getByText('Programa de recompra atualizado.',{exact:true}).waitFor()
  await page.getByText(/não chama cashback de “lucro”/).waitFor()

  const promoPanel=page.locator('.delivery-panel').filter({hasText:'Oferta com limite explícito'})
  await promoPanel.getByLabel('Código').fill('VOLTA10')
  await promoPanel.getByLabel('Tipo').selectOption('percent')
  await promoPanel.getByLabel('Desconto %').fill('10')
  await promoPanel.getByLabel('Pedido mínimo R$').fill('30')
  await promoPanel.getByLabel('Marca').selectOption({label:'Smash E2E'})
  await promoPanel.getByRole('button',{name:/Criar cupom/}).click()
  await page.getByText('Cupom criado.',{exact:true}).waitFor()
  await promoPanel.getByText('VOLTA10',{exact:true}).waitFor()
  await promoPanel.getByText(/10,0% off/).waitFor()

  // Launcher global permanece disponível; Delivery OS é descobrível sem poluir rail.
  await page.keyboard.press('Control+k')
  const launcher=page.getByRole('dialog',{name:'Launcher do Cozinha 360'})
  await launcher.waitFor()
  await launcher.getByLabel('Buscar função').fill('delivery')
  await launcher.getByRole('link',{name:/Delivery OS/}).waitFor()
  await page.keyboard.press('Escape')

  await page.screenshot({path:'/tmp/cozinha360-delivery-os-v40.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Comando',exact:true}).click()
  const metrics=page.locator('.delivery-metrics')
  const box=await metrics.boundingBox();if(!box||box.width>390||box.x<0)throw new Error(`mobile metrics overflow: ${JSON.stringify(box)}`)
  await page.screenshot({path:'/tmp/cozinha360-delivery-os-v40-mobile.png',fullPage:true})

  console.log('delivery os v4.0 customer journey ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-delivery-os-v40-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await context.close();await browser.close()}
