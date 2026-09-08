import React,{useEffect,useMemo,useRef,useState}from'react'
import{createPortal}from'react-dom'
import{motion,useReducedMotion}from'motion/react'
import{ArrowRight,Check,ChefHat,Clock3,PackageCheck,RefreshCcw,Route,ShoppingBag,Sparkles,Truck,WalletCards}from'lucide-react'
import{money,request}from'./app'

const DELIVERY_API=import.meta.env.VITE_DELIVERY_API_URL||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-delivery-v40'
type Business={id:number;name:string}
type Delivery={id:number;order_id:number;status:string;driver_id:number|null;zone_id:number|null;promised_at:string|null;scheduled_for?:string|null}
type Order={id:number;status:string;source:string;total_cents:number;contribution_cents:number;paid:boolean;delayed:boolean;created_at:string;channel:{id:number;name:string}|null;brand:{id:number;name:string}|null;customer:{id:number;name:string}|null;delivery:Delivery|null}
type Overview={business:{id:number;name:string};orders:Order[];summary:{open_orders:number;delayed_orders:number;in_transit?:number;paid_orders:number;contribution_cents:number}}
type Stage='origin'|'kitchen'|'check'|'delivery'|'done'

const stages:{id:Stage;label:string;icon:React.ElementType}[]=[
 {id:'origin',label:'Origem',icon:ShoppingBag},
 {id:'kitchen',label:'Cozinha',icon:ChefHat},
 {id:'check',label:'Conferência',icon:PackageCheck},
 {id:'delivery',label:'Entrega',icon:Truck},
 {id:'done',label:'Conclusão',icon:Check},
]
const orderRank:Record<string,number>={new:0,confirmed:1,production:2,checking:3,awaiting_delivery:4,completed:5,cancelled:5}
const sourceNames:Record<string,string>={ifood:'iFood',whatsapp:'WhatsApp',direct:'Loja direta',manual:'Manual'}

function visibleTenant(businesses:Business[]){
 const visible=document.querySelector<HTMLElement>('.deliverym-top small')?.textContent?.trim()||''
 const exact=businesses.filter(b=>b.name.trim()===visible)
 if(exact.length===1)return exact[0]
 if(businesses.length===1)return businesses[0]
 return null
}
function sourceLabel(order:Order){return order.channel?.name||sourceNames[order.source]||order.source||'Canal'}
function deliveryDone(order:Order){return order.delivery?.status==='delivered'||order.status==='completed'}
function stageState(order:Order,id:Stage):'done'|'active'|'future'|'risk'{
 const rank=orderRank[order.status]??0
 if(id==='origin')return rank>0?'done':'active'
 if(id==='kitchen')return rank>2?'done':rank>=1?(order.delayed?'risk':'active'):'future'
 if(id==='check')return rank>3?'done':rank===3?(order.delayed?'risk':'active'):'future'
 if(id==='delivery'){
  if(deliveryDone(order))return'done'
  if(rank>=4||order.delivery)return order.delayed?'risk':'active'
  return'future'
 }
 return deliveryDone(order)?'done':'future'
}
function ageMinutes(createdAt:string){return Math.max(0,Math.floor((Date.now()-new Date(createdAt).getTime())/60000))}
function focusOrder(id:number,reduced:boolean){
 const rows=Array.from(document.querySelectorAll<HTMLElement>('.deliverym-order'))
 const row=rows.find(el=>el.textContent?.includes(`#${id}`))
 if(!row)return
 row.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'})
 if(!reduced)row.animate([{boxShadow:'0 0 0 rgba(103,232,249,0)'},{boxShadow:'0 0 0 3px rgba(103,232,249,.2),0 0 70px rgba(103,232,249,.14)'},{boxShadow:'0 0 0 rgba(103,232,249,0)'}],{duration:1000,easing:'ease-out'})
 const firstControl=row.querySelector<HTMLElement>('select,input,button')
 firstControl?.focus({preventScroll:true})
}

function DeliveryConveyor({data,onRefresh,busy}:{data:Overview;onRefresh:()=>void;busy:boolean}){
 const reduced=Boolean(useReducedMotion())
 const open=useMemo(()=>data.orders.filter(o=>['new','confirmed','production','checking','awaiting_delivery'].includes(o.status)||(Boolean(o.delivery)&&!['delivered','cancelled','failed'].includes(o.delivery!.status))).sort((a,b)=>Number(b.delayed)-Number(a.delayed)||new Date(a.created_at).getTime()-new Date(b.created_at).getTime()),[data])
 const shown=open.slice(0,8)
 const sourceCount=new Set(open.map(sourceLabel)).size
 return <section data-delivery-conveyor-v72 className="dc72-shell" aria-labelledby="dc72-title">
  <div className="dc72-aura a" aria-hidden="true"/><div className="dc72-aura b" aria-hidden="true"/>
  <header className="dc72-head"><div><span><Sparkles size={13}/> ESTEIRA OPERACIONAL · V7.2</span><h2 id="dc72-title">Um pedido. Um caminho visível.</h2><p>Origem, cozinha, conferência e entrega no mesmo pulso — sem criar outro lugar para editar o pedido.</p></div><button type="button" onClick={onRefresh} disabled={busy}><RefreshCcw className={busy?'dc72-spin':''} size={14}/>Atualizar</button></header>
  <div className="dc72-summary">
   <article><Route/><span>Fluxo aberto</span><b>{open.length}</b><small>{sourceCount} canal(is) em movimento</small></article>
   <article className={data.summary.delayed_orders?'risk':''}><Clock3/><span>Precisam atenção</span><b>{data.summary.delayed_orders}</b><small>{data.summary.delayed_orders?'prioridade agora':'sem atraso no pedido'}</small></article>
   <article><Truck/><span>Em rota</span><b>{data.summary.in_transit||0}</b><small>logística em andamento</small></article>
   <article><WalletCards/><span>Contribuição paga</span><b>{money(data.summary.contribution_cents)}</b><small>{data.summary.paid_orders} pedido(s) pago(s)</small></article>
  </div>
  {shown.length?<div className="dc72-board" role="list" aria-label="Pedidos na esteira operacional">
   {shown.map((order,index)=><motion.button type="button" role="listitem" key={order.id} className={`dc72-lane ${order.delayed?'risk':''}`} onClick={()=>focusOrder(order.id,reduced)} initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{type:'spring',stiffness:130,damping:22,delay:index*.025}} aria-label={`Pedido ${order.id}, ${sourceLabel(order)}, ${order.delayed?'com atenção':'no fluxo'}. Abrir controles operacionais.`}>
    <div className="dc72-order"><span>#{order.id}</span><b>{order.customer?.name||order.brand?.name||'Pedido'}</b><small>{sourceLabel(order)} · {ageMinutes(order.created_at)} min</small></div>
    <div className="dc72-track">{stages.map((stage,stageIndex)=>{const Icon=stage.icon,state=stageState(order,stage.id);return <React.Fragment key={stage.id}>{stageIndex>0&&<i className={`dc72-link ${state==='done'?'done':''}`} aria-hidden="true"/>}<div className={`dc72-stage ${state}`}><em><Icon size={13}/></em><span>{stage.label}</span></div></React.Fragment>})}</div>
    <div className="dc72-money"><b>{money(order.total_cents)}</b><small>{money(order.contribution_cents)} contribuição</small><span className={order.paid?'paid':'pending'}>{order.paid?'PAGO':'PENDENTE'}</span></div><ArrowRight className="dc72-arrow" size={15}/>
   </motion.button>)}
   {open.length>shown.length&&<div className="dc72-more">+ {open.length-shown.length} pedidos continuam na fila operacional abaixo.</div>}
  </div>:<div className="dc72-empty"><PackageCheck size={26}/><b>Esteira limpa.</b><span>Quando um pedido direto, manual ou integrado entrar, o caminho acende aqui.</span></div>}
  <footer><span>Toque em qualquer pedido para ir aos controles reais de zona, entregador, repasse e status.</span><span>Nenhuma etapa é avançada automaticamente por esta visualização.</span></footer>
 </section>
}

export function DeliveryConveyorPortal(){
 const[host,setHost]=useState<HTMLElement|null>(null),[data,setData]=useState<Overview|null>(null),[busy,setBusy]=useState(false),[businessId,setBusinessId]=useState(0)
 const timer=useRef<number>(0),requestId=useRef(0),tenantRef=useRef(0)
 async function load(force=false){
  const token=localStorage.getItem('c360_token')||''
  if(!token)return
  const id=++requestId.current
  setBusy(true)
  try{
   const me=await request('/me',{},token),businesses=(me.businesses||[]) as Business[],tenant=visibleTenant(businesses)
   if(!tenant)return
   if(tenantRef.current!==tenant.id||force){tenantRef.current=tenant.id;setBusinessId(tenant.id)}
   const res=await fetch(`${DELIVERY_API}/businesses/${tenant.id}/overview`,{headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}})
   const body=await res.json().catch(()=>null)
   if(!res.ok||!body||id!==requestId.current)return
   setData(body as Overview)
  }catch{
   // A fila operacional original permanece disponível se esta leitura visual falhar.
  }finally{if(id===requestId.current)setBusy(false)}
 }
 useEffect(()=>{
  let cancelled=false,owned:HTMLElement|null=null
  function sync(){
   const shell=document.querySelector<HTMLElement>('.deliverym-shell')
   const panel=Array.from(document.querySelectorAll<HTMLElement>('.deliverym-panel')).find(el=>el.textContent?.includes('FILA DE DECISÃO'))
   if(!shell||!panel){if(owned?.isConnected)owned.remove();owned=null;if(!cancelled)setHost(null);return}
   let target=document.querySelector<HTMLElement>('[data-delivery-conveyor-v72-host]')
   if(!target){target=document.createElement('div');target.dataset.deliveryConveyorV72Host='true';panel.insertAdjacentElement('beforebegin',target);owned=target}
   if(!cancelled)setHost(target)
   if(!tenantRef.current)void load()
  }
  const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync()
  const visibility=()=>{if(!document.hidden&&document.querySelector('.deliverym-shell'))void load()};document.addEventListener('visibilitychange',visibility)
  timer.current=window.setInterval(()=>{if(!document.hidden&&document.querySelector('.deliverym-shell'))void load()},30000)
  return()=>{cancelled=true;observer.disconnect();document.removeEventListener('visibilitychange',visibility);window.clearInterval(timer.current);if(owned?.isConnected)owned.remove()}
 },[])
 if(!host||!data||!businessId)return null
 return createPortal(<DeliveryConveyor data={data} busy={busy} onRefresh={()=>void load(true)}/>,host)
}
