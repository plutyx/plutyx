import fs from 'node:fs';
import dns from 'node:dns/promises';
import { performance } from 'node:perf_hooks';

const API=process.env.GCL_PUBLIC_API||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api';
const PROD=(process.env.GCL_PROD_BASE||'https://plutyx.com/ranking-site').replace(/\/$/,'');
const READ_REQUESTS=Math.max(10,Math.min(Number(process.env.GCL_LOAD_READ_REQUESTS||100),300));
const READ_CONCURRENCY=Math.max(1,Math.min(Number(process.env.GCL_LOAD_READ_CONCURRENCY||12),30));
const QUALIFY_REQUESTS=Math.max(0,Math.min(Number(process.env.GCL_LOAD_QUALIFY_REQUESTS||12),20));
const QUALIFY_CONCURRENCY=Math.max(1,Math.min(Number(process.env.GCL_LOAD_QUALIFY_CONCURRENCY||4),10));
const HOSTINGER_REQUESTS=Math.max(8,Math.min(Number(process.env.GCL_LOAD_HOSTINGER_REQUESTS||48),160));
const HOSTINGER_CONCURRENCY=Math.max(1,Math.min(Number(process.env.GCL_LOAD_HOSTINGER_CONCURRENCY||8),20));
const RUN=process.env.GITHUB_RUN_ID||String(Date.now());

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(arr,p)=>{if(!arr.length)return null;const s=[...arr].sort((a,b)=>a-b);return Math.round(s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))]);};
const round=n=>Number(n.toFixed(3));
const errorInfo=e=>({message:String(e?.message||e),cause_message:e?.cause?.message?String(e.cause.message):null,cause_code:e?.cause?.code?String(e.cause.code):null,cause_errno:e?.cause?.errno??null,cause_syscall:e?.cause?.syscall?String(e.cause.syscall):null,cause_hostname:e?.cause?.hostname?String(e.cause.hostname):null});

function summarize(name,rows,elapsedMs=null){
  const lat=rows.map(x=>x.ms);
  const codes={};
  for(const r of rows)codes[r.status]=(codes[r.status]||0)+1;
  const ok=rows.filter(x=>x.ok).length;
  const sampleErrors=rows.filter(x=>!x.ok).slice(0,3).map(x=>({status:x.status,path:x.path||null,action:x.action||null,error:x.error||null}));
  return {
    name,count:rows.length,ok,error:rows.length-ok,
    error_rate:rows.length?round((rows.length-ok)/rows.length):0,
    network_error_count:rows.filter(x=>!x.ok&&x.status===0).length,
    rate_limited_429:rows.filter(x=>x.status===429).length,
    p50_ms:percentile(lat,.50),p95_ms:percentile(lat,.95),p99_ms:percentile(lat,.99),max_ms:lat.length?Math.max(...lat):null,
    elapsed_ms:elapsedMs==null?null:Math.round(elapsedMs),
    throughput_rps:elapsedMs&&rows.length?round(rows.length/(elapsedMs/1000)):null,
    status_codes:codes,sample_errors:sampleErrors,
  };
}

function groupSummaries(rows,key){
  const groups=new Map();
  for(const row of rows){const k=String(row[key]??'unknown');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}
  return Object.fromEntries([...groups.entries()].map(([k,v])=>[k,summarize(k,v)]));
}

async function post(action,extra={},i=0){
  const start=performance.now();let status=0;
  try{
    const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','user-agent':'gcl-load-smoke/2.1','x-gcl-load-run':RUN},body:JSON.stringify({action,...extra})});
    status=r.status;await r.arrayBuffer();return{ok:r.ok,status,ms:Math.round(performance.now()-start),action,i};
  }catch(e){return{ok:false,status,ms:Math.round(performance.now()-start),action,i,error:errorInfo(e)}}
}

async function get(url,i=0){
  const start=performance.now();let status=0;const path=new URL(url).pathname;
  try{
    const r=await fetch(url,{headers:{'user-agent':'gcl-load-smoke/2.1','x-gcl-load-run':RUN}});
    status=r.status;await r.arrayBuffer();return{ok:r.ok,status,ms:Math.round(performance.now()-start),url,path,i};
  }catch(e){return{ok:false,status,ms:Math.round(performance.now()-start),url,path,i,error:errorInfo(e)}}
}

async function pool(items,concurrency,fn){const out=new Array(items.length);let next=0;async function worker(){while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));return out;}
async function measured(fn){const start=performance.now();const rows=await fn();return{rows,elapsedMs:performance.now()-start};}
async function resolveHost(host){try{return{ok:true,addresses:await dns.lookup(host,{all:true})};}catch(e){return{ok:false,error:errorInfo(e)}}}

const actions=['home','health','queue_health','offers','nominees'];
const readRun=await measured(()=>pool(Array.from({length:READ_REQUESTS},(_,i)=>actions[i%actions.length]),READ_CONCURRENCY,(action,i)=>post(action,action==='nominees'?{limit:10}:{},i)));
await sleep(750);
const qualifyRun=QUALIFY_REQUESTS?await measured(()=>pool(Array.from({length:QUALIFY_REQUESTS},(_,i)=>i),QUALIFY_CONCURRENCY,(n,i)=>post('qualify',{url:`https://example.com/?gcl_load=${RUN}_${n}`},i))):{rows:[],elapsedMs:0};
await sleep(750);

const prodHost=new URL(PROD).hostname;
const networkDiagnostics={prod_host:prodHost,dns:await resolveHost(prodHost)};
const routes=['/','/ranking/','/awards/','/community/','/services/','/blog/','/about/','/account/'];
const hostRun=await measured(()=>pool(Array.from({length:HOSTINGER_REQUESTS},(_,i)=>`${PROD}${routes[i%routes.length]}`),HOSTINGER_CONCURRENCY,(url,i)=>get(url,i)));

const publicRead=summarize('public_read',readRun.rows,readRun.elapsedMs);
const qualify=summarize('qualify',qualifyRun.rows,qualifyRun.elapsedMs);
const hostinger=summarize('hostinger',hostRun.rows,hostRun.elapsedMs);
const hostingerRunnerBlocked=hostinger.count>0&&hostinger.network_error_count===hostinger.count;

const result={
  captured_at:new Date().toISOString(),run_id:RUN,test_version:'2.1',
  config:{read_requests:READ_REQUESTS,read_concurrency:READ_CONCURRENCY,qualify_requests:QUALIFY_REQUESTS,qualify_concurrency:QUALIFY_CONCURRENCY,hostinger_requests:HOSTINGER_REQUESTS,hostinger_concurrency:HOSTINGER_CONCURRENCY},
  network_diagnostics:networkDiagnostics,
  public_read:publicRead,public_read_by_action:groupSummaries(readRun.rows,'action'),qualify,
  hostinger:{...hostinger,runner_network_blocked:hostingerRunnerBlocked},
  hostinger_by_route:groupSummaries(hostRun.rows,'path'),
  admission_envelope:{public_read_concurrency:READ_CONCURRENCY,qualify_concurrency:QUALIFY_CONCURRENCY,static_route_concurrency:HOSTINGER_CONCURRENCY,heavy_full_scan_concurrency:'not_exercised'},
  note:'Controlled production admission/read-path load smoke. It intentionally does not enqueue paid full scans, mutate memberships, vote, charge cards, or claim heavy-worker capacity. A status=0 for every Hostinger request is classified as runner-network-blocked and must be validated from a second network vantage point.',
};
fs.writeFileSync('load-smoke-result.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));

const failures=[];
if(publicRead.error_rate>0)failures.push(`public_read error_rate ${publicRead.error_rate}`);
if(publicRead.rate_limited_429>0)failures.push(`public_read 429 ${publicRead.rate_limited_429}`);
if((publicRead.p95_ms??99999)>3000)failures.push(`public_read p95 ${publicRead.p95_ms}ms`);
if(!hostingerRunnerBlocked){if(hostinger.error_rate>0)failures.push(`hostinger error_rate ${hostinger.error_rate}`);if((hostinger.p95_ms??99999)>3500)failures.push(`hostinger p95 ${hostinger.p95_ms}ms`);}else{console.warn('HOSTINGER_RUNNER_NETWORK_BLOCKED',JSON.stringify(hostinger.sample_errors[0]||{}));}
if(QUALIFY_REQUESTS){if(qualify.error_rate>0)failures.push(`qualify error_rate ${qualify.error_rate}`);if(qualify.rate_limited_429>0)failures.push(`qualify 429 ${qualify.rate_limited_429}`);if((qualify.p95_ms??99999)>5000)failures.push(`qualify p95 ${qualify.p95_ms}ms`);}
if(failures.length){console.error('LOAD_SMOKE_FAILED',failures.join(' | '));process.exit(1)}
console.log(hostingerRunnerBlocked?'LOAD_SMOKE_OK_WITH_EXTERNAL_NETWORK_BLOCK':'LOAD_SMOKE_OK');
