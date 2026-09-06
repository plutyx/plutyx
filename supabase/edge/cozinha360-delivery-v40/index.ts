import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FUNCTION_SLUG='cozinha360-delivery-v40'
const anon=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS',
  'Content-Type':'application/json; charset=utf-8',
}
const j=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors})
const fail=(detail:string,status=400)=>j({detail},status)
const now=()=>new Date().toISOString()
const n=(v:unknown,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback

function pathOf(req:Request){const p=new URL(req.url).pathname,marker='/'+FUNCTION_SLUG;const i=p.indexOf(marker);return i>=0?(p.slice(i+marker.length)||'/'):p}
async function body(req:Request){try{return await req.json()}catch{return{}}}
function slugify(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)}
async function auth(req:Request){
  const h=req.headers.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):''
  if(!token)return null
  const {data,error}=await anon.auth.getUser(token);if(error||!data.user)return null
  let {data:profile}=await admin.from('users').select('id,email,full_name').eq('auth_user_id',data.user.id).maybeSingle()
  if(!profile&&data.user.email){const r=await admin.from('users').select('id,email,full_name').ilike('email',data.user.email).maybeSingle();profile=r.data}
  return profile||null
}
async function membership(userId:number,businessId:number,write=false){
  const {data,error}=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle()
  if(error||!data)return null
  if(write&&!['owner','admin'].includes(data.role))return null
  return data
}
async function assertBrand(businessId:number,brandId:number|null){
  if(!brandId)return true
  const {data}=await admin.from('brands').select('id').eq('id',brandId).eq('business_id',businessId).eq('soft_deleted',false).maybeSingle()
  return Boolean(data)
}

async function overview(businessId:number){
  const since=new Date(Date.now()-30*86400000).toISOString()
  const [brands,zones,drivers,loyalty,promos,storefronts,channels,orders]=await Promise.all([
    admin.from('brands').select('id,name,slug,active,primary_channel,sort_order').eq('business_id',businessId).eq('soft_deleted',false).order('sort_order').order('name'),
    admin.from('delivery_zones').select('*').eq('business_id',businessId).order('active',{ascending:false}).order('name'),
    admin.from('delivery_drivers').select('*').eq('business_id',businessId).order('active',{ascending:false}).order('name'),
    admin.from('loyalty_programs').select('*').eq('business_id',businessId).maybeSingle(),
    admin.from('delivery_promos').select('*').eq('business_id',businessId).order('created_at',{ascending:false}),
    admin.from('storefronts').select('id,brand_id,slug,display_name,active').eq('business_id',businessId),
    admin.from('channels').select('id,name,fee_bps,fixed_fee_cents,delivery_cents,promo_cents,media_cents,traffic_active').eq('business_id',businessId),
    admin.from('orders').select('id,status,source,brand_id,total_cents,contribution_cents,paid,created_at').eq('business_id',businessId).gte('created_at',since).order('created_at',{ascending:false}).limit(5000),
  ])
  for(const r of [brands,zones,drivers,loyalty,promos,storefronts,channels,orders])if(r.error)throw r.error
  const orderRows=orders.data||[]
  const open=orderRows.filter((o:any)=>!['completed','cancelled'].includes(o.status))
  const delayed=open.filter((o:any)=>Date.now()-new Date(o.created_at).getTime()>30*60000)
  const paid=orderRows.filter((o:any)=>o.paid)
  const revenue=paid.reduce((s:number,o:any)=>s+n(o.total_cents),0)
  const contribution=paid.reduce((s:number,o:any)=>s+n(o.contribution_cents),0)
  const bySource:Record<string,number>={}
  const byBrand:Record<string,{orders:number;revenue_cents:number;contribution_cents:number}>={}
  for(const o of paid){
    const source=String(o.source||'unknown');bySource[source]=(bySource[source]||0)+1
    const key=o.brand_id?String(o.brand_id):'unassigned';const row=byBrand[key]||{orders:0,revenue_cents:0,contribution_cents:0};row.orders+=1;row.revenue_cents+=n(o.total_cents);row.contribution_cents+=n(o.contribution_cents);byBrand[key]=row
  }
  const brandRows=(brands.data||[]).map((b:any)=>({...b,metrics:byBrand[String(b.id)]||{orders:0,revenue_cents:0,contribution_cents:0}}))
  const activeZones=(zones.data||[]).filter((z:any)=>z.active)
  const activeDrivers=(drivers.data||[]).filter((d:any)=>d.active)
  const activeStores=(storefronts.data||[]).filter((s:any)=>s.active)
  const loyaltyRow=loyalty.data||{business_id:businessId,mode:'off',points_per_real:1,cashback_bps:0,redeem_threshold:0,active:false}
  return {
    business_id:businessId,
    period_days:30,
    metrics:{orders_paid:paid.length,revenue_cents:revenue,contribution_cents:contribution,open_orders:open.length,delayed_orders:delayed.length,source_mix:bySource},
    readiness:{own_channel:activeStores.length>0,delivery_zones:activeZones.length>0,couriers:activeDrivers.length>0,loyalty:Boolean(loyaltyRow.active),multibrand:brandRows.filter((b:any)=>b.active).length>1},
    brands:brandRows,zones:zones.data||[],drivers:drivers.data||[],loyalty:loyaltyRow,promos:promos.data||[],storefronts:storefronts.data||[],channels:channels.data||[],
  }
}

async function createBrand(bid:number,input:any){
  const name=String(input.name||'').trim();if(name.length<2)return fail('Informe o nome da marca.',422)
  const slug=slugify(String(input.slug||name));if(slug.length<3)return fail('Slug de marca inválido.',422)
  const primary=String(input.primary_channel||'direct');if(!['direct','whatsapp','ifood','99food','mixed'].includes(primary))return fail('Canal principal inválido.',422)
  const r=await admin.from('brands').insert({business_id:bid,name,slug,primary_channel:primary,sort_order:Math.max(0,n(input.sort_order))}).select('id,name,slug,active,primary_channel,sort_order').single()
  if(r.error){if(r.error.code==='23505')return fail('Já existe uma marca com esse nome ou slug.',409);throw r.error}return j(r.data,201)
}
async function patchBrand(bid:number,id:number,input:any){
  const patch:any={}
  if(input.name!==undefined){const v=String(input.name).trim();if(v.length<2)return fail('Nome inválido.',422);patch.name=v}
  if(input.slug!==undefined){const v=slugify(String(input.slug));if(v.length<3)return fail('Slug inválido.',422);patch.slug=v}
  if(input.active!==undefined)patch.active=Boolean(input.active)
  if(input.primary_channel!==undefined){const v=String(input.primary_channel);if(!['direct','whatsapp','ifood','99food','mixed'].includes(v))return fail('Canal principal inválido.',422);patch.primary_channel=v}
  if(input.sort_order!==undefined)patch.sort_order=Math.max(0,n(input.sort_order))
  patch.updated_at=now()
  const r=await admin.from('brands').update(patch).eq('id',id).eq('business_id',bid).eq('soft_deleted',false).select('id,name,slug,active,primary_channel,sort_order').maybeSingle()
  if(r.error)throw r.error;if(!r.data)return fail('Marca não encontrada.',404);return j(r.data)
}

async function createZone(bid:number,input:any){
  const type=String(input.zone_type||'radius');if(!['radius','neighborhood','cep'].includes(type))return fail('Tipo de zona inválido.',422)
  const brandId=input.brand_id?Number(input.brand_id):null;if(!await assertBrand(bid,brandId))return fail('Marca não pertence a esta operação.',422)
  const name=String(input.name||'').trim();if(name.length<2)return fail('Informe o nome da zona.',422)
  const row={business_id:bid,brand_id:brandId,name,zone_type:type,match_value:String(input.match_value||'').trim(),fee_cents:Math.max(0,n(input.fee_cents)),min_order_cents:Math.max(0,n(input.min_order_cents)),eta_min:Math.min(360,Math.max(5,n(input.eta_min,45))),active:input.active!==false}
  const r=await admin.from('delivery_zones').insert(row).select('*').single();if(r.error)throw r.error;return j(r.data,201)
}
async function patchZone(bid:number,id:number,input:any){
  const current=await admin.from('delivery_zones').select('*').eq('id',id).eq('business_id',bid).maybeSingle();if(current.error)throw current.error;if(!current.data)return fail('Zona não encontrada.',404)
  if(input.expected_version!==undefined&&n(input.expected_version)!==n(current.data.version))return fail('Zona foi alterada em outra sessão. Atualize antes de salvar.',409)
  const patch:any={version:n(current.data.version)+1}
  for(const k of ['name','match_value'])if(input[k]!==undefined)patch[k]=String(input[k]).trim()
  if(input.zone_type!==undefined){const v=String(input.zone_type);if(!['radius','neighborhood','cep'].includes(v))return fail('Tipo inválido.',422);patch.zone_type=v}
  if(input.brand_id!==undefined){const v=input.brand_id?Number(input.brand_id):null;if(!await assertBrand(bid,v))return fail('Marca não pertence a esta operação.',422);patch.brand_id=v}
  if(input.fee_cents!==undefined)patch.fee_cents=Math.max(0,n(input.fee_cents))
  if(input.min_order_cents!==undefined)patch.min_order_cents=Math.max(0,n(input.min_order_cents))
  if(input.eta_min!==undefined)patch.eta_min=Math.min(360,Math.max(5,n(input.eta_min,45)))
  if(input.active!==undefined)patch.active=Boolean(input.active)
  const r=await admin.from('delivery_zones').update(patch).eq('id',id).eq('business_id',bid).eq('version',current.data.version).select('*').maybeSingle();if(r.error)throw r.error;if(!r.data)return fail('Conflito ao salvar zona.',409);return j(r.data)
}

async function createDriver(bid:number,input:any){
  const name=String(input.name||'').trim();if(name.length<2)return fail('Informe o nome do entregador.',422)
  const vehicle=String(input.vehicle||'moto');if(!['foot','bike','moto','car','utility'].includes(vehicle))return fail('Veículo inválido.',422)
  const status=String(input.status||'offline');if(!['available','busy','offline'].includes(status))return fail('Status inválido.',422)
  const r=await admin.from('delivery_drivers').insert({business_id:bid,name,phone:String(input.phone||'').trim(),vehicle,status,active:input.active!==false}).select('*').single();if(r.error)throw r.error;return j(r.data,201)
}
async function patchDriver(bid:number,id:number,input:any){
  const current=await admin.from('delivery_drivers').select('*').eq('id',id).eq('business_id',bid).maybeSingle();if(current.error)throw current.error;if(!current.data)return fail('Entregador não encontrado.',404)
  if(input.expected_version!==undefined&&n(input.expected_version)!==n(current.data.version))return fail('Entregador foi alterado em outra sessão.',409)
  const patch:any={version:n(current.data.version)+1}
  if(input.name!==undefined)patch.name=String(input.name).trim();if(input.phone!==undefined)patch.phone=String(input.phone).trim()
  if(input.vehicle!==undefined){const v=String(input.vehicle);if(!['foot','bike','moto','car','utility'].includes(v))return fail('Veículo inválido.',422);patch.vehicle=v}
  if(input.status!==undefined){const v=String(input.status);if(!['available','busy','offline'].includes(v))return fail('Status inválido.',422);patch.status=v}
  if(input.active!==undefined)patch.active=Boolean(input.active)
  const r=await admin.from('delivery_drivers').update(patch).eq('id',id).eq('business_id',bid).eq('version',current.data.version).select('*').maybeSingle();if(r.error)throw r.error;if(!r.data)return fail('Conflito ao salvar entregador.',409);return j(r.data)
}

async function saveLoyalty(bid:number,userId:number,input:any){
  const mode=String(input.mode||'off');if(!['off','points','cashback'].includes(mode))return fail('Modo de fidelidade inválido.',422)
  const cashback=Math.min(5000,Math.max(0,n(input.cashback_bps)))
  const row={business_id:bid,mode,points_per_real:Math.max(0,n(input.points_per_real,1)),cashback_bps:cashback,redeem_threshold:Math.max(0,n(input.redeem_threshold)),active:Boolean(input.active)&&mode!=='off',updated_by_user_id:userId,updated_at:now()}
  const r=await admin.from('loyalty_programs').upsert(row,{onConflict:'business_id'}).select('*').single();if(r.error)throw r.error;return j(r.data)
}
async function createPromo(bid:number,input:any){
  const brandId=input.brand_id?Number(input.brand_id):null;if(!await assertBrand(bid,brandId))return fail('Marca não pertence a esta operação.',422)
  const code=String(input.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,40);if(code.length<3)return fail('Cupom precisa ter ao menos 3 caracteres.',422)
  const type=String(input.discount_type||'percent');if(!['percent','fixed','free_delivery'].includes(type))return fail('Tipo de desconto inválido.',422)
  const value=type==='percent'?Math.min(10000,Math.max(0,n(input.value))):Math.max(0,n(input.value))
  const r=await admin.from('delivery_promos').insert({business_id:bid,brand_id:brandId,code,discount_type:type,value,min_order_cents:Math.max(0,n(input.min_order_cents)),max_uses:input.max_uses?Math.max(1,n(input.max_uses)):null,starts_at:input.starts_at||null,ends_at:input.ends_at||null,active:input.active!==false}).select('*').single()
  if(r.error){if(r.error.code==='23505')return fail('Esse cupom já existe.',409);throw r.error}return j(r.data,201)
}
async function patchPromo(bid:number,id:number,input:any){
  const patch:any={}
  if(input.active!==undefined)patch.active=Boolean(input.active)
  if(input.max_uses!==undefined)patch.max_uses=input.max_uses?Math.max(1,n(input.max_uses)):null
  if(input.min_order_cents!==undefined)patch.min_order_cents=Math.max(0,n(input.min_order_cents))
  if(input.ends_at!==undefined)patch.ends_at=input.ends_at||null
  const r=await admin.from('delivery_promos').update(patch).eq('id',id).eq('business_id',bid).select('*').maybeSingle();if(r.error)throw r.error;if(!r.data)return fail('Cupom não encontrado.',404);return j(r.data)
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  const path=pathOf(req),method=req.method
  try{
    if(path==='/livez'&&method==='GET')return j({ok:true,service:FUNCTION_SLUG,version:'4.0.0'})
    if(path==='/readyz'&&method==='GET'){
      const [z,d,l,p]=await Promise.all([
        admin.from('delivery_zones').select('id',{head:true,count:'exact'}),admin.from('delivery_drivers').select('id',{head:true,count:'exact'}),admin.from('loyalty_programs').select('business_id',{head:true,count:'exact'}),admin.from('delivery_promos').select('id',{head:true,count:'exact'}),
      ]);return [z,d,l,p].some(x=>x.error)?fail('database_not_ready',503):j({ok:true,database:'ready',version:'4.0.0'})
    }
    const user:any=await auth(req);if(!user)return fail('Sessão inválida',401)
    const root=path.match(/^\/businesses\/(\d+)\/delivery(?:\/(.*))?$/);if(!root)return fail('Rota não encontrada',404)
    const bid=Number(root[1]),sub=root[2]||'';const canWrite=method!=='GET'
    if(!await membership(user.id,bid,canWrite))return fail(canWrite?'Somente owner/admin pode alterar o Delivery OS.':'Sem acesso a esta operação.',403)
    if(sub==='overview'&&method==='GET')return j(await overview(bid))
    if(sub==='brands'&&method==='GET'){const r=await admin.from('brands').select('id,name,slug,active,primary_channel,sort_order').eq('business_id',bid).eq('soft_deleted',false).order('sort_order').order('name');if(r.error)throw r.error;return j(r.data||[])}
    if(sub==='brands'&&method==='POST')return createBrand(bid,await body(req))
    const brand=sub.match(/^brands\/(\d+)$/);if(brand&&method==='PATCH')return patchBrand(bid,Number(brand[1]),await body(req))
    if(sub==='zones'&&method==='GET'){const r=await admin.from('delivery_zones').select('*').eq('business_id',bid).order('active',{ascending:false}).order('name');if(r.error)throw r.error;return j(r.data||[])}
    if(sub==='zones'&&method==='POST')return createZone(bid,await body(req))
    const zone=sub.match(/^zones\/(\d+)$/);if(zone&&method==='PATCH')return patchZone(bid,Number(zone[1]),await body(req))
    if(sub==='drivers'&&method==='GET'){const r=await admin.from('delivery_drivers').select('*').eq('business_id',bid).order('active',{ascending:false}).order('name');if(r.error)throw r.error;return j(r.data||[])}
    if(sub==='drivers'&&method==='POST')return createDriver(bid,await body(req))
    const driver=sub.match(/^drivers\/(\d+)$/);if(driver&&method==='PATCH')return patchDriver(bid,Number(driver[1]),await body(req))
    if(sub==='loyalty'&&method==='GET'){const r=await admin.from('loyalty_programs').select('*').eq('business_id',bid).maybeSingle();if(r.error)throw r.error;return j(r.data||{business_id:bid,mode:'off',points_per_real:1,cashback_bps:0,redeem_threshold:0,active:false})}
    if(sub==='loyalty'&&method==='PUT')return saveLoyalty(bid,user.id,await body(req))
    if(sub==='promos'&&method==='GET'){const r=await admin.from('delivery_promos').select('*').eq('business_id',bid).order('created_at',{ascending:false});if(r.error)throw r.error;return j(r.data||[])}
    if(sub==='promos'&&method==='POST')return createPromo(bid,await body(req))
    const promo=sub.match(/^promos\/(\d+)$/);if(promo&&method==='PATCH')return patchPromo(bid,Number(promo[1]),await body(req))
    return fail('Rota não encontrada',404)
  }catch(e){console.error('delivery-v40',e);return fail('Erro interno no Delivery OS.',500)}
})
