import { createClient } from 'npm:@supabase/supabase-js@2'

const URL=Deno.env.get('SUPABASE_URL')!
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORE=(Deno.env.get('C360_CORE_API_URL')||`${URL}/functions/v1/cozinha360-api-v2`).replace(/\/$/,'')
const SLUG='cozinha360-autopilot-v37'
const anon=createClient(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}})
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
const fail=(detail:string,status=400,extra:Record<string,unknown>={})=>reply({detail,...extra},status)
const rank:Record<string,number>={low:0,medium:1,high:2}
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const clamp=(v:unknown,fallback:number,min:number,max:number)=>{const x=Number(v);return Number.isFinite(x)?Math.min(max,Math.max(min,x)):fallback}
const bearer=(req:Request)=>{const h=req.headers.get('authorization')||'';return h.startsWith('Bearer ')?h.slice(7):''}
const pathOf=(req:Request)=>{const p=new URL(req.url).pathname,m=`/${SLUG}`,i=p.indexOf(m);return i>=0?(p.slice(i+m.length)||'/'):p}
const confidence=(v:unknown)=>String(v||'') in rank?String(v):'medium'
const digest=async(v:unknown)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(x=>x.toString(16).padStart(2,'0')).join('')

async function user(req:Request){
  const token=bearer(req);if(!token)return null
  const {data,error}=await anon.auth.getUser(token);if(error||!data.user)return null
  let profile=(await admin.from('users').select('id,email,full_name').eq('auth_user_id',data.user.id).maybeSingle()).data
  if(!profile&&data.user.email)profile=(await admin.from('users').select('id,email,full_name').ilike('email',data.user.email).maybeSingle()).data
  return profile||null
}
async function member(uid:number,bid:number){return (await admin.from('memberships').select('id,role').eq('user_id',uid).eq('business_id',bid).maybeSingle()).data||null}
async function core(path:string,token:string,options:RequestInit={}){
  const res=await fetch(`${CORE}${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})}})
  const body=await res.json().catch(()=>({detail:'Resposta inválida do núcleo'}))
  if(!res.ok)throw new Error(typeof body.detail==='string'?body.detail:`Núcleo respondeu ${res.status}`)
  return body
}
async function input(req:Request){try{return await req.json()}catch{return{}}}

async function plan(bid:number,token:string,opt:{horizon:number;buffer:number;minConfidence:string;protectStock:boolean}){
  const [demand,production,ingredients,dashboard,finance]=await Promise.all([
    core(`/businesses/${bid}/demand?horizon_days=${opt.horizon}`,token),core(`/businesses/${bid}/production`,token),core(`/businesses/${bid}/ingredients`,token),core(`/businesses/${bid}/dashboard`,token),core(`/businesses/${bid}/finance/summary?days=30`,token)
  ])
  const demandRows=Array.isArray(demand.products)?demand.products:[],batches=Array.isArray(production)?production:[],stocks=Array.isArray(ingredients)?ingredients:[]
  const active=new Map<number,number>()
  for(const b of batches.filter((x:any)=>['planned','in_progress'].includes(String(x.status)))){const id=Number(b.product_id),left=Math.max(0,n(b.planned_qty)-n(b.produced_qty));active.set(id,(active.get(id)||0)+left)}
  const recipes=await Promise.all(demandRows.filter((x:any)=>n(x.recommended_units)>0).map(async(x:any)=>{try{return await core(`/businesses/${bid}/products/${Number(x.product_id)}/recipe`,token)}catch{return{product_id:Number(x.product_id),items:[]}}}))
  const recipeBy=new Map(recipes.map((x:any)=>[Number(x.product_id),x])),stockBy=new Map(stocks.map((x:any)=>[Number(x.id),x]))
  const internal=demandRows.map((x:any)=>{
    const id=Number(x.product_id),recommended=Math.max(0,n(x.recommended_units)),target=Math.ceil(recommended*(1+opt.buffer/100)),planned=active.get(id)||0,toPlan=Math.max(0,target-planned),recent=n(x.recent_units_7d),historical=n(x.historical_units_28d),previous=Math.max(0,historical-recent),recentDaily=recent/7,previousDaily=previous/21,ratio=previousDaily>0?recentDaily/previousDaily:recent>0?2:1,trend=historical<6?'insufficient':ratio>=1.25?'accelerating':ratio<=.75?'slowing':'stable',items=Array.isArray((recipeBy.get(id) as any)?.items)?(recipeBy.get(id) as any).items:[]
    return{product_id:id,product_name:String(x.product_name||''),historical_units_28d:historical,recent_units_7d:recent,forecast_units:n(x.forecast_units),open_committed_units:n(x.open_committed_units),recommended_units:recommended,target_units:target,planned_remaining_units:planned,to_plan_units:toPlan,confidence:String(x.confidence||'low'),confidence_ok:(rank[String(x.confidence||'low')]??0)>=(rank[opt.minConfidence]??1),method:String(x.method||''),trend,trend_ratio:Number(ratio.toFixed(2)),recipe_complete:items.length>0,items}
  })
  const components=new Map<number,any>()
  for(const p of internal)for(const item of p.items){const id=Number(item.ingredient_id),stock=stockBy.get(id) as any,required=n(item.qty_used_milliunits)*p.target_units,row=components.get(id)||{ingredient_id:id,name:String(item.name||stock?.name||`Ingrediente ${id}`),unit:String(stock?.unit||'un'),required_milliunits:0,on_hand_milliunits:n(stock?.on_hand_milliunits??item.on_hand_milliunits),affected_product_ids:new Set<number>()};row.required_milliunits+=required;row.affected_product_ids.add(p.product_id);components.set(id,row)}
  const componentRows=[...components.values()].map((c:any)=>({ingredient_id:c.ingredient_id,name:c.name,unit:c.unit,required_milliunits:c.required_milliunits,on_hand_milliunits:c.on_hand_milliunits,projected_milliunits:c.on_hand_milliunits-c.required_milliunits,shortage_milliunits:Math.max(0,c.required_milliunits-c.on_hand_milliunits),affected_product_ids:[...c.affected_product_ids].sort((a:number,b:number)=>a-b)})).sort((a:any,b:any)=>Number(b.shortage_milliunits>0)-Number(a.shortage_milliunits>0)||b.shortage_milliunits-a.shortage_milliunits||a.name.localeCompare(b.name))
  const risky=new Set(componentRows.filter((x:any)=>x.shortage_milliunits>0).flatMap((x:any)=>x.affected_product_ids))
  const products=internal.map(({items,...p}:any)=>{const stockRisk=risky.has(p.product_id),blocked=!p.recipe_complete?'missing_recipe':!p.confidence_ok?'low_confidence':opt.protectStock&&stockRisk?'stock_shortage':null;return{...p,stock_risk:stockRisk,blocked_reason:blocked,eligible:p.to_plan_units>0&&!blocked}})
  const shortages=componentRows.filter((x:any)=>x.shortage_milliunits>0).length,missing=products.filter((x:any)=>x.to_plan_units>0&&!x.recipe_complete).length,low=products.filter((x:any)=>x.to_plan_units>0&&!x.confidence_ok).length,contribution=n(finance.contribution_cents),delay=n(dashboard.delay_rate),errors=n(dashboard.error_rate),growth=contribution>0&&delay<=.15&&errors<=.05&&shortages===0,total=products.reduce((a:number,p:any)=>a+p.to_plan_units,0),eligible=products.filter((p:any)=>p.eligible).reduce((a:number,p:any)=>a+p.to_plan_units,0),slowing=products.filter((p:any)=>p.trend==='slowing'&&p.historical_units_28d>=6).length
  let next={code:'stable',title:'Operação coberta',detail:'Proteja qualidade e monitore a próxima janela.',href:'/?control=1'}
  if(shortages)next={code:'stock',title:'Cobrir insumos antes de acelerar',detail:`${shortages} componente(s) não cobrem o alvo previsto.`,href:'/?kitchen=1'}
  else if(missing)next={code:'recipe',title:'Completar fichas técnicas',detail:`${missing} produto(s) impedem um plano de preparo confiável.`,href:'/#produtos'}
  else if(delay>.15||errors>.05)next={code:'operations',title:'Estabilizar operação antes de crescer',detail:`Atrasos ${(delay*100).toFixed(1)}% · erros ${(errors*100).toFixed(1)}%.`,href:'/?control=1'}
  else if(contribution<=0)next={code:'margin',title:'Corrigir contribuição antes de comprar demanda',detail:'A contribuição observada em 30 dias não está positiva.',href:'/?cash=1'}
  else if(eligible>0)next={code:'prep',title:'Aprovar plano de preparo',detail:`${eligible} unidade(s) adicionais estão elegíveis para criação de lote.`,href:'/?autopilot=1'}
  else if(slowing)next={code:'growth',title:'Investigar desaceleração de demanda',detail:`${slowing} produto(s) perderam ritmo contra as três semanas anteriores.`,href:'/?growth=1'}
  const fingerprint={bid,opt,products:products.map((p:any)=>[p.product_id,p.target_units,p.planned_remaining_units,p.to_plan_units,p.confidence,p.blocked_reason]),components:componentRows.map((c:any)=>[c.ingredient_id,c.required_milliunits,c.on_hand_milliunits,c.shortage_milliunits]),finance:[contribution,n(finance.revenue_cents),n(finance.order_count)],ops:[delay,errors]},plan_hash=await digest(fingerprint)
  return{payload:{business_id:bid,generated_at:String(demand.generated_at||new Date().toISOString()),plan_hash,horizon_days:opt.horizon,buffer_pct:opt.buffer,min_confidence:opt.minConfidence,protect_stock:opt.protectStock,summary:{forecast_units:products.reduce((a:number,p:any)=>a+p.forecast_units,0),target_units:products.reduce((a:number,p:any)=>a+p.target_units,0),planned_remaining_units:products.reduce((a:number,p:any)=>a+p.planned_remaining_units,0),to_plan_units:total,eligible_units:eligible,blocked_units:total-eligible,stock_shortages:shortages,missing_recipes:missing,low_confidence:low,growth_allowed:growth},guard:{growth_allowed:growth,contribution_cents_30d:contribution,revenue_cents_30d:n(finance.revenue_cents),orders_30d:n(finance.order_count),delay_rate:delay,error_rate:errors},products,components:componentRows,next_action:next,source:{forecast_method:'weighted_moving_average_7_21',forecast_basis_days:28,decision_mode:'human_approval_required'}},batches}
}

async function priorRun(bid:number,id:string){const r=await admin.from('autopilot_runs').select('status,result_json,action_count,created_at,updated_at').eq('business_id',bid).eq('request_id',id).maybeSingle();if(r.error)throw r.error;return r.data}
async function apply(bid:number,u:any,token:string,b:any){
  const requestId=String(b.request_id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return fail('request_id inválido',422)
  const old=await priorRun(bid,requestId);if(old)return old.status==='running'?fail('Esta execução já está em andamento',409,{request_id:requestId}):reply({...(old.result_json||{}),replay:true,request_id:requestId,status:old.status})
  const opt={horizon:Math.round(clamp(b.horizon_days,1,1,14)),buffer:clamp(b.buffer_pct,0,0,50),minConfidence:confidence(b.min_confidence),protectStock:b.protect_stock!==false},built=await plan(bid,token,opt)
  if(String(b.expected_plan_hash||'')!==built.payload.plan_hash)return fail('O plano mudou desde a revisão. Atualize antes de aprovar.',409,{current_plan_hash:built.payload.plan_hash})
  const selected=Array.isArray(b.selected_product_ids)?new Set(b.selected_product_ids.map(Number)):null,actions=built.payload.products.filter((p:any)=>p.eligible&&(!selected||selected.has(p.product_id)))
  if(!actions.length)return fail('Nenhum lote elegível foi selecionado',422)
  const inserted=await admin.from('autopilot_runs').insert({business_id:bid,actor_user_id:u.id,request_id:requestId,horizon_days:opt.horizon,buffer_bps:Math.round(opt.buffer*100),plan_hash:built.payload.plan_hash,status:'running',action_count:actions.length,result_json:{}})
  if(inserted.error){const replay=await priorRun(bid,requestId);if(replay)return reply({...(replay.result_json||{}),replay:true,request_id:requestId,status:replay.status});throw inserted.error}
  const created:any[]=[],failed:any[]=[]
  for(const action of actions){const marker=`C360_AUTOPILOT:${requestId}:${action.product_id}`,existing=built.batches.find((x:any)=>String(x.notes||'').includes(marker));if(existing){created.push({product_id:action.product_id,product_name:action.product_name,batch_id:Number(existing.id),planned_qty:action.to_plan_units,recovered:true});continue}try{const batch=await core(`/businesses/${bid}/production`,token,{method:'POST',body:JSON.stringify({product_id:action.product_id,planned_qty:action.to_plan_units,notes:`${marker} · ${opt.horizon}d · buffer ${opt.buffer}% · confiança ${action.confidence}`})});created.push({product_id:action.product_id,product_name:action.product_name,batch_id:Number(batch.id),planned_qty:action.to_plan_units,recovered:false})}catch(e){failed.push({product_id:action.product_id,product_name:action.product_name,detail:e instanceof Error?e.message:'Falha ao criar lote'})}}
  const status=failed.length?(created.length?'partial':'failed'):'completed',result={request_id:requestId,status,created,failed,plan_hash:built.payload.plan_hash,applied_at:new Date().toISOString(),replay:false},saved=await admin.from('autopilot_runs').update({status,result_json:result,updated_at:new Date().toISOString()}).eq('business_id',bid).eq('request_id',requestId);if(saved.error)throw saved.error
  return reply(result)
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  const path=pathOf(req),method=req.method
  try{
    if(path==='/livez'&&method==='GET')return reply({ok:true,service:SLUG,version:'3.7.0'})
    if(path==='/readyz'&&method==='GET'){const [ledger,ready]=await Promise.all([admin.from('autopilot_runs').select('id',{head:true,count:'exact'}),fetch(`${CORE}/readyz`).then(r=>r.ok).catch(()=>false)]);return ledger.error||!ready?fail('service_not_ready',503):reply({ok:true,database:'ready',core:'ready',version:'3.7.0'})}
    const u:any=await user(req);if(!u)return fail('Sessão inválida',401)
    const pm=path.match(/^\/businesses\/(\d+)\/plan$/),am=path.match(/^\/businesses\/(\d+)\/apply$/),rm=path.match(/^\/businesses\/(\d+)\/runs$/),bid=Number((pm||am||rm)?.[1]||0);if(!bid)return fail('Rota não encontrada',404)
    const membership:any=await member(u.id,bid);if(!membership)return fail('Sem acesso',403)
    if(pm&&method==='GET'){const q=new URL(req.url).searchParams,opt={horizon:Math.round(clamp(q.get('horizon_days'),1,1,14)),buffer:clamp(q.get('buffer_pct'),10,0,50),minConfidence:confidence(q.get('min_confidence')),protectStock:q.get('protect_stock')!=='false'};return reply((await plan(bid,bearer(req),opt)).payload)}
    if(am&&method==='POST'){if(!['owner','admin'].includes(String(membership.role)))return fail('Somente owner/admin pode aprovar lotes em massa',403);return apply(bid,u,bearer(req),await input(req))}
    if(rm&&method==='GET'){const r=await admin.from('autopilot_runs').select('request_id,horizon_days,buffer_bps,plan_hash,status,action_count,result_json,created_at,updated_at').eq('business_id',bid).order('created_at',{ascending:false}).limit(20);if(r.error)throw r.error;return reply({business_id:bid,runs:r.data||[]})}
    return fail('Método não permitido',405)
  }catch(e){console.error('autopilot-v37',e);return fail(e instanceof Error?e.message:'Erro interno',500)}
})
