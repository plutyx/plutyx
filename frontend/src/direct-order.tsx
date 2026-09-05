import React,{useEffect,useMemo,useState} from 'react'
import {ArrowLeft,BarChart3,CheckCircle2,ExternalLink,Minus,Plus,RefreshCcw,ShoppingBag,Store,Target} from 'lucide-react'
import {money,request} from './app'

const DIRECT_API=import.meta.env.VITE_DIRECT_API_URL||'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-direct-v17'

type Biz={id:number;name:string;city:string;role:string}
type Product={id:number;name:string;category:string;brand_id:number|null;sale_price_cents:number}
type PublicStore={storefront:{id:number;slug:string;display_name:string;brand_id:number|null;channel_id:number};business:{id:number;name:string;city:string;currency:string};brand:{id:number;name:string}|null;products:Product[]}
type Storefront={id:number;business_id:number;brand_id:number|null;channel_id:number;slug:string;display_name:string;active:boolean;brands?:{name:string}|null;channels?:{name:string}|null}
type Campaign={utm_source:string;utm_medium:string;utm_campaign:string;orders:number;revenue_cents:number;media_cost_cents:number;contribution_after_media_cents:number;revenue_per_media:number|null;contribution_per_media:number|null}
type Attribution={days:number;summary:{orders:number;revenue_cents:number;media_cost_cents:number;contribution_after_media_cents:number};campaigns:Campaign[]}

async function direct(path:string,options:RequestInit={},token=''){
  const res=await fetch(`${DIRECT_API}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})}})
  const body=await res.json().catch(()=>({detail:'Resposta inválida'}))
  if(!res.ok)throw new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir')
  return body
}

function sessionKey(){
  const key='c360_direct_session';const existing=sessionStorage.getItem(key);if(existing)return existing
  const next=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(key,next);return next
}

export function PublicStorefrontRoute({slug}:{slug:string}){
  const [data,setData]=useState<PublicStore|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const [cart,setCart]=useState<Record<number,number>>({}),[sending,setSending]=useState(false),[success,setSuccess]=useState<{id:number;total_cents:number}|null>(null)
  const [form,setForm]=useState({name:'',phone:'',email:'',consent:false})
  useEffect(()=>{direct(`/store/${encodeURIComponent(slug)}`).then(setData).catch(e=>setError(e instanceof Error?e.message:'Loja indisponível')).finally(()=>setLoading(false))},[slug])
  const total=useMemo(()=>data?.products.reduce((sum,p)=>sum+(cart[p.id]||0)*p.sale_price_cents,0)||0,[data,cart])
  const count=useMemo(()=>Object.values(cart).reduce((a,b)=>a+b,0),[cart])
  function qty(id:number,delta:number){setCart(prev=>({...prev,[id]:Math.max(0,Math.min(20,(prev[id]||0)+delta))}))}
  async function checkout(e:React.FormEvent){
    e.preventDefault();if(!data||count===0)return;setSending(true);setError('')
    try{
      const qs=new URLSearchParams(location.search)
      const result=await direct(`/store/${encodeURIComponent(slug)}`,{method:'POST',body:JSON.stringify({
        client_order_key:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,
        customer_name:form.name,phone:form.phone,email:form.email,consent_marketing:form.consent,
        items:Object.entries(cart).filter(([,q])=>q>0).map(([product_id,quantity])=>({product_id:Number(product_id),quantity})),
        attribution:{session_key:sessionKey(),referrer:document.referrer||null,utm_source:qs.get('utm_source'),utm_medium:qs.get('utm_medium'),utm_campaign:qs.get('utm_campaign'),utm_content:qs.get('utm_content'),utm_term:qs.get('utm_term'),gclid:qs.get('gclid'),fbclid:qs.get('fbclid'),ttclid:qs.get('ttclid')},
      })})
      setSuccess(result);setCart({})
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível enviar o pedido')}finally{setSending(false)}
  }
  if(loading)return <main className="direct-public center"><b>Carregando cardápio…</b></main>
  if(error&&!data)return <main className="direct-public center"><section className="direct-message"><h1>Loja indisponível</h1><p>{error}</p></section></main>
  if(!data)return null
  return <main className="direct-public">
    <header className="direct-store-head"><div><span>PEDIDO DIRETO</span><h1>{data.storefront.display_name}</h1><p>{data.brand?.name||data.business.name}{data.business.city?` · ${data.business.city}`:''}</p></div><div className="direct-bag"><ShoppingBag size={18}/><b>{count}</b></div></header>
    <section className="direct-store-body">
      {success&&<div className="direct-success"><CheckCircle2/><div><b>Pedido #{success.id} recebido</b><span>Total {money(success.total_cents)}. A cozinha vai confirmar o atendimento.</span></div></div>}
      {error&&<div className="direct-error">{error}</div>}
      <div className="direct-products">{data.products.map(p=><article className="direct-product" key={p.id}><div><small>{p.category||'Cardápio'}</small><h2>{p.name}</h2><b>{money(p.sale_price_cents)}</b></div><div className="direct-qty"><button type="button" onClick={()=>qty(p.id,-1)} aria-label={`Remover ${p.name}`}><Minus size={17}/></button><strong>{cart[p.id]||0}</strong><button type="button" onClick={()=>qty(p.id,1)} aria-label={`Adicionar ${p.name}`}><Plus size={17}/></button></div></article>)}</div>
      {data.products.length===0&&<div className="direct-message"><h2>Cardápio em preparação</h2><p>A cozinha ainda não publicou preços neste canal.</p></div>}
      {count>0&&<form className="direct-checkout" onSubmit={checkout}><div className="direct-checkout-title"><div><span>SEU PEDIDO</span><b>{count} item(ns)</b></div><strong>{money(total)}</strong></div><label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required maxLength={160}/></label><div className="direct-form-grid"><label>WhatsApp<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} inputMode="tel" maxLength={40}/></label><label>E-mail<input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} type="email" maxLength={320}/></label></div><label className="direct-consent"><input type="checkbox" checked={form.consent} onChange={e=>setForm({...form,consent:e.target.checked})}/><span>Aceito receber novidades e ofertas desta cozinha. Posso cancelar quando quiser.</span></label><button className="direct-order-button" disabled={sending}>{sending?'Enviando…':`Enviar pedido · ${money(total)}`}</button><small className="direct-privacy">O pedido não é marcado como pago automaticamente. Pagamento e entrega são confirmados pela cozinha.</small></form>}
    </section>
  </main>
}

export function DirectCommerceAdminRoute(){
  const token=localStorage.getItem('c360_token')||''
  const [businesses,setBusinesses]=useState<Biz[]>([]),[businessId,setBusinessId]=useState(0),[stores,setStores]=useState<Storefront[]>([]),[attr,setAttr]=useState<Attribution|null>(null)
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[days,setDays]=useState(30)
  const [draft,setDraft]=useState({display_name:'',slug:''})
  async function load(id=businessId,d=days){if(!id)return;setError('');try{const [s,a]=await Promise.all([direct(`/businesses/${id}/storefronts`,{},token),direct(`/businesses/${id}/attribution?days=${d}`,{},token)]);setStores(s);setAttr(a)}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar venda direta')}}
  useEffect(()=>{if(!token){setLoading(false);return}request('/me',{},token).then(async me=>{const rows:Biz[]=me.businesses||[];setBusinesses(rows);const id=rows[0]?.id||0;setBusinessId(id);if(id)await load(id)}).catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar conta')).finally(()=>setLoading(false))},[])
  async function createStore(e:React.FormEvent){e.preventDefault();setError('');try{const created=await direct(`/businesses/${businessId}/storefronts`,{method:'POST',body:JSON.stringify(draft)},token);setDraft({display_name:'',slug:''});setNotice(`Loja ${created.display_name} criada.`);await load();setTimeout(()=>setNotice(''),2600)}catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a loja')}}
  async function toggle(store:Storefront){setError('');try{await direct(`/businesses/${businessId}/storefronts/${store.id}`,{method:'PATCH',body:JSON.stringify({active:!store.active})},token);await load()}catch(e){setError(e instanceof Error?e.message:'Erro ao atualizar')}}
  if(!token)return <main className="direct-admin center"><section className="direct-message"><h1>Entre no Cozinha 360 primeiro.</h1><a href="/">Voltar para login</a></section></main>
  if(loading)return <main className="direct-admin center"><b>Carregando Venda Direta…</b></main>
  return <main className="direct-admin"><header className="direct-admin-top"><a href="/"><ArrowLeft size={18}/> Operação</a><b>VENDA DIRETA</b><div><select value={businessId} onChange={async e=>{const id=Number(e.target.value);setBusinessId(id);await load(id)}}>{businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select><button onClick={()=>load()} title="Atualizar"><RefreshCcw size={16}/></button></div></header>
    <section className="direct-admin-body"><div className="direct-admin-hero"><span>FIRST-PARTY COMMERCE</span><h1>Venda no seu próprio link e saiba qual campanha trouxe margem — não só faturamento.</h1><p>O pedido usa o preço configurado no servidor, preserva UTM/click IDs e gera um evento de conversão único quando a venda é concluída.</p></div>{notice&&<div className="direct-success compact"><CheckCircle2/><b>{notice}</b></div>}{error&&<div className="direct-error">{error}</div>}
      <div className="direct-admin-grid"><article className="direct-panel"><div className="direct-panel-head"><div><span>LOJAS</span><h2>Links próprios</h2></div><Store/></div><form onSubmit={createStore} className="direct-create"><label>Nome da loja<input value={draft.display_name} onChange={e=>setDraft({...draft,display_name:e.target.value})} placeholder="Ex.: Brasa Burger" required/></label><label>Endereço curto<input value={draft.slug} onChange={e=>setDraft({...draft,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')})} placeholder="brasa-burger" minLength={3} maxLength={60} required/></label><button><Plus size={16}/> Criar link de venda</button></form><p className="direct-note">Na primeira loja, o sistema cria automaticamente o canal “Pedido direto”. Defina os preços dos produtos em <a href="/?margin=1">Margens & canais</a>.</p><div className="direct-store-list">{stores.map(s=><div key={s.id} className="direct-store-row"><div><b>{s.display_name}</b><span>/{s.slug} · {s.channels?.name||'Canal direto'}</span></div><div><a href={`/?loja=${encodeURIComponent(s.slug)}`} target="_blank" rel="noreferrer" title="Abrir loja"><ExternalLink size={16}/></a><button onClick={()=>toggle(s)} className={s.active?'on':'off'}>{s.active?'Ativa':'Pausada'}</button></div></div>)}</div></article>
        <article className="direct-panel"><div className="direct-panel-head"><div><span>ATRIBUIÇÃO</span><h2>Contribuição após mídia</h2></div><Target/></div><div className="direct-period"><span>Janela</span><select value={days} onChange={async e=>{const d=Number(e.target.value);setDays(d);await load(businessId,d)}}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option><option value={365}>365 dias</option></select></div><div className="direct-kpis"><div><span>Pedidos atribuídos</span><b>{attr?.summary.orders||0}</b></div><div><span>Receita</span><b>{money(attr?.summary.revenue_cents||0)}</b></div><div><span>Mídia</span><b>{money(attr?.summary.media_cost_cents||0)}</b></div><div><span>Contribuição pós-mídia</span><b>{money(attr?.summary.contribution_after_media_cents||0)}</b></div></div><div className="direct-campaigns">{attr?.campaigns.map((c,i)=><div className="direct-campaign" key={`${c.utm_source}-${c.utm_campaign}-${i}`}><div><b>{c.utm_campaign}</b><span>{c.utm_source} / {c.utm_medium}</span></div><div><strong>{money(c.contribution_after_media_cents)}</strong><span>{c.orders} pedido(s){c.contribution_per_media!=null?` · ${Number(c.contribution_per_media).toLocaleString('pt-BR')}x contribuição/mídia`:''}</span></div></div>)}{!attr?.campaigns.length&&<div className="direct-message small"><BarChart3/><p>As campanhas aparecem aqui depois que pedidos do link próprio forem concluídos.</p></div>}</div></article></div>
    </section></main>
}
