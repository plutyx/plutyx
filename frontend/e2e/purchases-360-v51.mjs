import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1200}})
const page=await context.newPage()
await page.addInitScript(()=>localStorage.setItem('c360_token','purchases-v53-token'))
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
let purchasePosted=false,postCalls=0,coverDays=7

const me={user:{id:1,email:'compras@example.com',full_name:'Operador Compras'},businesses:[{id:1,name:'Cozinha Compras',city:'Mogi das Cruzes',role:'owner',preferences:{}}]}
const ingredients=[
 {id:11,name:'Frango',unit:'g',on_hand_milliunits:0,par_level_milliunits:2000,reorder_target_milliunits:5000,last_purchase_price_cents:5800,last_purchase_qty_milliunits:5000,usable_qty_milliunits:5000,version:3},
 {id:12,name:'Tortilha',unit:'un',on_hand_milliunits:10,par_level_milliunits:20,reorder_target_milliunits:50,last_purchase_price_cents:2500,last_purchase_qty_milliunits:50,usable_qty_milliunits:50,version:2},
]
const suppliers={generated_at:'2026-09-07T02:00:00Z',summary:{suppliers_total:2,backup_suppliers:1,purchases_mapped:4,ingredients_covered:2},rows:[
 {id:21,name:'Distribuidor A',backup_supplier:false,purchase_count:3,ingredients_count:2,last_purchase_at:'2026-09-01T10:00:00Z',landed_total_cents:17000},
 {id:22,name:'Atacado B',backup_supplier:true,purchase_count:1,ingredients_count:1,last_purchase_at:'2026-08-28T10:00:00Z',landed_total_cents:6100},
]}
const commonSummary=()=>({history_days:28,cover_days:coverDays,completed_orders:18,open_orders:2,recipe_coverage_bps:10000,demand_confidence:'medium'})
const tortilha=()=>({ingredient_id:12,name:'Tortilha',unit:'un',on_hand_milliunits:10,par_level_milliunits:20,reorder_target_milliunits:50,baseline_purchase_milliunits:40,committed_milliunits:5,forecast_milliunits:45,projected_after_committed_milliunits:5,demand_uplift_milliunits:20,stock_cover_days:0.8,suggested_purchase_milliunits:60,last_purchase_price_cents:2500,last_purchase_qty_milliunits:50,estimated_landed_cents:3000,cost_confidence:'reference',demand_signal:'medium',reason:'demand',tone:'warning'})
const plan=()=>({
 generated_at:'2026-09-07T02:15:00Z',method:'demand_weighted_7_21_plus_par_target',
 summary:{items_to_buy:purchasePosted?1:2,critical:purchasePosted?0:1,estimated_landed_cents:purchasePosted?3000:8800,missing_cost_reference:0,demand_protected_items:1,...commonSummary()},
 items:purchasePosted?[tortilha()]:[
  {ingredient_id:11,name:'Frango',unit:'g',on_hand_milliunits:0,par_level_milliunits:2000,reorder_target_milliunits:5000,baseline_purchase_milliunits:5000,committed_milliunits:1000,forecast_milliunits:1000,projected_after_committed_milliunits:-1000,demand_uplift_milliunits:0,stock_cover_days:0,suggested_purchase_milliunits:5000,last_purchase_price_cents:5800,last_purchase_qty_milliunits:5000,estimated_landed_cents:5800,cost_confidence:'reference',demand_signal:'medium',reason:'target',tone:'critical'},
  tortilha(),
 ],
 safety_note:`Previsão determinística: últimos 28 dias, maior peso para os 7 dias recentes e horizonte de ${coverDays} dias. A compra só altera estoque após confirmação explícita.`,
})
const history=()=>({generated_at:'2026-09-07T02:15:00Z',rows:[
 ...(purchasePosted?[{id:102,ingredient_id:11,ingredient_name:'Frango',unit:'g',supplier_name:'Distribuidor A',quantity_milliunits:5000,total_cents:6000,freight_cents:500,tax_cents:0,landed_cents:6500,landed_per_1000_cents:1300,previous_landed_per_1000_cents:1160,change_bps:1207,created_at:'2026-09-07T02:15:00Z'}]:[]),
 {id:101,ingredient_id:11,ingredient_name:'Frango',unit:'g',supplier_name:'Distribuidor A',quantity_milliunits:5000,total_cents:5800,freight_cents:0,tax_cents:0,landed_cents:5800,landed_per_1000_cents:1160,previous_landed_per_1000_cents:1050,change_bps:1048,created_at:'2026-09-01T10:00:00Z'},
]})

await page.route('**/api/me',route=>route.fulfill(json(me)))
await page.route('**/api/businesses/1/ingredients',route=>route.fulfill(json(ingredients)))
await page.route('**/api/businesses/1/suppliers',route=>route.fulfill(json(suppliers)))
await page.route('**/api/businesses/1/purchase-plan*',route=>{const url=new URL(route.request().url());coverDays=Number(url.searchParams.get('cover_days')||7);return route.fulfill(json(plan()))})
await page.route('**/api/businesses/1/purchases?limit=40',route=>route.fulfill(json(history())))
await page.route('**/api/businesses/1/purchases',async route=>{
 if(route.request().method()!=='POST')return route.continue()
 postCalls+=1
 const payload=route.request().postDataJSON()
 if(payload.ingredient_id!==11||payload.supplier_id!==21||payload.quantity_milliunits!==5000||payload.total_cents!==6000||payload.freight_cents!==500)throw new Error(`unexpected purchase payload ${JSON.stringify(payload)}`)
 purchasePosted=true
 await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:102,ingredient_id:11,old_reference_cents:5800,new_reference_cents:6500,increase_bps:1200,price_alert:true,on_hand_milliunits:5000,idempotency_key:payload.idempotency_key})})
})

try{
 await page.goto('http://127.0.0.1:5173/?purchases=1',{waitUntil:'networkidle'})
 const heading=page.getByRole('heading',{name:'Compre pelo alvo. Não pelo susto.',exact:true})
 await heading.waitFor({timeout:15000})
 const heroBox=await heading.boundingBox();if(!heroBox||heroBox.y>260)throw new Error(`Compras 360 hero below fold: ${JSON.stringify(heroBox)}`)
 const statusBox=await page.locator('.buy51-hero aside').boundingBox();if(!statusBox||statusBox.height>240)throw new Error(`Compras 360 status card oversized: ${JSON.stringify(statusBox)}`)
 await page.getByText('PREVISÃO OPERACIONAL',{exact:true}).waitFor()
 await page.getByText('28 dias de histórico → proteção para os próximos 7 dias',{exact:true}).waitFor()
 await page.getByText('FILA SUPERA ESTOQUE',{exact:true}).waitFor()
 await page.getByText('DEMANDA ELEVA COMPRA',{exact:true}).waitFor()
 await page.getByText('Frango',{exact:true}).first().waitFor()
 if(postCalls!==0)throw new Error('purchase must never happen before explicit confirmation')

 await page.getByLabel('Horizonte da previsão').selectOption('14')
 await page.getByText('28 dias de histórico → proteção para os próximos 14 dias',{exact:true}).waitFor()
 if(postCalls!==0)throw new Error('changing forecast horizon must never create a purchase')

 const frango=page.locator('.buy51-plan-row').filter({hasText:'Frango'})
 await frango.getByRole('button',{name:'Preparar',exact:true}).click()
 await page.getByLabel('Quantidade').waitFor()
 if(await page.getByLabel('Quantidade').inputValue()!=='5000')throw new Error('recommended quantity was not transferred to confirmation form')
 await page.getByLabel('Fornecedor').selectOption('21')
 await page.getByLabel('Valor dos itens').fill('60.00')
 await page.getByLabel('Frete').fill('5.00')
 await page.getByLabel('Tributos/outros').fill('0')
 await page.getByText('R$ 65,00',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Confirmar compra e dar entrada no estoque',exact:true}).click()
 await page.getByText(/referência de custo subiu 12/).waitFor()
 if(postCalls!==1)throw new Error(`expected exactly one confirmed purchase, got ${postCalls}`)
 await page.locator('.buy51-history-row').filter({hasText:'Distribuidor A'}).filter({hasText:'R$ 65,00'}).waitFor()
 await page.screenshot({path:'/tmp/cozinha360-purchases-v53.png',fullPage:true})

 await page.setViewportSize({width:390,height:844})
 await heading.scrollIntoViewIfNeeded()
 const mobileHeading=await heading.boundingBox();if(!mobileHeading||mobileHeading.width>380)throw new Error(`Compras 360 mobile hero overflow: ${JSON.stringify(mobileHeading)}`)
 const forecastBox=await page.locator('.buy51-forecast').boundingBox();if(!forecastBox||forecastBox.width>390)throw new Error(`forecast panel mobile overflow: ${JSON.stringify(forecastBox)}`)
 await page.screenshot({path:'/tmp/cozinha360-purchases-v53-mobile.png',fullPage:true})
 console.log('Compras 360 demand-aware planning, explicit-confirmation and supplier-link journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-purchases-v53-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await context.close();await browser.close()}
