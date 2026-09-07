import React,{useEffect,useMemo,useState} from 'react'
import {motion,useReducedMotion} from 'motion/react'
import {AlertTriangle,ArrowRight,CheckCircle2,ChefHat,CircleDollarSign,Clock3,Crosshair,PackageSearch,Radar,RefreshCcw,ShoppingBag,Sparkles,Users,WifiOff} from 'lucide-react'
import {money,request} from './app'
import type {Customer,Dashboard,DemandRow,Finance,InventoryAlert,KdsOrder,ProductionBatch,Workspace} from './app'

type AttentionTone='critical'|'warning'|'opportunity'|'stable'
type AttentionItem={
  id:string;score:number;tone:AttentionTone;eyebrow:string;title:string;detail:string;metric:string;href:string;action:string;icon:React.ElementType
}

type TodayState={
  workspace:Workspace;dashboard:Dashboard;kds:KdsOrder[];production:ProductionBatch[];demand:DemandRow[];finance:Finance;alerts:InventoryAlert[];customers:Customer[]
}

const activeOrderStatuses=new Set(['new','confirmed','production','checking','awaiting_delivery'])
const activeBatchStatuses=new Set(['planned','in_progress'])

function percent(value=0){return `${Math.round(value*100)}%`}
function plural(value:number,singular:string,pluralForm=`${singular}s`){return `${value} ${value===1?singular:pluralForm}`}
function formatClock(date:Date){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(date)}

function DecisionRadar({items,blockers}:{items:AttentionItem[];blockers:number}){
  const reduced=Boolean(useReducedMotion())
  const visible=items.slice(0,5)
  const strongest=visible[0]?.score||0
  return <section className="today66-cockpit" data-today-cockpit-v66 aria-label="Radar de atenção da operação">
    <article className="today66-radar-card">
      <header className="today66-radar-head"><span><Radar size={13}/> RADAR DE ATENÇÃO</span><small>mais perto do centro = maior prioridade</small></header>
      <div className="today66-radar">
        <div className="today66-radar-rings" aria-hidden="true"><i className="today66-radar-ring"></i><i className="today66-radar-ring"></i><i className="today66-radar-ring"></i><i className="today66-radar-ring"></i></div>
        <i className="today66-axis" aria-hidden="true"></i><i className="today66-axis vertical" aria-hidden="true"></i>
        <motion.div className="today66-center" animate={reduced?undefined:{scale:blockers?[1,1.045,1]:1}} transition={{duration:2.2,repeat:blockers?Infinity:0,ease:'easeInOut'}}><div><b>AGORA</b><small>{blockers?`${blockers} PRIORIDADE${blockers===1?'':'S'}`:'SEM BLOQUEIO'}</small></div></motion.div>
        {visible.map((item,index)=>{
          const angle=(-90+(360/Math.max(visible.length,1))*index)*Math.PI/180
          const radius=28+(100-Math.min(100,Math.max(0,item.score)))*.4
          const left=50+Math.cos(angle)*radius
          const top=50+Math.sin(angle)*radius
          const Icon=item.icon
          return <motion.a
            key={item.id}
            href={item.href}
            className={`today66-node ${item.tone}`}
            style={{left:`${left}%`,top:`${top}%`}}
            aria-label={`${item.eyebrow}: ${item.title}. ${item.action}`}
            initial={reduced?false:{opacity:0,scale:.85}}
            animate={{opacity:1,scale:1}}
            whileHover={reduced?undefined:{scale:1.055}}
            whileTap={reduced?undefined:{scale:.97}}
            transition={{type:'spring',stiffness:240,damping:22,delay:reduced?0:index*.045}}
          ><span className="today66-node-icon"><Icon size={14}/></span><span className="today66-node-copy"><b>{item.eyebrow}</b><small>{item.metric}</small></span></motion.a>
        })}
      </div>
    </article>

    <aside className="today66-pulse-card">
      <div className="today66-pulse-top">
        <span className="today66-pulse-label"><Crosshair size={13}/> PULSO DE DECISÃO</span>
        <div className="today66-pulse-score"><strong>{strongest}</strong><span>/100 prioridade máxima</span></div>
        <div className="today66-pulse-track" aria-hidden="true"><motion.i initial={false} animate={{width:`${strongest}%`}} transition={reduced?{duration:0}:{type:'spring',stiffness:90,damping:20}}/></div>
        <p className="today66-pulse-caption">O número apenas ordena sinais já registrados; não estima lucro, perda futura ou demanda inexistente.</p>
        <div className="today66-signal-stack">{visible.slice(0,4).map(item=><div className={`today66-signal ${item.tone}`} key={item.id}><i></i><b>{item.eyebrow}</b><small>{item.metric}</small></div>)}</div>
      </div>
      <div className="today66-pulse-bottom">
        {visible[0]&&<a className="today66-pulse-action" href={visible[0].href}><span>{visible[0].action}</span><ArrowRight size={15}/></a>}
      </div>
    </aside>
  </section>
}

export function TodayAttentionRoute(){
  const token=localStorage.getItem('c360_token')||''
  const [state,setState]=useState<TodayState|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [updatedAt,setUpdatedAt]=useState<Date|null>(null)

  async function load(){
    if(!token){window.location.replace('/');return}
    setLoading(true);setError('')
    try{
      const me=await request('/me',{},token)
      const requestedBusinessId=Number(new URLSearchParams(window.location.search).get('business_id')||0)
      const requestedAllowed=requestedBusinessId>0&&(me.businesses||[]).some((business:{id:number})=>Number(business.id)===requestedBusinessId)
      const businessId=requestedAllowed?requestedBusinessId:Number(me.businesses?.[0]?.id||0)
      if(!businessId){window.location.replace('/');return}
      const [workspace,dashboard,kds,production,demand,finance,alerts,customers]=await Promise.all([
        request(`/businesses/${businessId}/workspace`,{},token),
        request(`/businesses/${businessId}/dashboard`,{},token),
        request(`/businesses/${businessId}/kds`,{},token),
        request(`/businesses/${businessId}/production`,{},token),
        request(`/businesses/${businessId}/demand?horizon_days=1`,{},token),
        request(`/businesses/${businessId}/finance/summary?days=30`,{},token),
        request(`/businesses/${businessId}/inventory/alerts`,{},token),
        request(`/businesses/${businessId}/customers`,{},token),
      ])
      setState({workspace,dashboard,kds:kds.orders||[],production,demand:demand.products||[],finance,alerts,customers})
      setUpdatedAt(new Date())
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível montar o briefing de hoje.')}
    finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[])

  const intelligence=useMemo(()=>{
    if(!state)return null
    const {dashboard,kds,production,demand,finance,alerts,customers}=state
    const openOrders=kds.filter(order=>activeOrderStatuses.has(order.status))
    const delayed=openOrders.filter(order=>order.delayed).sort((a,b)=>b.age_minutes-a.age_minutes)
    const activeProduction=production.filter(batch=>activeBatchStatuses.has(batch.status))
    const plannedByProduct=new Map<number,number>()
    for(const batch of activeProduction){plannedByProduct.set(batch.product_id,(plannedByProduct.get(batch.product_id)||0)+Math.max(0,batch.planned_qty-batch.produced_qty))}
    const gaps=demand.map(row=>({...row,gap:Math.max(0,row.recommended_units-(plannedByProduct.get(row.product_id)||0))})).sort((a,b)=>b.gap-a.gap)
    const topGap=gaps[0]
    const items:AttentionItem[]=[]

    if(delayed.length){
      const oldest=delayed[0]
      items.push({id:'delayed',score:100,tone:'critical',eyebrow:'PEDIDOS',title:`${plural(delayed.length,'pedido')} com atraso`,detail:`O mais antigo está aberto há ${oldest.age_minutes} min. Resolva o fluxo antes de aceitar mais carga.`,metric:`até ${oldest.age_minutes} min`,href:'/#pedidos',action:'Resolver pedidos',icon:Clock3})
    }
    if(alerts.length){
      const suggested=alerts.reduce((sum,item)=>sum+Math.max(0,item.suggested_purchase_milliunits||0),0)
      items.push({id:'stock',score:92,tone:'critical',eyebrow:'ESTOQUE',title:`${plural(alerts.length,'ingrediente')} abaixo do mínimo`,detail:'A produção pode parar ou exigir substituição. A quantidade sugerida vem dos níveis configurados pela própria operação.',metric:suggested?`+${suggested} un. base`:'reposição pendente',href:'/#custos',action:'Revisar estoque',icon:PackageSearch})
    }
    if(finance.contribution_cents<0){
      items.push({id:'margin',score:88,tone:'critical',eyebrow:'CAIXA',title:'Contribuição operacional negativa em 30 dias',detail:'A receita registrada não está cobrindo os custos variáveis informados. Não acelere mídia antes de corrigir preço, custo ou mix.',metric:money(finance.contribution_cents),href:'/?cash=1',action:'Abrir Caixa',icon:CircleDollarSign})
    }
    if(dashboard.delay_rate>.15&&!delayed.length){
      items.push({id:'delay-rate',score:78,tone:'warning',eyebrow:'QUALIDADE',title:'Atraso recorrente acima do limite operacional',detail:'Mesmo sem pedido atrasado agora, o histórico recente indica gargalo que merece correção antes do pico.',metric:percent(dashboard.delay_rate),href:'/?control=1',action:'Abrir Control Tower',icon:Clock3})
    }
    if(dashboard.error_rate>.05){
      items.push({id:'error-rate',score:76,tone:'warning',eyebrow:'QUALIDADE',title:'Taxa de erro pede investigação',detail:'Erros recorrentes corroem margem e recompra. Verifique conferência, ficha técnica e handoff da cozinha.',metric:percent(dashboard.error_rate),href:'/?control=1',action:'Investigar causa',icon:AlertTriangle})
    }
    if(topGap&&topGap.gap>0){
      items.push({id:'prep-gap',score:topGap.confidence==='high'?66:54,tone:'warning',eyebrow:'PRODUÇÃO',title:`Faltam ${topGap.gap} un. para cobrir ${topGap.product_name}`,detail:`Demanda recomendada ${topGap.recommended_units} un.; produção ativa cobre ${topGap.recommended_units-topGap.gap}. Confiança ${topGap.confidence}.`,metric:`gap ${topGap.gap} un.`,href:'/?autopilot=1',action:'Validar no Autopilot',icon:ChefHat})
    }
    if((finance.order_count||0)>=5&&customers.length===0){
      items.push({id:'crm',score:36,tone:'opportunity',eyebrow:'RECOMPRA',title:'Há pedidos, mas ainda não há base de clientes',detail:'Cadastre clientes somente com dados e consentimento adequados para criar recompra sem virar spam.',metric:`${finance.order_count||0} pedidos / 0 clientes`,href:'/?crm=1',action:'Organizar recompra',icon:Users})
    }
    if(!items.length){
      items.push({id:'stable',score:10,tone:'stable',eyebrow:'OPERAÇÃO',title:'Nenhum bloqueio crítico detectado agora',detail:'Pedidos, estoque, qualidade e contribuição não dispararam os limites desta visão. Use o Autopilot para validar a próxima ação de crescimento.',metric:'sem bloqueios',href:'/?autopilot=1',action:'Ver próxima ação',icon:CheckCircle2})
    }else if(finance.contribution_cents>0&&dashboard.delay_rate<=.15&&dashboard.error_rate<=.05&&!alerts.length&&!delayed.length){
      items.push({id:'growth',score:24,tone:'opportunity',eyebrow:'OPORTUNIDADE',title:'Operação sem bloqueio imediato para revisar crescimento',detail:'A visão de hoje está estável; confirme estoque, capacidade e o Growth Permit no Autopilot antes de aumentar aquisição.',metric:money(finance.contribution_cents),href:'/?autopilot=1',action:'Checar Growth Permit',icon:Sparkles})
    }
    items.sort((a,b)=>b.score-a.score)
    const blockers=items.filter(item=>item.score>=70).length
    const top=items[0]
    const second=items[1]
    const brief=blockers
      ? `${plural(blockers,'prioridade','prioridades')} antes de pensar em crescimento. Primeiro: ${top.title.toLocaleLowerCase('pt-BR')}${second?`. Depois: ${second.title.toLocaleLowerCase('pt-BR')}.`:'.'}`
      : `Sem bloqueio crítico agora. ${top.title}. ${second?`Depois, ${second.title.toLocaleLowerCase('pt-BR')}.`:'Mantenha a operação dentro dos limites antes de escalar.'}`
    return {openOrders,delayed,activeProduction,items,blockers,brief}
  },[state])

  function logout(){localStorage.removeItem('c360_token');window.location.assign('/')}

  if(loading)return <main className="today39-shell today39-center"><div className="today39-loader"><ChefHat size={26}/><span>Montando briefing operacional…</span></div></main>
  if(error||!state||!intelligence)return <main className="today39-shell today39-center"><section className="today39-error"><WifiOff size={26}/><h1>O briefing não carregou.</h1><p>{error||'Tente novamente.'}</p><button onClick={()=>void load()}><RefreshCcw size={16}/> Tentar novamente</button></section></main>

  const {workspace,dashboard,finance,alerts}=state
  const top=intelligence.items[0]
  return <main className="today39-shell">
    <header className="today39-topbar">
      <a className="today39-brand" href="/"><ChefHat size={20}/><span>COZINHA 360</span><em>Hoje</em></a>
      <nav aria-label="Atalhos do dia"><a href="/#pedidos">Pedidos</a><a href="/?kitchen=1">Cozinha</a><a href="/?cash=1">Caixa</a><a href="/?autopilot=1">Autopilot</a></nav>
      <div className="today39-top-actions"><span>{updatedAt?`Atualizado ${formatClock(updatedAt)}`:'Agora'}</span><button aria-label="Atualizar briefing" onClick={()=>void load()}><RefreshCcw size={15}/></button><button onClick={logout}>Sair</button></div>
    </header>

    <section className="today39-content">
      <div className="today39-heading"><div><span className="today39-kicker">{workspace.business.city||'Sua operação'} · {workspace.business.name}</span><h1>Seu dia em 60 segundos.</h1><p>Risco, fluxo, caixa e capacidade posicionados pelo que muda o dia agora.</p></div><div className={`today39-status ${intelligence.blockers?'attention':'stable'}`}><span></span>{intelligence.blockers?`${intelligence.blockers} prioridade${intelligence.blockers===1?'':'s'} agora`:'operação sem bloqueio crítico'}</div></div>

      <DecisionRadar items={intelligence.items} blockers={intelligence.blockers}/>

      <article className={`today39-brief ${top.tone}`}>
        <div className="today39-brief-icon"><top.icon size={24}/></div>
        <div><span>BRIEFING OPERACIONAL</span><h2>{intelligence.brief}</h2><p>Ordenado apenas com sinais já registrados. A confirmação final continua com quem opera.</p></div>
        <a href={top.href}>{top.action}<ArrowRight size={16}/></a>
      </article>

      <div className="today39-kpis">
        <article><span>Pedidos abertos</span><strong>{intelligence.openOrders.length}</strong><small>{intelligence.delayed.length?`${intelligence.delayed.length} com atraso`:'nenhum atraso agora'}</small></article>
        <article className={alerts.length?'warn':''}><span>Estoque</span><strong>{alerts.length}</strong><small>{alerts.length?'itens para repor':'sem alerta configurado'}</small></article>
        <article><span>Contribuição 30d</span><strong>{money(finance.contribution_cents)}</strong><small>{finance.order_count||0} pedidos pagos</small></article>
        <article><span>Qualidade</span><strong>{percent(dashboard.delay_rate)} / {percent(dashboard.error_rate)}</strong><small>atraso / erro</small></article>
      </div>

      <div className="today39-grid">
        <section className="today39-feed" aria-labelledby="today39-feed-title">
          <div className="today39-section-head"><div><span>O QUE EXIGE ATENÇÃO</span><h2 id="today39-feed-title">Fila de decisões</h2></div><small>ordenada por risco operacional</small></div>
          <div className="today39-feed-list">{intelligence.items.map((item,index)=>{const Icon=item.icon;return <article className={`today39-item ${item.tone}`} key={item.id}>
            <span className="today39-rank">{String(index+1).padStart(2,'0')}</span><div className="today39-item-icon"><Icon size={18}/></div><div className="today39-item-copy"><span>{item.eyebrow}</span><h3>{item.title}</h3><p>{item.detail}</p></div><div className="today39-item-side"><strong>{item.metric}</strong><a href={item.href}>{item.action}<ArrowRight size={14}/></a></div>
          </article>})}</div>
        </section>

        <aside className="today39-plan">
          <div className="today39-section-head"><div><span>PRÓXIMOS PASSOS</span><h2>Faça nesta ordem</h2></div></div>
          <ol>{intelligence.items.slice(0,3).map((item,index)=><li key={item.id}><span>{index+1}</span><div><b>{item.action}</b><small>{item.title}</small></div><a href={item.href}><ArrowRight size={15}/></a></li>)}</ol>
          <div className="today39-divider"></div>
          <div className="today39-snapshot"><span>SNAPSHOT</span><div><b>{intelligence.activeProduction.length}</b><small>lotes ativos</small></div><div><b>{money(finance.revenue_cents)}</b><small>vendas 30d</small></div><div><b>{money(finance.loss_cents)}</b><small>perdas registradas</small></div></div>
          <a className="today39-secondary" href="/?autopilot=1"><Sparkles size={16}/> Abrir decisão completa no Autopilot</a>
          <a className="today39-secondary" href="/?quick=1"><ShoppingBag size={16}/> Registrar pedido rápido</a>
        </aside>
      </div>
    </section>
  </main>
}