const GCLX33='gcl_experience_v33';
const GCL_LAST33='gcl_last_route_v33';
const route33=()=>location.pathname.replace(/^\/ranking-site\/?/,'').replace(/\/$/,'')||'home';
const reduced33=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
const saveData33=()=>navigator.connection?.saveData===true;
function safeGet33(k){try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}}
function safeSet33(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function esc33(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function applyPreferences33(){
 const html=document.documentElement;
 html.dataset.gclMotion=reduced33()?'reduced':'full';
 html.dataset.gclData=saveData33()?'save':'full';
 const state=safeGet33(GCLX33)||{};
 if(state.focusContrast)html.dataset.gclContrast='high';else delete html.dataset.gclContrast;
}

function mountProgress33(){
 if(document.getElementById('gcl-global-progress33'))return;
 const bar=document.createElement('div');bar.id='gcl-global-progress33';bar.setAttribute('aria-hidden','true');bar.innerHTML='<i></i>';document.body.appendChild(bar);
 let raf=0;const update=()=>{raf=0;const d=document.documentElement;const max=Math.max(1,d.scrollHeight-innerHeight);const p=Math.max(0,Math.min(1,scrollY/max));bar.style.setProperty('--gcl-progress',`${(p*100).toFixed(2)}%`)};
 addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(update)},{passive:true});update();
}

function mountSmartHeader33(){
 const header=document.querySelector('.gcl-header');if(!header||header.dataset.gclSmart==='1')return;header.dataset.gclSmart='1';
 let last=scrollY,raf=0;const update=()=>{raf=0;const now=scrollY;const delta=now-last;if(now<80||reduced33())header.classList.remove('gcl-header-away');else if(delta>8)header.classList.add('gcl-header-away');else if(delta<-6)header.classList.remove('gcl-header-away');last=now};
 addEventListener('scroll',()=>{if(!raf)raf=requestAnimationFrame(update)},{passive:true});
}

const navItems33=[
 ['Ranking','/ranking-site/ranking/','placar score posição líderes competição'],
 ['Awards','/ranking-site/awards/','prêmios nominees jurados temporada reconhecimento'],
 ['Community','/ranking-site/community/','membros hot seats feedback discussão missões'],
 ['Market','/ranking-site/services/','serviços especialistas implementação soluções'],
 ['Research','/ranking-site/blog/','pesquisa artigos inteligência metodologia estudos'],
 ['Minha área','/ranking-site/account/','conta dashboard assinatura auditorias perfil'],
 ['Analisar site','/ranking-site/','auditoria raio-x score conversão site']
];
let palette33=null;
function closePalette33(){if(!palette33)return;palette33.remove();palette33=null;document.body.classList.remove('gcl-palette-open33')}
function contextual33(){return [...document.querySelectorAll('h1,h2,h3')].slice(0,20).map((h,i)=>({label:(h.textContent||'').trim(),href:`#gcl-context-${i}`,keywords:(h.textContent||'').toLowerCase(),node:h})).filter(x=>x.label)}
function mountPalette33(){
 if(document.getElementById('gcl-spotlight-launch33'))return;
 const launch=document.createElement('button');launch.id='gcl-spotlight-launch33';launch.type='button';launch.setAttribute('aria-label','Abrir busca rápida da GCL');launch.innerHTML='<span>⌘K</span><b>Buscar</b>';document.body.appendChild(launch);launch.onclick=openPalette33;
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();palette33?closePalette33():openPalette33()}else if(e.key==='Escape'&&palette33)closePalette33()});
}
function openPalette33(){
 closePalette33();const contextual=contextual33();contextual.forEach((x,i)=>{x.node.id=x.node.id||`gcl-context-${i}`;x.href=`#${x.node.id}`});
 palette33=document.createElement('div');palette33.className='gcl-palette33-backdrop';palette33.innerHTML=`<section class="gcl-palette33" role="dialog" aria-modal="true" aria-labelledby="gcl-palette33-title"><header><span>GCL SPOTLIGHT</span><h2 id="gcl-palette33-title">Para onde você quer ir?</h2><button type="button" aria-label="Fechar busca">×</button></header><label><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" placeholder="Ranking, Awards, Community, score, artigo…" aria-label="Buscar na Global Conversion League"></label><div class="gcl-palette33-results" role="listbox"></div><footer><span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span></footer></section>`;
 document.body.appendChild(palette33);document.body.classList.add('gcl-palette-open33');
 const input=palette33.querySelector('input'),results=palette33.querySelector('.gcl-palette33-results');let selected=0;
 const render=()=>{const q=input.value.trim().toLowerCase();const base=navItems33.map(([label,href,keywords])=>({label,href,keywords,type:'Área'}));const matches=[...base,...contextual.map(x=>({...x,type:'Nesta página'}))].filter(x=>!q||`${x.label} ${x.keywords}`.toLowerCase().includes(q)).slice(0,10);selected=Math.min(selected,Math.max(0,matches.length-1));results.innerHTML=matches.length?matches.map((x,i)=>`<a role="option" aria-selected="${i===selected}" class="${i===selected?'selected':''}" href="${esc33(x.href)}"><span>${esc33(x.type)}</span><b>${esc33(x.label)}</b><em>↗</em></a>`).join(''):'<p>Nenhum caminho encontrado. Tente outro termo.</p>';return matches};
 let matches=render();input.oninput=()=>{selected=0;matches=render()};input.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();selected=Math.min(selected+1,matches.length-1);matches=render()}else if(e.key==='ArrowUp'){e.preventDefault();selected=Math.max(selected-1,0);matches=render()}else if(e.key==='Enter'&&matches[selected]){e.preventDefault();const target=matches[selected];closePalette33();if(target.href.startsWith('#'))document.querySelector(target.href)?.scrollIntoView({behavior:reduced33()?'auto':'smooth',block:'start'});else location.href=target.href}};
 palette33.querySelector('header button').onclick=closePalette33;palette33.addEventListener('click',e=>{if(e.target===palette33)closePalette33()});results.addEventListener('mousemove',e=>{const a=e.target.closest('a');if(!a)return;const all=[...results.querySelectorAll('a')];selected=all.indexOf(a);all.forEach((x,i)=>{x.classList.toggle('selected',i===selected);x.setAttribute('aria-selected',String(i===selected))})});input.focus();
}

function routeLabel33(r){return ({ranking:'Ranking',awards:'Awards',community:'Community',services:'GCL Market',blog:'Research',account:'Minha área',dashboard:'Dashboard'})[r]||'Global Conversion League'}
function rememberRoute33(){
 const current=route33();const old=safeGet33(GCL_LAST33);if(current==='home'&&old?.route&&old.route!=='home'&&Date.now()-Number(old.at||0)<1000*60*60*24*14)mountResume33(old);
 if(current!=='home')safeSet33(GCL_LAST33,{route:current,at:Date.now(),path:location.pathname+location.search});
}
function mountResume33(last){
 if(document.getElementById('gcl-resume33'))return;let anchor=document.querySelector('.gcl-page-head');if(!anchor)return;const box=document.createElement('aside');box.id='gcl-resume33';box.setAttribute('aria-label','Continuar de onde parou');box.innerHTML=`<span>CONTINUE SUA TEMPORADA</span><div><b>Voltar para ${esc33(routeLabel33(last.route))}</b><small>Seu último caminho foi salvo apenas neste navegador.</small></div><a href="${esc33(last.path)}">Continuar →</a><button type="button" aria-label="Dispensar sugestão">×</button>`;anchor.after(box);box.querySelector('button').onclick=()=>{safeSet33(GCL_LAST33,{route:'home',at:Date.now(),path:'/ranking-site/'});box.remove()};
}

function styles33(){if(document.getElementById('gcl-experience33-style'))return;const s=document.createElement('style');s.id='gcl-experience33-style';s.textContent=`
#gcl-global-progress33{position:fixed;inset:0 0 auto 0;height:2px;z-index:1000010;pointer-events:none;background:rgba(255,255,255,.035)}#gcl-global-progress33 i{display:block;width:var(--gcl-progress,0%);height:100%;background:#7bf0ab;box-shadow:0 0 14px rgba(123,240,171,.5);transition:width .08s linear}.gcl-header{transition:transform .28s ease,background .28s ease}.gcl-header.gcl-header-away{transform:translateY(-110%)}#gcl-spotlight-launch33{position:fixed;right:18px;bottom:18px;z-index:99990;display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.1);background:rgba(7,12,9,.88);backdrop-filter:blur(14px);color:#a9b7b0;border-radius:999px;padding:8px 11px;box-shadow:0 12px 40px rgba(0,0,0,.3);cursor:pointer}#gcl-spotlight-launch33 span{font-size:8px;border:1px solid rgba(255,255,255,.12);border-radius:5px;padding:3px 5px;color:#7ef1ac}#gcl-spotlight-launch33 b{font-size:10px;font-weight:650}.gcl-palette33-backdrop{position:fixed;inset:0;z-index:1000012;background:rgba(0,0,0,.74);backdrop-filter:blur(16px);display:grid;place-items:start center;padding:12vh 18px 30px}.gcl-palette33{width:min(720px,100%);background:#09100c;border:1px solid rgba(255,255,255,.13);box-shadow:0 30px 110px rgba(0,0,0,.65);border-radius:22px;overflow:hidden}.gcl-palette33 header{padding:22px 24px 14px;position:relative}.gcl-palette33 header>span{font-size:8px;letter-spacing:.2em;color:#75eda4}.gcl-palette33 h2{font-size:clamp(24px,5vw,38px);margin:5px 36px 0 0}.gcl-palette33 header button{position:absolute;right:14px;top:12px;border:0;background:transparent;color:#87938d;font-size:30px;cursor:pointer}.gcl-palette33>label{margin:0 18px 12px;display:flex;align-items:center;gap:9px;background:#050806;border:1px solid rgba(255,255,255,.1);padding:12px 14px}.gcl-palette33>label span{font-size:20px;color:#6deaa0}.gcl-palette33 input{width:100%;border:0;outline:0;background:transparent;color:white;font:inherit;font-size:14px}.gcl-palette33-results{max-height:min(48vh,430px);overflow:auto;padding:0 10px 10px}.gcl-palette33-results a{display:grid;grid-template-columns:92px 1fr 24px;gap:10px;align-items:center;text-decoration:none;color:#cad5cf;padding:11px 12px;border-radius:11px}.gcl-palette33-results a span{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:#68766f}.gcl-palette33-results a b{font-size:13px}.gcl-palette33-results a em{font-style:normal;color:#708078}.gcl-palette33-results a.selected{background:rgba(121,239,169,.08);color:#93f4b8}.gcl-palette33-results p{color:#758179;font-size:12px;padding:18px}.gcl-palette33 footer{display:flex;gap:13px;padding:11px 20px;border-top:1px solid rgba(255,255,255,.07);color:#68756e;font-size:9px}.gcl-palette-open33{overflow:hidden}#gcl-resume33{max-width:1280px;margin:-12px auto 24px;padding:13px 16px;border:1px solid rgba(121,239,169,.14);background:rgba(121,239,169,.035);display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center}#gcl-resume33>span{font-size:8px;letter-spacing:.14em;color:#79efaa}#gcl-resume33 div{display:grid;gap:2px}#gcl-resume33 b{font-size:12px}#gcl-resume33 small{font-size:9px;color:#718079}#gcl-resume33 a{color:#8cf1b4;text-decoration:none;font-size:10px;font-weight:800}#gcl-resume33 button{border:0;background:transparent;color:#69776f;font-size:18px;cursor:pointer}[data-gcl-data="save"] .gcl-bg,[data-gcl-motion="reduced"] .gcl-bg{display:none!important}[data-gcl-motion="reduced"] *,[data-gcl-motion="reduced"] *::before,[data-gcl-motion="reduced"] *::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}[data-gcl-contrast="high"]{filter:contrast(1.08)}@media(max-width:700px){#gcl-spotlight-launch33{right:12px;bottom:12px}#gcl-spotlight-launch33 b{display:none}.gcl-palette33-backdrop{padding-top:7vh}.gcl-palette33-results a{grid-template-columns:72px 1fr 18px}#gcl-resume33{margin-inline:12px;grid-template-columns:1fr auto}#gcl-resume33>span{grid-column:1/-1}#gcl-resume33 a{grid-column:1}#gcl-resume33 button{grid-column:2;grid-row:2/4}}@media(prefers-reduced-motion:reduce){.gcl-header,#gcl-global-progress33 i{transition:none!important}}
`;document.head.appendChild(s)}

function boot33(){applyPreferences33();styles33();mountProgress33();mountPalette33();rememberRoute33();mountSmartHeader33();const o=new MutationObserver(()=>mountSmartHeader33());o.observe(document.documentElement,{childList:true,subtree:true})}
boot33();
