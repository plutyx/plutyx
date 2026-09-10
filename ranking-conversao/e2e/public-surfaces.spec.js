import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';
function errors(page){const out=[];page.on('pageerror',e=>out.push(String(e?.message||e)));return out}

for(const [path,needle] of [
  ['/ranking/','A COPA DO MUNDO DA CONVERSÃO'],
  ['/awards/','SALA DE TROFÉUS'],
  ['/services/','GCL MARKET'],
]){
 test(`${path} renders its production surface`,async({page})=>{
   const errs=errors(page);await page.goto(`${BASE}${path}`,{waitUntil:'domcontentloaded'});
   await expect(page.getByText(needle,{exact:false}).first()).toBeVisible({timeout:15000});
   await expect(page.locator('body')).not.toContainText('O corpus HTTP e o cohort');
   await expect(page.locator('body')).not.toContainText('Percentis do corpus profundo');
   expect(errs).toEqual([]);
 });
}

test('Community guest sees a real editorial stadium lobby without fake engagement',async({page})=>{
 const errs=errors(page);await page.goto(`${BASE}/community/`,{waitUntil:'domcontentloaded'});
 await expect(page.getByText('COMMUNITY · STADIUM LOBBY')).toBeVisible({timeout:15000});
 await expect(page.getByText('Entre no vestiário antes de entrar em campo.')).toBeVisible();
 await expect(page.getByText('Founding Season 2026: seu site entra em campo antes de você')).toBeVisible();
 await expect(page.locator('.gcl-lobby-score')).toContainText('9');
 expect(errs).toEqual([]);
});

test('Research opens with published GCL Intelligence articles',async({page})=>{
 const errs=errors(page);await page.goto(`${BASE}/blog/`,{waitUntil:'domcontentloaded'});
 await expect(page.getByText('600+ sinais, um score: como a GCL evita inflar a pontuação')).toBeVisible({timeout:15000});
 await expect(page.locator('body')).not.toContainText('GCL Labs');
 const link=page.getByText('600+ sinais, um score: como a GCL evita inflar a pontuação').first();
 await link.click();
 await expect(page.getByText('PRÓXIMA JOGADA')).toBeVisible({timeout:15000});
 await expect(page.getByText('GCL Intelligence',{exact:true}).first()).toBeVisible();
 expect(errs).toEqual([]);
});

test('public bundle keeps the Plutyx GCL surface free of external preview branding',async({page})=>{
 await page.goto(`${BASE}/`,{waitUntil:'domcontentloaded'});
 const html=(await page.locator('body').innerText()).toLowerCase();
 for(const forbidden of ['chatgpt','openai','onrender.com','vercel.app','netlify.app','localhost'])expect(html).not.toContain(forbidden);
});
