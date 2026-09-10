import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
const POST_ID='11111111-1111-4111-8111-111111111111';

function errors(page){const out=[];page.on('pageerror',e=>out.push(String(e?.message||e)));return out}

test('member can report community content and UI states that review is non-automatic',async({page})=>{
  const errs=errors(page);let submitted=null;
  await page.addInitScript(()=>localStorage.setItem('gcl_session_v1',JSON.stringify({access_token:'e2e-token',refresh_token:'e2e-refresh',expires_at:Math.floor(Date.now()/1000)+3600})));
  await page.route('**/functions/v1/sac-ranking-site-api',async route=>{
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{ranking:[],awards_catalog:[],market:{listings:[]},stats:{community_posts:1},community_preview:{headline:'Community',description:'Preview',published_official_posts:1,spaces:1,posts:[]}}})});
  });
  await page.route('**/functions/v1/gcl-member-api',async route=>{
    let action='';try{action=JSON.parse(route.request().postData()||'{}').action||''}catch{}
    let result={};
    if(action==='spaces')result=[];
    if(action==='dashboard')result={profile:{user_id:'22222222-2222-4222-8222-222222222222'},access:{community:true,ranking:true},domains:[],analyses:[],memberships:[],purchases:[],missions:[],upcoming_events:[]};
    if(action==='feed')result={posts:[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result})});
  });
  await page.route('**/functions/v1/gcl-moderation-api',async route=>{
    submitted=JSON.parse(route.request().postData()||'{}');
    await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,result:{id:'33333333-3333-4333-8333-333333333333',status:'open',duplicate:false}})});
  });

  await page.goto(`${BASE}/community/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(id=>{
    const card=document.createElement('article');
    card.className='gcl-social-post';
    card.dataset.postId=id;
    card.innerHTML='<div class="gcl-social-actions"></div>';
    document.body.appendChild(card);
  },POST_ID);

  const report=page.getByRole('button',{name:'Denunciar post'});
  await expect(report).toBeVisible({timeout:10000});
  await report.click();
  await expect(page.getByRole('heading',{name:'Sinalizar post'})).toBeVisible();
  await expect(page.locator('.gcl-report29')).toContainText('Uma denúncia não remove conteúdo automaticamente nem altera score, ranking ou pontos.');
  await page.locator('.gcl-report29 select').selectOption('spam');
  await page.locator('.gcl-report29 textarea').fill('Link repetitivo publicado fora do contexto da discussão.');
  await page.getByRole('button',{name:'Enviar denúncia'}).click();
  await expect(page.locator('.gcl-report29-result')).toContainText('Denúncia recebida');
  expect(submitted).toMatchObject({action:'report',target_type:'post',target_id:POST_ID,reason:'spam'});
  expect(errs).toEqual([]);
});
