import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
await page.addInitScript(()=>{
  localStorage.setItem('c360_token','browser-test-token')
  localStorage.setItem('c360-cash-v28-1',JSON.stringify({
    fixed:{internet:'120',formalization:'150',systems:'99',cleaning:'80',baseEnergy:'150',maintenance:'50',ownerPay:'2000',other:'100'},
    plannedContribution:'12',plannedOrders:'120',workingDays:'26',windowsPerDay:'1',cashBalance:'3000',targetProfit:''
  }))
  localStorage.setItem('c360-playbook-v21-1',JSON.stringify({
    stages:[{minutes:6,parallel:2},{minutes:4,parallel:1},{minutes:3,parallel:1},{minutes:5,parallel:1}],safety:25
  }))
})
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'cash@example.com',full_name:'Cash E2E'},businesses:[{id:1,name:'Cozinha Cash',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))
await page.route('**/api/businesses/1/memory/**',route=>route.fulfill(json({namespace:'cash',data:{},version:1,updated_at:null})))
await page.route('**/api/businesses/1/finance/summary?days=30',route=>route.fulfill(json({period_days:30,revenue_cents:90000,variable_costs_cents:54000,contribution_cents:36000,contribution_margin_bps:4000,loss_cents:0,purchases_landed_cents:0,order_count:30})))
await page.route('**/api/businesses/1/dashboard',route=>route.fulfill(json({pulse:{revenue_cents:90000,contribution_cents:36000,loss_cents:0},open_orders:0,delay_rate:0,error_rate:0,next_action:{code:'stable',title:'Operação estável',severity:'info'}})))
try{
  await page.goto('http://127.0.0.1:5173/?cash=1',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Quanto precisa vender para o caixa respirar?',exact:true}).waitFor({timeout:15000})

  const flow=page.locator('[data-cash-flow-v68]')
  await flow.waitFor({state:'visible',timeout:10000})
  await flow.getByRole('heading',{name:'Veja para onde o dinheiro foi.',exact:true}).waitFor()
  await flow.getByText('FLUXO OBSERVADO · 30 DIAS',{exact:true}).waitFor()
  await flow.getByText('60% da receita observada',{exact:true}).waitFor()
  await flow.getByText('40% de margem de contribuição',{exact:true}).waitFor()
  await flow.getByText('CONFERIDA',{exact:true}).waitFor()
  await flow.getByText('receita − variável = contribuição',{exact:true}).waitFor()
  await flow.getByText('Fluxo observado, não DRE contábil.',{exact:true}).waitFor()
  const flowText=(await flow.innerText()).replace(/\u00a0/g,' ')
  for(const amount of ['R$ 900,00','R$ 540,00','R$ 360,00']){
    if(!flowText.includes(amount))throw new Error(`money flow missing observed amount ${amount}: ${flowText}`)
  }

  await page.getByText('R$ 2.749',{exact:true}).waitFor()
  await page.getByText('230 pedidos/mês',{exact:true}).first().waitFor()
  const projected=page.locator('.cash-result').filter({hasText:'Resultado projetado'})
  await projected.locator('strong').getByText('-R$ 1.309',{exact:true}).waitFor()
  const capacity=page.locator('.cash-capacity-line')
  await capacity.getByText('234',{exact:true}).waitFor()
  await capacity.getByText('9',{exact:true}).waitFor()
  const runway=page.locator('.cash-result').filter({hasText:'Runway de caixa'})
  await runway.locator('strong').getByText('2.3 meses',{exact:true}).waitFor()

  await page.setViewportSize({width:390,height:844})
  await page.reload({waitUntil:'networkidle'})
  const mobileFlow=page.locator('[data-cash-flow-v68]')
  await mobileFlow.waitFor({state:'visible',timeout:10000})
  const box=await mobileFlow.boundingBox()
  if(!box||box.x<0||box.width>390)throw new Error(`cash flow overflows mobile viewport: ${JSON.stringify(box)}`)

  await page.screenshot({path:'/tmp/cozinha360-cash-engine.png',fullPage:true})
  console.log('cash and margin monthly model + live money flow ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-cash-engine-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
