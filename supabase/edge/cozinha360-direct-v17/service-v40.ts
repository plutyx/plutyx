import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROD_ORIGIN=(Deno.env.get('C360_PUBLIC_APP_URL')||'https://cozinha-360-os.netlify.app').replace(/\/$/,'')
const FUNCTION_SLUG='cozinha360-direct-v17'
const allowedOrigins=new Set([PROD_ORIGIN,'http://localhost:5173','http://localhost:3000','http://127.0.0.1:5173'])
const anon=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})

function cors(req:Request){const origin=req.headers.get('Origin')||'';return{'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:PROD_ORIGIN,'Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin'}}
const j=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)})
const fail=(req:Request,detail:string,status=400,extra:Record<string,unknown>={})=>j(req,{detail,...extra},status)
const json=async(req:Request)=>{try{return await req.json()}catch{return{}}}
const clean=(v:unknown,max=160)=>String(v??'').trim().slice(0,max)
const n=(v:unknown,fallback=0)=>{const x=Number(v);return Number.isFinite(x)?x:fallback}
const normalize=(v:unknown)=>clean(v,180).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const digits=(v:unknown)=>clean(v,40).replace(/\D/g,'')
function routePath(req:Request){const path=new URL(req.url).pathname,marker='/'+FUNCTION_SLUG,i=path.indexOf(marker);return i>=0?(path.slice(i+marker.length)||'/'):path}

async function authUser(req:Request){const h=req.headers.get('Authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;const {data,error}=await anon.auth.getUser(token);return error||!data.user?null:data.user}
async function profile(auth:any){let r=await admin.from('users').select('id,email,full_name,auth_user_id').eq('auth_user_id',auth.id).maybeSingle();if(r.error)throw r.error;if(r.data)return r.data;const email=String(auth.email||'').toLowerCase();if(!email)return null;r=await admin.from('users').select('id,email,full_name,auth_user_id').ilike('email',email).maybeSingle();if(r.error)throw r.error;if(!r.data)return null;const u=await admin.from('users').update({auth_user_id:auth.id}).eq('id',r.data.id).select('id,email,full_name,auth_user_id').single();if(u.error)throw u.error;return u.data}
async function membership(userId:number,businessId:number,roles=['owner','admin','member']){const {data,error}=await admin.from('memberships').select('role').eq('user_id',userId).eq('business_id',businessId).maybeSingle();if(error)throw error;return data&&roles.includes(data.role)?data:null}

async function publicStore(slug:string){
  const storeR=await admin.from('storefronts').select('id,business_id,brand_id,channel_id,slug,display_name,active').ilike('slug',slug).eq('active',true).maybeSingle();if(storeR.error)throw storeR.error;const store=storeR.data;if(!store)return null
  const [businessR,brandR,productsR,pricesR,settingsR,zonesR]=await Promise.all([
    admin.from('businesses').select('id,name,city,currency').eq('id',store.business_id).maybeSingle(),
    store.brand_id?admin.from('brands').select('id,name').eq('id',store.brand_id).maybeSingle():Promise.resolve({data:null,error:null}),
    admin.from('products').select('id,name,category,brand_id').eq('business_id',store.business_id).eq('soft_deleted',false).eq('active',true).order('name'),
    admin.from('product_channel_prices').select('product_id,sale_price_cents').eq('business_id',store.business_id).eq('channel_id',store.channel_id).gt('sale_price_cents',0),
    admin.from('delivery_settings').select('scheduled_orders_enabled,max_scheduled_days,default_eta_min,customer_tracking_enabled').eq('business_id',store.business_id).maybeSingle(),
    admin.from('delivery_zones').select('id').eq('business_id',store.business_id).eq('active',true),
  ])
  if(productsR.error)throw productsR.error;if(pricesR.error)throw pricesR.error
  const priceMap=new Map((pricesR.data||[]).map((x:any)=>[Number(x.product_id),Number(x.sale_price_cents)]))
  const products=(productsR.data||[]).filter((p:any)=>(!store.brand_id||Number(p.brand_id)===Number(store.brand_id))&&priceMap.has(Number(p.id))).map((p:any)=>({...p,sale_price_cents:priceMap.get(Number(p.id))}))
  const settings=settingsR.data||{scheduled_orders_enabled:true,max_scheduled_days:7,default_eta_min:45,customer_tracking_enabled:false}
  return{storefront:store,business:businessR.data,brand:brandR.data,products,fulfillment:{pickup:true,delivery:(zonesR.data||[]).length>0,scheduled_orders:Boolean(settings.scheduled_orders_enabled),max_scheduled_days:Number(settings.max_scheduled_days||7),customer_tracking:Boolean(settings.customer_tracking_enabled)}}
}

function lineItems(body:any,store:any){const raw=Array.isArray(body.items)?body.items.slice(0,20):[];const items=raw.map((x:any)=>({product_id:Number(x.product_id),quantity:Number(x.quantity||1)}));if(!items.length||items.some((x:any)=>!Number.isInteger(x.product_id)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>20))throw new Error('ITEMS_INVALID');const productMap=new Map(store.products.map((p:any)=>[Number(p.id),p]));let subtotal=0;for(const item of items){const product=productMap.get(item.product_id);if(!product)throw new Error('PRODUCT_UNAVAILABLE');subtotal+=Number(product.sale_price_cents)*item.quantity}return{items,subtotal}}
function haversineKm(lat1:number,lng1:number,lat2:number,lng2:number){const rad=(d:number)=>d*Math.PI/180,R=6371,dLat=rad(lat2-lat1),dLng=rad(lng2-lng1),a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
async function resolveZone(store:any,body:any){
  const {data,error}=await admin.from('delivery_zones').select('*').eq('business_id',store.storefront.business_id).eq('active',true);if(error)throw error
  const rows=(data||[]).filter((z:any)=>z.brand_id==null||store.storefront.brand_id==null||Number(z.brand_id)===Number(store.storefront.brand_id)).sort((a:any,b:any)=>Number(Boolean(b.brand_id))-Number(Boolean(a.brand_id)))
  const neighborhood=normalize(body.neighborhood),postal=digits(body.postal_code),lat=n(body.latitude,NaN),lng=n(body.longitude,NaN)
  for(const z of rows){if(z.zone_type==='neighborhood'&&neighborhood&&normalize(z.match_value)===neighborhood)return z;if(z.zone_type==='cep'&&postal){const target=digits(z.match_value);if(target&&postal.startsWith(target))return z}if(z.zone_type==='radius'&&Number.isFinite(lat)&&Number.isFinite(lng)&&z.center_lat!=null&&z.center_lng!=null&&z.radius_km!=null){if(haversineKm(Number(z.center_lat),Number(z.center_lng),lat,lng)<=Number(z.radius_km))return z}}
  return null
}
async function promoQuote(store:any,code:string,subtotal:number,fee:number){if(!code)return{promo:null,discount_cents:0};const {data,error}=await admin.from('delivery_promos').select('*').eq('business_id',store.storefront.business_id).eq('active',true).ilike('code',code).maybeSingle();if(error)throw error;if(!data)throw new Error('PROMO_INVALID');if(data.brand_id!=null&&store.storefront.brand_id!=null&&Number(data.brand_id)!==Number(store.storefront.brand_id))throw new Error('PROMO_INVALID');const now=Date.now();if(data.starts_at&&new Date(data.starts_at).getTime()>now)throw new Error('PROMO_NOT_STARTED');if(data.ends_at&&new Date(data.ends_at).getTime()<now)throw new Error('PROMO_EXPIRED');if(data.max_uses!=null&&Number(data.used_count)>=Number(data.max_uses))throw new Error('PROMO_LIMIT_REACHED');if(subtotal<Number(data.min_order_cents||0))throw new Error('PROMO_MIN_ORDER');let discount=0;if(data.discount_type==='percent')discount=Math.min(subtotal,Math.round(subtotal*Math.min(Number(data.value||0),100)/100));else if(data.discount_type==='fixed')discount=Math.min(subtotal,Number(data.value||0));else if(data.discount_type==='free_delivery')discount=fee;return{promo:data,discount_cents:discount}}
async function quote(store:any,body:any){
  const {items,subtotal}=lineItems(body,store);const fulfillment=body.fulfillment==='delivery'?'delivery':'pickup';let zone:any=null,baseFee=0,fee=0
  if(fulfillment==='delivery'){zone=await resolveZone(store,body);if(!zone)throw new Error('ZONE_NOT_FOUND');if(subtotal<Number(zone.min_order_cents||0))throw new Error('DELIVERY_MIN_ORDER');baseFee=Number(zone.fee_cents||0);fee=Number(zone.free_delivery_over_cents||0)>0&&subtotal>=Number(zone.free_delivery_over_cents)?0:baseFee}
  const scheduled=clean(body.scheduled_for,60);if(scheduled){if(!store.fulfillment.scheduled_orders)throw new Error('SCHEDULE_DISABLED');const when=new Date(scheduled);if(Number.isNaN(when.getTime())||when.getTime()<Date.now())throw new Error('SCHEDULE_INVALID');const limit=Date.now()+store.fulfillment.max_scheduled_days*86400000;if(when.getTime()>limit)throw new Error('SCHEDULE_TOO_FAR')}
  const promoCode=clean(body.promo_code,40).toUpperCase();const p=await promoQuote(store,promoCode,subtotal,fee);const total=Math.max(0,subtotal+fee-p.discount_cents)
  return{items,fulfillment,subtotal_cents:subtotal,zone:zone?{id:zone.id,name:zone.name,eta_min:zone.eta_min,fee_cents:Number(zone.fee_cents||0),free_delivery_over_cents:Number(zone.free_delivery_over_cents||0),min_order_cents:Number(zone.min_order_cents||0)}:null,base_delivery_fee_cents:baseFee,delivery_fee_cents:fee,discount_cents:p.discount_cents,promo:p.promo?{id:p.promo.id,code:p.promo.code,discount_type:p.promo.discount_type,value:p.promo.value}:null,total_cents:total,scheduled_for:scheduled||null}
}
function friendly(error:unknown){const msg=String((error as any)?.message||error);const map:Record<string,string>={ITEMS_INVALID:'Itens inválidos.',PRODUCT_UNAVAILABLE:'Um produto não está mais disponível.',ZONE_NOT_FOUND:'Este endereço ainda está fora da área de entrega cadastrada.',DELIVERY_MIN_ORDER:'O valor do pedido não atinge o mínimo desta região.',PROMO_INVALID:'Cupom inválido.',PROMO_NOT_STARTED:'Este cupom ainda não começou.',PROMO_EXPIRED:'Este cupom expirou.',PROMO_LIMIT_REACHED:'Este cupom atingiu o limite de usos.',PROMO_MIN_ORDER:'O pedido não atinge o valor mínimo do cupom.',SCHEDULE_DISABLED:'Esta cozinha não aceita pedidos agendados.',SCHEDULE_INVALID:'Escolha um horário futuro válido.',SCHEDULE_TOO_FAR:'O horário está além da janela de agendamento desta cozinha.',DELIVERY_ZONE_REQUIRED:'Selecione uma região de entrega válida.',DELIVERY_ZONE_INVALID:'A região de entrega não está mais disponível.',SCHEDULED_ORDER_DISABLED:'Esta cozinha não aceita pedidos agendados.',SCHEDULED_ORDER_PAST:'Escolha um horário futuro.',SCHEDULED_ORDER_TOO_FAR:'O horário escolhido está além da janela permitida.'};for(const [key,value] of Object.entries(map))if(msg.includes(key))return value;return msg}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
  const path=routePath(req)
  try{
    if(path==='/livez'&&req.method==='GET')return j(req,{ok:true,service:'cozinha360-direct',version:'1.8.0',delivery_checkout:'v40'})
    if(path==='/readyz'&&req.method==='GET'){const checks=await Promise.all([admin.from('storefronts').select('id',{head:true,count:'exact'}),admin.from('direct_order_checkouts').select('order_id',{head:true,count:'exact'})]);return checks.some(x=>x.error)?fail(req,'database_not_ready',503):j(req,{ok:true,database:'ready',delivery_checkout:'ready',version:'1.8.0'})}

    let m=path.match(/^\/track\/([0-9a-f-]{36})$/i)
    if(m&&req.method==='GET'){
      const {data,error}=await admin.from('deliveries').select('tracking_token,status,promised_at,scheduled_for,ready_at,picked_up_at,delivered_at,tracking_enabled,order_id,orders(brand_id,brands(name))').eq('tracking_token',m[1]).maybeSingle();if(error)throw error;if(!data||!data.tracking_enabled)return fail(req,'Rastreamento indisponível',404)
      return j(req,{status:data.status,promised_at:data.promised_at,scheduled_for:data.scheduled_for,ready_at:data.ready_at,picked_up_at:data.picked_up_at,delivered_at:data.delivered_at,order_id:data.order_id,brand:(data as any).orders?.brands?.name||null})
    }

    m=path.match(/^\/store\/([a-z0-9-]{3,60})$/)
    if(m&&req.method==='GET'){const store=await publicStore(m[1]);return store?j(req,store):fail(req,'Loja não encontrada',404)}
    let q=path.match(/^\/store\/([a-z0-9-]{3,60})\/quote$/)
    if(q&&req.method==='POST'){const store=await publicStore(q[1]);if(!store)return fail(req,'Loja não encontrada',404);try{return j(req,await quote(store,await json(req)))}catch(e){return fail(req,friendly(e),422)}}
    if(m&&req.method==='POST'){
      const store=await publicStore(m[1]);if(!store)return fail(req,'Loja não encontrada',404);const body:any=await json(req)
      let quoted:any;try{quoted=await quote(store,body)}catch(e){return fail(req,friendly(e),422)}
      const key=clean(body.client_order_key,100);if(key.length<8)return fail(req,'Identificador do pedido inválido',422);const a=body.attribution||{}
      const created=await admin.rpc('c360_create_direct_order',{p_slug:m[1],p_client_order_key:key,p_items:quoted.items,p_customer_name:clean(body.customer_name,160),p_phone:clean(body.phone,40),p_email:clean(body.email,320),p_consent_marketing:Boolean(body.consent_marketing),p_session_key:clean(a.session_key,120)||null,p_referrer:clean(a.referrer,500)||null,p_utm_source:clean(a.utm_source,120)||null,p_utm_medium:clean(a.utm_medium,120)||null,p_utm_campaign:clean(a.utm_campaign,160)||null,p_utm_content:clean(a.utm_content,160)||null,p_utm_term:clean(a.utm_term,160)||null,p_gclid:clean(a.gclid,220)||null,p_fbclid:clean(a.fbclid,220)||null,p_ttclid:clean(a.ttclid,220)||null})
      if(created.error){const msg=String(created.error.message||'');if(msg.includes('PRODUCT_PRICE_NOT_CONFIGURED'))return fail(req,'Preço indisponível',409);if(msg.includes('PRODUCT_NOT'))return fail(req,'Produto indisponível',409);if(msg.includes('CLIENT_ORDER_KEY'))return fail(req,'Identificador do pedido inválido',422);throw created.error}
      const final=await admin.rpc('c360_finalize_direct_order_v40',{p_order_id:Number(created.data.id),p_business_id:Number(store.storefront.business_id),p_zone_id:quoted.zone?.id||null,p_promo_code:quoted.promo?.code||null,p_fulfillment:quoted.fulfillment,p_address_line:clean(body.address_line,300)||null,p_neighborhood:clean(body.neighborhood,120)||null,p_postal_code:clean(body.postal_code,20)||null,p_address_reference:clean(body.address_reference,220)||null,p_latitude:Number.isFinite(Number(body.latitude))?Number(body.latitude):null,p_longitude:Number.isFinite(Number(body.longitude))?Number(body.longitude):null,p_scheduled_for:quoted.scheduled_for,p_brand_consent:Boolean(body.consent_marketing),p_quote_snapshot:quoted})
      if(final.error)return fail(req,friendly(final.error),422)
      return j(req,{...final.data,tracking_url:final.data.delivery_id&&store.fulfillment.customer_tracking?`${PROD_ORIGIN}/?track=${encodeURIComponent(String(final.data.delivery_id))}`:null},201)
    }

    const auth=await authUser(req);if(!auth)return fail(req,'Sessão inválida',401);const user=await profile(auth);if(!user)return fail(req,'Perfil não encontrado',403)
    m=path.match(/^\/businesses\/(\d+)\/storefronts$/)
    if(m&&req.method==='GET'){const bid=Number(m[1]);if(!await membership(Number(user.id),bid))return fail(req,'Sem acesso',403);const {data,error}=await admin.from('storefronts').select('*,brands(name),channels(name)').eq('business_id',bid).order('created_at');if(error)throw error;return j(req,data||[])}
    if(m&&req.method==='POST'){
      const bid=Number(m[1]);if(!await membership(Number(user.id),bid,['owner','admin']))return fail(req,'Somente owner/admin',403);const body:any=await json(req),storeSlug=clean(body.slug,60).toLowerCase(),name=clean(body.display_name,160);if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(storeSlug))return fail(req,'Slug inválido: use letras minúsculas, números e hífen',422);if(name.length<2)return fail(req,'Nome da loja inválido',422)
      let channelId=Number(body.channel_id||0);if(channelId){const {data}=await admin.from('channels').select('id').eq('id',channelId).eq('business_id',bid).maybeSingle();if(!data)return fail(req,'Canal inválido',422)}else{const existing=(await admin.from('channels').select('id').eq('business_id',bid).ilike('name','Pedido direto').maybeSingle()).data;if(existing)channelId=Number(existing.id);else{const c=await admin.from('channels').insert({business_id:bid,name:'Pedido direto',fee_bps:0,fixed_fee_cents:0,delivery_cents:0,promo_cents:0,media_cents:0,traffic_active:false}).select('id').single();if(c.error)throw c.error;channelId=Number(c.data.id)}}
      const brandId=body.brand_id?Number(body.brand_id):null;if(brandId){const b=(await admin.from('brands').select('id').eq('id',brandId).eq('business_id',bid).eq('soft_deleted',false).maybeSingle()).data;if(!b)return fail(req,'Marca inválida',422)}
      const ins=await admin.from('storefronts').insert({business_id:bid,brand_id:brandId,channel_id:channelId,slug:storeSlug,display_name:name,active:body.active!==false}).select('*').single();if(ins.error){if(String(ins.error.message).toLowerCase().includes('duplicate'))return fail(req,'Esse endereço de loja já está em uso',409);throw ins.error}await admin.from('audit_logs').insert({business_id:bid,actor_user_id:user.id,action:'storefront.created',entity_type:'storefront',entity_id:String(ins.data.id),payload_json:JSON.stringify({slug:storeSlug,channel_id:channelId,brand_id:brandId})});return j(req,ins.data,201)
    }
    m=path.match(/^\/businesses\/(\d+)\/storefronts\/(\d+)$/)
    if(m&&req.method==='PATCH'){const bid=Number(m[1]),sid=Number(m[2]);if(!await membership(Number(user.id),bid,['owner','admin']))return fail(req,'Somente owner/admin',403);const body:any=await json(req),patch:any={updated_at:new Date().toISOString()};if(body.display_name!==undefined){const name=clean(body.display_name,160);if(name.length<2)return fail(req,'Nome inválido',422);patch.display_name=name}if(body.active!==undefined)patch.active=Boolean(body.active);if(body.slug!==undefined){const s=clean(body.slug,60).toLowerCase();if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(s))return fail(req,'Slug inválido',422);patch.slug=s}const u=await admin.from('storefronts').update(patch).eq('id',sid).eq('business_id',bid).select('*').maybeSingle();if(u.error){if(String(u.error.message).toLowerCase().includes('duplicate'))return fail(req,'Esse endereço de loja já está em uso',409);throw u.error}return u.data?j(req,u.data):fail(req,'Loja não encontrada',404)}
    m=path.match(/^\/businesses\/(\d+)\/attribution$/)
    if(m&&req.method==='GET'){const bid=Number(m[1]);if(!await membership(Number(user.id),bid))return fail(req,'Sem acesso',403);const raw=Number(new URL(req.url).searchParams.get('days')||30),days=Math.max(1,Math.min(365,Number.isFinite(raw)?Math.trunc(raw):30));const r=await admin.rpc('c360_campaign_attribution',{p_business_id:bid,p_days:days});if(r.error)throw r.error;const rows=(r.data||[]) as any[],summary={orders:rows.reduce((a,x)=>a+Number(x.orders||0),0),revenue_cents:rows.reduce((a,x)=>a+Number(x.revenue_cents||0),0),media_cost_cents:rows.reduce((a,x)=>a+Number(x.media_cost_cents||0),0),contribution_after_media_cents:rows.reduce((a,x)=>a+Number(x.contribution_after_media_cents||0),0)};return j(req,{days,summary,campaigns:rows})}
    return fail(req,'Rota não encontrada',404)
  }catch(error){console.error('cozinha360-direct edge error',error);return fail(req,'Erro interno',500)}
})
