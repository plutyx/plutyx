import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROD_ORIGIN = 'https://cozinha-360-os.netlify.app'
const allowedOrigins = new Set([PROD_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'])

const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession:false, autoRefreshToken:false } })
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession:false, autoRefreshToken:false } })

function cors(req:Request){
  const origin=req.headers.get('Origin')||''
  return {
    'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:PROD_ORIGIN,
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'GET,OPTIONS',
    'Content-Type':'application/json; charset=utf-8',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
  }
}
const j=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)})
const fail=(req:Request,detail:string,status=400)=>j(req,{detail},status)

function routePath(req:Request){
  const path=new URL(req.url).pathname
  const marker='/cozinha360-crm-v16'
  const i=path.indexOf(marker)
  return i>=0?(path.slice(i+marker.length)||'/'):path
}

async function authUser(req:Request){
  const header=req.headers.get('Authorization')||''
  const token=header.startsWith('Bearer ')?header.slice(7):''
  if(!token)return null
  const {data,error}=await anon.auth.getUser(token)
  return error||!data.user?null:data.user
}

async function profile(auth:any){
  const {data,error}=await admin.from('users').select('id,email,full_name,auth_user_id').eq('auth_user_id',auth.id).maybeSingle()
  if(error)throw error
  if(data)return data
  const email=String(auth.email||'').toLowerCase()
  if(!email)return null
  const {data:existing,error:existingError}=await admin.from('users').select('id,email,full_name,auth_user_id').ilike('email',email).maybeSingle()
  if(existingError)throw existingError
  if(!existing)return null
  const {data:updated,error:updateError}=await admin.from('users').update({auth_user_id:auth.id}).eq('id',existing.id).select('id,email,full_name,auth_user_id').single()
  if(updateError)throw updateError
  return updated
}

async function membership(userId:number,businessId:number){
  const {data,error}=await admin.from('memberships').select('role').eq('user_id',userId).eq('business_id',businessId).maybeSingle()
  if(error)throw error
  return data
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
  const path=routePath(req)
  try{
    if(path==='/livez'&&req.method==='GET')return j(req,{ok:true,service:'cozinha360-crm',version:'1.6.0'})
    if(path==='/readyz'&&req.method==='GET'){
      const {error}=await admin.from('customers').select('id',{head:true,count:'exact'})
      return error?fail(req,'database_not_ready',503):j(req,{ok:true,database:'ready',version:'1.6.0'})
    }
    if(req.method!=='GET')return fail(req,'Método não permitido',405)

    const auth=await authUser(req)
    if(!auth)return fail(req,'Sessão inválida',401)
    const user=await profile(auth)
    if(!user)return fail(req,'Perfil não encontrado',403)

    const match=path.match(/^\/businesses\/(\d+)\/customer-lifecycle$/)
    if(!match)return fail(req,'Rota não encontrada',404)
    const businessId=Number(match[1])
    const member=await membership(Number(user.id),businessId)
    if(!member)return fail(req,'Sem acesso',403)

    const rawDays=Number(new URL(req.url).searchParams.get('dormant_days')||30)
    const dormantDays=Math.min(365,Math.max(7,Number.isFinite(rawDays)?Math.trunc(rawDays):30))
    const {data,error}=await admin.rpc('c360_customer_lifecycle',{p_business_id:businessId,p_dormant_days:dormantDays})
    if(error)throw error
    const rows=(data||[]) as any[]
    const summary={
      total:rows.length,
      new:rows.filter(x=>x.segment==='new').length,
      repeat:rows.filter(x=>x.segment==='repeat').length,
      dormant:rows.filter(x=>x.segment==='dormant').length,
      prospect:rows.filter(x=>x.segment==='prospect').length,
      contactable:rows.filter(x=>x.can_contact).length,
      dormant_contactable:rows.filter(x=>x.segment==='dormant'&&x.can_contact).length,
      revenue_cents:rows.reduce((a,x)=>a+Number(x.revenue_cents||0),0),
      contribution_cents:rows.reduce((a,x)=>a+Number(x.contribution_cents||0),0),
    }
    return j(req,{dormant_days:dormantDays,summary,customers:rows})
  }catch(error){
    console.error('cozinha360-crm edge error',error)
    return fail(req,'Erro interno',500)
  }
})
