import { test, expect } from '@playwright/test';

const BASE = process.env.GCL_E2E_BASE || 'http://127.0.0.1:4173/ranking-site';
const TOKEN = '65656565-6565-4656-8656-656565656565';

async function fixture(page, queue = {}) {
  await page.route('**/functions/v1/sac-ranking-site-api', async route => {
    const { action } = route.request().postDataJSON() || {};
    const result = action === 'status'
      ? {
          found: true,
          status: 'queued',
          mode: 'full_paid',
          url: 'https://example.com/',
          queue: {
            available: true,
            status: 'queued',
            position: 3,
            jobs_ahead: 2,
            priority: 'paid',
            fair_round: 1,
            estimated_start_seconds: 333,
            estimated_start_seconds_p95: 522,
            avg_processing_seconds_24h: 111.2,
            p95_processing_seconds_24h: 174,
            global_slots: 1,
            scheduler: 'priority_fair_round_robin_v1',
            admission_state: 'open',
            message: 'Fila prioritária de análises pagas com justiça entre solicitantes.',
            ...queue,
          },
        }
      : action === 'home'
        ? { ranking: [], awards_catalog: [], offers: {}, stats: {}, market: { listings: [] }, benchmark_story: {} }
        : {};

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });

  await page.goto(`${BASE}/?scan=${TOKEN}`, { waitUntil: 'domcontentloaded' });
}

test('queued paid scan exposes real queue position, ETA and scheduler semantics', async ({ page }) => {
  await fixture(page);

  const card = page.getByRole('region', { name: 'Status da fila de análise' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('#3');
  await expect(card).toContainText('2 análises à frente');
  await expect(card).toContainText('≈ 6 min');
  await expect(card).toContainText('Prioridade paga');
  await expect(card).toContainText('Fila justa');
  await expect(card).toContainText('1 slot seguro');
});

test('processing scan switches from queue position to live execution state', async ({ page }) => {
  await fixture(page, {
    status: 'processing',
    position: 0,
    jobs_ahead: 0,
    estimated_start_seconds: 0,
    estimated_start_seconds_p95: 0,
    message: 'Scan em processamento no worker.',
  });

  const card = page.getByRole('region', { name: 'Status da fila de análise' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Em processamento');
  await expect(card).toContainText('worker pesado');
  await expect(card).not.toContainText('análises à frente');
});

test('queue experience never fabricates an ETA when backend has no timing evidence', async ({ page }) => {
  await fixture(page, {
    position: 1,
    jobs_ahead: 0,
    estimated_start_seconds: null,
    estimated_start_seconds_p95: null,
    avg_processing_seconds_24h: null,
    p95_processing_seconds_24h: null,
  });

  const card = page.getByRole('region', { name: 'Status da fila de análise' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Próximo na fila');
  await expect(card).toContainText('Estimativa indisponível');
  await expect(card).not.toContainText('≈ 0 min');
});
