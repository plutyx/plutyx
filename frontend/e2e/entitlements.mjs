import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1200}})
await page.addInitScript(()=>localStorage.setItem('c360_token','browser-test-token'))
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'cliente@example.com',full_name:'Cliente Real'},businesses:[{id:1,name:'Cozinha Cliente',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/cozinha360-entitlements-v34/**',route=>route.fulfill(json({
 business_id:1,
 commercial_state:'candidate',
 enforcement_mode:'observe_only',
 billing_configured:false,
 provider:'none',
 plan_key:'candidate',
 status:'candidate',
 current_period_end:null,
 cancel_at_period_end:false,
 features:['core','system360','cash','connections','control','execution','playbook','vitrine','growth','kitchen','crm','margin','direct'],
 access_allowed:true,
 reason:'commercial_billing_not_activated',
 updated_at:null,
})))
try{
 await page.goto('http://127.0.0.1:5173/?plan=1',{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'A cobrança não decide pelo navegador.',exact:true}).waitFor({timeout:15000})
 await page.getByText('AMBIENTE CANDIDATO',{exact:true}).waitFor()
 await page.getByText('OBSERVAÇÃO — SEM BLOQUEIO',{exact:true}).waitFor()
 await page.getByRole('heading',{name:'Cobrança automática ainda não ativada.',exact:true}).waitFor()
 await page.getByText('Entitlement no servidor',{exact:true}).waitFor()
 await page.getByText('Ledger idempotente',{exact:true}).waitFor()
 await page.getByText('Checkout real',{exact:true}).waitFor()
 await page.getByText('Webhook assinado',{exact:true}).waitFor()
 await page.getByText('Pedidos, produtos, custos e financeiro',{exact:true}).waitFor()
 await page.getByText('LIBERADO',{exact:true}).first().waitFor()
 await page.screenshot({path:'/tmp/cozinha360-entitlements.png',fullPage:true})
 console.log('server entitlement candidate-state journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-entitlements-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await browser.close()}
