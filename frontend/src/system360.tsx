import React,{useEffect,useMemo,useState}from'react'
import{ArrowLeft,BarChart3,BookOpenCheck,Boxes,Check,ChevronRight,CircleDollarSign,ClipboardCheck,Flame,Gauge,HeartHandshake,Megaphone,PackageCheck,RefreshCcw,Rocket,Route,ShieldCheck,ShoppingBag,Target,TriangleAlert,Users2,WalletCards,X}from'lucide-react'
import{money,request,type Customer,type Dashboard,type Finance,type Ingredient,type KdsOrder,type Product,type ProductionBatch,type Workspace}from'./app'

type Business={id:number;name:string;city:string;role:string}
type LiveState={workspace:Workspace|null;dashboard:Dashboard|null;ingredients:Ingredient[];products:Product[];orders:KdsOrder[];production:ProductionBatch[];finance:Finance|null;customers:Customer[]}
type CheckState=true|false|null
type MotorCheck={label:string;state:CheckState;hint:string;href?:string}
type Motor={id:'base'|'vitrine'|'trafego'|'pedido'|'recompra';title:string;subtitle:string;icon:React.ReactNode;checks:MotorCheck[];href:string;cta:string}

const empty:LiveState={workspace:null,dashboard:null,ingredients:[],products:[],orders:[],production:[],finance:null,customers:[]}
const motorOrder:Motor['id'][]=['base','vitrine','trafego','pedido','recompra']

function score(checks:MotorCheck[]){const measurable=checks.filter(x=>x.state!==null);if(!measurable.length)return 0;return Math.round(measurable.filter(x=>x.state).length/measurable.length*100)}
function clamp(n:number,min=0,max=100){return Math.max(min,Math.min(max,n))}
function pct(n:number,d:number){return d?clamp(Math.round(n/d*100)):0}

export function System360Route(){
  const token=localStorage.getItem('c360_token')||''
  const[businesses,setBusinesses]=useState<Business[]>([])
  const[businessId,setBusinessId]=useState(0)
  const[data,setData]=useState<LiveState>(empty)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[lastUpdate,setLastUpdate]=useState<Date|null>(null)
  const[cpa,setCpa]=useState({capacity:'20',max:'7',loss:'90'})

  async function load(target=businessId){
    if(!token){setLoading(false);return}
    setError('')
    try{
      let id=target
      if(!businesses.length){const me=await request('/me',{},token);const rows=(me.businesses||[])as Business[];setBusinesses(rows);id=id||Number(rows[0]?.id||0);if(id)setBusinessId(id)}
      if(!id)return
      const[w,d,i,p,k,b,f,c]=await Promise.all([
        request(`/businesses/${id}/workspace`,{},token),
        request(`/businesses/${id}/dashboard`,{},token),
        request(`/businesses/${id}/ingredients`,{},token),
        request(`/businesses/${id}/products`,{},token),
        request(`/businesses/${id}/kds`,{},token),
        request(`/businesses/${id}/production`,{},token),
        request(`/businesses/${id}/finance/summary?days=30`,{},token),
        request(`/businesses/${id}/customers`,{},token),
      ])
      setData({workspace:w,dashboard:d,ingredients:i,products:p,orders:k.orders||[],production:b,finance:f,customers:c})
      const saved=localStorage.getItem(`c360-system360-cpa-${id}`);if(saved){try{setCpa(JSON.parse(saved))}catch{/* ignore local draft */}}
      setLastUpdate(new Date())
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível montar o diagnóstico 360')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])

  const activeProducts=data.products.filter(x=>x.active)
  const configuredStock=data.ingredients.filter(x=>x.reorder_target_milliunits>0&&x.par_level_milliunits>0)
  const openPrep=data.orders.filter(x=>['new','confirmed','production'].includes(x.status))
  const delayed=data.orders.filter(x=>x.delayed)
  const orderCount=Number(data.finance?.order_count||0)
  const avgContribution=orderCount?Number(data.finance?.contribution_cents||0)/orderCount/100:0
  const contactable=data.customers.filter(x=>x.can_contact).length
  const contributionPositive=orderCount>0&&Number(data.finance?.contribution_cents||0)>0
  const stockReady=data.ingredients.length>0&&configuredStock.length===data.ingredients.length
  const menuLean=activeProducts.length>0&&activeProducts.length<=4
  const delayHealthy=Number(data.dashboard?.delay_rate||0)<=.12

  const motors:Motor[]=useMemo(()=>[
    {id:'base',title:'Base',subtitle:'Produto, custo, estoque e capacidade antes de acelerar.',icon:<ShieldCheck/>,href:'/#custos',cta:'Corrigir base',checks:[
      {label:'Produto herói cadastrado',state:activeProducts.length>0,hint:'O sistema precisa de pelo menos um produto ativo.',href:'/#produtos'},
      {label:'Menu enxuto 3 + 1',state:menuLean,hint:activeProducts.length?`${activeProducts.length} itens ativos; preserve foco antes de ampliar.`:'Comece por um herói e poucos complementos.',href:'/#produtos'},
      {label:'Ingredientes cadastrados',state:data.ingredients.length>0,hint:`${data.ingredients.length} ingredientes na base de custo.`,href:'/#custos'},
      {label:'Mínimo e alvo de estoque definidos',state:stockReady,hint:`${configuredStock.length}/${data.ingredients.length||0} ingredientes com regra de reposição.`,href:'/#custos'},
      {label:'Contribuição positiva observada',state:orderCount?contributionPositive:null,hint:orderCount?`Contribuição 30d: ${money(data.finance?.contribution_cents||0)}.`:'Será validada depois dos primeiros pedidos pagos.',href:'/#financeiro'},
    ]},
    {id:'vitrine',title:'Vitrine',subtitle:'Oferta clara, menu desejável e caminho curto até o pedido.',icon:<ShoppingBag/>,href:'/?direct=1',cta:'Abrir vitrine',checks:[
      {label:'Produtos ativos para vender',state:activeProducts.length>0,hint:`${activeProducts.length} produtos ativos.`,href:'/#produtos'},
      {label:'Categoria definida',state:activeProducts.length?activeProducts.every(x=>Boolean(x.category?.trim())):false,hint:'Categorias ajudam leitura de cardápio e análise.',href:'/#produtos'},
      {label:'Embalagem considerada no custo',state:activeProducts.length?activeProducts.every(x=>x.packaging_cents_per_unit>=0):false,hint:'O custo da embalagem precisa acompanhar o produto.',href:'/#produtos'},
      {label:'Loja própria e oferta por canal',state:null,hint:'Use Venda Direta e Margens & Canais para publicar sem depender de marketplace.',href:'/?direct=1'},
    ]},
    {id:'trafego',title:'Tráfego',subtitle:'Só compre demanda quando margem, operação e mensuração suportarem.',icon:<Megaphone/>,href:'/?margin=1',cta:'Validar tráfego',checks:[
      {label:'Base pronta para receber demanda',state:stockReady&&menuLean&&contributionPositive,hint:'Estoque, menu e contribuição precisam aguentar o teste.',href:'/#hoje'},
      {label:'Atraso operacional sob controle',state:delayHealthy,hint:`Taxa de atraso atual: ${Math.round(Number(data.dashboard?.delay_rate||0)*100)}%.`,href:'/?kitchen=1'},
      {label:'CPA Guard calculado',state:Number(cpa.max)>0&&Number(cpa.capacity)>0&&Number(cpa.loss)>0,hint:'O teto vem do caixa e da capacidade, não de benchmark genérico.'},
      {label:'Atribuição por canal',state:null,hint:'Use Venda Direta/Margens para separar origem, taxa, mídia e contribuição.',href:'/?margin=1'},
    ]},
    {id:'pedido',title:'Pedido',subtitle:'Entrada, produção, conferência e entrega sem perder contexto.',icon:<ClipboardCheck/>,href:'/?kitchen=1',cta:'Abrir operação',checks:[
      {label:'Fluxo de pedido habilitado',state:activeProducts.length>0&&data.ingredients.length>0,hint:'Produto + ficha de custos formam o mínimo operacional.',href:'/?quick=1'},
      {label:'Pedidos reais registrados',state:orderCount>0,hint:`${orderCount} pedidos no resumo de 30 dias.`,href:'/#pedidos'},
      {label:'Cozinha sem atraso crítico',state:delayed.length===0,hint:`${delayed.length} pedidos atrasados agora.`,href:'/?kitchen=1'},
      {label:'Produção agrupada disponível',state:true,hint:`${openPrep.length} pedidos estão na fila de preparo agrupável.`,href:'/?kitchen=1'},
    ]},
    {id:'recompra',title:'Recompra',subtitle:'Cliente identificado, consentimento respeitado e retorno mensurável.',icon:<HeartHandshake/>,href:'/?crm=1',cta:'Abrir recompra',checks:[
      {label:'Clientes identificados',state:data.customers.length>0,hint:`${data.customers.length} clientes no relacionamento.`,href:'/#clientes'},
      {label:'Contato permitido disponível',state:data.customers.length?contactable>0:null,hint:`${contactable} clientes podem receber contato conforme consentimento.`,href:'/?crm=1'},
      {label:'Base de pedidos para aprender',state:orderCount>0,hint:'Recompra só existe depois de uma primeira experiência real.',href:'/#financeiro'},
      {label:'CRM de ciclo de vida',state:null,hint:'Use segmentos novo, recorrente e dormente sem ignorar opt-out.',href:'/?crm=1'},
    ]},
  ],[activeProducts.length,data.ingredients.length,configuredStock.length,stockReady,menuLean,orderCount,contributionPositive,data.finance?.contribution_cents,data.dashboard?.delay_rate,delayHealthy,cpa.max,cpa.capacity,cpa.loss,data.customers.length,contactable,delayed.length,openPrep.length])

  const motorScores=motors.map(m=>({id:m.id,score:score(m.checks)}))
  const overall=Math.round(motorScores.reduce((a,x)=>a+x.score,0)/motorScores.length)
  const bottleneck=motorOrder.map(id=>({id,score:motorScores.find(x=>x.id===id)?.score||0})).sort((a,b)=>a.score-b.score||motorOrder.indexOf(a.id)-motorOrder.indexOf(b.id))[0]
  const bottleneckMotor=motors.find(x=>x.id===bottleneck.id)!
  const paidProgress=pct(orderCount,30)
  const capacity=Number(cpa.capacity)||0,maxCpa=Number(cpa.max)||0,loss=Number(cpa.loss)||0
  const mathCeiling=capacity*maxCpa
  const testBudget=capacity&&maxCpa&&loss?Math.min(mathCeiling,loss):0
  const cpaFitsContribution=avgContribution>0&&maxCpa<=avgContribution
  const trafficReady=score(motors[0].checks)>=80&&contributionPositive&&stockReady&&delayHealthy

  function saveCpa(next:typeof cpa){setCpa(next);if(businessId)localStorage.setItem(`c360-system360-cpa-${businessId}`,JSON.stringify(next))}

  if(!token)return <main className="s360-shell s360-center"><div className="s360-empty"><BookOpenCheck/><h1>Entre na operação primeiro.</h1><p>O Sistema 360 usa os dados reais da sua cozinha para transformar o manual em decisões.</p><a href="/">Entrar</a></div></main>
  if(loading)return <main className="s360-shell s360-center"><div className="s360-loader"><Flame/>MONTANDO DIAGNÓSTICO 360</div></main>

  return <main className="s360-shell">
    <header className="s360-topbar"><a href="/"><ArrowLeft size={17}/> Operação</a><b><Flame size={18}/> COZINHA 360 <span>SISTEMA VIVO</span></b><div>{businesses.length>1&&<select value={businessId} onChange={async e=>{const id=Number(e.target.value);setBusinessId(id);await load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button onClick={()=>load()} title="Atualizar"><RefreshCcw size={17}/></button></div></header>
    <section className="s360-page">
      <div className="s360-hero"><div><span className="s360-kicker">COZINHA DE BOLSO 360 · 5 — 14 — 30</span><h1>O manual agora lê a sua operação.</h1><p>Em vez de páginas estáticas, cada motor cruza o método com seus produtos, estoque, pedidos, margem e clientes para mostrar o próximo gargalo antes de você gastar mais.</p></div><div className="s360-score"><strong>{overall}</strong><span>/100</span><small>saúde do Sistema 360</small></div></div>
      {error&&<div className="s360-error">{error}</div>}
      <div className={`s360-priority ${trafficReady?'ready':''}`}><div className="s360-priority-icon">{trafficReady?<Rocket/>:<Target/>}</div><div><span>{trafficReady?'PRONTO PARA TESTE CONTROLADO':'PRÓXIMO GARGALO'}</span><b>{trafficReady?'A operação já pode testar demanda sem ignorar caixa e capacidade.':`${bottleneckMotor.title}: ${bottleneckMotor.subtitle}`}</b><small>{lastUpdate?`Leitura atualizada às ${lastUpdate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'Leitura ao vivo'}</small></div><a href={trafficReady?'#cpa-guard':bottleneckMotor.href}>{trafficReady?'Calcular teste':bottleneckMotor.cta}<ChevronRight size={16}/></a></div>

      <div className="s360-kpis">
        <Kpi icon={<WalletCards/>} label="Contribuição 30d" value={money(data.finance?.contribution_cents||0)} note={orderCount?`${orderCount} pedidos na base`:'sem pedido pago ainda'}/>
        <Kpi icon={<PackageCheck/>} label="Estoque configurado" value={`${configuredStock.length}/${data.ingredients.length||0}`} note={stockReady?'mínimo + alvo definidos':'há regra de compra faltando'}/>
        <Kpi icon={<Gauge/>} label="Atraso atual" value={`${Math.round(Number(data.dashboard?.delay_rate||0)*100)}%`} note={delayHealthy?'dentro do limite operacional':'reduza entrada antes de escalar'} danger={!delayHealthy}/>
        <Kpi icon={<Users2/>} label="Clientes contactáveis" value={String(contactable)} note="consentimento continua soberano"/>
      </div>

      <div className="s360-section-head"><div><span>OS 5 MOTORES</span><h2>Diagnóstico por gargalo, não por vaidade.</h2></div><small>Itens cinza são orientações que ainda não têm prova automática no banco.</small></div>
      <div className="s360-motors">{motors.map((m,index)=><MotorCard key={m.id} motor={m} index={index+1}/>)}</div>

      <div className="s360-layout">
        <article className="s360-panel s360-validation"><div className="s360-panel-head"><div><span>MARCO 30</span><h2>30 pedidos pagos antes de ampliar no escuro.</h2></div><Boxes/></div><div className="s360-progress-number"><strong>{Math.min(orderCount,30)}</strong><span>/30</span></div><div className="s360-progress"><i style={{width:`${paidProgress}%`}}/></div><p>{orderCount>=30?'Você já tem massa mínima para auditar padrão, margem, atraso, canal e recompra antes do próximo salto.':`Faltam ${Math.max(0,30-orderCount)} pedidos registrados para completar a primeira janela de validação.`}</p><div className="s360-mini-actions"><a href="/?quick=1">Registrar pedido</a><a href="/#financeiro">Ver contribuição</a><a href="/?crm=1">Ver recompra</a></div></article>

        <article id="cpa-guard" className="s360-panel s360-cpa"><div className="s360-panel-head"><div><span>CPA GUARD</span><h2>Teste que cabe no caixa.</h2></div><CircleDollarSign/></div><p>Orçamento máximo = menor entre perda tolerável e capacidade adicional × CPA máximo.</p><div className="s360-cpa-fields"><label>Pedidos adicionais<input inputMode="numeric" value={cpa.capacity} onChange={e=>saveCpa({...cpa,capacity:e.target.value})}/></label><label>CPA máximo (R$)<input inputMode="decimal" value={cpa.max} onChange={e=>saveCpa({...cpa,max:e.target.value})}/></label><label>Perda tolerável (R$)<input inputMode="decimal" value={cpa.loss} onChange={e=>saveCpa({...cpa,loss:e.target.value})}/></label></div><div className="s360-cpa-result"><div><span>Teto matemático</span><b>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(mathCeiling)}</b></div><div><span>Orçamento recomendado</span><strong>{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(testBudget)}</strong></div></div>{avgContribution>0&&<div className={`s360-fit ${cpaFitsContribution?'ok':'warn'}`}>{cpaFitsContribution?<Check/>:<TriangleAlert/>}<span>{cpaFitsContribution?`CPA máximo de R$ ${maxCpa.toFixed(2)} cabe na contribuição média observada de R$ ${avgContribution.toFixed(2)} por pedido.`:`CPA máximo de R$ ${maxCpa.toFixed(2)} supera a contribuição média observada de R$ ${avgContribution.toFixed(2)} por pedido. Ajuste preço, canal, custo ou mídia antes de escalar.`}</span></div>}</article>
      </div>

      <article className="s360-panel s360-sprint"><div className="s360-panel-head"><div><span>MARCO 14</span><h2>Sprint de lançamento convertido em ações do app.</h2></div><Route/></div><div className="s360-sprint-grid">
        <Sprint day="01–03" motor="Base" done={score(motors[0].checks)>=80} text="Produto, menu 3+1, ficha de custos e estoque." href="/#produtos"/>
        <Sprint day="04–06" motor="Vitrine" done={score(motors[1].checks)>=75} text="Oferta, canal próprio, cardápio e embalagem." href="/?direct=1"/>
        <Sprint day="07–09" motor="Tráfego" done={trafficReady} text="Mensuração, CPA Guard e primeiro teste controlado." href="#cpa-guard"/>
        <Sprint day="10–12" motor="Pedido" done={score(motors[3].checks)>=75} text="KDS, preparo agrupado, conferência e entrega." href="/?kitchen=1"/>
        <Sprint day="13–14" motor="Recompra" done={score(motors[4].checks)>=67} text="Consentimento, CRM e auditoria do retorno." href="/?crm=1"/>
      </div></article>

      <div className="s360-library"><div><BookOpenCheck/><span>DO EBOOK PARA O SOFTWARE</span><b>O conteúdo continua disponível como método; o app assume cálculos, checkpoints e contexto operacional.</b></div><div className="s360-library-links"><a href="/?margin=1"><BarChart3/>Preço por canal</a><a href="/?kitchen=1"><Flame/>Modo cozinha</a><a href="/?direct=1"><ShoppingBag/>Venda direta</a><a href="/?crm=1"><HeartHandshake/>Recompra</a></div></div>
    </section>
  </main>
}

function Kpi({icon,label,value,note,danger=false}:{icon:React.ReactNode;label:string;value:string;note:string;danger?:boolean}){return <article className={`s360-kpi ${danger?'danger':''}`}><i>{icon}</i><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>}
function MotorCard({motor,index}:{motor:Motor;index:number}){const s=score(motor.checks);return <article className="s360-motor"><header><div className="s360-motor-icon">{motor.icon}</div><span>0{index}</span><strong>{s}%</strong></header><h3>{motor.title}</h3><p>{motor.subtitle}</p><div className="s360-meter"><i style={{width:`${s}%`}}/></div><div className="s360-checks">{motor.checks.map((c,i)=><a key={i} href={c.href||'#'} className={c.state===true?'done':c.state===false?'todo':'guide'} onClick={e=>{if(!c.href)e.preventDefault()}}>{c.state===true?<Check/>:c.state===false?<X/>:<BookOpenCheck/>}<span><b>{c.label}</b><small>{c.hint}</small></span></a>)}</div><a className="s360-motor-cta" href={motor.href}>{motor.cta}<ChevronRight/></a></article>}
function Sprint({day,motor,done,text,href}:{day:string;motor:string;done:boolean;text:string;href:string}){return <a className={`s360-sprint-step ${done?'done':''}`} href={href}><span>{day}</span><i>{done?<Check/>:<ChevronRight/>}</i><b>{motor}</b><small>{text}</small></a>}
