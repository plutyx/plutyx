const GCL_PREFETCH_REPORT_API='https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';
const gclPrefetchToken=new URLSearchParams(location.search).get('scan');
const gclPrefetchUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Start the expensive deep-report request as early as possible. report-cache-v12
// owns deduplication, so every later report consumer (main report, AI Analyst,
// radar, action center) joins this same in-flight Promise. A queued/incomplete
// scan is harmless: unsuccessful/not-found reports are not retained by cache.
if(gclPrefetchToken&&gclPrefetchUuid.test(gclPrefetchToken)){
  fetch(GCL_PREFETCH_REPORT_API,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action:'report',token:gclPrefetchToken}),
  }).then(response=>response.text()).catch(()=>{});
}
