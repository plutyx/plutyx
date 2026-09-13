const SALES87_MEMBER='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/gcl-member-api';
const SALES87_SESSION='gcl_session_v1';

function sales87Session(){try{return JSON.parse(localStorage.getItem(SALES87_SESSION)||'null')}catch{return null}}
function sales87Esc(value=''){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function sales87Date(value){if(!value)return 'sem data';const date=new Date(value);return Number.isNaN(date.getTime())?'sem data':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function sales87Phone(value=''){return String(value).replace(/[^+\d]/g,'')}

async function sales87Api(body){
  const session=sales87Session();
  if(!session?.access_token)throw new Error('authentication_required');
  const response=await fetch(SALES87_MEMBER,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${session.access_token}`},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data.result??data;
}

function sales87Row(row){
  const email=String(row.email||'');
  const phone=sales87Phone(row.phone);
  const overdue=row.follow_up_at&&new Date(row.follow_up_at)<new Date();
  return `<article class="gcl-sales87-row${overdue?' overdue':''}" data-lead-id="${sales87Esc(row.id)}">
    <header><div><span>${sales87Esc(row.company_name||row.normalized_domain||'Lead GCL')}</span><h3>${sales87Esc(row.normalized_domain||'domínio preparado')}</h3></div><b>${sales87Esc(row.stage)}</b></header>
    <div class="gcl-sales87-contact"><a href="mailto:${encodeURIComponent(email)}">${sales87Esc(email)}</a>${phone?`<a href="tel:${sales87Esc(phone)}">${sales87Esc(row.phone)}</a>`:''}</div>
    <p>${sales87Esc(row.role_title||'Função não informada')} · ${sales87Esc('interesse em '+(row.product_code||'GCL Conversion Audit'))}</p>
    <div class="gcl-sales87-meta"><span>Origem: ${sales87Esc(row.utm_source||row.source_path||'direta')}</span><span>Entrada: ${sales87Date(row.created_at)}</span><span class="follow">Follow-up: ${sales87Date(row.follow_up_at)}</span></div>
    <label>Próximo contato<input type="datetime-local" data-follow-up></label>
    <div class="gcl-sales87-actions"><button type="button" data-stage="contacted">Contactado</button><button type="button" data-stage="qualified">Qualificar</button><button type="button" data-stage="converted" class="positive">Converter</button><button type="button" data-stage="lost" class="negative">Perdido</button></div>
    <div class="gcl-sales87-result" role="status" aria-live="polite"></div>
  </article>`;
}

function sales87Render(data){
  const rows=Array.isArray(data?.rows)?data.rows:[];
  const summary=data?.summary||{};
  const section=document.createElement('section');section.id='gcl-sales87';section.className='gcl-sales87';section.setAttribute('aria-label','Pipeline de leads GCL');
  section.innerHTML=`<header><div><span>REVENUE OPERATIONS · STAFF</span><h2>Pipeline de leads</h2><p>Contatos reais captados pelo desafio GCL, visíveis somente para owner/admin.</p></div><div class="gcl-sales87-kpis"><b>${Number(summary.active||0)}<small>ativos</small></b><b>${Number(summary.qualified||0)}<small>qualificados</small></b><b>${Number(summary.overdue||0)}<small>atrasados</small></b></div></header><div class="gcl-sales87-toolbar"><input type="search" placeholder="Buscar empresa, domínio ou e-mail" aria-label="Buscar leads"><select aria-label="Filtrar estágio"><option value="active">Pipeline ativo</option><option value="all">Todos</option><option value="checkout_blocked">Novos</option><option value="contacted">Contactados</option><option value="qualified">Qualificados</option><option value="converted">Convertidos</option><option value="lost">Perdidos</option></select><button type="button" data-refresh>Atualizar</button></div><div class="gcl-sales87-list">${rows.length?rows.map(sales87Row).join(''):'<article class="gcl-sales87-empty">Nenhum lead neste filtro.</article>'}</div>`;
  return section;
}

let sales87Mounting=false;
async function sales87Mount(filters={stage:'active',query:null},force=false){
  const existing=document.getElementById('gcl-sales87');
  if(sales87Mounting||(!force&&existing)||!location.pathname.match(/\/ranking-site\/(account|dashboard)\/?$/)||!sales87Session()?.access_token)return;
  const anchor=document.querySelector('#gcl-production-account,.ma25-shell,.gcl-dashboard-grid');
  if(!anchor)return;
  sales87Mounting=true;
  try{
    const data=await sales87Api({action:'sales_leads',stage:filters.stage,query:filters.query,limit:50});
    existing?.remove();
    const section=sales87Render(data);
    anchor.after(section);
    sales87Bind(section);
  }catch(error){
    if(String(error?.message)!=='sales_operator_required')console.warn('gcl sales ops',error);
  }finally{sales87Mounting=false}
}

function sales87Bind(section){
  const search=section.querySelector('input[type="search"]');
  const stage=section.querySelector('select');
  const refresh=()=>sales87Mount({stage:stage.value,query:search.value.trim()||null},true);
  section.querySelector('[data-refresh]').onclick=refresh;
  stage.onchange=refresh;
  search.onkeydown=event=>{if(event.key==='Enter')refresh()};
  section.querySelectorAll('[data-lead-id]').forEach(card=>card.querySelectorAll('[data-stage]').forEach(button=>button.onclick=async()=>{
    const nextStage=button.dataset.stage;
    if(nextStage==='lost'&&!window.confirm('Marcar este lead como perdido?'))return;
    const note=window.prompt('Nota interna deste contato (opcional):','')||null;
    const followInput=card.querySelector('[data-follow-up]');
    const followUp=followInput.value?new Date(followInput.value).toISOString():null;
    const result=card.querySelector('.gcl-sales87-result');result.textContent='Salvando…';
    card.querySelectorAll('button').forEach(item=>item.disabled=true);
    try{
      const updated=await sales87Api({action:'update_sales_lead',lead_id:card.dataset.leadId,stage:nextStage,note,follow_up_at:followUp});
      result.textContent=`✓ ${updated.stage}`;
      setTimeout(refresh,500);
    }catch(error){
      result.textContent=`Não foi possível atualizar: ${error.message}`;
      card.querySelectorAll('button').forEach(item=>item.disabled=false);
    }
  }));
}

function sales87Styles(){if(document.getElementById('gcl-sales87-style'))return;const style=document.createElement('style');style.id='gcl-sales87-style';style.textContent=`
.gcl-sales87{max-width:1280px;margin:24px auto;padding:clamp(20px,4vw,36px);border:1px solid rgba(119,244,172,.18);background:linear-gradient(145deg,rgba(8,18,13,.98),rgba(3,8,6,.98));color:#eef7f1}.gcl-sales87>header{display:flex;justify-content:space-between;gap:24px;align-items:end}.gcl-sales87>header span{font-size:9px;letter-spacing:.18em;color:#7df2ad}.gcl-sales87 h2{font-size:clamp(32px,5vw,58px);line-height:.95;margin:7px 0}.gcl-sales87>header p{color:#8fa097;font-size:11px}.gcl-sales87-kpis{display:flex;gap:8px}.gcl-sales87-kpis b{min-width:78px;padding:12px;background:rgba(255,255,255,.04);font-size:22px;text-align:center}.gcl-sales87-kpis small{display:block;font-size:8px;text-transform:uppercase;color:#7f9187}.gcl-sales87-toolbar{display:grid;grid-template-columns:1fr 180px auto;gap:8px;margin:22px 0}.gcl-sales87-toolbar input,.gcl-sales87-toolbar select,.gcl-sales87-toolbar button,.gcl-sales87-row input{border:1px solid rgba(255,255,255,.1);background:#07100b;color:#eaf3ed;padding:11px;font:inherit}.gcl-sales87-toolbar button{cursor:pointer;color:#8af4b6}.gcl-sales87-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gcl-sales87-row,.gcl-sales87-empty{padding:16px;border:1px solid rgba(255,255,255,.08);background:#070c09}.gcl-sales87-row.overdue{border-color:rgba(255,190,89,.35)}.gcl-sales87-row>header{display:flex;justify-content:space-between;gap:14px}.gcl-sales87-row h3{margin:4px 0;font-size:21px}.gcl-sales87-row>header span{font-size:9px;color:#8ea097}.gcl-sales87-row>header b{height:max-content;padding:5px 7px;background:rgba(124,240,171,.09);color:#89efb2;font-size:8px;text-transform:uppercase}.gcl-sales87-contact{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.gcl-sales87-contact a{color:#8cf3b7;font-size:12px}.gcl-sales87-row p,.gcl-sales87-meta{font-size:10px;color:#89988f}.gcl-sales87-meta{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.gcl-sales87-row label{display:grid;gap:5px;font-size:9px;color:#829188}.gcl-sales87-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.gcl-sales87-actions button{border:1px solid rgba(255,255,255,.1);background:#0d1711;color:#d9e5de;padding:8px 10px;font-size:9px;cursor:pointer}.gcl-sales87-actions .positive{border-color:rgba(124,240,171,.35);color:#8cf3b7}.gcl-sales87-actions .negative{border-color:rgba(255,120,120,.28);color:#ffadad}.gcl-sales87-result{min-height:16px;margin-top:8px;font-size:10px;color:#8cf3b7}@media(max-width:800px){.gcl-sales87{margin-inline:12px}.gcl-sales87>header{align-items:start;display:grid}.gcl-sales87-toolbar,.gcl-sales87-list{grid-template-columns:1fr}.gcl-sales87-kpis{overflow:auto}.gcl-sales87-kpis b{min-width:72px}}
`;document.head.appendChild(style)}

sales87Styles();
const sales87Observer=new MutationObserver(()=>sales87Mount());
sales87Observer.observe(document.documentElement,{childList:true,subtree:true});
sales87Mount();
