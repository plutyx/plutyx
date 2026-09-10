import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const API=process.env.GCL_PUBLIC_API||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';
const PROD=(process.env.GCL_PROD_BASE||'https://plutyx.com/ranking-site').replace(/\/$/,'');
const READ_REQUESTS=Math.max(5,Math.min(Number(process.env.GCL_LOAD_READ_REQUESTS||40),200));
const READ_CONCURRENCY=Math.max(1,Math.min(Number(process.env.GCL_LOAD_READ_CONCURRENCY||8),25));
const QUALIFY_REQUESTS=Math.max(0,Math.min(Number(process.env.GCL_LOAD_QUALIFY_REQUESTS||8),15));
const QUALIFY_CONCURRENCY=Math.max(1,Math.min(Number(process.env.GCL_LOAD_QUALIFY_CONCURRENCY||4),10));
const RUN=process.env.GITHUB_RUN_ID||String(Date.now());

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(arr,p)=>{if(!arr.length)return null;const s=[...arr].sort((a,b)=>a-b);return Math.round(s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))]);};
function summarize(name,rows){const lat=rows.map(x=>x.ms);const codes={};for(const r of rows)codes[r.status]=(codes[r.status]||0)+1;const ok=rows.filter(x=>x.ok).length;return{name,count:rows.length,ok,error:rows.length-ok,error_rate:rows.length?Number(((rows.length-ok)/rows.length).toFixed(4)):0,p50_ms:percentile(lat,.50),p95_ms:percentile(lat,.95),p99_ms:percentile(lat,.99),max_ms:lat.length?Math.max(...lat):null,status_codes:codes};}
async function post(action,extra={},i=0){const start=performance.now();let status=0;try{const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','user-agent':'gcl-load-smoke/1.0'},body:JSON.stringify({action,...extra})});status=r.status;await r.arrayBuffer();return{ok:r.ok,status,ms:Math.round(performance.now()-start),action,i};}catch(e){return{ok:false,status,ms:Math.round(performance.now()-start),action,i,error:String(e?.message||e)}}}
async function get(url,i=0){const start=performance.now();let status=0;try{const r=await fetch(url,{headers:{'user-agent':'gcl-load-smoke/1.0'}});status=r.status;await r.arrayBuffer();return{ok:r.ok,status,ms:Math.round(performance.now()-start),url,i};}catch(e){return{ok:false,status,ms:Math.round(performance.now()-start),url,i,error:String(e?.message||e)}}}
async function pool(items,concurrency,fn){const out=new Array(items.length);let next=0;async function worker(){while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));return out;}

const actions=['home','health','queue_health','offers','nominees'];
const reads=await pool(Array.from({length:READ_REQUESTS},(_,i)=>actions[i%actions.length]),READ_CONCURRENCY,(action,i)=>post(action,action==='nominees'?{limit:10}:{},i));
await sleep(750);
const qualify=QUALIFY_REQUESTS?await pool(Array.from({length:QUALIFY_REQUESTS},(_,i)=>i),QUALIFY_CONCURRENCY,(n,i)=>post('qualify',{url:`https://example.com/?gcl_load=${RUN}_${n}`},i)):[];
const routes=['/','/ranking/','/awards/','/community/','/services/','/blog/','/about/','/account/'];
const host=await pool(Array.from({length:24},(_,i)=>`${PROD}${routes[i%routes.length]}`),8,(url,i)=>get(url,i));

const result={captured_at:new Date().toISOString(),run_id:RUN,config:{read_requests:READ_REQUESTS,read_concurrency:READ_CONCURRENCY,qualify_requests:QUALIFY_REQUESTS,qualify_concurrency:QUALIFY_CONCURRENCY,hostinger_requests:host.length},public_read:summarize('public_read',reads),qualify:summarize('qualify',qualify),hostinger:summarize('hostinger',host),note:'This is a controlled admission/read-path load smoke. It does not enqueue paid full scans or claim heavy-worker capacity.'};
fs.writeFileSync('load-smoke-result.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));

const failures=[];
if(result.public_read.error_rate>0)failures.push(`public_read error_rate ${result.public_read.error_rate}`);
if((result.public_read.p95_ms??99999)>3500)failures.push(`public_read p95 ${result.public_read.p95_ms}ms`);
if(result.hostinger.error_rate>0)failures.push(`hostinger error_rate ${result.hostinger.error_rate}`);
if((result.hostinger.p95_ms??99999)>4000)failures.push(`hostinger p95 ${result.hostinger.p95_ms}ms`);
if(QUALIFY_REQUESTS){if(result.qualify.error_rate>0)failures.push(`qualify error_rate ${result.qualify.error_rate}`);if((result.qualify.p95_ms??99999)>5000)failures.push(`qualify p95 ${result.qualify.p95_ms}ms`);}
if(failures.length){console.error('LOAD_SMOKE_FAILED',failures.join(' | '));process.exit(1)}
console.log('LOAD_SMOKE_OK');
