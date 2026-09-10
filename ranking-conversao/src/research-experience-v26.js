const IS_BLOG=()=>location.pathname.match(/^\/ranking-site\/blog\/?$/);
let scheduled=false;

function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function enhanceArticle(){
  scheduled=false;
  if(!IS_BLOG())return;
  const box=document.querySelector('.gcl-article .markdown');
  if(!box||box.dataset.gclResearch==='1')return;
  const raw=(box.textContent||'').trim();
  if(!raw)return;
  box.dataset.gclResearch='1';
  const words=raw.split(/\s+/).filter(Boolean).length;
  const mins=Math.max(1,Math.ceil(words/220));

  const meta=make('div','gcl-rx-meta');
  meta.append(make('span','',`${mins} min de leitura`),make('span','','GCL Intelligence'),make('span','','Aplicação prática'));
  box.before(meta);

  box.textContent='';
  const blocks=raw.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  for(const block of blocks){
    const step=block.match(/^(\d+)\.\s+([^.]*(?:\.[^.]*)?)(?:\s|$)([\s\S]*)$/);
    if(step){
      const article=make('article','gcl-rx-step');
      const num=make('b','gcl-rx-num',step[1].padStart(2,'0'));
      const content=make('div');
      const sentence=(step[2]||'').trim();
      const rest=(step[3]||'').trim();
      if(sentence)content.append(make('strong','',sentence));
      if(rest)content.append(make('p','',rest));
      article.append(num,content);box.append(article);continue;
    }
    box.append(make('p','gcl-rx-paragraph',block));
  }

  const cta=make('section','gcl-rx-cta');
  const kicker=make('span','','PRÓXIMA JOGADA');
  const h=make('h3','', 'Transforme leitura em uma melhoria verificável.');
  const p=make('p','', 'Faça a auditoria, escolha um gap, implemente e volte para medir a próxima versão do seu site.');
  const actions=make('div','gcl-rx-actions');
  const a=document.createElement('a');a.href='/ranking-site/';a.textContent='Descobrir meu GCL Score →';
  const b=document.createElement('a');b.href='/ranking-site/community/';b.textContent='Entrar na Community';b.className='secondary';
  actions.append(a,b);cta.append(kicker,h,p,actions);box.after(cta);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhanceArticle)}
function styles(){if(document.getElementById('gcl-rx-v26'))return;const s=document.createElement('style');s.id='gcl-rx-v26';s.textContent=`
.gcl-article{max-width:880px!important}.gcl-rx-meta{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 26px}.gcl-rx-meta span{font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:7px 10px;border-radius:999px;border:1px solid rgba(112,243,168,.16);background:rgba(112,243,168,.05);color:#9af8bf}.gcl-article .markdown[data-gcl-research="1"]{display:grid;gap:18px;white-space:normal!important;font-size:15px;line-height:1.8;color:#c9d3ce}.gcl-rx-paragraph{margin:0!important;font-size:15px!important;line-height:1.8!important;color:#c9d3ce!important}.gcl-rx-step{display:grid;grid-template-columns:46px 1fr;gap:16px;padding:18px 0;border-top:1px solid rgba(255,255,255,.07)}.gcl-rx-num{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(112,243,168,.08);color:#80f6af;border:1px solid rgba(112,243,168,.18);font-size:11px}.gcl-rx-step strong{display:block;color:#f0f6f2;font-size:16px;margin:4px 0 7px}.gcl-rx-step p{margin:0!important;color:#aebdb5!important;font-size:14px!important;line-height:1.7!important}.gcl-rx-cta{margin-top:34px;padding:24px;border-radius:20px;border:1px solid rgba(112,243,168,.18);background:radial-gradient(circle at 0 0,rgba(112,243,168,.11),transparent 45%),rgba(8,18,14,.9)}.gcl-rx-cta>span{font-size:9px;letter-spacing:.16em;color:#7af3aa}.gcl-rx-cta h3{font-size:24px;margin:8px 0}.gcl-rx-cta p{color:#9db0a6}.gcl-rx-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.gcl-rx-actions a{padding:11px 15px;border-radius:11px;background:#77efaa;color:#061009;text-decoration:none;font-size:12px;font-weight:900}.gcl-rx-actions a.secondary{background:transparent;color:#b8c9c0;border:1px solid rgba(255,255,255,.12)}@media(max-width:640px){.gcl-rx-step{grid-template-columns:38px 1fr}.gcl-rx-num{width:32px;height:32px}.gcl-rx-actions a{width:100%;text-align:center}}
`;document.head.appendChild(s)}
if(IS_BLOG()){styles();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});schedule()}
