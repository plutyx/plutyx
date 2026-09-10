import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
const TOKEN='11111111-1111-4111-8111-111111111111';
const DIST={
  available:true,
  version:'GCL-RADAR-1.0',
  kind:'diagnostic_score_distribution',
  source_audit_run_id:'22222222-2222-4222-8222-222222222222',
  source_matches_gcl_score:true,
  gcl_score_100:85.4,
  metric_coverage:.8436,
  evidence_confidence:.9063,
  tier:'advanced',
  eligibility_status:'eligible',
  measured_axes:6,
  ready_axes:2,
  preliminary_axes:4,
  strongest:{code:'wpo',label:'Performance',score_100:96.7,preliminary:false,coverage_100:78.2},
  weakest:{code:'semantics_seo',label:'SEO & Semântica',score_100:75.1,preliminary:true,coverage_100:40.4},
  disclosure:'Os eixos são dimensões diagnósticas observadas e não parcelas aditivas do GCL Score.',
  axes:[
    {code:'design',label:'Design & Craft',display_order:10,score_100:96.4,preliminary:true,coverage_100:20.3,confidence_100:75.8,status:'insufficient_coverage'},
    {code:'usability',label:'UX & Usabilidade',display_order:20,score_100:85.9,preliminary:true,coverage_100:23.4,confidence_100:83.7,status:'insufficient_coverage'},
    {code:'conversion_readiness',label:'Conversão',display_order:30,score_100:82.0,preliminary:true,coverage_100:26.3,confidence_100:78.1,status:'insufficient_coverage'},
    {code:'wpo',label:'Performance',display_order:40,score_100:96.7,preliminary:false,coverage_100:78.2,confidence_100:96.1,status:'ready'},
    {code:'semantics_seo',label:'SEO & Semântica',display_order:50,score_100:75.1,preliminary:true,coverage_100:40.4,confidence_100:93.5,status:'insufficient_coverage'},
    {code:'accessibility',label:'Acessibilidade',display_order:60,score_100:85.8,preliminary:false,coverage_100:74.1,confidence_100:93.1,status:'ready'}
  ]
};

function collectErrors(page){const errors=[];page.on('pageerror',e=>errors.push(String(e?.message||e)));return errors}

async function mockReportApi(page,dist=DIST){
  await page.route('**/functions/v1/sac-ranking-site-api',async route=>{
    let body={};try{body=JSON.parse(route.request().postData()||'{}')}catch{}
    const result=body.action==='report'?{
      found:true,
      audit_run_id:'22222222-2222-4222-8222-222222222222',
      audit:{id:'22222222-2222-4222-8222-222222222222',pages_analyzed:1,pages_discovered:1},
      domain:{id:'33333333-3333-4333-8333-333333333333',normalized_domain:'example.com'},
      ranking:{score_100:85.4,metric_coverage:.8436,evidence_confidence:.9063,eligibility_status:'eligible'},
      score_distribution:dist,
      issues:[],pages:[],rank_history:[],evidence_dashboard:{metric_coverage:{by_evidence_class:{}}}
    }:{ranking:[],awards_catalog:[],offers:{},market:{listings:[]},stats:{},latest_articles:[],community_preview:{posts:[]}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result})});
  });
}

test('paid report renders evidence-aware six-axis candidate distribution',async({page})=>{
  const errors=collectErrors(page);await mockReportApi(page);
  await page.goto(`${BASE}/?scan=${TOKEN}`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{const host=document.createElement('section');host.id='gcl-report-intelligence-v11';host.innerHTML='<h2>Executive Overview</h2>';document.body.appendChild(host)});
  const card=page.locator('#gcl-score-profile');await expect(card).toBeVisible({timeout:10000});
  await expect(card).toContainText('DISTRIBUIÇÃO DE PONTOS DO CANDIDATO');
  await expect(card).toContainText('85,4 / 100');
  for(const label of ['Design & Craft','UX & Usabilidade','Conversão','Performance','SEO & Semântica','Acessibilidade'])await expect(card.getByText(label,{exact:true}).first()).toBeVisible();
  await expect(card).toContainText('Maior força');await expect(card).toContainText('Maior oportunidade');
  await expect(card.locator('svg[role="img"]')).toHaveAttribute('aria-label',/Performance: 96,7 de 100/);
  await expect(card).toContainText('não parcelas aditivas do GCL Score');
  await expect(card.getByRole('link',{name:'Melhorar meus pontos'})).toHaveAttribute('href',`/ranking-site/services/?scan=${TOKEN}`);
  expect(errors).toEqual([]);
});

test('member cockpit exposes score profile beside the full-analysis history',async({page})=>{
  const errors=collectErrors(page);
  await page.addInitScript(()=>localStorage.setItem('gcl_session_v1',JSON.stringify({access_token:'gcl-e2e-access-token',refresh_token:'gcl-e2e-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600})));
  await page.route('**/functions/v1/gcl-member-api',async route=>{
    let action='';try{action=JSON.parse(route.request().postData()||'{}').action||''}catch{}
    const analysis={intent_token:'44444444-4444-4444-8444-444444444444',normalized_domain:'example.com',status:'completed',scan_status:'completed',score_100:85.4,overall_rank:2,tier:'advanced',scan_public_token:TOKEN,report_path:`/ranking-site/?scan=${TOKEN}`,score_distribution:DIST};
    const result=action==='analyses'?[analysis]:action==='dashboard'?{
      profile:{display_name:'Radar Teste',community_level:2,community_points:40},access:{ranking:true,community:false},
      domains:[{id:'33333333-3333-4333-8333-333333333333',normalized_domain:'example.com',company_name:'Example',verified:true,score_100:85.4,overall_rank:2,tier:'advanced'}],
      analyses:[analysis],memberships:[],purchases:[],missions:[],upcoming_events:[],unread_notifications:0,
      connection_center:{catalog_total:779,autonomous_ready:684,connection_metrics:95,implemented_connection_metrics:0,groups:[]}
    }:[];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,result})});
  });
  await page.goto(`${BASE}/account/`,{waitUntil:'domcontentloaded'});
  const card=page.locator('#gcl-score-profile');await expect(card).toBeVisible({timeout:12000});
  await expect(page.getByText('Perfil de Pontuação',{exact:true})).toBeVisible();
  await expect(card).toContainText('example.com');await expect(card).toContainText('85,4 / 100');
  await expect(card.getByRole('link',{name:'Abrir análise completa'})).toHaveAttribute('href',`/ranking-site/?scan=${TOKEN}`);
  const analysisPanel=page.locator('.ma25-panel').filter({has:page.locator('.ma25-section-title>span',{hasText:'ANÁLISES'})});
  const cardBox=await card.boundingBox();const panelBox=await analysisPanel.boundingBox();expect(cardBox&&panelBox&&cardBox.y).toBeLessThan(panelBox.y);
  expect(errors).toEqual([]);
});

test('radar refuses to turn missing evidence into a zero-valued axis',async({page})=>{
  const incomplete={...DIST,available:true,measured_axes:5,axes:DIST.axes.map((a,i)=>i===2?{...a,score_100:null,preliminary:false,status:'pending_evidence'}:a)};
  await mockReportApi(page,incomplete);await page.goto(`${BASE}/?scan=${TOKEN}`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{const host=document.createElement('section');host.id='gcl-report-intelligence-v11';document.body.appendChild(host)});
  const card=page.locator('#gcl-score-profile');await expect(card).toBeVisible({timeout:10000});
  await expect(card).toContainText('Perfil ainda em formação');
  await expect(card.locator('.sr42-area')).toHaveCount(0);
});
