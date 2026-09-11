import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
function errors(page){const out=[];page.on('pageerror',e=>out.push(String(e?.message||e)));return out}

const article={
  slug:'600-sinais-um-score',
  title:'600+ sinais, um score: como a GCL evita inflar a pontuação',
  excerpt:'Como transformar centenas de evidências em uma leitura útil sem contar o mesmo problema várias vezes.',
  body_markdown:'Uma auditoria profunda pode observar centenas de sinais, mas o GCL Score não soma tudo de forma ingênua.\n\n1. Evidência antes de pontuação. Cada sinal precisa ter origem e contexto.\n\n2. Agrupamento antes do peso. Famílias correlacionadas não podem dominar o placar.\n\n3. Reauditoria antes da celebração. Melhorias só entram quando a nova versão é observada.',
  category_name:'GCL Research',
  category_slug:'research',
  published_at:'2026-09-10T12:00:00Z'
};

const award={award_code:'CONVERSION_EXCELLENCE',label:'Conversion Excellence',award_family:'conversion',description:'Reconhecimento para sites que transformam experiência em ação.',threshold:80,minimum_coverage:.6};

const home={
  ranking:[],
  awards_catalog:[award],
  offers:{awards:{price:297},community:{price:39},ranking:{price:59},club:{price:79}},
  market:{listings:[{slug:'cro-sprint',title:'CRO Sprint',summary:'Implementação orientada pelos gaps do relatório.',category:'Conversion',platforms:['Web'],pricing_model:'project',featured:true}]},
  stats:{active_public_metrics:684,metric_catalog_total:779,validated_metrics:500,benchmark_http_successful:11668,community_posts:9,market_listings:10},
  benchmark_story:{http_successful_audits:11668,successful_audits:13823},
  latest_articles:[article],
  community_preview:{
    headline:'Entre no vestiário antes de entrar em campo.',
    description:'Uma amostra editorial da Founding Season antes de abrir o vestiário completo.',
    published_official_posts:9,
    spaces:11,
    posts:[{space_name:'Liga',post_type:'announcement',title:'Founding Season 2026: seu site entra em campo antes de você',body:'A temporada começou. Descubra seu score, escolha a próxima jogada e volte para medir a evolução.',author_name:'GCL Intelligence',author_role:'Oficial'}]
  }
};

async function mockPublicApi(page,hooks={}){
  await page.route('**/functions/v1/sac-ranking-site-api',async route=>{
    let body={};
    try{body=JSON.parse(route.request().postData()||'{}')}catch{}
    const action=String(body.action||'');
    let result={};
    if(action==='home')result=home;
    else if(action==='awards_methodology')result={season:{awards_at:'2026-12-18T20:00:00-03:00'},award_catalog:[award]};
    else if(action==='nominees')result=[];
    else if(action==='blog_index')result=[article];
    else if(action==='blog_post')result=article;
    else if(action==='qualify')result={intent_token:'11111111-1111-4111-8111-111111111111',domain:'example.com',url:'https://example.com/',expires_at:'2026-09-12T00:00:00Z',offer:{name:'GCL Conversion Audit · Análise Completa',price:97,currency:'BRL'},benchmark:{http_successful_audits:11668},checkout:{checkout_ready:false,provider_environment:'test',url:null}};
    else if(action==='capture_interest'){
      hooks.onCapture?.(body);
      result={saved:true,stage:body.stage||'checkout_blocked',domain:'example.com',lead_id:'22222222-2222-4222-8222-222222222222',intent_token:body.intent_token,payment_required:true};
    }
    await route.fulfill({status:action==='capture_interest'?201:200,contentType:'application/json',body:JSON.stringify({ok:true,result})});
  });
}

for(const [path,needle] of [
  ['/ranking/','A COPA DO MUNDO DA CONVERSÃO'],
  ['/awards/','SALA DE TROFÉUS'],
  ['/services/','GCL MARKET'],
  ['/about/','O DEPARTAMENTO DE SCOUTING DA LIGA'],
]){
 test(`${path} renders its production surface`,async({page})=>{
   const errs=errors(page);await mockPublicApi(page);await page.goto(`${BASE}${path}`,{waitUntil:'domcontentloaded'});
   await expect(page.getByText(needle,{exact:false}).first()).toBeVisible({timeout:15000});
   await expect(page.locator('body')).not.toContainText('O corpus HTTP e o cohort');
   await expect(page.locator('body')).not.toContainText('Percentis do corpus profundo');
   await expect(page.locator('body')).not.toContainText('GCL Labs');
   expect(errs).toEqual([]);
 });
}

test('lead gate preserves the qualified URL and exposes purpose/privacy before capture',async({page})=>{
 const errs=errors(page);let captured=null;
 await mockPublicApi(page,{onCapture:body=>{captured=body}});
 await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
 const entry=page.locator('form.s3-search,form.input-shell').first();
 await expect(entry).toBeVisible({timeout:15000});
 await entry.locator('input').first().fill('example.com');
 await entry.locator('button').first().click();
 await expect(page.locator('.gcl-paywall15')).toBeVisible({timeout:10000});
 await expect(page.locator('.gcl-paywall15-purpose')).toContainText('Usaremos seus dados de contato para responder a este pedido');
 await expect(page.locator('.gcl-paywall15-purpose a[href="/ranking-site/privacy/"]')).toBeVisible();
 await expect(page.locator('.gcl-paywall15-purpose a[href="/ranking-site/terms/"]')).toBeVisible();
 const leadForm=page.locator('.gcl-paywall15-form');
 await leadForm.locator('input[name="email"]').fill('lead@example.com');
 await leadForm.locator('input[name="company_name"]').fill('Example Co');
 await leadForm.locator('button[type="submit"]').click();
 await expect(page.locator('.gcl-paywall15-success')).toContainText('Análise reservada.');
 expect(captured?.email).toBe('lead@example.com');
 expect(captured?.company_name).toBe('Example Co');
 expect(captured?.stage).toBe('checkout_blocked');
 expect(captured?.marketing_consent).toBe(false);
 expect(errs).toEqual([]);
});

test('Community guest sees a real editorial stadium lobby without fake engagement',async({page})=>{
 const errs=errors(page);await mockPublicApi(page);await page.goto(`${BASE}/community/`,{waitUntil:'domcontentloaded'});
 await expect(page.getByText('COMMUNITY · STADIUM LOBBY')).toBeVisible({timeout:15000});
 await expect(page.getByText('Entre no vestiário antes de entrar em campo.')).toBeVisible();
 await expect(page.getByText('Founding Season 2026: seu site entra em campo antes de você')).toBeVisible();
 await expect(page.locator('.gcl-lobby-score')).toContainText('9');
 await expect(page.locator('.gcl-lobby-card')).not.toContainText(/curtidas|likes|comentários/i);
 expect(errs).toEqual([]);
});

test('Research opens with published GCL Intelligence articles',async({page})=>{
 const errs=errors(page);await mockPublicApi(page);await page.goto(`${BASE}/blog/`,{waitUntil:'domcontentloaded'});
 await expect(page.getByText(article.title)).toBeVisible({timeout:15000});
 await expect(page.locator('body')).not.toContainText('GCL Labs');
 const link=page.getByText(article.title).first();
 await link.click();
 await expect(page.getByText('PRÓXIMA JOGADA')).toBeVisible({timeout:15000});
 await expect(page.locator('.gcl-rx33-meta-main').getByText('GCL Intelligence',{exact:true})).toBeVisible();
 expect(errs).toEqual([]);
});

test('Trust Center exposes production policy surfaces and Awards governance',async({page})=>{
 const errs=errors(page);
 for(const [path,needle] of [
   ['/legal/','Regras visíveis antes de qualquer competição.'],
   ['/terms/','Regras claras para competir, analisar e evoluir.'],
   ['/privacy/','Dados mínimos, finalidade explícita e evidência rastreável.'],
   ['/cookies/','Preferências e sessão sem esconder o que está acontecendo.'],
   ['/refunds/','Cobrança compreensível antes, durante e depois da compra.'],
   ['/awards-rules/','Prestígio precisa ser conquistado — e verificável.']
 ]){
   await page.goto(`${BASE}${path}`,{waitUntil:'domcontentloaded'});
   await expect(page.getByText(needle,{exact:true})).toBeVisible({timeout:10000});
   await expect(page.getByText('sujeito a atualização e revisão jurídica',{exact:false})).toBeVisible();
 }
 expect(errs).toEqual([]);
});

test('policy navigation stays within the Trust Center and returns to the league',async({page})=>{
 const errs=errors(page);await mockPublicApi(page);
 await page.goto(`${BASE}/privacy/`,{waitUntil:'domcontentloaded'});
 const policies=page.getByRole('navigation',{name:'Políticas'});
 await policies.getByRole('link',{name:'Awards',exact:true}).click();
 await expect(page.getByRole('heading',{level:1})).toHaveText('Prestígio precisa ser conquistado — e verificável.');
 await expect(page.getByText('Rota não encontrada',{exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Voltar para a liga',exact:true}).click();
 await expect(page.locator('form.s3-search,form.input-shell').first()).toBeVisible();
 expect(errs).toEqual([]);
});

test('public bundle keeps the Plutyx GCL surface free of external preview branding',async({page})=>{
 await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
 const html=(await page.locator('body').innerText()).toLowerCase();
 for(const forbidden of ['chatgpt','openai','onrender.com','vercel.app','netlify.app','localhost'])expect(html).not.toContain(forbidden);
});
