import React,{useEffect,useMemo,useState}from'react'
import{ArrowLeft,ChefHat,Clock3,Layers3,RefreshCcw,TriangleAlert,UtensilsCrossed}from'lucide-react'
import{request,type KdsOrder}from'./app'

type Business={id:number;name:string;city:string;role:string}
type PrepGroup={product_id:number;name:string;quantity:number;orderIds:number[];oldest:number;delayed:boolean;statuses:Record<string,number>}
const labels:Record<string,string>={new:'novo',confirmed:'confirmado',production:'em preparo'}

export function KitchenBatchRoute(){
  const token=localStorage.getItem('c360_token')||''
  const[businesses,setBusinesses]=useState<Business[]>([])
  const[businessId,setBusinessId]=useState(0)
  const[orders,setOrders]=useState<KdsOrder[]>([])
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[lastUpdate,setLastUpdate]=useState<Date|null>(null)

  async function load(targetId=businessId){
    if(!token){setLoading(false);return}
    try{
      let bid=targetId
      if(!businesses.length){
        const me=await request('/me',{},token);const rows=(me.businesses||[]) as Business[]
        setBusinesses(rows);bid=bid||Number(rows[0]?.id||0);if(bid)setBusinessId(bid)
      }
      if(!bid)return
      const data=await request(`/businesses/${bid}/kds`,{},token)
      setOrders(data.orders||[]);setLastUpdate(new Date());setError('')
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o preparo')}
    finally{setLoading(false)}
  }

  useEffect(()=>{load()},[])
  useEffect(()=>{
    if(!token||!businessId)return
    const id=window.setInterval(()=>load(businessId),8000)
    return()=>window.clearInterval(id)
  },[businessId,token])

  const prepOrders=useMemo(()=>orders.filter(o=>['new','confirmed','production'].includes(o.status)),[orders])
  const groups=useMemo(()=>{
    const map=new Map<number,PrepGroup>()
    for(const order of prepOrders){
      for(const item of order.items||[]){
        const current=map.get(item.product_id)||{product_id:item.product_id,name:item.name,quantity:0,orderIds:[],oldest:0,delayed:false,statuses:{}}
        current.quantity+=Number(item.quantity||0)
        if(!current.orderIds.includes(order.id))current.orderIds.push(order.id)
        current.oldest=Math.max(current.oldest,Number(order.age_minutes||0))
        current.delayed=current.delayed||Boolean(order.delayed)
        current.statuses[order.status]=(current.statuses[order.status]||0)+Number(item.quantity||0)
        map.set(item.product_id,current)
      }
    }
    return [...map.values()].sort((a,b)=>Number(b.delayed)-Number(a.delayed)||b.oldest-a.oldest||b.quantity-a.quantity||a.name.localeCompare(b.name))
  },[prepOrders])
  const prepUnits=groups.reduce((a,g)=>a+g.quantity,0)
  const delayed=prepOrders.filter(o=>o.delayed).length
  const delivery=orders.filter(o=>o.status==='awaiting_delivery').length
  const currentBusiness=businesses.find(x=>x.id===businessId)

  if(!token)return <main className="batch-shell center"><div className="batch-empty"><ChefHat/><h1>Entre na operação primeiro.</h1><p>O modo cozinha usa a mesma sessão segura do Cozinha 360.</p><a href="/">Entrar</a></div></main>
  if(loading)return <main className="batch-shell center"><div className="batch-loader"><ChefHat/>PREPARANDO MODO COZINHA</div></main>

  return <main className="batch-shell">
    <header className="batch-topbar"><a href="/"><ArrowLeft size={17}/> Voltar à operação</a><b><ChefHat size={19}/> COZINHA 360 <span>PREPARO</span></b><div>{businesses.length>1&&<select value={businessId} onChange={async e=>{const id=Number(e.target.value);setBusinessId(id);await load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button onClick={()=>load()} title="Atualizar agora"><RefreshCcw size={17}/></button></div></header>
    <section className="batch-page">
      <div className="batch-hero"><div><span>MODO COZINHA · {currentBusiness?.name||'OPERAÇÃO'}</span><h1>Produção agrupada.</h1><p>Veja de uma vez o que pode ser preparado junto. Quantidades somam os pedidos em <b>Novo</b>, <b>Confirmado</b> e <b>Produção</b>.</p></div><div className="batch-live"><i></i><span>Atualização automática</span><small>{lastUpdate?lastUpdate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'} · 8 s</small></div></div>
      {error&&<div className="batch-error">{error}</div>}
      <div className="batch-metrics"><Metric icon={<UtensilsCrossed/>} label="Unidades a preparar" value={prepUnits}/><Metric icon={<Layers3/>} label="Produtos agrupados" value={groups.length}/><Metric icon={<Clock3/>} label="Pedidos em preparo" value={prepOrders.length}/><Metric icon={<TriangleAlert/>} label="Atrasados" value={delayed} danger={delayed>0}/></div>
      <div className="batch-strip"><span><b>{delivery}</b> aguardando entrega</span><span><b>{orders.length}</b> pedidos abertos no total</span><small>O agrupamento é operacional: não altera pedido, estoque ou ficha técnica.</small></div>
      {groups.length?<div className="batch-grid">{groups.map(group=><article className={`batch-card ${group.delayed?'late':''}`} key={group.product_id}>
        <div className="batch-card-head"><div className="batch-qty"><strong>{group.quantity}</strong><span>un</span></div>{group.delayed&&<span className="batch-late"><TriangleAlert size={14}/> ATRASO</span>}</div>
        <h2>{group.name}</h2>
        <div className="batch-statuses">{Object.entries(group.statuses).map(([status,qty])=><span key={status}>{qty} {labels[status]||status}</span>)}</div>
        <div className="batch-orders"><span>Pedidos</span><div>{group.orderIds.map(id=><b key={id}>#{id}</b>)}</div></div>
        <footer><span>mais antigo</span><b>{group.oldest} min</b></footer>
      </article>)}</div>:<div className="batch-empty inline"><UtensilsCrossed/><h2>Nada para agrupar agora.</h2><p>Quando pedidos novos entrarem, as quantidades aparecem aqui automaticamente.</p></div>}
    </section>
  </main>
}

function Metric({icon,label,value,danger=false}:{icon:React.ReactNode;label:string;value:number;danger?:boolean}){return <article className={`batch-metric ${danger?'danger':''}`}><i>{icon}</i><div><strong>{value}</strong><span>{label}</span></div></article>}
