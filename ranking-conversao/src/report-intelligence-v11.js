const GCL_REPORT_API='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';

const gclEsc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gclNum=(v,d=1)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:d}).format(Number(v||0));
const gclPct=v=>`${gclNum(Math.max(0,Math.min(1,Number(v||0)))*100,0)}%`;

async function gclReport(token){
  const r=await fetch(GCL_REPORT_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'report',token})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d.result||null;
}

function gclIssueAgg(issues=[]){
  const map=new Map();
  for(const x of issues){
    if(!['fail','warning'].includes(x?.status))continue;
    const key=x.criterion_code||x.explanation||x.id;
    if(!map.has(key))map.set(key,{key,label:x.explanation||x.criterion_code||'Oportunidade',code:x.criterion_code||'',status:x.status,points:Number(x.points_available||0),recommendation:x.recommendation||'',confidence:[],pages:new Set()});
    const a=map.get(key);
    if(x.status==='fail')a.status='fail';
    a.points=Math.max(a.points,Number(x.points_available||0));
    if(x.page_id)a.pages.add(x.page_id);
    if(Number.isFinite(Number(x.confidence)))a.confidence.push(Number(x.confidence));
    if(!a.recommendation&&x.recommendation)a.recommendation=x.recommendation;
  }
  return [...map.values()].map(a=>({...a,pageCount:a.pages.size,confidence:a.confidence.length?a.confidence.reduce((s,n)=>s+n,0)/a.confidence.length:null}))
    .sort((a,b)=>(a.status==='fail'?0:1)-(b.status==='fail'?0:1)||b.points-a.points||b.pageCount-a.pageCount);
}

function gclPageStats(pages=[],issues=[]){
  const by=new Map();
  for(const i of issues){if(!i.page_id)continue;const v=by.get(i.page_id)||{fail:0,warning:0};if(i.status==='fail')v.fail++;if(i.status==='warning')v.warning++;by.set(i.page_id,v)}
  return pages.map(p=>{const c=by.get(p.id)||{fail:0,warning:0};return {...p,...c}})
    .sort((a,b)=>b.fail-a.fail||b.warning-a.warning||String(a.normalized_url||'').localeCompare(String(b.normalized_url||'')));
}

function gclTrendSvg(history=[],current){
  const rows=[...(history||[])].filter(x=>Number.isFinite(Number(x.score_100))).slice(-9);
  if(Number.isFinite(Number(current?.score_100))){const last=rows.at(-1);if(!last||Number(last.score_100)!==Number(current.score_100))rows.push({score_100:Number(current.score_100),recorded_at:current.calculated_at})}
  if(rows.length<2)return '<div class="gcl-v11-emptyline">Histórico será exibido após novas auditorias.</div>';
  const vals=rows.map(x=>Number(x.score_100));const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(8,max-min);const w=520,h=120,pad=12;
  const pts=vals.map((v,i)=>{const x=pad+(i*(w-pad*2)/Math.max(1,vals.length-1));const y=h-pad-((v-(min-span*.18))/(span*1.36))*(h-pad*2);return [x,Math.max(pad,Math.min(h-pad,y))]});
  const poly=pts.map(p=>p.join(',')).join(' ');const delta=vals.at(-1)-vals[0];
  return `<div class="gcl-v11-trend"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Histórico do score"><defs><linearGradient id="gclV11Line" x1="0" x2="1"><stop offset="0" stop-color="#78f5ad"/><stop offset="1" stop-color="#f5d67c"/></linearGradient></defs><polyline points="${poly}" fill="none" stroke="url(#gclV11Line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#0a0d0b" stroke="#9cf8c3" stroke-width="2"/>`).join('')}</svg><div><span>${rows.length} medições</span><strong>${delta>0?'+':''}${gclNum(delta,1)} pts</strong></div></div>`;
}

function gclImpactLabel(points){if(points>=12)return 'Alto impacto no score';if(points>=6)return 'Impacto relevante';return 'Impacto localizado'}
function gclStatusLabel(s){return s==='fail'?'Crítico':'Atenção'}

function gclExecutiveSection(d,token){
  const rank=d?.ranking||{};const audit=d?.audit||{};const issues=d?.issues||[];const pages=d?.pages||[];const agg=gclIssueAgg(issues);const pageStats=gclPageStats(pages,issues);const cov=Number(rank.metric_coverage||0);const conf=Number(rank.evidence_confidence||0);const score=Number.isFinite(Number(rank.score_100))?Number(rank.score_100):null;const evidence=d?.evidence_dashboard?.metric_coverage?.by_evidence_class||{};const fail=issues.filter(x=>x.status==='fail').length;const warning=issues.filter(x=>x.status==='warning').length;const observed=Number(rank.observed_metrics||d?.evidence_dashboard?.metric_coverage?.observed_distinct||0);const active=Number(rank.active_metrics||d?.evidence_dashboard?.metric_capabilities?.active_public_metrics||0);
  const s=document.createElement('section');s.id='gcl-report-intelligence-v11';s.className='gcl-v11';
  const rankText=rank.overall_rank?`#${rank.overall_rank}`:(rank.eligibility_status==='eligible'?'Elegível':'Em evolução');
  const delta=rank.previous_rank&&rank.overall_rank?rank.previous_rank-rank.overall_rank:null;
  s.innerHTML=`
    <header class="gcl-v11-head"><div><span>GCL EXECUTIVE OVERVIEW</span><h2>${gclEsc(d?.domain?.normalized_domain||'Seu site')}</h2><p>Uma leitura executiva do diagnóstico atual, com prioridades, páginas afetadas e evolução do score.</p></div><div class="gcl-v11-score"><small>GCL SCORE</small><strong>${score!=null?gclNum(score,1):'—'}</strong><em>/100</em></div></header>
    <div class="gcl-v11-kpis">
      <article><span>Posição</span><strong>${gclEsc(rankText)}</strong><small>${delta?`${delta>0?'↑':'↓'} ${Math.abs(delta)} desde a medição anterior`:rank.category_rank?`#${rank.category_rank} na categoria`:'Founding Season 2026'}</small></article>
      <article><span>Cobertura</span><strong>${gclPct(cov)}</strong><div class="gcl-v11-bar"><i style="width:${Math.min(100,cov*100)}%"></i></div><small>${observed} de ${active||'—'} métricas observadas</small></article>
      <article><span>Confiança</span><strong>${gclPct(conf)}</strong><div class="gcl-v11-bar cyan"><i style="width:${Math.min(100,conf*100)}%"></i></div><small>consistência da evidência atual</small></article>
      <article><span>Páginas</span><strong>${audit.pages_analyzed??pages.length}</strong><small>${audit.pages_discovered??pages.length} descobertas</small></article>
      <article class="risk"><span>Prioridades</span><strong>${fail+warning}</strong><small>${fail} críticas · ${warning} em atenção</small></article>
    </div>
    <div class="gcl-v11-main">
      <article class="gcl-v11-panel trend"><div class="gcl-v11-panel-title"><div><span>EVOLUÇÃO</span><h3>Histórico do score</h3></div><a href="/ranking-site/account/">Acompanhar site →</a></div>${gclTrendSvg(d?.rank_history,rank)}</article>
      <article class="gcl-v11-panel evidence"><div class="gcl-v11-panel-title"><div><span>COBERTURA</span><h3>Fontes analisadas</h3></div></div><div class="gcl-v11-evidence">${Object.entries(evidence).map(([k,v])=>{const reg=Number(v?.registered||0),obs=Number(v?.observed||0),p=reg?obs/reg:0;const label={lab:'Laboratório',url_http:'URL & HTTP',browser_render:'Browser',public_dataset:'Dados públicos'}[k]||k;return `<div><span>${gclEsc(label)} <b>${obs}/${reg}</b></span><div><i style="width:${Math.round(p*100)}%"></i></div></div>`}).join('')||'<p>Fontes adicionais aparecem conforme a auditoria avança.</p>'}</div></article>
    </div>
    <div class="gcl-v11-grid">
      <article class="gcl-v11-panel opportunities"><div class="gcl-v11-panel-title"><div><span>TOP OPPORTUNITIES</span><h3>O que merece atenção primeiro</h3></div><a href="#issues">Ver detalhes →</a></div><div class="gcl-v11-opps">${agg.slice(0,6).map((x,i)=>`<div><b>${String(i+1).padStart(2,'0')}</b><span><strong>${gclEsc(x.label)}</strong><small>${gclEsc(gclImpactLabel(x.points))}${x.pageCount?` · ${x.pageCount} página${x.pageCount>1?'s':''}`:''}${x.confidence!=null?` · ${gclPct(x.confidence)} confiança`:''}</small></span><em class="${x.status}">${gclStatusLabel(x.status)}</em></div>`).join('')||'<div class="gcl-v11-empty">Nenhuma prioridade crítica foi materializada nesta visão.</div>'}</div></article>
      <article class="gcl-v11-panel pages"><div class="gcl-v11-panel-title"><div><span>PAGE HEALTH</span><h3>Páginas analisadas</h3></div><span>${pages.length} páginas</span></div><div class="gcl-v11-pages">${pageStats.slice(0,8).map(p=>`<a href="${gclEsc(p.normalized_url||p.canonical_url||'#')}" target="_blank" rel="noreferrer"><span><strong>${gclEsc(p.title||p.h1||p.normalized_url||'Página')}</strong><small>${gclEsc(p.page_type||'page')} · HTTP ${p.http_status??'—'}${p.rendered?' · renderizada':''}</small></span><em class="${p.fail?'fail':p.warning?'warning':'ok'}">${p.fail?`${p.fail} crítico${p.fail>1?'s':''}`:p.warning?`${p.warning} atenção`:'OK'}</em></a>`).join('')||'<div class="gcl-v11-empty">As páginas rastreadas aparecerão aqui.</div>'}</div></article>
    </div>
    <footer class="gcl-v11-actions"><div><span>PRÓXIMA ETAPA</span><strong>${agg.length?'Transforme as prioridades em um plano de execução.':'Mantenha o site monitorado e compare as próximas auditorias.'}</strong></div><div><a href="/ranking-site/community/">Abrir Community</a><a class="hot" href="/ranking-site/services/?scan=${encodeURIComponent(token)}">Ver plano de melhorias →</a></div></footer>`;
  return s;
}

async function gclMountExecutive(token){
  let host=null;
  for(let i=0;i<120;i++){
    host=document.querySelector('.s3-report-kpis')||document.querySelector('.s3-report-head')||document.querySelector('#gcl-revenue-architecture');
    if(host)break;
    await new Promise(r=>setTimeout(r,100));
  }
  if(!host||document.getElementById('gcl-report-intelligence-v11'))return;
  try{const d=await gclReport(token);if(!d?.found)return;const s=gclExecutiveSection(d,token);host.after(s)}catch(e){console.warn('gcl-report-intelligence-v11',e.message)}
}

function gclCleanRecoveryCopy(){
  const root=document.getElementById('gcl-score-recovery');if(!root)return;
  const head=root.querySelector('.gcl-recovery-head p');if(head)head.textContent='Prioridades relacionadas aos pontos de melhoria identificados nesta auditoria, ordenadas pelo potencial técnico de evolução do score.';
  const scoreLabel=root.querySelector('.gcl-recovery-score small');if(scoreLabel)scoreLabel.textContent='maior potencial individual';
  const foot=root.querySelector('.gcl-recovery-foot>div:first-child');if(foot)foot.innerHTML='<b>Compare depois de implementar</b><span>Faça uma nova auditoria para medir a evolução do site e atualizar sua posição.</span>';
  root.querySelectorAll('.gcl-recovery-top strong').forEach(e=>e.textContent=e.textContent.replace('até +','potencial +'));
}

const gclV11Style=document.createElement('style');gclV11Style.textContent=`
.gcl-v11{max-width:1280px;margin:24px auto;padding:28px;border:1px solid rgba(140,255,190,.14);border-radius:28px;background:radial-gradient(circle at 5% 0,rgba(74,255,157,.085),transparent 30%),radial-gradient(circle at 95% 8%,rgba(255,213,116,.06),transparent 28%),#080b09;box-shadow:0 30px 100px rgba(0,0,0,.22)}
.gcl-v11-head{display:flex;justify-content:space-between;gap:28px;align-items:flex-start}.gcl-v11-head>div:first-child>span,.gcl-v11-panel-title span,.gcl-v11-actions>div:first-child span{font-size:9px;letter-spacing:.2em;color:#79efaa}.gcl-v11-head h2{font-size:clamp(34px,5vw,64px);line-height:.95;margin:8px 0}.gcl-v11-head p{max-width:700px;color:#929c96;font-size:13px;line-height:1.6;margin:0}.gcl-v11-score{text-align:right;min-width:170px}.gcl-v11-score small{display:block;font-size:9px;letter-spacing:.17em;color:#77817b}.gcl-v11-score strong{font-size:64px;line-height:1;color:#f3f6f4}.gcl-v11-score em{font-style:normal;color:#606a64;font-size:14px}.gcl-v11-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:rgba(255,255,255,.07);margin-top:28px;border:1px solid rgba(255,255,255,.07)}.gcl-v11-kpis article{background:#090c0a;padding:16px;min-height:120px}.gcl-v11-kpis span{font-size:9px;letter-spacing:.12em;color:#77817b;text-transform:uppercase}.gcl-v11-kpis strong{display:block;font-size:25px;margin:12px 0 7px}.gcl-v11-kpis small{font-size:10px;color:#747e78;line-height:1.4}.gcl-v11-kpis article.risk strong{color:#f3cc76}.gcl-v11-bar{height:3px;background:rgba(255,255,255,.06);margin:4px 0 8px}.gcl-v11-bar i{display:block;height:100%;background:#78f5ad}.gcl-v11-bar.cyan i{background:#7fdde8}.gcl-v11-main,.gcl-v11-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.gcl-v11-panel{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.018);padding:18px;min-height:230px}.gcl-v11-panel-title{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.gcl-v11-panel-title h3{font-size:18px;margin:5px 0 0}.gcl-v11-panel-title a{font-size:10px;color:#9ab1a3;text-decoration:none}.gcl-v11-trend svg{width:100%;height:128px;margin-top:16px}.gcl-v11-trend>div{display:flex;justify-content:space-between;color:#758078;font-size:10px}.gcl-v11-trend strong{color:#aef3c8}.gcl-v11-emptyline{padding:46px 0;color:#68736c;font-size:11px}.gcl-v11-evidence{display:grid;gap:13px;margin-top:24px}.gcl-v11-evidence>div>span{display:flex;justify-content:space-between;font-size:10px;color:#89948d}.gcl-v11-evidence>div>span b{color:#c9d2cd}.gcl-v11-evidence>div>div{height:5px;background:rgba(255,255,255,.055);margin-top:6px}.gcl-v11-evidence i{display:block;height:100%;background:linear-gradient(90deg,#70f0a5,#d9eb7c)}.gcl-v11-opps,.gcl-v11-pages{display:grid;gap:1px;background:rgba(255,255,255,.055);margin-top:16px}.gcl-v11-opps>div{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;background:#090c0a;padding:12px}.gcl-v11-opps>div>b{font-size:10px;color:#5f6963}.gcl-v11-opps span{display:grid;gap:3px}.gcl-v11-opps strong{font-size:11px;color:#d7ded9}.gcl-v11-opps small{font-size:9px;color:#6f7a73}.gcl-v11-opps em,.gcl-v11-pages em{font-style:normal;font-size:9px;padding:5px 7px;border-radius:999px}.gcl-v11-opps em.fail,.gcl-v11-pages em.fail{background:rgba(255,97,97,.09);color:#ffaaaa}.gcl-v11-opps em.warning,.gcl-v11-pages em.warning{background:rgba(255,200,95,.09);color:#ffd58e}.gcl-v11-pages>a{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;background:#090c0a;padding:11px 12px;text-decoration:none}.gcl-v11-pages>a span{display:grid;gap:3px;min-width:0}.gcl-v11-pages strong{font-size:11px;color:#d4dcd6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gcl-v11-pages small{font-size:9px;color:#707a74;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gcl-v11-pages em.ok{background:rgba(89,240,155,.08);color:#8ff2ba}.gcl-v11-empty{padding:22px;background:#090c0a;color:#6f7973;font-size:10px}.gcl-v11-actions{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:14px;padding:16px 18px;border:1px solid rgba(255,255,255,.065);background:linear-gradient(90deg,rgba(113,244,167,.035),rgba(255,216,126,.025))}.gcl-v11-actions>div:first-child{display:grid;gap:5px}.gcl-v11-actions strong{font-size:13px}.gcl-v11-actions>div:last-child{display:flex;gap:8px}.gcl-v11-actions a{padding:10px 13px;border:1px solid rgba(255,255,255,.1);color:#d0d8d3;text-decoration:none;font-size:10px}.gcl-v11-actions a.hot{background:#84f0ad;color:#071009;border-color:#84f0ad;font-weight:800}@media(max-width:980px){.gcl-v11{margin-inline:12px;padding:20px}.gcl-v11-kpis{grid-template-columns:repeat(2,1fr)}.gcl-v11-kpis article:last-child{grid-column:1/-1}.gcl-v11-main,.gcl-v11-grid{grid-template-columns:1fr}.gcl-v11-head{flex-direction:column}.gcl-v11-score{text-align:left}}@media(max-width:620px){.gcl-v11-kpis{grid-template-columns:1fr}.gcl-v11-kpis article:last-child{grid-column:auto}.gcl-v11-actions{align-items:flex-start;flex-direction:column}.gcl-v11-actions>div:last-child{width:100%;flex-direction:column}.gcl-v11-score strong{font-size:52px}}
`;document.head.appendChild(gclV11Style);

const gclToken=new URLSearchParams(location.search).get('scan');
if(gclToken&&!location.pathname.match(/\/ranking-site\/(services|market)\/?$/))gclMountExecutive(gclToken);
const gclRecoveryObs=new MutationObserver(()=>gclCleanRecoveryCopy());gclRecoveryObs.observe(document.documentElement,{childList:true,subtree:true});gclCleanRecoveryCopy();
