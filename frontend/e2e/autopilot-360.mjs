import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}})
await page.addInitScript(()=>{
  localStorage.setItem('c360_token','browser-test-token')
  localStorage.setItem('c360-autopilot-v37-1',JSON.stringify({horizon:1,bufferPct:10,minConfidence:'medium',protectStock:true}))
})
const json=(body,status=200)=>({status,contentType:'application/json',body:JSON.stringify(body)})
await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'auto@example.com',full_name:'Autopilot E2E'},businesses:[{id:1,name:'Cozinha Autopilot',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))
await page.route('**/api/businesses/1/memory/**',route=>route.fulfill(json({namespace:'autopilot',data:{},version:1,updated_at:null})))
let applied=false
const baseProduct={historical_units_28d:28,recent_units_7d:10,forecast_units:7,open_committed_units:1,recommended_units:8,confidence:'high',confidence_ok:true,method:'weighted_moving_average_7_21',trend:'accelerating',trend_ratio:1.67,recipe_complete:true,stock_risk:false,blocked_reason:null}
const plan=()=>({
 business_id:1,generated_at:'2026-09-06T12:00:00Z',plan_hash:applied?'hash-after':'hash-before',horizon_days:1,buffer_pct:10,min_confidence:'medium',protect_stock:true,
 summary:applied?{forecast_units:11,target_units:15,planned_remaining_units:11,to_plan_units:4,eligible_units:0,blocked_units:4,stock_shortages:1,missing_recipes:0,low_confidence:0,growth_allowed:false}:{forecast_units:11,target_units:15,planned_remaining_units:3,to_plan_units:12,eligible_units:8,blocked_units:4,stock_shortages:1,missing_recipes:0,low_confidence:0,growth_allowed:false},
 guard:{growth_allowed:false,contribution_cents_30d:42000,revenue_cents_30d:120000,orders_30d:40,delay_rate:.05,error_rate:.02},
 products:[
  {...baseProduct,product_id:10,product_name:'Smash da Casa',target_units:8,planned_remaining_units:applied?8:0,to_plan_units:applied?0:8,eligible:!applied},
  {...baseProduct,product_id:11,product_name:'Batata Crocante',historical_units_28d:20,recent_units_7d:6,forecast_units:4,open_committed_units:0,recommended_units:4,target_units:4,planned_remaining_units:3,to_plan_units:1,trend:'stable',trend_ratio:1,stock_risk:true,blocked_reason:'stock_shortage',eligible:false}
 ],
 components:[
  {ingredient_id:1,name:'Carne',unit:'g',required_milliunits:1600,on_hand_milliunits:2200,projected_milliunits:600,shortage_milliunits:0,affected_product_ids:[10]},
  {ingredient_id:2,name:'Óleo',unit:'ml',required_milliunits:800,on_hand_milliunits:500,projected_milliunits:-300,shortage_milliunits:300,affected_product_ids:[11]}
 ],
 next_action:{code:'stock',title:'Cobrir insumos antes de acelerar',detail:'1 componente(s) não cobrem o alvo previsto.',href:'/?kitchen=1'},
 source:{forecast_method:'weighted_moving_average_7_21',forecast_basis_days:28,decision_mode:'human_approval_required'}
})
await page.route('**/cozinha360-autopilot-v37/businesses/1/plan*',route=>route.fulfill(json(plan())))
await page.route('**/cozinha360-autopilot-v37/businesses/1/runs',route=>route.fulfill(json({business_id:1,runs:applied?[{request_id:'11111111-1111-4111-8111-111111111111',horizon_days:1,buffer_bps:1000,plan_hash:'hash-before',status:'completed',action_count:1,result_json:{},created_at:'2026-09-06T12:01:00Z',updated_at:'2026-09-06T12:01:01Z'}]:[]})))
await page.route('**/cozinha360-autopilot-v37/businesses/1/apply',async route=>{const body=route.request().postDataJSON();if(body.expected_plan_hash!=='hash-before'||body.selected_product_ids?.[0]!==10)return route.fulfill(json({detail:'payload inesperado'},422));applied=true;return route.fulfill(json({request_id:body.request_id,status:'completed',created:[{product_id:10,product_name:'Smash da Casa',batch_id:55,planned_qty:8,recovered:false}],failed:[],plan_hash:'hash-before',applied_at:'2026-09-06T12:01:00Z',replay:false}))})
try{
  await page.goto('http://127.0.0.1:5173/?autopilot=1',{waitUntil:'domcontentloaded'})
  await page.getByRole('heading',{name:'Um motor para decidir antes do pico.',exact:true}).waitFor({timeout:15000})
  await page.getByText('SEGURAR',{exact:true}).waitFor()
  await page.getByText('Smash da Casa',{exact:true}).waitFor()
  await page.getByText('Batata Crocante',{exact:true}).waitFor()
  await page.getByText('Falta de insumo',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Revisar e aprovar'}).click()
  await page.getByRole('heading',{name:'Criar 1 lote(s)?',exact:true}).waitFor()
  await page.getByRole('button',{name:'Aprovar lotes'}).click()
  await page.getByText('Últimas execuções.').waitFor()
  await page.getByText('1 ação(ões) · completed',{exact:true}).waitFor()
  await page.screenshot({path:'/tmp/cozinha360-autopilot-360.png',fullPage:true})
  console.log('autopilot forecast-prep-stock approval journey ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-autopilot-360-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
