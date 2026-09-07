import { chromium, request as playwrightRequest } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1280,height:900}})
const generatedPassword=`memory-e2e-${Date.now()}-test`
try{
  await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'})
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  const access=page.getByRole('dialog')
  await access.waitFor()
  await access.getByRole('button',{name:'Quero criar minha operação',exact:true}).click()
  await access.getByLabel('Nome').fill('Memory E2E')
  await access.getByLabel('E-mail').fill('memory-browser-e2e@example.com')
  await access.getByLabel('Senha').fill(generatedPassword)
  await access.getByRole('button',{name:'Criar minha operação',exact:true}).click()
  await page.getByRole('heading',{name:'Dê um nome à sua operação.',exact:true}).waitFor()
  await page.getByPlaceholder('Ex.: Brasa da Ana').fill('Cozinha Memory E2E')
  await page.getByPlaceholder('Cidade').fill('Mogi das Cruzes')
  await page.getByRole('button',{name:'Criar negócio',exact:true}).click()
  await page.getByText(/DECISÃO DE HOJE/).waitFor({timeout:15000})

  const token=await page.evaluate(()=>localStorage.getItem('c360_token'))
  if(!token)throw new Error('missing auth token')
  const api=await playwrightRequest.newContext({baseURL:'http://127.0.0.1:8000',extraHTTPHeaders:{Authorization:`Bearer ${token}`}})
  const me=await api.get('/me')
  if(!me.ok())throw new Error(`me returned ${me.status()}`)
  const businessId=(await me.json()).businesses[0].id
  const key=`c360-growth-v23-${businessId}`
  const payload={metrics:{impressions:'1000',clicks:'42',spend:'80',conversations:'12',orders:'4'},events:[{id:'whatsapp_click',ga4:true,meta:true,tiktok:false}],selectedOffer:3}

  await page.evaluate(({key,payload})=>localStorage.setItem(key,JSON.stringify(payload)),{key,payload})
  await page.waitForTimeout(1100)
  const remote=await api.get(`/businesses/${businessId}/memory/growth`)
  if(!remote.ok())throw new Error(`memory returned ${remote.status()}`)
  const remoteBody=await remote.json()
  if(remoteBody.version<1||remoteBody.data?.metrics?.clicks!=='42')throw new Error(`unexpected remote memory ${JSON.stringify(remoteBody)}`)

  await page.evaluate(key=>localStorage.removeItem(key),key)
  if(await page.evaluate(key=>localStorage.getItem(key),key)!==null)throw new Error('local cache was not cleared')

  // The app intentionally has background portals/readers after boot, so "networkidle"
  // is not a reliable product-ready signal. Wait for DOM + the real workspace + the
  // memory value itself to be hydrated from the server instead.
  await page.reload({waitUntil:'domcontentloaded',timeout:15000})
  await page.getByText(/DECISÃO DE HOJE/).waitFor({timeout:15000})
  await page.waitForFunction(({key})=>{
    const raw=localStorage.getItem(key)
    if(!raw)return false
    try{return JSON.parse(raw).metrics?.clicks==='42'}catch{return false}
  },{key},{timeout:15000})
  const restored=await page.evaluate(key=>localStorage.getItem(key),key)
  if(!restored||JSON.parse(restored).metrics?.clicks!=='42')throw new Error(`server memory was not hydrated: ${restored}`)

  const history=await api.get(`/businesses/${businessId}/memory/growth/history`)
  if(!history.ok())throw new Error(`history returned ${history.status()}`)
  const revisions=(await history.json()).revisions
  if(!Array.isArray(revisions)||revisions.length<1)throw new Error('missing memory revisions')
  await api.dispose()

  await page.screenshot({path:'/tmp/cozinha360-operating-memory.png',fullPage:true})
  console.log('operating memory cross-cache journey ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-operating-memory-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
