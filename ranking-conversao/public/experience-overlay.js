const SAC_EXPERIENCE_ENDPOINT = 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-public-experience';
const SAC_PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZ2hldXpwbmt3dHhvcHN3cHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDk5NDYsImV4cCI6MjEwMzkyNTk0Nn0.MpohChGR95Ymi6sbMED_sWBot9jNLm_kW-Rz_PJ6mMA';

const LABELS = {
  experience: 'Experience & Craft',
  developer: 'Developer Excellence',
  sac_extension: 'Conversion Readiness',
  composite: 'Índices compostos',
};

let mountedToken = null;
let loadingToken = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function injectStyles() {
  if (document.getElementById('sac-experience-style')) return;
  const style = document.createElement('style');
  style.id = 'sac-experience-style';
  style.textContent = `
    #sac-experience-layer{margin-top:2rem;display:grid;gap:1rem}
    .sac-x-panel{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:32px;background:linear-gradient(145deg,rgba(255,255,255,.032),rgba(3,14,10,.64));padding:24px}
    .sac-x-panel:before{content:'';position:absolute;width:260px;height:260px;border-radius:999px;background:rgba(52,211,153,.055);filter:blur(60px);top:-160px;right:-80px;pointer-events:none}
    .sac-x-kicker{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(167,243,208,.58)}
    .sac-x-title{margin-top:8px;font-size:clamp(24px,3vw,34px);font-weight:650;letter-spacing:-.045em;color:rgba(255,255,255,.92)}
    .sac-x-copy{margin-top:8px;max-width:820px;font-size:13px;line-height:1.65;color:rgba(255,255,255,.4)}
    .sac-x-grid{margin-top:20px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .sac-x-card{position:relative;min-height:145px;border:1px solid rgba(255,255,255,.075);border-radius:22px;padding:16px;background:rgba(0,0,0,.14)}
    .sac-x-card-ready{border-color:rgba(110,231,183,.18);background:rgba(52,211,153,.035)}
    .sac-x-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .sac-x-label{font-size:12px;font-weight:620;color:rgba(255,255,255,.72)}
    .sac-x-status{font-size:9px;text-transform:uppercase;letter-spacing:.14em;color:rgba(255,255,255,.27)}
    .sac-x-scoreline{margin-top:18px;display:flex;align-items:flex-end;gap:5px}
    .sac-x-score{font-size:36px;line-height:.9;font-weight:670;letter-spacing:-.065em;color:#fff}
    .sac-x-denom{padding-bottom:2px;font-size:12px;color:rgba(255,255,255,.25)}
    .sac-x-progress{height:5px;margin-top:18px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.055)}
    .sac-x-progress>span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#34d399,#bef264)}
    .sac-x-foot{margin-top:8px;display:flex;justify-content:space-between;gap:10px;font-size:10px;color:rgba(255,255,255,.27)}
    .sac-x-groups{margin-top:18px;display:grid;gap:18px}
    .sac-x-group-title{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:rgba(255,255,255,.3)}
    .sac-x-composites{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}
    .sac-x-composite{border:1px solid rgba(255,255,255,.075);border-radius:20px;padding:15px;background:rgba(0,0,0,.12)}
    .sac-x-composite strong{display:block;margin-top:6px;font-size:24px;letter-spacing:-.04em;color:rgba(255,255,255,.82)}
    .sac-x-composite small{font-size:10px;line-height:1.45;color:rgba(255,255,255,.28)}
    .sac-x-highlights{margin-top:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .sac-x-highlight{border:1px solid rgba(255,255,255,.07);border-radius:20px;padding:16px;background:rgba(255,255,255,.018)}
    .sac-x-highlight-type{font-size:9px;text-transform:uppercase;letter-spacing:.16em;color:rgba(167,243,208,.48)}
    .sac-x-highlight h4{margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.74)}
    .sac-x-highlight p{margin:7px 0 0;font-size:11px;line-height:1.55;color:rgba(255,255,255,.34)}
    .sac-x-meta{margin-top:8px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.2)}
    .sac-x-awards{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .sac-x-award{border:1px solid rgba(255,255,255,.075);border-radius:20px;padding:15px;text-align:center;background:radial-gradient(circle at 50% 0,rgba(190,242,100,.07),transparent 62%),rgba(0,0,0,.12)}
    .sac-x-award-mark{width:42px;height:42px;margin:0 auto;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:rgba(190,242,100,.78);font-size:17px}
    .sac-x-award h4{margin:10px 0 0;font-size:12px;color:rgba(255,255,255,.7)}
    .sac-x-award p{margin:6px 0 0;font-size:10px;line-height:1.45;color:rgba(255,255,255,.28)}
    .sac-x-community{margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid rgba(255,255,255,.06);padding-top:16px}
    .sac-x-community-copy{font-size:11px;line-height:1.55;color:rgba(255,255,255,.32)}
    .sac-x-community-score{font-size:22px;font-weight:650;color:rgba(255,255,255,.72)}
    .sac-x-disclosure{margin-top:16px;border:1px solid rgba(251,191,36,.1);border-radius:16px;padding:12px 14px;background:rgba(251,191,36,.025);font-size:10px;line-height:1.55;color:rgba(254,243,199,.4)}
    @media(min-width:768px){.sac-x-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.sac-x-highlights{grid-template-columns:repeat(4,minmax(0,1fr))}}
    @media(max-width:680px){.sac-x-composites,.sac-x-awards{grid-template-columns:1fr}.sac-x-community{align-items:flex-start;flex-direction:column}}
  `;
  document.head.appendChild(style);
}

function scoreCard(item) {
  const ready = item.status === 'ready' && item.score_10 != null;
  const card = el('div', `sac-x-card${ready ? ' sac-x-card-ready' : ''}`);
  const head = el('div', 'sac-x-card-head');
  head.append(el('div', 'sac-x-label', item.label));
  head.append(el('div', 'sac-x-status', ready ? 'validado' : 'coletando evidência'));
  card.append(head);
  const line = el('div', 'sac-x-scoreline');
  line.append(el('div', 'sac-x-score', ready ? Number(item.score_10).toFixed(2).replace('.', ',') : '—'));
  if (ready) line.append(el('div', 'sac-x-denom', '/10'));
  card.append(line);
  const progress = el('div', 'sac-x-progress');
  const fill = el('span');
  fill.style.width = `${Math.max(0, Math.min(100, Number(item.coverage || 0) * 100))}%`;
  progress.append(fill); card.append(progress);
  const foot = el('div', 'sac-x-foot');
  foot.append(el('span', '', `${Math.round(Number(item.coverage || 0) * 100)}% cobertura`));
  foot.append(el('span', '', `${item.observed_checks || 0}/${item.eligible_checks || 0} sinais`));
  card.append(foot);
  return card;
}

function highlightSummary(h) {
  const ev = h.evidence || {};
  if (h.type === 'hero') return [ev.h1 || ev.title || 'Hero detectado', ev.description || 'Título, H1 e descrição capturados da página atual.'];
  if (h.type === 'mobile') {
    const m = ev.mobile || {};
    return [`${m.viewport_width || '—'}px · overflow ${m.horizontal_overflow_px ?? '—'}px`, `${m.interactive_count || 0} elementos interativos · ${m.form_controls_missing_label || 0} controles sem label detectável.`];
  }
  if (h.type === 'typography') {
    const d = ev.desktop_css || {};
    return [`H1 ${d.h1_font_px || '—'}px · corpo ${d.body_font_px || '—'}px`, `${d.font_family_variants || 0} família(s) tipográfica(s) · ${d.font_size_variants || 0} tamanhos observados.`];
  }
  if (h.type === 'technology') {
    const signals = Array.isArray(ev.signals) ? ev.signals : [];
    return [`${signals.length} sinais técnicos confirmados`, signals.slice(0,4).map(s => s.title).join(' · ') || 'Stack detectado por evidência pública.'];
  }
  return [h.title, 'Highlight materializado a partir da auditoria.'];
}

function renderExperience(data) {
  injectStyles();
  const main = document.querySelector('main');
  if (!main || document.getElementById('sac-experience-layer')) return;
  const scoreAnchor = [...main.querySelectorAll('*')].find(n => n.textContent?.trim() === 'Índice técnico preliminar');
  const scoreCardEl = scoreAnchor?.closest('.score-card');
  const anchor = scoreCardEl?.parentElement;
  if (!anchor) return;

  const root = el('section');
  root.id = 'sac-experience-layer';

  const panel = el('div', 'sac-x-panel');
  panel.append(el('div', 'sac-x-kicker', 'Experience intelligence · 0–10'));
  panel.append(el('h2', 'sac-x-title', 'A experiência vira um scorecard explicável.'));
  panel.append(el('p', 'sac-x-copy', 'Design, usabilidade, criatividade, conteúdo e engenharia aparecem separadamente. A nota só é publicada quando a cobertura mínima de evidências é atingida; criatividade é um proxy automático e nunca substitui avaliação humana nem altera o SAC Conversion Score.'));

  const groups = el('div', 'sac-x-groups');
  const allScores = Array.isArray(data.scorecards) ? data.scorecards : [];
  for (const groupCode of ['experience','developer','sac_extension']) {
    const items = allScores.filter(x => x.group === groupCode);
    if (!items.length) continue;
    const block = el('div');
    block.append(el('div', 'sac-x-group-title', LABELS[groupCode] || groupCode));
    const grid = el('div', 'sac-x-grid');
    items.forEach(item => grid.append(scoreCard(item)));
    block.append(grid); groups.append(block);
  }
  panel.append(groups);

  const composites = allScores.filter(x => x.group === 'composite');
  if (composites.length) {
    const comp = el('div', 'sac-x-composites');
    for (const item of composites) {
      const card = el('div', 'sac-x-composite');
      card.append(el('small', '', item.label));
      card.append(el('strong', '', item.score_10 != null ? `${Number(item.score_10).toFixed(2).replace('.', ',')}/10` : 'Em validação'));
      card.append(el('small', '', `${Math.round(Number(item.coverage || 0)*100)}% de cobertura de evidência`));
      comp.append(card);
    }
    panel.append(comp);
  }

  panel.append(el('div', 'sac-x-disclosure', 'Camada secundária de experiência e engenharia. Não substitui o SAC Score, não representa taxa de conversão e não concede pontos por voto da comunidade. Score oculto quando a cobertura é insuficiente.'));
  root.append(panel);

  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  if (highlights.length) {
    const hp = el('div', 'sac-x-panel');
    hp.append(el('div', 'sac-x-kicker', 'Highlights automáticos'));
    hp.append(el('h3', 'sac-x-title', 'O que se destacou na página analisada.'));
    hp.append(el('p', 'sac-x-copy', 'Elementos selecionados pela máquina a partir de fonte atual, browser ou evidência atômica. Nada é enviado manualmente pelo participante.'));
    const hg = el('div', 'sac-x-highlights');
    highlights.slice(0,8).forEach(h => {
      const [title, copy] = highlightSummary(h);
      const card = el('article', 'sac-x-highlight');
      card.append(el('div', 'sac-x-highlight-type', h.type));
      card.append(el('h4', '', title));
      card.append(el('p', '', copy));
      card.append(el('div', 'sac-x-meta', `${Math.round(Number(h.confidence || 0)*100)}% confiança · ${h.source_kind}`));
      hg.append(card);
    });
    hp.append(hg); root.append(hp);
  }

  const awards = Array.isArray(data.award_candidates) ? data.award_candidates : [];
  if (awards.length) {
    const ap = el('div', 'sac-x-panel');
    ap.append(el('div', 'sac-x-kicker', 'Awards & reconhecimento'));
    ap.append(el('h3', 'sac-x-title', 'Prêmios são conquistados, não comprados.'));
    ap.append(el('p', 'sac-x-copy', 'A plataforma acompanha automaticamente os thresholds. Uma qualificação só vira badge verificável quando score, cobertura, membership e demais gates estiverem válidos.'));
    const ag = el('div', 'sac-x-awards');
    awards.forEach(a => {
      const card = el('div', 'sac-x-award');
      card.append(el('div', 'sac-x-award-mark', a.qualification_met ? '✓' : '◇'));
      card.append(el('h4', '', a.label));
      card.append(el('p', '', a.qualification_met ? 'Threshold técnico atingido; demais gates ainda são verificados antes da emissão.' : `Meta: ${a.threshold ?? 'ranking'} · cobertura mínima ${Math.round(Number(a.minimum_coverage || 0)*100)}%`));
      ag.append(card);
    });
    ap.append(ag);
    const community = data.community || {};
    const cg = el('div', 'sac-x-community');
    cg.append(el('div', 'sac-x-community-copy', community.ratings_count > 0 ? `${community.ratings_count} avaliações da comunidade. Community Choice é exibido separadamente e tem peso oficial zero.` : 'Community Choice ainda sem votos. Quando houver comunidade ativa, Design, Usability, Creativity e Content poderão receber opinião humana sem alterar o ranking técnico.'));
    cg.append(el('div', 'sac-x-community-score', community.overall != null ? `${Number(community.overall).toFixed(2).replace('.', ',')}/10` : '0 votos'));
    ap.append(cg); root.append(ap);
  }

  anchor.insertAdjacentElement('afterend', root);
}

async function fetchExperience(token) {
  const response = await fetch(SAC_EXPERIENCE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SAC_PUBLIC_KEY,
      Authorization: `Bearer ${SAC_PUBLIC_KEY}`,
    },
    body: JSON.stringify({token}),
  });
  if (!response.ok) throw new Error(`experience_${response.status}`);
  return response.json();
}

async function tryMount() {
  const token = localStorage.getItem('sac_preview_token') || '';
  if (!token || !document.body.textContent?.includes('Prévia concluída')) return;
  if (document.getElementById('sac-experience-layer')) { mountedToken = token; return; }
  if (loadingToken === token) return;
  loadingToken = token;
  try {
    const data = await fetchExperience(token);
    if (data?.found) {
      renderExperience(data);
      mountedToken = token;
    }
  } catch (_) {
    // Secondary experience layer must never break the primary scan/result flow.
  } finally {
    loadingToken = null;
  }
}

const observer = new MutationObserver(() => {
  const token = localStorage.getItem('sac_preview_token') || '';
  if (mountedToken && mountedToken !== token) {
    document.getElementById('sac-experience-layer')?.remove();
    mountedToken = null;
  }
  queueMicrotask(tryMount);
});
observer.observe(document.documentElement, {childList:true,subtree:true});
window.addEventListener('storage', tryMount);
window.addEventListener('focus', tryMount);
setTimeout(tryMount, 500);
