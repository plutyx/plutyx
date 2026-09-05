import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROD_ORIGIN = 'https://cozinha-360-os.netlify.app'
const allowedOrigins = new Set([PROD_ORIGIN, 'http://localhost:5173', 'http://localhost:3000'])

const anon = createClient(SUPABASE_URL, ANON_KEY, { auth:{persistSession:false,autoRefreshToken:false} })
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{persistSession:false,autoRefreshToken:false} })

function cors(req:Request){
  const origin=req.headers.get('Origin')||''
  return {
    'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:PROD_ORIGIN,
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
    'Content-Type':'application/json; charset=utf-8',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
  }
}
const j=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)})
const fail=(req:Request,detail:string,status=400)=>j(req,{detail},status)
const json=async(req:Request)=>{try{return await req.json()}catch{return {}}}
const clean=(v:unknown,max=160)=>String(v??'').trim().slice(0,max)

function routePath(req:Request){
  const path=new URL(req.url).pathname
  const marker='/cozinha360-direct-v17'
  const i=path.indexOf(marker)
  return i>=0?(path.slice(i+marker.length)||'/'):path
}

async function authUser(req:Request){
  const h=req.headers.get('Authorization')||''
  const token=h.startsWith('Bearer ')?h.slice(7):''
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
  const {data:existing,error:ee}=await admin.from('users').select('id,email,full_name,auth_user_id').ilike('email',email).maybeSingle()
  if(ee)throw ee
  if(!existing)return null
  const {data:updated,error:ue}=await admin.from('users').update({auth_user_id:auth.id}).eq('id',existing.id).select('id,email,full_name,auth_user_id').single()
  if(ue)throw ue
  return updated
}
async function membership(userId:number,businessId:number,roles=['owner','admin','member']){
  const {data,error}=await admin.from('memberships').select('role').eq('user_id',userId).eq('business_id',businessId).maybeSingle()
  if(error)throw error
  return data&&roles.includes(data.role)?data:null
}

async function publicStore(slug:string){
  const {data:store,error}=await admin.from('storefronts')
    .select('id,business_id,brand_id,channel_id,slug,display_name,active')
    .ilike('slug',slug).eq('active',true).maybeSingle()
  if(error)throw error
  if(!store)return null
  const [{data:business},{data:brand},{data:products,error:pe},{data:prices,error:pre}] = await Promise.all([
    admin.from('businesses').select('id,name,city,currency').eq('id',store.business_id).maybeSingle(),
    store.brand_id?admin.from('brands').select('id,name').eq('id',store.brand_id).maybeSingle():Promise.resolve({data:null}),
    admin.from('products').select('id,name,category,brand_id').eq('business_id',store.business_id).eq('soft_deleted',false).eq('active',true).order('name'),
    admin.from('product_channel_prices').select('product_id,sale_price_cents').eq('business_id',store.business_id).eq('channel_id',store.channel_id).gt('sale_price_cents',0),
  ])
  if(pe)throw pe;if(pre)throw pre
  const priceMap=new Map((prices||[]).map((x:any)=>[Number(x.product_id),Number(x.sale_price_cents)]))
  const visible=(products||[]).filter((p:any)=>(!store.brand_id||Number(p.brand_id)===Number(store.brand_id))&&priceMap.has(Number(p.id)))
    .map((p:any)=>({...p,sale_price_cents:priceMap.get(Number(p.id))}))
  return {storefront:store,business,brand,products:visible}
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
  const path=routePath(req)
  try{
    if(path==='/livez'&&req.method==='GET')return j(req,{ok:true,service:'cozinha360-direct',version:'1.7.0'})
    if(path==='/readyz'&&req.method==='GET'){
      const {error}=await admin.from('storefronts').select('id',{head:true,count:'exact'})
      return error?fail(req,'database_not_ready',503):j(req,{ok:true,database:'ready',version:'1.7.0'})
    }

    let m=path.match(/^\/store\/([a-z0-9-]{3,60})$/)
    if(m&&req.method==='GET'){
      const store=await publicStore(m[1])
      return store?j(req,store):fail(req,'Loja não encontrada',404)
    }
    if(m&&req.method==='POST'){
      const store=await publicStore(m[1])
      if(!store)return fail(req,'Loja não encontrada',404)
      const body:any=await json(req)
      const items=Array.isArray(body.items)?body.items.slice(0,20).map((x:any)=>({product_id:Number(x.product_id),quantity:Number(x.quantity||1)})):[]
      if(!items.length||items.some((x:any)=>!Number.isInteger(x.product_id)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>20))return fail(req,'Itens inválidos',422)
      const key=clean(body.client_order_key,100)
      if(key.length<8)return fail(req,'Identificador do pedido inválido',422)
      const a=body.attribution||{}
      const {data,error}=await admin.rpc('c360_create_direct_order',{
        p_slug:m[1],p_client_order_key:key,p_items:items,
        p_customer_name:clean(body.customer_name,160),p_phone:clean(body.phone,40),p_email:clean(body.email,320),
        p_consent_marketing:Boolean(body.consent_marketing),p_session_key:clean(a.session_key,120)||null,
        p_referrer:clean(a.referrer,500)||null,p_utm_source:clean(a.utm_source,120)||null,p_utm_medium:clean(a.utm_medium,120)||null,
        p_utm_campaign:clean(a.utm_campaign,160)||null,p_utm_content:clean(a.utm_content,160)||null,p_utm_term:clean(a.utm_term,160)||null,
        p_gclid:clean(a.gclid,220)||null,p_fbclid:clean(a.fbclid,220)||null,p_ttclid:clean(a.ttclid,220)||null,
      })
      if(error){
        const msg=String(error.message||'')
        if(msg.includes('PRODUCT_PRICE_NOT_CONFIGURED'))return fail(req,'Preço indisponível',409)
        if(msg.includes('PRODUCT_NOT'))return fail(req,'Produto indisponível',409)
        if(msg.includes('CLIENT_ORDER_KEY'))return fail(req,'Identificador do pedido inválido',422)
        throw error
      }
      return j(req,data,201)
    }

    const auth=await authUser(req)
    if(!auth)return fail(req,'Sessão inválida',401)
    const user=await profile(auth)
    if(!user)return fail(req,'Perfil não encontrado',403)

    m=path.match(/^\/businesses\/(\d+)\/storefronts$/)
    if(m&&req.method==='GET'){
      const bid=Number(m[1]);if(!await membership(Number(user.id),bid))return fail(req,'Sem acesso',403)
      const {data,error}=await admin.from('storefronts').select('*,brands(name),channels(name)').eq('business_id',bid).order('created_at')
      if(error)throw error
      return j(req,data||[])
    }
    if(m&&req.method==='POST'){
      const bid=Number(m[1]);if(!await membership(Number(user.id),bid,['owner','admin']))return fail(req,'Somente owner/admin',403)
      const body:any=await json(req);const slug=clean(body.slug,60).toLowerCase();const name=clean(body.display_name,160)
      if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug))return fail(req,'Slug inválido: use letras minúsculas, números e hífen',422)
      if(name.length<2)return fail(req,'Nome da loja inválido',422)
      let channelId=Number(body.channel_id||0)
      if(channelId){
        const {data:ch}=await admin.from('channels').select('id').eq('id',channelId).eq('business_id',bid).maybeSingle();if(!ch)return fail(req,'Canal inválido',422)
      }else{
        const {data:existing}=await admin.from('channels').select('id').eq('business_id',bid).ilike('name','Pedido direto').maybeSingle()
        if(existing)channelId=Number(existing.id)
        else{
          const {data:created,error:ce}=await admin.from('channels').insert({business_id:bid,name:'Pedido direto',fee_bps:0,fixed_fee_cents:0,delivery_cents:0,promo_cents:0,media_cents:0,traffic_active:false}).select('id').single()
          if(ce)throw ce;channelId=Number(created.id)
        }
      }
      const brandId=body.brand_id?Number(body.brand_id):null
      if(brandId){const {data:b}=await admin.from('brands').select('id').eq('id',brandId).eq('business_id',bid).eq('soft_deleted',false).maybeSingle();if(!b)return fail(req,'Marca inválida',422)}
      const {data,error}=await admin.from('storefronts').insert({business_id:bid,brand_id:brandId,channel_id:channelId,slug,display_name:name,active:body.active!==false}).select('*').single()
      if(error){if(String(error.message).toLowerCase().includes('duplicate'))return fail(req,'Esse endereço de loja já está em uso',409);throw error}
      await admin.from('audit_logs').insert({business_id:bid,actor_user_id:user.id,action:'storefront.created',entity_type:'storefront',entity_id:String(data.id),payload_json:JSON.stringify({slug,channel_id:channelId,brand_id:brandId})})
      return j(req,data,201)
    }

    m=path.match(/^\/businesses\/(\d+)\/storefronts\/(\d+)$/)
    if(m&&req.method==='PATCH'){
      const bid=Number(m[1]),sid=Number(m[2]);if(!await membership(Number(user.id),bid,['owner','admin']))return fail(req,'Somente owner/admin',403)
      const body:any=await json(req);const patch:any={updated_at:new Date().toISOString()}
      if(body.display_name!==undefined){const name=clean(body.display_name,160);if(name.length<2)return fail(req,'Nome inválido',422);patch.display_name=name}
      if(body.active!==undefined)patch.active=Boolean(body.active)
      if(body.slug!==undefined){const slug=clean(body.slug,60).toLowerCase();if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug))return fail(req,'Slug inválido',422);patch.slug=slug}
      const {data,error}=await admin.from('storefronts').update(patch).eq('id',sid).eq('business_id',bid).select('*').maybeSingle()
      if(error){if(String(error.message).toLowerCase().includes('duplicate'))return fail(req,'Esse endereço de loja já está em uso',409);throw error}
      return data?j(req,data):fail(req,'Loja não encontrada',404)
    }

    m=path.match(/^\/businesses\/(\d+)\/attribution$/)
    if(m&&req.method==='GET'){
      const bid=Number(m[1]);if(!await membership(Number(user.id),bid))return fail(req,'Sem acesso',403)
      const raw=Number(new URL(req.url).searchParams.get('days')||30);const days=Math.max(1,Math.min(365,Number.isFinite(raw)?Math.trunc(raw):30))
      const {data,error}=await admin.rpc('c360_campaign_attribution',{p_business_id:bid,p_days:days});if(error)throw error
      const rows=(data||[]) as any[]
      const summary={orders:rows.reduce((a,x)=>a+Number(x.orders||0),0),revenue_cents:rows.reduce((a,x)=>a+Number(x.revenue_cents||0),0),media_cost_cents:rows.reduce((a,x)=>a+Number(x.media_cost_cents||0),0),contribution_after_media_cents:rows.reduce((a,x)=>a+Number(x.contribution_after_media_cents||0),0)}
      return j(req,{days,summary,campaigns:rows})
    }

    return fail(req,'Rota não encontrada',404)
  }catch(error){
    console.error('cozinha360-direct edge error',error)
    return fail(req,'Erro interno',500)
  }
})
