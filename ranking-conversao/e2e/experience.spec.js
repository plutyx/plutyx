import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
const TOKEN='11111111-1111-4111-8111-111111111111';
const AUDIT_ID='22222222-2222-4222-8222-222222222222';
const article={
 slug:'adaptive-reading-test',
 title:'Como transformar sinais em decisões de conversão',
 excerpt:'Um artigo de teste para validar leitura progressiva.',
 body_markdown:'A leitura começa pela decisão que o usuário precisa tomar.\n\n1. Evidência antes da opinião. Cada recomendação precisa nascer de algo observado.\n\n2. Prioridade antes do volume. Nem todo problema merece a mesma energia.\n\n3. Reauditoria antes da celebração. A melhoria só vale quando a nova versão é medida.',
 category_name:'GCL Research',category_slug:'research',published_at:'2026-09-10T12:00:00Z'
};
const home={ranking:[],awards_catalog:[],offers:{},market:{listings:[]},stats:{community_posts:0},latest_articles:[article],community_preview:{headline:'Community',description:'Preview',published_official_posts:0,spaces:0,posts:[]}};

async function mock(page){
 await page.route('**/functions/v1/sac-ranking-site-api',async route=>{
  let body={};try{body=JSON.parse(route.request().postData()||'{}')}catch{}
  const action=String(body.action||'');let result={};
  if(action==='home')result=home;else if(action==='blog_index')result=[article];else if(action==='blog_post')result=article;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result})});
 });
}

test('Spotlight opens from keyboard and routes users without a mega-menu',async({page})=>{
 await mock(page);await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
 await page.keyboard.press(process.platform==='darwin'?'Meta+K':'Control+K');
 const dialog=page.getByRole('dialog',{name:'Para onde você quer ir?'});await expect(dialog).toBeVisible({timeout:10000});
 const search=page.getByRole('searchbox',{name:'Buscar na Global Conversion League'});await search.fill('Awards');
 await expect(dialog.getByRole('option')).toHaveCount(1);await expect(dialog.getByText('Awards',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});

test('Research supports quick guided complete and focus reading modes',async({page})=>{
 await mock(page);await page.goto(`${BASE}/blog/`,{waitUntil:'domcontentloaded'});
 await page.getByText(article.title,{exact:true}).first().click();
 const toolbar=page.locator('.gcl-rx33-toolbar');await expect(toolbar).toBeVisible({timeout:10000});
 await expect(page.locator('.markdown')).toHaveAttribute('data-rx-mode','guided');
 await expect(page.locator('.gcl-rx33-detail').first()).toBeHidden();
 await toolbar.getByRole('button',{name:'Completo'}).click();await expect(page.locator('.markdown')).toHaveAttribute('data-rx-mode','complete');await expect(page.locator('.gcl-rx33-detail').first()).toBeVisible();
 await toolbar.getByRole('button',{name:'Rápido'}).click();await expect(page.locator('.markdown')).toHaveAttribute('data-rx-mode','quick');await expect(page.locator('.gcl-rx33-detail').first()).toBeHidden();
 const focus=toolbar.getByRole('button',{name:'Modo foco'});await focus.click();await expect(page.locator('body')).toHaveClass(/gcl-rx-focus33/);await expect(toolbar.getByRole('button',{name:'Sair do foco'})).toHaveAttribute('aria-pressed','true');
});

test('experience layer honors reduced-motion preference',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await mock(page);await page.goto(`${BASE}/ranking/`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('html')).toHaveAttribute('data-gcl-motion','reduced');
});

test('adaptive controls do not create horizontal overflow on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mock(page);await page.goto(`${BASE}/blog/`,{waitUntil:'domcontentloaded'});await page.getByText(article.title,{exact:true}).first().click();await expect(page.locator('.gcl-rx33-toolbar')).toBeVisible({timeout:10000});
 const dims=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));expect(dims.sw).toBeLessThanOrEqual(dims.cw+1);
});

test('Decision Lens filters dense audit priorities without changing score data',async({page})=>{
 await mock(page);await page.goto(`${BASE}/?scan=${TOKEN}`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  const host=document.createElement('div');host.innerHTML=`
   <section id="gcl-report-intelligence-v11">
    <article class="gcl-v11-panel evidence"><h3>Fontes analisadas</h3></article>
    <article class="gcl-v11-panel pages"><h3>Páginas analisadas</h3></article>
   </section>
   <section id="gcl-action-center-v12"><div class="gcl-action-list">
    <details><summary><span><strong>CTA principal não observado</strong><small>Conversão</small></span><em class="fail">Crítico</em></summary><div>Home / preço</div></details>
    <details><summary><span><strong>Prova social fraca</strong><small>Confiança</small></span><em class="warning">Atenção</em></summary><div>Landing page</div></details>
   </div></section>`;document.body.appendChild(host);
 });
 const lens=page.locator('#gcl-report-lens34');await expect(lens).toBeVisible({timeout:10000});
 const tools=page.locator('.gcl-rl34-tools');await expect(tools).toContainText('2 de 2 prioridades exibidas');
 await tools.getByRole('button',{name:/Críticas/}).click();await expect(tools).toContainText('1 de 2 prioridades exibidas');
 await expect(page.locator('#gcl-action-center-v12 details').nth(0)).toBeVisible();await expect(page.locator('#gcl-action-center-v12 details').nth(1)).toBeHidden();
 await tools.getByRole('button',{name:/Todas/}).click();await tools.getByRole('searchbox',{name:'Buscar dentro das prioridades'}).fill('Prova social');await expect(tools).toContainText('1 de 2 prioridades exibidas');
});

test('loading states become visual skeletons while preserving screen-reader status',async({page})=>{
 await mock(page);await page.goto(`${BASE}/ranking/`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{const x=document.createElement('div');x.className='gcl-loading';x.textContent='Carregando dados da liga…';document.body.appendChild(x)});
 const host=page.locator('.gcl-loading').last();await expect(host).toHaveAttribute('role','status');await expect(host).toHaveAttribute('aria-busy','true');await expect(host.locator('.gcl-skeleton35')).toHaveCount(1);await expect(host.locator('.gcl-sr35')).toContainText('Carregando dados da liga');
});

test('authenticated audit owner can persist execution status without touching score',async({page})=>{
 let submitted=null;
 await page.addInitScript(()=>localStorage.setItem('gcl_session_v1',JSON.stringify({access_token:'e2e-token',refresh_token:'e2e-refresh',expires_at:Math.floor(Date.now()/1000)+3600})));
 await page.route('**/functions/v1/sac-ranking-site-api',async route=>{
  let body={};try{body=JSON.parse(route.request().postData()||'{}')}catch{}
  const result=body.action==='report'?{found:true,audit:{id:AUDIT_ID},domain:{id:'33333333-3333-4333-8333-333333333333'}}:home;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result})});
 });
 await page.route('**/functions/v1/gcl-action-plan-api',async route=>{
  const body=JSON.parse(route.request().postData()||'{}');
  if(body.action==='list')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result:[]})});
  submitted=body;return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,result:{id:'44444444-4444-4444-8444-444444444444',issue_key:body.issue_key,status:body.status}})});
 });
 await page.goto(`${BASE}/?scan=${TOKEN}`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{const host=document.createElement('div');host.innerHTML=`<section id="gcl-report-intelligence-v11"></section><section id="gcl-action-center-v12"><div class="gcl-action-list"><details><summary><span><strong>CTA principal não observado</strong><small>Conversão</small></span><em class="fail">Crítico</em></summary><div class="gcl-action-body"><div class="gcl-action-advice"><p>Defina um CTA primário claro acima da dobra.</p><small>Impacto técnico associado ao critério: até 8 pontos.</small></div></div></details></div></section>`;document.body.appendChild(host)});
 const board=page.locator('#gcl-ap36-board');await expect(board).toBeVisible({timeout:10000});await expect(board).toContainText('Marcar uma tarefa como feita não altera o GCL Score');
 const status=page.locator('.gcl-ap36-current').first();await status.click();await page.locator('.gcl-ap36-menu [data-status="in_progress"]').first().click();await expect(status).toContainText('Em execução');expect(submitted).toMatchObject({action:'upsert',audit_run_id:AUDIT_ID,status:'in_progress',label:'CTA principal não observado'});await expect(board.locator('[data-ap36-doing]')).toHaveText('1');
});
