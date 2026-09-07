import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLUG='cozinha360-kds-v54'
const anon=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}})

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'GET,PATCH,OPTIONS',
 'Content-Type':'application/json; charset=utf-8',
}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors})
const fail=(detail:string,status=400)=>json({detail},status)
const now=()=>new Date().toISOString()
const minute=(value:unknown,min:number,max:number,allowNull=false)=>{
 if(allowNull&&(value===null||value===''||typeof value==='undefined'))return null
 const n=Number(value)
 return Number.isInteger(n)&&n>=min&&n<=max?n:NaN
}
function routePath(req:Request){const path=new URL(req.url).pathname,marker=`/${SLUG}`,at=path.indexOf(marker);return at>=0?(path.slice(at+marker.length)||'/'):path}
async function body(req:Request){try{return await req.json()}catch{return{}}}
async function authUser(req:Request){
 const header=req.headers.get('Authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):''
 if(!token)return null
 const{data,error}=await anon.auth.getUser(token)
 return error||!data.user?null:data.user
}
async function ensureProfile(user:any){
 let{data:row,error}=await admin.from('users').select('*').eq('auth_user_id',user.id).maybeSingle();if(error)throw error
 const email=String(user.email||'').toLowerCase(),fullName=String(user.user_metadata?.full_name||user.user_metadata?.name||'')
 if(!row&&email){const result=await admin.from('users').select('*').ilike('email',email).maybeSingle();if(result.error)throw result.error;if(result.data){const updated=await admin.from('users').update({auth_user_id:user.id,full_name:result.data.full_name||fullName,updated_at:now()}).eq('id',result.data.id).select('*').single();if(updated.error)throw updated.error;row=updated.data}}
 if(!row){const created=await admin.from('users').insert({email,password_hash:'supabase-auth',full_name:fullName,auth_user_id:user.id}).select('*').single();if(created.error)throw created.error;row=created.data}
 return row
}
async function membership(userId:number,businessId:number,roles=['owner','admin','member']){
 const{data,error}=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle();if(error)throw error
 return data&&roles.includes(String(data.role))?data:null
}
async function audit(businessId:number,userId:number,action:string,payload:unknown){
 const{error}=await admin.from('audit_logs').insert({business_id:businessId,actor_user_id:userId,action,entity_type:'kds_sla',entity_id:String(businessId),payload_json:JSON.stringify(payload)});if(error)throw error
}

async function settings(businessId:number){
 const[businessResult,productsResult,channelsResult]=await Promise.all([
  admin.from('businesses').select('id,name,default_kds_sla_minutes').eq('id',businessId).eq('soft_deleted',false).single(),
  admin.from('products').select('id,name,category,prep_sla_minutes,active').eq('business_id',businessId).eq('soft_deleted',false).eq('active',true).order('name'),
  admin.from('channels').select('id,name,order_sla_minutes,traffic_active').eq('business_id',businessId).order('name'),
 ])
 if(businessResult.error)throw businessResult.error;if(productsResult.error)throw productsResult.error;if(channelsResult.error)throw channelsResult.error
 return{business_id:businessId,default_kds_sla_minutes:Number(businessResult.data.default_kds_sla_minutes||20),products:productsResult.data||[],channels:channelsResult.data||[]}
}

function urgency(age:number,effective:number){
 const due=effective-age
 if(due<0)return{urgency:'overdue',due_in_minutes:due}
 const critical=Math.max(3,Math.ceil(effective*.2)),warning=Math.max(7,Math.ceil(effective*.4))
 if(due<=critical)return{urgency:'critical',due_in_minutes:due}
 if(due<=warning)return{urgency:'warning',due_in_minutes:due}
 return{urgency:'on_track',due_in_minutes:due}
}

async function kds(businessId:number){
 const conf=await settings(businessId),defaultSla=conf.default_kds_sla_minutes
 const ordersResult=await admin.from('orders').select('id,status,source,total_cents,version,delayed,channel_id,brand_id,created_at').eq('business_id',businessId).neq('status','completed').neq('status','cancelled').order('created_at',{ascending:true}).limit(250)
 if(ordersResult.error)throw ordersResult.error
 const orders=ordersResult.data||[],orderIds=orders.map((row:any)=>Number(row.id))
 let items:any[]=[]
 if(orderIds.length){const result=await admin.from('order_items').select('order_id,product_id,quantity,unit_price_cents').eq('business_id',businessId).in('order_id',orderIds);if(result.error)throw result.error;items=result.data||[]}
 const productIds=[...new Set(items.map((row:any)=>Number(row.product_id)).filter(Boolean))]
 let products:any[]=[]
 if(productIds.length){const result=await admin.from('products').select('id,name,prep_sla_minutes,brand_id').eq('business_id',businessId).in('id',productIds);if(result.error)throw result.error;products=result.data||[]}
 const channelIds=[...new Set(orders.map((row:any)=>Number(row.channel_id)).filter(Boolean))]
 let channels:any[]=[]
 if(channelIds.length){const result=await admin.from('channels').select('id,name,order_sla_minutes').eq('business_id',businessId).in('id',channelIds);if(result.error)throw result.error;channels=result.data||[]}
 const brandIds=[...new Set(orders.map((row:any)=>Number(row.brand_id)).filter(Boolean))]
 let brands:any[]=[]
 if(brandIds.length){const result=await admin.from('brands').select('id,name,accent_color').eq('business_id',businessId).in('id',brandIds);if(!result.error)brands=result.data||[]}
 const productMap=new Map(products.map((row:any)=>[Number(row.id),row])),channelMap=new Map(channels.map((row:any)=>[Number(row.id),row])),brandMap=new Map(brands.map((row:any)=>[Number(row.id),row]))
 const enriched=orders.map((order:any)=>{
  const orderItems=items.filter((row:any)=>Number(row.order_id)===Number(order.id)).map((row:any)=>{
   const product:any=productMap.get(Number(row.product_id))||{},productSla=product.prep_sla_minutes==null?defaultSla:Number(product.prep_sla_minutes)
   return{product_id:Number(row.product_id),name:product.name||'Produto',quantity:Number(row.quantity||0),unit_price_cents:Number(row.unit_price_cents||0),prep_sla_minutes:productSla,sla_source:product.prep_sla_minutes==null?'business_default':'product'}
  })
  const prepSla=orderItems.length?Math.max(...orderItems.map((row:any)=>Number(row.prep_sla_minutes||defaultSla))):defaultSla
  const channel:any=channelMap.get(Number(order.channel_id))||null,channelSla=channel?.order_sla_minutes==null?null:Number(channel.order_sla_minutes)
  const effective=channelSla==null?prepSla:Math.min(prepSla,channelSla),age=Math.max(0,Math.floor((Date.now()-new Date(order.created_at).getTime())/60000)),state=urgency(age,effective),brand:any=brandMap.get(Number(order.brand_id))||null
  return{id:Number(order.id),status:order.status,source:order.source,total_cents:Number(order.total_cents||0),version:Number(order.version||1),age_minutes:age,persisted_delayed:Boolean(order.delayed),delayed:Boolean(order.delayed)||state.due_in_minutes<0,items:orderItems,default_sla_minutes:defaultSla,prep_sla_minutes:prepSla,channel_sla_minutes:channelSla,effective_sla_minutes:effective,due_in_minutes:state.due_in_minutes,urgency:state.urgency,sla_conflict:channelSla!==null&&prepSla>channelSla,channel:channel?{id:Number(channel.id),name:channel.name}:null,brand:brand?{id:Number(brand.id),name:brand.name,accent_color:brand.accent_color}:null}
 })
 const prep=enriched.filter((row:any)=>['new','confirmed','production'].includes(String(row.status)))
 return{generated_at:now(),business_id:businessId,default_kds_sla_minutes:defaultSla,summary:{open_orders:enriched.length,prep_orders:prep.length,overdue:prep.filter((row:any)=>row.urgency==='overdue').length,at_risk:prep.filter((row:any)=>['critical','warning'].includes(row.urgency)).length,sla_conflicts:prep.filter((row:any)=>row.sla_conflict).length},orders:enriched}
}

async function saveSettings(businessId:number,userId:number,payload:any){
 const defaultSla=minute(payload.default_kds_sla_minutes,5,240)
 if(Number.isNaN(defaultSla))return{error:'SLA padrão deve ficar entre 5 e 240 minutos.'}
 const products=Array.isArray(payload.products)?payload.products:[],channels=Array.isArray(payload.channels)?payload.channels:[]
 const normalizedProducts=[] as {id:number;prep_sla_minutes:number|null}[]
 for(const row of products){const id=Number(row?.id),value=minute(row?.prep_sla_minutes,1,240,true);if(!Number.isInteger(id)||id<=0||Number.isNaN(value as number))return{error:'SLA de produto inválido. Use vazio ou 1 a 240 minutos.'};normalizedProducts.push({id,prep_sla_minutes:value})}
 const normalizedChannels=[] as {id:number;order_sla_minutes:number|null}[]
 for(const row of channels){const id=Number(row?.id),value=minute(row?.order_sla_minutes,1,360,true);if(!Number.isInteger(id)||id<=0||Number.isNaN(value as number))return{error:'SLA de canal inválido. Use vazio ou 1 a 360 minutos.'};normalizedChannels.push({id,order_sla_minutes:value})}
 const productIds=[...new Set(normalizedProducts.map(row=>row.id))],channelIds=[...new Set(normalizedChannels.map(row=>row.id))]
 if(productIds.length){const owned=await admin.from('products').select('id').eq('business_id',businessId).in('id',productIds);if(owned.error)throw owned.error;if((owned.data||[]).length!==productIds.length)return{error:'Um produto não pertence a esta operação.'}}
 if(channelIds.length){const owned=await admin.from('channels').select('id').eq('business_id',businessId).in('id',channelIds);if(owned.error)throw owned.error;if((owned.data||[]).length!==channelIds.length)return{error:'Um canal não pertence a esta operação.'}}
 const businessUpdate=await admin.from('businesses').update({default_kds_sla_minutes:defaultSla,updated_at:now()}).eq('id',businessId);if(businessUpdate.error)throw businessUpdate.error
 for(const row of normalizedProducts){const result=await admin.from('products').update({prep_sla_minutes:row.prep_sla_minutes,updated_at:now()}).eq('id',row.id).eq('business_id',businessId);if(result.error)throw result.error}
 for(const row of normalizedChannels){const result=await admin.from('channels').update({order_sla_minutes:row.order_sla_minutes,updated_at:now()}).eq('id',row.id).eq('business_id',businessId);if(result.error)throw result.error}
 await audit(businessId,userId,'kds.sla_settings.updated',{default_kds_sla_minutes:defaultSla,products:normalizedProducts,channels:normalizedChannels})
 return{data:await settings(businessId)}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
 const path=routePath(req),method=req.method
 try{
  if(path==='/livez'&&method==='GET')return json({ok:true,service:SLUG,version:'5.4.0'})
  if(path==='/readyz'&&method==='GET'){
   const[b,p,c]=await Promise.all([admin.from('businesses').select('default_kds_sla_minutes',{head:true,count:'exact'}),admin.from('products').select('prep_sla_minutes',{head:true,count:'exact'}),admin.from('channels').select('order_sla_minutes',{head:true,count:'exact'})])
   return b.error||p.error||c.error?fail('database_not_ready',503):json({ok:true,database:'ready',sla_columns:'ready',version:'5.4.0'})
  }
  const auth=await authUser(req);if(!auth)return fail('Sessão inválida',401)
  const profile:any=await ensureProfile(auth)
  let match=path.match(/^\/businesses\/(\d+)\/kds$/)
  if(match&&method==='GET'){const businessId=Number(match[1]);if(!await membership(profile.id,businessId))return fail('Sem acesso',403);return json(await kds(businessId))}
  match=path.match(/^\/businesses\/(\d+)\/kds\/settings$/)
  if(match&&method==='GET'){const businessId=Number(match[1]);if(!await membership(profile.id,businessId))return fail('Sem acesso',403);return json(await settings(businessId))}
  if(match&&method==='PATCH'){const businessId=Number(match[1]);if(!await membership(profile.id,businessId,['owner','admin']))return fail('Somente owner/admin',403);const result=await saveSettings(businessId,profile.id,await body(req));return result.error?fail(result.error,422):json(result.data)}
  return fail('Rota não encontrada',404)
 }catch(error){console.error(`${SLUG} error`,error);return fail('Erro interno',500)}
})
