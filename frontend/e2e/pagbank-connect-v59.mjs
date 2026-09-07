import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1200}})
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
await page.addInitScript(()=>localStorage.setItem('c360_token','browser-test-token'))

await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'cliente@example.com',full_name:'Cliente'},businesses:[{id:1,name:'Cozinha Cliente',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))

const profile={business_id:1,order_source:'direct',use_mercadopago:false,use_google:false,use_meta_ads:false,configured_at:new Date().toISOString(),updated_by_user_id:1}
await page.route('**/cozinha360-profile-v31/**',route=>route.fulfill(json({profile,recommended_order:[],internal_order_ready:true})))
const provider=(key,name,category)=>({key,name,category,impact:'Impacto operacional.',why:'Autorização oficial.',mode:key==='ifood'?'device_code':'oauth',eta:'~2 min',platform_ready:false,missing:['platform'],optional_missing:[],connection:null,operational:false,asset_count:0,selection_required:false,assets:[],selected_asset:null})
await page.route('**/cozinha360-integrations-v29/**',route=>route.fulfill(json({business_id:1,recommended_order:[],providers:[provider('whatsapp','WhatsApp Business','Vendas & CRM'),provider('mercadopago','Mercado Pago / Pix','Pagamentos'),provider('google','Google Business + Ads','Aquisição local'),provider('ifood','iFood','Marketplace'),provider('meta_ads','Meta Ads','Aquisição')]})))

let state='partner_approval'
let active=false
let testCalls=0
await page.route('**/cozinha360-pagbank-v59/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname,method=req.method()
 if(path.endsWith('/businesses/1/status')&&method==='GET')return route.fulfill(json({ok:true,version:'5.9.0',readiness:{platform_ready:state==='ready_to_authorize',state,authorization:'PagBank Connect Authorization',environment:'production',homologated:state!=='partner_approval'},connection:active?{provider:'pagbank',status:'active',display_name:'Minha Conta PagBank',external_account_ref:'ACCO_TEST',last_success_at:new Date().toISOString(),last_error:null}:null}))
 if(path.endsWith('/businesses/1/connect')&&method==='POST')return route.fulfill(json({ok:true,provider:'pagbank',authorization_url:'https://malicious.example/oauth',expires_in_seconds:600}))
 if(path.endsWith('/businesses/1/test')&&method==='POST'){testCalls++;return route.fulfill(json({ok:true,provider:'pagbank',probe:'account_lookup',connection:{provider:'pagbank',status:'active',display_name:'Minha Conta PagBank',external_account_ref:'ACCO_TEST',last_success_at:new Date().toISOString(),last_error:null}}))}
 return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:`PagBank mock missing ${method} ${path}`})})
})

try{
 await page.goto('http://127.0.0.1:5173/?connections=1',{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'Conecte sua operação, não APIs.',exact:true}).waitFor({timeout:15000})
 let card=page.locator('[data-pagbank-connection-card]')
 await card.getByText('PagBank',{exact:true}).waitFor({timeout:10000})
 await card.getByText('HOMOLOGAÇÃO',{exact:true}).waitFor()
 const locked=card.getByRole('button',{name:'Aguardando homologação',exact:true})
 if(!(await locked.isDisabled()))throw new Error('PagBank must stay disabled before production homologation')

 state='ready_to_authorize'
 await page.reload({waitUntil:'networkidle'})
 card=page.locator('[data-pagbank-connection-card]')
 await card.getByText('PRONTO',{exact:true}).waitFor({timeout:10000})
 await card.getByRole('button',{name:/Autorizar no PagBank/}).click()
 await card.getByText('URL oficial de autorização não foi reconhecida',{exact:true}).waitFor()
 if(new URL(page.url()).hostname!=='127.0.0.1')throw new Error('untrusted authorization URL navigated the browser')

 active=true
 await page.reload({waitUntil:'networkidle'})
 card=page.locator('[data-pagbank-connection-card]')
 await card.getByText('ATIVO',{exact:true}).waitFor({timeout:10000})
 await card.getByText('Minha Conta PagBank',{exact:true}).waitFor()
 await card.getByRole('button',{name:'Testar',exact:true}).click()
 await card.getByText('Conexão validada no PagBank.',{exact:true}).waitFor()
 if(testCalls!==1)throw new Error(`expected one PagBank health call, got ${testCalls}`)

 const text=(await card.textContent())?.toLowerCase()||''
 if(text.includes('client_secret')||text.includes('refresh_token')||text.includes('access_token'))throw new Error('PagBank secret vocabulary leaked into customer UI')
 await page.screenshot({path:'/tmp/cozinha360-pagbank-v59.png',fullPage:true})
 console.log('PagBank Connect homologation -> ready -> active customer journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-pagbank-v59-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await browser.close()}
