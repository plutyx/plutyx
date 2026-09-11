const GCL_REPORT_ENDPOINT='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';
const gclOriginalFetch=window.fetch.bind(window);
const gclReportCache=new Map();
const GCL_REPORT_CACHE_TTL_MS=15000;
window.__GCL_REPORT_CACHE_STATS={hits:0,misses:0};

function gclCachedResponse(entry){
  return new Response(entry.text,{status:entry.status,statusText:entry.statusText,headers:entry.headers});
}

window.fetch=async function(input,init){
  try{
    const url=typeof input==='string'?input:input?.url;
    const method=String(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
    if(url===GCL_REPORT_ENDPOINT&&method==='POST'&&typeof init?.body==='string'){
      const body=JSON.parse(init.body);
      if(body?.action==='report'&&body?.token){
        const key=String(body.token);const now=Date.now();const cached=gclReportCache.get(key);
        const reusable=cached&&(!cached.settledAt||now-cached.settledAt<GCL_REPORT_CACHE_TTL_MS);
        if(reusable){window.__GCL_REPORT_CACHE_STATS.hits++;const entry=await cached.promise;return gclCachedResponse(entry)}
        window.__GCL_REPORT_CACHE_STATS.misses++;
        const cacheEntry={createdAt:now,settledAt:null,promise:null};
        const promise=(async()=>{
          const res=await gclOriginalFetch(input,init);const text=await res.clone().text();
          const headers=new Headers();res.headers.forEach((v,k)=>headers.set(k,v));
          const entry={text,status:res.status,statusText:res.statusText,headers,createdAt:Date.now()};
          let keep=res.ok;try{const parsed=JSON.parse(text);keep=keep&&parsed?.result?.found===true}catch{keep=false}
          if(keep){
            const current=gclReportCache.get(key);
            if(current===cacheEntry)current.settledAt=entry.createdAt;
          }else{
            setTimeout(()=>{if(gclReportCache.get(key)===cacheEntry)gclReportCache.delete(key)},0);
          }
          return entry;
        })();
        cacheEntry.promise=promise;
        gclReportCache.set(key,cacheEntry);
        const entry=await promise;return gclCachedResponse(entry);
      }
    }
  }catch{}
  return gclOriginalFetch(input,init);
};

window.GCLReportCache={clear(token){if(token)gclReportCache.delete(String(token));else gclReportCache.clear()},stats(){return {...window.__GCL_REPORT_CACHE_STATS,size:gclReportCache.size}}};
