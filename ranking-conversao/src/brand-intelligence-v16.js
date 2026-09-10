function brand16(){
 document.querySelectorAll('a[href="/ranking-site/about/"]').forEach(a=>{if(a.textContent?.trim()==='GCL Labs')a.textContent='GCL Intelligence'});
 document.querySelectorAll('.gcl-footer span').forEach(x=>{if((x.textContent||'').includes('Labs'))x.textContent=(x.textContent||'').replace('Labs','Intelligence')});
 const path=location.pathname.replace(/\/$/,'');
 if(path==='/ranking-site/about'){
   const head=document.querySelector('.gcl-page-head');
   const eye=head?.querySelector(':scope > span');const h=head?.querySelector('h1');const p=head?.querySelector('p');
   if(eye)eye.textContent='GCL INTELLIGENCE';
   if(h)h.textContent='A inteligência e a metodologia por trás da competição';
   if(p)p.textContent='Benchmark, Evidence OS, metodologia versionada e pesquisa aplicada para transformar sinais de websites em decisões comparáveis — sem confundir score com taxa real de conversão.';
   document.querySelectorAll('.gcl-about-copy div').forEach(row=>{const b=row.querySelector('b');if(b?.textContent==='GCL Labs'){b.textContent='GCL Intelligence';const s=row.querySelector('span');if(s)s.textContent='benchmark, Evidence OS, metodologia e pesquisa aplicada'}});
 }
 if(path==='/ranking-site/blog'){
   const eye=document.querySelector('.gcl-page-head > span');if(eye?.textContent?.includes('GCL LABS'))eye.textContent='GCL INTELLIGENCE · RESEARCH';
   document.querySelectorAll('.gcl-empty span').forEach(x=>{if((x.textContent||'').includes('GCL Labs'))x.textContent=(x.textContent||'').replace('GCL Labs','GCL Intelligence')});
 }
}
const b16=new MutationObserver(brand16);b16.observe(document.documentElement,{childList:true,subtree:true});brand16();
