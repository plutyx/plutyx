export type CachedBusiness={id:number;name:string;city?:string;role?:string}
export type CachedProduct={id:number;name:string;category?:string;active:boolean}
export type CachedCostPreview={product_id:number;product_name:string;ingredients_cents:number;packaging_cents:number;energy_cents:number;labor_cents:number;direct_cost_per_unit_cents:number;method:string}
export type OfflineQuickPayload={product_id:number;quantity:number;unit_price_cents:number;paid:boolean;source:string;idempotency_key:string;customer_id?:number|null;channel_id?:number|null}
export type OfflineQuickOrder={
 id:string;business_id:number;business_name:string;product_name:string;created_at:string;attempts:number;state:'pending'|'failed';last_error:string|null;
 preview_total_cents:number;preview_contribution_cents:number;payload:OfflineQuickPayload
}

const API=import.meta.env.VITE_API_URL||'/api'
const QUEUE_KEY='c360-offline-orders-v50'
const BUSINESSES_KEY='c360-offline-businesses-v50'
const CACHE_PREFIX='c360-offline-catalog-v50'
const COST_PREFIX='c360-offline-cost-v50'
const MAX_QUEUE=100
const EVENT='c360-offline-queue-changed'

function safeJSON<T>(raw:string|null,fallback:T):T{try{return raw?JSON.parse(raw) as T:fallback}catch{return fallback}}
function emit(){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(EVENT))}
function writeQueue(rows:OfflineQuickOrder[]){localStorage.setItem(QUEUE_KEY,JSON.stringify(rows.slice(-MAX_QUEUE)));emit()}
export function queueEventName(){return EVENT}
export function readOfflineQueue(){return safeJSON<OfflineQuickOrder[]>(localStorage.getItem(QUEUE_KEY),[])}
export function queueStats(){const rows=readOfflineQueue();return{total:rows.length,pending:rows.filter(x=>x.state==='pending').length,failed:rows.filter(x=>x.state==='failed').length}}

export function cacheBusinesses(rows:CachedBusiness[]){localStorage.setItem(BUSINESSES_KEY,JSON.stringify({saved_at:new Date().toISOString(),rows}))}
export function readCachedBusinesses(){return safeJSON<{saved_at:string;rows:CachedBusiness[]}>(localStorage.getItem(BUSINESSES_KEY),{saved_at:'',rows:[]})}
export function cacheProducts(businessId:number,rows:CachedProduct[]){localStorage.setItem(`${CACHE_PREFIX}-${businessId}`,JSON.stringify({saved_at:new Date().toISOString(),rows}))}
export function readCachedProducts(businessId:number){return safeJSON<{saved_at:string;rows:CachedProduct[]}>(localStorage.getItem(`${CACHE_PREFIX}-${businessId}`),{saved_at:'',rows:[]})}
export function cacheCostPreview(businessId:number,productId:number,cost:CachedCostPreview){localStorage.setItem(`${COST_PREFIX}-${businessId}-${productId}`,JSON.stringify({saved_at:new Date().toISOString(),cost}))}
export function readCachedCostPreview(businessId:number,productId:number){return safeJSON<{saved_at:string;cost:CachedCostPreview|null}>(localStorage.getItem(`${COST_PREFIX}-${businessId}-${productId}`),{saved_at:'',cost:null})}

export function rememberQuickPrice(businessId:number,productId:number,source:string,priceCents:number){if(priceCents>0)localStorage.setItem(`c360-quick-price-v50-${businessId}-${productId}-${source}`,String(priceCents))}
export function recallQuickPrice(businessId:number,productId:number,source:string){const n=Number(localStorage.getItem(`c360-quick-price-v50-${businessId}-${productId}-${source}`)||0);return Number.isFinite(n)&&n>0?n:0}
export function rememberQuickSource(businessId:number,source:string){if(businessId&&source)localStorage.setItem(`c360-quick-source-v50-${businessId}`,source)}
export function recallQuickSource(businessId:number){return localStorage.getItem(`c360-quick-source-v50-${businessId}`)||'whatsapp'}

export function enqueueOfflineQuickOrder(input:Omit<OfflineQuickOrder,'id'|'created_at'|'attempts'|'state'|'last_error'>){
 const id=input.payload.idempotency_key||`offline-${crypto.randomUUID()}`
 const row:OfflineQuickOrder={...input,id,created_at:new Date().toISOString(),attempts:0,state:'pending',last_error:null}
 const rows=readOfflineQueue().filter(x=>x.id!==id)
 if(rows.length>=MAX_QUEUE)throw new Error(`O modo offline guarda no máximo ${MAX_QUEUE} pedidos por dispositivo. Conecte para sincronizar antes de continuar.`)
 writeQueue([...rows,row]);return row
}
export function discardOfflineOrder(id:string){writeQueue(readOfflineQueue().filter(x=>x.id!==id))}
export function retryOfflineOrder(id:string){writeQueue(readOfflineQueue().map(x=>x.id===id?{...x,state:'pending' as const,last_error:null}:x))}

function networkFailure(error:unknown){if(typeof navigator!=='undefined'&&!navigator.onLine)return true;if(error instanceof TypeError)return true;const msg=error instanceof Error?error.message:String(error||'');return /failed to fetch|networkerror|load failed|network request failed/i.test(msg)}
export function isNetworkFailure(error:unknown){return networkFailure(error)}

type FlushResult={synced:number;pending:number;failed:number;auth_required:boolean;stopped_reason:string|null}
export async function flushOfflineOrders(token:string):Promise<FlushResult>{
 let rows=readOfflineQueue();let synced=0;let authRequired=false;let stopped:string|null=null
 if(!token)return{synced:0,pending:rows.filter(x=>x.state==='pending').length,failed:rows.filter(x=>x.state==='failed').length,auth_required:true,stopped_reason:'Sessão ausente'}
 if(typeof navigator!=='undefined'&&!navigator.onLine)return{synced:0,pending:rows.filter(x=>x.state==='pending').length,failed:rows.filter(x=>x.state==='failed').length,auth_required:false,stopped_reason:'Sem conexão'}
 for(const item of [...rows]){
  if(item.state!=='pending')continue
  try{
   const response=await fetch(`${API}/businesses/${item.business_id}/orders/quick`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(item.payload)})
   const body=await response.json().catch(()=>({detail:'Resposta inválida'}))
   if(response.ok){rows=rows.filter(x=>x.id!==item.id);synced+=1;writeQueue(rows);continue}
   if(response.status===401||response.status===403){authRequired=true;stopped=body.detail||'Entre novamente para sincronizar';rows=rows.map(x=>x.id===item.id?{...x,attempts:x.attempts+1,last_error:stopped}:x);writeQueue(rows);break}
   if(response.status>=400&&response.status<500){const detail=String(body.detail||`Pedido recusado (${response.status})`);rows=rows.map(x=>x.id===item.id?{...x,state:'failed' as const,attempts:x.attempts+1,last_error:detail}:x);writeQueue(rows);continue}
   stopped=String(body.detail||`Servidor indisponível (${response.status})`);rows=rows.map(x=>x.id===item.id?{...x,attempts:x.attempts+1,last_error:stopped}:x);writeQueue(rows);break
  }catch(error){stopped=networkFailure(error)?'Conexão interrompida durante a sincronização':(error instanceof Error?error.message:'Falha ao sincronizar');rows=rows.map(x=>x.id===item.id?{...x,attempts:x.attempts+1,last_error:stopped}:x);writeQueue(rows);break}
 }
 const stats={pending:rows.filter(x=>x.state==='pending').length,failed:rows.filter(x=>x.state==='failed').length}
 return{synced,...stats,auth_required:authRequired,stopped_reason:stopped}
}
