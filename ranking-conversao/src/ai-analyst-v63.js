const AI63_REPORT_API='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';

const ai63Esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ai63Arr=v=>Array.isArray(v)?v:[];
const ai63Num=(v,d=0)=>Number.isFinite(Number(v))?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:d}).format(Number(v)):'—';
const ai63Confidence=v=>Number.isFinite(Number(v))?`${ai63Num(Number(v)*100,0)}% confiança`:'confiança não estimada';
const ai63Priority=v=>({high:'ALTA',medium:'MÉDIA',low:'BAIXA'})[String(v||'').toLowerCase()]||String(v||'').toUpperCase()||'HIPÓTESE';

async function ai63Report(token){
  const r=await fetch(AI63_REPORT_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'report',token})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d.result||null;
}

function ai63EvidenceCount(item){return ai63Arr(item?.evidence_refs).length}
function ai63Item(item,type='neutral'){
  if(!item)return'';
  const title=item.title||item.hypothesis||'Insight';
  const body=item.insight||item.change||item.response||'';
  const fix=item.fix||item.metric||'';
  return `<article class="ai63-item ${ai63Esc(type)}"><div class="ai63-item-head"><strong>${ai63Esc(title)}</strong><span>${ai63Esc(ai63Confidence(item.confidence))}</span></div>${body?`<p>${ai63Esc(body)}</p>`:''}${fix?`<small>${ai63Esc(fix)}</small>`:''}<em>${ai63EvidenceCount(item)} referência${ai63EvidenceCount(item)===1?'':'s'} de evidência</em></article>`;
}

function ai63Copy(copy={}){
  const rows=[['Headline',copy.headline],['Subheadline',copy.subheadline],['CTA principal',copy.primary_cta],['Bloco de prova',copy.proof_block]].filter(([,v])=>v);
  if(!rows.length)return'';
  return `<details class="ai63-details"><summary>Copy sugerida para experimento <span>não publicada automaticamente</span></summary><div class="ai63-copy">${rows.map(([k,v])=>`<div><span>${ai63Esc(k)}</span><strong>${ai63Esc(v)}</strong></div>`).join('')}</div></details>`;
}

function ai63Card(ai,domain='Site analisado'){
  const a=ai?.analysis||{};const profile=a?.strategic_profile||{};const gate=a?.publication_gate||{};
  const strengths=ai63Arr(a.strengths).slice(0,3);const leaks=ai63Arr(a.conversion_leaks).slice(0,4);const experiments=ai63Arr(a.experiments).slice(0,4);const missing=ai63Arr(a.missing_evidence).slice(0,8);
  const refined=a.refinement_status==='completed'||a.refinement_status==='refined';
  return `<section class="ai63-card" id="gcl-ai-analyst" aria-label="GCL AI Analyst">
    <header class="ai63-head"><div><span>GCL AI ANALYST</span><h2>${ai63Esc(domain)}</h2><p>Leitura estratégica de CRO e mensagem sobre evidências públicas já coletadas pelo GCL. A IA explica padrões e propõe experimentos; não inventa telemetria privada.</p></div><div class="ai63-badges"><b>DIAGNÓSTICO · EVIDÊNCIAS PÚBLICAS</b><em>NÃO ALTERA O GCL SCORE</em></div></header>
    <div class="ai63-summary"><div class="ai63-orb">AI</div><div><span>LEITURA EXECUTIVA</span><strong>${ai63Esc(a.executive_summary||'Síntese estratégica ainda não disponível.')}</strong><small>${refined?'Síntese refinada por raciocínio adicional.':'Síntese base grounded; o refinamento avançado ficou indisponível nesta execução sem invalidar as evidências.'}</small></div></div>
    <div class="ai63-profile">
      <article><span>Arquétipo</span><strong>${ai63Esc(profile.archetype||'—')}</strong><small>${ai63Esc(profile.awareness_stage||'estágio não confirmado')}</small></article>
      <article><span>Público provável</span><strong>${ai63Esc(profile.audience||'Não inferido')}</strong></article>
      <article><span>Oferta observada</span><strong>${ai63Esc(profile.offer||'Não confirmada')}</strong></article>
      <article><span>Ação principal</span><strong>${ai63Esc(profile.primary_action||'Não confirmada')}</strong></article>
    </div>
    ${profile.message_match?`<div class="ai63-message"><span>MESSAGE MATCH</span><p>${ai63Esc(profile.message_match)}</p></div>`:''}
    <div class="ai63-columns">
      <section><div class="ai63-title"><span>FORÇAS OBSERVADAS</span><h3>O que já trabalha a favor</h3></div><div class="ai63-list">${strengths.map(x=>ai63Item(x,'strength')).join('')||'<div class="ai63-empty">Nenhuma força qualitativa foi publicada neste ciclo.</div>'}</div></section>
      <section><div class="ai63-title"><span>LEAKS DE CONVERSÃO</span><h3>Onde testar primeiro</h3></div><div class="ai63-list">${leaks.map(x=>ai63Item(x,'leak')).join('')||'<div class="ai63-empty">Nenhum leak grounded foi publicado neste ciclo.</div>'}</div></section>
    </div>
    ${experiments.length?`<section class="ai63-experiments"><div class="ai63-title"><span>EXPERIMENTOS PRIORIZADOS</span><h3>Hipóteses para provar, não promessas de resultado</h3></div><div class="ai63-exp-grid">${experiments.map((x,i)=>`<article><div><b>${String(i+1).padStart(2,'0')}</b><span>${ai63Esc(ai63Priority(x.priority))}</span></div><h4>${ai63Esc(x.hypothesis||'Hipótese')}</h4><p>${ai63Esc(x.change||'')}</p><small><strong>Métrica:</strong> ${ai63Esc(x.metric||'definir antes do teste')}</small><em>${ai63Esc(ai63Confidence(x.confidence))} · ${ai63EvidenceCount(x)} ref. de evidência</em></article>`).join('')}</div></section>`:''}
    ${ai63Copy(a.copy_suggestions||{})}
    ${missing.length?`<details class="ai63-details"><summary>Evidências ainda ausentes <span>${missing.length} lacunas declaradas</span></summary><ul>${missing.map(x=>`<li>${ai63Esc(x)}</li>`).join('')}</ul></details>`:''}
    <footer class="ai63-foot"><div><b>${gate.status==='safe_partial'?'PUBLICAÇÃO PARCIAL SEGURA':'PUBLICAÇÃO GROUNDED'}</b><span>${ai63Esc(gate.disclosure||ai.disclosure||'Interpretação de IA sobre evidências públicas; sem efeito no score ou ranking.')}</span></div><div><span>GCL-AI-2.0</span><strong>${gate.filtered_items?`${gate.filtered_items} item(ns) omitidos pelo truth gate`:'truth gate sem cortes neste resultado'}</strong></div></footer>
  </section>`;
}

function ai63Styles(){if(document.getElementById('ai63-style'))return;const s=document.createElement('style');s.id='ai63-style';s.textContent=`
.ai63-card{max-width:1280px;margin:14px auto 24px;padding:28px;border:1px solid rgba(143,121,255,.18);border-radius:28px;color:#f2f5f3;background:radial-gradient(circle at 8% 0,rgba(128,103,255,.12),transparent 30%),radial-gradient(circle at 95% 14%,rgba(102,239,171,.07),transparent 30%),linear-gradient(145deg,#090b0a,#060708 72%);box-shadow:0 34px 110px rgba(0,0,0,.3);box-sizing:border-box}.ai63-head{display:flex;justify-content:space-between;gap:28px;align-items:flex-start}.ai63-head>div:first-child{max-width:760px}.ai63-head>div:first-child>span,.ai63-title>span,.ai63-message>span,.ai63-summary>div:nth-child(2)>span{font-size:9px;letter-spacing:.2em;color:#a89aff;font-weight:850}.ai63-head h2{font-size:clamp(30px,4.6vw,56px);letter-spacing:-.05em;line-height:.98;margin:8px 0 12px}.ai63-head p{margin:0;color:#89938d;font-size:13px;line-height:1.65}.ai63-badges{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.ai63-badges b,.ai63-badges em{font-style:normal;font-size:8px;letter-spacing:.1em;padding:8px 10px;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:rgba(255,255,255,.025)}.ai63-badges b{color:#b9afff;border-color:rgba(169,154,255,.2)}.ai63-badges em{color:#8bf0b3;border-color:rgba(112,238,164,.18)}.ai63-summary{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;padding:20px;margin-top:22px;border:1px solid rgba(255,255,255,.07);border-radius:20px;background:rgba(255,255,255,.025)}.ai63-orb{display:grid;place-items:center;width:54px;height:54px;border-radius:18px;background:linear-gradient(135deg,#8c78ff,#65e9a1);color:#07100b;font-size:13px;font-weight:950;box-shadow:0 0 32px rgba(139,120,255,.22)}.ai63-summary strong{display:block;margin-top:6px;font-size:17px;line-height:1.5;color:#e8ece9}.ai63-summary small{display:block;margin-top:7px;color:#707b74;font-size:10px}.ai63-profile{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.ai63-profile article{padding:14px;border-radius:15px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.018)}.ai63-profile span,.ai63-item-head span,.ai63-copy span{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.13em;color:#6f7973}.ai63-profile strong{display:block;margin-top:7px;font-size:12px;line-height:1.5;color:#dbe1dd}.ai63-profile small{display:block;margin-top:5px;font-size:9px;color:#727d76}.ai63-message{margin-top:8px;padding:14px 16px;border-left:2px solid #8c78ff;background:rgba(140,120,255,.045);border-radius:0 12px 12px 0}.ai63-message p{margin:6px 0 0;color:#aab3ad;font-size:12px;line-height:1.6}.ai63-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}.ai63-title h3{margin:5px 0 11px;font-size:20px}.ai63-list{display:grid;gap:7px}.ai63-item{padding:14px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(255,255,255,.018)}.ai63-item.strength{border-color:rgba(102,239,171,.11)}.ai63-item.leak{border-color:rgba(246,193,103,.11)}.ai63-item-head{display:flex;justify-content:space-between;gap:12px}.ai63-item-head strong{font-size:12px}.ai63-item p{margin:8px 0 0;color:#929d96;font-size:11px;line-height:1.6}.ai63-item small{display:block;margin-top:8px;color:#c5ccc7;font-size:10px;line-height:1.5}.ai63-item em{display:block;margin-top:9px;font-style:normal;color:#5f6a63;font-size:8px;letter-spacing:.08em;text-transform:uppercase}.ai63-experiments{margin-top:24px}.ai63-exp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.ai63-exp-grid article{padding:14px;border:1px solid rgba(255,255,255,.06);border-radius:15px;background:linear-gradient(150deg,rgba(140,120,255,.045),rgba(255,255,255,.012))}.ai63-exp-grid article>div{display:flex;justify-content:space-between}.ai63-exp-grid b{font-size:18px;color:#a79aff}.ai63-exp-grid article>div span{font-size:8px;color:#ecbf69;letter-spacing:.12em}.ai63-exp-grid h4{font-size:12px;line-height:1.45;margin:10px 0 6px}.ai63-exp-grid p{font-size:10px;line-height:1.55;color:#8e9992;margin:0}.ai63-exp-grid small{display:block;margin-top:9px;color:#737e77;font-size:9px;line-height:1.45}.ai63-exp-grid em{display:block;margin-top:8px;color:#59635d;font-style:normal;font-size:8px}.ai63-details{margin-top:10px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(255,255,255,.015);overflow:hidden}.ai63-details summary{cursor:pointer;list-style:none;padding:13px 15px;font-size:10px;font-weight:800;color:#c7cec9;display:flex;justify-content:space-between;gap:12px}.ai63-details summary span{font-weight:500;color:#68736c}.ai63-details ul{margin:0;padding:0 32px 16px;color:#849087;font-size:10px;line-height:1.7}.ai63-copy{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 14px 14px}.ai63-copy div{padding:12px;border-radius:11px;background:rgba(0,0,0,.18)}.ai63-copy strong{display:block;margin-top:6px;font-size:11px;line-height:1.5}.ai63-foot{display:flex;justify-content:space-between;gap:24px;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.065)}.ai63-foot>div{display:grid;gap:4px}.ai63-foot b{font-size:9px;letter-spacing:.12em;color:#88efb0}.ai63-foot span{max-width:900px;color:#657069;font-size:9px;line-height:1.55}.ai63-foot>div:last-child{text-align:right}.ai63-foot>div:last-child strong{font-size:9px;color:#7c8780}.ai63-empty{padding:18px;border:1px dashed rgba(255,255,255,.08);border-radius:13px;color:#717c75;font-size:10px}.ai63-host{max-width:1280px;margin-left:auto;margin-right:auto}@media(max-width:960px){.ai63-profile{grid-template-columns:1fr 1fr}.ai63-columns{grid-template-columns:1fr}.ai63-exp-grid{grid-template-columns:1fr 1fr}}@media(max-width:640px){.ai63-card{margin-inline:12px;padding:18px;border-radius:22px}.ai63-head{flex-direction:column}.ai63-badges{justify-content:flex-start}.ai63-profile,.ai63-exp-grid,.ai63-copy{grid-template-columns:1fr}.ai63-summary{grid-template-columns:1fr}.ai63-foot{flex-direction:column}.ai63-foot>div:last-child{text-align:left}}
`;document.head.appendChild(s)}

async function ai63Mount(){
  const token=new URLSearchParams(location.search).get('scan');if(!token)return;
  let host=null;for(let i=0;i<160;i++){host=document.getElementById('gcl-score-profile')||document.getElementById('gcl-report-intelligence-v11')||document.querySelector('.s3-report-kpis');if(host)break;await new Promise(r=>setTimeout(r,100))}
  if(!host||document.getElementById('gcl-ai-analyst'))return;
  try{
    const d=await ai63Report(token);const ai=d?.ai_analyst;if(!d?.found||!ai?.available)return;
    const wrap=document.createElement('div');wrap.className='ai63-host';wrap.innerHTML=ai63Card(ai,d?.domain?.normalized_domain||d?.domain?.company_name||'Site analisado');
    host.after(wrap);
  }catch(e){console.warn('ai-analyst-v63',e.message)}
}

ai63Styles();
ai63Mount();
