const Q65_API='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';
const Q65_ID='gcl-queue65';
let q65Token='';
let q65PollTimer=null;
let q65Stopped=false;

function q65EscapeText(value){return value==null?'':String(value)}
function q65Minutes(seconds){
  const n=Number(seconds);
  return Number.isFinite(n)&&n>0?Math.max(1,Math.ceil(n/60)):null;
}
function q65CurrentToken(){return new URLSearchParams(location.search).get('scan')||''}
function q65Remove(){document.getElementById(Q65_ID)?.remove()}
function q65StopPoll(){if(q65PollTimer){clearTimeout(q65PollTimer);q65PollTimer=null}}
function q65Schedule(token){
  q65StopPoll();
  if(q65Stopped||!token||token!==q65Token)return;
  q65PollTimer=setTimeout(()=>q65Poll(token),2200);
}

function q65Styles(){
  if(document.getElementById('gcl-queue65-style'))return;
  const s=document.createElement('style');
  s.id='gcl-queue65-style';
  s.textContent=`
#gcl-queue65{position:relative;z-index:5;width:min(1180px,calc(100% - 40px));margin:0 auto 34px;padding:0 0 2px}.gcl-q65-card{position:relative;overflow:hidden;border:1px solid rgba(146,255,193,.15);border-radius:26px;background:linear-gradient(135deg,rgba(9,25,19,.94),rgba(4,10,8,.92));box-shadow:0 28px 80px rgba(0,0,0,.28);padding:22px}.gcl-q65-card:before{content:"";position:absolute;inset:-70px auto auto -40px;width:220px;height:180px;border-radius:50%;background:rgba(84,255,157,.07);filter:blur(42px);pointer-events:none}.gcl-q65-top{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.gcl-q65-kicker{display:flex;align-items:center;gap:9px;font-size:10px;font-weight:700;letter-spacing:.18em;color:rgba(183,255,212,.66)}.gcl-q65-dot{width:8px;height:8px;border-radius:50%;background:#6ef2a4;box-shadow:0 0 18px rgba(110,242,164,.8);animation:gcl-q65-pulse 1.7s ease-in-out infinite}.gcl-q65-title{margin-top:9px;font-size:clamp(22px,3vw,34px);font-weight:670;letter-spacing:-.045em;color:#f5fff8}.gcl-q65-copy{margin-top:7px;max-width:720px;font-size:13px;line-height:1.7;color:rgba(238,255,245,.48)}.gcl-q65-state{flex:0 0 auto;border:1px solid rgba(255,255,255,.08);border-radius:17px;background:rgba(255,255,255,.035);padding:12px 15px;text-align:right}.gcl-q65-state small{display:block;font-size:9px;letter-spacing:.15em;color:rgba(255,255,255,.32);text-transform:uppercase}.gcl-q65-state strong{display:block;margin-top:4px;font-size:18px;color:#dfffea}.gcl-q65-grid{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}.gcl-q65-metric{border:1px solid rgba(255,255,255,.065);border-radius:17px;background:rgba(255,255,255,.025);padding:14px}.gcl-q65-metric span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.15em;color:rgba(255,255,255,.3)}.gcl-q65-metric b{display:block;margin-top:6px;font-size:15px;font-weight:630;color:rgba(244,255,248,.86)}.gcl-q65-foot{position:relative;display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.gcl-q65-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(126,255,181,.12);border-radius:999px;background:rgba(126,255,181,.045);padding:8px 11px;font-size:10px;color:rgba(205,255,226,.62)}.gcl-q65-pill i{width:5px;height:5px;border-radius:50%;background:#78eea8}.gcl-q65-note{position:relative;margin-top:13px;font-size:10px;line-height:1.55;color:rgba(255,255,255,.27)}@keyframes gcl-q65-pulse{50%{opacity:.45;transform:scale(.78)}}@media(prefers-reduced-motion:reduce){.gcl-q65-dot{animation:none}}@media(max-width:760px){#gcl-queue65{width:min(100% - 28px,1180px);margin-bottom:24px}.gcl-q65-card{padding:18px;border-radius:22px}.gcl-q65-top{display:block}.gcl-q65-state{margin-top:14px;text-align:left}.gcl-q65-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  document.head.appendChild(s);
}

function q65Metric(label,value){
  const d=document.createElement('div');d.className='gcl-q65-metric';
  const s=document.createElement('span');s.textContent=label;
  const b=document.createElement('b');b.textContent=q65EscapeText(value);
  d.append(s,b);return d;
}
function q65Pill(text){const p=document.createElement('span');p.className='gcl-q65-pill';const i=document.createElement('i');const t=document.createTextNode(text);p.append(i,t);return p}

function q65Render(payload){
  const status=payload?.status;
  const queue=payload?.queue;
  if(!queue?.available||!['queued','processing'].includes(status)){q65Remove();return}
  q65Styles();
  let section=document.getElementById(Q65_ID);
  if(!section){
    section=document.createElement('section');section.id=Q65_ID;section.setAttribute('role','region');section.setAttribute('aria-label','Status da fila de análise');section.setAttribute('aria-live','polite');
    const mount=()=>{const hero=document.querySelector('.s3-hero');if(hero?.parentElement){hero.insertAdjacentElement('afterend',section);return true}return false};
    if(!mount()){let tries=0;const timer=setInterval(()=>{tries++;if(mount()||tries>30)clearInterval(timer)},100)}
  }
  section.replaceChildren();
  const card=document.createElement('div');card.className='gcl-q65-card';
  const top=document.createElement('div');top.className='gcl-q65-top';
  const left=document.createElement('div');
  const kicker=document.createElement('div');kicker.className='gcl-q65-kicker';const dot=document.createElement('i');dot.className='gcl-q65-dot';kicker.append(dot,document.createTextNode('ANÁLISE PROFUNDA · FILA EM TEMPO REAL'));
  const title=document.createElement('div');title.className='gcl-q65-title';
  const copy=document.createElement('div');copy.className='gcl-q65-copy';
  const state=document.createElement('div');state.className='gcl-q65-state';const stateLabel=document.createElement('small');const stateValue=document.createElement('strong');
  const grid=document.createElement('div');grid.className='gcl-q65-grid';
  const foot=document.createElement('div');foot.className='gcl-q65-foot';
  const note=document.createElement('div');note.className='gcl-q65-note';

  const slots=Math.max(1,Number(queue.global_slots)||1);
  const paid=queue.priority==='paid';
  const fair=queue.scheduler==='priority_fair_round_robin_v1';

  if(status==='processing'||queue.status==='processing'){
    title.textContent='Em processamento';
    copy.textContent='Seu site entrou no worker pesado. A execução permanece isolada para preservar estabilidade do navegador, Lighthouse e memória.';
    stateLabel.textContent='estado agora';stateValue.textContent='Worker ativo';
    grid.append(
      q65Metric('Execução','worker pesado'),
      q65Metric('Capacidade',`${slots} ${slots===1?'slot seguro':'slots seguros'}`),
      q65Metric('Prioridade',paid?'Prioridade paga':'Prioridade padrão'),
      q65Metric('P95 recente',Number(queue.p95_processing_seconds_24h)>0?`≈ ${q65Minutes(queue.p95_processing_seconds_24h)} min`:'Sem evidência')
    );
  }else{
    const position=Number(queue.position);
    const ahead=Math.max(0,Number(queue.jobs_ahead)||0);
    const eta=q65Minutes(queue.estimated_start_seconds);
    const p95=q65Minutes(queue.estimated_start_seconds_p95);
    title.textContent=Number.isFinite(position)&&position===1?'Próximo na fila':Number.isFinite(position)&&position>0?`#${position} na fila`:'Aguardando posição';
    copy.textContent=queue.message||'Sua análise foi aceita e aguarda capacidade segura do worker.';
    stateLabel.textContent='posição atual';stateValue.textContent=Number.isFinite(position)&&position>0?`#${position}`:'—';
    grid.append(
      q65Metric('À sua frente',ahead>0?`${ahead} ${ahead===1?'análise':'análises'} à frente`:'Próximo na fila'),
      q65Metric('Início estimado',eta?`≈ ${eta} min`:'Estimativa indisponível'),
      q65Metric('Faixa conservadora',p95?`até ≈ ${p95} min`:'Sem evidência'),
      q65Metric('Capacidade',`${slots} ${slots===1?'slot seguro':'slots seguros'}`)
    );
  }

  foot.append(q65Pill(paid?'Prioridade paga':'Prioridade padrão'));
  if(fair)foot.append(q65Pill('Fila justa'));
  foot.append(q65Pill(queue.admission_state==='open'?'Admissão aberta':queue.admission_state==='throttled'?'Fila em contenção':'Capacidade protegida'));
  note.textContent='Posição e tempo são recalculados a partir da fila real. A estimativa só aparece quando existe histórico de processamento; ela não é promessa de duração.';
  left.append(kicker,title,copy);state.append(stateLabel,stateValue);top.append(left,state);card.append(top,grid,foot,note);section.append(card);
}

async function q65Poll(token){
  if(q65Stopped||!token||token!==q65Token)return;
  try{
    const response=await fetch(Q65_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'status',token})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body?.error||`HTTP ${response.status}`);
    const payload=body?.result||body;
    q65Render(payload);
    if(['queued','processing'].includes(payload?.status))q65Schedule(token);else q65StopPoll();
  }catch{
    // Keep the last evidence-backed card during a transient status failure.
    q65Schedule(token);
  }
}

function q65Activate(token){
  if(!token){q65Token='';q65StopPoll();q65Remove();return}
  if(token===q65Token&&q65PollTimer)return;
  q65Token=token;q65StopPoll();void q65Poll(token);
}

function q65WatchLocation(){
  const token=q65CurrentToken();
  if(token!==q65Token)q65Activate(token);
}

q65WatchLocation();
const q65LocationTimer=setInterval(q65WatchLocation,700);
window.addEventListener('pagehide',()=>{q65Stopped=true;clearInterval(q65LocationTimer);q65StopPoll()},{once:true});
