import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}})
await page.addInitScript(()=>localStorage.setItem('c360_token','kds-sla-v54-token'))
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
let patchCalls=0
let settings={business_id:1,default_kds_sla_minutes:20,products:[{id:10,name:'Wrap SLA',category:'wraps',prep_sla_minutes:20,active:true},{id:11,name:'Pizza SLA',category:'pizzas',prep_sla_minutes:30,active:true}],channels:[{id:3,name:'WhatsApp',order_sla_minutes:15,traffic_active:true},{id:4,name:'iFood',order_sla_minutes:40,traffic_active:true}]}

await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'sla@example.com',full_name:'Operador SLA'},businesses:[{id:1,name:'Cozinha SLA',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))
await page.route('**/api/businesses/1/ingredients',route=>route.fulfill(json([])))
await page.route('**/api/businesses/1/products/10/recipe',route=>route.fulfill(json([])))
await page.route('**/api/businesses/1/products/11/recipe',route=>route.fulfill(json([])))
await page.route('**/cozinha360-kds-v54/businesses/1/kds/settings',async route=>{
  if(route.request().method()==='GET')return route.fulfill(json(settings))
  if(route.request().method()==='PATCH'){
    patchCalls+=1
    const payload=route.request().postDataJSON()
    if(payload.default_kds_sla_minutes!==25)throw new Error(`unexpected default SLA ${JSON.stringify(payload)}`)
    const wrap=payload.products.find(row=>row.id===10),whatsapp=payload.channels.find(row=>row.id===3)
    if(wrap?.prep_sla_minutes!==18||whatsapp?.order_sla_minutes!==22)throw new Error(`unexpected SLA settings payload ${JSON.stringify(payload)}`)
    settings={...settings,default_kds_sla_minutes:25,products:settings.products.map(row=>row.id===10?{...row,prep_sla_minutes:18}:row),channels:settings.channels.map(row=>row.id===3?{...row,order_sla_minutes:22}:row)}
    return route.fulfill(json(settings))
  }
  return route.continue()
})
await page.route('**/cozinha360-kds-v54/businesses/1/kds',route=>route.fulfill(json({business_id:1,default_kds_sla_minutes:20,summary:{open_orders:2,prep_orders:2,overdue:1,at_risk:0,sla_conflicts:1},orders:[
  {id:42,status:'production',source:'whatsapp',total_cents:4200,age_minutes:18,delayed:true,version:2,prep_sla_minutes:20,channel_sla_minutes:15,effective_sla_minutes:15,due_in_minutes:-3,urgency:'overdue',sla_conflict:true,channel:{id:3,name:'WhatsApp'},items:[{product_id:10,name:'Wrap SLA',quantity:2,prep_sla_minutes:20,sla_source:'product'}]},
  {id:43,status:'confirmed',source:'ifood',total_cents:6000,age_minutes:5,delayed:false,version:1,prep_sla_minutes:30,channel_sla_minutes:40,effective_sla_minutes:30,due_in_minutes:25,urgency:'on_track',sla_conflict:false,channel:{id:4,name:'iFood'},items:[{product_id:11,name:'Pizza SLA',quantity:1,prep_sla_minutes:30,sla_source:'product'}]},
]})))

try{
  await page.goto('http://127.0.0.1:5173/?kitchen=1',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Produção agrupada.',exact:true}).waitFor({timeout:15000})
  const wrap=page.locator('.batch-card').filter({hasText:'Wrap SLA'})
  await wrap.getByText('ESTOURADO',{exact:true}).waitFor()
  await wrap.getByText('estourou 3 min',{exact:true}).waitFor()
  await wrap.getByText(/prazo do canal é menor/i).waitFor()
  await page.getByText('1',{exact:true}).first().waitFor()
  if(patchCalls!==0)throw new Error('KDS settings must not persist before explicit save')

  await page.getByRole('button',{name:'Configurar SLA',exact:true}).click()
  await page.getByRole('heading',{name:'SLAs da operação',exact:true}).waitFor()
  await page.getByLabel('SLA padrão da cozinha').fill('25')
  await page.getByLabel('SLA do produto Wrap SLA').fill('18')
  await page.getByLabel('SLA do canal WhatsApp').fill('22')
  if(patchCalls!==0)throw new Error('editing SLA fields must remain local until Save')
  await page.getByRole('button',{name:'Salvar SLAs',exact:true}).click()
  await page.getByText('SLAs salvos. A fila foi recalculada sem alterar nenhum pedido.',{exact:true}).waitFor()
  if(patchCalls!==1)throw new Error(`expected one explicit SLA write, got ${patchCalls}`)
  await page.screenshot({path:'/tmp/cozinha360-kds-sla-v54.png',fullPage:true})

  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'Configurar SLA',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'SLAs da operação'})
  await dialog.waitFor();const box=await dialog.boundingBox();if(!box||box.width>390)throw new Error(`SLA settings overflow on mobile: ${JSON.stringify(box)}`)
  await page.screenshot({path:'/tmp/cozinha360-kds-sla-v54-mobile.png',fullPage:true})
  console.log('KDS SLA v5.4 countdown, conflict and explicit-save journey ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-kds-sla-v54-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
