const REPLACEMENTS=[
 ['SITES DE ALTA CONVERSÃO','GLOBAL CONVERSION LEAGUE'],
 ['by Plutyx · índice em calibração','Founding Season 2026 · Conversion Intelligence'],
 ['A assinatura compra presença; a posição continua determinada pela evidência do SAC.','A assinatura libera presença oficial; a posição continua determinada pela evidência GCL.'],
 ['Raio-X SAC','GCL Conversion Audit'],
 ['SAC Score','GCL Score'],
 ['SAC Awards','Global Conversion Awards'],
 ['Reconhecimento principal SAC','Reconhecimento principal GCL'],
 ['score oficial validado.','score GCL validado.'],
 ['GCL LABS · RESEARCH','GCL INTELLIGENCE · RESEARCH'],
 ['GCL LABS','GCL INTELLIGENCE'],
 ['GCL Labs','GCL Intelligence'],
 ['Labs · Market','Intelligence · Market'],
];
let queued=false;
function patch(){
 queued=false;
 if(!document.body)return;
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 const nodes=[];let n;
 while((n=w.nextNode()))nodes.push(n);
 for(const node of nodes){
   const v=node.nodeValue||'';let x=v;
   for(const [a,b] of REPLACEMENTS)if(x.includes(a))x=x.split(a).join(b);
   if(x!==v)node.nodeValue=x;
 }
 if(/^\/ranking-site\/?$/.test(location.pathname)){
   const b=document.querySelector('.s3-brand b');
   const s=document.querySelector('.s3-brand small');
   if(b&&b.textContent!=='GCL')b.textContent='GCL';
   if(s&&s.textContent!=='GLOBAL CONVERSION LEAGUE')s.textContent='GLOBAL CONVERSION LEAGUE';
 }
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(patch)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
schedule();
