import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FUNCTION_SLUG='cozinha360-entitlements-v34'
const anon=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
const j=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors})
const fail=(detail:string,status=400)=>j({detail},status)

const allFeatures=['core','system360','cash','connections','control','execution','playbook','vitrine','growth','kitchen','crm','margin','direct']
const freeFeatures=['core','kitchen','direct']
const featuresFor=(plan:string)=>plan==='free'?freeFeatures:allFeatures

function routePath(req:Request){const p=new URL(req.url).pathname,marker='/'+FUNCTION_SLUG;const i=p.indexOf(marker);return i>=0?(p.slice(i+marker.length)||'/'):p}
async function auth(req:Request){const h=req.headers.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;const {data,error}=await anon.auth.getUser(token);if(error||!data.user)return null;let {data:profile}=await admin.from('users').select('id,email,full_name').eq('auth_user_id',data.user.id).maybeSingle();if(!profile&&data.user.email){const r=await admin.from('users').select('id,email,full_name').ilike('email',data.user.email).maybeSingle();profile=r.data}return profile||null}
async function member(userId:number,businessId:number){const {data}=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle();return data||null}

async function entitlement(businessId:number){
  const r=await admin.from('business_billing_accounts').select('business_id,provider,plan_key,status,current_period_end,cancel_at_period_end,updated_at').eq('business_id',businessId).maybeSingle()
  if(r.error)throw r.error
  const row=r.data
  if(!row){
    return {
      business_id:businessId,
      commercial_state:'candidate',
      enforcement_mode:'observe_only',
      billing_configured:false,
      provider:'none',
      plan_key:'candidate',
      status:'candidate',
      current_period_end:null,
      cancel_at_period_end:false,
      features:allFeatures,
      access_allowed:true,
      reason:'commercial_billing_not_activated',
      updated_at:null,
    }
  }
  const active=['candidate','free','trialing','active','past_due'].includes(row.status)
  return {
    business_id:businessId,
    commercial_state:row.provider==='none'?'candidate':'configured',
    enforcement_mode:'observe_only',
    billing_configured:row.provider!=='none',
    provider:row.provider,
    plan_key:row.plan_key,
    status:row.status,
    current_period_end:row.current_period_end,
    cancel_at_period_end:row.cancel_at_period_end,
    features:featuresFor(row.plan_key),
    access_allowed:active,
    reason:active?'server_entitlement_active':'server_entitlement_inactive',
    updated_at:row.updated_at,
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  const path=routePath(req),method=req.method
  try{
    if(path==='/livez'&&method==='GET')return j({ok:true,service:'cozinha360-entitlements-v34',version:'3.4.0'})
    if(path==='/readyz'&&method==='GET'){
      const [a,b]=await Promise.all([
        admin.from('business_billing_accounts').select('business_id',{head:true,count:'exact'}),
        admin.from('billing_events').select('id',{head:true,count:'exact'}),
      ])
      return a.error||b.error?fail('database_not_ready',503):j({ok:true,database:'ready',event_ledger:'ready',version:'3.4.0'})
    }
    const user:any=await auth(req)
    if(!user)return fail('Sessão inválida',401)
    const m=path.match(/^\/businesses\/(\d+)\/entitlements$/)
    if(!m)return fail('Rota não encontrada',404)
    if(method!=='GET')return fail('Método não permitido',405)
    const bid=Number(m[1])
    if(!await member(user.id,bid))return fail('Sem acesso',403)
    return j(await entitlement(bid))
  }catch(e){console.error('entitlements-v34',e);return fail('Erro interno',500)}
})