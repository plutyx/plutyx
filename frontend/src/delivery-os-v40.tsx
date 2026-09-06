import React,{useEffect,useMemo,useState} from 'react'
import {
  ArrowLeft, Bike, Check, ChevronRight, CircleDollarSign, Clock3, Gift, Globe2,
  MapPinned, PackageCheck, Plus, RefreshCcw, Route, ShoppingBag, Store, Tags, Truck,
  Users, WalletCards, XCircle
} from 'lucide-react'

const CORE_API=import.meta.env.VITE_API_URL||'/api'
const DELIVERY_API=import.meta.env.VITE_DELIVERY_API_URL||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-delivery-v40'

type Business={id:number;name:string;city:string;role:string}
type Brand={id:number;name:string;slug:string|null;active:boolean;primary_channel:string;sort_order:number;metrics:{orders:number;revenue_cents:number;contribution_cents:number}}
type Zone={id:number;business_id:number;brand_id:number|null;name:string;zone_type:'radius'|'neighborhood'|'cep';match_value:string;fee_cents:number;min_order_cents:number;eta_min:number;active:boolean;version:number}
type Driver={id:number;business_id:number;name:string;phone:string;vehicle:'foot'|'bike'|'moto'|'car'|'utility';status:'available'|'busy'|'offline';active:boolean;version:number}
type Loyalty={business_id:number;mode:'off'|'points'|'cashback';points_per_real:number;cashback_bps:number;redeem_threshold:number;active:boolean}
type Promo={id:number;business_id:number;brand_id:number|null;code:string;discount_type:'percent'|'fixed'|'free_delivery';value:number;min_order_cents:number;max_uses:number|null;used_count:number;starts_at:string|null;ends_at:string|null;active:boolean}
type Overview={
  business_id:number;period_days:number;
  metrics:{orders_paid:number;revenue_cents:number;contribution_cents:number;open_orders:number;delayed_orders:number;source_mix:Record<string,number>};
  readiness:{own_channel:boolean;delivery_zones:boolean;couriers:boolean;loyalty:boolean;multibrand:boolean};
  brands:Brand[];zones:Zone[];drivers:Driver[];loyalty:Loyalty;promos:Promo[];storefronts:{id:number;brand_id:number|null;slug:string;display_name:string;active:boolean}[];channels:{id:number;name:string;traffic_active:boolean}[]
}

type Tab='overview'|'brands'|'delivery'|'retention'

const money=(c=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100)
const integer=(v:number)=>new Intl.NumberFormat('pt-BR').format(v||0)
const channelLabel:Record<string,string>={direct:'Canal próprio',whatsapp:'WhatsApp',ifood:'iFood','99food':'99Food',mixed:'Multicanal',manual:'Manual',balcao:'Balcão',instagram:'Instagram',telefone:'Telefone'}
const vehicleLabel:Record<string,string>={foot:'A pé',bike:'Bicicleta',moto:'Moto',car:'Carro',utility:'Utilitário'}

async function request(base:string,path:string,options:RequestInit={},token=''){
  const r=await fetch(`${base}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),(options.headers||{})}})
  const body=await r.json().catch(()=>({detail:'Resposta inválida'}))
  if(!r.ok)throw new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir')
  return body
}

export function DeliveryOSRoute(){
  const token=localStorage.getItem('c360_token')||''
  const[businesses,setBusinesses]=useState<Business[]>([]);const[businessId,setBusinessId]=useState(0)
  const[data,setData]=useState<Overview|null>(null);const[tab,setTab]=useState<Tab>('overview')
  const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('')

  async function loadBusinesses(){
    if(!token){setLoading(false);return}
    try{const me=await request(CORE_API,'/me',{},token);const rows:Business[]=me.businesses||[];setBusinesses(rows);setBusinessId(x=>x||rows[0]?.id||0)}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar conta')}finally{setLoading(false)}
  }
  async function load(id=businessId){if(!id)return;setError('');try{setData(await request(DELIVERY_API,`/businesses/${id}/delivery/overview`,{},token))}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar Delivery OS')}}
  useEffect(()=>{void loadBusinesses()},[])
  useEffect(()=>{if(businessId)void load(businessId)},[businessId])
  const business=businesses.find(b=>b.id===businessId)||businesses[0]
  const canEdit=['owner','admin'].includes(business?.role||'')
  async function mutate(path:string,options:RequestInit,msg:string){setBusy(true);setError('');setNotice('');try{await request(DELIVERY_API,`/businesses/${businessId}/delivery/${path}`,options,token);setNotice(msg);await load()}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar')}finally{setBusy(false)}}

  if(!token)return <main className="delivery-os-shell"><section className="delivery-empty"><Store size={34}/><h1>Entre para abrir o Delivery OS.</h1><a className="delivery-primary" href="/">Ir para login</a></section></main>
  if(loading)return <main className="delivery-os-shell"><div className="delivery-loader">COZINHA 360 · DELIVERY OS</div></main>
  if(!businesses.length)return <main className="delivery-os-shell"><section className="delivery-empty"><h1>Crie uma operação primeiro.</h1><a className="delivery-primary" href="/">Criar operação</a></section></main>

  return <main className="delivery-os-shell">
    <section className="delivery-os-wrap">
      <header className="delivery-topbar">
        <a href="/" className="delivery-back"><ArrowLeft size={17}/> Operação</a>
        <div className="delivery-brand"><span>COZINHA 360</span><b>DELIVERY OS</b><small>v4.0</small></div>
        <div className="delivery-top-actions">{businesses.length>1&&<select aria-label="Operação" value={businessId} onChange={e=>setBusinessId(Number(e.target.value))}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button type="button" onClick={()=>load()} aria-label="Atualizar"><RefreshCcw size={17}/></button></div>
      </header>

      <div className="delivery-hero"><div><span className="delivery-kicker">DARK KITCHEN · CANAL PRÓPRIO · MULTIMARCA</span><h1>Da entrada do pedido à recompra, sem trocar de sistema.</h1><p>Marcas, canais, entrega e fidelização usam os mesmos dados de KDS, estoque, ficha técnica e margem do Cozinha 360.</p></div><div className="delivery-hero-actions"><a href="/?direct=1">Abrir canal próprio <ChevronRight size={16}/></a><a href="/?connections=1">Conectar canais <ChevronRight size={16}/></a></div></div>

      {notice&&<div className="delivery-notice"><Check size={16}/>{notice}</div>}{error&&<div className="delivery-error"><XCircle size={16}/>{error}</div>}

      <nav className="delivery-tabs" aria-label="Delivery OS"><button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Comando</button><button className={tab==='brands'?'active':''} onClick={()=>setTab('brands')}>Marcas</button><button className={tab==='delivery'?'active':''} onClick={()=>setTab('delivery')}>Entrega</button><button className={tab==='retention'?'active':''} onClick={()=>setTab('retention')}>Recompra</button></nav>

      {!data?<div className="delivery-loading-card">Carregando operação...</div>:<>
        {tab==='overview'&&<OverviewTab data={data}/>} 
        {tab==='brands'&&<BrandsTab data={data} canEdit={canEdit} busy={busy} mutate={mutate}/>} 
        {tab==='delivery'&&<DeliveryTab data={data} canEdit={canEdit} busy={busy} mutate={mutate}/>} 
        {tab==='retention'&&<RetentionTab data={data} canEdit={canEdit} busy={busy} mutate={mutate}/>} 
      </>}
    </section>
  </main>
}

function OverviewTab({data}:{data:Overview}){
  const margin=data.metrics.revenue_cents>0?data.metrics.contribution_cents/data.metrics.revenue_cents*100:0
  const actions=useMemo(()=>{
    const rows:{tone:'critical'|'warn'|'ok'|'info';title:string;detail:string;href:string;cta:string}[]=[]
    if(data.metrics.delayed_orders>0)rows.push({tone:'critical',title:`${data.metrics.delayed_orders} pedido(s) passando de 30 min`,detail:'Atraso operacional vem antes de qualquer campanha de crescimento.',href:'/?kitchen=1',cta:'Abrir cozinha'})
    if(!data.readiness.own_channel)rows.push({tone:'warn',title:'Canal próprio ainda não está ativo',detail:'Marketplace pode trazer demanda; o canal próprio preserva dados do cliente e reduz dependência de comissão.',href:'/?direct=1',cta:'Criar loja'})
    if(!data.brands.length)rows.push({tone:'warn',title:'Cadastre a primeira marca',detail:'A marca passa a separar operação, canal e resultado sem exigir outro sistema.',href:'#brands',cta:'Configurar'})
    if(!data.readiness.delivery_zones)rows.push({tone:'warn',title:'Defina onde você entrega e quanto cobra',detail:'Zona, pedido mínimo, taxa e ETA devem ser decididos antes de prometer prazo ao cliente.',href:'#delivery',cta:'Criar zona'})
    if(!data.readiness.loyalty)rows.push({tone:'info',title:'Ative um mecanismo simples de recompra',detail:'Comece com pontos ou cashback somente se a margem comportar o incentivo.',href:'#retention',cta:'Configurar'})
    if(!rows.length)rows.push({tone:'ok',title:'Base operacional do delivery configurada',detail:'Use Today e Autopilot para decidir o próximo gargalo antes de aumentar volume.',href:'/?today=1',cta:'Ver decisões'})
    return rows
  },[data])
  function nav(href:string){if(href==='#brands')return ()=>document.querySelector<HTMLButtonElement>('.delivery-tabs button:nth-child(2)')?.click();if(href==='#delivery')return ()=>document.querySelector<HTMLButtonElement>('.delivery-tabs button:nth-child(3)')?.click();if(href==='#retention')return ()=>document.querySelector<HTMLButtonElement>('.delivery-tabs button:nth-child(4)')?.click();return undefined}
  const sourceEntries=Object.entries(data.metrics.source_mix).sort((a,b)=>b[1]-a[1])
  return <section className="delivery-section">
    <div className="delivery-metrics">
      <Metric icon={ShoppingBag} label="Pedidos pagos · 30d" value={integer(data.metrics.orders_paid)} sub={`${data.metrics.open_orders} abertos agora`}/>
      <Metric icon={WalletCards} label="Receita · 30d" value={money(data.metrics.revenue_cents)} sub="todos os canais"/>
      <Metric icon={CircleDollarSign} label="Contribuição" value={money(data.metrics.contribution_cents)} sub={`${margin.toFixed(1).replace('.',',')}% da receita`} emphasis/>
      <Metric icon={Clock3} label="Atenção no KDS" value={String(data.metrics.delayed_orders)} sub="abertos há mais de 30 min" danger={data.metrics.delayed_orders>0}/>
    </div>
    <div className="delivery-grid delivery-grid-main">
      <article className="delivery-panel delivery-attention"><div className="delivery-panel-head"><div><span>PRÓXIMAS AÇÕES</span><h2>O que eu faria agora</h2></div><PackageCheck size={22}/></div><div className="delivery-action-list">{actions.map((a,i)=><div className={`delivery-action ${a.tone}`} key={`${a.title}-${i}`}><span>{i+1}</span><div><b>{a.title}</b><small>{a.detail}</small></div>{a.href.startsWith('#')?<button onClick={nav(a.href)}>{a.cta}<ChevronRight size={15}/></button>:<a href={a.href}>{a.cta}<ChevronRight size={15}/></a>}</div>)}</div></article>
      <article className="delivery-panel"><div className="delivery-panel-head"><div><span>PRONTIDÃO</span><h2>Delivery sem ponto cego</h2></div><Route size={22}/></div><div className="delivery-readiness"><Readiness label="Canal próprio" ready={data.readiness.own_channel}/><Readiness label="Áreas de entrega" ready={data.readiness.delivery_zones}/><Readiness label="Entregadores" ready={data.readiness.couriers}/><Readiness label="Recompra" ready={data.readiness.loyalty}/><Readiness label="Multi-marca" ready={data.readiness.multibrand} optional/></div></article>
    </div>
    <div className="delivery-grid">
      <article className="delivery-panel"><div className="delivery-panel-head"><div><span>MIX DE PEDIDOS</span><h2>De onde vieram as vendas</h2></div><Globe2 size={22}/></div>{sourceEntries.length?<div className="delivery-source-list">{sourceEntries.map(([key,value])=><div key={key}><span>{channelLabel[key]||key}</span><b>{value}</b><i style={{width:`${Math.max(5,value/Math.max(1,data.metrics.orders_paid)*100)}%`}}/></div>)}</div>:<p className="delivery-empty-text">Registre pedidos para formar o mix de canais.</p>}</article>
      <article className="delivery-panel"><div className="delivery-panel-head"><div><span>MARCAS</span><h2>Resultado separado, cozinha compartilhada</h2></div><Store size={22}/></div>{data.brands.length?<div className="delivery-brand-mini">{data.brands.slice(0,5).map(b=><div key={b.id}><div><b>{b.name}</b><small>{channelLabel[b.primary_channel]||b.primary_channel}</small></div><span>{b.metrics.orders} pedidos</span><strong>{money(b.metrics.contribution_cents)}</strong></div>)}</div>:<p className="delivery-empty-text">A primeira marca ainda não foi configurada.</p>}</article>
    </div>
  </section>
}

function Metric({icon:Icon,label,value,sub,emphasis,danger}:{icon:React.ElementType;label:string;value:string;sub:string;emphasis?:boolean;danger?:boolean}){return <article className={`delivery-metric ${emphasis?'emphasis':''} ${danger?'danger':''}`}><div><Icon size={17}/><span>{label}</span></div><strong>{value}</strong><small>{sub}</small></article>}
function Readiness({label,ready,optional}:{label:string;ready:boolean;optional?:boolean}){return <div className={ready?'ready':'pending'}><span>{ready?<Check size={14}/>:<Clock3 size={14}/>}</span><b>{label}</b><small>{ready?'pronto':optional?'opcional':'configurar'}</small></div>}

function BrandsTab({data,canEdit,busy,mutate}:{data:Overview;canEdit:boolean;busy:boolean;mutate:(path:string,options:RequestInit,msg:string)=>Promise<void>}){
  const[name,setName]=useState('');const[slug,setSlug]=useState('');const[channel,setChannel]=useState('direct')
  async function submit(e:React.FormEvent){e.preventDefault();await mutate('brands',{method:'POST',body:JSON.stringify({name,slug,primary_channel:channel})},'Marca criada.');setName('');setSlug('')}
  return <section className="delivery-section"><div className="delivery-section-head"><div><span>MULTIMARCA NATIVO</span><h2>Várias marcas. Uma cozinha. Resultado separado.</h2><p>Modele a operação como a dark kitchen realmente funciona: a capacidade é compartilhada, mas marca, canal e contribuição permanecem identificados.</p></div></div>
    {canEdit&&<form className="delivery-form delivery-brand-form" onSubmit={submit}><label>Nome da marca<input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Smash da Vila" required/></label><label>Slug<input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="smash-da-vila"/></label><label>Canal principal<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="direct">Canal próprio</option><option value="whatsapp">WhatsApp</option><option value="ifood">iFood</option><option value="99food">99Food</option><option value="mixed">Multicanal</option></select></label><button className="delivery-primary" disabled={busy}><Plus size={16}/>Adicionar marca</button></form>}
    <div className="delivery-card-grid">{data.brands.map(b=><article className={`delivery-brand-card ${b.active?'':'inactive'}`} key={b.id}><header><div><span>{b.active?'ATIVA':'PAUSADA'}</span><h3>{b.name}</h3><small>/{b.slug||'sem-slug'} · {channelLabel[b.primary_channel]||b.primary_channel}</small></div><Store size={21}/></header><div className="delivery-brand-stats"><div><span>Pedidos 30d</span><b>{b.metrics.orders}</b></div><div><span>Receita</span><b>{money(b.metrics.revenue_cents)}</b></div><div><span>Contribuição</span><b>{money(b.metrics.contribution_cents)}</b></div></div>{canEdit&&<button className="delivery-secondary" disabled={busy} onClick={()=>mutate(`brands/${b.id}`,{method:'PATCH',body:JSON.stringify({active:!b.active})},b.active?'Marca pausada.':'Marca ativada.')}>{b.active?'Pausar marca':'Ativar marca'}</button>}</article>)}{!data.brands.length&&<div className="delivery-empty-wide">Cadastre a primeira marca para separar pedidos e resultado sem criar outra operação.</div>}</div>
  </section>
}

function DeliveryTab({data,canEdit,busy,mutate}:{data:Overview;canEdit:boolean;busy:boolean;mutate:(path:string,options:RequestInit,msg:string)=>Promise<void>}){
  const[zName,setZName]=useState('');const[zType,setZType]=useState<'radius'|'neighborhood'|'cep'>('radius');const[zValue,setZValue]=useState('');const[zFee,setZFee]=useState('');const[zMin,setZMin]=useState('');const[zEta,setZEta]=useState(45);const[zBrand,setZBrand]=useState(0)
  const[dName,setDName]=useState('');const[dPhone,setDPhone]=useState('');const[dVehicle,setDVehicle]=useState<Driver['vehicle']>('moto')
  async function zoneSubmit(e:React.FormEvent){e.preventDefault();await mutate('zones',{method:'POST',body:JSON.stringify({name:zName,zone_type:zType,match_value:zValue,fee_cents:Math.round(Number(zFee||0)*100),min_order_cents:Math.round(Number(zMin||0)*100),eta_min:zEta,brand_id:zBrand||null})},'Área de entrega criada.');setZName('');setZValue('');setZFee('');setZMin('')}
  async function driverSubmit(e:React.FormEvent){e.preventDefault();await mutate('drivers',{method:'POST',body:JSON.stringify({name:dName,phone:dPhone,vehicle:dVehicle,status:'available'})},'Entregador adicionado.');setDName('');setDPhone('')}
  return <section className="delivery-section"><div className="delivery-section-head"><div><span>LOGÍSTICA PRÓPRIA</span><h2>Prometa prazo e taxa com regra explícita.</h2><p>Primeiro configure zonas e disponibilidade. Roteirização geográfica e rastreio entram sobre essa base — nunca como promessa sem endereço e mapa válidos.</p></div><a href="/?connections=1">Conexões <ChevronRight size={16}/></a></div>
    <div className="delivery-grid">
      <article className="delivery-panel"><div className="delivery-panel-head"><div><span>ÁREAS</span><h2>Taxa, mínimo e ETA</h2></div><MapPinned size={22}/></div>{canEdit&&<form className="delivery-stack-form" onSubmit={zoneSubmit}><div className="delivery-form-row"><label>Nome<input value={zName} onChange={e=>setZName(e.target.value)} placeholder="Raio central" required/></label><label>Regra<select value={zType} onChange={e=>setZType(e.target.value as any)}><option value="radius">Raio</option><option value="neighborhood">Bairro</option><option value="cep">CEP</option></select></label></div><label>{zType==='radius'?'Distância':'Correspondência'}<input value={zValue} onChange={e=>setZValue(e.target.value)} placeholder={zType==='radius'?'Ex.: 5 km':zType==='neighborhood'?'Ex.: Centro':'Ex.: 08700-*'} required/></label>{data.brands.length>0&&<label>Marca<select value={zBrand} onChange={e=>setZBrand(Number(e.target.value))}><option value={0}>Todas as marcas</option>{data.brands.filter(b=>b.active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}<div className="delivery-form-row three"><label>Taxa R$<input type="number" step="0.01" min="0" value={zFee} onChange={e=>setZFee(e.target.value)}/></label><label>Mínimo R$<input type="number" step="0.01" min="0" value={zMin} onChange={e=>setZMin(e.target.value)}/></label><label>ETA min<input type="number" min="5" max="360" value={zEta} onChange={e=>setZEta(Number(e.target.value))}/></label></div><button className="delivery-primary" disabled={busy}><Plus size={16}/>Criar área</button></form>}<div className="delivery-list">{data.zones.map(z=><div className={`delivery-list-row ${z.active?'':'inactive'}`} key={z.id}><div><b>{z.name}</b><span>{z.zone_type==='radius'?'Raio':z.zone_type==='cep'?'CEP':'Bairro'} · {z.match_value}</span></div><div className="delivery-row-meta"><strong>{money(z.fee_cents)}</strong><small>mín. {money(z.min_order_cents)} · {z.eta_min} min</small>{canEdit&&<button onClick={()=>mutate(`zones/${z.id}`,{method:'PATCH',body:JSON.stringify({active:!z.active,expected_version:z.version})},z.active?'Zona pausada.':'Zona ativada.')}>{z.active?'Pausar':'Ativar'}</button>}</div></div>)}{!data.zones.length&&<p className="delivery-empty-text">Nenhuma zona configurada.</p>}</div></article>
      <article className="delivery-panel"><div className="delivery-panel-head"><div><span>ENTREGADORES</span><h2>Disponibilidade da rua</h2></div><Truck size={22}/></div>{canEdit&&<form className="delivery-stack-form" onSubmit={driverSubmit}><label>Nome<input value={dName} onChange={e=>setDName(e.target.value)} placeholder="Nome do entregador" required/></label><div className="delivery-form-row"><label>WhatsApp / telefone<input value={dPhone} onChange={e=>setDPhone(e.target.value)} placeholder="(11) 99999-9999"/></label><label>Modal<select value={dVehicle} onChange={e=>setDVehicle(e.target.value as Driver['vehicle'])}><option value="foot">A pé</option><option value="bike">Bicicleta</option><option value="moto">Moto</option><option value="car">Carro</option><option value="utility">Utilitário</option></select></label></div><button className="delivery-primary" disabled={busy}><Plus size={16}/>Adicionar entregador</button></form>}<div className="delivery-list">{data.drivers.map(d=><div className={`delivery-list-row ${d.active?'':'inactive'}`} key={d.id}><div className="delivery-driver-name"><span className={`delivery-status-dot ${d.status}`}/><div><b>{d.name}</b><span>{vehicleLabel[d.vehicle]} · {d.phone||'sem telefone'}</span></div></div><div className="delivery-row-meta"><strong>{d.status==='available'?'Disponível':d.status==='busy'?'Em entrega':'Offline'}</strong>{canEdit&&<div className="delivery-driver-actions"><button onClick={()=>mutate(`drivers/${d.id}`,{method:'PATCH',body:JSON.stringify({status:d.status==='available'?'busy':'available',expected_version:d.version})},'Status atualizado.')}>{d.status==='available'?'Marcar em entrega':'Marcar disponível'}</button><button onClick={()=>mutate(`drivers/${d.id}`,{method:'PATCH',body:JSON.stringify({active:!d.active,expected_version:d.version})},d.active?'Entregador pausado.':'Entregador ativado.')}>{d.active?'Pausar':'Ativar'}</button></div>}</div></div>)}{!data.drivers.length&&<p className="delivery-empty-text">Cadastre quem faz suas entregas próprias. Terceirizados podem ser adicionados depois por integração.</p>}</div></article>
    </div>
  </section>
}

function RetentionTab({data,canEdit,busy,mutate}:{data:Overview;canEdit:boolean;busy:boolean;mutate:(path:string,options:RequestInit,msg:string)=>Promise<void>}){
  const[mode,setMode]=useState<Loyalty['mode']>(data.loyalty.mode||'off');const[points,setPoints]=useState(Number(data.loyalty.points_per_real||1));const[cashback,setCashback]=useState(Number(data.loyalty.cashback_bps||0)/100);const[threshold,setThreshold]=useState(Number(data.loyalty.redeem_threshold||0))
  const[pCode,setPCode]=useState('');const[pType,setPType]=useState<Promo['discount_type']>('percent');const[pValue,setPValue]=useState('10');const[pMin,setPMin]=useState('');const[pBrand,setPBrand]=useState(0)
  async function saveLoyalty(e:React.FormEvent){e.preventDefault();await mutate('loyalty',{method:'PUT',body:JSON.stringify({mode,points_per_real:points,cashback_bps:Math.round(cashback*100),redeem_threshold:threshold,active:mode!=='off'})},'Programa de recompra atualizado.')}
  async function promoSubmit(e:React.FormEvent){e.preventDefault();const raw=Number(pValue||0);await mutate('promos',{method:'POST',body:JSON.stringify({code:pCode,discount_type:pType,value:pType==='percent'?Math.round(raw*100):pType==='fixed'?Math.round(raw*100):0,min_order_cents:Math.round(Number(pMin||0)*100),brand_id:pBrand||null})},'Cupom criado.');setPCode('')}
  return <section className="delivery-section"><div className="delivery-section-head"><div><span>PRIMEIRA PARTE DO CRM É A SEGUNDA COMPRA</span><h2>Incentivo só quando a margem comportar.</h2><p>Pontos, cashback e cupons ficam ligados à operação real. Antes de aumentar desconto, confira contribuição e custo do canal.</p></div><a href="/?crm=1">Abrir CRM <ChevronRight size={16}/></a></div>
    <div className="delivery-grid">
      <article className="delivery-panel"><div className="delivery-panel-head"><div><span>FIDELIDADE</span><h2>Uma regra simples e legível</h2></div><Gift size={22}/></div>{canEdit?<form className="delivery-stack-form" onSubmit={saveLoyalty}><label>Modelo<select value={mode} onChange={e=>setMode(e.target.value as Loyalty['mode'])}><option value="off">Desligado</option><option value="points">Pontos</option><option value="cashback">Cashback</option></select></label>{mode==='points'&&<div className="delivery-form-row"><label>Pontos por R$ 1<input type="number" min="0" step="0.1" value={points} onChange={e=>setPoints(Number(e.target.value))}/></label><label>Mínimo para resgate<input type="number" min="0" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label></div>}{mode==='cashback'&&<label>Cashback %<input type="number" min="0" max="50" step="0.1" value={cashback} onChange={e=>setCashback(Number(e.target.value))}/></label>}<button className="delivery-primary" disabled={busy}>Salvar fidelidade</button></form>:<LoyaltySummary loyalty={data.loyalty}/>}<div className="delivery-rule-note"><CircleDollarSign size={16}/><span>O Cozinha 360 não chama cashback de “lucro”. É incentivo comercial e precisa caber na contribuição do pedido.</span></div></article>
      <article className="delivery-panel"><div className="delivery-panel-head"><div><span>CUPONS</span><h2>Oferta com limite explícito</h2></div><Tags size={22}/></div>{canEdit&&<form className="delivery-stack-form" onSubmit={promoSubmit}><div className="delivery-form-row"><label>Código<input value={pCode} onChange={e=>setPCode(e.target.value.toUpperCase())} placeholder="VOLTA10" required/></label><label>Tipo<select value={pType} onChange={e=>setPType(e.target.value as Promo['discount_type'])}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option><option value="free_delivery">Frete grátis</option></select></label></div>{pType!=='free_delivery'&&<label>{pType==='percent'?'Desconto %':'Desconto R$'}<input type="number" min="0" step="0.01" value={pValue} onChange={e=>setPValue(e.target.value)}/></label>}<label>Pedido mínimo R$<input type="number" min="0" step="0.01" value={pMin} onChange={e=>setPMin(e.target.value)}/></label>{data.brands.length>0&&<label>Marca<select value={pBrand} onChange={e=>setPBrand(Number(e.target.value))}><option value={0}>Todas as marcas</option>{data.brands.filter(b=>b.active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}<button className="delivery-primary" disabled={busy}><Plus size={16}/>Criar cupom</button></form>}<div className="delivery-list">{data.promos.map(p=><div className={`delivery-list-row ${p.active?'':'inactive'}`} key={p.id}><div><b>{p.code}</b><span>{promoText(p)} · mín. {money(p.min_order_cents)}</span></div><div className="delivery-row-meta"><strong>{p.used_count}{p.max_uses?`/${p.max_uses}`:''} usos</strong>{canEdit&&<button onClick={()=>mutate(`promos/${p.id}`,{method:'PATCH',body:JSON.stringify({active:!p.active})},p.active?'Cupom pausado.':'Cupom ativado.')}>{p.active?'Pausar':'Ativar'}</button>}</div></div>)}{!data.promos.length&&<p className="delivery-empty-text">Nenhum cupom cadastrado.</p>}</div></article>
    </div>
  </section>
}
function LoyaltySummary({loyalty}:{loyalty:Loyalty}){return <div className="delivery-loyalty-summary"><b>{loyalty.active?(loyalty.mode==='cashback'?`${(loyalty.cashback_bps/100).toFixed(1).replace('.',',')}% cashback`:`${loyalty.points_per_real} ponto(s) por R$ 1`):'Programa desligado'}</b><span>{loyalty.mode==='points'&&loyalty.redeem_threshold>0?`Resgate a partir de ${loyalty.redeem_threshold} pontos`:'Configure a regra como owner/admin.'}</span></div>}
function promoText(p:Promo){if(p.discount_type==='free_delivery')return'Frete grátis';if(p.discount_type==='percent')return`${(p.value/100).toFixed(1).replace('.',',')}% off`;return`${money(p.value)} off`}
