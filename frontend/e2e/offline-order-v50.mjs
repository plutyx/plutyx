import { chromium } from 'playwright'

const api='http://127.0.0.1:8000'
const browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1280,height:1100}})
const page=await context.newPage()

async function call(path,{method='GET',token='',body}={}){
 const response=await fetch(`${api}${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)})
 const data=await response.json().catch(()=>({detail:'invalid json'}))
 if(!response.ok)throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`)
 return data
}

try{
 const stamp=Date.now()
 const signup=await call('/auth/signup',{method:'POST',body:{email:`offline-${stamp}@example.com`,password:'cozinha360-offline-safe',full_name:'Operador Offline'}})
 const token=signup.access_token
 const business=await call('/businesses',{method:'POST',token,body:{name:'Cozinha Offline',city:'Mogi das Cruzes'}})
 const ingredient=await call(`/businesses/${business.id}/ingredients`,{method:'POST',token,body:{name:'Frango',unit:'g',price_cents:2400,purchase_qty_milliunits:1000,usable_qty_milliunits:1000}})
 const product=await call(`/businesses/${business.id}/products`,{method:'POST',token,body:{name:'Wrap Offline',category:'Wraps',active:true,units_per_batch:1,packaging_cents_per_unit:120,energy_cents_per_batch:30,labor_cents_per_batch:100}})
 await call(`/businesses/${business.id}/products/${product.id}/recipe/${ingredient.id}`,{method:'PUT',token,body:{ingredient_id:ingredient.id,qty_used_milliunits:180}})

 await page.addInitScript(value=>localStorage.setItem('c360_token',value),token)
 await page.goto('http://127.0.0.1:5173/?quick=1',{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'Venda em poucos toques, mesmo se a internet cair.',exact:true}).waitFor({timeout:15000})
 await page.getByLabel('Produto').selectOption(String(product.id))
 await page.getByLabel('Quantidade').fill('2')
 await page.getByLabel('Preço por unidade').fill('28.50')
 await page.getByLabel('Origem').selectOption('whatsapp')
 await page.getByText('R$ 5,57',{exact:false}).waitFor().catch(()=>{})

 await context.setOffline(true)
 await page.getByRole('button',{name:'Guardar pedido offline'}).waitFor({timeout:5000})
 await page.getByRole('button',{name:'Guardar pedido offline'}).click()
 await page.getByText('Pedido salvo neste dispositivo.',{exact:true}).waitFor()
 const queued=await page.evaluate(()=>JSON.parse(localStorage.getItem('c360-offline-orders-v50')||'[]'))
 if(queued.length!==1)throw new Error(`expected exactly one queued order, got ${queued.length}`)
 if(!queued[0].payload?.idempotency_key)throw new Error('offline order missing idempotency key')
 if(queued[0].payload.quantity!==2||queued[0].payload.unit_price_cents!==2850)throw new Error(`offline payload mismatch ${JSON.stringify(queued[0].payload)}`)
 const replayPayload=queued[0].payload

 await page.getByRole('button',{name:'Ver fila'}).click()
 await page.getByRole('dialog',{name:'Fila segura offline'}).waitFor()
 await page.getByText('1 pedido aguardando confirmação do servidor.',{exact:true}).waitFor()
 await page.screenshot({path:'/tmp/cozinha360-offline-v50.png',fullPage:true})

 await context.setOffline(false)
 for(let i=0;i<40;i++){
   const remaining=await page.evaluate(()=>JSON.parse(localStorage.getItem('c360-offline-orders-v50')||'[]').length)
   if(remaining===0)break
   await page.waitForTimeout(250)
   if(i===39)throw new Error('offline queue did not synchronize after network recovery')
 }
 const orders=await call(`/businesses/${business.id}/orders`,{token})
 const matching=orders.filter(order=>order.source==='whatsapp'&&order.total_cents===5700)
 if(matching.length!==1)throw new Error(`expected one synchronized order, got ${matching.length}`)
 const replay=await call(`/businesses/${business.id}/orders/quick`,{method:'POST',token,body:replayPayload})
 if(!replay.idempotent_replay)throw new Error(`server did not recognize idempotent replay ${JSON.stringify(replay)}`)
 const ordersAfterReplay=await call(`/businesses/${business.id}/orders`,{token})
 const matchingAfter=ordersAfterReplay.filter(order=>order.source==='whatsapp'&&order.total_cents===5700)
 if(matchingAfter.length!==1)throw new Error(`idempotent replay duplicated order: ${matchingAfter.length}`)
 console.log('Offline order queue and idempotent recovery ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-offline-v50-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await browser.close()}
