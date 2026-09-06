import React,{useEffect,useMemo,useState}from'react'
import{AlertTriangle,ArrowLeft,ArrowRight,Building2,CheckCircle2,ChefHat,CircleDollarSign,Clock3,Gauge,PackageSearch,RefreshCcw,Store,TriangleAlert,WifiOff}from'lucide-react'
import{money}from'./app'
import{intelligenceRequest}from'./intelligence-api-v50'

type Tone='critical'|'warning'|'neutral'|'stable'
type Signal={score:number;code:string;tone:Tone;title:string;detail:string}
type Unit={business_id:number;name:string;city:string;role:string;revenue_cents:number;contribution_cents:number;contribution_margin_bps:number;order_count:number;open_orders:number;delayed_open:number;delay_rate:number;error_rate:number;stock_alerts:number;attention:Signal;signals:Signal[]}
type Portfolio={generated_at:string;period_days:number;summary:{businesses:number;attention:number;critical:number;revenue_cents:number;contribution_cents:number;order_count:number;open_orders:number;delayed_open:number;stock_alerts:number};top_action:null|{business_id:number;business_name:string;score:number;tone:Tone;title:string;detail:string;href:string};businesses:Unit[]}

function pct(value=0){return `${(Number(value||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}
function margin(bps=0){return `${(Number(bps||0)/100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}
function clock(raw:string){try{return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(raw))}catch{return 'agora'}}

export function Network360Route(){
 const token=localStorage.getItem('c360_token')||''
 const[data,setData]=useState<Portfolio|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 async function load(){if(!token){window.location.replace('/');return}setLoading(true);setError('');try{setData(await intelligenceRequest('/portfolio/overview',{},token))}catch(e){setError(e instanceof Error?e.message:'Não foi possível montar a visão de rede.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[])
 const ordered=useMemo(()=>data?.businesses||[],[data])
 if(loading)return <main className="network50-shell network50-center"><div className="network50-loader"><Building2/>CRUZANDO TODAS AS OPERAÇÕES</div></main>
 if(error||!data)return <main className="network50-shell network50-center"><section className="network50-error"><WifiOff/><h1>A visão de rede não carregou.</h1><p>{error||'Tente novamente.'}</p><button onClick={()=>void load()}><RefreshCcw/>Tentar novamente</button></section></main>
 const top=data.top_action
 return <main className="network50-shell">
  <header className="network50-top"><a href="/"><ArrowLeft/>Operação</a><b><Building2/> NETWORK <span>360</span></b><div><span>Atualizado {clock(data.generated_at)}</span><button onClick={()=>void load()} aria-label="Atualizar"><RefreshCcw/></button></div></header>
  <section className="network50-page">
   <div className="network50-hero"><div><span>VISÃO DE REDE · EXCEÇÕES PRIMEIRO</span><h1>Todas as operações. Só o que merece sua atenção.</h1><p>Em vez de abrir unidade por unidade, o 360 cruza margem, pedidos, atraso, erro e estoque e ordena onde agir primeiro. Nenhuma recomendação altera dados automaticamente.</p></div><aside className={data.summary.critical?'critical':data.summary.attention?'warning':'stable'}><Gauge/><div><span>STATUS DA REDE</span><strong>{data.summary.critical?`${data.summary.critical} crítica${data.summary.critical===1?'':'s'}`:data.summary.attention?`${data.summary.attention} em atenção`:'estável'}</strong><small>{data.summary.businesses} operação{data.summary.businesses===1?'':'ões'} acessível{data.summary.businesses===1?'':'eis'}</small></div></aside></div>
   {top&&<article className={`network50-top-action ${top.tone}`}><div className="network50-top-icon">{top.tone==='critical'?<TriangleAlert/>:top.tone==='warning'?<AlertTriangle/>:<CheckCircle2/>}</div><div><span>PRIMEIRA AÇÃO</span><h2>{top.business_name}: {top.title}</h2><p>{top.detail}</p></div><a href={top.href}>Abrir briefing<ArrowRight/></a></article>}
   <div className="network50-kpis"><Kpi label="Vendas 30d" value={money(data.summary.revenue_cents)} note={`${data.summary.order_count} pedidos pagos`}/><Kpi label="Contribuição" value={money(data.summary.contribution_cents)} note="após custos variáveis" warn={data.summary.contribution_cents<0}/><Kpi label="Pedidos abertos" value={String(data.summary.open_orders)} note={data.summary.delayed_open?`${data.summary.delayed_open} atrasados`:'sem atraso marcado'} warn={data.summary.delayed_open>0}/><Kpi label="Estoque" value={String(data.summary.stock_alerts)} note="itens abaixo do mínimo" warn={data.summary.stock_alerts>0}/></div>
   <section className="network50-list"><header><div><span>RANKING OPERACIONAL</span><h2>Onde agir primeiro</h2></div><small>ordenado por risco, não por faturamento</small></header>
    <div>{ordered.length?ordered.map((unit,index)=><UnitRow key={unit.business_id} unit={unit} rank={index+1}/>):<div className="network50-empty"><Store/><b>Nenhuma operação disponível.</b><span>Crie uma operação para começar.</span></div>}</div>
   </section>
   <footer className="network50-foot"><div><ChefHat/><span><b>Regra do Network 360</b><small>Uma unidade saudável não mascara outra com ruptura, atraso ou contribuição negativa. O ranking olha exceções primeiro e deixa o detalhamento para o briefing da unidade.</small></span></div><a href="/?today=1">Abrir Hoje<ArrowRight/></a></footer>
  </section>
 </main>
}

function Kpi({label,value,note,warn=false}:{label:string;value:string;note:string;warn?:boolean}){return <article className={warn?'warn':''}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function UnitRow({unit,rank}:{unit:Unit;rank:number}){
 const icon=unit.attention.code==='stock'?PackageSearch:unit.attention.code.includes('delay')?Clock3:unit.attention.code==='negative_contribution'?CircleDollarSign:unit.attention.tone==='stable'?CheckCircle2:AlertTriangle
 const Icon=icon
 return <article className={`network50-unit ${unit.attention.tone}`}>
  <span className="network50-rank">{String(rank).padStart(2,'0')}</span><div className="network50-unit-icon"><Icon/></div>
  <div className="network50-unit-main"><div><span>{unit.city||'Sem cidade'} · {unit.role}</span><h3>{unit.name}</h3></div><p>{unit.attention.title} — {unit.attention.detail}</p></div>
  <div className="network50-unit-metrics"><span><b>{money(unit.contribution_cents)}</b><small>contribuição</small></span><span><b>{margin(unit.contribution_margin_bps)}</b><small>margem</small></span><span><b>{pct(unit.delay_rate)}</b><small>atraso</small></span><span><b>{unit.stock_alerts}</b><small>estoque</small></span></div>
  <a href={`/?today=1&business_id=${unit.business_id}`} aria-label={`Abrir ${unit.name}`}>Detalhar<ArrowRight/></a>
 </article>
}
