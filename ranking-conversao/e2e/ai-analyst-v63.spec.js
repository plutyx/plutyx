import { test, expect } from '@playwright/test';

const BASE = process.env.GCL_E2E_BASE || 'http://127.0.0.1:4173/ranking-site';
const TOKEN = '63636363-6363-4636-8636-636363636363';

const ranking = {
  score_100: 88.8,
  overall_rank: null,
  eligibility_status: 'provisional',
  score_status: 'provisional',
  score_visibility: 'provisional',
  ranking_scope: 'autonomous_diagnostic',
  official_competition_eligible: false,
  metric_coverage: .943,
  atomic_verification_coverage: .253,
  collector_metric_coverage: .943,
  evidence_confidence: .9,
  preliminary_axes: 6,
  public_axes_observed: 6,
  minimum_public_axes: 5,
};

const safeAi = {
  available: true,
  diagnostic_only: true,
  public_evidence_only: true,
  score_effect: 'none',
  disclosure: 'Interpretação de IA sobre evidências públicas; sem efeito no score ou ranking.',
  analysis: {
    refinement_status: 'completed',
    executive_summary: 'A proposta de valor é compreensível, mas o caminho até a ação principal pode ser testado com menor fricção.',
    strategic_profile: {
      archetype: 'Lead generation',
      awareness_stage: 'solution-aware',
      audience: 'Empresas buscando crescimento',
      offer: 'Diagnóstico e execução',
      primary_action: 'Solicitar diagnóstico',
      message_match: 'Mensagem e ação principal parecem coerentes com a oferta observada.',
    },
    strengths: [
      { title: 'Oferta legível', insight: 'A ação principal é identificável.', confidence: .91, evidence_refs: ['page:home#cta'] },
    ],
    conversion_leaks: [
      { title: 'Fricção antes do CTA', insight: 'Há espaço para testar uma hierarquia mais direta.', fix: 'Teste uma versão com menos decisões concorrentes.', confidence: .82, evidence_refs: ['page:home#hero'] },
    ],
    experiments: [
      { priority: 'high', hypothesis: 'Uma hierarquia mais direta pode aumentar o avanço até o CTA.', change: 'Reduzir decisões concorrentes no hero.', metric: 'CTR do CTA principal', confidence: .78, evidence_refs: ['page:home#hero'] },
    ],
    copy_suggestions: {
      headline: 'Transforme evidência em uma próxima ação clara',
      primary_cta: 'Ver diagnóstico',
    },
    missing_evidence: ['GA4 first-party', 'dados de experimento'],
    publication_gate: {
      status: 'grounded',
      filtered_items: 0,
      disclosure: 'Somente evidências públicas observadas foram usadas.',
    },
  },
};

async function fixture(page, ai = safeAi) {
  await page.route('**/functions/v1/sac-ranking-site-api', async route => {
    const { action } = route.request().postDataJSON() || {};
    const report = {
      found: true,
      audit_run_id: TOKEN,
      audit: { pages_analyzed: 8 },
      domain: { normalized_domain: 'example.com', detected_archetype: 'lead_generation_service' },
      ranking,
      status_summary: { pass: 100, warning: 50, fail: 20, not_verifiable: 502 },
      diagnostic_truth: {
        atomic_observed: 170,
        atomic_total: 672,
        atomic_verification_coverage: .253,
        collector_metric_coverage: .943,
        preliminary_axes: 6,
        score_visibility: 'provisional',
        public_axes_observed: 6,
        minimum_public_axes: 5,
      },
      score_distribution: { ...ranking, gcl_score_100: 88.8, available: true, axes: [] },
      sales_architecture: {
        archetype: 'lead_generation_service',
        checkout_applicability: 'not_applicable',
        readiness_100: 70,
        sampled_current_pages: 8,
        lead_cta_pages: 6,
        forms_observed: 2,
        offer_component_diversity: 3,
        proof_mentions: 4,
      },
      issues: [],
      pages: [],
      dimensions: [],
      metrics: [],
      awards: [],
      rank_history: [],
      evidence_dashboard: {},
      ai_analyst: ai,
    };
    const result = action === 'status'
      ? { status: 'completed' }
      : action === 'report'
        ? report
        : { ranking: [], awards_catalog: [], offers: {}, stats: {}, market: { listings: [] } };

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result }) });
  });

  await page.goto(`${BASE}/?scan=${TOKEN}`, { waitUntil: 'domcontentloaded' });
}

test('AI Analyst renders only as diagnostic evidence and never changes the visible GCL score', async ({ page }) => {
  await fixture(page);

  const card = page.getByRole('region', { name: 'GCL AI Analyst' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('DIAGNÓSTICO · EVIDÊNCIAS PÚBLICAS');
  await expect(card).toContainText('NÃO ALTERA O GCL SCORE');
  await expect(card).toContainText('Somente evidências públicas observadas foram usadas.');
  await expect(card).toContainText('GCL-AI-2.0');
  await expect(page.locator('.s3-report-score')).toContainText('≈ 89');
  await expect(page.locator('.s3-rankbox')).toContainText('Sem posição');
});

test('AI-generated text is escaped before entering the DOM', async ({ page }) => {
  const hostile = structuredClone(safeAi);
  hostile.analysis.executive_summary = '<img src=x onerror="window.__gclAiXss=1"> não deve virar HTML';
  hostile.analysis.strengths[0].title = '<script>window.__gclAiXss=2</script>';

  await fixture(page, hostile);

  const card = page.getByRole('region', { name: 'GCL AI Analyst' });
  await expect(card).toContainText('<img src=x onerror="window.__gclAiXss=1"> não deve virar HTML');
  await expect(card.locator('img')).toHaveCount(0);
  await expect(card.locator('script')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__gclAiXss ?? 0)).toBe(0);
});

test('AI Analyst stays absent when the backend marks it unavailable', async ({ page }) => {
  await fixture(page, { available: false, diagnostic_only: true, public_evidence_only: true, score_effect: 'none' });
  await expect(page.locator('#gcl-ai-analyst')).toHaveCount(0);
});
