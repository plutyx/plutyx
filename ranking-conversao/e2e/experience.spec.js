import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
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
 const focus=toolbar.getByRole('button',{name:'Modo foco'});await focus.click();await expect(page.locator('body')).toHaveClass(/gcl-rx-focus33/);await expect(focus).toHaveAttribute('aria-pressed','true');
});

test('experience layer honors reduced-motion preference',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await mock(page);await page.goto(`${BASE}/ranking/`,{waitUntil:'domcontentloaded'});
 await expect(page.locator('html')).toHaveAttribute('data-gcl-motion','reduced');
});

test('adaptive controls do not create horizontal overflow on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mock(page);await page.goto(`${BASE}/blog/`,{waitUntil:'domcontentloaded'});await page.getByText(article.title,{exact:true}).first().click();await expect(page.locator('.gcl-rx33-toolbar')).toBeVisible({timeout:10000});
 const dims=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));expect(dims.sw).toBeLessThanOrEqual(dims.cw+1);
});
