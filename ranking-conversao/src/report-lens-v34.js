const RL34_SCAN=()=>new URLSearchParams(location.search).get('scan');
function rl34Esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function rl34Reduced(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true}
function rl34Scroll(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:rl34Reduced()?'auto':'smooth',block:'start'})}
function rl34Anchor(el,id){if(el&&!el.id)el.id=id;return el?.id||null}
function rl34Mount(){
 if(!RL34_SCAN()||document.getElementById('gcl-report-lens34'))return;
 const executive=document.getElementById('gcl-report-intelligence-v11');if(!executive)return;
 const action=document.getElementById('gcl-action-center-v12');
 const pages=document.querySelector('#gcl-report-intelligence-v11 .gcl-v11-panel.pages');
 const evidence=document.querySelector('#gcl-report-intelligence-v11 .gcl-v11-panel.evidence');
 const ai=document.getElementById('gcl-ai-search');
 const evolution=document.getElementById('gcl-evolution-plan')||document.getElementById('gcl-score-recovery');
 rl34Anchor(pages,'gcl-page-health34');rl34Anchor(evidence,'gcl-evidence34');
 const items=[
  ['Visão geral','gcl-report-intelligence-v11','overview'],
  action?['Prioridades','gcl-action-center-v12','actions']:null,
  pages?['Páginas','gcl-page-health34','pages']:null,
  evidence?['Evidências','gcl-evidence34','evidence']:null,
  ai?['IA','gcl-ai-search','ai']:null,
  evolution?['Evolução',evolution.id,'evolution']:null
 ].filter(Boolean);
 const nav=document.createElement('nav');nav.id='gcl-report-lens34';nav.className='gcl-report-lens34';nav.setAttribute('aria-label','Navegação do relatório');
 nav.innerHTML=`<div><span>DECISION LENS</span><b>Veja só o que precisa agora.</b></div><div class="gcl-rl34-tabs">${items.map(([label,id,key],i)=>`<button type="button" data-target="${rl34Esc(id)}" data-lens="${key}" class="${i===0?'active':''}">${rl34Esc(label)}</button>`).join('')}</div><button type="button" class="gcl-rl34-top" aria-label="Voltar ao início do relatório">↑</button>`;
 executive.before(nav);nav.querySelectorAll('[data-target]').forEach(btn=>btn.onclick=()=>{nav.querySelectorAll('[data-target]').forEach(x=>x.classList.toggle('active',x===btn));rl34Scroll(btn.dataset.target)});nav.querySelector('.gcl-rl34-top').onclick=()=>rl34Scroll('gcl-report-lens34');
 if(action)rl34EnhanceActions(action);
}
function rl34EnhanceActions(action){
 if(action.dataset.rl34==='1')return;action.dataset.rl34='1';
 const list=action.querySelector('.gcl-action-list');if(!list)return;const rows=[...list.querySelectorAll('details')];if(!rows.length)return;
 rows.forEach(row=>{const status=row.querySelector('summary em');row.dataset.rlStatus=status?.classList.contains('fail')?'critical':'attention';row.dataset.rlText=(row.textContent||'').toLowerCase()});
 const critical=rows.filter(r=>r.dataset.rlStatus==='critical').length,attention=rows.length-critical;
 const tools=document.createElement('div');tools.className='gcl-rl34-tools';tools.innerHTML=`<div class="gcl-rl34-filter" role="group" aria-label="Filtrar prioridades"><button type="button" data-filter="all" class="active">Todas <b>${rows.length}</b></button><button type="button" data-filter="critical">Críticas <b>${critical}</b></button><button type="button" data-filter="attention">Atenção <b>${attention}</b></button></div><label><span aria-hidden="true">⌕</span><input type="search" placeholder="Buscar prioridade ou página…" aria-label="Buscar dentro das prioridades"></label><div class="gcl-rl34-expand"><button type="button" data-expand="open">Expandir</button><button type="button" data-expand="close">Recolher</button></div><small class="gcl-rl34-count" aria-live="polite"></small>`;
 list.before(tools);let filter='all';const input=tools.querySelector('input'),count=tools.querySelector('.gcl-rl34-count');
 const apply=()=>{const q=input.value.trim().toLowerCase();let visible=0;rows.forEach(row=>{const okStatus=filter==='all'||row.dataset.rlStatus===filter;const okText=!q||row.dataset.rlText.includes(q);row.hidden=!(okStatus&&okText);if(!row.hidden)visible++});count.textContent=`${visible} de ${rows.length} prioridades exibidas`};
 tools.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter;tools.querySelectorAll('[data-filter]').forEach(x=>{const on=x===btn;x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on))});apply()});input.oninput=apply;
 tools.querySelector('[data-expand="open"]').onclick=()=>rows.filter(r=>!r.hidden).forEach(r=>r.open=true);tools.querySelector('[data-expand="close"]').onclick=()=>rows.forEach(r=>r.open=false);apply();
}
function rl34Styles(){if(document.getElementById('gcl-report-lens34-style'))return;const s=document.createElement('style');s.id='gcl-report-lens34-style';s.textContent=`
.gcl-report-lens34{max-width:1280px;margin:16px auto 8px;position:sticky;top:8px;z-index:70;display:grid;grid-template-columns:minmax(170px,.7fr) minmax(0,2fr) auto;gap:12px;align-items:center;padding:9px 10px 9px 14px;border:1px solid rgba(255,255,255,.1);border-radius:17px;background:rgba(6,10,8,.9);backdrop-filter:blur(18px);box-shadow:0 14px 50px rgba(0,0,0,.28)}.gcl-report-lens34>div:first-child{display:grid;gap:2px}.gcl-report-lens34>div:first-child span{font-size:7px;letter-spacing:.16em;color:#7cf0aa}.gcl-report-lens34>div:first-child b{font-size:10px;color:#b5c1bb}.gcl-rl34-tabs{display:flex;gap:4px;overflow:auto;scrollbar-width:none}.gcl-rl34-tabs button,.gcl-rl34-top{white-space:nowrap;border:1px solid transparent;background:transparent;color:#79877f;padding:8px 9px;border-radius:9px;font-size:9px;cursor:pointer}.gcl-rl34-tabs button:hover,.gcl-rl34-tabs button:focus-visible,.gcl-rl34-tabs button.active,.gcl-rl34-top:hover,.gcl-rl34-top:focus-visible{outline:none;color:#9af6bd;border-color:rgba(124,240,170,.18);background:rgba(124,240,170,.055)}.gcl-rl34-top{font-size:15px}.gcl-rl34-tools{display:grid;grid-template-columns:auto minmax(210px,1fr) auto;gap:8px 12px;align-items:center;margin:12px 0 3px;padding:10px;border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.018)}.gcl-rl34-filter,.gcl-rl34-expand{display:flex;gap:4px}.gcl-rl34-tools button{border:1px solid rgba(255,255,255,.075);background:transparent;color:#7b8780;padding:7px 9px;font-size:8px;cursor:pointer}.gcl-rl34-tools button.active,.gcl-rl34-tools button:hover,.gcl-rl34-tools button:focus-visible{color:#9cf6be;border-color:rgba(124,240,170,.22);background:rgba(124,240,170,.045);outline:none}.gcl-rl34-tools button b{font-size:8px;color:#c7d1cb;margin-left:3px}.gcl-rl34-tools label{display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.075);padding:7px 9px;background:#060806}.gcl-rl34-tools label span{color:#6ee8a0}.gcl-rl34-tools input{width:100%;border:0;outline:0;background:transparent;color:#dbe3de;font-size:10px}.gcl-rl34-count{grid-column:1/-1;color:#68746d;font-size:8px;letter-spacing:.05em}.gcl-action-list details[hidden]{display:none!important}#gcl-report-intelligence-v11,#gcl-action-center-v12,#gcl-page-health34,#gcl-evidence34,#gcl-ai-search,#gcl-evolution-plan,#gcl-score-recovery{scroll-margin-top:82px}@media(max-width:800px){.gcl-report-lens34{margin-inline:12px;grid-template-columns:1fr auto}.gcl-report-lens34>div:first-child{display:none}.gcl-rl34-tabs{grid-column:1}.gcl-rl34-top{grid-column:2}.gcl-rl34-tools{grid-template-columns:1fr}.gcl-rl34-filter,.gcl-rl34-expand{overflow:auto}.gcl-rl34-tools label{order:-1}.gcl-rl34-count{grid-column:auto}}@media(prefers-reduced-motion:reduce){.gcl-report-lens34{scroll-behavior:auto}}
`;document.head.appendChild(s)}
function rl34Boot(){if(!RL34_SCAN())return;rl34Styles();let tries=0;const tick=()=>{rl34Mount();if(!document.getElementById('gcl-report-lens34')&&tries++<160)setTimeout(tick,100)};tick();new MutationObserver(()=>{rl34Mount();const a=document.getElementById('gcl-action-center-v12');if(a)rl34EnhanceActions(a)}).observe(document.documentElement,{childList:true,subtree:true})}
rl34Boot();
