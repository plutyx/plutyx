import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORE=(Deno.env.get('C360_CORE_API_URL')||`${SUPABASE_URL}/functions/v1/cozinha360-api-v2`).replace(/\/$/,'')
const SLUG='cozinha360-purchases-v51'
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

function routePath(req:Request){
 const path=new URL(req.url).pathname
 const marker=`/${SLUG}`
 const at=path.indexOf(marker)
 return at>=0?(path.slice(at+marker.length)||'/'):path
}
async function body(req:Request){try{return await req.json()}catch{return{}}}
async function authUser(req:Request){
 const header=req.headers.get('Authorization')||''
 const token=header.startsWith('Bearer ')?header.slice(7):''
 if(!token)return null
 const{data,error}=await anon.auth.getUser(token)
 return error||!data.user?null:data.user
}
async function ensureProfile(user:any){
 let{data:row}=await admin.from('users').select('*').eq('auth_user_id',user.id).maybeSingle()
 const email=String(user.email||'').toLowerCase(),fullName=String(user.user_metadata?.full_name||user.user_metadata?.name||'')
 if(!row&&email){
  const{data:existing}=await admin.from('users').select('*').ilike('email',email).maybeSingle()
  if(existing){
   const{data:updated,error}=await admin.from('users').update({auth_user_id:user.id,full_name:existing.full_name||fullName,updated_at:now()}).eq('id',existing.id).select('*').single()
   if(error)throw error
   row=updated
  }
 }
 if(!row){
  const{data:created,error}=await admin.from('users').insert({email,password_hash:'supabase-auth',full_name:fullName,auth_user_id:user.id}).select('*').single()
  if(error)throw error
  row=created
 }
 return row
}
async function member(userId:number,businessId:number,roles=['owner','admin','member']){
 const{data,error}=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle()
 if(error)throw error
 return data&&roles.includes(data.role)?data:null
}

async function plan(businessId:number){
 const{data:ingredients=[],error}=await admin.from('ingredients')
  .select('id,name,unit,last_purchase_price_cents,last_purchase_qty_milliunits,on_hand_milliunits,par_level_milliunits,reorder_target_milliunits')
  .eq('business_id',businessId).eq('soft_deleted',false).order('name')
 if(error)throw error
 const items=(ingredients||[]).map((row:any)=>{
  const onHand=Number(row.on_hand_milliunits||0),minimum=Math.max(0,Number(row.par_level_milliunits||0)),target=Math.max(minimum,Number(row.reorder_target_milliunits||0))
  const suggested=Math.max(0,target-onHand),referenceQty=Math.max(0,Number(row.last_purchase_qty_milliunits||0)),referencePrice=Math.max(0,Number(row.last_purchase_price_cents||0))
  const estimated=referenceQty>0&&referencePrice>0?Math.round(referencePrice*suggested/referenceQty):0
  const tone=onHand<=0&&target>0?'critical':onHand<minimum?'warning':suggested>0?'attention':'stable'
  return{ingredient_id:Number(row.id),name:row.name,unit:row.unit,on_hand_milliunits:onHand,par_level_milliunits:minimum,reorder_target_milliunits:target,suggested_purchase_milliunits:suggested,last_purchase_price_cents:referencePrice,last_purchase_qty_milliunits:referenceQty,estimated_landed_cents:estimated,cost_confidence:referencePrice>0&&referenceQty>0?'reference':'missing',tone}
 }).filter((row:any)=>row.suggested_purchase_milliunits>0)
 items.sort((a:any,b:any)=>{const rank:any={critical:3,warning:2,attention:1,stable:0};return rank[b.tone]-rank[a.tone]||b.suggested_purchase_milliunits-a.suggested_purchase_milliunits})
 return{
  generated_at:now(),method:'reorder_target_minus_on_hand',
  summary:{items_to_buy:items.length,critical:items.filter((x:any)=>x.tone==='critical').length,estimated_landed_cents:items.reduce((sum:number,x:any)=>sum+Number(x.estimated_landed_cents||0),0),missing_cost_reference:items.filter((x:any)=>x.cost_confidence==='missing').length},
  items,
  safety_note:'Estimativas usam apenas o último custo registrado e não substituem cotação do fornecedor. A compra só altera estoque depois de confirmação explícita do usuário.'
 }
}

async function history(businessId:number,limit:number){
 const safeLimit=Math.min(100,Math.max(1,limit))
 const{data:purchases=[],error}=await admin.from('purchases').select('*').eq('business_id',businessId).order('created_at',{ascending:false}).limit(safeLimit)
 if(error)throw error
 const ingredientIds=[...new Set((purchases||[]).map((x:any)=>Number(x.ingredient_id)).filter(Boolean))]
 const supplierIds=[...new Set((purchases||[]).map((x:any)=>Number(x.supplier_id)).filter(Boolean))]
 let ingredients:any[]=[];let suppliers:any[]=[]
 if(ingredientIds.length){const result=await admin.from('ingredients').select('id,name,unit').in('id',ingredientIds);if(result.error)throw result.error;ingredients=result.data||[]}
 if(supplierIds.length){const result=await admin.from('suppliers').select('id,name').in('id',supplierIds);if(result.error)throw result.error;suppliers=result.data||[]}
 const ingredientMap=new Map(ingredients.map((x:any)=>[Number(x.id),x])),supplierMap=new Map(suppliers.map((x:any)=>[Number(x.id),x]))
 const rows=(purchases||[]).map((row:any)=>{
  const ingredient:any=ingredientMap.get(Number(row.ingredient_id))||{},supplier:any=supplierMap.get(Number(row.supplier_id))||{}
  const quantity=Math.max(1,Number(row.quantity_milliunits||0)),landed=money(row.total_cents)+money(row.freight_cents)+money(row.tax_cents)
  return{id:Number(row.id),ingredient_id:Number(row.ingredient_id),ingredient_name:ingredient.name||'Ingrediente',unit:ingredient.unit||'un',supplier_id:row.supplier_id?Number(row.supplier_id):null,supplier_name:supplier.name||'',quantity_milliunits:quantity,total_cents:money(row.total_cents),freight_cents:money(row.freight_cents),tax_cents:money(row.tax_cents),landed_cents:landed,landed_per_1000_cents:Math.round(landed*1000/quantity),created_at:row.created_at}
 })
 const lastByIngredient=new Map<number,any>()
 for(let i=rows.length-1;i>=0;i--){
  const row:any=rows[i],previous=lastByIngredient.get(row.ingredient_id)
  row.previous_landed_per_1000_cents=previous?.landed_per_1000_cents??null
  row.change_bps=previous?.landed_per_1000_cents>0?Math.round((row.landed_per_1000_cents-previous.landed_per_1000_cents)*10000/previous.landed_per_1000_cents):null
  lastByIngredient.set(row.ingredient_id,row)
 }
 return{generated_at:now(),rows}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
 const path=routePath(req),method=req.method,url=new URL(req.url)
 try{
  if(path==='/livez'&&method==='GET')return json({ok:true,service:SLUG,version:'5.1.1'})
  if(path==='/readyz'&&method==='GET'){
   const{error}=await admin.from('purchases').select('id',{head:true,count:'exact'})
   return error?fail('database_not_ready',503):json({ok:true,database:'ready',version:'5.1.1'})
  }
  const auth=await authUser(req);if(!auth)return fail('Sessão inválida',401)
  const profile:any=await ensureProfile(auth)
  let match=path.match(/^\/businesses\/(\d+)\/purchase-plan$/)
  if(match&&method==='GET'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId))return fail('Sem acesso',403)
   return json(await plan(businessId))
  }
  match=path.match(/^\/businesses\/(\d+)\/purchases$/)
  if(match&&method==='GET'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId))return fail('Sem acesso',403)
   return json(await history(businessId,int(url.searchParams.get('limit'),30)))
  }
  if(match&&method==='POST'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId,['owner','admin']))return fail('Somente owner/admin',403)
   const payload=await body(req),authorization=req.headers.get('Authorization')||'',supplierId=Math.max(0,int(payload.supplier_id))
   if(supplierId){
    const{data:supplier,error}=await admin.from('suppliers').select('id').eq('id',supplierId).eq('business_id',businessId).eq('soft_deleted',false).maybeSingle()
    if(error)throw error;if(!supplier)return fail('Fornecedor não pertence a esta operação',422);payload.supplier_id=supplierId
   }else payload.supplier_id=null
   const response=await fetch(`${CORE}/businesses/${businessId}/purchases`,{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify(payload)})
   const responseBody=await response.json().catch(()=>({detail:'Resposta inválida do núcleo'}))
   return json(responseBody,response.status)
  }
  return fail('Rota não encontrada',404)
 }catch(error){
  console.error('Compras 360 error',error)
  const message=String((error as any)?.message||error||'Erro interno')
  if(message.includes('duplicate key'))return fail('Registro duplicado',409)
  return fail('Erro interno',500)
 }
})
