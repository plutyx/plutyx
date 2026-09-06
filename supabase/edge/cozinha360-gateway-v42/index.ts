const SUPABASE_URL=(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,'')
const SLUG='cozinha360-gateway-v42'
const allowedOrigins=new Set([
  'https://cozinha-360-os.netlify.app',
  'https://cozinha-360-os-v41.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
])
const services=new Set([
  'cozinha360-api-v2',
  'cozinha360-margin-v14',
  'cozinha360-crm-v16',
  'cozinha360-direct-v17',
  'cozinha360-integrations-v29',
  'cozinha360-profile-v31',
  'cozinha360-entitlements-v34',
  'cozinha360-autopilot-v37',
  'cozinha360-delivery-v40',
])
const forwardHeaders=['authorization','content-type','idempotency-key','x-client-info','apikey','x-request-id']

function cors(req:Request){
  const origin=req.headers.get('origin')||''
  const selected=allowedOrigins.has(origin)?origin:'https://cozinha-360-os-v41.onrender.com'
  return {
    'Access-Control-Allow-Origin':selected,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key, x-request-id',
    'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
  }
}
function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8'}})}
function route(req:Request){
  const path=new URL(req.url).pathname
  const marker='/'+SLUG
  const i=path.indexOf(marker)
  return i>=0?(path.slice(i+marker.length)||'/'):path
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
  if(!SUPABASE_URL)return json(req,{detail:'Gateway sem SUPABASE_URL'},503)
  const path=route(req)
  if(path==='/health'&&req.method==='GET')return json(req,{status:'ok',service:SLUG,version:'4.2.0',origin_policy:'multi-origin',targets:[...services]})
  const m=path.match(/^\/([a-z0-9-]+)(\/.*)?$/i)
  if(!m||!services.has(m[1]))return json(req,{detail:'Serviço não permitido'},404)
  const service=m[1],rest=m[2]||''
  const target=`${SUPABASE_URL}/functions/v1/${service}${rest}`
  const headers=new Headers()
  for(const name of forwardHeaders){const value=req.headers.get(name);if(value)headers.set(name,value)}
  headers.set('x-c360-gateway',SLUG)
  let payload:BodyInit|undefined
  if(!['GET','HEAD'].includes(req.method)){const bytes=await req.arrayBuffer();payload=bytes.byteLength?bytes:undefined}
  try{
    const upstream=await fetch(target,{method:req.method,headers,body:payload,redirect:'manual'})
    const outHeaders=new Headers(cors(req))
    const ct=upstream.headers.get('content-type');if(ct)outHeaders.set('Content-Type',ct)
    const location=upstream.headers.get('location');if(location)outHeaders.set('Location',location)
    const retry=upstream.headers.get('retry-after');if(retry)outHeaders.set('Retry-After',retry)
    const requestId=upstream.headers.get('x-request-id');if(requestId)outHeaders.set('X-Upstream-Request-Id',requestId)
    outHeaders.set('X-C360-Gateway',SLUG)
    return new Response(upstream.body,{status:upstream.status,headers:outHeaders})
  }catch(error){
    console.error('gateway-v42',service,error)
    return json(req,{detail:'Serviço temporariamente indisponível',service},502)
  }
})
