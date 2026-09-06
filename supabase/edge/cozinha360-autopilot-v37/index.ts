import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORE_API=(Deno.env.get('C360_CORE_API_URL')||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-api-v2').replace(/\/$/,'')
const FUNCTION_SLUG='cozinha360-autopilot-v37'
const anon=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
const j=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors})
const fail=(detail:string,status=400,extra:Record<string,unknown>={})=>j({detail,...extra},status)
const rank:Record<string,number>={low:0,medium:1,high:2}

function routePath(req:Request){const p=new URL(req.url).pathname,marker='/'+FUNCTION_SLUG;const i=p.indexOf(marker);return i>=0?(p.slice(i+marker.length)||'/'):p}
function bearer(req:Request){const h=req.headers.get('authorization')||'';return h.startsWith('Bearer ')?h.slice(7):''}
async function body(req:Request){try{return await req.json()}catch{return{}}}
async function auth(req:Request){const token=bearer(req);if(!token)return null;const {data,error}=await anon.auth.getUser(token);if(error||!data.user)return null;let {data:profile}=await admin.from('users').select('id,email,full_name').eq('auth_user_id',data.user.id).maybeSingle();if(!profile&&data.user.email){const r=await admin.from('users').select('id,email,full_name').ilike('email',data.user.email).maybeSingle();profile=r.data}return profile||null}
async function membership(userId:number,businessId:number){const {data}=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle();return data||null}
async function core(path:string,token:string,options:RequestInit={}){const res=await fetch(`${CORE_API}${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})}});const payload=await res.json().catch(()=>({detail:'Resposta inválida do núcleo'}));if(!res.ok)throw new Error(typeof payload.detail==='string'?payload.detail:`Núcleo respondeu ${res.status}`);return payload}
function pct(raw:string|null,fallback:number,min:number,max:number){const n=Number(raw??fallback);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback}
function int(raw:string|null,fallback:number,min:number,max:number){return Math.round(pct(raw,fallback,min,max))}
function confidence(raw:string|null){return raw&&raw in rank?raw:'medium'}
function num(v:unknown){const n=Number(v||0);return Number.isFinite(n)?n:0}
function hex(buffer:ArrayBuffer){return [...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function sha(value:unknown){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))}

async function buildPlan(businessId:number,token:string,options:{horizon:number;bufferPct:number;minConfidence:string;protectStock:boolean}){
  const {horizon,bufferPct,minConfidence,protectStock}=options
  const [demand,production,ingredients,dashboard,finance]=await Promise.all([
    core(`/businesses/${businessId}/demand?horizon_days=${horizon}`,token),
    core(`/businesses/${businessId}/production`,token),
    core(`/businesses/${businessId}/ingredients`,token),
    core(`/businesses/${businessId}/dashboard`,token),
    core(`/businesses/${businessId}/finance/summary?days=30`,token),
  ])
  const demandRows=Array.isArray(demand.products)?demand.products:[]
  const active=Array.isArray(production)?production.filter((x:any)=>['planned','in_progress'].includes(String(x.status))):[]
  const activeBy=new Map<number,number>()
  for(const b of active){const remaining=Math.max(0,num(b.planned_qty)-num(b.produced_qty));activeBy.set(Number(b.product_id),(activeBy.get(Number(b.product_id))||0)+remaining)}
  const recipeRows=await Promise.all(demandRows.filter((x:any)=>num(x.recommended_units)>0).map(async(x:any)=>{try{return await core(`/businesses/${businessId}/products/${Number(x.product_id)}/recipe`,token)}catch{return {product_id:Number(x.product_id),product_name:String(x.product_name||''),items:[]}}}))
  const recipeMap=new Map<number,any>(recipeRows.map((r:any)=>[Number(r.product_id),r]))
  const ingredientMap=new Map<number,any>((Array.isArray(ingredients)?ingredients:[]).map((x:any)=>[Number(x.id),x]))
  const products=demandRows.map((row:any)=>{
    const productId=Number(row.product_id),recommended=Math.max(0,num(row.recommended_units)),target=Math.ceil(recommended*(1+bufferPct/100)),plannedRemaining=activeBy.get(productId)||0,toPlan=Math.max(0,target-plannedRemaining)
    const recent=num(row.recent_units_7d),historical=num(row.historical_units_28d),previous=Math.max(0,historical-recent),recentDaily=recent/7,previousDaily=previous/21
    const ratio=previousDaily>0?recentDaily/previousDaily:recent>0?2:1
    const trend=historical<6?'insufficient':ratio>=1.25?'accelerating':ratio<=0.75?'slowing':'stable'
    const recipe=recipeMap.get(productId),items=Array.isArray(recipe?.items)?recipe.items:[]
    return {product_id:productId,product_name:String(row.product_name||''),historical_units_28d:historical,recent_units_7d:recent,forecast_units:num(row.forecast_units),open_committed_units:num(row.open_committed_units),recommended_units:recommended,target_units:target,planned_remaining_units:plannedRemaining,to_plan_units:toPlan,confidence:String(row.confidence||'low'),confidence_ok:(rank[String(row.confidence||'low')]??0)>=(rank[minConfidence]??1),method:String(row.method||''),trend,trend_ratio:Number(ratio.toFixed(2)),recipe_complete:items.length>0,recipe_items:items}
  })
  const components=new Map<number,{ingredient_id:number;name:string;unit:string;required:number;on_hand:number;products:Set<number>}>()
  for(const p of products){for(const item of p.recipe_items){const iid=Number(item.ingredient_id),stock=ingredientMap.get(iid),required=num(item.qty_used_milliunits)*p.target_units,current=components.get(iid)||{ingredient_id:iid,name:String(item.name||stock?.name||`Ingrediente ${iid}`),unit:String(stock?.unit||'un'),required:0,on_hand:num(stock?.on_hand_milliunits??item.on_hand_milliunits),products:new Set<number>()};current.required+=required;current.products.add(p.product_id);components.set(iid,current)}}
  const componentRows=[...components.values()].map(c=>{const shortage=Math.max(0,c.required-c.on_hand);return{ingredient_id:c.ingredient_id,name:c.name,unit:c.unit,required_milliunits:c.required,on_hand_milliunits:c.on_hand,projected_milliunits:c.on_hand-c.required,shortage_milliunits:shortage,affected_product_ids:[...c.products].sort((a,b)=>a-b)}}).sort((a,b)=>Number(b.shortage_milliunits>0)-Number(a.shortage_milliunits>0)||b.shortage_milliunits-a.shortage_milliunits||a.name.localeCompare(b.name))
  const shortageProducts=new Set(componentRows.filter(c=>c.shortage_milliunits>0).flatMap(c=>c.affected_product_ids))
  const publicProducts=products.map(({recipe_items,...p})=>{const stockRisk=shortageProducts.has(p.product_id),blockedReason=!p.recipe_complete?'missing_recipe':!p.confidence_ok?'low_confidence':protectStock&&stockRisk?'stock_shortage':null;return{...p,stock_risk:stockRisk,blocked_reason:blockedReason,eligible:p.to_plan_units>0&&!blockedReason}})
  const shortages=componentRows.filter(c=>c.shortage_milliunits>0).length,missingRecipes=publicProducts.filter(p=>p.to_plan_units>0&&!p.recipe_complete).length,lowConfidence=publicProducts.filter(p=>p.to_plan_units>0&&!p.confidence_ok).length
  const contribution=num(finance.contribution_cents),delay=num(dashboard.delay_rate),errors=num(dashboard.error_rate)
  const growthAllowed=contribution>0&&delay<=0.15&&errors<=0.05&&shortages===0
  const totalToPlan=publicProducts.reduce((a,p)=>a+p.to_plan_units,0),eligibleUnits=publicProducts.filter(p=>p.eligible).reduce((a,p)=>a+p.to_plan_units,0)
  const slowing=publicProducts.filter(p=>p.trend==='slowing'&&p.historical_units_28d>=6).length
  let next={code:'stable',title:'Operação coberta',detail:'Proteja qualidade e monitore a próxima janela.',href:'/?control=1'}
  if(shortages)next={code:'stock',title:'Cobrir insumos antes de acelerar',detail:`${shortages} componente(s) não cobrem o alvo previsto.`,href:'/?kitchen=1'}
  else if(missingRecipes)next={code:'recipe',title:'Completar fichas técnicas',detail:`${missingRecipes} produto(s) impedem um plano de preparo confiável.`,href:'/#produtos'}
  else if(delay>0.15||errors>0.05)next={code:'operations',title:'Estabilizar operação antes de crescer',detail:`Atrasos ${(delay*100).toFixed(1)}% · erros ${(errors*100).toFixed(1)}%.`,href:'/?control=1'}
  else if(contribution<=0)next={code:'margin',title:'Corrigir contribuição antes de comprar demanda',detail:'A contribuição observada em 30 dias não está positiva.',href:'/?cash=1'}
  else if(eligibleUnits>0)next={code:'prep',title:'Aprovar plano de preparo',detail:`${eligibleUnits} unidade(s) adicionais estão elegíveis para criação de lote.`,href:'/?autopilot=1'}
  else if(slowing)next={code:'growth',title:'Investigar desaceleração de demanda',detail:`${slowing} produto(s) perderam ritmo contra as três semanas anteriores.`,href:'/?growth=1'}
  const fingerprint={businessId,horizon,bufferPct,minConfidence,protectStock,products:publicProducts.map(p=>[p.product_id,p.target_units,p.planned_remaining_units,p.to_plan_units,p.confidence,p.blocked_reason]),components:componentRows.map(c=>[c.ingredient_id,c.required_milliunits,c.on_hand_milliunits,c.shortage_milliunits]),finance:[contribution,num(finance.revenue_cents),num(finance.order_count)],ops:[delay,errors]}
  const planHash=await sha(fingerprint)
  const payload={business_id:businessId,generated_at:String(demand.generated_at||new Date().toISOString()),plan_hash:planHash,horizon_days:horizon,buffer_pct:bufferPct,min_confidence:minConfidence,protect_stock:protectStock,summary:{forecast_units:publicProducts.reduce((a,p)=>a+p.forecast_units,0),target_units:publicProducts.reduce((a,p)=>a+p.target_units,0),planned_remaining_units:publicProducts.reduce((a,p)=>a+p.planned_remaining_units,0),to_plan_units:totalToPlan,eligible_units:eligibleUnits,blocked_units:totalToPlan-eligibleUnits,stock_shortages:shortages,missing_recipes:missingRecipes,low_confidence:lowConfidence,growth_allowed:growthAllowed},guard:{growth_allowed:growthAllowed,contribution_cents_30d:contribution,revenue_cents_30d:num(finance.revenue_cents),orders_30d:num(finance.order_count),delay_rate:delay,error_rate:errors},products:publicProducts,components:componentRows,next_action:next,source:{forecast_method:'weighted_moving_average_7_21',forecast_basis_days:28,decision_mode:'human_approval_required'}}
  return {payload,rawProduction:Array.isArray(production)?production:[]}
}

async function existingRun(businessId:number,requestId:string){const r=await admin.from('autopilot_runs').select('id,status,result_json,action_count,created_at,updated_at').eq('business_id',businessId).eq('request_id',requestId).maybeSingle();if(r.error)throw r.error;return r.data}
async function applyPlan(businessId:number,user:any,token:string,input:any){
  const requestId=String(input.request_id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return fail('request_id inválido',422)
  const old=await existingRun(businessId,requestId);if(old){if(old.status==='running')return fail('Esta execução já está em andamento',409,{request_id:requestId});return j({...(old.result_json||{}),replay:true,request_id:requestId,status:old.status})}
  const horizon=Math.min(14,Math.max(1,Math.round(num(input.horizon_days)||1))),bufferPct=Math.min(50,Math.max(0,num(input.buffer_pct))),minConfidence=confidence(String(input.min_confidence||'medium')),protectStock=input.protect_stock!==false
  const {payload,rawProduction}=await buildPlan(businessId,token,{horizon,bufferPct,minConfidence,protectStock})
  if(String(input.expected_plan_hash||'')!==payload.plan_hash)return fail('O plano mudou desde a revisão. Atualize antes de aprovar.',409,{current_plan_hash:payload.plan_hash})
  const selected=Array.isArray(input.selected_product_ids)?new Set(input.selected_product_ids.map(Number)):null
  const actions=payload.products.filter((p:any)=>p.eligible&&(!selected||selected.has(p.product_id)))
  if(!actions.length)return fail('Nenhum lote elegível foi selecionado',422)
  const row={business_id:businessId,actor_user_id:user.id,request_id:requestId,horizon_days:horizon,buffer_bps:Math.round(bufferPct*100),plan_hash:payload.plan_hash,status:'running',action_count:actions.length,result_json:{}}
  const ins=await admin.from('autopilot_runs').insert(row);if(ins.error){const retry=await existingRun(businessId,requestId);if(retry)return j({...(retry.result_json||{}),replay:true,request_id:requestId,status:retry.status});throw ins.error}
  const created:any[]=[],failed:any[]=[]
  for(const action of actions){const marker=`C360_AUTOPILOT:${requestId}:${action.product_id}`;const prior=rawProduction.find((b:any)=>String(b.notes||'').includes(marker));if(prior){created.push({product_id:action.product_id,product_name:action.product_name,batch_id:Number(prior.id),planned_qty:action.to_plan_units,recovered:true});continue}try{const batch=await core(`/businesses/${businessId}/production`,token,{method:'POST',body:JSON.stringify({product_id:action.product_id,planned_qty:action.to_plan_units,notes:`${marker} · ${horizon}d · buffer ${bufferPct}% · confiança ${action.confidence}`})});created.push({product_id:action.product_id,product_name:action.product_name,batch_id:Number(batch.id),planned_qty:action.to_plan_units,recovered:false})}catch(e){failed.push({product_id:action.product_id,product_name:action.product_name,detail:e instanceof Error?e.message:'Falha ao criar lote'})}}
  const status=failed.length?(created.length?'partial':'failed'):'completed',result={request_id:requestId,status,created,failed,plan_hash:payload.plan_hash,applied_at:new Date().toISOString(),replay:false}
  const up=await admin.from('autopilot_runs').update({status,result_json:result,updated_at:new Date().toISOString()}).eq('business_id',businessId).eq('request_id',requestId);if(up.error)throw up.error
  return j(result)
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  const path=routePath(req),method=req.method
  try{
    if(path==='/livez'&&method==='GET')return j({ok:true,service:'cozinha360-autopilot-v37',version:'3.7.0'})
    if(path==='/readyz'&&method==='GET'){const [ledger,coreReady]=await Promise.all([admin.from('autopilot_runs').select('id',{head:true,count:'exact'}),fetch(`${CORE_API}/readyz`).then(r=>r.ok).catch(()=>false)]);return ledger.error||!coreReady?fail('service_not_ready',503):j({ok:true,database:'ready',core:'ready',version:'3.7.0'})}
    const user:any=await auth(req);if(!user)return fail('Sessão inválida',401)
    const planMatch=path.match(/^\/businesses\/(\d+)\/plan$/),applyMatch=path.match(/^\/businesses\/(\d+)\/apply$/),runsMatch=path.match(/^\/businesses\/(\d+)\/runs$/)
    const bid=Number((planMatch||applyMatch||runsMatch)?.[1]||0);if(!bid)return fail('Rota não encontrada',404)
    const m=await membership(user.id,bid);if(!m)return fail('Sem acesso',403)
    if(planMatch&&method==='GET'){const url=new URL(req.url),horizon=int(url.searchParams.get('horizon_days'),1,1,14),bufferPct=pct(url.searchParams.get('buffer_pct'),10,0,50),minConfidence=confidence(url.searchParams.get('min_confidence')),protectStock=url.searchParams.get('protect_stock')!=='false';return j((await buildPlan(bid,bearer(req),{horizon,bufferPct,minConfidence,protectStock})).payload)}
    if(applyMatch&&method==='POST'){if(!['owner','admin'].includes(String(m.role)))return fail('Somente owner/admin pode aprovar lotes em massa',403);return applyPlan(bid,user,bearer(req),await body(req))}
    if(runsMatch&&method==='GET'){const r=await admin.from('autopilot_runs').select('request_id,horizon_days,buffer_bps,plan_hash,status,action_count,result_json,created_at,updated_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(20);if(r.error)throw r.error;return j({business_id:bid,runs:r.data||[]})}
    return fail('Método não permitido',405)
  }catch(e){console.error('autopilot-v37',e);return fail(e instanceof Error?e.message:'Erro interno',500)}
})
