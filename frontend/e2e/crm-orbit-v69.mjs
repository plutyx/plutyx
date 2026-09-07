import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})

await page.addInitScript(()=>localStorage.setItem('c360_token','browser-test-token'))
await page.route('**/api/me',route=>route.fulfill(json({
  user:{id:1,email:'crm@example.com',full_name:'CRM E2E'},
  businesses:[{id:1,name:'Cozinha CRM',city:'Mogi das Cruzes',role:'owner',preferences:{}}]
})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))
await page.route('**/api/businesses/1/memory/**',route=>route.fulfill(json({namespace:'crm',data:{},version:1,updated_at:null})))
await page.route('**/api/businesses/1/inventory/alerts',route=>route.fulfill(json([])))

const lifecycle={
  dormant_days:30,
  summary:{total:8,new:2,repeat:3,dormant:2,prospect:1,contactable:5,dormant_contactable:1,revenue_cents:124000,contribution_cents:52000},
  customers:[
    {customer_id:1,customer_name:'Ana Nova',phone:'11999990001',email:'',can_contact:true,completed_orders:1,revenue_cents:2200,contribution_cents:900,days_since_last_order:2,segment:'new',suggested_action:'segunda compra'},
    {customer_id:2,customer_name:'Bruno Recorrente',phone:'11999990002',email:'',can_contact:true,completed_orders:6,revenue_cents:18000,contribution_cents:7600,days_since_last_order:4,segment:'repeat',suggested_action:'proteger recorrência'},
    {customer_id:3,customer_name:'Carla Sumida',phone:'11999990003',email:'',can_contact:true,completed_orders:3,revenue_cents:9600,contribution_cents:3500,days_since_last_order:42,segment:'dormant',suggested_action:'retorno'},
    {customer_id:4,customer_name:'Davi Prospect',phone:'11999990004',email:'',can_contact:false,completed_orders:0,revenue_cents:0,contribution_cents:0,days_since_last_order:null,segment:'prospect',suggested_action:'aguardar compra'},
  ]
}
await page.route('**/cozinha360-crm-v16/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/businesses/1/customer-lifecycle'))return route.fulfill(json(lifecycle))
  return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:`CRM mock route not found: ${path}`})})
})

try{
  await page.goto('http://127.0.0.1:5173/?crm=1',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Saiba quem acabou de chegar, quem voltou e quem sumiu.',exact:true}).waitFor({timeout:15000})

  const orbit=page.locator('[data-crm-orbit-v69]')
  await orbit.waitFor({state:'visible',timeout:10000})
  await orbit.getByRole('heading',{name:'Veja sua base se mover.',exact:true}).waitFor()
  await orbit.getByText('5 com consentimento',{exact:true}).waitFor()
  await orbit.getByText('63% da base',{exact:true}).waitFor()
  const dormantContact=orbit.locator('.crm69-consent article').filter({hasText:'SUMIDOS + CONTATO PERMITIDO'})
  await dormantContact.getByText('1',{exact:true}).waitFor()

  await orbit.getByRole('button',{name:'Recorrentes: 3',exact:true}).click()
  const activeRepeat=page.locator('.crm-tabs button.active')
  await activeRepeat.getByText('Recorrentes',{exact:true}).waitFor()
  await page.getByText('Bruno Recorrente',{exact:true}).waitFor()
  if(await page.getByText('Ana Nova',{exact:true}).count())throw new Error('new customer remained visible after relationship-orbit repeat filter')

  await orbit.getByRole('button',{name:'Sumidos: 2',exact:true}).click()
  await page.locator('.crm-tabs button.active').getByText('Sumidos',{exact:true}).waitFor()
  await page.getByText('Carla Sumida',{exact:true}).waitFor()
  await page.getByText('Pode contatar',{exact:true}).waitFor()
  if(await page.getByText('Davi Prospect',{exact:true}).count())throw new Error('prospect remained visible after relationship-orbit dormant filter')

  await orbit.getByRole('button',{name:'Ver todos',exact:true}).click()
  await page.locator('.crm-tabs button.active').getByText('Todos',{exact:true}).waitFor()
  await page.getByText('Davi Prospect',{exact:true}).waitFor()
  const prospect=page.locator('.crm-list article').filter({hasText:'Davi Prospect'})
  await prospect.getByText('Não contatar',{exact:true}).waitFor()

  await page.setViewportSize({width:390,height:844})
  await page.reload({waitUntil:'networkidle'})
  const mobileOrbit=page.locator('[data-crm-orbit-v69]')
  await mobileOrbit.waitFor({state:'visible',timeout:10000})
  const box=await mobileOrbit.boundingBox()
  if(!box||box.x<0||box.width>390)throw new Error(`CRM orbit overflows mobile viewport: ${JSON.stringify(box)}`)

  await page.screenshot({path:'/tmp/cozinha360-crm-orbit-v69.png',fullPage:true})
  console.log('consent-aware CRM relationship orbit controls the real lifecycle filters')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-crm-orbit-v69-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
