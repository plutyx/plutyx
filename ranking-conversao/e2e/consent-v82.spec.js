import { test, expect } from '@playwright/test';

const BASE=process.env.GCL_E2E_BASE||'http://127.0.0.1:4173/ranking-site';

test('v82 defaults non-essential measurement to denied and releases first-party events only after consent',async({page})=>{
  const events=[];
  await page.route('**/functions/v1/sac-public-api',async route=>{
    let body={};
    try{body=JSON.parse(route.request().postData()||'{}')}catch{}
    if(body.action==='acquisition-event'){
      events.push(body);
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({recorded:true})});
    }
    if(body.action==='snapshot')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({})});
  });

  await page.goto(`${BASE}/?utm_source=google&utm_medium=cpc&utm_campaign=v82-browser&gclid=CLICK-SHOULD-STAY-PRIVATE`,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Sua privacidade, sem atalhos.')).toBeVisible();
  await page.waitForTimeout(300);
  expect(events.filter(e=>e.event_name==='landing_view')).toHaveLength(0);

  await page.getByRole('button',{name:'Aceitar medição',exact:true}).click();
  await expect(page.getByRole('button',{name:'Privacidade',exact:true})).toBeVisible();
  await expect.poll(()=>events.some(e=>e.event_name==='consent_updated'&&e.analytics_consent===true&&e.ads_consent===false)).toBeTruthy();
  await expect.poll(()=>events.some(e=>e.event_name==='landing_view'&&e.analytics_consent===true&&e.ads_consent===false)).toBeTruthy();

  const landing=events.find(e=>e.event_name==='landing_view');
  expect(landing.attribution?.utm_source).toBe('google');
  expect(landing.attribution?.utm_medium).toBe('cpc');
  expect(landing.attribution?.gclid).toBeUndefined();
  expect(landing.attribution?.fbclid).toBeUndefined();

  const stored=await page.evaluate(()=>localStorage.getItem('gcl_consent_v82'));
  expect(stored).toContain('"analytics":true');
  expect(stored).toContain('"ads":false');
  expect(stored).not.toContain('CLICK-SHOULD-STAY-PRIVATE');
  expect(stored).not.toMatch(/gclid|fbclid|msclkid|ttclid/i);

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByText('Sua privacidade, sem atalhos.')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Privacidade',exact:true})).toBeVisible();
});

test('v82 lets a user keep only necessary storage without emitting analytics events',async({page})=>{
  const events=[];
  await page.route('**/functions/v1/sac-public-api',async route=>{
    let body={};
    try{body=JSON.parse(route.request().postData()||'{}')}catch{}
    if(body.action==='acquisition-event')events.push(body);
    await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({recorded:true})});
  });
  await page.goto(`${BASE}/?utm_source=meta&fbclid=PRIVATE-FB-CLICK`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Somente necessários',exact:true}).click();
  await expect.poll(()=>events.some(e=>e.event_name==='consent_updated')).toBeTruthy();
  expect(events.filter(e=>e.event_name==='landing_view')).toHaveLength(0);
  const consentEvent=events.find(e=>e.event_name==='consent_updated');
  expect(consentEvent.analytics_consent).toBe(false);
  expect(consentEvent.ads_consent).toBe(false);
  expect(JSON.stringify(consentEvent)).not.toContain('PRIVATE-FB-CLICK');
});
