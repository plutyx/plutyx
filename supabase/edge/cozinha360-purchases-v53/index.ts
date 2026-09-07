import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORE=(Deno.env.get('C360_CORE_API_URL')||`${SUPABASE_URL}/functions/v1/cozinha360-api-v2`).replace(/\/$/,'')
const SLUG='cozinha360-purchases-v53'
const anon=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}})

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
 'Content-Type':'application/json; charset=utf-8',
}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors})
const fail=(detail:string,status=400)=>json({detail},status)
const int=(value:unknown,fallback=0)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback
const money=(value:unknown)=>Math.max(0,Math.round(Number(value||0)))
const now=()=>new Date().toISOString()
const DAY=86_400_000

function routePath(req:Request){
 const path=new URL(req.url).pathname,marker=`/${SLUG}`,at=path.indexOf(marker)
 return at>=0?(path.slice(at+marker.length)||'/'):path
}
async function body(req:Request){try{return await req.json()}catch{return{}}}
async function authUser(req:Request){
 const header=req.headers.get('Authorization')||'',token=header.startsWith('Bearer ')?header.slice(7):''
 if(!token)return null
 const{data,error}=await anon.auth.getUser(token)
 return error||!data.user?null:data.user
}
async function ensureProfile(user:any){
 let{data:row}=await admin.from('users').select('*').eq('auth_user_id',user.id).maybeSingle()
 const email=String(user.email||'').toLowerCase(),fullName=String(user.user_metadata?.full_name||user.user_metadata?.name||'')
 if(!row&&email){
  const{data:existing}=await admin.from('users').select('*').ilike('email',email).maybeSingle()
  if(existing){const{data:updated,error}=await admin.from('users').update({auth_user_id:user.id,full_name:existing.full_name||fullName,updated_at:now()}).eq('id',existing.id).select('*').single();if(error)throw error;row=updated}
 }
 if(!row){const{data:created,error}=await admin.from('users').insert({email,password_hash:'supabase-auth',full_name:fullName,auth_user_id:user.id}).select('*').single();if(error)throw error;row=created}
 return row
}
async function member(userId:number,businessId:number,roles=['owner','admin','member']){
 const{data,error}=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle()
 if(error)throw error
 return data&&roles.includes(data.role)?data:null
}

async function demandPlan(businessId:number,historyDays:number,coverDays:number){
 const recentDays=Math.min(7,historyDays),priorDays=Math.max(0,historyDays-recentDays)
 const since=new Date(Date.now()-historyDays*DAY).toISOString(),recentCutoff=Date.now()-recentDays*DAY
 const[{data:ingredients=[],error:ingredientError},{data:completed=[],error:completedError},{data:openOrders=[],error:openError}]=await Promise.all([
  admin.from('ingredients').select('id,name,unit,last_purchase_price_cents,last_purchase_qty_milliunits,on_hand_milliunits,par_level_milliunits,reorder_target_milliunits').eq('business_id',businessId).eq('soft_deleted',false).order('name'),
  admin.from('orders').select('id,status,created_at,completed_at,inventory_consumed').eq('business_id',businessId).eq('status','completed').gte('created_at',since),
  admin.from('orders').select('id,status,created_at,completed_at,inventory_consumed').eq('business_id',businessId).eq('inventory_consumed',false).in('status',['new','confirmed','production','awaiting_delivery']),
 ])
 if(ingredientError)throw ingredientError;if(completedError)throw completedError;if(openError)throw openError
 const completedIds=(completed||[]).map((row:any)=>Number(row.id)),openIds=(openOrders||[]).map((row:any)=>Number(row.id)),orderIds=[...new Set([...completedIds,...openIds])]
 let orderItems:any[]=[]
 if(orderIds.length){const result=await admin.from('order_items').select('order_id,product_id,quantity').eq('business_id',businessId).in('order_id',orderIds);if(result.error)throw result.error;orderItems=result.data||[]}
 const productIds=[...new Set(orderItems.map((row:any)=>Number(row.product_id)).filter(Boolean))]
 let recipeRows:any[]=[]
 if(productIds.length){const result=await admin.from('recipe_items').select('product_id,ingredient_id,qty_used_milliunits').in('product_id',productIds);if(result.error)throw result.error;recipeRows=result.data||[]}
 const completedMap=new Map((completed||[]).map((row:any)=>[Number(row.id),row])),openSet=new Set(openIds)
 const recipeMap=new Map<number,any[]>()
 for(const row of recipeRows){const pid=Number(row.product_id),rows=recipeMap.get(pid)||[];rows.push(row);recipeMap.set(pid,rows)}
 const productStats=new Map<number,{recent:number;prior:number}>(),openQty=new Map<number,number>()
 let observedUnits=0,mappedUnits=0
 for(const row of orderItems){
  const orderId=Number(row.order_id),productId=Number(row.product_id),quantity=Math.max(0,Number(row.quantity||0));if(!productId||quantity<=0)continue
  observedUnits+=quantity;if((recipeMap.get(productId)||[]).length)mappedUnits+=quantity
  if(openSet.has(orderId)){openQty.set(productId,(openQty.get(productId)||0)+quantity);continue}
  const order:any=completedMap.get(orderId);if(!order)continue
  const ts=new Date(order.completed_at||order.created_at||0).getTime(),stats=productStats.get(productId)||{recent:0,prior:0}
  if(Number.isFinite(ts)&&ts>=recentCutoff)stats.recent+=quantity;else stats.prior+=quantity
  productStats.set(productId,stats)
 }
 const completedCount=(completed||[]).length,confidence=completedCount>=20?'high':completedCount>=8?'medium':'low',confidenceFactor=confidence==='high'?1:confidence==='medium'?.85:.65
 const forecastQty=new Map<number,number>()
 for(const productId of productIds){
  const stats=productStats.get(productId)||{recent:0,prior:0}
  const recentDaily=recentDays>0?stats.recent/recentDays:0,priorDaily=priorDays>0?stats.prior/priorDays:0
  const daily=stats.recent>0&&stats.prior>0?.65*recentDaily+.35*priorDaily:stats.recent>0?recentDaily:priorDaily
  forecastQty.set(productId,Math.max(0,Math.ceil(daily*coverDays*confidenceFactor)))
 }
 const demandByIngredient=new Map<number,{committed:number;forecast:number}>()
 for(const productId of productIds){
  const recipes=recipeMap.get(productId)||[],committedUnits=openQty.get(productId)||0,forecastUnits=forecastQty.get(productId)||0
  for(const recipe of recipes){
   const ingredientId=Number(recipe.ingredient_id),perUnit=Math.max(0,Number(recipe.qty_used_milliunits||0));if(!ingredientId||perUnit<=0)continue
   const current=demandByIngredient.get(ingredientId)||{committed:0,forecast:0}
   current.committed+=committedUnits*perUnit;current.forecast+=forecastUnits*perUnit;demandByIngredient.set(ingredientId,current)
  }
 }
 const rows=(ingredients||[]).map((row:any)=>{
  const onHand=Number(row.on_hand_milliunits||0),minimum=Math.max(0,Number(row.par_level_milliunits||0)),target=Math.max(minimum,Number(row.reorder_target_milliunits||0))
  const demand=demandByIngredient.get(Number(row.id))||{committed:0,forecast:0},projectedAfterCommitted=onHand-demand.committed
  const baseline=Math.max(0,target-onHand),demandProtected=Math.max(0,demand.forecast+minimum-projectedAfterCommitted),suggested=Math.max(baseline,demandProtected),uplift=Math.max(0,suggested-baseline)
  const referenceQty=Math.max(0,Number(row.last_purchase_qty_milliunits||0)),referencePrice=Math.max(0,Number(row.last_purchase_price_cents||0)),estimated=referenceQty>0&&referencePrice>0?Math.round(referencePrice*suggested/referenceQty):0
  const dailyDemand=coverDays>0?demand.forecast/coverDays:0,cover=dailyDemand>0?Math.max(0,projectedAfterCommitted)/dailyDemand:null
  const tone=projectedAfterCommitted<=0&&(demand.committed>0||target>0)?'critical':projectedAfterCommitted<minimum?'warning':suggested>0?'attention':'stable'
  const reason=uplift>0?'demand':baseline>0?'target':'none'
  return{ingredient_id:Number(row.id),name:row.name,unit:row.unit,on_hand_milliunits:onHand,par_level_milliunits:minimum,reorder_target_milliunits:target,baseline_purchase_milliunits:baseline,committed_milliunits:Math.round(demand.committed),forecast_milliunits:Math.round(demand.forecast),projected_after_committed_milliunits:Math.round(projectedAfterCommitted),demand_uplift_milliunits:Math.round(uplift),stock_cover_days:cover===null?null:Math.round(cover*10)/10,suggested_purchase_milliunits:Math.round(suggested),last_purchase_price_cents:referencePrice,last_purchase_qty_milliunits:referenceQty,estimated_landed_cents:estimated,cost_confidence:referencePrice>0&&referenceQty>0?'reference':'missing',demand_signal:demand.forecast>0?confidence:'none',reason,tone}
 }).filter((row:any)=>row.suggested_purchase_milliunits>0)
 rows.sort((a:any,b:any)=>{const rank:any={critical:3,warning:2,attention:1,stable:0};return rank[b.tone]-rank[a.tone]||Number(b.demand_uplift_milliunits)-Number(a.demand_uplift_milliunits)||b.suggested_purchase_milliunits-a.suggested_purchase_milliunits||String(a.name).localeCompare(String(b.name),'pt-BR')})
 return{
  generated_at:now(),method:'demand_weighted_7_21_plus_par_target',
  summary:{items_to_buy:rows.length,critical:rows.filter((x:any)=>x.tone==='critical').length,estimated_landed_cents:rows.reduce((sum:number,x:any)=>sum+Number(x.estimated_landed_cents||0),0),missing_cost_reference:rows.filter((x:any)=>x.cost_confidence==='missing').length,demand_protected_items:rows.filter((x:any)=>Number(x.demand_uplift_milliunits)>0).length,history_days:historyDays,cover_days:coverDays,completed_orders:completedCount,open_orders:(openOrders||[]).length,recipe_coverage_bps:observedUnits?Math.round(mappedUnits*10000/observedUnits):10000,demand_confidence:confidence},
  items:rows,
  safety_note:`Previsão determinística: últimos ${historyDays} dias, maior peso para os 7 dias recentes e horizonte de ${coverDays} dias. A fila aberta é somada antes da projeção. Histórico curto reduz automaticamente o peso da previsão. A compra só altera estoque após confirmação explícita.`
 }
}

async function history(businessId:number,limit:number){
 const safeLimit=Math.min(100,Math.max(1,limit))
 const{data:purchases=[],error}=await admin.from('purchases').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(safeLimit);if(error)throw error
 const ingredientIds=[...new Set((purchases||[]).map((x:any)=>Number(x.ingredient_id)).filter(Boolean))],supplierIds=[...new Set((purchases||[]).map((x:any)=>Number(x.supplier_id)).filter(Boolean))]
 let ingredients:any[]=[];let suppliers:any[]=[]
 if(ingredientIds.length){const result=await admin.from('ingredients').select('id,name,unit').eq('business_id',businessId).eq('soft_deleted',false).in('id',ingredientIds);if(result.error)throw result.error;ingredients=result.data||[]}
 if(supplierIds.length){const result=await admin.from('suppliers').select('id,name').eq('business_id',businessId).eq('soft_deleted',false).in('id',supplierIds);if(result.error)throw result.error;suppliers=result.data||[]}
 const ingredientMap=new Map(ingredients.map((x:any)=>[Number(x.id),x])),supplierMap=new Map(suppliers.map((x:any)=>[Number(x.id),x]))
 const rows=(purchases||[]).map((row:any)=>{const ingredient:any=ingredientMap.get(Number(row.ingredient_id))||{},supplier:any=supplierMap.get(Number(row.supplier_id))||{},quantity=Math.max(1,Number(row.quantity_milliunits||0)),landed=money(row.total_cents)+money(row.freight_cents)+money(row.tax_cents);return{id:Number(row.id),ingredient_id:Number(row.ingredient_id),ingredient_name:ingredient.name||'Ingrediente',unit:ingredient.unit||'un',supplier_id:row.supplier_id?Number(row.supplier_id):null,supplier_name:supplier.name||'',quantity_milliunits:quantity,total_cents:money(row.total_cents),freight_cents:money(row.freight_cents),tax_cents:money(row.tax_cents),landed_cents:landed,landed_per_1000_cents:Math.round(landed*1000/quantity),created_at:row.created_at}})
 const lastByIngredient=new Map<number,any>()
 for(let i=rows.length-1;i>=0;i--){const row:any=rows[i],previous=lastByIngredient.get(row.ingredient_id);row.previous_landed_per_1000_cents=previous?.landed_per_1000_cents??null;row.change_bps=previous?.landed_per_1000_cents>0?Math.round((row.landed_per_1000_cents-previous.landed_per_1000_cents)*10000/previous.landed_per_1000_cents):null;lastByIngredient.set(row.ingredient_id,row)}
 return{generated_at:now(),rows}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
 const path=routePath(req),method=req.method,url=new URL(req.url)
 try{
  if(path==='/livez'&&method==='GET')return json({ok:true,service:SLUG,version:'5.3.0'})
  if(path==='/readyz'&&method==='GET'){const[{error:purchasesError},{error:ordersError},{error:recipesError}]=await Promise.all([admin.from('purchases').select('id',{head:true,count:'exact'}),admin.from('orders').select('id',{head:true,count:'exact'}),admin.from('recipe_items').select('id',{head:true,count:'exact'})]);return purchasesError||ordersError||recipesError?fail('database_not_ready',503):json({ok:true,database:'ready',demand_inputs:'ready',version:'5.3.0'})}
  const auth=await authUser(req);if(!auth)return fail('Sessão inválida',401)
  const profile:any=await ensureProfile(auth)
  let match=path.match(/^\/businesses\/(\d+)\/purchase-plan$/)
  if(match&&method==='GET'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId))return fail('Sem acesso',403)
   const historyDays=Math.min(90,Math.max(7,int(url.searchParams.get('history_days'),28))),coverDays=Math.min(30,Math.max(1,int(url.searchParams.get('cover_days'),7)))
   return json(await demandPlan(businessId,historyDays,coverDays))
  }
  match=path.match(/^\/businesses\/(\d+)\/purchases$/)
  if(match&&method==='GET'){const businessId=Number(match[1]);if(!await member(profile.id,businessId))return fail('Sem acesso',403);return json(await history(businessId,int(url.searchParams.get('limit'),30)))}
  if(match&&method==='POST'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId,['owner','admin']))return fail('Somente owner/admin',403)
   const payload=await body(req),authorization=req.headers.get('Authorization')||'',supplierId=Math.max(0,int(payload.supplier_id))
   if(supplierId){const{data:supplier,error}=await admin.from('suppliers').select('id').eq('id',supplierId).eq('business_id',businessId).eq('soft_deleted',false).maybeSingle();if(error)throw error;if(!supplier)return fail('Fornecedor não pertence a esta operação',422);payload.supplier_id=supplierId}else payload.supplier_id=null
   const response=await fetch(`${CORE}/businesses/${businessId}/purchases`,{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify(payload)}),responseBody=await response.json().catch(()=>({detail:'Resposta inválida do núcleo'}))
   return json(responseBody,response.status)
  }
  return fail('Rota não encontrada',404)
 }catch(error){console.error('Compras 360 v5.3 error',error);const message=String((error as any)?.message||error||'Erro interno');if(message.includes('duplicate key'))return fail('Registro duplicado',409);return fail('Erro interno',500)}
})
