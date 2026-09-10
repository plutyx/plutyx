import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const U=Deno.env.get('SUPABASE_URL')!;
const K=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowed=new Set([
  'https://plutyx.com',
  'https://www.plutyx.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);
const MAX_BODY_BYTES=8192;

function cors(o:string|null){
  const origin=o&&allowed.has(o)?o:'https://plutyx.com';
  return {
    'access-control-allow-origin':origin,
    'access-control-allow-methods':'POST,OPTIONS',
    'access-control-allow-headers':'content-type,authorization',
    'vary':'Origin',
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff'
  };
}
function out(o:string|null,b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:cors(o)});}
async function rpc(name:string,body:unknown,token:string){
  const r=await fetch(`${U}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:K,authorization:token,'content-type':'application/json'},
    body:JSON.stringify(body||{})
  });
  const t=await r.text();let d:any=null;
  try{d=t?JSON.parse(t):null}catch{d={raw:t.slice(0,400)}}
  if(!r.ok){const e=new Error(String(d?.message||d?.error||`rpc_${r.status}`));(e as any).status=r.status;throw e;}
  return d;
}

Deno.serve(async req=>{
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(origin&&!allowed.has(origin))return out(origin,{error:'origin_not_allowed'},403);
  if(req.method!=='POST')return out(origin,{error:'method_not_allowed'},405);
  const contentLength=Number(req.headers.get('content-length')||0);
  if(contentLength>MAX_BODY_BYTES)return out(origin,{error:'payload_too_large'},413);
  const token=req.headers.get('authorization')||'';
  if(!token.toLowerCase().startsWith('bearer '))return out(origin,{error:'authentication_required'},401);
  try{
    const raw=await req.text();
    if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return out(origin,{error:'payload_too_large'},413);
    let b:any={};
    try{b=raw?JSON.parse(raw):{}}catch{return out(origin,{error:'invalid_payload'},400);}
    const action=String(b?.action||'status');
    if(action==='status')return out(origin,{ok:true,result:await rpc('gcl_monitoring_status',{},token)});
    if(action==='update'){
      const id=String(b?.domain_id||'');
      const cadence=String(b?.cadence||'weekly');
      const enabled=b?.enabled!==false;
      if(!/^[0-9a-f-]{36}$/i.test(id))return out(origin,{error:'invalid_domain_id'},400);
      return out(origin,{ok:true,result:await rpc('gcl_upsert_monitoring_schedule',{p_domain_id:id,p_cadence:cadence,p_enabled:enabled},token)});
    }
    return out(origin,{error:'unknown_action'},400);
  }catch(e){
    const m=e instanceof Error?e.message:String(e);
    if(m.includes('verified_domain_required'))return out(origin,{error:'verified_domain_required'},403);
    if(m.includes('ranking_access_required'))return out(origin,{error:'ranking_access_required'},403);
    if(m.includes('enterprise_required_for_daily'))return out(origin,{error:'enterprise_required_for_daily'},403);
    if(m.includes('authentication_required'))return out(origin,{error:'authentication_required'},401);
    if(m.includes('invalid_cadence'))return out(origin,{error:'invalid_cadence'},400);
    console.error('gcl-monitoring-api',m);
    return out(origin,{error:'request_failed'},500);
  }
});