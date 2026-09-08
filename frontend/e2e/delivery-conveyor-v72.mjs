import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const json=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)})
let writes=0
const now=new Date(Date.now()-18*60*1000).toISOString()
const overview={
 version:'4.1.0',
 business:{id:1,name:'Cozinha Esteira',city:'Mogi das Cruzes',currency:'BRL'},
 summary:{open_orders:2,delayed_orders:1,paid_orders:1,revenue_cents:7800,contribution_cents:3100,available_drivers:1,active_zones:1,scheduled_deliveries:0,in_transit:0,overdue_deliveries:0,open_routes:0},
 plan:{key:'core',status:'active',brand_limit:2,driver_limit:null,route_quota:0},plan_catalog:[],
 settings:{scheduled_orders_enabled:true,auto_accept_direct_orders:false,route_provider:'manual',route_optimization_enabled:false,customer_tracking_enabled:false,whatsapp_status_updates:false,brand_crm_isolation:true,prep_target_min:25,default_eta_min:45,sla_warning_minutes:10,max_scheduled_days:7},
 brands:[{id:1,name:'Brasa',slug:'brasa',active:true,primary_channel:'direct',sort_order:0}],brand_stats:[{brand_id:1,orders:2,open_orders:2,revenue_cents:7800,contribution_cents:3100}],
 channels:[{id:11,name:'iFood',fee_bps:0,fixed_fee_cents:0,delivery_cents:0,promo_cents:0,media_cents:0,traffic_active:true},{id:12,name:'Loja direta',fee_bps:0,fixed_fee_cents:0,delivery_cents:0,promo_cents:0,media_cents:0,traffic_active:true}],
 orders:[
  {id:101,brand_id:1,channel_id:11,customer_id:1,status:'production',source:'ifood',total_cents:4800,contribution_cents:1900,paid:true,delayed:true,error_flag:false,version:1,created_at:now,brand:{id:1,name:'Brasa',slug:'brasa',active:true,primary_channel:'direct',sort_order:0},channel:{id:11,name:'iFood'},customer:{id:1,name:'Ana'},delivery:null,items:[]},
  {id:102,brand_id:1,channel_id:12,customer_id:2,status:'checking',source:'direct',total_cents:3000,contribution_cents:1200,paid:false,delayed:false,error_flag:false,version:1,created_at:new Date(Date.now()-7*60*1000).toISOString(),brand:{id:1,name:'Brasa',slug:'brasa',active:true,primary_channel:'direct',sort_order:0},channel:{id:12,name:'Loja direta'},customer:{id:2,name:'Beto'},delivery:null,items:[]}
 ],
 zones:[{id:5,brand_id:null,name:'Centro',zone_type:'neighborhood',match_value:'Centro',fee_cents:500,min_order_cents:0,eta_min:35,active:true,version:1}],drivers:[{id:7,name:'Rafa',phone:'11999999999',vehicle:'moto',status:'available',active:true,version:1}],deliveries:[],
 loyalty:{mode:'off',points_per_real:1,cashback_bps:0,redeem_threshold:0,active:false},promos:[],storefronts:[{id:1,brand_id:1,slug:'brasa',display_name:'Brasa',active:true}],connections:[],customer_brand_profiles:[],routes:[],driver_ledger_summary:[]
}

await page.addInitScript(()=>localStorage.setItem('c360_token','token-v72'))
await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'delivery@example.com',full_name:'Operador'},businesses:[{id:1,name:'Cozinha Esteira',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/cozinha360-delivery-v40/businesses/1/overview',async route=>{
  if(route.request().method()!=='GET')writes++
  await route.fulfill(json(overview))
})

try{
 await page.goto('http://127.0.0.1:5173/?delivery=1',{waitUntil:'networkidle'})
 const conveyor=page.locator('[data-delivery-conveyor-v72]')
 await conveyor.waitFor({state:'visible',timeout:12000})
 await conveyor.getByRole('heading',{name:'Um pedido. Um caminho visível.',exact:true}).waitFor()
 const lane101=conveyor.getByRole('listitem',{name:/Pedido 101, iFood, com atenção/})
 const lane102=conveyor.getByRole('listitem',{name:/Pedido 102, Loja direta, no fluxo/})
 await lane101.waitFor();await lane102.waitFor()
 const kitchenRisk=lane101.locator('.dc72-stage.risk').filter({hasText:'Cozinha'})
 if(await kitchenRisk.count()!==1)throw new Error('delayed production order must light kitchen as risk')
 const checkingActive=lane102.locator('.dc72-stage.active').filter({hasText:'Conferência'})
 if(await checkingActive.count()!==1)throw new Error('checking order must light conference as active')
 await lane101.getByText('PAGO',{exact:true}).waitFor()
 await lane102.getByText('PENDENTE',{exact:true}).waitFor()
 await lane101.getByText('R$ 19,00',{exact:true}).waitFor().catch(()=>lane101.getByText(/19,00/).waitFor())
 await page.screenshot({path:'/tmp/cozinha360-delivery-conveyor-v72.png',fullPage:false})
 await lane101.click()
 await page.waitForTimeout(700)
 const focusedInside101=await page.evaluate(()=>{const active=document.activeElement;const row=active?.closest?.('.deliverym-order');return Boolean(row?.textContent?.includes('#101'))})
 if(!focusedInside101)throw new Error('conveyor click must focus the real order controls')
 if(writes!==0)throw new Error(`read-only conveyor must not mutate delivery state; writes=${writes}`)
 await page.setViewportSize({width:390,height:844})
 await page.waitForTimeout(250)
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)
 if(overflow>2)throw new Error(`delivery conveyor caused viewport overflow: ${overflow}px`)
 await page.screenshot({path:'/tmp/cozinha360-delivery-conveyor-v72-mobile.png',fullPage:false})
 console.log('delivery conveyor v7.2 ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-delivery-conveyor-v72-failure.png',fullPage:true}).catch(()=>{})
 throw error
}finally{await browser.close()}
