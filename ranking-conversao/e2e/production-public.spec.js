import { test, expect } from '@playwright/test';

const BASE='https://plutyx.com/ranking-site';
const EXPECTED_SHA=process.env.GCL_EXPECTED_PRODUCTION_SHA||'';
const AI_CANARY_SCAN=process.env.GCL_AI_CANARY_SCAN||'';
test.describe.configure({retries:2});

function pageErrors(page){const errors=[];page.on('pageerror',e=>errors.push(String(e?.message||e)));return errors}
function proofUrl(){return `${BASE}/gcl-build.json?proof=${encodeURIComponent(EXPECTED_SHA)}&nonce=${Date.now()}-${Math.random().toString(36).slice(2)}`}

test('production provenance matches the promoted source SHA',async({request})=>{
  test.skip(!EXPECTED_SHA,'GCL_EXPECTED_PRODUCTION_SHA is required only in the release proof workflow');
  const response=await request.get(proofUrl(),{timeout:30000,headers:{'cache-control':'no-cache, no-store, must-revalidate','pragma':'no-cache'}});
  expect(response.ok()).toBeTruthy();
  const body=await response.json();
  expect(body.application).toBe('Global Conversion League');
  expect(body.base_path).toBe('/ranking-site/');
  expect(body.artifact).toBe('hostinger-production-bundle');
  expect(body.source_sha).toBe(EXPECTED_SHA);
});

for(const [path,needle] of [
  ['/ranking/','A COPA DO MUNDO DA CONVERSÃO'],
  ['/awards/','SALA DE TROFÉUS'],
  ['/community/','COMMUNITY · STADIUM LOBBY'],
  ['/services/','GCL MARKET'],
  ['/blog/','600+ sinais, um score'],
  ['/about/','O DEPARTAMENTO DE SCOUTING DA LIGA'],
  ['/account/','Seu lugar na liga começa aqui.']
]){
  test(`${path} is healthy on plutyx.com`,async({page})=>{
    const errors=pageErrors(page);
    const response=await page.goto(`${BASE}${path}`,{waitUntil:'domcontentloaded',timeout:30000});
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByText(needle,{exact:false}).first()).toBeVisible({timeout:20000});
    await expect(page.locator('body')).not.toContainText('O corpus HTTP e o cohort');
    await expect(page.locator('body')).not.toContainText('Percentis do corpus profundo');
    await expect(page.locator('body')).not.toContainText('GCL Labs');
    expect(errors).toEqual([]);
  });
}

test('production URL and visible surface stay brand-clean',async({page})=>{
  await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded',timeout:30000});
  expect(page.url()).toMatch(/^https:\/\/plutyx\.com\/ranking-site\/?(?:[?#].*)?$/);
  const text=(await page.locator('body').innerText()).toLowerCase();
  for(const forbidden of ['chatgpt','openai','onrender.com','vercel.app','netlify.app','localhost'])expect(text).not.toContain(forbidden);
});

test('real AI canary publishes a grounded analyst without score authority',async({page})=>{
  test.skip(!AI_CANARY_SCAN,'GCL_AI_CANARY_SCAN is required only in the release proof workflow');
  const errors=pageErrors(page);
  const response=await page.goto(`${BASE}/?scan=${encodeURIComponent(AI_CANARY_SCAN)}`,{waitUntil:'domcontentloaded',timeout:30000});
  expect(response?.status()).toBeLessThan(400);
  const card=page.getByRole('region',{name:'GCL AI Analyst'});
  await expect(card).toBeVisible({timeout:30000});
  await expect(card).toContainText('DIAGNÓSTICO · EVIDÊNCIAS PÚBLICAS');
  await expect(card).toContainText('NÃO ALTERA O GCL SCORE');
  await expect(card).toContainText('GCL-AI-2.0');
  await expect(page.locator('.s3-report-score')).toBeVisible({timeout:20000});
  expect(errors).toEqual([]);
});
