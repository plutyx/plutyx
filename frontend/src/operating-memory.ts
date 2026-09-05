const API = import.meta.env.VITE_API_URL || '/api'

type BusinessRef={id:number}
type MemoryState={namespace:string;data:Record<string,unknown>;version:number;updated_at:string|null}
type MemoryList={business_id:number;states:Record<string,MemoryState>}
type Descriptor={namespace:string;prefix:string}

const descriptors:Descriptor[]=[
  {namespace:'system360',prefix:'c360-system360-cpa-'},
  {namespace:'playbook',prefix:'c360-playbook-v21-'},
  {namespace:'vitrine',prefix:'c360-vitrine-v22-'},
  {namespace:'growth',prefix:'c360-growth-v23-'},
  {namespace:'control-incidents',prefix:'c360-incidents-v24-'},
  {namespace:'control-contingency',prefix:'c360-contingency-v24-'},
  {namespace:'execution',prefix:'c360-execution-v25-'},
]

const nativeSet=Storage.prototype.setItem
const nativeGet=Storage.prototype.getItem
let installed=false
const timers=new Map<string,number>()

function token(){return nativeGet.call(localStorage,'c360_token')||''}
function keyFor(d:Descriptor,businessId:number){return `${d.prefix}${businessId}`}
function parseKey(key:string){
  for(const d of descriptors){
    if(!key.startsWith(d.prefix))continue
    const id=Number(key.slice(d.prefix.length))
    if(Number.isInteger(id)&&id>0)return{descriptor:d,businessId:id}
  }
  return null
}
function safeObject(raw:string|null):Record<string,unknown>|null{
  if(!raw)return null
  try{const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?value:null}catch{return null}
}
async function api(path:string,options:RequestInit={},signal?:AbortSignal){
  const auth=token();if(!auth)throw new Error('not authenticated')
  const response=await fetch(`${API}${path}`,{...options,signal:signal||options.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`,...(options.headers||{})}})
  const body=await response.json().catch(()=>({detail:'Resposta inválida'}))
  if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'Falha ao sincronizar memória operacional')
  return body
}
async function writeRemote(businessId:number,namespace:string,data:Record<string,unknown>,signal?:AbortSignal){
  await api(`/businesses/${businessId}/memory/${namespace}`,{method:'PUT',body:JSON.stringify({data})},signal)
  window.dispatchEvent(new CustomEvent('c360-memory-synced',{detail:{businessId,namespace}}))
}
function schedule(key:string,value:string){
  const parsed=parseKey(key);if(!parsed)return
  const data=safeObject(value);if(!data)return
  const previous=timers.get(key);if(previous)window.clearTimeout(previous)
  timers.set(key,window.setTimeout(()=>{
    timers.delete(key)
    void writeRemote(parsed.businessId,parsed.descriptor.namespace,data).catch(error=>{
      console.warn('[Cozinha360] operating memory sync failed',parsed.descriptor.namespace,error)
      window.dispatchEvent(new CustomEvent('c360-memory-sync-error',{detail:{businessId:parsed.businessId,namespace:parsed.descriptor.namespace}}))
    })
  },650))
}

export function installOperatingMemoryAutosave(){
  if(installed||typeof window==='undefined')return
  installed=true
  Storage.prototype.setItem=function(key:string,value:string){
    nativeSet.call(this,key,value)
    if(this===window.localStorage&&parseKey(key))schedule(key,value)
  }
}

async function hydrateBusiness(businessId:number,signal:AbortSignal){
  const listing=await api(`/businesses/${businessId}/memory`,{},signal) as MemoryList
  for(const d of descriptors){
    const localKey=keyFor(d,businessId)
    const remote=listing.states?.[d.namespace]
    if(remote?.version>0){
      nativeSet.call(localStorage,localKey,JSON.stringify(remote.data||{}))
      continue
    }
    const local=safeObject(nativeGet.call(localStorage,localKey))
    if(local)await writeRemote(businessId,d.namespace,local,signal).catch(()=>{})
  }
}

export async function prepareOperatingMemory(){
  installOperatingMemoryAutosave()
  if(!token())return
  const controller=new AbortController()
  const timeout=window.setTimeout(()=>controller.abort(),2400)
  try{
    const response=await fetch(`${API}/me`,{headers:{Authorization:`Bearer ${token()}`},signal:controller.signal})
    if(!response.ok)return
    const body=await response.json().catch(()=>({businesses:[]})) as {businesses?:BusinessRef[]}
    const businesses=body.businesses||[]
    await Promise.allSettled(businesses.map(b=>hydrateBusiness(Number(b.id),controller.signal)))
  }catch(error){
    if(!(error instanceof DOMException&&error.name==='AbortError'))console.warn('[Cozinha360] operating memory hydration skipped',error)
  }finally{window.clearTimeout(timeout)}
}
