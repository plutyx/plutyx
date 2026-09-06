import React,{useEffect,useMemo,useState} from 'react'
import {ArrowLeft,ArrowRight,BadgePercent,Bike,CheckCircle2,ChefHat,CircleDollarSign,Clock3,ExternalLink,Gift,MapPin,Network,PackageCheck,Plus,RefreshCcw,Route,ShoppingBag,Store,Truck,Users,WifiOff} from 'lucide-react'
import {money,request} from './app'

const DELIVERY_API=import.meta.env.VITE_DELIVERY_API_URL||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-delivery-v40'
type Tab='agora'|'marcas'|'entregas'|'recompra'|'canais'
type Brand={id:number;name:string;slug:string|null;active:boolean;primary_channel:string;sort_order:number}
type BrandStat={brand_id:number;orders:number;open_orders:number;revenue_cents:number;contribution_cents:number}
type Channel={id:number;name:string;fee_bps:number;fixed_fee_cents:number;delivery_cents:number;promo_cents:number;media_cents:number;traffic_active:boolean}
type Driver={id:number;name:string;phone:string;vehicle:string;status:string;active:boolean;version:number}
type Zone={id:number;brand_id:number|null;name:string;zone_type:string;match_value:string;fee_cents:number;min_order_cents:number;eta_min:number;active:boolean;version:number}
type Delivery={id:number;order_id:number;driver_id:number|null;zone_id:number|null;status:string;fee_cents:number;version:number;promised_at:string|null}
type Storefront={id:number;brand_id:number|null;slug:string;display_name:string;active:boolean}
type Connection={id:number;provider:string;display_name:string|null;status:string;mode:string;last_success_at:string|null;last_error:string|null}
type Order={id:number;brand_id:number|null;channel_id:number|null;customer_id:number|null;status:string;source:string;total_cents:number;contribution_cents:number;paid:boolean;delayed:boolean;error_flag:boolean;version:number;created_at:string;brand:Brand|null;channel:Channel|null;customer:{id:number;name:string}|null;delivery:Delivery|null;items:Array<{id:number;product_id:number;quantity:number;unit_price_cents:number;unit_variable_cost_cents:number}>}
type Overview={version:string;business:{id:number;name:string;city:string;currency:string};summary:{open_orders:number;delayed_orders:number;paid_orders:number;revenue_cents:number;contribution_cents:number;available_drivers:number;active_zones:number};plan:{key:string;status:string;brand_limit:number};brands:Brand[];brand_stats:BrandStat[];channels:Channel[];orders:Order[];zones:Zone[];drivers:Driver[];deliveries:Delivery[];loyalty:{mode:string;points_per_real:number;cashback_bps:number;redeem_threshold:number;active:boolean};promos:Array<{id:number;brand_id:number|null;code:string;discount_type:string;value:number;min_order_cents:number;used_count:number;active:boolean}>;storefronts:Storefront[];connections:Connection[]}

async function dreq(path:string,token:string,options:RequestInit={}){
  const res=await fetch(`${DELIVERY_API}${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})}})
  const body=await res.json().catch(()=>({detail:'Resposta inválida'}))
  if(!res.ok)throw new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir')
  return body
}
const vehicleLabel:Record<string,string>={foot:'A pé',bike:'Bike',moto:'Moto',car:'Carro',utility:'Utilitário'}
const providerLabel:Record<string,string>={whatsapp:'WhatsApp',mercadopago:'Mercado Pago',google:'Google',ifood:'iFood',meta_ads:'Meta Ads'}
const statusLabel:Record<string,string>={waiting:'Aguardando',assigned:'Atribuída',picked_up:'Em rota',delivered:'Entregue',failed:'Falhou',cancelled:'Cancelada',new:'Novo',confirmed:'Confirmado',production:'Produção',checking:'Conferência',awaiting_delivery:'Aguardando entrega'}
const formatPct=(bps=0)=>`${(bps/100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`

export function DeliveryOSRoute(){
  const token=localStorage.getItem('c360_token')||''
  const [data,setData]=useState<Overview|null>(null),[businessId,setBusinessId]=useState(0),[tab,setTab]=useState<Tab>('agora')
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [brandName,setBrandName]=useState(''),[zoneName,setZoneName]=useState(''),[zoneMatch,setZoneMatch]=useState(''),[zoneFee,setZoneFee]=useState(''),[driverName,setDriverName]=useState(''),[driverPhone,setDriverPhone]=useState('')
  const [loyaltyMode,setLoyaltyMode]=useState('off'),[cashback,setCashback]=useState('0'),[points,setPoints]=useState('1'),[promoCode,setPromoCode]=useState(''),[promoValue,setPromoValue]=useState('10')

  async function load(){
    if(!token){window.location.replace('/');return}
    setLoading(true);setError('')
    try{
      const me=await request('/me',{},token),id=Number(me.businesses?.[0]?.id||0)
      if(!id){window.location.replace('/');return}
      setBusinessId(id)
      const next=await dreq(`/businesses/${id}/overview`,token) as Overview
      setData(next);setLoyaltyMode(next.loyalty.mode||'off');setCashback(String((next.loyalty.cashback_bps||0)/100));setPoints(String(next.loyalty.points_per_real||1))
    }catch(e){setError(e instanceof Error?e.message:'Delivery 360 indisponível')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])

  async function mutate(path:string,method:'POST'|'PATCH'|'PUT',payload:unknown,message:string){
    if(!businessId)return
    setBusy(true);setError('');setNotice('')
    try{await dreq(`/businesses/${businessId}/${path}`,token,{method,body:JSON.stringify(payload)});setNotice(message);await load()}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar')}
    finally{setBusy(false)}
  }

  const openOrders=useMemo(()=>data?.orders.filter(o=>['new','confirmed','production','checking','awaiting_delivery'].includes(o.status))||[],[data])
  const setup=useMemo(()=>data?[
    {ok:data.brands.length>0,label:'Criar sua primeira marca',tab:'marcas' as Tab},
    {ok:data.zones.some(z=>z.active),label:'Definir ao menos uma zona de entrega',tab:'entregas' as Tab},
    {ok:data.drivers.some(d=>d.active),label:'Cadastrar entregador próprio ou parceiro',tab:'entregas' as Tab},
    {ok:data.storefronts.some(s=>s.active),label:'Publicar canal direto sem comissão do Cozinha 360',tab:'canais' as Tab},
  ]:[],[data])
  const brandStats=new Map((data?.brand_stats||[]).map(row=>[row.brand_id,row]))

  if(loading)return <main className="delivery40-shell delivery40-center"><div className="delivery40-loading"><Truck size={25}/><span>Organizando o Delivery 360…</span></div></main>
  if(error&&!data)return <main className="delivery40-shell delivery40-center"><section className="delivery40-error"><WifiOff size={28}/><h1>O Delivery 360 não carregou.</h1><p>{error}</p><button onClick={()=>void load()}><RefreshCcw size={16}/>Tentar novamente</button></section></main>
  if(!data)return null

  return <main className="delivery40-shell">
    <header className="delivery40-topbar">
      <a href="/?today=1" className="delivery40-back"><ArrowLeft size={16}/>Hoje</a>
      <a href="/" className="delivery40-brand"><ChefHat size={20}/><span>COZINHA 360</span><em>Delivery 4.0</em></a>
      <div className="delivery40-actions"><span>{data.business.name}</span><button aria-label="Atualizar" onClick={()=>void load()}><RefreshCcw size={15}/></button></div>
    </header>

    <section className="delivery40-content">
      <div className="delivery40-heading"><div><span className="delivery40-kicker">DARK KITCHEN · VENDA DIRETA · DESPACHO</span><h1>Menos telas. Mais pedidos sob controle.</h1><p>Marcas, canais, entregadores e recompra conectados à contribuição real do pedido.</p></div><div className="delivery40-plan"><small>PLANO</small><b>{data.plan.key.toUpperCase()}</b><span>{data.brands.length}/{data.plan.brand_limit} marcas recomendadas</span></div></div>

      {notice&&<div className="delivery40-notice"><CheckCircle2 size={16}/>{notice}</div>}
      {error&&<div className="delivery40-alert">{error}</div>}

      <nav className="delivery40-tabs" aria-label="Delivery 360">
        {([['agora','Agora',Route],['marcas','Marcas',Store],['entregas','Entregas',Bike],['recompra','Recompra',Gift],['canais','Canais',Network]] as [Tab,string,React.ElementType][]).map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}
      </nav>

      {tab==='agora'&&<>
        <div className="delivery40-kpis"><article><span>Pedidos abertos</span><strong>{data.summary.open_orders}</strong><small>{data.summary.delayed_orders?`${data.summary.delayed_orders} atrasado(s)`:'sem atraso agora'}</small></article><article><span>Contribuição paga</span><strong>{money(data.summary.contribution_cents)}</strong><small>{data.summary.paid_orders} pedido(s) pago(s)</small></article><article><span>Entregadores livres</span><strong>{data.summary.available_drivers}</strong><small>{data.summary.active_zones} zona(s) ativa(s)</small></article></div>
        {setup.some(x=>!x.ok)&&<section className="delivery40-panel delivery40-onboarding"><div className="delivery40-section-head"><div><span>CONFIGURAÇÃO RÁPIDA</span><h2>Deixe o delivery operável em poucos cliques</h2></div><b>{setup.filter(x=>x.ok).length}/{setup.length}</b></div><div className="delivery40-checks">{setup.map(item=><button key={item.label} className={item.ok?'done':''} onClick={()=>setTab(item.tab)}><span>{item.ok?<CheckCircle2 size={17}/>:<Plus size={17}/>}</span>{item.label}<ArrowRight size={15}/></button>)}</div></section>}
        <section className="delivery40-panel"><div className="delivery40-section-head"><div><span>FILA OPERACIONAL</span><h2>Pedidos que ainda exigem ação</h2></div><a href="/?quick=1">+ Pedido rápido</a></div>{openOrders.length?<div className="delivery40-orders">{openOrders.map(order=><OrderRow key={order.id} order={order} data={data} busy={busy} onSave={(payload)=>mutate(`deliveries/${order.id}`,'PUT',payload,'Entrega atualizada.')}/>)}</div>:<Empty icon={PackageCheck} title="Fila vazia" text="Quando entrar um pedido direto, manual ou integrado, ele aparece aqui com marca, canal e contribuição."/>}</section>
      </>}

      {tab==='marcas'&&<div className="delivery40-layout"><section className="delivery40-panel"><div className="delivery40-section-head"><div><span>MULTI-BRAND</span><h2>Marcas da mesma cozinha</h2></div><span>{data.brands.length}/{data.plan.brand_limit}</span></div>{data.brands.length?<div className="delivery40-brand-list">{data.brands.map(brand=>{const s=brandStats.get(brand.id),store=data.storefronts.find(x=>x.brand_id===brand.id);return <article key={brand.id}><div className="delivery40-brand-avatar">{brand.name.slice(0,2).toUpperCase()}</div><div><b>{brand.name}</b><span>{brand.slug||'sem slug'} · {brand.active?'ativa':'pausada'}</span></div><div className="delivery40-brand-metrics"><span><b>{s?.open_orders||0}</b> abertos</span><span><b>{money(s?.contribution_cents||0)}</b> contribuição</span></div>{store?<a href={`/?loja=${encodeURIComponent(store.slug)}`} target="_blank" rel="noreferrer">Loja <ExternalLink size={13}/></a>:<a href="/?direct=1">Criar loja</a>}</article>})}</div>:<Empty icon={Store} title="Uma cozinha pode vender mais de uma marca" text="Comece por uma marca âncora. Adicione outras só quando a operação estiver estável."/>}</section><aside className="delivery40-panel delivery40-form"><span>ADICIONAR MARCA</span><h2>Nova marca</h2><label>Nome<input value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="Ex.: Brasa 360"/></label><button disabled={busy||brandName.trim().length<2} onClick={()=>mutate('brands','POST',{name:brandName},'Marca criada.').then(()=>setBrandName(''))}><Plus size={16}/>Criar marca</button><small>Limites de plano estão em modo observação enquanto cobrança real não estiver validada. Nenhum dado existente é bloqueado.</small></aside></div>}

      {tab==='entregas'&&<div className="delivery40-layout-wide"><section className="delivery40-panel"><div className="delivery40-section-head"><div><span>ENTREGADORES</span><h2>Quem pode sair agora?</h2></div><b>{data.summary.available_drivers} livres</b></div>{data.drivers.length?<div className="delivery40-driver-list">{data.drivers.map(driver=><article key={driver.id}><span className={`delivery40-driver-dot ${driver.status}`}></span><div><b>{driver.name}</b><span>{vehicleLabel[driver.vehicle]||driver.vehicle} · {driver.phone||'sem telefone'}</span></div><select value={driver.status} disabled={busy} onChange={e=>void mutate(`drivers/${driver.id}`,'PATCH',{version:driver.version,status:e.target.value},'Status do entregador atualizado.')}><option value="available">Disponível</option><option value="busy">Em entrega</option><option value="offline">Offline</option></select></article>)}</div>:<Empty icon={Bike} title="Nenhum entregador cadastrado" text="Pode ser a pé, bike, moto, carro ou utilitário. O Cozinha 360 não promete roteirização GPS sem uma API de mapas conectada."/>}<div className="delivery40-inline-form"><input value={driverName} onChange={e=>setDriverName(e.target.value)} placeholder="Nome do entregador"/><input value={driverPhone} onChange={e=>setDriverPhone(e.target.value)} placeholder="Telefone"/><button disabled={busy||!driverName.trim()} onClick={()=>mutate('drivers','POST',{name:driverName,phone:driverPhone,vehicle:'moto',status:'available'},'Entregador adicionado.').then(()=>{setDriverName('');setDriverPhone('')})}><Plus size={15}/>Adicionar</button></div></section><section className="delivery40-panel"><div className="delivery40-section-head"><div><span>ZONAS & TAXAS</span><h2>Onde você entrega?</h2></div><MapPin size={19}/></div>{data.zones.length?<div className="delivery40-zone-list">{data.zones.map(zone=><article key={zone.id}><div><b>{zone.name}</b><span>{zone.match_value||zone.zone_type} · até {zone.eta_min} min</span></div><strong>{money(zone.fee_cents)}</strong></article>)}</div>:<Empty icon={MapPin} title="Defina uma zona simples" text="Comece por bairro ou CEP. Otimização de rota fica marcada como indisponível até um provedor de mapas estar conectado."/>}<div className="delivery40-zone-form"><input value={zoneName} onChange={e=>setZoneName(e.target.value)} placeholder="Nome: Centro"/><input value={zoneMatch} onChange={e=>setZoneMatch(e.target.value)} placeholder="Bairro ou CEP"/><input value={zoneFee} onChange={e=>setZoneFee(e.target.value)} inputMode="decimal" placeholder="Taxa R$"/><button disabled={busy||!zoneName.trim()} onClick={()=>mutate('zones','POST',{name:zoneName,zone_type:'neighborhood',match_value:zoneMatch,fee_cents:Math.round((Number(zoneFee.replace(',','.'))||0)*100),eta_min:45},'Zona criada.').then(()=>{setZoneName('');setZoneMatch('');setZoneFee('')})}><Plus size={15}/>Criar zona</button></div></section></div>}

      {tab==='recompra'&&<div className="delivery40-layout"><section className="delivery40-panel"><div className="delivery40-section-head"><div><span>FIDELIDADE</span><h2>Recompra sem spam</h2></div><Gift size={20}/></div><p className="delivery40-muted">Ative pontos ou cashback somente quando a margem comportar. Contato continua condicionado ao consentimento do cliente e opt-out.</p><div className="delivery40-loyalty"><label>Modelo<select value={loyaltyMode} onChange={e=>setLoyaltyMode(e.target.value)}><option value="off">Desligado</option><option value="points">Pontos</option><option value="cashback">Cashback</option></select></label>{loyaltyMode==='points'&&<label>Pontos por R$ 1<input value={points} onChange={e=>setPoints(e.target.value)} inputMode="decimal"/></label>}{loyaltyMode==='cashback'&&<label>Cashback %<input value={cashback} onChange={e=>setCashback(e.target.value)} inputMode="decimal"/></label>}<button disabled={busy} onClick={()=>void mutate('loyalty','PUT',{mode:loyaltyMode,active:loyaltyMode!=='off',points_per_real:Number(points.replace(',','.'))||1,cashback_bps:Math.round((Number(cashback.replace(',','.'))||0)*100)},'Programa de recompra atualizado.')}><CheckCircle2 size={16}/>Salvar fidelidade</button></div><a className="delivery40-link" href="/?crm=1">Abrir CRM de recompra <ArrowRight size={14}/></a></section><aside className="delivery40-panel delivery40-form"><span>CUPOM CONTROLADO</span><h2>Novo teste</h2><label>Código<input value={promoCode} onChange={e=>setPromoCode(e.target.value.toUpperCase())} placeholder="VOLTA10"/></label><label>Desconto %<input value={promoValue} onChange={e=>setPromoValue(e.target.value)} inputMode="numeric"/></label><button disabled={busy||promoCode.trim().length<3} onClick={()=>mutate('promos','POST',{code:promoCode,discount_type:'percent',value:Math.max(0,Math.round(Number(promoValue)||0)),min_order_cents:0},'Cupom criado.').then(()=>setPromoCode(''))}><BadgePercent size={16}/>Criar cupom</button><div className="delivery40-promo-list">{data.promos.slice(0,6).map(p=><span key={p.id}><b>{p.code}</b>{p.discount_type==='percent'?`${p.value}%`:p.discount_type==='free_delivery'?'frete grátis':money(p.value)} · {p.used_count} uso(s)</span>)}</div></aside></div>}

      {tab==='canais'&&<div className="delivery40-layout"><section className="delivery40-panel"><div className="delivery40-section-head"><div><span>CONEXÕES REAIS</span><h2>Omnicanal sem fingir integração</h2></div><Network size={20}/></div><div className="delivery40-connections">{['whatsapp','mercadopago','ifood','google','meta_ads'].map(provider=>{const c=data.connections.find(x=>x.provider===provider),connected=c?.status==='active';return <article key={provider}><span className={connected?'connected':'setup'}>{connected?<CheckCircle2 size={16}/>:<Clock3 size={16}/>}</span><div><b>{providerLabel[provider]||provider}</b><small>{connected?(c?.display_name||'Conectado'):'Requer configuração'}</small></div><em>{connected?'conectado':'configurar'}</em></article>})}</div><a className="delivery40-link" href="/?connections=1">Abrir central de conexões <ArrowRight size={14}/></a></section><aside className="delivery40-panel"><div className="delivery40-section-head"><div><span>CANAL PRÓPRIO</span><h2>Venda direta</h2></div><ShoppingBag size={20}/></div><p className="delivery40-muted">O Cozinha 360 não cobra comissão sobre pedidos do canal próprio. Gateway, Pix/cartão e logística externa podem cobrar suas próprias taxas.</p>{data.storefronts.length?<div className="delivery40-store-list">{data.storefronts.map(store=><a key={store.id} href={`/?loja=${encodeURIComponent(store.slug)}`} target="_blank" rel="noreferrer"><Store size={16}/><span><b>{store.display_name}</b><small>/{store.slug}</small></span><ExternalLink size={14}/></a>)}</div>:<Empty icon={Store} title="Nenhuma vitrine publicada" text="Configure a venda direta, escolha a marca e valide o preço do canal antes de divulgar o link."/>}<div className="delivery40-links"><a href="/?direct=1">Configurar venda direta</a><a href="/?margin=1">Conferir preço e margem</a></div></aside></div>}
    </section>
  </main>
}

function OrderRow({order,data,busy,onSave}:{order:Order;data:Overview;busy:boolean;onSave:(payload:unknown)=>void}){
  const [driver,setDriver]=useState(String(order.delivery?.driver_id||'')),[zone,setZone]=useState(String(order.delivery?.zone_id||'')),[status,setStatus]=useState(order.delivery?.status||'waiting')
  return <article className={`delivery40-order ${order.delayed?'delayed':''}`}><div className="delivery40-order-id"><span>#{order.id}</span><b>{order.brand?.name||'Sem marca'}</b><small>{order.channel?.name||order.source}</small></div><div className="delivery40-order-main"><b>{order.customer?.name||'Cliente não identificado'}</b><span>{statusLabel[order.status]||order.status} · {new Date(order.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div><div className="delivery40-order-money"><b>{money(order.total_cents)}</b><span>{money(order.contribution_cents)} sobra</span></div><div className="delivery40-dispatch"><select aria-label="Zona" value={zone} onChange={e=>setZone(e.target.value)}><option value="">Sem zona</option>{data.zones.filter(z=>z.active).map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select><select aria-label="Entregador" value={driver} onChange={e=>setDriver(e.target.value)}><option value="">Sem entregador</option>{data.drivers.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><select aria-label="Status entrega" value={status} onChange={e=>setStatus(e.target.value)}><option value="waiting">Aguardando</option><option value="assigned">Atribuída</option><option value="picked_up">Em rota</option><option value="delivered">Entregue</option><option value="failed">Falhou</option></select><button disabled={busy} onClick={()=>onSave({version:order.delivery?.version,driver_id:driver?Number(driver):null,zone_id:zone?Number(zone):null,status,fee_cents:order.delivery?.fee_cents||0})}>Salvar</button></div></article>
}
function Empty({icon:Icon,title,text}:{icon:React.ElementType;title:string;text:string}){return <div className="delivery40-empty"><Icon size={28}/><b>{title}</b><span>{text}</span></div>}
