import { test, expect } from '@playwright/test';

const BASE = process.env.GCL_E2E_BASE || 'http://127.0.0.1:4173/ranking-site';

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error?.message || error)));
  return errors;
}

test('guest account route renders the Player Pass instead of hanging', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto(`${BASE}/account/`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Seu lugar na liga começa aqui.')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Entrar na arena' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar meu passaporte' })).toBeVisible();
  await expect(page.getByText('Carregando seu cockpit…')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('authenticated account route leaves loading state and renders the cockpit', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.addInitScript(() => {
    localStorage.setItem('gcl_session_v1', JSON.stringify({
      access_token: 'gcl-e2e-access-token',
      refresh_token: 'gcl-e2e-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    }));
  });

  await page.route('**/functions/v1/gcl-member-api', async route => {
    const request = route.request();
    let action = '';
    try { action = JSON.parse(request.postData() || '{}').action || ''; } catch {}

    if (action !== 'dashboard') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, result: [] })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        result: {
          profile: {
            display_name: 'Teste GCL',
            community_level: 2,
            community_points: 135
          },
          access: { ranking: true, community: true },
          domains: [{
            id: 'domain-e2e',
            normalized_domain: 'example.com',
            company_name: 'Example',
            verified: true,
            score_100: 82.4,
            overall_rank: 7,
            tier: 'ELITE'
          }],
          analyses: [{
            id: 'analysis-e2e',
            normalized_domain: 'example.com',
            status: 'completed',
            score_100: 82.4,
            report_path: '/ranking-site/?scan=e2e'
          }],
          memberships: [{
            id: 'membership-e2e',
            plan_code: 'sac_ranking_community_monthly',
            status: 'active',
            ranking_enabled: true,
            community_enabled: true
          }],
          purchases: [{
            id: 'purchase-e2e',
            product_code: 'sac_awards_entry_2026',
            name: 'Global Conversion Awards 2026',
            status: 'approved',
            amount: 297
          }],
          missions: [{
            id: 'mission-e2e',
            title: 'Subir uma posição',
            description: 'Melhore o próximo gap prioritário.',
            status: 'active',
            points: 100
          }],
          upcoming_events: [],
          unread_notifications: 2
        }
      })
    });
  });

  await page.goto(`${BASE}/account/`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/Olá, Teste\./)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Sua temporada em 5 movimentos')).toBeVisible();
  await expect(page.getByText('82,4')).toBeVisible();
  await expect(page.getByText('#7')).toBeVisible();
  await expect(page.getByText('Carregando seu cockpit…')).toHaveCount(0);

  expect(errors).toEqual([]);
});
