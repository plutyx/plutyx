import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1400}})
await page.addInitScript(()=>localStorage.setItem('c360_token','browser-test-token'))
const ok=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
const err=(status,body)=>({status,contentType:'application/json',body:JSON.stringify(body)})

await page.route('**/api/me',route=>route.fulfill(ok({
 user:{id:1,email:'cliente@example.com',full_name:'Cliente Real'},
 businesses:[{id:1,name:'Cozinha Cliente',city:'Mogi das Cruzes',role:'owner',preferences:{}}]
})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(ok({business_id:1,states:{}})))

const brands=[
 {id:1,name:'Bolso Burgers',slug:'bolso-burgers',active:true,primary_channel:'direct'},
 {id:2,name:'Shawarma 360',slug:'shawarma-360',active:true,primary_channel:'direct'}
]
const connections=[
 {id:10,provider:'ifood',display_name:'Loja iFood Centro',status:'active',last_success_at:'2026-09-06T12:00:00Z',last_error:null},
 {id:11,provider:'whatsapp',display_name:'WhatsApp Principal',status:'active',last_success_at:'2026-09-06T12:00:00Z',last_error:null},
 {id:12,provider:'mercadopago',display_name:'Mercado Pago Operação',status:'active',last_success_at:'2026-09-06T12:00:00Z',last_error:null}
]
const baseProviders=[
 ['direct','Loja própria Cozinha 360','Pedidos','native','ready','Venda direta sem comissão do Cozinha 360.',true,'active',null],
 ['whatsapp','WhatsApp Business','Pedidos & CRM','connection','oauth','Atendimento, pedidos e recompra com consentimento.',true,'active',connections[1]],
 ['mercadopago','Mercado Pago / Pix','Pagamento','connection','oauth','Confirmação de pagamento e conciliação sem conferir Pix manualmente.',true,'active',connections[2]],
 ['ifood','iFood','Marketplace','connection','device_code','Importação de pedidos para a fila operacional.',true,'active',connections[0]],
 ['google','Google Business + Ads','Aquisição','connection','oauth','Presença local, avaliações e mídia.',false,'not_connected',null],
 ['meta_ads','Meta Ads','Aquisição','connection','oauth','Campanhas e atribuição conectadas à margem.',false,'not_connected',null],
 ['99food','99Food','Marketplace','partner','partner_onboarding','Estrutura preparada; ativar somente após credencial/API oficial da conta.',false,'partner_onboarding',null],
 ['keeta','Keeta','Marketplace','partner','partner_onboarding','Estrutura preparada; ativar somente após credencial/API oficial da conta.',false,'partner_onboarding',null],
 ['maps_google','Google Maps Routes','Logística','server_key','platform_key','ETA, distância e otimização de rotas quando a chave de servidor estiver habilitada.',false,'platform_setup',null],
 ['mapbox','Mapbox','Logística','server_key','platform_key','Alternativa provider-neutral para mapas e roteamento.',false,'platform_setup',null]
].map(([key,name,category,kind,setup,purpose,recommended,state,connection])=>({key,name,category,kind,setup,purpose,recommended,state,connection}))

let bindings=[]
let fiscal=[]
let nextBindingId=100
let routeSettings={route_provider:'manual',route_mode:'manual',route_optimization_enabled:false,customer_tracking_enabled:false,whatsapp_status_updates:false}
let autoConfigureCalls=0
let routeSavePayload=null
let fiscalSavePayload=null

function summary(){
 const activeProviders=['ifood','whatsapp','mercadopago']
 const unbound=activeProviders.filter(provider=>!brands.every(brand=>bindings.some(b=>b.active&&b.brand_id===brand.id&&b.provider===provider))).length
 return {active_brands:brands.length,active_connections:connections.length,unbound_connections:unbound,fiscal_configured:fiscal.filter(f=>f.tax_id||f.legal_name).length,route_mode:routeSettings.route_mode,route_provider:routeSettings.route_provider}
}
function setup(){return {version:'4.2.0',business_id:1,brands,connections,providers:baseProviders,bindings,fiscal_profiles:fiscal,settings:routeSettings,summary:summary(),next_actions:[]}}
function addBinding(brandId,connection){
 const existing=bindings.find(b=>b.brand_id===brandId&&b.provider===connection.provider)
 if(existing){existing.connection_id=connection.id;existing.active=true;return existing}
 const row={id:nextBindingId++,brand_id:brandId,connection_id:connection.id,channel_id:null,provider:connection.provider,external_store_ref:null,order_import_enabled:['ifood','whatsapp'].includes(connection.provider),menu_sync_enabled:false,price_sync_enabled:false,availability_sync_enabled:false,auto_accept_orders:false,active:true}
 bindings.push(row);return row
}

await page.route('**/cozinha360-setup-v42/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
 if(path.endsWith('/businesses/1/setup')&&method==='GET')return route.fulfill(ok(setup()))
 if(path.endsWith('/businesses/1/auto-configure')&&method==='POST'){
   autoConfigureCalls++
   return route.fulfill(ok({ok:true,requires_review:true,reason:'multi_brand',created_count:0,brands,connections,message:'Operação multi-marca exige vínculo explícito para evitar roteamento incorreto.'}))
 }
 if(path.endsWith('/businesses/1/bindings')&&method==='POST'){
   const payload=req.postDataJSON(),connection=connections.find(c=>c.id===Number(payload.connection_id))
   if(!connection)return route.fulfill(err(404,{detail:'Conexão não encontrada.'}))
   const binding=addBinding(Number(payload.brand_id),connection)
   return route.fulfill(ok({binding}))
 }
 const bindingMatch=path.match(/\/businesses\/1\/bindings\/(\d+)$/)
 if(bindingMatch&&method==='DELETE'){
   const id=Number(bindingMatch[1]),row=bindings.find(b=>b.id===id)
   if(!row)return route.fulfill(err(404,{detail:'Vínculo não encontrado.'}))
   bindings=bindings.filter(b=>b.id!==id)
   return route.fulfill(ok({ok:true}))
 }
 const fiscalMatch=path.match(/\/businesses\/1\/fiscal\/(\d+)$/)
 if(fiscalMatch&&method==='PUT'){
   const brandId=Number(fiscalMatch[1]),payload=req.postDataJSON();fiscalSavePayload={brandId,...payload}
   const row={brand_id:brandId,legal_name:payload.legal_name||null,tax_id:payload.tax_id||null,state_registration:payload.state_registration||null,municipal_registration:payload.municipal_registration||null,tax_regime:payload.tax_regime||'unconfigured',fiscal_provider:null,provider_profile_ref:null,issuance_enabled:false,active:true}
   fiscal=[...fiscal.filter(f=>f.brand_id!==brandId),row]
   return route.fulfill(ok({fiscal_profile:row}))
 }
 if(path.endsWith('/businesses/1/route')&&method==='PUT'){
   const payload=req.postDataJSON();routeSavePayload=payload
   if(payload.route_mode!=='manual')return route.fulfill(err(409,{detail:'O provedor de mapas ainda não está validado para esta operação.',code:'ROUTE_CONNECTION_REQUIRED'}))
   routeSettings={...routeSettings,...payload,route_provider:'manual',route_mode:'manual',route_optimization_enabled:false}
   return route.fulfill(ok({settings:routeSettings}))
 }
 return route.fulfill(err(404,{detail:`setup mock route not found: ${method} ${path}`}))
})

try{
 await page.goto('http://127.0.0.1:5173/?setup=1',{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'Conecte só o que sua cozinha realmente usa.',exact:true}).waitFor({timeout:15000})
 const unboundStat=page.locator('.setup42-hero aside > div').filter({hasText:'conexões para distribuir'})
 await unboundStat.waitFor()
 if((await unboundStat.locator('b').textContent())?.trim()!=='3')throw new Error('expected 3 unbound provider families before setup')

 const mapsCard=page.locator('.setup42-provider-grid article').filter({hasText:'Google Maps Routes'})
 await mapsCard.getByText('CHAVE DA PLATAFORMA',{exact:true}).waitFor()
 const food99=page.locator('.setup42-provider-grid article').filter({hasText:'99Food'})
 await food99.getByText('PARCERIA/ACESSO',{exact:true}).waitFor()
 if(await mapsCard.getByText('ATIVO',{exact:true}).count())throw new Error('Google Maps must not appear active without a dedicated validated route provider')

 const routePanel=page.locator('.setup42-panel').filter({hasText:'Logística sem conta surpresa'})
 const assisted=routePanel.getByRole('button',{name:/Assistida/})
 const intelligent=routePanel.getByRole('button',{name:/Inteligente/})
 if(!await assisted.isDisabled()||!await intelligent.isDisabled())throw new Error('Paid/assisted routing must stay disabled when no route provider is validated')

 await page.getByRole('button',{name:/Configurar automaticamente/}).click()
 await page.getByText('Operação multi-marca detectada. O 360 não distribuiu contas automaticamente para evitar pedidos, pagamentos ou clientes na marca errada. Escolha abaixo qual conta atende cada marca.',{exact:true}).waitFor()
 if(autoConfigureCalls!==1)throw new Error(`expected one auto-configure call, got ${autoConfigureCalls}`)
 if(bindings.length!==0)throw new Error(`multi-brand auto-configure created ${bindings.length} unsafe bindings`)

 const burger=page.locator('.setup42-brand-matrix article').filter({hasText:'Bolso Burgers'})
 const ifoodChip=burger.getByRole('button',{name:/iFood/})
 await ifoodChip.click()
 await page.getByText('iFood ligado à marca Bolso Burgers.',{exact:true}).waitFor()
 if(bindings.length!==1||bindings[0].brand_id!==1||bindings[0].provider!=='ifood')throw new Error(`explicit brand mapping failed ${JSON.stringify(bindings)}`)
 await ifoodChip.click()
 await page.getByText('iFood removido de Bolso Burgers.',{exact:true}).waitFor()
 if(bindings.length!==0)throw new Error('explicit unlink did not remove mapping')
 await ifoodChip.click()
 await page.getByText('iFood ligado à marca Bolso Burgers.',{exact:true}).waitFor()

 const fiscalPanel=page.locator('.setup42-panel').filter({hasText:'Dados fiscais sem ativação falsa'})
 const burgerFiscal=fiscalPanel.locator('details.setup42-fiscal').filter({hasText:'Bolso Burgers'})
 await burgerFiscal.locator('summary').click()
 await burgerFiscal.getByLabel('Razão social').fill('Bolso Burgers Alimentos LTDA')
 await burgerFiscal.getByLabel('CNPJ / documento').fill('12.345.678/0001-90')
 await burgerFiscal.getByLabel('Regime').selectOption('simples')
 await burgerFiscal.getByLabel('Inscrição estadual').fill('110042490114')
 await burgerFiscal.getByRole('button',{name:'Salvar dados fiscais'}).click()
 await page.getByText('Dados fiscais de Bolso Burgers salvos. A emissão continua desligada até um provedor fiscal real ser conectado.',{exact:true}).waitFor()
 if(!fiscalSavePayload||fiscalSavePayload.issuance_enabled!==false||fiscalSavePayload.tax_regime!=='simples')throw new Error(`unsafe fiscal payload ${JSON.stringify(fiscalSavePayload)}`)

 const manual=routePanel.getByRole('button',{name:/Manual/})
 await manual.click()
 const routeSave=routePanel.locator('button.setup42-primary').last()
 await routeSave.click()
 await page.getByText('Roteamento manual salvo. Nenhuma API de mapas será cobrada.',{exact:true}).waitFor()
 if(!routeSavePayload||routeSavePayload.route_mode!=='manual'||routeSavePayload.route_provider!=='manual')throw new Error(`unexpected route payload ${JSON.stringify(routeSavePayload)}`)

 await page.screenshot({path:'/tmp/cozinha360-setup-v42.png',fullPage:true})
 console.log('Setup 360 safe multi-brand customer journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-setup-v42-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await browser.close()}
