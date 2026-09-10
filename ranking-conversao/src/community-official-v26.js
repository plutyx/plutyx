const PATH=/^\/ranking-site\/community\/?$/;
let scheduled=false;

function patchOfficialPosts(){
  scheduled=false;
  if(!PATH.test(location.pathname))return;
  document.querySelectorAll('.gcl-post').forEach(card=>{
    const meta=card.querySelector('header span');
    if(!meta)return;
    const txt=(meta.textContent||'').toLowerCase();
    const institutional=txt.includes('· official')||txt.includes('gcl oficial')||txt.includes('equipe oficial');
    if(!institutional)return;
    card.dataset.gclOfficial='1';
    const avatar=card.querySelector('header .avatar');
    if(avatar&&avatar.textContent!=='GCL')avatar.textContent='GCL';
    if(meta.textContent!=='OFICIAL · GCL INTELLIGENCE')meta.textContent='OFICIAL · GCL INTELLIGENCE';
    meta.classList.add('gcl-official-author');
    card.querySelector('.gcl-follow')?.remove();
  });
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(patchOfficialPosts)}

function styles(){
 if(document.getElementById('gcl-official-v26-style'))return;
 const s=document.createElement('style');
 s.id='gcl-official-v26-style';
 s.textContent=`
 .gcl-post[data-gcl-official="1"]{border-color:rgba(112,243,168,.18)!important;background:linear-gradient(145deg,rgba(112,243,168,.045),rgba(255,255,255,.018))!important;position:relative}
 .gcl-post[data-gcl-official="1"]:before{content:'GCL OFFICIAL';position:absolute;right:18px;top:18px;font-size:8px;letter-spacing:.16em;font-weight:900;color:#8dffc0;border:1px solid rgba(112,243,168,.25);padding:5px 7px;border-radius:999px;background:rgba(112,243,168,.07)}
 .gcl-post[data-gcl-official="1"] header .avatar{font-size:9px!important;letter-spacing:.04em!important;background:radial-gradient(circle at 30% 20%,#2f6b49,#0a1710)!important;color:#c9ffdf!important;border-color:rgba(112,243,168,.32)!important}
 .gcl-official-author{color:#77f5ae!important;font-size:9px!important;letter-spacing:.11em!important;font-weight:800!important}
 @media(max-width:720px){.gcl-post[data-gcl-official="1"]:before{top:12px;right:12px}}
 `;
 document.head.appendChild(s);
}

if(PATH.test(location.pathname)){
 styles();
 new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
 schedule();
}
