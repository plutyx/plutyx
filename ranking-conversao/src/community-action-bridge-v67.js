const GCL_HANDOFF_KEY='gcl_community_handoff_v1';
const GCL_HANDOFF_TTL=2*60*60*1000;
const COMMUNITY_PATH=/^\/ranking-site\/community\/?$/;
const MARKET_PATH=/^\/ranking-site\/(services|market)\/?$/;

function safeUrl(raw){try{const u=new URL(String(raw||''));return ['http:','https:'].includes(u.protocol)?u.toString():''}catch{return''}}
function text(el){return (el?.textContent||'').trim()}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function postContext(card){
  const direct=card.querySelector(':scope > a[href^="http"]')?.href||'';
  const domain=card.querySelector('.gcl-social-meta a[href^="http"]')?.href||'';
  const url=safeUrl(direct)||safeUrl(domain);
  return{
    version:1,
    post_id:card.dataset.postId||'',
    title:text(card.querySelector(':scope > h3'))||'Revisar página compartilhada na Community',
    context:text(card.querySelector(':scope > p')),
    url,
    created_at:Date.now(),
    expires_at:Date.now()+GCL_HANDOFF_TTL,
  };
}
function save(ctx){sessionStorage.setItem(GCL_HANDOFF_KEY,JSON.stringify(ctx))}
function read(){try{const value=JSON.parse(sessionStorage.getItem(GCL_HANDOFF_KEY)||'null');if(!value||Number(value.expires_at)<=Date.now()){sessionStorage.removeItem(GCL_HANDOFF_KEY);return null}value.url=safeUrl(value.url);return value}catch{sessionStorage.removeItem(GCL_HANDOFF_KEY);return null}}

function styles(){if(document.getElementById('gcl-action-bridge-v67-style'))return;const s=document.createElement('style');s.id='gcl-action-bridge-v67-style';s.textContent=`
.gcl-action-bridge67{display:flex;gap:7px;flex-wrap:wrap;padding:8px 0 4px}.gcl-action-bridge67 button{border:1px solid rgba(112,243,168,.13);background:rgba(112,243,168,.035);color:#9be9b9;border-radius:10px;padding:7px 10px;font-size:10px;font-weight:800;cursor:pointer}.gcl-action-bridge67 button:hover{background:rgba(112,243,168,.08);color:#c1ffd8}.gcl-action-bridge67 .market{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:#a8b4ae}.gcl-market-handoff67{margin:0 auto 18px;max-width:1180px;padding:16px 18px;border:1px solid rgba(112,243,168,.15);border-radius:17px;background:radial-gradient(circle at 0 0,rgba(112,243,168,.07),transparent 38%),rgba(6,15,11,.72);display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}.gcl-market-handoff67 small{display:block;color:#6ff0a4;font-size:8px;letter-spacing:.16em}.gcl-market-handoff67 h3{margin:5px 0 4px;font-size:17px;color:#edf7f0}.gcl-market-handoff67 p{margin:0;color:#879890;font-size:11px;line-height:1.55}.gcl-market-handoff67 b{font-size:10px;color:#a8bbb1;white-space:nowrap}@media(max-width:680px){.gcl-market-handoff67{grid-template-columns:1fr}}
`;document.head.appendChild(s)}

function mountCommunity(){if(!COMMUNITY_PATH.test(location.pathname))return;styles();document.querySelectorAll('.gcl-social-post:not([data-gcl-action-bridge])').forEach(card=>{card.dataset.gclActionBridge='1';const ctx=postContext(card);if(!ctx.url&&!ctx.context)return;const group=document.createElement('div');group.className='gcl-action-bridge67';group.setAttribute('role','group');group.setAttribute('aria-label','Próximas ações para esta discussão');group.innerHTML='<button type="button" class="hot">Levar ao Hot Seat</button><button type="button" class="market">Buscar execução</button>';group.querySelector('.hot').onclick=()=>{const fresh=postContext(card);document.dispatchEvent(new CustomEvent('gcl:hot-seat-prefill',{detail:fresh}))};group.querySelector('.market').onclick=()=>{const fresh=postContext(card);save(fresh);location.assign('/ranking-site/services/?source=community')};card.querySelector('.gcl-social-actions')?.before(group)})}

function mountMarket(){if(!MARKET_PATH.test(location.pathname))return;if(new URLSearchParams(location.search).get('source')!=='community')return;const ctx=read();if(!ctx)return;styles();const grid=document.querySelector('.gcl-market-grid');if(!grid||document.querySelector('.gcl-market-handoff67'))return;const host=ctx.url?new URL(ctx.url).hostname:'';const section=document.createElement('section');section.className='gcl-market-handoff67';section.setAttribute('role','region');section.setAttribute('aria-label','Contexto vindo da Community');section.innerHTML=`<div><small>COMMUNITY → GCL MARKET</small><h3>${esc(ctx.title||'Discussão da Community')}</h3><p>O briefing fica apenas nesta sessão e será pré-preenchido quando você escolher um serviço. Nada foi enviado automaticamente.</p></div><b>${esc(host||'contexto preservado')}</b>`;grid.before(section)}

function sync(){mountCommunity();mountMarket()}
new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true});
sync();
