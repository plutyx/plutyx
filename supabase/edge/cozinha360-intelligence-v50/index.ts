import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anon=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}})
const VERSION='5.0.0'
const allowedOrigins=new Set([
  'https://cozinha-360-os-v41.onrender.com',
  'https://cozinha-360-os.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

class HttpError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status}}
const nowIso=()=>new Date().toISOString()
const n=(v:unknown,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback
const int=(v:unknown,fallback=0)=>Number.isFinite(Number(v))?Math.trunc(Number(v)):fallback
const moneyInt=(v:unknown)=>Math.max(0,Math.round(n(v)))
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v))
const ageMinutes=(raw:any)=>Math.max(0,Math.floor((Date.now()-new Date(raw||Date.now()).getTime())/60000))
const cors=(req:Request)=>{
  const origin=req.headers.get('Origin')||''
  return {
    'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://cozinha-360-os-v41.onrender.com',
    'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
  }
}
const j=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)})
const parseJson=async(req:Request)=>{try{return await req.json()}catch{return{}}}
function routePath(req:Request){const p=new URL(req.url).pathname,marker='/cozinha360-intelligence-v50',i=p.indexOf(marker);return i>=0?(p.slice(i+marker.length)||'/'):p}
async function authUser(req:Request){const h=req.headers.get('Authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;const{data,error}=await anon.auth.getUser(token);return error||!data.user?null:data.user}
async function ensureProfile(u:any){
  let{data:row}=await admin.from('users').select('*').eq('auth_user_id',u.id).maybeSingle()
  const email=String(u.email||'').toLowerCase(),fullName=String(u.user_metadata?.full_name||u.user_metadata?.name||'')
  if(!row&&email){const{data:existing}=await admin.from('users').select('*').ilike('email',email).maybeSingle();if(existing){const{data:updated,error}=await admin.from('users').update({auth_user_id:u.id,full_name:existing.full_name||fullName,updated_at:nowIso()}).eq('id',existing.id).select('*').single();if(error)throw error;row=updated}}
  if(!row){const{data:created,error}=await admin.from('users').insert({email,password_hash:'supabase-auth',full_name:fullName,auth_user_id:u.id}).select('*').single();if(error)throw error;row=created}
  return row
}
async function context(req:Request){const auth=await authUser(req);if(!auth)return null;return{auth,profile:await ensureProfile(auth)}}
async function membership(userId:number,businessId:number,allowed=['owner','admin','member']){const{data,error}=await admin.from('memberships').select('*').eq('user_id',userId).eq('business_id',businessId).maybeSingle();if(error)throw error;return data&&allowed.includes(data.role)?data:null}
async function audit(businessId:number,userId:number,action:string,entityType:string,entityId:string|number,payload:any={}){await admin.from('audit_logs').insert({business_id:businessId,actor_user_id:userId,action,entity_type:entityType,entity_id:String(entityId),payload_json:JSON.stringify(payload)})}

async function productCostPreview(businessId:number,productId:number){
  const{data:product,error:pError}=await admin.from('products').select('*').eq('id',productId).eq('business_id',businessId).eq('soft_deleted',false).maybeSingle();if(pError)throw pError;if(!product||!product.active)throw new HttpError(404,'Produto não encontrado ou inativo')
  const{data:recipes=[],error:rError}=await admin.from('recipe_items').select('*').eq('product_id',productId);if(rError)throw rError;if(!(recipes||[]).length)throw new HttpError(422,'Cadastre a ficha técnica antes de vender este produto')
  const ingredientIds=[...new Set((recipes||[]).map((x:any)=>Number(x.ingredient_id)))];const{data:ingredients=[],error:iError}=await admin.from('ingredients').select('*').eq('business_id',businessId).eq('soft_deleted',false).in('id',ingredientIds);if(iError)throw iError
  const byId=new Map((ingredients||[]).map((x:any)=>[Number(x.id),x]));let ingredientsCents=0;const missing:string[]=[];const items:any[]=[]
  for(const recipe of recipes||[]){const ing:any=byId.get(Number(recipe.ingredient_id));if(!ing)continue;if(Number(ing.last_purchase_price_cents||0)<=0){missing.push(String(ing.name));continue}const estimated=Math.round(Number(ing.last_purchase_price_cents||0)*Number(recipe.qty_used_milliunits||0)/Math.max(1,Number(ing.usable_qty_milliunits||1)));ingredientsCents+=estimated;items.push({ingredient_id:ing.id,name:ing.name,qty_used_milliunits:Number(recipe.qty_used_milliunits||0),estimated_cost_cents:estimated})}
  if(missing.length)throw new HttpError(422,`Registre o custo de compra antes de vender: ${missing.sort().join(', ')}`)
  const units=Math.max(1,Number(product.units_per_batch||1)),energy=Math.round(Number(product.energy_cents_per_batch||0)/units),labor=Math.round(Number(product.labor_cents_per_batch||0)/units),packaging=Number(product.packaging_cents_per_unit||0),direct=ingredientsCents+energy+labor+packaging
  return{product_id:product.id,product_name:product.name,ingredients_cents:ingredientsCents,packaging_cents:packaging,energy_cents:energy,labor_cents:labor,direct_cost_per_unit_cents:direct,recipe_items:items,method:'current_recipe_plus_product_overheads'}
}

async function portfolioOverview(userId:number){
  const{data:mems=[],error:mError}=await admin.from('memberships').select('*').eq('user_id',userId);if(mError)throw mError
  const bids=(mems||[]).map((m:any)=>Number(m.business_id));if(!bids.length)return{generated_at:nowIso(),period_days:30,summary:{businesses:0,attention:0,critical:0,revenue_cents:0,contribution_cents:0,order_count:0,open_orders:0,delayed_open:0,stock_alerts:0},top_action:null,businesses:[]}
  const since=new Date(Date.now()-30*86400000).toISOString()
  const[{data:businesses=[]},{data:recent=[]},{data:open=[]},{data:ingredients=[]}]=await Promise.all([
    admin.from('businesses').select('*').in('id',bids).eq('soft_deleted',false),
    admin.from('orders').select('id,business_id,total_cents,contribution_cents,paid,delayed,error_flag,created_at,status').in('business_id',bids).gte('created_at',since),
    admin.from('orders').select('id,business_id,delayed,created_at,status').in('business_id',bids).not('status','in','("completed","cancelled")'),
    admin.from('ingredients').select('id,business_id,on_hand_milliunits,par_level_milliunits').in('business_id',bids).eq('soft_deleted',false),
  ])
  const rows:any[]=[]
  for(const b of businesses||[]){
    const bid=Number(b.id),paid=(recent||[]).filter((o:any)=>Number(o.business_id)===bid&&Boolean(o.paid)),openRows=(open||[]).filter((o:any)=>Number(o.business_id)===bid),delayedOpen=openRows.filter((o:any)=>o.delayed),stock=(ingredients||[]).filter((x:any)=>Number(x.business_id)===bid&&Number(x.par_level_milliunits||0)>0&&Number(x.on_hand_milliunits||0)<Number(x.par_level_milliunits||0))
    const revenue=paid.reduce((s:number,o:any)=>s+Number(o.total_cents||0),0),contribution=paid.reduce((s:number,o:any)=>s+Number(o.contribution_cents||0),0),orderCount=paid.length,marginBps=revenue?Math.round(contribution*10000/revenue):0,delayRate=orderCount?paid.filter((o:any)=>o.delayed).length/orderCount:0,errorRate=orderCount?paid.filter((o:any)=>o.error_flag).length/orderCount:0
    const signals:any[]=[]
    if(contribution<0&&orderCount)signals.push({score:100,code:'negative_contribution',tone:'critical',title:'Contribuição negativa',detail:'Não acelere aquisição antes de corrigir preço, custo ou mix.'})
    if(delayedOpen.length)signals.push({score:96,code:'delayed_open',tone:'critical',title:`${delayedOpen.length} pedido(s) atrasado(s)`,detail:`O mais antigo está aberto há aproximadamente ${Math.max(...delayedOpen.map((o:any)=>ageMinutes(o.created_at)))} min.`})
    if(stock.length)signals.push({score:90,code:'stock',tone:'critical',title:`${stock.length} item(ns) abaixo do mínimo`,detail:'Há risco de ruptura ou substituição na produção.'})
    if(delayRate>.15)signals.push({score:82,code:'delay_rate',tone:'warning',title:'Atraso recorrente',detail:`Taxa de atraso em 30 dias: ${Math.round(delayRate*100)}%.`})
    if(errorRate>.05)signals.push({score:78,code:'error_rate',tone:'warning',title:'Erros acima do limite',detail:`Taxa de erro em 30 dias: ${Math.round(errorRate*100)}%.`})
    if(!orderCount)signals.push({score:28,code:'no_data',tone:'neutral',title:'Sem pedidos pagos recentes',detail:'Ainda não há base de 30 dias para comparar margem e qualidade.'})
    if(!signals.length)signals.push({score:10,code:'stable',tone:'stable',title:'Sem bloqueio crítico detectado',detail:'Margem, atraso, erro e estoque não dispararam os limites desta visão.'})
    signals.sort((a,b)=>b.score-a.score);const mem=(mems||[]).find((m:any)=>Number(m.business_id)===bid)
    rows.push({business_id:bid,name:b.name,city:b.city||'',role:mem?.role||'member',revenue_cents:revenue,contribution_cents:contribution,contribution_margin_bps:marginBps,order_count:orderCount,open_orders:openRows.length,delayed_open:delayedOpen.length,delay_rate:Math.round(delayRate*10000)/10000,error_rate:Math.round(errorRate*10000)/10000,stock_alerts:stock.length,attention:signals[0],signals})
  }
  rows.sort((a,b)=>b.attention.score-a.attention.score||String(a.name).localeCompare(String(b.name),'pt-BR'))
  const summary={businesses:rows.length,attention:rows.filter(x=>x.attention.score>=70).length,critical:rows.filter(x=>x.attention.tone==='critical').length,revenue_cents:rows.reduce((s,x)=>s+x.revenue_cents,0),contribution_cents:rows.reduce((s,x)=>s+x.contribution_cents,0),order_count:rows.reduce((s,x)=>s+x.order_count,0),open_orders:rows.reduce((s,x)=>s+x.open_orders,0),delayed_open:rows.reduce((s,x)=>s+x.delayed_open,0),stock_alerts:rows.reduce((s,x)=>s+x.stock_alerts,0)}
  const top=rows[0];return{generated_at:nowIso(),period_days:30,summary,top_action:top?{business_id:top.business_id,business_name:top.name,score:top.attention.score,tone:top.attention.tone,title:top.attention.title,detail:top.attention.detail,href:`/?today=1&business_id=${top.business_id}`}:null,businesses:rows}
}

function inWindow(raw:any,start:number,end:number){const t=new Date(raw||0).getTime();return Number.isFinite(t)&&t>start&&t<=end}
async function smartCmv(businessId:number){
  const[{data:ingredients=[]},{data:counts=[]},{data:purchases=[]},{data:losses=[]},{data:snapshots=[]},{data:completed=[]}]=await Promise.all([
    admin.from('ingredients').select('*').eq('business_id',businessId).eq('soft_deleted',false).order('name'),
    admin.from('inventory_counts').select('*').eq('business_id',businessId).order('created_at',{ascending:false}),
    admin.from('purchases').select('*').eq('business_id',businessId),
    admin.from('losses').select('*').eq('business_id',businessId),
    admin.from('order_recipe_snapshots').select('*').eq('business_id',businessId),
    admin.from('orders').select('id,created_at,completed_at,status').eq('business_id',businessId).eq('status','completed'),
  ])
  const snapshotOrderSet=new Set((snapshots||[]).map((x:any)=>Number(x.order_id))),legacyOrderIds=(completed||[]).filter((o:any)=>!snapshotOrderSet.has(Number(o.id))).map((o:any)=>Number(o.id))
  let legacyItems:any[]=[];if(legacyOrderIds.length){const r=await admin.from('order_items').select('order_id,product_id,quantity').in('order_id',legacyOrderIds);legacyItems=r.data||[]}
  const legacyProductIds=[...new Set(legacyItems.map((x:any)=>Number(x.product_id)))];let legacyRecipes:any[]=[];if(legacyProductIds.length){const r=await admin.from('recipe_items').select('product_id,ingredient_id,qty_used_milliunits').in('product_id',legacyProductIds);legacyRecipes=r.data||[]}
  const rows:any[]=[],readyRows:any[]=[]
  for(const ing of ingredients||[]){
    const ic=(counts||[]).filter((x:any)=>Number(x.ingredient_id)===Number(ing.id)).sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())
    if(ic.length<2){const last=ic[0];rows.push({ingredient_id:ing.id,name:ing.name,unit:ing.unit,status:last?'needs_count':'needs_two_counts',count_count:ic.length,last_count_at:last?.created_at||null,current_on_hand_milliunits:Number(ing.on_hand_milliunits||0),message:last?'Faça mais uma contagem física para comparar consumo observado e teórico.':'Faça duas contagens físicas em dias diferentes para liberar a comparação observada.'});continue}
    const closing=ic[0],opening=ic[1],start=new Date(opening.created_at).getTime(),end=new Date(closing.created_at).getTime(),periodPurchases=(purchases||[]).filter((x:any)=>Number(x.ingredient_id)===Number(ing.id)&&inWindow(x.created_at,start,end)),purchasedQty=periodPurchases.reduce((s:number,x:any)=>s+Math.max(0,Number(x.quantity_milliunits||0)),0),purchasedLanded=periodPurchases.reduce((s:number,x:any)=>s+Math.max(0,Number(x.total_cents||0)+Number(x.freight_cents||0)+Number(x.tax_cents||0)),0),recordedLoss=(losses||[]).filter((x:any)=>Number(x.ingredient_id)===Number(ing.id)&&inWindow(x.created_at,start,end)).reduce((s:number,x:any)=>s+Math.max(0,Number(x.qty_milliunits||0)),0)
    const periodOrders=(completed||[]).filter((o:any)=>inWindow(o.completed_at||o.created_at,start,end)),periodSnaps=(snapshots||[]).filter((x:any)=>Number(x.ingredient_id)===Number(ing.id)&&inWindow(x.created_at,start,end)),periodSnapshotOrderIds=new Set(periodSnaps.map((x:any)=>Number(x.order_id))),snapshotQty=periodSnaps.reduce((s:number,x:any)=>s+Number(x.total_qty_milliunits||0),0),legacyIds=periodOrders.map((o:any)=>Number(o.id)).filter((id:number)=>!periodSnapshotOrderIds.has(id));let legacyQty=0
    for(const oid of legacyIds){for(const item of legacyItems.filter((x:any)=>Number(x.order_id)===oid)){const recipe=legacyRecipes.find((r:any)=>Number(r.product_id)===Number(item.product_id)&&Number(r.ingredient_id)===Number(ing.id));if(recipe)legacyQty+=Number(item.quantity||0)*Number(recipe.qty_used_milliunits||0)}}
    const theoretical=snapshotQty+legacyQty,observed=Number(opening.counted_milliunits||0)+purchasedQty-Number(closing.counted_milliunits||0)-recordedLoss,unexplained=observed-theoretical,purchaseQty=periodPurchases.reduce((s:number,x:any)=>s+Math.max(0,Number(x.quantity_milliunits||0)),0),purchaseCost=periodPurchases.reduce((s:number,x:any)=>s+Math.max(0,Number(x.total_cents||0)+Number(x.freight_cents||0)+Number(x.tax_cents||0)),0);let costPer1000=0,costBasis='missing_cost'
    if(purchaseQty>0&&purchaseCost>0){costPer1000=Math.round(purchaseCost*1000/purchaseQty);costBasis='weighted_purchases_in_period'}else if(Number(ing.usable_qty_milliunits||0)>0&&Number(ing.last_purchase_price_cents||0)>0){costPer1000=Math.round(Number(ing.last_purchase_price_cents)*1000/Math.max(1,Number(ing.usable_qty_milliunits)));costBasis='last_purchase_cost'}
    const value=(qty:number)=>Math.round(qty*costPer1000/1000),ratio=theoretical?Math.abs(unexplained)/Math.max(1,theoretical):(unexplained?1:0);let signal='balanced',severity='stable',action='Variação dentro do limite de 10%; continue contando no mesmo ritmo.'
    if(observed<0){signal='data_error';severity='critical';action='Revise contagens e compras: o período resultou em consumo observado negativo.'}else if(unexplained>0&&ratio>=.10){signal='shrink';severity=ratio>=.25?'critical':'warning';action='Investigue porcionamento, perdas não registradas, brindes, erros de ficha ou contagem.'}else if(unexplained<0&&ratio>=.10){signal='surplus';severity='warning';action='Revise ficha técnica, rendimento, unidade de medida ou registros de compra/contagem.'}
    let confidence=legacyIds.length?'medium':'high';const intervalDays=Math.max(0,(end-start)/86400000);if(costPer1000<=0||intervalDays<.5)confidence='low';const row={ingredient_id:ing.id,name:ing.name,unit:ing.unit,status:'ready',from:opening.created_at,to:closing.created_at,interval_days:Math.round(intervalDays*100)/100,opening_milliunits:Number(opening.counted_milliunits||0),purchased_milliunits:purchasedQty,purchased_landed_cents:purchasedLanded,recorded_loss_milliunits:recordedLoss,physical_closing_milliunits:Number(closing.counted_milliunits||0),observed_usage_milliunits:observed,theoretical_usage_milliunits:theoretical,unexplained_usage_milliunits:unexplained,cost_per_1000_milliunits_cents:costPer1000,cost_basis:costBasis,observed_cmv_cents:value(Math.max(0,observed)),theoretical_cmv_cents:value(Math.max(0,theoretical)),unexplained_value_cents:value(unexplained),variance_ratio:Math.round(ratio*10000)/10000,signal,severity,suggested_action:action,confidence,snapshot_orders:new Set(periodSnaps.map((x:any)=>Number(x.order_id))).size,legacy_orders:legacyIds.length,legacy_timing_orders:periodOrders.filter((o:any)=>!o.completed_at).length};rows.push(row);readyRows.push(row)
  }
  rows.sort((a,b)=>a.status==='ready'&&b.status!=='ready'?-1:a.status!=='ready'&&b.status==='ready'?1:Math.abs(Number(b.unexplained_value_cents||0))-Math.abs(Number(a.unexplained_value_cents||0))||String(a.name).localeCompare(String(b.name),'pt-BR'));readyRows.sort((a,b)=>Math.abs(Number(b.unexplained_value_cents||0))-Math.abs(Number(a.unexplained_value_cents||0)))
  const total=(ingredients||[]).length,ready=readyRows.length,summary={ingredients_total:total,ingredients_ready:ready,coverage:total?Math.round(ready/total*10000)/10000:0,critical:readyRows.filter(x=>x.severity==='critical').length,warning:readyRows.filter(x=>x.severity==='warning').length,observed_cmv_cents:readyRows.reduce((s,x)=>s+Number(x.observed_cmv_cents||0),0),theoretical_cmv_cents:readyRows.reduce((s,x)=>s+Number(x.theoretical_cmv_cents||0),0),unexplained_value_cents:readyRows.reduce((s,x)=>s+Number(x.unexplained_value_cents||0),0)},top=readyRows[0]
  const headline=top&&['critical','warning'].includes(top.severity)?{tone:top.severity,title:`${top.name}: ${Math.abs(Number(top.unexplained_usage_milliunits||0))} ${top.unit} de diferença sem explicação`,detail:top.suggested_action,ingredient_id:top.ingredient_id}:ready?{tone:'stable',title:'Contagens comparáveis sem desvio relevante no topo da lista',detail:'Continue registrando compras, perdas e contagens para aumentar a confiança.',ingredient_id:top?.ingredient_id||null}:{tone:'neutral',title:'O CMV observado começa com duas contagens físicas',detail:'Conte os ingredientes hoje e repita em outro dia. O 360 cruza compras, perdas e consumo teórico sem inventar dados.',ingredient_id:null}
  return{generated_at:nowIso(),method:'physical_counts_plus_purchases_minus_closing_minus_recorded_losses',summary,headline,ingredients:rows,accounting_note:'CMV observado é uma visão operacional estimada apenas para ingredientes com duas contagens comparáveis. Não substitui DRE contábil ou inventário fiscal.',safety_note:'O endpoint é somente leitura: não altera estoque, ficha técnica, compras ou pedidos.'}
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)})
  const path=routePath(req),method=req.method,url=new URL(req.url)
  try{
    if(path==='/health'||path==='/livez')return j(req,{status:'ok',ok:true,service:'cozinha360-intelligence-v50',version:VERSION})
    if(path==='/readyz'){const{error}=await admin.from('businesses').select('id',{head:true,count:'exact'});return error?j(req,{ok:false,database:'not_ready',version:VERSION},503):j(req,{ok:true,database:'ready',version:VERSION})}
    const c=await context(req);if(!c)throw new HttpError(401,'Sessão inválida');const user:any=c.profile
    if(path==='/portfolio/overview'&&method==='GET')return j(req,await portfolioOverview(Number(user.id)))
    let m=path.match(/^\/businesses\/(\d+)\/products\/(\d+)\/cost-preview$/)
    if(m&&method==='GET'){const bid=Number(m[1]),pid=Number(m[2]);if(!await membership(Number(user.id),bid))throw new HttpError(403,'Sem acesso');return j(req,await productCostPreview(bid,pid))}
    m=path.match(/^\/businesses\/(\d+)\/orders\/quick$/)
    if(m&&method==='POST'){
      const bid=Number(m[1]);if(!await membership(Number(user.id),bid))throw new HttpError(403,'Sem acesso');const b:any=await parseJson(req),productId=Number(b.product_id),quantity=clamp(int(b.quantity,1),1,10000),unitPrice=moneyInt(b.unit_price_cents);if(!productId||unitPrice<=0)throw new HttpError(422,'Produto e preço são obrigatórios')
      if(b.customer_id){const{data:customer}=await admin.from('customers').select('id').eq('id',Number(b.customer_id)).eq('business_id',bid).maybeSingle();if(!customer)throw new HttpError(404,'Cliente não encontrado')}
      const cost=await productCostPreview(bid,productId),key=String(b.idempotency_key||crypto.randomUUID()).slice(0,160),source=String(b.source||'manual').slice(0,80);let channel:any=null,channelCost={percentage_fee_cents:0,fixed_fee_cents:0,delivery_cents:0,promo_cents:0,media_cents:0,total_channel_cost_cents:0};const total=unitPrice*quantity
      if(b.channel_id){const{data:ch}=await admin.from('channels').select('*').eq('id',Number(b.channel_id)).eq('business_id',bid).maybeSingle();if(!ch)throw new HttpError(404,'Canal não encontrado');channel=ch;const percentage=Math.round(total*Number(ch.fee_bps||0)/10000);channelCost={percentage_fee_cents:percentage,fixed_fee_cents:Number(ch.fixed_fee_cents||0),delivery_cents:Number(ch.delivery_cents||0),promo_cents:Number(ch.promo_cents||0),media_cents:Number(ch.media_cents||0),total_channel_cost_cents:percentage+Number(ch.fixed_fee_cents||0)+Number(ch.delivery_cents||0)+Number(ch.promo_cents||0)+Number(ch.media_cents||0)}}
      const{data:created,error}=await admin.rpc('c360_create_order',{p_business_id:bid,p_source:source,p_paid:b.paid!==false,p_customer_id:b.customer_id||null,p_channel_id:b.channel_id||null,p_items:[{product_id:productId,quantity,unit_price_cents:unitPrice,unit_variable_cost_cents:cost.direct_cost_per_unit_cents}],p_idempotency_key:key});if(error)throw error
      let order:any=created;if(created?.idempotent_replay){const{data:existing}=await admin.from('orders').select('*').eq('id',Number(created.id)).eq('business_id',bid).single();order={...created,...existing,idempotent_replay:true}}else if(channelCost.total_channel_cost_cents){const variable=Number(created.variable_cost_cents||0)+channelCost.total_channel_cost_cents,contribution=Number(created.total_cents||total)-variable;const{data:updated,error:uError}=await admin.from('orders').update({variable_cost_cents:variable,contribution_cents:contribution,updated_at:nowIso()}).eq('id',Number(created.id)).eq('business_id',bid).select('*').single();if(uError)throw uError;order={...created,...updated,idempotent_replay:false}}
      if(!order.idempotent_replay)await audit(bid,Number(user.id),'order.quick_created','order',order.id,{product_id:productId,quantity,unit_price_cents:unitPrice,direct_cost_per_unit_cents:cost.direct_cost_per_unit_cents,channel_id:channel?.id||null,channel_cost_cents:channelCost.total_channel_cost_cents})
      return j(req,{id:Number(order.id),status:order.status||'new',total_cents:Number(order.total_cents||total),variable_cost_cents:Number(order.variable_cost_cents||cost.direct_cost_per_unit_cents*quantity),contribution_cents:Number(order.contribution_cents??(total-cost.direct_cost_per_unit_cents*quantity)),idempotency_key:key,idempotent_replay:Boolean(order.idempotent_replay),cost,channel:{id:channel?.id||null,name:channel?.name||'Direto',...channelCost}},order.idempotent_replay?200:201)
    }
    m=path.match(/^\/businesses\/(\d+)\/inventory\/counts$/)
    if(m&&method==='GET'){const bid=Number(m[1]);if(!await membership(Number(user.id),bid))throw new HttpError(403,'Sem acesso');const limit=clamp(int(url.searchParams.get('limit'),100),1,500),{data,error}=await admin.from('inventory_counts').select('*').eq('business_id',bid).order('created_at',{ascending:false}).limit(limit);if(error)throw error;return j(req,data||[])}
    if(m&&method==='POST'){const bid=Number(m[1]);if(!await membership(Number(user.id),bid))throw new HttpError(403,'Sem acesso');const b:any=await parseJson(req),ingredientId=Number(b.ingredient_id),counted=int(b.counted_milliunits,-1);if(!ingredientId||counted<0)throw new HttpError(422,'Ingrediente e contagem válida são obrigatórios');const{data,error}=await admin.rpc('c360_record_inventory_count_v50',{p_business_id:bid,p_ingredient_id:ingredientId,p_user_id:Number(user.id),p_counted_milliunits:counted,p_note:String(b.note||'').slice(0,500)});if(error){if(String(error.message).includes('INGREDIENT_NOT_FOUND'))throw new HttpError(404,'Ingrediente não encontrado');throw error}return j(req,data,201)}
    m=path.match(/^\/businesses\/(\d+)\/ingredients\/(\d+)\/inventory$/)
    if(m&&method==='PATCH'){const bid=Number(m[1]),iid=Number(m[2]);if(!await membership(Number(user.id),bid,['owner','admin']))throw new HttpError(403,'Somente owner/admin');const b:any=await parseJson(req),onHand=int(b.on_hand_milliunits,-1),par=int(b.par_level_milliunits,-1),target=int(b.reorder_target_milliunits,-1),expected=int(b.expected_version,-1);if(onHand<0||par<0||target<0||expected<1||target<par)throw new HttpError(422,'Revise estoque atual, mínimo, alvo e versão');const{data,error}=await admin.from('ingredients').update({on_hand_milliunits:onHand,par_level_milliunits:par,reorder_target_milliunits:target,version:expected+1,updated_at:nowIso()}).eq('id',iid).eq('business_id',bid).eq('soft_deleted',false).eq('version',expected).select('*').maybeSingle();if(error)throw error;if(!data)throw new HttpError(409,'Estoque foi alterado por outro usuário. Atualize a tela.');await audit(bid,Number(user.id),'inventory.configured','ingredient',iid,{on_hand_milliunits:onHand,par_level_milliunits:par,reorder_target_milliunits:target});return j(req,data)}
    m=path.match(/^\/businesses\/(\d+)\/smart-cmv$/)
    if(m&&method==='GET'){const bid=Number(m[1]);if(!await membership(Number(user.id),bid))throw new HttpError(403,'Sem acesso');return j(req,await smartCmv(bid))}
    throw new HttpError(404,'Rota não encontrada')
  }catch(e){console.error('cozinha360 intelligence error',e);if(e instanceof HttpError)return j(req,{detail:e.message},e.status);const msg=String((e as any)?.message||e||'Erro interno');if(msg.includes('duplicate key'))return j(req,{detail:'Registro duplicado'},409);return j(req,{detail:'Erro interno'},500)}
})
