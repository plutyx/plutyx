const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const ratio = value => finite(value) ? Math.max(0, Math.min(1, Number(value))) : null;

export function diagnosticContext(report = {}) {
  const rank = report.ranking || report;
  const truth = report.diagnostic_truth || {};
  const dist = report.score_distribution || {};
  const summary = report.status_summary;
  const official = rank.score_status === 'official' && rank.ranking_scope === 'official_competition' && rank.official_competition_eligible === true;
  const visibility = official ? 'official' : (truth.score_visibility || rank.score_visibility || dist.score_visibility || rank.score_status) === 'forming' ? 'forming' : 'provisional';
  const forming = visibility === 'forming';
  const provisional = visibility === 'provisional';
  const observed = truth.atomic_observed ?? (summary ? ['pass', 'warning', 'fail'].reduce((n, key) => n + Number(summary[key] || 0), 0) : null);
  const total = truth.atomic_total ?? (summary ? ['pass', 'warning', 'fail', 'not_applicable', 'not_verifiable', 'needs_connection'].reduce((n, key) => n + Number(summary[key] || 0), 0) : null);
  const coverage = ratio(truth.atomic_verification_coverage ?? rank.atomic_verification_coverage ?? dist.atomic_verification_coverage ?? (total > 0 ? observed / total : null));
  return {
    official, provisional, forming, visibility,
    label: official ? 'Score oficial' : forming ? 'Score em formação' : 'Diagnóstico provisório',
    coverage, observed, total,
    collectorCoverage: ratio(truth.collector_metric_coverage ?? rank.collector_metric_coverage ?? dist.collector_metric_coverage ?? rank.metric_coverage),
    position: official && finite(rank.overall_rank) && Number(rank.overall_rank) > 0 ? Number(rank.overall_rank) : null,
    preliminaryAxes: Number(truth.preliminary_axes ?? rank.preliminary_axes ?? dist.preliminary_axes ?? 0),
    publicAxesObserved: Number(truth.public_axes_observed ?? rank.public_axes_observed ?? dist.public_axes_observed ?? dist.measured_axes ?? 0),
    minimumPublicAxes: Number(truth.minimum_public_axes ?? rank.minimum_public_axes ?? dist.minimum_public_axes ?? 5),
  };
}

export function diagnosticScore(value, preliminary = true) {
  if (!finite(value)) return '—';
  return `${preliminary ? '≈ ' : ''}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: preliminary ? 0 : 1 }).format(Number(value))}`;
}

export function diagnosticPercent(value) {
  return finite(value) ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(value) * 100)}%` : '—';
}
