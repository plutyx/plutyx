import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FUNCTION_SLUG='cozinha360-delivery-v40'
const PUBLIC_APP=(Deno.env.get('C360_PUBLIC_APP_URL')||'https://cozinha-360-os.netlify.app').replace(/\/$/,'')
const anon=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})

const allowedOrigins=new Set([PUBLIC_APP,'http://localhost:5173','http://127.0.0.1:5173'])
function cors(req:Request){const origin=req.headers.get('origin')||'';return{
  'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:PUBLIC_APP,
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET,POST,PATCH,PUT,OPTIONS',
  'Vary':'Origin','Content-Type':'application/json; charset=utf-8'
}}
const reply=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)})
const fail=(req:Request,detail:string,status=400,extra:Record<string,unknown>={})=>reply(req,{detail,...extra},status)
const now=()=>new Date().toISOString()
function pathOf(req:Request){const p=new URL(req.url).pathname,marker='/'+FUNCTION_SLUG;const i=p.indexOf(marker);return i>=0?(p.slice(i+marker.length)||'/'):p}
async function bodyOf(req:Request){try{return await req.json()}catch{return{}}}
function int(value:unknown,fallback=0){const n=Number(value);return Number.isFinite(n)?Math.trunc(n):fallback}
function positiveId(value:unknown){const n=int(value);return n>0?n:0}
function text(value:unknown,max=180){return String(value??'').trim().slice(0,max)}
function slugify(value:unknown){return text(value,90).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)}
function isoOrNull(value:unknown){if(!value)return null;const d=new Date(String(value));return Number.isNaN(d.getTime())?null:d.toISOString()}

async function auth(req:Request){
  const h=req.headers.get('authorization')||''
  const token=h.startsWith('Bearer ')?h.slice(7):''
  if(!token)return null
  const {data,error}=await anon.auth.getUser(token)
  if(error||!data.user)return null
  let {data:profile}=await admin.from('users').select('id,email,full_name').eq('auth_user_id',data.user.id).maybeSingle()
  if(!profile&&data.user.email){const r=await admin.from('users').select('id,email,full_name').ilike('email',data.user.email).maybeSingle();profile=r.data}
  return profile||null
}
async function membership(userId:number,businessId:number,write=false){
  const {data}=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle()
  if(!data)return null
  if(write&&!['owner','admin'].includes(data.role))return null
  return data
}
async function audit(businessId:number,userId:number,action:string,entityType:string,entityId:string,payload:unknown){
  await admin.from('audit_logs').insert({business_id:businessId,actor_user_id:userId,action,entity_type:entityType,entity_id:entityId,payload_json:JSON.stringify(payload??{})})
}
async function assertBrand(businessId:number,brandId:number|null){
  if(!brandId)return true
  const {data}=await admin.from('brands').select('id').eq('business_id',businessId).eq('id',brandId).eq('soft_deleted',false).maybeSingle()
  return Boolean(data)
}
async function assertDriver(businessId:number,driverId:number|null){
  if(!driverId)return true
  const {data}=await admin.from('delivery_drivers').select('id').eq('business_id',businessId).eq('id',driverId).eq('active',true).maybeSingle()
  return Boolean(data)
}
async function assertZone(businessId:number,zoneId:number|null){
  if(!zoneId)return true
  const {data}=await admin.from('delivery_zones').select('id').eq('business_id',businessId).eq('id',zoneId).eq('active',true).maybeSingle()
  return Boolean(data)
}

const planLimits:Record<string,number>={start:1,pro:3,'360':10}
async function overview(req:Request,businessId:number){
  const [businessR,brandsR,channelsR,ordersR,itemsR,customersR,zonesR,driversR,deliveriesR,loyaltyR,promosR,storesR,connectionsR,billingR]=await Promise.all([
    admin.from('businesses').select('id,name,city,currency').eq('id',businessId).single(),
    admin.from('brands').select('id,business_id,name,active,soft_deleted,slug,primary_channel,sort_order').eq('business_id',businessId).eq('soft_deleted',false).order('sort_order').order('id'),
    admin.from('channels').select('id,name,fee_bps,fixed_fee_cents,delivery_cents,promo_cents,media_cents,traffic_active').eq('business_id',businessId).order('id'),
    admin.from('orders').select('id,brand_id,channel_id,customer_id,status,source,total_cents,variable_cost_cents,contribution_cents,paid,delayed,error_flag,version,created_at,updated_at').eq('business_id',businessId).order('created_at',{ascending:false}).limit(120),
    admin.from('order_items').select('id,order_id,product_id,quantity,unit_price_cents,unit_cost_cents').eq('business_id',businessId).order('id'),
    admin.from('customers').select('id,name,phone,email,consent_marketing,opted_out_at,created_at').eq('business_id',businessId).order('id'),
    admin.from('delivery_zones').select('*').eq('business_id',businessId).order('active',{ascending:false}).order('id'),
    admin.from('delivery_drivers').select('*').eq('business_id',businessId).order('active',{ascending:false}).order('id'),
    admin.from('deliveries').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(120),
    admin.from('loyalty_programs').select('*').eq('business_id',businessId).maybeSingle(),
    admin.from('delivery_promos').select('*').eq('business_id',businessId).order('active',{ascending:false}).order('id'),
    admin.from('storefronts').select('id,business_id,brand_id,channel_id,slug,display_name,active').eq('business_id',businessId).order('id'),
    admin.from('integration_connections').select('id,provider,display_name,status,mode,last_success_at,last_error_at,last_error').eq('business_id',businessId).order('provider'),
    admin.from('business_billing_accounts').select('plan_key,status,current_period_end,cancel_at_period_end').eq('business_id',businessId).maybeSingle(),
  ])
  if(businessR.error)return fail(req,'Operação não encontrada',404)
  const queryErrors=[brandsR.error,channelsR.error,ordersR.error,itemsR.error,customersR.error,zonesR.error,driversR.error,deliveriesR.error,promosR.error,storesR.error,connectionsR.error].filter(Boolean)
  if(queryErrors.length)return fail(req,'Não foi possível montar o Delivery 360',500)
  const brands=brandsR.data||[],channels=channelsR.data||[],orders=ordersR.data||[],items=itemsR.data||[],customers=customersR.data||[]
  const itemMap=new Map<number,unknown[]>();for(const item of items){const a=itemMap.get(Number(item.order_id))||[];a.push(item);itemMap.set(Number(item.order_id),a)}
  const customerMap=new Map(customers.map(c=>[Number(c.id),c]))
  const channelMap=new Map(channels.map(c=>[Number(c.id),c]))
  const brandMap=new Map(brands.map(b=>[Number(b.id),b]))
  const deliveries=deliveriesR.data||[];const deliveryMap=new Map(deliveries.map(d=>[Number(d.order_id),d]))
  const enrichedOrders=orders.map(o=>({...o,items:itemMap.get(Number(o.id))||[],customer:o.customer_id?customerMap.get(Number(o.customer_id))||null:null,channel:o.channel_id?channelMap.get(Number(o.channel_id))||null:null,brand:o.brand_id?brandMap.get(Number(o.brand_id))||null:null,delivery:deliveryMap.get(Number(o.id))||null}))
  const activeStatuses=new Set(['new','confirmed','production','checking','awaiting_delivery'])
  const open=enrichedOrders.filter(o=>activeStatuses.has(String(o.status)))
  const paid=orders.filter(o=>o.paid)
  const contribution=paid.reduce((sum,o)=>sum+int(o.contribution_cents),0)
  const revenue=paid.reduce((sum,o)=>sum+int(o.total_cents),0)
  const brandStats=brands.map(brand=>{const rows=orders.filter(o=>Number(o.brand_id)===Number(brand.id));const paidRows=rows.filter(o=>o.paid);return{brand_id:brand.id,orders:rows.length,open_orders:rows.filter(o=>activeStatuses.has(String(o.status))).length,revenue_cents:paidRows.reduce((s,o)=>s+int(o.total_cents),0),contribution_cents:paidRows.reduce((s,o)=>s+int(o.contribution_cents),0)}})
  const plan=String(billingR.data?.plan_key||'start').toLowerCase()
  return reply(req,{version:'4.0.0',business:businessR.data,summary:{open_orders:open.length,delayed_orders:open.filter(o=>o.delayed).length,paid_orders:paid.length,revenue_cents:revenue,contribution_cents:contribution,available_drivers:(driversR.data||[]).filter(d=>d.active&&d.status==='available').length,active_zones:(zonesR.data||[]).filter(z=>z.active).length},plan:{key:plan,status:billingR.data?.status||'observe_only',brand_limit:planLimits[plan]||1,current_period_end:billingR.data?.current_period_end||null,cancel_at_period_end:Boolean(billingR.data?.cancel_at_period_end)},brands,brand_stats:brandStats,channels,orders:enrichedOrders,zones:zonesR.data||[],drivers:driversR.data||[],deliveries,loyalty:loyaltyR.data||{business_id:businessId,mode:'off',points_per_real:1,cashback_bps:0,redeem_threshold:0,active:false},promos:promosR.data||[],storefronts:storesR.data||[],connections:connectionsR.data||[]})
}

async function createBrand(req:Request,businessId:number,userId:number,payload:any){
  const name=text(payload.name,120);if(name.length<2)return fail(req,'Informe o nome da marca')
  const slug=slugify(payload.slug||name);if(!slug)return fail(req,'Slug da marca inválido')
  const {data,error}=await admin.from('brands').insert({business_id:businessId,name,slug,primary_channel:text(payload.primary_channel||'direct',32)||'direct',sort_order:int(payload.sort_order),active:payload.active!==false,soft_deleted:false}).select('*').single()
  if(error)return fail(req,error.code==='23505'?'Já existe uma marca com esse nome ou slug.':'Não foi possível criar a marca',error.code==='23505'?409:400)
  await audit(businessId,userId,'create','brand',String(data.id),{name:data.name,slug:data.slug})
  return reply(req,{brand:data},201)
}
async function patchBrand(req:Request,businessId:number,userId:number,brandId:number,payload:any){
  const current=(await admin.from('brands').select('*').eq('business_id',businessId).eq('id',brandId).eq('soft_deleted',false).maybeSingle()).data
  if(!current)return fail(req,'Marca não encontrada',404)
  const patch:any={updated_at:now()}
  if(payload.name!==undefined){const v=text(payload.name,120);if(v.length<2)return fail(req,'Nome inválido');patch.name=v}
  if(payload.slug!==undefined){const v=slugify(payload.slug);if(!v)return fail(req,'Slug inválido');patch.slug=v}
  if(payload.active!==undefined)patch.active=Boolean(payload.active)
  if(payload.primary_channel!==undefined)patch.primary_channel=text(payload.primary_channel,32)||'direct'
  if(payload.sort_order!==undefined)patch.sort_order=int(payload.sort_order)
  if(payload.soft_deleted===true){patch.soft_deleted=true;patch.active=false}
  const {data,error}=await admin.from('brands').update(patch).eq('business_id',businessId).eq('id',brandId).select('*').single()
  if(error)return fail(req,error.code==='23505'?'Slug já utilizado.':'Não foi possível atualizar a marca',error.code==='23505'?409:400)
  await audit(businessId,userId,'update','brand',String(brandId),patch)
  return reply(req,{brand:data})
}

async function createZone(req:Request,businessId:number,userId:number,payload:any){
  const zoneType=text(payload.zone_type||'neighborhood',24);if(!['radius','neighborhood','cep'].includes(zoneType))return fail(req,'Tipo de zona inválido')
  const brandId=positiveId(payload.brand_id)||null;if(!await assertBrand(businessId,brandId))return fail(req,'Marca inválida',404)
  const eta=Math.min(360,Math.max(5,int(payload.eta_min,45)))
  const row={business_id:businessId,brand_id:brandId,name:text(payload.name,120),zone_type:zoneType,match_value:text(payload.match_value,180),fee_cents:Math.max(0,int(payload.fee_cents)),min_order_cents:Math.max(0,int(payload.min_order_cents)),eta_min:eta,active:payload.active!==false,version:1}
  if(!row.name)return fail(req,'Informe o nome da zona')
  const {data,error}=await admin.from('delivery_zones').insert(row).select('*').single();if(error)return fail(req,'Não foi possível criar a zona',400)
  await audit(businessId,userId,'create','delivery_zone',String(data.id),row);return reply(req,{zone:data},201)
}
async function patchZone(req:Request,businessId:number,userId:number,zoneId:number,payload:any){
  const current=(await admin.from('delivery_zones').select('*').eq('business_id',businessId).eq('id',zoneId).maybeSingle()).data;if(!current)return fail(req,'Zona não encontrada',404)
  const expected=int(payload.version,current.version);if(expected!==int(current.version))return fail(req,'Zona foi alterada em outra sessão. Atualize e tente novamente.',409,{code:'VERSION_CONFLICT'})
  const patch:any={version:int(current.version)+1}
  if(payload.name!==undefined)patch.name=text(payload.name,120)
  if(payload.zone_type!==undefined){const v=text(payload.zone_type,24);if(!['radius','neighborhood','cep'].includes(v))return fail(req,'Tipo de zona inválido');patch.zone_type=v}
  if(payload.match_value!==undefined)patch.match_value=text(payload.match_value,180)
  if(payload.fee_cents!==undefined)patch.fee_cents=Math.max(0,int(payload.fee_cents))
  if(payload.min_order_cents!==undefined)patch.min_order_cents=Math.max(0,int(payload.min_order_cents))
  if(payload.eta_min!==undefined)patch.eta_min=Math.min(360,Math.max(5,int(payload.eta_min)))
  if(payload.active!==undefined)patch.active=Boolean(payload.active)
  if(payload.brand_id!==undefined){const brandId=positiveId(payload.brand_id)||null;if(!await assertBrand(businessId,brandId))return fail(req,'Marca inválida',404);patch.brand_id=brandId}
  const {data,error}=await admin.from('delivery_zones').update(patch).eq('business_id',businessId).eq('id',zoneId).eq('version',current.version).select('*').maybeSingle();if(error||!data)return fail(req,'Conflito ao salvar zona',409)
  await audit(businessId,userId,'update','delivery_zone',String(zoneId),patch);return reply(req,{zone:data})
}

async function createDriver(req:Request,businessId:number,userId:number,payload:any){
  const vehicle=text(payload.vehicle||'moto',20);if(!['foot','bike','moto','car','utility'].includes(vehicle))return fail(req,'Veículo inválido')
  const status=text(payload.status||'offline',20);if(!['available','busy','offline'].includes(status))return fail(req,'Status inválido')
  const row={business_id:businessId,name:text(payload.name,120),phone:text(payload.phone,40),vehicle,status,active:payload.active!==false,version:1};if(!row.name)return fail(req,'Informe o nome do entregador')
  const {data,error}=await admin.from('delivery_drivers').insert(row).select('*').single();if(error)return fail(req,'Não foi possível adicionar o entregador',400)
  await audit(businessId,userId,'create','delivery_driver',String(data.id),{name:data.name,vehicle:data.vehicle,status:data.status});return reply(req,{driver:data},201)
}
async function patchDriver(req:Request,businessId:number,userId:number,driverId:number,payload:any){
  const current=(await admin.from('delivery_drivers').select('*').eq('business_id',businessId).eq('id',driverId).maybeSingle()).data;if(!current)return fail(req,'Entregador não encontrado',404)
  const expected=int(payload.version,current.version);if(expected!==int(current.version))return fail(req,'Entregador foi alterado em outra sessão.',409,{code:'VERSION_CONFLICT'})
  const patch:any={version:int(current.version)+1}
  if(payload.name!==undefined)patch.name=text(payload.name,120)
  if(payload.phone!==undefined)patch.phone=text(payload.phone,40)
  if(payload.vehicle!==undefined){const v=text(payload.vehicle,20);if(!['foot','bike','moto','car','utility'].includes(v))return fail(req,'Veículo inválido');patch.vehicle=v}
  if(payload.status!==undefined){const v=text(payload.status,20);if(!['available','busy','offline'].includes(v))return fail(req,'Status inválido');patch.status=v}
  if(payload.active!==undefined)patch.active=Boolean(payload.active)
  const {data,error}=await admin.from('delivery_drivers').update(patch).eq('business_id',businessId).eq('id',driverId).eq('version',current.version).select('*').maybeSingle();if(error||!data)return fail(req,'Conflito ao salvar entregador',409)
  await audit(businessId,userId,'update','delivery_driver',String(driverId),patch);return reply(req,{driver:data})
}

async function upsertDelivery(req:Request,businessId:number,userId:number,orderId:number,payload:any){
  const order=(await admin.from('orders').select('id,status,business_id').eq('business_id',businessId).eq('id',orderId).maybeSingle()).data;if(!order)return fail(req,'Pedido não encontrado',404)
  const driverId=positiveId(payload.driver_id)||null,zoneId=positiveId(payload.zone_id)||null
  if(!await assertDriver(businessId,driverId))return fail(req,'Entregador inválido',404)
  if(!await assertZone(businessId,zoneId))return fail(req,'Zona inválida',404)
  const allowed=['waiting','assigned','picked_up','delivered','failed','cancelled'];const status=text(payload.status||((driverId)?'assigned':'waiting'),24);if(!allowed.includes(status))return fail(req,'Status de entrega inválido')
  const current=(await admin.from('deliveries').select('*').eq('business_id',businessId).eq('order_id',orderId).maybeSingle()).data
  if(current&&payload.version!==undefined&&int(payload.version)!==int(current.version))return fail(req,'Entrega foi atualizada em outra sessão.',409,{code:'VERSION_CONFLICT'})
  const patch:any={business_id:businessId,order_id:orderId,driver_id:driverId,zone_id:zoneId,status,fee_cents:Math.max(0,int(payload.fee_cents,current?.fee_cents||0)),promised_at:isoOrNull(payload.promised_at)??current?.promised_at??null,notes:text(payload.notes??current?.notes??'',1000),version:current?int(current.version)+1:1}
  if(status==='picked_up'&&!current?.picked_up_at)patch.picked_up_at=now();else if(payload.picked_up_at!==undefined)patch.picked_up_at=isoOrNull(payload.picked_up_at)
  if(status==='delivered'&&!current?.delivered_at)patch.delivered_at=now();else if(payload.delivered_at!==undefined)patch.delivered_at=isoOrNull(payload.delivered_at)
  let data,error
  if(current){const r=await admin.from('deliveries').update(patch).eq('id',current.id).eq('business_id',businessId).eq('version',current.version).select('*').maybeSingle();data=r.data;error=r.error}
  else{const r=await admin.from('deliveries').insert(patch).select('*').single();data=r.data;error=r.error}
  if(error||!data)return fail(req,'Não foi possível salvar a entrega',current?409:400)
  if(driverId){const driverStatus=status==='assigned'||status==='picked_up'?'busy':status==='delivered'?'available':undefined;if(driverStatus)await admin.from('delivery_drivers').update({status:driverStatus,version:Math.max(1,int((await admin.from('delivery_drivers').select('version').eq('id',driverId).single()).data?.version)+1)}).eq('business_id',businessId).eq('id',driverId)}
  await audit(businessId,userId,current?'update':'create','delivery',String(data.id),{order_id:orderId,driver_id:driverId,zone_id:zoneId,status,fee_cents:data.fee_cents})
  return reply(req,{delivery:data},current?200:201)
}

async function putLoyalty(req:Request,businessId:number,userId:number,payload:any){
  const mode=text(payload.mode||'off',20);if(!['off','points','cashback'].includes(mode))return fail(req,'Modo de fidelidade inválido')
  const cashback=Math.min(5000,Math.max(0,int(payload.cashback_bps)))
  const points=Math.max(0,Number(payload.points_per_real??1));if(!Number.isFinite(points))return fail(req,'Pontuação inválida')
  const row={business_id:businessId,mode,points_per_real:points,cashback_bps:cashback,redeem_threshold:Math.max(0,int(payload.redeem_threshold)),active:Boolean(payload.active)&&mode!=='off',updated_by_user_id:userId,updated_at:now()}
  const {data,error}=await admin.from('loyalty_programs').upsert(row,{onConflict:'business_id'}).select('*').single();if(error)return fail(req,'Não foi possível salvar fidelidade',400)
  await audit(businessId,userId,'update','loyalty_program',String(businessId),row);return reply(req,{loyalty:data})
}
async function createPromo(req:Request,businessId:number,userId:number,payload:any){
  const discount=text(payload.discount_type,24);if(!['percent','fixed','free_delivery'].includes(discount))return fail(req,'Tipo de cupom inválido')
  const brandId=positiveId(payload.brand_id)||null;if(!await assertBrand(businessId,brandId))return fail(req,'Marca inválida',404)
  const code=text(payload.code,40).toUpperCase().replace(/[^A-Z0-9_-]/g,'');if(code.length<3)return fail(req,'Código precisa ter ao menos 3 caracteres')
  const row={business_id:businessId,brand_id:brandId,code,discount_type:discount,value:Math.max(0,int(payload.value)),min_order_cents:Math.max(0,int(payload.min_order_cents)),max_uses:positiveId(payload.max_uses)||null,starts_at:isoOrNull(payload.starts_at),ends_at:isoOrNull(payload.ends_at),active:payload.active!==false}
  const {data,error}=await admin.from('delivery_promos').insert(row).select('*').single();if(error)return fail(req,error.code==='23505'?'Cupom já existe.':'Não foi possível criar o cupom',error.code==='23505'?409:400)
  await audit(businessId,userId,'create','delivery_promo',String(data.id),{code:data.code,discount_type:data.discount_type,value:data.value});return reply(req,{promo:data},201)
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
  const path=pathOf(req),method=req.method
  if(path==='/health'&&method==='GET')return reply(req,{status:'ok',service:FUNCTION_SLUG,version:'4.0.0'})
  const user=await auth(req);if(!user)return fail(req,'Sessão inválida ou expirada',401)
  const businessMatch=path.match(/^\/businesses\/(\d+)(?:\/(.*))?$/);if(!businessMatch)return fail(req,'Rota não encontrada',404)
  const businessId=positiveId(businessMatch[1]);if(!businessId)return fail(req,'Operação inválida',400)
  const rest=businessMatch[2]||'overview';const write=method!=='GET';const member=await membership(Number(user.id),businessId,write);if(!member)return fail(req,write?'Somente owner/admin pode alterar o Delivery 360.':'Você não participa desta operação.',403)
  const payload=write?await bodyOf(req):{}
  try{
    if(method==='GET'&&rest==='overview')return await overview(req,businessId)
    if(method==='POST'&&rest==='brands')return await createBrand(req,businessId,Number(user.id),payload)
    let m=rest.match(/^brands\/(\d+)$/);if(method==='PATCH'&&m)return await patchBrand(req,businessId,Number(user.id),positiveId(m[1]),payload)
    if(method==='POST'&&rest==='zones')return await createZone(req,businessId,Number(user.id),payload)
    m=rest.match(/^zones\/(\d+)$/);if(method==='PATCH'&&m)return await patchZone(req,businessId,Number(user.id),positiveId(m[1]),payload)
    if(method==='POST'&&rest==='drivers')return await createDriver(req,businessId,Number(user.id),payload)
    m=rest.match(/^drivers\/(\d+)$/);if(method==='PATCH'&&m)return await patchDriver(req,businessId,Number(user.id),positiveId(m[1]),payload)
    m=rest.match(/^deliveries\/(\d+)$/);if(method==='PUT'&&m)return await upsertDelivery(req,businessId,Number(user.id),positiveId(m[1]),payload)
    if(method==='PUT'&&rest==='loyalty')return await putLoyalty(req,businessId,Number(user.id),payload)
    if(method==='POST'&&rest==='promos')return await createPromo(req,businessId,Number(user.id),payload)
    return fail(req,'Rota não encontrada',404)
  }catch(error){console.error('delivery-v40',error);return fail(req,'Falha interna no Delivery 360',500)}
})
