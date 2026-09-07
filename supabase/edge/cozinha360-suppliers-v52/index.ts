import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLUG='cozinha360-suppliers-v52'
const anon=createClient(SUPABASE_URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}})

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',
 'Content-Type':'application/json; charset=utf-8',
}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors})
const fail=(detail:string,status=400)=>json({detail},status)
const now=()=>new Date().toISOString()
const int=(value:unknown,fallback=0)=>Number.isFinite(Number(value))?Math.trunc(Number(value)):fallback
const money=(value:unknown)=>Math.max(0,Math.round(Number(value||0)))
const clean=(value:unknown,max=500)=>String(value||'').trim().slice(0,max)

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
async function audit(businessId:number,userId:number,action:string,entityId:number,payload:any={}){
 await admin.from('audit_logs').insert({business_id:businessId,actor_user_id:userId,action,entity_type:'supplier',entity_id:String(entityId),payload_json:JSON.stringify(payload)})
}

async function supplierRows(businessId:number){
 const[{data:suppliers=[],error:supplierError},{data:purchases=[],error:purchaseError}]=await Promise.all([
  admin.from('suppliers').select('*').eq('business_id',businessId).eq('soft_deleted',false).order('backup_supplier',{ascending:false}).order('name'),
  admin.from('purchases').select('id,supplier_id,ingredient_id,quantity_milliunits,total_cents,freight_cents,tax_cents,created_at').eq('business_id',businessId).not('supplier_id','is',null).order('created_at',{ascending:false}),
 ])
 if(supplierError)throw supplierError;if(purchaseError)throw purchaseError
 return (suppliers||[]).map((supplier:any)=>{
  const rows=(purchases||[]).filter((purchase:any)=>Number(purchase.supplier_id)===Number(supplier.id))
  const ingredients=new Set(rows.map((purchase:any)=>Number(purchase.ingredient_id)).filter(Boolean))
  return{...supplier,purchase_count:rows.length,ingredients_count:ingredients.size,last_purchase_at:rows[0]?.created_at||null,landed_total_cents:rows.reduce((sum:number,purchase:any)=>sum+money(purchase.total_cents)+money(purchase.freight_cents)+money(purchase.tax_cents),0)}
 })
}

async function comparison(businessId:number,ingredientId:number){
 const[{data:ingredient,error:ingredientError},{data:suppliers=[],error:supplierError},{data:purchases=[],error:purchaseError}]=await Promise.all([
  admin.from('ingredients').select('id,name,unit').eq('business_id',businessId).eq('id',ingredientId).eq('soft_deleted',false).maybeSingle(),
  admin.from('suppliers').select('id,name,phone,backup_supplier').eq('business_id',businessId).eq('soft_deleted',false).order('name'),
  admin.from('purchases').select('id,supplier_id,quantity_milliunits,total_cents,freight_cents,tax_cents,created_at').eq('business_id',businessId).eq('ingredient_id',ingredientId).not('supplier_id','is',null).order('created_at',{ascending:false}),
 ])
 if(ingredientError)throw ingredientError;if(!ingredient)return null;if(supplierError)throw supplierError;if(purchaseError)throw purchaseError
 const rows=(suppliers||[]).map((supplier:any)=>{
  const purchase=(purchases||[]).find((item:any)=>Number(item.supplier_id)===Number(supplier.id))
  if(!purchase)return{supplier_id:Number(supplier.id),supplier_name:supplier.name,phone:supplier.phone||'',backup_supplier:Boolean(supplier.backup_supplier),has_history:false,last_purchase_at:null,quantity_milliunits:0,landed_cents:0,landed_per_1000_cents:null,days_since:null}
  const quantity=Math.max(1,Number(purchase.quantity_milliunits||0)),landed=money(purchase.total_cents)+money(purchase.freight_cents)+money(purchase.tax_cents),date=new Date(purchase.created_at).getTime()
  return{supplier_id:Number(supplier.id),supplier_name:supplier.name,phone:supplier.phone||'',backup_supplier:Boolean(supplier.backup_supplier),has_history:true,last_purchase_at:purchase.created_at,quantity_milliunits:quantity,landed_cents:landed,landed_per_1000_cents:Math.round(landed*1000/quantity),days_since:Number.isFinite(date)?Math.max(0,Math.floor((Date.now()-date)/86400000)):null}
 })
 const comparable=rows.filter((row:any)=>row.has_history&&Number(row.landed_per_1000_cents)>0)
 const best=comparable.length?Math.min(...comparable.map((row:any)=>Number(row.landed_per_1000_cents))):null
 for(const row of rows)(row as any).best_historical_reference=best!==null&&Number((row as any).landed_per_1000_cents)===best
 rows.sort((a:any,b:any)=>Number(b.has_history)-Number(a.has_history)||(a.landed_per_1000_cents??Number.MAX_SAFE_INTEGER)-(b.landed_per_1000_cents??Number.MAX_SAFE_INTEGER)||String(a.supplier_name).localeCompare(String(b.supplier_name),'pt-BR'))
 return{generated_at:now(),ingredient,summary:{suppliers_total:rows.length,suppliers_with_history:comparable.length,best_historical_per_1000_cents:best},rows,safety_note:'Comparação histórica não é cotação ao vivo. Preço, disponibilidade, prazo, qualidade, frete e condições comerciais devem ser confirmados antes da compra.'}
}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
 const path=routePath(req),method=req.method,url=new URL(req.url)
 try{
  if(path==='/livez'&&method==='GET')return json({ok:true,service:SLUG,version:'5.2.0'})
  if(path==='/readyz'&&method==='GET'){const{error}=await admin.from('suppliers').select('id',{head:true,count:'exact'});return error?fail('database_not_ready',503):json({ok:true,database:'ready',version:'5.2.0'})}
  const auth=await authUser(req);if(!auth)return fail('Sessão inválida',401)
  const profile:any=await ensureProfile(auth)
  let match=path.match(/^\/businesses\/(\d+)\/suppliers$/)
  if(match&&method==='GET'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId))return fail('Sem acesso',403)
   const rows=await supplierRows(businessId)
   return json({generated_at:now(),summary:{suppliers_total:rows.length,backup_suppliers:rows.filter((row:any)=>row.backup_supplier).length,purchases_mapped:rows.reduce((sum:number,row:any)=>sum+Number(row.purchase_count||0),0),ingredients_covered:new Set(rows.flatMap((row:any)=>Array(Number(row.ingredients_count||0)).fill(row.id))).size},rows})
  }
  if(match&&method==='POST'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId,['owner','admin']))return fail('Somente owner/admin',403)
   const payload=await body(req),name=clean(payload.name,160);if(name.length<2)return fail('Informe o nome do fornecedor',422)
   const row={business_id:businessId,name,cnpj:clean(payload.cnpj,20),phone:clean(payload.phone,40),backup_supplier:Boolean(payload.backup_supplier),notes:clean(payload.notes,2000),soft_deleted:false}
   const{data,error}=await admin.from('suppliers').insert(row).select('*').single();if(error)throw error
   await audit(businessId,profile.id,'supplier.created',Number(data.id),{name:data.name,backup_supplier:data.backup_supplier})
   return json(data,201)
  }
  match=path.match(/^\/businesses\/(\d+)\/suppliers\/(\d+)$/)
  if(match&&method==='PATCH'){
   const businessId=Number(match[1]),supplierId=Number(match[2]);if(!await member(profile.id,businessId,['owner','admin']))return fail('Somente owner/admin',403)
   const payload=await body(req),patch:any={updated_at:now()}
   if('name'in payload){const name=clean(payload.name,160);if(name.length<2)return fail('Informe o nome do fornecedor',422);patch.name=name}
   if('cnpj'in payload)patch.cnpj=clean(payload.cnpj,20)
   if('phone'in payload)patch.phone=clean(payload.phone,40)
   if('notes'in payload)patch.notes=clean(payload.notes,2000)
   if('backup_supplier'in payload)patch.backup_supplier=Boolean(payload.backup_supplier)
   const{data,error}=await admin.from('suppliers').update(patch).eq('id',supplierId).eq('business_id',businessId).eq('soft_deleted',false).select('*').maybeSingle();if(error)throw error;if(!data)return fail('Fornecedor não encontrado',404)
   await audit(businessId,profile.id,'supplier.updated',supplierId,patch)
   return json(data)
  }
  match=path.match(/^\/businesses\/(\d+)\/supplier-comparison$/)
  if(match&&method==='GET'){
   const businessId=Number(match[1]);if(!await member(profile.id,businessId))return fail('Sem acesso',403)
   const ingredientId=Math.max(0,int(url.searchParams.get('ingredient_id')));if(!ingredientId)return fail('ingredient_id obrigatório',422)
   const result=await comparison(businessId,ingredientId);return result?json(result):fail('Ingrediente não encontrado',404)
  }
  return fail('Rota não encontrada',404)
 }catch(error){
  console.error('Fornecedores 360 error',error)
  const message=String((error as any)?.message||error||'Erro interno')
  if(message.includes('duplicate key'))return fail('Registro duplicado',409)
  return fail('Erro interno',500)
 }
})
