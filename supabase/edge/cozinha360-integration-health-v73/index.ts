import { createClient } from 'npm:@supabase/supabase-js@2.115.0'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLUG='cozinha360-integration-health-v73'
const VERSION='7.3.0'
const CANONICAL_APP='https://cozinha-360-os.netlify.app'
const ORIGINS=new Set([CANONICAL_APP,'https://cozinha-360-os-v41.onrender.com','http://localhost:5173','http://127.0.0.1:5173','http://localhost:3000'])
const anon=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const enc=new TextEncoder(),dec=new TextDecoder()
const now=()=>new Date().toISOString()
const env=(name:string)=>(Deno.env.get(name)||'').trim()
const clean=(value:unknown,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)
const safeJson=(value:unknown,fallback:any={})=>{try{return typeof value==='string'?JSON.parse(value):value??fallback}catch{return fallback}}
function origin(req:Request){try{const value=new URL(req.headers.get('origin')||CANONICAL_APP).origin;return ORIGINS.has(value)?value:CANONICAL_APP}catch{return CANONICAL_APP}}
function cors(req:Request){return{'Access-Control-Allow-Origin':origin(req),'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-c360-health-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Max-Age':'86400','Vary':'Origin','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}
const j=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)})
const fail=(req:Request,detail:string,status=400,extra:Record<string,unknown>={})=>j(req,{detail,...extra},status)
function pathOf(req:Request){const path=new URL(req.url).pathname,marker='/'+SLUG,index=path.indexOf(marker);return index>=0?(path.slice(index+marker.length)||'/'):path}

async function auth(req:Request){const raw=req.headers.get('authorization')||'',token=raw.startsWith('Bearer ')?raw.slice(7):'';if(!token)return null;const{data,error}=await anon.auth.getUser(token);if(error||!data.user)return null;let profile=(await admin.from('users').select('id,email,full_name').eq('auth_user_id',data.user.id).maybeSingle()).data;if(!profile&&data.user.email)profile=(await admin.from('users').select('id,email,full_name').ilike('email',data.user.email).maybeSingle()).data;return profile||null}
async function member(userId:number,businessId:number){const row=(await admin.from('memberships').select('id').eq('user_id',userId).eq('business_id',businessId).maybeSingle()).data;return Boolean(row)}
async function workerAuthorized(req:Request){const key=req.headers.get('x-c360-health-key')||'';if(!key)return false;const result=await admin.rpc('c360_verify_health_worker_key',{p_value:key});return !result.error&&result.data===true}

function b64bytes(value:string){let s=value.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function bytesB64(value:Uint8Array){let s='';for(const byte of value)s+=String.fromCharCode(byte);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function rootBytes(){const seed=env('C360_INTEGRATION_KEY')||`${SERVICE_KEY}:c360-integrations-v29`;return new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(seed)))}
async function aesKey(){return crypto.subtle.importKey('raw',await rootBytes(),{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function openSecret(row:any){const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64bytes(row.iv)},await aesKey(),b64bytes(row.ciphertext));return JSON.parse(dec.decode(plain))}
async function seal(value:unknown){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(),enc.encode(JSON.stringify(value)));return{ciphertext:bytesB64(new Uint8Array(cipher)),iv:bytesB64(iv)}}
async function credential(connectionId:number){const r=await admin.from('integration_credentials').select('*').eq('connection_id',connectionId).maybeSingle();if(r.error)throw r.error;if(!r.data)return null;return{row:r.data,secret:await openSecret(r.data),metadata:safeJson(r.data.metadata_json,{}),scopes:safeJson(r.data.scopes_json,[])}}
async function saveCredential(connection:any,cred:any,secret:any,expiresAt:string|null){const sealed=await seal(secret);const r=await admin.from('integration_credentials').upsert({connection_id:connection.id,business_id:connection.business_id,provider:connection.provider,ciphertext:sealed.ciphertext,iv:sealed.iv,key_version:1,expires_at:expiresAt,scopes_json:JSON.stringify(cred.scopes||[]),metadata_json:JSON.stringify({...cred.metadata,health_refreshed_at:now()}),updated_at:now()},{onConflict:'connection_id'});if(r.error)throw r.error}
function expiryFrom(secret:any){const seconds=Number(secret?.expires_in||secret?.expiresIn||0);return seconds>0?new Date(Date.now()+seconds*1000).toISOString():null}

async function jsonFetch(url:string,init:RequestInit,label:string){const response=await fetch(url,{...init,signal:AbortSignal.timeout(8000)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(clean(body?.error?.message||body?.message||body?.error_description||body?.error||`${label} recusou o pulso`,500));return body}
const bearer=(token:string)=>({authorization:`Bearer ${token}`})
async function refreshGoogle(secret:any){if(!secret.refresh_token)throw new Error('Google exige nova autorização');const form=new URLSearchParams({client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),refresh_token:String(secret.refresh_token),grant_type:'refresh_token'});const x=await jsonFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form},'Google refresh');return{...secret,...x,refresh_token:secret.refresh_token}}
async function refreshMercado(secret:any){if(!secret.refresh_token)throw new Error('Mercado Pago exige nova autorização');const x=await jsonFetch('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:env('MERCADOPAGO_CLIENT_ID'),client_secret:env('MERCADOPAGO_CLIENT_SECRET'),grant_type:'refresh_token',refresh_token:secret.refresh_token})},'Mercado Pago refresh');return{...secret,...x}}
async function ensureFresh(connection:any,cred:any){const expires=cred.row.expires_at?Date.parse(cred.row.expires_at):0;if(!expires||expires>Date.now()+5*60_000)return cred;let secret=cred.secret;if(connection.provider==='google')secret=await refreshGoogle(secret);else if(connection.provider==='mercadopago')secret=await refreshMercado(secret);else throw new Error(`${connection.provider==='whatsapp'?'WhatsApp':connection.provider==='meta_ads'?'Meta Ads':connection.provider} exige nova autorização`);const expiresAt=expiryFrom(secret);await saveCredential(connection,cred,secret,expiresAt);return{...cred,secret,row:{...cred.row,expires_at:expiresAt},metadata:{...cred.metadata,health_refreshed_at:now()}}}

type Strategy='probe'|'signal'
type Probe={ok:boolean;strategy:Strategy;detail:string;external_call:boolean}
const providerIntervals:Record<string,number>={ifood:5,mercadopago:10,google:10,whatsapp:15,meta_ads:15}
const supported=new Set(Object.keys(providerIntervals))

async function probe(connection:any):Promise<Probe>{
 if(connection.provider==='ifood'){
   const ts=connection.last_success_at?Date.parse(connection.last_success_at):0
   const age=ts?Date.now()-ts:Number.POSITIVE_INFINITY
   const ok=Number.isFinite(age)&&age<=3*60_000
   return{ok,strategy:'signal',external_call:false,detail:ok?'Polling iFood presente':`Polling iFood sem pulso recente (${ts?Math.max(1,Math.round(age/60000))+' min':'nunca'})`}
 }
 const original=await credential(Number(connection.id))
 if(!original)throw new Error('Credencial da conexão não encontrada')
 const cred=await ensureFresh(connection,original)
 const access=String(cred.secret?.access_token||'')
 if(!access)throw new Error('Token de acesso ausente; reconecte a conta')
 if(connection.provider==='google'){
   await jsonFetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts',{headers:bearer(access)},'Google Business')
   return{ok:true,strategy:'probe',external_call:true,detail:'Google Business respondeu'}
 }
 if(connection.provider==='mercadopago'){
   await jsonFetch('https://api.mercadopago.com/users/me',{headers:bearer(access)},'Mercado Pago')
   return{ok:true,strategy:'probe',external_call:true,detail:'Mercado Pago respondeu'}
 }
 if(connection.provider==='meta_ads'){
   const ref=clean(connection.external_account_ref,160)
   const target=ref?`${encodeURIComponent(ref)}?fields=id,name,account_status`:'me?fields=id,name'
   await jsonFetch(`https://graph.facebook.com/${target}`,{headers:bearer(access)},'Meta Ads')
   return{ok:true,strategy:'probe',external_call:true,detail:'Meta Ads respondeu'}
 }
 if(connection.provider==='whatsapp'){
   const ref=clean(connection.external_account_ref,160)
   const target=ref?`${encodeURIComponent(ref)}?fields=id,display_phone_number,verified_name,quality_rating`:'me?fields=id,name'
   await jsonFetch(`https://graph.facebook.com/${target}`,{headers:bearer(access)},'WhatsApp Business')
   return{ok:true,strategy:'probe',external_call:true,detail:'WhatsApp Business respondeu'}
 }
 throw new Error('Provedor sem estratégia automática segura')
}

function nextState(previous:string|undefined,failures:number,ok:boolean){if(ok)return previous==='degrading'||previous==='review'?'recovered':'healthy';return failures+1>=2?'review':'degrading'}
async function record(connection:any,current:any,result:Probe|{ok:false;strategy:Strategy;detail:string;external_call:boolean}){
 const checked=now(),failures=result.ok?0:Number(current?.consecutive_failures||0)+1,state=nextState(current?.state,Number(current?.consecutive_failures||0),result.ok),transition=current?.state!==state?checked:current?.last_transition_at||checked,minutes=providerIntervals[connection.provider]||15,nextAt=new Date(Date.now()+minutes*60_000).toISOString()
 const row={connection_id:connection.id,business_id:connection.business_id,provider:connection.provider,state,strategy:result.strategy,consecutive_failures:failures,last_checked_at:checked,last_probe_ok_at:result.ok?checked:current?.last_probe_ok_at||null,last_probe_error_at:result.ok?current?.last_probe_error_at||null:checked,last_probe_error:result.ok?null:clean(result.detail,500),last_transition_at:transition,next_check_at:nextAt,updated_at:checked}
 const saved=await admin.from('integration_health_states').upsert(row,{onConflict:'connection_id'});if(saved.error)throw saved.error
 // A successful probe is a valid connection success signal, but it must never clear
 // operational errors nor force an operational status transition.
 if(result.ok&&result.external_call){const u=await admin.from('integration_connections').update({last_success_at:checked,updated_at:checked}).eq('id',connection.id);if(u.error)throw u.error}
 return{connection_id:connection.id,provider:connection.provider,state,strategy:result.strategy,ok:result.ok,external_call:result.external_call,next_check_at:nextAt}
}

async function checkConnection(connection:any,current:any){try{return await record(connection,current,await probe(connection))}catch(error){const strategy:Strategy=connection.provider==='ifood'?'signal':'probe';return await record(connection,current,{ok:false,strategy,detail:clean((error as any)?.message||error,500),external_call:false})}}
async function run(){const connectionsResult=await admin.from('integration_connections').select('id,business_id,provider,status,external_account_ref,display_name,last_success_at,last_error_at,last_error,updated_at').in('status',['active','degraded']).order('id');if(connectionsResult.error)throw connectionsResult.error;const rows=(connectionsResult.data||[]).filter((row:any)=>supported.has(String(row.provider)));const statesResult=await admin.from('integration_health_states').select('*').in('connection_id',rows.map((row:any)=>row.id).length?rows.map((row:any)=>row.id):[-1]);if(statesResult.error)throw statesResult.error;const byId=new Map((statesResult.data||[]).map((row:any)=>[Number(row.connection_id),row]));const results:any[]=[];let skipped=0;for(const connection of rows){const current:any=byId.get(Number(connection.id))||null,next=current?.next_check_at?Date.parse(current.next_check_at):0;if(next&&next>Date.now()){skipped++;continue}results.push(await checkConnection(connection,current))}return{checked:results.length,skipped,connections:rows.length,results}}

function derivedState(connection:any,health:any){if(connection.status==='degraded')return'review';if(health?.state)return health.state;const ts=connection.last_success_at?Date.parse(connection.last_success_at):0;if(connection.status==='active'&&ts&&Date.now()-ts<24*60*60_000)return'healthy';return connection.status==='active'?'degrading':'review'}
async function businessHealth(req:Request,businessId:number,userId:number){if(!await member(userId,businessId))return fail(req,'Sem acesso',403);const connectionsResult=await admin.from('integration_connections').select('id,business_id,provider,status,display_name,external_account_ref,last_success_at,last_error_at,last_error,updated_at').eq('business_id',businessId).in('provider',Array.from(supported)).order('provider');if(connectionsResult.error)throw connectionsResult.error;const connections=connectionsResult.data||[],ids=connections.map((row:any)=>row.id),healthResult=await admin.from('integration_health_states').select('*').in('connection_id',ids.length?ids:[-1]);if(healthResult.error)throw healthResult.error;const healthBy=new Map((healthResult.data||[]).map((row:any)=>[Number(row.connection_id),row]));const items=connections.map((connection:any)=>{const health:any=healthBy.get(Number(connection.id))||null,effective_state=derivedState(connection,health);return{connection_id:connection.id,provider:connection.provider,name:connection.display_name||null,connection_status:connection.status,state:health?.state||null,effective_state,strategy:health?.strategy||(connection.provider==='ifood'?'signal':'probe'),consecutive_failures:Number(health?.consecutive_failures||0),last_checked_at:health?.last_checked_at||null,last_probe_ok_at:health?.last_probe_ok_at||null,last_probe_error_at:health?.last_probe_error_at||null,last_probe_error:health?.last_probe_error||null,next_check_at:health?.next_check_at||null,last_success_at:connection.last_success_at||null,operational_error_at:connection.last_error_at||null,operational_error_present:Boolean(connection.last_error),operational_error:connection.last_error||null}});const summary={healthy:items.filter((x:any)=>x.effective_state==='healthy').length,degrading:items.filter((x:any)=>x.effective_state==='degrading').length,review:items.filter((x:any)=>x.effective_state==='review').length,recovered:items.filter((x:any)=>x.effective_state==='recovered').length,total:items.length};return j(req,{ok:true,version:VERSION,business_id:businessId,generated_at:now(),summary,items,principles:{server_side:true,ifood_passive_signal:true,operational_errors_preserved:true}})}

Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});const path=pathOf(req);try{if(path==='/livez'&&req.method==='GET')return j(req,{ok:true,service:SLUG,version:VERSION});if(path==='/run'&&req.method==='POST'){if(!await workerAuthorized(req))return fail(req,'Worker não autorizado',401);const result=await run();return j(req,{ok:true,version:VERSION,ran_at:now(),...result})}const user:any=await auth(req);if(!user)return fail(req,'Sessão inválida',401);const match=path.match(/^\/businesses\/(\d+)\/health$/);if(match&&req.method==='GET')return businessHealth(req,Number(match[1]),Number(user.id));return fail(req,'Rota não encontrada',404)}catch(error){console.error(SLUG,error);return fail(req,'Erro interno do pulso de integrações',500)}})
