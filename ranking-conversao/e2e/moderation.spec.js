import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
const POST_ID='11111111-1111-4111-8111-111111111111';
const USER_ID='22222222-2222-4222-8222-222222222222';
const REPORT_ID='33333333-3333-4333-8333-333333333333';

function errors(page){const out=[];page.on('pageerror',e=>out.push(String(e?.message||e)));return out}
async function session(page){await page.addInitScript(()=>localStorage.setItem('gcl_session_v1',JSON.stringify({access_token:'e2e-token',refresh_token:'e2e-refresh',expires_at:Math.floor(Date.now()/1000)+3600})))}
async function memberApi(page){await page.route('**/functions/v1/gcl-member-api',async route=>{let action='';try{action=JSON.parse(route.request().postData()||'{}').action||''}catch{}let result={};if(action==='spaces')result=[];if(action==='dashboard')result={profile:{user_id:USER_ID,display_name:'Moderador Teste',community_level:3,community_points:320},access:{community:true,ranking:true},domains:[],analyses:[],memberships:[],purchases:[],missions:[],upcoming_events:[],saved_sites:[],unread_notifications:0,connection_center:{catalog_total:779,autonomous_ready:684,connection_metrics:95,implemented_connection_metrics:0,groups:[]}};if(action==='feed')result={posts:[]};await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result})})})}

test('member can report community content and UI states that review is non-automatic',async({page})=>{
  const errs=errors(page);let submitted=null;await session(page);
  await page.route('**/functions/v1/sac-ranking-site-api',async route=>{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{ranking:[],awards_catalog:[],market:{listings:[]},stats:{community_posts:1},community_preview:{headline:'Community',description:'Preview',published_official_posts:1,spaces:1,posts:[]}}})})});
  await memberApi(page);
  await page.route('**/functions/v1/gcl-moderation-api',async route=>{submitted=JSON.parse(route.request().postData()||'{}');await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,result:{id:REPORT_ID,status:'open',duplicate:false}})})});

  await page.goto(`${BASE}/community/`,{waitUntil:'domcontentloaded'});
  await page.evaluate(id=>{const card=document.createElement('article');card.className='gcl-social-post';card.dataset.postId=id;card.innerHTML='<div class="gcl-social-actions"></div>';document.body.appendChild(card)},POST_ID);

  const report=page.getByRole('button',{name:'Denunciar post'});await expect(report).toBeVisible({timeout:10000});await report.click();
  await expect(page.getByRole('heading',{name:'Sinalizar post'})).toBeVisible();
  await expect(page.locator('.gcl-report29')).toContainText('Uma denúncia não remove conteúdo automaticamente nem altera score, ranking ou pontos.');
  await page.locator('.gcl-report29 select').selectOption('spam');
  await page.locator('.gcl-report29 textarea').fill('Link repetitivo publicado fora do contexto da discussão.');
  await page.getByRole('button',{name:'Enviar denúncia'}).click();
  await expect(page.locator('.gcl-report29-result')).toContainText('Denúncia recebida');
  expect(submitted).toMatchObject({action:'report',target_type:'post',target_id:POST_ID,reason:'spam'});
  expect(errs).toEqual([]);
});

test('authorized staff sees the moderation queue and can move a report into review',async({page})=>{
  const errs=errors(page);let moderated=null;await session(page);await memberApi(page);
  await page.route('**/functions/v1/gcl-moderation-api',async route=>{const body=JSON.parse(route.request().postData()||'{}');if(body.action==='queue'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:[{id:REPORT_ID,reporter_user_id:'44444444-4444-4444-8444-444444444444',target_type:'post',target_id:POST_ID,reason:'spam',details:'Promoção repetitiva fora do tema.',status:'open',created_at:'2026-09-10T18:00:00Z'}]})});return}if(body.action==='moderate'){moderated=body;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:{id:REPORT_ID,status:'reviewing',action:'review'}})});return}await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'unexpected_action'})})});

  await page.goto(`${BASE}/account/`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Fila de moderação'})).toBeVisible({timeout:15000});
  await expect(page.locator('#gcl-mod31')).toContainText('1caso ativo');
  await expect(page.locator('#gcl-mod31')).toContainText('Promoção repetitiva fora do tema.');
  await expect(page.locator('#gcl-mod31')).toContainText('Nenhuma denúncia altera GCL Score, ranking ou pontos por si só.');
  await page.getByRole('button',{name:'Em revisão'}).click();
  await expect(page.locator('.gcl-mod31-result')).toContainText('reviewing');
  expect(moderated).toMatchObject({action:'moderate',report_id:REPORT_ID,moderation_action:'review'});
  expect(errs).toEqual([]);
});
