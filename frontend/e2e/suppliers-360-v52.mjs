import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1200}})
const page=await context.newPage()
await page.addInitScript(()=>localStorage.setItem('c360_token','suppliers-v52-token'))
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
let postCalls=0,patchCalls=0
const me={user:{id:1,email:'fornecedores@example.com',full_name:'Operador Fornecedores'},businesses:[{id:1,name:'Cozinha Fornecedores',city:'Mogi das Cruzes',role:'owner',preferences:{}}]}
const ingredients=[{id:11,name:'Frango',unit:'g'},{id:12,name:'Tortilha',unit:'un'}]
let suppliers=[
 {id:21,name:'Distribuidor A',cnpj:'',phone:'11999990001',backup_supplier:false,notes:'Entrega seg/qua',purchase_count:3,ingredient_ids:[11,12],ingredients_count:2,last_purchase_at:'2026-09-02T10:00:00Z',landed_total_cents:18200},
 {id:22,name:'Atacado B',cnpj:'',phone:'11999990002',backup_supplier:true,notes:'Plano B para proteína',purchase_count:1,ingredient_ids:[11],ingredients_count:1,last_purchase_at:'2026-08-28T10:00:00Z',landed_total_cents:6100},
]
const supplierData=()=>({generated_at:'2026-09-07T02:00:00Z',summary:{suppliers_total:suppliers.length,backup_suppliers:suppliers.filter(x=>x.backup_supplier).length,purchases_mapped:suppliers.reduce((s,x)=>s+x.purchase_count,0),ingredients_covered:new Set(suppliers.flatMap(x=>x.ingredient_ids||[])).size},rows:suppliers})
const comparison=ingredientId=>({generated_at:'2026-09-07T02:00:00Z',ingredient:ingredients.find(x=>x.id===ingredientId)||ingredients[0],summary:{suppliers_total:suppliers.length,suppliers_with_history:2,best_historical_per_1000_cents:1160},rows:[
 {supplier_id:21,supplier_name:'Distribuidor A',phone:'11999990001',backup_supplier:false,has_history:true,last_purchase_at:'2026-09-02T10:00:00Z',quantity_milliunits:5000,landed_cents:5800,landed_per_1000_cents:1160,days_since:4,best_historical_reference:true},
 {supplier_id:22,supplier_name:'Atacado B',phone:'11999990002',backup_supplier:true,has_history:true,last_purchase_at:'2026-08-28T10:00:00Z',quantity_milliunits:5000,landed_cents:6100,landed_per_1000_cents:1220,days_since:9,best_historical_reference:false},
 ...suppliers.filter(x=>x.id>22).map(x=>({supplier_id:x.id,supplier_name:x.name,phone:x.phone,backup_supplier:x.backup_supplier,has_history:false,last_purchase_at:null,quantity_milliunits:0,landed_cents:0,landed_per_1000_cents:null,days_since:null,best_historical_reference:false})),
],safety_note:'Comparação histórica não é cotação ao vivo.'})

await page.route('**/api/me',route=>route.fulfill(json(me)))
await page.route('**/api/businesses/1/ingredients',route=>route.fulfill(json(ingredients)))
await page.route('**/api/businesses/1/suppliers',async route=>{
 if(route.request().method()==='GET')return route.fulfill(json(supplierData()))
 if(route.request().method()==='POST'){
  postCalls+=1;const payload=route.request().postDataJSON()
  if(payload.name!=='Hortifruti C'||payload.phone!=='11 98888-7777'||payload.backup_supplier!==true)throw new Error(`unexpected supplier payload ${JSON.stringify(payload)}`)
  suppliers=[...suppliers,{id:23,name:payload.name,cnpj:payload.cnpj||'',phone:payload.phone,backup_supplier:true,notes:payload.notes||'',purchase_count:0,ingredient_ids:[],ingredients_count:0,last_purchase_at:null,landed_total_cents:0}]
  return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(suppliers.at(-1))})
 }
 return route.continue()
})
await page.route('**/api/businesses/1/suppliers/21',async route=>{
 if(route.request().method()!=='PATCH')return route.continue()
 patchCalls+=1;const payload=route.request().postDataJSON();if(payload.backup_supplier!==true)throw new Error(`unexpected backup payload ${JSON.stringify(payload)}`)
 suppliers=suppliers.map(x=>x.id===21?{...x,backup_supplier:true}:x)
 return route.fulfill(json(suppliers.find(x=>x.id===21)))
})
await page.route('**/api/businesses/1/supplier-comparison?ingredient_id=*',route=>{
 const url=new URL(route.request().url());return route.fulfill(json(comparison(Number(url.searchParams.get('ingredient_id')||11))))
})

try{
 await page.goto('http://127.0.0.1:5173/?suppliers=1&ingredient_id=12',{waitUntil:'networkidle'})
 const heading=page.getByRole('heading',{name:'Saiba com quem comprar antes de faltar.',exact:true});await heading.waitFor({timeout:15000})
 const hero=await heading.boundingBox();if(!hero||hero.y>260)throw new Error(`Fornecedores 360 hero below fold: ${JSON.stringify(hero)}`)
 if(await page.getByLabel('Ingrediente para comparar').inputValue()!=='12')throw new Error('ingredient deep link did not select Tortilha')
 await page.getByText('por 1.000 un · não é cotação atual',{exact:true}).waitFor()
 const purchaseHref=await page.getByRole('link',{name:/Abrir Compras 360/}).getAttribute('href');if(purchaseHref!=='/?purchases=1&ingredient_id=12')throw new Error(`purchase deep link lost ingredient: ${purchaseHref}`)
 await page.getByText('Distribuidor A',{exact:true}).first().waitFor()
 await page.getByText('Atacado B',{exact:true}).first().waitFor()
 await page.getByText('MENOR REFERÊNCIA HISTÓRICA',{exact:true}).waitFor()
 if(postCalls!==0||patchCalls!==0)throw new Error('supplier writes must never happen before an explicit user action')

 await page.getByLabel('Nome do fornecedor').fill('Hortifruti C')
 await page.getByLabel('Telefone').fill('11 98888-7777')
 await page.getByLabel('Notas').fill('Entrega diária até 11h')
 await page.getByText('É fornecedor alternativo',{exact:true}).click()
 await page.getByRole('button',{name:'Salvar fornecedor',exact:true}).click()
 await page.getByText('Fornecedor salvo. Use compras reais para construir a comparação histórica.',{exact:true}).waitFor()
 await page.getByText('Hortifruti C',{exact:true}).first().waitFor()
 if(postCalls!==1)throw new Error(`expected one explicit supplier creation, got ${postCalls}`)

 const principal=page.locator('.sup52-card').filter({hasText:'Distribuidor A'})
 await principal.getByRole('button',{name:'Marcar plano B',exact:true}).click()
 await page.getByText('Distribuidor A marcado como fornecedor alternativo.',{exact:true}).waitFor()
 if(patchCalls!==1)throw new Error(`expected one explicit supplier update, got ${patchCalls}`)
 await page.screenshot({path:'/tmp/cozinha360-suppliers-v52.png',fullPage:true})

 await page.setViewportSize({width:390,height:844})
 await heading.scrollIntoViewIfNeeded();const mobile=await heading.boundingBox();if(!mobile||mobile.width>380)throw new Error(`Fornecedores 360 mobile overflow: ${JSON.stringify(mobile)}`)
 await page.screenshot({path:'/tmp/cozinha360-suppliers-v52-mobile.png',fullPage:true})
 console.log('Fornecedores 360 explicit-write, ingredient deep-link and comparison journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-suppliers-v52-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await context.close();await browser.close()}
