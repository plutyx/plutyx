import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1280}})
await page.addInitScript(()=>localStorage.setItem('c360_token','browser-test-token'))
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'cliente@example.com',full_name:'Cliente Real'},businesses:[{id:1,name:'Cozinha Cliente',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))
let ifoodActive=false
let testCalls=0
let savedPlan=null
let googleDegraded=false
let failNextGoogle=false
let googleLastSuccess=new Date(Date.now()-48*60*60*1000).toISOString()
let ifoodLastSuccess=new Date().toISOString()
let profile={business_id:1,order_source:'direct',use_mercadopago:true,use_google:true,use_meta_ads:false,configured_at:null,updated_by_user_id:null}
const recommended=()=>[...(profile.order_source==='whatsapp'?['whatsapp']:profile.order_source==='ifood'?['ifood']:profile.order_source==='mixed'?['whatsapp','ifood']:[]),...(profile.use_mercadopago?['mercadopago']:[]),...(profile.use_google?['google']:[]),...(profile.use_meta_ads?['meta_ads']:[])]
const provider=(key,name,category,connection=null,platformReady=true)=>({key,name,category,impact:'Impacto operacional explicado em linguagem simples.',why:'Conexão segura sem copiar token para o navegador.',mode:key==='ifood'?'device_code':'oauth',eta:'~2 min',platform_ready:platformReady,missing:platformReady?[]:['PROVIDER_PLATFORM_APPROVAL'],optional_missing:[],connection})
await page.route('**/cozinha360-profile-v31/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname,method=req.method()
 if(path.endsWith('/businesses/1/profile')&&method==='GET')return route.fulfill(json({profile,recommended_order:recommended(),internal_order_ready:profile.order_source==='direct'}))
 if(path.endsWith('/businesses/1/profile')&&method==='PUT'){
   savedPlan=req.postDataJSON();profile={...profile,...savedPlan,configured_at:new Date().toISOString(),updated_by_user_id:1}
   return route.fulfill(json({profile,recommended_order:recommended(),internal_order_ready:profile.order_source==='direct'}))
 }
 return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:`profile mock route not found: ${method} ${path}`})})
})
await page.route('**/cozinha360-integrations-v29/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
 if(path.endsWith('/businesses/1/integrations/ifood/start')&&method==='POST')return route.fulfill(json({action:'device_code',connection_id:7,user_code:'ABCD-EFGH',authorization_url:'https://example.com/ifood-portal',expires_in:600,next:'Cole o código'}))
 if(path.endsWith('/businesses/1/integrations/ifood/complete')&&method==='POST'){ifoodActive=true;return route.fulfill(json({ok:true,connection:{id:7,status:'active',display_name:'Loja iFood Teste'}}))}
 if(path.endsWith('/google/test')&&method==='POST'){
   testCalls++
   if(failNextGoogle){failNextGoogle=false;googleDegraded=true;return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({detail:'Google recusou a credencial',status:'degraded'})})}
   googleDegraded=false;googleLastSuccess=new Date().toISOString();return route.fulfill(json({ok:true,status:'active'}))
 }
 if(path.endsWith('/ifood/test')&&method==='POST'){testCalls++;ifoodLastSuccess=new Date().toISOString();return route.fulfill(json({ok:true,status:'active'}))}
 if(path.endsWith('/businesses/1/integrations')&&method==='GET')return route.fulfill(json({business_id:1,recommended_order:['whatsapp','mercadopago','google','ifood','meta_ads'],providers:[
   provider('whatsapp','WhatsApp Business','Vendas & CRM'),
   provider('mercadopago','Mercado Pago / Pix','Pagamentos',null,false),
   provider('google','Google Business + Ads','Aquisição local',{id:3,provider:'google',external_account_ref:'g-1',display_name:'conta@google.com',status:googleDegraded?'degraded':'active',last_success_at:googleLastSuccess,last_error:googleDegraded?'Google recusou a credencial':null}),
   provider('ifood','iFood','Marketplace',ifoodActive?{id:7,provider:'ifood',external_account_ref:'m-1',display_name:'Loja iFood Teste',status:'active',last_success_at:ifoodLastSuccess,last_error:null}:null),
   provider('meta_ads','Meta Ads','Aquisição')
 ]}))
 return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:`integration mock route not found: ${method} ${path}`})})
})
try{
 await page.goto('http://127.0.0.1:5173/?connections=1',{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'Use o que faz sentido para sua cozinha.',exact:true}).waitFor({timeout:15000})
 await page.getByText('1 conexão antiga revalidada automaticamente.',{exact:true}).waitFor({timeout:15000})
 await page.getByRole('heading',{name:'1/1 conexões saudáveis',exact:true}).waitFor()
 await page.getByText('CONFIGURE EM 30 SEGUNDOS',{exact:true}).waitFor()
 await page.getByRole('heading',{name:'Como sua cozinha realmente vende?',exact:true}).waitFor()
 await page.getByRole('button',{name:/WhatsApp Conversa/}).click()
 await page.getByRole('button',{name:/Loja própria Pedidos/}).click()
 await page.getByRole('button',{name:'Montar meu plano'}).click()
 await page.getByText('Plano de conexões salvo. O Autopilot reorganizou os próximos passos.',{exact:true}).waitFor()
 if(!savedPlan||savedPlan.order_source!=='direct'||savedPlan.use_mercadopago!==true||savedPlan.use_google!==true||savedPlan.use_meta_ads!==false)throw new Error(`unexpected saved plan ${JSON.stringify(savedPlan)}`)
 await page.getByText('Loja própria do Cozinha 360',{exact:true}).waitFor()
 await page.getByRole('heading',{name:'Mercado Pago / Pix: ativação da plataforma pendente',exact:true}).waitFor()
 await page.getByText('Sem ação técnica sua',{exact:true}).waitFor()
 await page.getByText('1/2',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Usar Pix manual',exact:true}).click()
 await page.getByText('Plano ajustado: Pix manual por enquanto. Você pode conectar Mercado Pago / Pix depois.',{exact:true}).waitFor()
 if(!savedPlan||savedPlan.use_mercadopago!==false)throw new Error(`fallback did not disable Mercado Pago requirement: ${JSON.stringify(savedPlan)}`)
 await page.getByText('Manual — sem API externa',{exact:true}).first().waitFor()
 await page.getByText('1/1',{exact:true}).waitFor()
 const google=page.locator('.cx-card').filter({hasText:'Google Business + Ads'})
 await google.getByText('ATIVO',{exact:true}).waitFor()
 const mercado=page.locator('.cx-card').filter({hasText:'Mercado Pago / Pix'})
 await mercado.getByText('PLATAFORMA',{exact:true}).waitFor()
 if(await mercado.getByText('NO SEU PLANO',{exact:true}).count())throw new Error('Mercado Pago should leave the required plan after manual-Pix fallback')
 const whatsapp=page.locator('.cx-card').filter({hasText:'WhatsApp Business'})
 if(await whatsapp.getByText('NO SEU PLANO',{exact:true}).count())throw new Error('WhatsApp should not be recommended for a direct-order customer')
 const ifood=page.locator('.cx-card').filter({hasText:'iFood'})
 await ifood.getByRole('button',{name:/Conectar/}).click()
 await page.getByRole('heading',{name:'Autorize no Portal do Parceiro e cole o código.',exact:true}).waitFor()
 await page.getByText('ABCD-EFGH',{exact:true}).waitFor()
 await page.getByLabel('Código de autorização').fill('WXYZ-1234')
 await page.getByRole('button',{name:'Concluir conexão'}).click()
 await page.getByText('iFood conectado. A operação já pode validar a conta.',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Testar conexões'}).click()
 await page.getByText('2/2 conexões validadas. Tudo saudável.',{exact:true}).waitFor()
 failNextGoogle=true
 await google.getByRole('button',{name:'Testar'}).click()
 await google.getByText('REVISAR',{exact:true}).waitFor()
 await google.getByRole('button',{name:/Reconectar/}).waitFor()
 await google.getByText('Google recusou a credencial',{exact:true}).waitFor()
 await page.getByRole('heading',{name:'1 conexão precisa de atenção',exact:true}).waitFor()
 await page.getByRole('button',{name:'Diagnosticar agora'}).click()
 await page.getByText('2/2 conexões validadas. Tudo saudável.',{exact:true}).waitFor()
 await page.getByRole('heading',{name:'2/2 conexões saudáveis',exact:true}).waitFor()
 if(testCalls!==6)throw new Error(`expected 6 connection health calls, got ${testCalls}`)
 await page.screenshot({path:'/tmp/cozinha360-connections-hub.png',fullPage:true})
 console.log('fallback + connection doctor customer journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-connections-hub-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await browser.close()}
