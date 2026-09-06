import React,{useEffect,useMemo,useState}from'react'
import{ArrowLeft,BadgeCheck,Check,CircleAlert,CreditCard,Layers3,Loader2,LockKeyhole,RefreshCcw,ShieldCheck}from'lucide-react'
import{request}from'./app'

type Business={id:number;name:string;city:string;role:string}
type Entitlement={business_id:number;commercial_state:string;enforcement_mode:string;billing_configured:boolean;provider:string;plan_key:string;status:string;current_period_end:string|null;cancel_at_period_end:boolean;features:string[];access_allowed:boolean;reason:string;updated_at:string|null}

const ENTITLEMENTS_API=import.meta.env.VITE_ENTITLEMENTS_API_URL||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-entitlements-v34'
const featureGroups=[
 {title:'Operação',items:[['core','Pedidos, produtos, custos e financeiro'],['kitchen','Modo cozinha'],['direct','Venda direta']]},
 {title:'Crescimento',items:[['system360','Sistema 360'],['playbook','Laboratório 360'],['vitrine','Vitrine Studio'],['growth','Growth Lab'],['connections','Conexões']]},
 {title:'Controle',items:[['cash','Cash & Margin'],['control','Control Tower'],['execution','Execution Hub'],['crm','CRM de recompra'],['margin','Margens & canais']]},
] as const

async function ereq(path:string,token:string){const r=await fetch(`${ENTITLEMENTS_API}${path}`,{headers:{Authorization:`Bearer ${token}`}});const b=await r.json().catch(()=>({detail:'Resposta inválida'}));if(!r.ok)throw new Error(b.detail||'Não foi possível consultar o plano');return b as Entitlement}

export function SubscriptionStatusRoute(){
 const token=localStorage.getItem('c360_token')||''
 const[businesses,setBusinesses]=useState<Business[]>([]),[businessId,setBusinessId]=useState(0),[entitlement,setEntitlement]=useState<Entitlement|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 async function load(target=businessId){setError('');setLoading(true);try{let id=target;if(!businesses.length){const me=await request('/me',{},token);const rows=(me.businesses||[]) as Business[];setBusinesses(rows);id=id||Number(rows[0]?.id||0);if(id)setBusinessId(id)}if(!id){setEntitlement(null);return}setEntitlement(await ereq(`/businesses/${id}/entitlements`,token))}catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar o plano')}finally{setLoading(false)}}
 useEffect(()=>{if(token)void load()},[])
 const allowed=useMemo(()=>new Set(entitlement?.features||[]),[entitlement])
 if(!token)return <main className="sub-shell sub-center"><section className="sub-empty"><LockKeyhole/><h1>Entre na operação primeiro.</h1><a href="/">Entrar</a></section></main>
 return <main className="sub-shell"><header className="sub-top"><a href="/"><ArrowLeft/> Operação</a><b><CreditCard/> PLANO <span>& ACESSO</span></b><div>{businesses.length>1&&<select value={businessId} onChange={e=>{const id=Number(e.target.value);setBusinessId(id);void load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button onClick={()=>void load(businessId)} aria-label="Atualizar"><RefreshCcw/></button></div></header>
  {loading?<section className="sub-center"><div className="sub-loader"><Loader2/> CONSULTANDO ACESSO NO SERVIDOR</div></section>:<section className="sub-page">
   <div className="sub-hero"><div><span>COZINHA 360 · COMERCIAL</span><h1>A cobrança não decide pelo navegador.</h1><p>Plano, status e recursos vêm do servidor por negócio. Nesta fase candidata, o sistema observa o estado comercial sem cortar módulos enquanto checkout, assinatura do provedor e recuperação de cobrança ainda não foram validados.</p></div><div className={`sub-state ${entitlement?.billing_configured?'configured':'candidate'}`}><ShieldCheck/><span>{entitlement?.billing_configured?'BILLING CONFIGURADO':'AMBIENTE CANDIDATO'}</span><b>{entitlement?.plan_key?.toUpperCase()||'—'}</b><small>{entitlement?.enforcement_mode==='observe_only'?'OBSERVAÇÃO — SEM BLOQUEIO':'ENFORCEMENT ATIVO'}</small></div></div>
   {error&&<div className="sub-banner bad"><CircleAlert/>{error}</div>}
   {entitlement&&<>
    <section className="sub-summary"><div><BadgeCheck/><div><span>ESTADO ATUAL</span><h2>{entitlement.billing_configured?statusLabel(entitlement.status):'Cobrança automática ainda não ativada.'}</h2><p>{entitlement.billing_configured?'O servidor já possui um provedor comercial associado a este negócio.':'Nenhum provedor de cobrança está ligado a este negócio. Não há cobrança automática configurada pelo Cozinha 360 neste momento.'}</p></div></div><div className="sub-facts"><Fact label="Provedor" value={entitlement.provider==='none'?'Nenhum':entitlement.provider}/><Fact label="Status" value={statusLabel(entitlement.status)}/><Fact label="Acesso" value={entitlement.access_allowed?'Liberado':'Restrito'}/><Fact label="Renovação" value={entitlement.current_period_end?new Date(entitlement.current_period_end).toLocaleDateString('pt-BR'):'Não configurada'}/></div></section>
    <section className="sub-gates"><Gate ok title="Entitlement no servidor" text="A decisão de acesso é consultada por negócio e exige sessão + membership."/><Gate ok title="Ledger idempotente" text="A base já reserva IDs únicos de eventos para impedir processamento duplicado."/><Gate title="Checkout real" text="Ainda não conectado a uma conta/preço comercial do provedor de pagamento."/><Gate title="Webhook assinado" text="A tabela está pronta, mas a assinatura do provedor ainda precisa ser configurada e testada."/></section>
    <section className="sub-features"><header><div><span>RECURSOS EFETIVOS</span><h2>O que este negócio pode usar agora</h2></div><small>Fonte: servidor · não localStorage</small></header><div className="sub-feature-grid">{featureGroups.map(group=><article key={group.title}><h3>{group.title}</h3>{group.items.map(([key,label])=><div key={key} className={allowed.has(key)?'allowed':'locked'}>{allowed.has(key)?<Check/>:<LockKeyhole/>}<span>{label}</span><b>{allowed.has(key)?'LIBERADO':'PLANO'}</b></div>)}</article>)}</div></section>
    <section className="sub-boundary"><LockKeyhole/><div><b>Limite comercial explícito</b><p>Esta tela não significa que checkout e assinatura recorrente já estejam prontos. O núcleo de entitlement está ativo; cobrança real só deve ser habilitada depois de escolher conta/preço, verificar assinatura de webhook, idempotência, cancelamento e recuperação de pagamento em modo de teste e depois em produção.</p></div></section>
   </>}
  </section>}
 </main>
}

function Fact({label,value}:{label:string;value:string}){return <div><span>{label}</span><b>{value}</b></div>}
function Gate({ok=false,title,text}:{ok?:boolean;title:string;text:string}){return <article className={ok?'ok':''}>{ok?<Check/>:<CircleAlert/>}<div><b>{title}</b><p>{text}</p></div></article>}
function statusLabel(v:string){return({candidate:'Candidato',free:'Gratuito',trialing:'Teste',active:'Ativo',past_due:'Pagamento pendente',canceled:'Cancelado'} as Record<string,string>)[v]||v}
