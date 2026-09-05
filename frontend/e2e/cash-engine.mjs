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
  await page.getByText('R$ 2.749',{exact:true}).waitFor()
  await page.getByText('230 pedidos/mês',{exact:true}).first().waitFor()
  await page.getByText(/1\.309/).waitFor()
  await page.getByText('234',{exact:true}).waitFor()
  await page.getByText('9',{exact:true}).waitFor()
  await page.getByText(/2,3 meses/).waitFor()
  await page.screenshot({path:'/tmp/cozinha360-cash-engine.png',fullPage:true})
  console.log('cash and margin monthly model ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-cash-engine-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
