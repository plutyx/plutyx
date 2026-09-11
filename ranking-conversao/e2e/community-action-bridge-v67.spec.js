import { test, expect } from '@playwright/test';

const BASE = process.env.GCL_E2E_BASE || 'http://127.0.0.1:4173/ranking-site';
const POST_ID = '67676767-6767-4767-8767-676767676767';
const AUTHOR_ID = '68686868-6868-4868-8868-686868686868';
const VIEWER_ID = '69696969-6969-4969-8969-696969696969';
const POST_TITLE = 'Checkout mobile perde vendas';
const POST_BODY = 'Quero reduzir abandono no checkout sem aumentar etapas nem esconder custos.';
const POST_URL = 'https://example.com/checkout';

function errors(page) {
  const out = [];
  page.on('pageerror', e => out.push(String(e?.message || e)));
  return out;
}

async function fixture(page) {
  const calls = [];
  await page.addInitScript(({ viewer }) => {
    localStorage.setItem('gcl_session_v1', JSON.stringify({
      access_token: 'gcl-bridge-e2e-token', refresh_token: 'gcl-bridge-e2e-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: viewer }
    }));
  }, { viewer: VIEWER_ID });

  await page.route('**/functions/v1/gcl-member-api', async route => {
    const body = route.request().postDataJSON() || {};
    calls.push(body);
    let result = [];
    if (body.action === 'dashboard') result = {
      profile: { user_id: VIEWER_ID, display_name: 'Membro Bridge', community_level: 2, community_points: 120 },
      access: { ranking: true, community: true }, community_leaderboard: [], upcoming_events: [], missions: []
    };
    else if (body.action === 'spaces') result = [
      { slug: 'feed', name: 'Feed', description: 'Discussões', space_type: 'discussion' },
      { slug: 'hot-seats', name: 'Hot Seats', description: 'Revisão coletiva', space_type: 'hot_seats' },
      { slug: 'jobs', name: 'Projetos & Vagas', description: 'Execução', space_type: 'jobs' }
    ];
    else if (body.action === 'feed') result = { posts: [{
      id: POST_ID, author_user_id: AUTHOR_ID, display_name: 'Ana CRO', community_level: 3,
      member_type: 'optimizer', post_type: 'discussion', title: POST_TITLE, body: POST_BODY,
      link_url: POST_URL, normalized_domain: 'example.com', reaction_count: 4, comment_count: 2,
      view_count: 22, viewer_reaction: null, viewer_saved: false, viewer_follows_author: false,
      author_follower_count: 8, featured: false, created_at: '2026-09-11T15:00:00-03:00'
    }] };
    else if (body.action === 'hot_seats') result = [];
    else if (body.action === 'projects') result = [];
    else if (body.action === 'submit_hot_seat') result = { id: '70707070-7070-4070-8070-707070707070', status: 'submitted' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });

  await page.route('**/functions/v1/sac-ranking-site-api', async route => {
    const body = route.request().postDataJSON() || {};
    const result = body.action === 'home' ? {
      market: { listings: [{
        slug: 'cro-sprint', title: 'CRO Sprint', summary: 'Implementação focada nos gaps de conversão.',
        category: 'CRO', platforms: ['Web'], featured: true
      }] }, offers: {}, stats: {}, ranking: [], recent_analyzed: [], awards_catalog: []
    } : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });

  await page.goto(`${BASE}/community/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.gcl-social-actions').first()).toBeVisible({ timeout: 10000 });
  return calls;
}

test('community post can prefill a Hot Seat without auto-submitting it', async ({ page }) => {
  const pageErrors = errors(page);
  const calls = await fixture(page);
  const post = page.locator('.gcl-post').first();
  const bridge = post.getByRole('group', { name: 'Próximas ações para esta discussão' });

  await expect(bridge).toBeVisible();
  await bridge.getByRole('button', { name: 'Levar ao Hot Seat' }).click();

  const modal = page.locator('.cw27-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('input[name="url"]')).toHaveValue(POST_URL);
  await expect(modal.locator('input[name="goal"]')).toHaveValue(POST_TITLE);
  await expect(modal.locator('textarea[name="context"]')).toHaveValue(POST_BODY);
  expect(calls.some(x => x.action === 'submit_hot_seat')).toBeFalsy();

  await modal.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => calls.filter(x => x.action === 'submit_hot_seat').length).toBe(1);
  const submit = calls.find(x => x.action === 'submit_hot_seat');
  expect(submit.page_url).toBe(POST_URL);
  expect(submit.goal).toBe(POST_TITLE);
  expect(submit.context).toBe(POST_BODY);
  expect(pageErrors).toEqual([]);
});

test('Market handoff keeps discussion text out of the URL and prefills proposal context', async ({ page }) => {
  const pageErrors = errors(page);
  await fixture(page);
  const post = page.locator('.gcl-post').first();
  await post.getByRole('group', { name: 'Próximas ações para esta discussão' }).getByRole('button', { name: 'Buscar execução' }).click();

  await expect(page).toHaveURL(/\/ranking-site\/services\/\?source=community$/);
  expect(page.url()).not.toContain(encodeURIComponent(POST_BODY));
  expect(page.url()).not.toContain('checkout%20mobile');

  const handoff = page.getByRole('region', { name: 'Contexto vindo da Community' });
  await expect(handoff).toBeVisible({ timeout: 10000 });
  await expect(handoff).toContainText(POST_TITLE);
  await expect(handoff).toContainText('example.com');

  const raw = await page.evaluate(() => sessionStorage.getItem('gcl_community_handoff_v1'));
  const stored = JSON.parse(raw);
  expect(stored.post_id).toBe(POST_ID);
  expect(stored.url).toBe(POST_URL);
  expect(stored.context).toBe(POST_BODY);
  expect(Number(stored.expires_at)).toBeGreaterThan(Date.now());

  await page.getByRole('button', { name: 'Solicitar proposta' }).click();
  const modal = page.locator('.gcl-mr16');
  await expect(modal).toBeVisible();
  await expect(modal.locator('input[name="website_url"]')).toHaveValue(POST_URL);
  await expect(modal.locator('textarea[name="message"]')).toHaveValue(POST_BODY);
  expect(pageErrors).toEqual([]);
});

test('expired handoff is discarded instead of leaking stale context into Market', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('gcl_community_handoff_v1', JSON.stringify({
      version: 1, post_id: 'old', title: 'Contexto velho', context: 'Não reutilizar',
      url: 'https://expired.example/', expires_at: Date.now() - 1000
    }));
  });
  await page.route('**/functions/v1/sac-ranking-site-api', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: {
      market: { listings: [{ slug: 'cro-sprint', title: 'CRO Sprint', summary: 'Implementação', category: 'CRO', platforms: [] }] },
      offers: {}, stats: {}, ranking: [], recent_analyzed: [], awards_catalog: []
    } }) });
  });
  await page.goto(`${BASE}/services/?source=community`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'Contexto vindo da Community' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('gcl_community_handoff_v1'))).toBe(null);
});
