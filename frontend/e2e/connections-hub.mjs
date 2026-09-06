import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}})
await page.addInitScript(()=>localStorage.setItem('c360_token','browser-test-token'))
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'cliente@example.com',full_name:'Cliente Real'},businesses:[{id:1,name:'Cozinha Cliente',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))
let ifoodActive=false
const provider=(key,name,category,connection=null)=>({key,name,category,impact:'Impacto operacional explicado em linguagem simples.',why:'Conexão segura sem copiar token para o navegador.',mode:key==='ifood'?'device_code':'oauth',eta:'~2 min',platform_ready:true,missing:[],optional_missing:[],connection})
await page.route('**/cozinha360-integrations-v29/businesses/1/integrations**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
 if(path.endsWith('/ifood/start')&&method==='POST')return route.fulfill(json({action:'device_code',connection_id:7,user_code:'ABCD-EFGH',authorization_url:'http://127.0.0.1:5173/ifood-portal',expires_in:600,next:'Cole o código'}))
 if(path.endsWith('/ifood/complete')&&method==='POST'){ifoodActive=true;return route.fulfill(json({ok:true,connection:{id:7,status:'active',display_name:'Loja iFood Teste'}}))}
 if(path.endsWith('/integrations')&&method==='GET')return route.fulfill(json({business_id:1,recommended_order:['whatsapp','mercadopago','google','ifood','meta_ads'],providers:[
   provider('whatsapp','WhatsApp Business','Vendas & CRM'),
   provider('mercadopago','Mercado Pago / Pix','Pagamentos'),
   provider('google','Google Business + Ads','Aquisição local',{id:3,provider:'google',external_account_ref:'g-1',display_name:'conta@google.com',status:'active',last_success_at:'2026-09-05T22:00:00Z',last_error:null}),
   provider('ifood','iFood','Marketplace',ifoodActive?{id:7,provider:'ifood',external_account_ref:'m-1',display_name:'Loja iFood Teste',status:'active',last_success_at:'2026-09-05T22:10:00Z',last_error:null}:null),
   provider('meta_ads','Meta Ads','Aquisição')
 ]}))
 return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:'mock route not found'})})
})
try{
 await page.goto('http://127.0.0.1:5173/?connections=1',{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'Conecte o que você já usa. O 360 organiza o resto.',exact:true}).waitFor({timeout:15000})
 await page.getByText('1/5',{exact:true}).waitFor()
 await page.getByText('1. WhatsApp → 2. Pix → 3. Google',{exact:true}).waitFor()
 const google=page.locator('.cx-card').filter({hasText:'Google Business + Ads'})
 await google.getByText('ATIVO',{exact:true}).waitFor()
 const ifood=page.locator('.cx-card').filter({hasText:'iFood'})
 await ifood.getByRole('button',{name:/Conectar/}).click()
 await page.getByRole('heading',{name:'Autorize no Portal do Parceiro e cole o código.',exact:true}).waitFor()
 await page.getByText('ABCD-EFGH',{exact:true}).waitFor()
 await page.getByLabel('Código de autorização').fill('WXYZ-1234')
 await page.getByRole('button',{name:'Concluir conexão'}).click()
 await page.getByText('iFood conectado. A operação já pode validar a conta.',exact:true).waitFor()
 await page.getByText('2/5',{exact:true}).waitFor()
 await page.screenshot({path:'/tmp/cozinha360-connections-hub.png',fullPage:true})
 console.log('connections hub real-customer journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-connections-hub-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await browser.close()}
