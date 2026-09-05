import { chromium } from 'playwright'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
await page.addInitScript(()=>localStorage.setItem('c360_token','browser-test-token'))

const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)})
await page.route('**/api/me',route=>route.fulfill(json({user:{id:1,email:'e2e@example.com',full_name:'E2E'},businesses:[{id:1,name:'Cozinha Intelligence',city:'Mogi das Cruzes',role:'owner',preferences:{}}]})))
await page.route('**/api/businesses/1/memory',route=>route.fulfill(json({business_id:1,states:{}})))
await page.route('**/api/businesses/1/kds',route=>route.fulfill(json({count:1,orders:[{id:42,status:'new',source:'whatsapp',total_cents:4000,age_minutes:8,delayed:false,version:1,items:[{product_id:10,name:'Wrap Intelligence',quantity:2}]}]})))
await page.route('**/api/businesses/1/ingredients',route=>route.fulfill(json([{id:7,name:'Frango Intelligence',unit:'g',last_purchase_price_cents:1000,usable_qty_milliunits:1000,on_hand_milliunits:1000,par_level_milliunits:300,reorder_target_milliunits:1000,version:2}])))
await page.route('**/api/businesses/1/products/10/recipe',route=>route.fulfill(json({product_id:10,product_name:'Wrap Intelligence',ingredient_cost_cents:200,items:[{ingredient_id:7,name:'Frango Intelligence',qty_used_milliunits:200,estimated_cost_cents:200,on_hand_milliunits:1000}]})))

try{
  await page.goto('http://127.0.0.1:5173/?kitchen=1',{waitUntil:'networkidle'})
  await page.getByRole('heading',{name:'Produção agrupada.',exact:true}).waitFor({timeout:15000})
  const productCard=page.locator('.batch-card').filter({hasText:'Wrap Intelligence'})
  await productCard.locator('.batch-qty strong').getByText('2',{exact:true}).waitFor()
  await page.getByRole('tab',{name:'Por componente',exact:true}).click()
  const component=page.locator('.component-card').filter({hasText:'Frango Intelligence'})
  await component.waitFor()
  await component.locator('.component-need > div').nth(0).getByText('400 g',{exact:true}).waitFor()
  await component.locator('.component-need > div').nth(1).getByText('1.000 g',{exact:true}).waitFor()
  await component.locator('.component-need > div').nth(2).getByText('600 g',{exact:true}).waitFor()
  await component.getByText('COBERTO',{exact:true}).waitFor()
  await page.screenshot({path:'/tmp/cozinha360-kitchen-components.png',fullPage:true})
  console.log('kitchen intelligence component view ok')
}catch(error){
  await page.screenshot({path:'/tmp/cozinha360-kitchen-components-failure.png',fullPage:true}).catch(()=>{})
  console.error(error);process.exitCode=1
}finally{await browser.close()}
