import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  PackageCheck,
  Radio,
  RefreshCcw,
  Route,
  ShoppingBag,
  Sparkles,
  Truck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money, request } from "./app";

const DELIVERY_API = import.meta.env.VITE_DELIVERY_API_URL || "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-delivery-v40";

type Brand = { id:number; name:string };
type Channel = { id:number; name:string };
type Delivery = { id:number; order_id:number; status:string; driver_id:number|null; zone_id:number|null; promised_at:string|null };
type Order = {
  id:number;
  status:string;
  source:string;
  total_cents:number;
  contribution_cents:number;
  paid:boolean;
  delayed:boolean;
  error_flag:boolean;
  created_at:string;
  brand:Brand|null;
  channel:Channel|null;
  customer:{id:number;name:string}|null;
  delivery:Delivery|null;
};
type Overview = {
  business:{id:number;name:string;city:string;currency:string};
  summary:{open_orders:number;delayed_orders:number;paid_orders:number;revenue_cents:number;contribution_cents:number;available_drivers:number;active_zones:number};
  orders:Order[];
};
type StageKey = "entered"|"kitchen"|"checking"|"dispatch"|"route"|"done";
type Stage = { key:StageKey; label:string; detail:string; icon:typeof ShoppingBag };

const stages:Stage[] = [
  {key:"entered",label:"Entrou",detail:"canal reconhecido",icon:ShoppingBag},
  {key:"kitchen",label:"Cozinha",detail:"produção em curso",icon:ChefHat},
  {key:"checking",label:"Conferência",detail:"antes de sair",icon:ClipboardCheck},
  {key:"dispatch",label:"Despacho",detail:"zona + entregador",icon:Truck},
  {key:"route",label:"Em rota",detail:"pedido a caminho",icon:Bike},
  {key:"done",label:"Entregue",detail:"ciclo encerrado",icon:PackageCheck},
];

function stageFor(order:Order):StageKey{
  const delivery = String(order.delivery?.status || "").toLowerCase();
  const status = String(order.status || "").toLowerCase();
  if(delivery === "delivered" || status === "completed") return "done";
  if(delivery === "picked_up") return "route";
  if(status === "awaiting_delivery" || delivery === "assigned" || delivery === "waiting") return "dispatch";
  if(status === "checking") return "checking";
  if(status === "production") return "kitchen";
  return "entered";
}

function sourceLabel(raw:string){
  const value = String(raw || "").toLowerCase();
  if(value.includes("ifood")) return "iFood";
  if(value.includes("99")) return "99Food";
  if(value.includes("keeta")) return "Keeta";
  if(value.includes("whatsapp")) return "WhatsApp";
  if(value.includes("direct") || value.includes("store")) return "Canal próprio";
  if(value.includes("counter") || value.includes("balcao")) return "Balcão";
  if(value.includes("quick")) return "Pedido rápido";
  return raw || "Operação";
}

function ageLabel(raw:string){
  const ms = Date.now() - new Date(raw).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  if(minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

async function deliveryRequest(path:string,token:string){
  const response = await fetch(`${DELIVERY_API}${path}`,{headers:{Authorization:`Bearer ${token}`}});
  const body = await response.json().catch(()=>({detail:"Resposta inválida"}));
  if(!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Delivery indisponível");
  return body;
}

function focusOperationalOrder(orderId:number,reduced:boolean){
  const now = Array.from(document.querySelectorAll<HTMLButtonElement>(".delivery40-tabs button")).find((button)=>button.textContent?.trim().startsWith("Agora"));
  if(now && !now.classList.contains("active")) now.click();
  window.setTimeout(()=>{
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".delivery40-order"));
    const row = rows.find((item)=>item.querySelector(".delivery40-order-id span")?.textContent?.trim() === `#${orderId}`);
    if(!row) return;
    row.scrollIntoView({behavior:reduced?"auto":"smooth",block:"center"});
    if(!reduced) row.animate([
      {boxShadow:"0 0 0 rgba(103,232,249,0)"},
      {boxShadow:"0 0 0 3px rgba(103,232,249,.18),0 0 70px rgba(103,232,249,.12)"},
      {boxShadow:"0 0 0 rgba(103,232,249,0)"},
    ],{duration:950,easing:"ease-out"});
  },now && !now.classList.contains("active") ? 120 : 0);
}

function DeliveryFlow({businessId}:{businessId:number}){
  const token = localStorage.getItem("c360_token") || "";
  const reduced = Boolean(useReducedMotion());
  const [data,setData] = useState<Overview|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const mounted = useRef(true);

  async function load(){
    if(!businessId || !token || loading) return;
    setLoading(true); setError("");
    try{
      const next = await deliveryRequest(`/businesses/${businessId}/overview`,token) as Overview;
      if(mounted.current) setData(next);
    }catch(e){
      if(mounted.current) setError(e instanceof Error ? e.message : "Não foi possível ler o fluxo.");
    }finally{ if(mounted.current) setLoading(false); }
  }

  useEffect(()=>{
    mounted.current = true;
    void load();
    const timer = window.setInterval(()=>{
      if(document.visibilityState === "visible" && navigator.onLine) void load();
    },30000);
    return()=>{mounted.current=false;window.clearInterval(timer)};
  },[businessId]);

  const grouped = useMemo(()=>{
    const map = new Map<StageKey,Order[]>();
    for(const stage of stages) map.set(stage.key,[]);
    for(const order of data?.orders || []) map.get(stageFor(order))?.push(order);
    for(const rows of map.values()) rows.sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
    return map;
  },[data]);
  const activeStages = stages.filter((stage)=>(grouped.get(stage.key)?.length || 0)>0).length;
  const sourceCounts = useMemo(()=>{
    const counts = new Map<string,number>();
    for(const order of data?.orders || []){
      const label = sourceLabel(order.channel?.name || order.source);
      counts.set(label,(counts.get(label)||0)+1);
    }
    return Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,6);
  },[data]);
  const attention = (data?.orders || []).filter((order)=>order.delayed || order.error_flag || order.delivery?.status === "failed").length;

  return <section data-delivery-flow-v72 className="df72-shell" aria-labelledby="df72-title">
    <div className="df72-aura df72-aura-a" aria-hidden="true"/><div className="df72-aura df72-aura-b" aria-hidden="true"/>
    <header className="df72-head">
      <div>
        <span><Sparkles size={13}/> FLUXO UNIFICADO · V7.2</span>
        <h2 id="df72-title">Um pedido. Uma linha.</h2>
        <p>Origem, cozinha, conferência e entrega seguem o mesmo pedido — sem trocar de sistema mental.</p>
      </div>
      <div className="df72-head-actions">
        <div className={attention?"attention":"stable"}><Radio size={12}/><b>{activeStages}/6</b><span>etapas com sinal</span>{attention>0&&<em>{attention} atenção</em>}</div>
        <button type="button" aria-label="Atualizar fluxo de delivery" disabled={loading} onClick={()=>void load()}><RefreshCcw className={loading?"df72-spin":""} size={14}/></button>
      </div>
    </header>

    {error && !data ? <div className="df72-error"><AlertTriangle size={18}/><span>{error}</span><button onClick={()=>void load()}>Tentar novamente</button></div> : <>
      <div className="df72-source-strip" aria-label="Origens dos pedidos">
        <span><CircleDot size={11}/> ENTRADAS</span>
        {sourceCounts.length?sourceCounts.map(([label,count])=><div key={label}><b>{label}</b><small>{count}</small></div>):<em>Aguardando o primeiro pedido.</em>}
        {!!data && <div className="df72-money"><WalletCards size={12}/><b>{money(data.summary.contribution_cents)}</b><small>contribuição paga</small></div>}
      </div>

      <div className="df72-pipeline" role="region" aria-label="Esteira operacional de pedidos">
        {stages.map((stage,index)=>{
          const Icon = stage.icon;
          const rows = grouped.get(stage.key) || [];
          const live = rows.length>0;
          const stageAttention = rows.some((order)=>order.delayed || order.error_flag || order.delivery?.status === "failed");
          return <motion.article key={stage.key} data-delivery-stage={stage.key} className={`df72-stage ${live?"live":"quiet"} ${stageAttention?"attention":""}`} initial={reduced?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{type:"spring",stiffness:120,damping:20,delay:index*.035}}>
            <header><div><i><Icon size={15}/></i><span><b>{stage.label}</b><small>{stage.detail}</small></span></div><strong>{rows.length}</strong></header>
            <div className="df72-stage-line" aria-hidden="true"><motion.i initial={reduced?false:{scaleX:0}} animate={{scaleX:live?1:.12}} transition={{type:"spring",stiffness:100,damping:18,delay:index*.04}}/></div>
            <div className="df72-orders">
              <AnimatePresence initial={false}>
                {rows.slice(0,4).map((order)=><motion.button type="button" key={order.id} className={`df72-order ${order.delayed||order.error_flag||order.delivery?.status==="failed"?"attention":""}`} onClick={()=>focusOperationalOrder(order.id,reduced)} whileHover={reduced?undefined:{y:-2,scale:1.008}} whileTap={reduced?undefined:{scale:.99}} layout>
                  <div className="df72-order-top"><span>#{order.id}</span><em>{sourceLabel(order.channel?.name || order.source)}</em><small><Clock3 size={10}/>{ageLabel(order.created_at)}</small></div>
                  <b>{order.customer?.name || order.brand?.name || "Pedido"}</b>
                  <div className="df72-order-bottom"><span className={order.paid?"paid":"pending"}>{order.paid?<CheckCircle2 size={10}/>:<CircleDot size={10}/>} {order.paid?"pago":"a receber"}</span><strong>{money(order.total_cents)}</strong></div>
                  {(order.delayed||order.error_flag||order.delivery?.status==="failed")&&<div className="df72-order-alert"><AlertTriangle size={10}/> revisar agora</div>}
                  <ChevronRight className="df72-chevron" size={12}/>
                </motion.button>)}
              </AnimatePresence>
              {!rows.length&&<div className="df72-empty"><span/><small>sem pedido aqui agora</small></div>}
              {rows.length>4&&<div className="df72-more">+{rows.length-4} pedidos nesta etapa</div>}
            </div>
          </motion.article>;
        })}
      </div>

      <footer className="df72-foot">
        <span><Route size={12}/> Tocar em um pedido leva ao card operacional que já controla zona, entregador e status.</span>
        <span><CheckCircle2 size={12}/> Esta esteira é leitura: nenhuma etapa é alterada por esta visualização.</span>
      </footer>
    </>}
  </section>;
}

export function DeliveryFlowPortal(){
  const [host,setHost] = useState<HTMLElement|null>(null);
  const [businessId,setBusinessId] = useState(0);
  useEffect(()=>{
    if(new URLSearchParams(window.location.search).get("delivery") !== "1") return;
    let cancelled=false;
    let owned:HTMLElement|null=null;
    async function tenant(){
      const token=localStorage.getItem("c360_token")||"";
      if(!token) return;
      try{
        const me=await request("/me",{},token);
        const id=Number(me.businesses?.[0]?.id||0);
        if(!cancelled&&id)setBusinessId(id);
      }catch{}
    }
    function sync(){
      const tabs=document.querySelector<HTMLElement>(".delivery40-tabs");
      if(!tabs){if(owned?.isConnected)owned.remove();owned=null;if(!cancelled)setHost(null);return;}
      let target=document.querySelector<HTMLElement>("[data-delivery-flow-v72-host]");
      if(!target){target=document.createElement("div");target.setAttribute("data-delivery-flow-v72-host","true");tabs.insertAdjacentElement("afterend",target);owned=target;}
      if(!cancelled)setHost(target);
      void tenant();
    }
    const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync();void tenant();
    return()=>{cancelled=true;observer.disconnect();if(owned?.isConnected)owned.remove()};
  },[]);
  if(!host||!businessId)return null;
  return createPortal(<DeliveryFlow businessId={businessId}/>,host);
}
