import { test, expect } from '@playwright/test';

const BASE='https://plutyx.com/ranking-site';
test.describe.configure({retries:2});

function pageErrors(page){const errors=[];page.on('pageerror',e=>errors.push(String(e?.message||e)));return errors}

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
