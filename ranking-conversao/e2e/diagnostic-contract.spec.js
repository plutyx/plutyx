import { test, expect } from '@playwright/test';

const BASE = process.env.GCL_E2E_BASE || 'http://127.0.0.1:4173/ranking-site';
const TOKEN = '55555555-5555-4555-8555-555555555555';
const ranking = {
  score_100: 88.8, overall_rank: 1, eligibility_status: 'eligible',
  score_status: 'provisional', ranking_scope: 'autonomous_diagnostic',
  official_competition_eligible: false, metric_coverage: .943,
  atomic_verification_coverage: .253, collector_metric_coverage: .943,
  evidence_confidence: .9, preliminary_axes: 6,
};

async function fixture(page, overrides = {}) {
  await page.route('**/functions/v1/sac-ranking-site-api', async route => {
    const { action } = route.request().postDataJSON() || {};
    const report = {
      found: true, audit_run_id: TOKEN, audit: { pages_analyzed: 8 },
      domain: { normalized_domain: 'example.com', detected_archetype: 'lead_generation_service' },
      ranking, status_summary: { pass: 100, warning: 50, fail: 20, not_verifiable: 502 },
      diagnostic_truth: { atomic_observed: 170, atomic_total: 672, atomic_verification_coverage: .253, collector_metric_coverage: .943, preliminary_axes: 6 },
      score_distribution: { ...ranking, gcl_score_100: 88.8, available: true, axes: [] },
      sales_architecture: { archetype: 'lead_generation_service', checkout_applicability: 'not_applicable', readiness_100: 70, sampled_current_pages: 8, lead_cta_pages: 6, forms_observed: 2, offer_component_diversity: 3, proof_mentions: 4 },
      issues: [], pages: [], dimensions: [], metrics: [], awards: [], rank_history: [],
      evidence_dashboard: {}, ...overrides,
    };
    const result = action === 'status' ? { status: 'completed' } : action === 'report' ? report : { ranking: [], awards_catalog: [], offers: {}, stats: {}, market: { listings: [] } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });
  await page.goto(`${BASE}/?scan=${TOKEN}`, { waitUntil: 'domcontentloaded' });
}

test('provisional report separates verified checks from collector signals and never shows a stale rank', async ({ page }) => {
  await fixture(page);
  const explanation = page.getByRole('region', { name: 'Como interpretar este diagnóstico' });
  await expect(explanation).toContainText('Diagnóstico provisório');
  await expect(explanation).toContainText('25,3%');
  await expect(explanation).toContainText('94,3%');
  await expect(explanation).toContainText('170 de 672');
  await expect(page.locator('.s3-report-score')).toContainText('≈ 89');
  await expect(page.locator('.s3-rankbox')).toContainText('Sem posição');
  await expect(page.locator('.s3-rankbox')).not.toContainText('#1');
  await expect(page.locator('#gcl-report-intelligence-v11')).toContainText('170 de 672 verificações');
  await expect(page.locator('#gcl-score-profile')).toContainText('25,3%');
  const sales = page.locator('#gcl-revenue-architecture');
  await expect(sales).toContainText('Arquitetura de captação de leads');
  await expect(sales.getByText('Não aplicável', { exact: true })).toHaveCount(2);
  await explanation.getByText('Por que alguns valores são aproximados?').click();
  await expect(explanation).toContainText('não vira nota zero');
});

test('legacy collector coverage cannot silently become verification coverage', async ({ page }) => {
  await fixture(page, { ranking: { score_100: null, metric_coverage: .95, overall_rank: 1, eligibility_status: 'eligible' }, diagnostic_truth: null, score_distribution: null, status_summary: undefined });
  const explanation = page.getByRole('region', { name: 'Como interpretar este diagnóstico' });
  await expect(explanation.locator('.gcl-diagnostic-grid > div').first()).toContainText('—');
  await expect(page.locator('.s3-report-score')).toContainText('—');
  await expect(page.locator('.s3-rankbox')).not.toContainText('#1');
});

test('official position requires the explicit competition contract', async ({ page }) => {
  await fixture(page, { ranking: { ...ranking, score_status: 'official', ranking_scope: 'official_competition', official_competition_eligible: true, preliminary_axes: 0 }, diagnostic_truth: { preliminary_axes: 0 } });
  await expect(page.locator('.s3-rankbox')).toContainText('#1');
  await expect(page.locator('.s3-report-score')).toContainText('88,8');
  await expect(page.locator('.s3-report-score')).not.toContainText('≈');
});
