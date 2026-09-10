const GCL_METRIC_API='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';
const gclMetricEsc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gclMetricNum=(v,d=0)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:d}).format(Number(v||0));
const gclMetricPct=(v,d=0)=>`${gclMetricNum(Math.max(0,Math.min(1,Number(v||0)))*100,d)}%`;
const GCL_ENGINE_LABELS={
  lighthouse_atomic:'Lighthouse Atomic',performance:'Performance',accessibility:'Accessibility',security:'Security & Trust',seo:'SEO',ai_search:'AI Search',crawl_indexability:'Crawl & Indexability',sales_architecture:'Sales Architecture',visual_design:'Visual Design',domain_platform_health:'Domain & Platform',frontend_network:'Frontend & Network',ux:'UX',conversion_architecture:'Conversion Architecture',structured_data:'Structured Data',mobile:'Mobile',privacy:'Privacy',seo_onpage:'SEO On-page',best_practices:'Best Practices',content:'Content',ecommerce_checkout:'E-commerce & Checkout',forms:'Forms',traffic_intelligence:'Traffic Intelligence',funnel_economics:'Funnel Economics',behavior_analytics:'Behavior Analytics',rum_experience:'Real User Experience',experimentation:'Experimentation',ai_visibility:'AI Visibility',search_visibility:'Search Visibility',offsite_authority:'Off-site Authority'
};
const GCL_ENGINE_HINTS={
  lighthouse_atomic:'auditorias atômicas de laboratório',performance:'velocidade, Core Web Vitals e custo de carregamento',accessibility:'axe, DOM, navegação e critérios automatizáveis',security:'headers, TLS, exposição e sinais de confiança',seo:'descoberta, conteúdo e sinais técnicos',ai_search:'acesso e legibilidade para mecanismos de IA',crawl_indexability:'robots, links, canonicals e rastreabilidade',sales_architecture:'CTA, oferta, prova, preço e arquitetura comercial',visual_design:'hierarquia, consistência, geometria e legibilidade',domain_platform_health:'DNS, domínio e disponibilidade da plataforma',frontend_network:'recursos, requests e comportamento de rede',ux:'fricção e experiência observável',conversion_architecture:'estrutura técnica do caminho de conversão',structured_data:'JSON-LD e dados estruturados',mobile:'viewport e comportamento responsivo',privacy:'sinais técnicos de privacidade',traffic_intelligence:'exige fonte competitiva/first-party',funnel_economics:'exige receita, funil ou CRM',behavior_analytics:'exige analytics/session data',rum_experience:'exige RUM ou dados de campo',experimentation:'exige plataforma de testes',ai_visibility:'exige provedor de visibilidade',search_visibility:'exige Search Console/provedor',offsite_authority:'exige provedor de backlinks'
};
async function gclMetricReport(token){
  const r=await fetch(GCL_METRIC_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'report',token})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d.result||null;
}
function gclMetricKpi(label,value,note,tone=''){
  return `<article class="gcl-ma-kpi ${tone}"><span>${gclMetricEsc(label)}</span><strong>${gclMetricEsc(value)}</strong><small>${gclMetricEsc(note||'')}</small></article>`;
}
function gclMetricEngineRow(x){
  const auto=Number(x.autonomous_implemented||0),obs=Number(x.distinct_metrics||0),conn=Number(x.connection_required||0),validated=Number(x.validated||0),scoreInputs=Number(x.score_inputs||0);
  const ratio=auto?Math.min(1,obs/auto):0;
  const label=GCL_ENGINE_LABELS[x.engine]||String(x.engine||'Engine').replaceAll('_',' ');
  const hint=GCL_ENGINE_HINTS[x.engine]||'família de sinais da metodologia GCL';
  return `<div class="gcl-ma-engine" data-zero="${obs===0?'1':'0'}">
    <div class="gcl-ma-engine-name"><strong>${gclMetricEsc(label)}</strong><small>${gclMetricEsc(hint)}</small></div>
    <div class="gcl-ma-engine-meter"><div><i style="width:${Math.round(ratio*100)}%"></i></div><small>${obs} observados · ${auto} autônomos${conn?` · +${conn} conectados`:''}</small></div>
    <div class="gcl-ma-engine-meta"><b>${auto?gclMetricPct(ratio):'—'}</b><small>${validated?`${validated} validados`:scoreInputs?`${scoreInputs} score inputs`:(conn?'conexão':'contexto')}</small></div>
  </div>`;
}
function gclMetricArchitectureSection(d){
  const m=d?.metric_architecture;if(!m)return null;
  const observed=m.observed||{},catalog=m.catalog||{},caps=m.capabilities||{};
  const engines=[...(m.engine_coverage||[])];
  const active=engines.filter(x=>Number(x.distinct_metrics||0)>0);
  const pending=engines.filter(x=>Number(x.distinct_metrics||0)===0&&(Number(x.connection_required||0)>0||Number(x.autonomous_implemented||0)>0));
  const validated=Object.entries(catalog.validated_by_engine||{}).sort((a,b)=>Number(b[1])-Number(a[1]));
  const s=document.createElement('section');s.id='gcl-metric-architecture-v22';s.className='gcl-ma';
  s.innerHTML=`
    <header class="gcl-ma-head">
      <div><span>GCL EVIDENCE OS · ${gclMetricEsc(m.methodology_version||'GCL-METRICS')}</span><h2>${gclMetricNum(observed.distinct_metrics)} sinais distintos observados nesta auditoria</h2><p>O número abaixo vem das observações persistidas desta URL — não de um contador de marketing. Métricas ausentes ou não aplicáveis não são convertidas automaticamente em falha.</p></div>
      <div class="gcl-ma-proof ${observed.meets_600_plus_proof?'verified':''}"><small>ANÁLISE REAL</small><strong>${observed.meets_600_plus_proof?'600+':'EM COLETA'}</strong><em>${gclMetricNum(observed.observations)} observações</em></div>
    </header>
    <div class="gcl-ma-kpis">
      ${gclMetricKpi('Métricas observadas',gclMetricNum(observed.distinct_metrics),'distintas neste audit','green')}
      ${gclMetricKpi('Confiança média',gclMetricPct(observed.avg_confidence,1),'das observações persistidas','cyan')}
      ${gclMetricKpi('Autônomas live',gclMetricNum(caps.autonomous_implemented),'coletáveis sem login do cliente')}
      ${gclMetricKpi('Conectadas',gclMetricNum(caps.connection_required),'Analytics, CRM, Ads, RUM e afins')}
      ${gclMetricKpi('Catálogo total',gclMetricNum(catalog.total),`${gclMetricNum(catalog.validated)} validadas · ${gclMetricNum(catalog.experimental)} experimentais`)}
      ${gclMetricKpi('Score inputs',gclMetricNum(caps.autonomous_score_inputs),`${gclMetricNum(caps.autonomous_diagnostics)} diagnósticos não duplicam peso`,'gold')}
    </div>
    <div class="gcl-ma-grid">
      <article class="gcl-ma-panel gcl-ma-atomic">
        <div class="gcl-ma-title"><div><span>ATOMIC LAYER</span><h3>${gclMetricNum(catalog.atomic_pagespeed_lighthouse)} sinais PageSpeed / Lighthouse validados</h3></div><b>${gclMetricNum(catalog.atomic_pagespeed_lighthouse)}</b></div>
        <p>Os sinais atômicos são redistribuídos por engine para evitar que “Lighthouse” vire uma caixa-preta única. A mesma origem técnica pode alimentar Performance, Accessibility, Security, SEO ou diagnósticos gerais.</p>
        <div class="gcl-ma-atomic-grid">${validated.map(([engine,count])=>`<div><span>${gclMetricEsc(GCL_ENGINE_LABELS[engine]||engine.replaceAll('_',' '))}</span><strong>${gclMetricNum(count)}</strong><i style="width:${Math.round(Number(count)/Math.max(1,Number(catalog.atomic_pagespeed_lighthouse))*100)}%"></i></div>`).join('')}</div>
      </article>
      <article class="gcl-ma-panel gcl-ma-policy">
        <div class="gcl-ma-title"><div><span>SCORE GOVERNANCE</span><h3>Mais evidência sem inflar o score</h3></div><b>${gclMetricNum(caps.autonomous_score_inputs)}</b></div>
        <div class="gcl-ma-policy-flow"><div><strong>${gclMetricNum(caps.autonomous_diagnostics)}</strong><span>diagnósticos</span></div><i>→</i><div><strong>${gclMetricNum(caps.autonomous_score_inputs)}</strong><span>score inputs</span></div><i>→</i><div><strong>1</strong><span>GCL Score</span></div></div>
        <p>${gclMetricEsc(m.score_policy||'Somente métricas explicitamente governadas alimentam o score.')}</p>
      </article>
    </div>
    <article class="gcl-ma-panel gcl-ma-engines">
      <div class="gcl-ma-title"><div><span>ENGINE COVERAGE</span><h3>O que realmente foi observado por camada</h3></div><button type="button" class="gcl-ma-toggle">Ver todas as engines</button></div>
      <div class="gcl-ma-engine-list">${active.map(gclMetricEngineRow).join('')}</div>
      ${pending.length?`<details class="gcl-ma-pending"><summary>${pending.length} engines adicionais ainda dependem de evidência ou conexão</summary><div>${pending.map(gclMetricEngineRow).join('')}</div></details>`:''}
    </article>
    <footer class="gcl-ma-foot"><div><span>EVIDENCE POLICY</span><p>${gclMetricEsc(m.evidence_policy||'Classes de evidência permanecem separadas.')}</p></div><div><span>TAXONOMY</span><p>${gclMetricEsc(m.taxonomy_note||'As métricas são classificadas por engine e método de coleta.')}</p></div></footer>`;
  const list=s.querySelector('.gcl-ma-engine-list');const rows=[...list.children];
  if(rows.length>9){rows.slice(9).forEach(r=>r.hidden=true);const btn=s.querySelector('.gcl-ma-toggle');let open=false;btn.onclick=()=>{open=!open;rows.slice(9).forEach(r=>r.hidden=!open);btn.textContent=open?'Mostrar principais':'Ver todas as engines'}}else{s.querySelector('.gcl-ma-toggle')?.remove()}
  return s;
}
async function gclMetricMount(){
  const token=new URLSearchParams(location.search).get('scan');
  if(!token||location.pathname.match(/\/ranking-site\/(services|market)\/?$/))return;
  let anchor=null;
  for(let i=0;i<140;i++){
    anchor=document.getElementById('gcl-report-intelligence-v11')||document.querySelector('.s3-report-kpis')||document.querySelector('.s3-report-head');
    if(anchor)break;
    await new Promise(r=>setTimeout(r,100));
  }
  if(!anchor||document.getElementById('gcl-metric-architecture-v22'))return;
  try{const d=await gclMetricReport(token);if(!d?.found||!d?.metric_architecture)return;const s=gclMetricArchitectureSection(d);if(s)anchor.after(s)}catch(e){console.warn('gcl-metric-architecture-v22',e.message)}
}
const gclMetricStyle=document.createElement('style');gclMetricStyle.id='gcl-metric-architecture-style-v22';gclMetricStyle.textContent=`
.gcl-ma{max-width:1280px;margin:14px auto 28px;padding:28px;border:1px solid rgba(141,255,190,.14);border-radius:28px;background:radial-gradient(circle at 3% 0,rgba(80,255,161,.075),transparent 27%),radial-gradient(circle at 97% 2%,rgba(121,210,255,.055),transparent 28%),#070a08;box-shadow:0 35px 110px rgba(0,0,0,.22);color:#eef4f0}.gcl-ma-head{display:flex;justify-content:space-between;align-items:flex-start;gap:30px}.gcl-ma-head>div:first-child{max-width:850px}.gcl-ma-head span,.gcl-ma-title span,.gcl-ma-foot span{font-size:9px;letter-spacing:.2em;color:#79efaa}.gcl-ma-head h2{font-size:clamp(30px,4vw,50px);line-height:1.02;letter-spacing:-.045em;margin:8px 0 10px}.gcl-ma-head p,.gcl-ma-panel>p,.gcl-ma-foot p{color:#87938c;font-size:11px;line-height:1.65;margin:0}.gcl-ma-proof{min-width:170px;border:1px solid rgba(255,255,255,.08);padding:17px;text-align:right;background:rgba(255,255,255,.018)}.gcl-ma-proof.verified{border-color:rgba(105,245,164,.22);background:rgba(86,237,150,.035);box-shadow:inset 0 0 40px rgba(74,255,144,.025)}.gcl-ma-proof small{display:block;color:#6d7972;font-size:8px;letter-spacing:.18em}.gcl-ma-proof strong{display:block;font-size:36px;letter-spacing:-.045em;color:#8bf5b5;margin:8px 0 3px}.gcl-ma-proof em{font-style:normal;font-size:9px;color:#758078}.gcl-ma-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.06);margin-top:24px}.gcl-ma-kpi{padding:15px;background:#090c0a;min-height:105px}.gcl-ma-kpi>span{font-size:8px;letter-spacing:.12em;color:#66736c;text-transform:uppercase}.gcl-ma-kpi strong{display:block;font-size:23px;margin:11px 0 6px}.gcl-ma-kpi small{font-size:9px;line-height:1.4;color:#6b7770}.gcl-ma-kpi.green strong{color:#9bf5bb}.gcl-ma-kpi.cyan strong{color:#9ce5ec}.gcl-ma-kpi.gold strong{color:#f1d58d}.gcl-ma-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:12px;margin-top:12px}.gcl-ma-panel{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.015);padding:18px}.gcl-ma-title{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.gcl-ma-title h3{font-size:17px;margin:5px 0 0}.gcl-ma-title>b{font-size:27px;color:#9bf5bc}.gcl-ma-title button{border:1px solid rgba(255,255,255,.09);background:transparent;color:#9aa79f;padding:8px 10px;font-size:9px;cursor:pointer}.gcl-ma-atomic>p,.gcl-ma-policy>p{margin-top:12px}.gcl-ma-atomic-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:17px}.gcl-ma-atomic-grid>div{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.06);padding:11px;background:#090c0a}.gcl-ma-atomic-grid span{display:block;font-size:8px;color:#748079;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gcl-ma-atomic-grid strong{display:block;font-size:19px;margin-top:7px}.gcl-ma-atomic-grid i{position:absolute;bottom:0;left:0;height:2px;background:#77efa8}.gcl-ma-policy-flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:7px;margin:19px 0}.gcl-ma-policy-flow>div{display:grid;text-align:center;gap:3px;padding:12px 4px;border:1px solid rgba(255,255,255,.06);background:#090c0a}.gcl-ma-policy-flow strong{font-size:20px}.gcl-ma-policy-flow span{font-size:8px;color:#6f7a73}.gcl-ma-policy-flow>i{font-style:normal;color:#4b5750}.gcl-ma-engines{margin-top:12px}.gcl-ma-engine-list,.gcl-ma-pending>div{display:grid;gap:1px;background:rgba(255,255,255,.05);margin-top:15px}.gcl-ma-engine{display:grid;grid-template-columns:minmax(180px,.9fr) minmax(260px,1.6fr) 100px;gap:18px;align-items:center;padding:11px 12px;background:#090c0a}.gcl-ma-engine-name{display:grid;gap:3px;min-width:0}.gcl-ma-engine-name strong{font-size:11px;color:#d5ddd8}.gcl-ma-engine-name small,.gcl-ma-engine-meter small,.gcl-ma-engine-meta small{font-size:8px;color:#66736c;line-height:1.35}.gcl-ma-engine-meter>div{height:5px;background:rgba(255,255,255,.055);margin-bottom:5px}.gcl-ma-engine-meter i{height:100%;display:block;background:linear-gradient(90deg,#68ee9f,#8adbe7)}.gcl-ma-engine-meta{text-align:right;display:grid;gap:2px}.gcl-ma-engine-meta b{font-size:12px;color:#a8efc2}.gcl-ma-pending{margin-top:13px;border:1px solid rgba(255,255,255,.06);padding:10px 12px}.gcl-ma-pending summary{cursor:pointer;font-size:9px;color:#87938c}.gcl-ma-pending .gcl-ma-engine{opacity:.82}.gcl-ma-foot{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.gcl-ma-foot>div{border:1px solid rgba(255,255,255,.06);padding:14px}.gcl-ma-foot p{margin-top:5px}@media(max-width:1050px){.gcl-ma-kpis{grid-template-columns:repeat(3,1fr)}.gcl-ma-grid{grid-template-columns:1fr}.gcl-ma-atomic-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.gcl-ma{margin-inline:12px;padding:19px}.gcl-ma-head{flex-direction:column}.gcl-ma-proof{text-align:left;width:100%;box-sizing:border-box}.gcl-ma-kpis{grid-template-columns:repeat(2,1fr)}.gcl-ma-atomic-grid{grid-template-columns:repeat(2,1fr)}.gcl-ma-engine{grid-template-columns:1fr}.gcl-ma-engine-meta{text-align:left}.gcl-ma-foot{grid-template-columns:1fr}}@media(max-width:460px){.gcl-ma-kpis{grid-template-columns:1fr}.gcl-ma-atomic-grid{grid-template-columns:1fr}}
`;document.head.appendChild(gclMetricStyle);gclMetricMount();
