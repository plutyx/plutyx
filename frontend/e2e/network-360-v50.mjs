import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1200}})
await page.addInitScript(()=>localStorage.setItem('c360_token','network-v50-token'))
const ok=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})

await page.route('**/api/portfolio/overview',route=>route.fulfill(ok({
 generated_at:'2026-09-06T18:00:00Z',period_days:30,
 summary:{businesses:3,attention:2,critical:1,revenue_cents:785000,contribution_cents:214000,order_count:224,open_orders:9,delayed_open:2,stock_alerts:4},
 top_action:{business_id:2,business_name:'Shawarma Centro',score:100,tone:'critical',title:'Contribuição negativa',detail:'Não acelere aquisição antes de corrigir preço, custo ou mix.',href:'/?today=1&business_id=2'},
 businesses:[
  {business_id:2,name:'Shawarma Centro',city:'Mogi das Cruzes',role:'owner',revenue_cents:180000,contribution_cents:-9000,contribution_margin_bps:-500,order_count:58,open_orders:4,delayed_open:2,delay_rate:.19,error_rate:.03,stock_alerts:2,attention:{score:100,code:'negative_contribution',tone:'critical',title:'Contribuição negativa',detail:'Não acelere aquisição antes de corrigir preço, custo ou mix.'},signals:[]},
  {business_id:3,name:'Burgers Suzano',city:'Suzano',role:'admin',revenue_cents:255000,contribution_cents:61000,contribution_margin_bps:2392,order_count:77,open_orders:3,delayed_open:0,delay_rate:.17,error_rate:.01,stock_alerts:2,attention:{score:90,code:'stock',tone:'critical',title:'2 itens abaixo do mínimo',detail:'Há risco de ruptura ou substituição na produção.'},signals:[]},
  {business_id:1,name:'Cozinha Matriz',city:'Mogi das Cruzes',role:'owner',revenue_cents:350000,contribution_cents:162000,contribution_margin_bps:4629,order_count:89,open_orders:2,delayed_open:0,delay_rate:.02,error_rate:.01,stock_alerts:0,attention:{score:10,code:'stable',tone:'stable',title:'Sem bloqueio crítico detectado',detail:'Margem, atraso, erro e estoque não dispararam os limites desta visão.'},signals:[]}
 ]
})))

try{
 await page.goto('http://127.0.0.1:5173/?network=1',{waitUntil:'networkidle'})
 const heading=page.getByRole('heading',{name:'Todas as operações. Só o que merece sua atenção.',exact:true})
 await heading.waitFor({timeout:15000})
 const headingBox=await heading.boundingBox()
 if(!headingBox||headingBox.y>260)throw new Error(`Network 360 hero drifted below the fold: ${JSON.stringify(headingBox)}`)
 const statusBox=await page.locator('.network50-hero aside').boundingBox()
 if(!statusBox||statusBox.height>320)throw new Error(`Network 360 status card inherited sidebar sizing: ${JSON.stringify(statusBox)}`)
 await page.getByText('Shawarma Centro: Contribuição negativa',{exact:true}).waitFor()
 const rows=page.locator('.network50-unit')
 if(await rows.count()!==3)throw new Error(`expected 3 units, got ${await rows.count()}`)
 if(!(await rows.nth(0).textContent())?.includes('Shawarma Centro'))throw new Error('critical unit is not ranked first')
 if(!(await rows.nth(2).textContent())?.includes('Cozinha Matriz'))throw new Error('stable unit is not ranked last')
 const detail=rows.nth(0).getByRole('link',{name:'Abrir Shawarma Centro'})
 const href=await detail.getAttribute('href')
 if(href!=='/?today=1&business_id=2')throw new Error(`unsafe drilldown href ${href}`)
 await page.getByText('ordenado por risco, não por faturamento',{exact:true}).waitFor()
 await page.screenshot({path:'/tmp/cozinha360-network-v50.png',fullPage:true})
 console.log('Network 360 exception-first journey ok')
}catch(error){
 await page.screenshot({path:'/tmp/cozinha360-network-v50-failure.png',fullPage:true}).catch(()=>{})
 console.error(error);process.exitCode=1
}finally{await browser.close()}
