import { chromium } from 'playwright'

const api='http://127.0.0.1:8000'
const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1200}})
const page=await context.newPage()

async function call(path,{method='GET',token='',body}={}){
  const response=await fetch(`${api}${path}`,{
    method,
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    body:body===undefined?undefined:JSON.stringify(body),
  })
  const data=await response.json().catch(()=>({detail:'invalid json'}))
  if(!response.ok)throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`)
  return data
}

try{
  const stamp=Date.now()
  const signup=await call('/auth/signup',{method:'POST',body:{email:`cmv-${stamp}@example.com`,password:'cozinha360-cmv-safe',full_name:'Operador CMV'}})
  const token=signup.access_token
  const business=await call('/businesses',{method:'POST',token,body:{name:'Cozinha CMV E2E',city:'Mogi das Cruzes'}})
  const ingredient=await call(`/businesses/${business.id}/ingredients`,{method:'POST',token,body:{name:'Frango CMV',unit:'g',price_cents:1000,purchase_qty_milliunits:1000,usable_qty_milliunits:1000}})
  const product=await call(`/businesses/${business.id}/products`,{method:'POST',token,body:{name:'Wrap CMV',category:'Wraps',active:true,units_per_batch:1,packaging_cents_per_unit:0,energy_cents_per_batch:0,labor_cents_per_batch:0}})
  const recipe=await call(`/businesses/${business.id}/products/${product.id}/recipe/${ingredient.id}`,{method:'PUT',token,body:{ingredient_id:ingredient.id,qty_used_milliunits:100}})
  if(!recipe)throw new Error('recipe was not created')

  await call(`/businesses/${business.id}/inventory/counts`,{method:'POST',token,body:{ingredient_id:ingredient.id,counted_milliunits:1000,note:'abertura e2e'}})
  const order=await call(`/businesses/${business.id}/orders/quick`,{method:'POST',token,body:{product_id:product.id,quantity:1,unit_price_cents:2000,paid:true,source:'balcao',idempotency_key:`cmv-order-${stamp}`}})
  await call(`/businesses/${business.id}/orders/${order.id}/status`,{method:'PATCH',token,body:{status:'completed',expected_version:1}})
  await call(`/businesses/${business.id}/inventory/counts`,{method:'POST',token,body:{ingredient_id:ingredient.id,counted_milliunits:850,note:'fechamento e2e'}})

  const smart=await call(`/businesses/${business.id}/smart-cmv`,{token})
  const row=smart.ingredients.find(item=>item.ingredient_id===ingredient.id)
  if(!row||row.status!=='ready')throw new Error(`ingredient is not comparable ${JSON.stringify(row)}`)
  if(row.theoretical_usage_milliunits!==100)throw new Error(`expected 100 theoretical, got ${row.theoretical_usage_milliunits}`)
  if(row.observed_usage_milliunits!==150)throw new Error(`expected 150 observed, got ${row.observed_usage_milliunits}`)
  if(row.unexplained_usage_milliunits!==50)throw new Error(`expected +50 unexplained, got ${row.unexplained_usage_milliunits}`)
  if(row.signal!=='shrink')throw new Error(`expected shrink signal, got ${row.signal}`)

  await page.addInitScript(value=>localStorage.setItem('c360_token',value),token)
  await page.goto(`http://127.0.0.1:5173/?cmv=1&business_id=${business.id}`,{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Conte o estoque. O 360 explica a diferença.',exact:true}).waitFor({timeout:15000})
  await page.getByText('Frango CMV',{exact:true}).last().waitFor()
  const variance=page.locator('.cmv50-var').filter({hasText:'Frango CMV'})
  await variance.waitFor()
  const text=await variance.textContent()
  if(!text?.includes('150 g')||!text.includes('100 g')||!text.includes('+50 g'))throw new Error(`variance UI mismatch: ${text}`)

  await page.getByText('CMV observado*',{exact:true}).waitFor()
  await page.screenshot({path:'/tmp/cozinha360-smart-cmv-v50.png',fullPage:true})
  console.log('Smart CMV physical-vs-theoretical journey ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-smart-cmv-v50-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
