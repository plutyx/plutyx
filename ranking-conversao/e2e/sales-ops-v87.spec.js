import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
const LEAD_ID='11111111-1111-4111-8111-111111111111';

async function authenticated(page){
  await page.addInitScript(()=>localStorage.setItem('gcl_session_v1',JSON.stringify({access_token:'sales-e2e-token',refresh_token:'sales-refresh',expires_at:Math.floor(Date.now()/1000)+3600})));
}

function dashboard(){return {profile:{display_name:'Owner GCL',community_level:1,community_points:0},access:{ranking:false,community:false},domains:[],analyses:[],memberships:[],purchases:[],missions:[],upcoming_events:[],saved_sites:[],unread_notifications:0,connection_center:{catalog_total:0,autonomous_ready:0,connection_metrics:0,implemented_connection_metrics:0,groups:[]}}}

test('authorized owner can qualify a captured lead from the account cockpit',async({page})=>{
  await authenticated(page);let update=null;
  await page.route('**/functions/v1/gcl-member-api',async route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    if(body.action==='dashboard')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:dashboard()})});
    if(body.action==='sales_leads')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{access:'sales_operator',summary:{active:1,qualified:0,overdue:0},rows:[{id:LEAD_ID,email:'lead@empresa.com',phone:'+55 11 99999-0000',company_name:'Empresa Alfa',role_title:'Founder',stage:'checkout_blocked',source_path:'/ranking-site/',created_at:'2026-09-13T04:00:00Z',normalized_domain:'empresa.com',product_code:'sac_full_analysis',priority:3,event_count:0}]}})});
    if(body.action==='update_sales_lead'){update=body;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{id:LEAD_ID,stage:'qualified'}})});}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:[]})});
  });
  page.on('dialog',dialog=>dialog.accept('Contato com decisor confirmado.'));
  await page.goto(`${BASE}/account/`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Pipeline de leads'})).toBeVisible({timeout:15000});
  await expect(page.locator('#gcl-sales87')).toContainText('Empresa Alfa');
  await expect(page.getByRole('link',{name:'lead@empresa.com'})).toHaveAttribute('href','mailto:lead%40empresa.com');
  await page.getByRole('button',{name:'Qualificar'}).click();
  await expect(page.locator('.gcl-sales87-result')).toContainText('qualified');
  expect(update).toMatchObject({action:'update_sales_lead',lead_id:LEAD_ID,stage:'qualified',note:'Contato com decisor confirmado.'});
});

test('ordinary members never receive or render the sales cockpit',async({page})=>{
  await authenticated(page);
  await page.route('**/functions/v1/gcl-member-api',async route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    if(body.action==='dashboard')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:dashboard()})});
    if(body.action==='sales_leads')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'sales_operator_required'})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:[]})});
  });
  await page.goto(`${BASE}/account/`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#root[data-member-area="25"] .ma25-dashboard-hero')).toBeVisible({timeout:15000});
  await expect(page.locator('#gcl-sales87')).toHaveCount(0);
});
