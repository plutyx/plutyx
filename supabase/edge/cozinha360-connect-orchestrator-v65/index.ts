import { createClient } from 'npm:@supabase/supabase-js@2.115.0'

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLUG='cozinha360-connect-orchestrator-v65'
const VERSION='6.5.0'
const RENDER='https://cozinha-360-os-v41.onrender.com'
const NETLIFY='https://cozinha-360-os.netlify.app'
const LOCAL='http://localhost:5173'
const anon=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const now=()=>new Date().toISOString()
const env=(name:string)=>(Deno.env.get(name)||'').trim()
const clean=(value:unknown,max=500)=>String(value??'').trim().slice(0,max)
const freshWithin=24*60*60*1000

function originOf(value:unknown){try{const o=new URL(String(value||'')).origin;if(o===NETLIFY)return NETLIFY;if(o===LOCAL||o==='http://127.0.0.1:5173')return LOCAL;return RENDER}catch{return RENDER}}
function routePath(req:Request){const p=new URL(req.url).pathname,m=`/${SLUG}`,i=p.indexOf(m);return i>=0?(p.slice(i+m.length)||'/'):p}
function cors(req:Request){return{'Access-Control-Allow-Origin':originOf(req.headers.get('origin')),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Max-Age':'86400','Vary':'Origin','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}
const j=(req:Request,data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors(req)})
const fail=(req:Request,detail:string,status=400,extra:Record<string,unknown>={})=>j(req,{detail,...extra},status)
const parse=async(req:Request)=>{try{return await req.json()}catch{return{}}}

async function auth(req:Request){const h=req.headers.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';if(!token)return null;const{data,error}=await anon.auth.getUser(token);if(error||!data.user)return null;let profile=(await admin.from('users').select('id,email,full_name').eq('auth_user_id',data.user.id).maybeSingle()).data;if(!profile&&data.user.email)profile=(await admin.from('users').select('id,email,full_name').ilike('email',data.user.email).maybeSingle()).data;return profile||null}
async function member(userId:number,businessId:number,write=false){const r=await admin.from('memberships').select('id,role').eq('user_id',userId).eq('business_id',businessId).maybeSingle();if(r.error||!r.data)return null;if(write&&!['owner','admin'].includes(r.data.role))return null;return r.data}
async function audit(businessId:number,userId:number,action:string,entityId:string,payload:unknown){const r=await admin.from('audit_logs').insert({business_id:businessId,actor_user_id:userId,action,entity_type:'integration_partner',entity_id:entityId,payload_json:JSON.stringify(payload??{})});if(r.error)throw r.error}

const nativeProviders=[
 {key:'whatsapp',name:'WhatsApp Business',category:'Pedidos & CRM',capability:'Atendimento, pedidos e recuperação',mode:'oauth',eta:'~2 min',needs:['META_APP_ID','META_APP_SECRET']},
 {key:'ifood',name:'iFood',category:'Marketplace',capability:'Pedidos no mesmo fluxo operacional',mode:'device_code',eta:'~3 min',needs:['IFOOD_CLIENT_ID','IFOOD_CLIENT_SECRET']},
 {key:'mercadopago',name:'Mercado Pago',category:'Pagamento',capability:'Pix e conciliação automática',mode:'oauth',eta:'~1 min',needs:['MERCADOPAGO_CLIENT_ID','MERCADOPAGO_CLIENT_SECRET']},
 {key:'pagbank',name:'PagBank',category:'Pagamento',capability:'Pix, checkout e conciliação',mode:'oauth',eta:'~2 min',needs:['PAGBANK_APP_TOKEN','PAGBANK_CLIENT_ID','PAGBANK_CLIENT_SECRET']},
 {key:'google',name:'Google Business',category:'Descoberta',capability:'Perfil local e presença no Google',mode:'oauth',eta:'~2 min',needs:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']},
 {key:'meta_ads',name:'Meta Ads',category:'Aquisição',capability:'Campanhas ligadas a venda e margem',mode:'oauth',eta:'~2 min',needs:['META_APP_ID','META_APP_SECRET']},
]

const partnerProviders=[
 {key:'99food',name:'99Food',category:'Marketplace',capability:'Pedidos no painel único',access_model:'platform_partner'},
 {key:'keeta',name:'Keeta',category:'Marketplace',capability:'Pedidos no painel único',access_model:'platform_partner'},
 {key:'stone',name:'Stone',category:'POS & Pagamento',capability:'Pagamento presencial e conciliação',access_model:'platform_partner'},
 {key:'cielo',name:'Cielo',category:'POS & Pagamento',capability:'Pagamento presencial e conciliação',access_model:'platform_partner'},
 {key:'getnet',name:'Getnet',category:'POS & Pagamento',capability:'Pagamento presencial e conciliação',access_model:'platform_partner'},
 {key:'rede',name:'Rede',category:'POS & Pagamento',capability:'Pagamento presencial e conciliação',access_model:'platform_partner'},
]

function pagbankReady(){const configured=Boolean(env('PAGBANK_APP_TOKEN')&&env('PAGBANK_CLIENT_ID')&&env('PAGBANK_CLIENT_SECRET'));const sandbox=env('PAGBANK_ENV').toLowerCase()==='sandbox';const homologated=sandbox||env('PAGBANK_HOMOLOGATED').toLowerCase()==='true';return{configured,homologated,ready:configured&&homologated}}
function platformReadiness(provider:any){if(provider.key==='pagbank')return pagbankReady().ready;return provider.needs.every((name:string)=>Boolean(env(name)))}
function safeJson(value:unknown){try{return typeof value==='string'?JSON.parse(value):value??{}}catch{return{}}}
function safeConnection(row:any){return row?{id:row.id,provider:row.provider,status:row.status,display_name:row.display_name||null,external_account_ref:row.external_account_ref||null,last_success_at:row.last_success_at||null,last_error:row.last_error||null,last_error_at:row.last_error_at||null,updated_at:row.updated_at||null}:null}
function isHealthy(row:any){if(row?.status!=='active'||!row?.last_success_at)return false;const ts=Date.parse(row.last_success_at);return Number.isFinite(ts)&&Date.now()-ts<freshWithin}

async function latestPartnerStates(businessId:number){const r=await admin.from('audit_logs').select('id,action,entity_id,payload_json,created_at').eq('business_id',businessId).eq('entity_type','integration_partner').order('id',{ascending:false}).limit(100);if(r.error)return new Map<string,any>();const states=new Map<string,any>();for(const row of r.data||[]){const key=clean(row.entity_id,80);if(!key||states.has(key))continue;states.set(key,{action:row.action,payload:safeJson(row.payload_json),at:row.created_at||null})}return states}

async function passport(req:Request,businessId:number){const who:any=await auth(req);if(!who)return fail(req,'Sem acesso',401);if(!await member(Number(who.id),businessId))return fail(req,'Sem acesso',403)
 const [connectionsResult,credentialsResult,partnerStates]=await Promise.all([
   admin.from('integration_connections').select('id,provider,status,display_name,external_account_ref,last_success_at,last_error,last_error_at,updated_at').eq('business_id',businessId),
   admin.from('integration_credentials').select('connection_id,provider,expires_at,updated_at').eq('business_id',businessId),
   latestPartnerStates(businessId),
 ])
 if(connectionsResult.error)throw connectionsResult.error
 const connections=new Map((connectionsResult.data||[]).map((row:any)=>[String(row.provider),row]))
 const credentials=new Map((credentialsResult.data||[]).map((row:any)=>[Number(row.connection_id),row]))
 const native=nativeProviders.map(provider=>{const row:any=connections.get(provider.key)||null,credential=row?credentials.get(Number(row.id))||null:null,healthy=isHealthy(row),authorized=Boolean(credential)&&['active','degraded','connecting'].includes(row?.status||''),linked=Boolean(row&&(row.external_account_ref||row.display_name)),platform_ready=platformReadiness(provider),score=[authorized,linked,healthy].filter(Boolean).length;let state='platform_setup';if(platform_ready)state='ready';if(row?.status==='connecting')state='connecting';if(row?.status==='degraded')state='degraded';if(row?.status==='active')state=healthy?'healthy':'stale';return{...provider,access_model:'user_authorization',platform_ready,user_secret_required:false,state,score,evidence:{authorization:authorized,account_linked:linked,health:healthy},credential_expires_at:credential?.expires_at||null,connection:safeConnection(row)}})
 const partners=partnerProviders.map(provider=>{const latest=partnerStates.get(provider.key);const requested=latest?.action==='integration.partner.requested';return{...provider,user_secret_required:false,state:requested?'requested':'available',requested_at:requested?latest.at:null}})
 const healthy=native.filter((p:any)=>p.state==='healthy').length,attention=native.filter((p:any)=>['stale','degraded'].includes(p.state)).length,ready=native.filter((p:any)=>p.state==='ready').length,blocked=native.filter((p:any)=>p.state==='platform_setup').length,totalEvidence=native.reduce((sum:number,p:any)=>sum+p.score,0),maxEvidence=native.length*3
 return j(req,{ok:true,version:VERSION,business_id:businessId,generated_at:now(),summary:{native_total:native.length,healthy,attention,ready,platform_setup:blocked,evidence_score:totalEvidence,evidence_max:maxEvidence,progress_percent:maxEvidence?Math.round(totalEvidence/maxEvidence*100):0},native,partners,principles:{restaurant_secrets_required:false,platform_managed_credentials:true,proof_model:['authorization','account_linked','health']}})}

async function requestPartner(req:Request,businessId:number,key:string){const who:any=await auth(req);if(!who)return fail(req,'Sem acesso',401);if(!await member(Number(who.id),businessId,true))return fail(req,'Somente owner/admin pode solicitar integrações.',403);const provider=partnerProviders.find(p=>p.key===key);if(!provider)return fail(req,'Parceiro não suportado',404);const latest=(await latestPartnerStates(businessId)).get(key);if(latest?.action==='integration.partner.requested')return j(req,{ok:true,provider:key,state:'requested',requested_at:latest.at,already_requested:true});const body:any=await parse(req);await audit(businessId,Number(who.id),'integration.partner.requested',key,{provider:key,name:provider.name,category:provider.category,source:clean(body.source||'connections_passport',80),requested_at:now()});return j(req,{ok:true,provider:key,state:'requested',requested_at:now()})}
async function cancelPartner(req:Request,businessId:number,key:string){const who:any=await auth(req);if(!who)return fail(req,'Sem acesso',401);if(!await member(Number(who.id),businessId,true))return fail(req,'Somente owner/admin pode alterar integrações.',403);const provider=partnerProviders.find(p=>p.key===key);if(!provider)return fail(req,'Parceiro não suportado',404);await audit(businessId,Number(who.id),'integration.partner.cancelled',key,{provider:key,cancelled_at:now()});return j(req,{ok:true,provider:key,state:'available'})}

Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});const path=routePath(req);try{if(req.method==='GET'&&path==='/health')return j(req,{ok:true,service:SLUG,version:VERSION,native:nativeProviders.map(p=>({key:p.key,platform_ready:platformReadiness(p)})),partners:partnerProviders.map(p=>p.key)});let m=path.match(/^\/businesses\/(\d+)\/passport$/);if(req.method==='GET'&&m)return await passport(req,Number(m[1]));m=path.match(/^\/businesses\/(\d+)\/partners\/([a-z0-9_-]+)$/);if(req.method==='POST'&&m)return await requestPartner(req,Number(m[1]),m[2]);if(req.method==='DELETE'&&m)return await cancelPartner(req,Number(m[1]),m[2]);return fail(req,'Rota não encontrada',404)}catch(e){return fail(req,clean((e as any)?.message||e,800),500)}})
