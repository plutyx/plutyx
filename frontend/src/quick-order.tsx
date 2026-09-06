import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChefHat, CloudOff, ShoppingBag, Wifi } from 'lucide-react'
import {
  cacheBusinesses,cacheCostPreview,cacheProducts,enqueueOfflineQuickOrder,isNetworkFailure,
  readCachedBusinesses,readCachedCostPreview,readCachedProducts,recallQuickPrice,recallQuickSource,
  rememberQuickPrice,rememberQuickSource,type OfflineQuickOrder,
} from './offline-queue-v50'
import { intelligenceRequest } from './intelligence-api-v50'

const API = import.meta.env.VITE_API_URL || '/api'

type Business = { id:number; name:string; city?:string; role?:string }
type Product = { id:number; name:string; category:string; active:boolean }
type CostPreview = {
  product_id:number; product_name:string; ingredients_cents:number; packaging_cents:number;
  energy_cents:number; labor_cents:number; direct_cost_per_unit_cents:number; method:string
}
type QuickResult = { id:number; total_cents:number; variable_cost_cents:number; contribution_cents:number }

const money=(c=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100)

async function coreRequest(path:string, options:RequestInit={}, token?:string){
  const res=await fetch(`${API}${path}`,{
    ...options,
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})},
  })
  const body=await res.json().catch(()=>({detail:'Resposta inválida'}))
  if(!res.ok){const error:any=new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir');error.status=res.status;throw error}
  return body
}

export function QuickOrderRoute(){
  const token=localStorage.getItem('c360_token')||''
  const[businesses,setBusinesses]=useState<Business[]>([])
  const[businessId,setBusinessId]=useState(0)
  const[products,setProducts]=useState<Product[]>([])
  const[productId,setProductId]=useState(0)
  const[cost,setCost]=useState<CostPreview|null>(null)
  const[qty,setQty]=useState(1)
  const[price,setPrice]=useState('')
  const[source,setSource]=useState('whatsapp')
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[online,setOnline]=useState(()=>navigator.onLine)
  const[error,setError]=useState('')
  const[offlineNote,setOfflineNote]=useState('')
  const[result,setResult]=useState<QuickResult|null>(null)
  const[queued,setQueued]=useState<OfflineQuickOrder|null>(null)

  useEffect(()=>{
    const sync=()=>setOnline(navigator.onLine)
    window.addEventListener('online',sync);window.addEventListener('offline',sync)
    return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync)}
  },[])

  useEffect(()=>{
    if(!token){setLoading(false);return}
    coreRequest('/me',{},token).then(body=>{
      const rows:Business[]=body.businesses||[]
      setBusinesses(rows);cacheBusinesses(rows)
      if(rows[0])setBusinessId(rows[0].id)
    }).catch(err=>{
      const cached=readCachedBusinesses().rows
      if(cached.length){setBusinesses(cached);setBusinessId(cached[0].id);setOfflineNote('Usando a última operação salva neste dispositivo. Novos pedidos ficam locais até o servidor confirmar.')}else setError(err instanceof Error?err.message:'Falha ao carregar conta')
    }).finally(()=>setLoading(false))
  },[token])

  useEffect(()=>{
    if(!businessId)return
    setError('');setCost(null);setResult(null);setQueued(null);setSource(recallQuickSource(businessId))
    coreRequest(`/businesses/${businessId}/products`,{},token).then((rows:Product[])=>{
      const active=rows.filter(x=>x.active)
      setProducts(active);cacheProducts(businessId,active)
      setProductId(active[0]?.id||0);setOfflineNote('')
    }).catch(err=>{
      const cached=readCachedProducts(businessId).rows as Product[]
      if(cached.length){setProducts(cached);setProductId(cached[0]?.id||0);setOfflineNote('Catálogo carregado do cache local. Custos e disponibilidade serão recalculados pelo servidor na sincronização.')}else setError(err instanceof Error?err.message:'Falha ao carregar produtos')
    })
  },[businessId,token])

  useEffect(()=>{
    if(!businessId||!productId){setCost(null);return}
    setError('');setCost(null)
    intelligenceRequest(`/businesses/${businessId}/products/${productId}/cost-preview`,{},token)
      .then((next:CostPreview)=>{setCost(next);cacheCostPreview(businessId,productId,next)})
      .catch(err=>{
        const cached=readCachedCostPreview(businessId,productId).cost as CostPreview|null
        if(cached){setCost(cached);setOfflineNote('Prévia de custo local. O servidor recalcula a ficha no momento da sincronização.')}else setError(err instanceof Error?err.message:'Cadastre a ficha técnica antes de vender')
      })
  },[businessId,productId,token])

  useEffect(()=>{
    if(!businessId||!productId)return
    const remembered=recallQuickPrice(businessId,productId,source)
    if(remembered>0)setPrice((remembered/100).toFixed(2))
  },[businessId,productId,source])

  const priceCents=Math.round((Number(price)||0)*100)
  const preview=useMemo(()=>{
    const total=priceCents*qty
    const variable=(cost?.direct_cost_per_unit_cents||0)*qty
    return {total,variable,contribution:total-variable}
  },[priceCents,qty,cost])

  function queueLocally(payload:any){
    if(!cost)return null
    const business=businesses.find(x=>x.id===businessId)
    const product=products.find(x=>x.id===productId)
    const row=enqueueOfflineQuickOrder({business_id:businessId,business_name:business?.name||`Operação ${businessId}`,product_name:product?.name||cost.product_name,preview_total_cents:preview.total,preview_contribution_cents:preview.contribution,payload})
    setQueued(row);setResult(null);setOfflineNote('Pedido guardado com segurança neste dispositivo. Ele ainda não está no KDS e será sincronizado quando a conexão voltar.')
    return row
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();if(!cost||!businessId||!productId)return
    setBusy(true);setError('');setResult(null);setQueued(null)
    const payload={product_id:productId,quantity:qty,unit_price_cents:priceCents,paid:true,source,idempotency_key:`quick-ui-${crypto.randomUUID()}`}
    rememberQuickPrice(businessId,productId,source,priceCents);rememberQuickSource(businessId,source)
    try{
      if(!online){queueLocally(payload);return}
      const body=await intelligenceRequest(`/businesses/${businessId}/orders/quick`,{method:'POST',body:JSON.stringify(payload)},token)
      setResult(body);setOfflineNote('')
    }catch(err){
      if(isNetworkFailure(err)){try{queueLocally(payload)}catch(queueError){setError(queueError instanceof Error?queueError.message:'Não foi possível guardar o pedido offline')}}else setError(err instanceof Error?err.message:'Não foi possível registrar o pedido')
    }finally{setBusy(false)}
  }

  if(!token)return <main className="quick-shell"><section className="quick-card"><ChefHat size={34}/><h1>Entre para registrar um pedido.</h1><a className="primary quick-link" href="/">Ir para login</a></section></main>
  if(loading)return <main className="quick-shell"><div className="quick-loader">COZINHA 360</div></main>
  if(!businesses.length)return <main className="quick-shell"><section className="quick-card"><h1>Crie sua operação primeiro.</h1><a className="primary quick-link" href="/">Criar operação</a></section></main>

  return <main className="quick-shell">
    <section className="quick-order-wrap">
      <div className="quick-topbar"><a href="/" className="quick-back"><ArrowLeft size={17}/> Operação</a><div className="brand"><ChefHat size={23}/><span>COZINHA 360</span></div></div>
      <div className="quick-heading"><span className="eyebrow">PEDIDO RÁPIDO · ONLINE + OFFLINE</span><h1>Venda em poucos toques, mesmo se a internet cair.</h1><p>O sistema reutiliza o último preço e custo conhecidos. Offline, salva localmente com chave única; online, o servidor recalcula a ficha e confirma no KDS.</p></div>

      {businesses.length>1&&<label className="quick-field"><span>Operação</span><select aria-label="Operação" value={businessId} onChange={e=>setBusinessId(Number(e.target.value))}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}

      {offlineNote&&<div className="quick-offline-note">{online?<Wifi size={16}/>:<CloudOff size={16}/>}<span>{offlineNote}</span></div>}
      {error&&<div className="quick-error">{error}</div>}
      {!products.length&&!error&&<div className="quick-empty">Nenhum produto ativo no cache. Conecte uma vez para carregar o catálogo desta operação.</div>}

      {products.length>0&&<form className="quick-form" onSubmit={submit}>
        <div className="quick-fields-grid">
          <label className="quick-field"><span>Produto</span><select aria-label="Produto" value={productId} onChange={e=>setProductId(Number(e.target.value))}>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          <label className="quick-field"><span>Quantidade</span><input aria-label="Quantidade" type="number" min="1" max="10000" value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/></label>
          <label className="quick-field"><span>Preço por unidade</span><div className="money-input"><span>R$</span><input aria-label="Preço por unidade" inputMode="decimal" type="number" min="0.01" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="20,00" required/></div></label>
          <label className="quick-field"><span>Origem</span><select aria-label="Origem" value={source} onChange={e=>setSource(e.target.value)}><option value="whatsapp">WhatsApp</option><option value="balcao">Balcão</option><option value="instagram">Instagram</option><option value="telefone">Telefone</option><option value="manual">Outro</option></select></label>
        </div>

        {cost&&<div className="quick-cost-card">
          <div className="quick-cost-head"><div><span className="eyebrow">CUSTO {online?'AUTOMÁTICO':'SALVO'}</span><b>{cost.product_name}</b></div><strong>{money(cost.direct_cost_per_unit_cents)}<small>/un.</small></strong></div>
          <div className="quick-cost-breakdown"><span>Ingredientes <b>{money(cost.ingredients_cents)}</b></span><span>Embalagem <b>{money(cost.packaging_cents)}</b></span><span>Energia <b>{money(cost.energy_cents)}</b></span><span>Mão de obra <b>{money(cost.labor_cents)}</b></span></div>
        </div>}

        <div className="quick-summary">
          <div><span>Total da venda</span><strong>{money(preview.total)}</strong></div>
          <div><span>Custo direto estimado</span><strong>{money(preview.variable)}</strong></div>
          <div className={preview.contribution<0?'negative':'positive'}><span>Contribuição estimada</span><strong>{money(preview.contribution)}</strong></div>
        </div>
        <p className="quick-disclaimer">Offline, estes números são apenas a última prévia local. O pedido só vira registro oficial quando o servidor aceitar e recalcular custos. Taxas de canal entram quando houver canal configurado no pedido.</p>
        <button className="primary quick-submit" disabled={busy||!cost||priceCents<=0}><ShoppingBag size={18}/>{busy?'Registrando...':online?'Registrar no KDS':'Guardar pedido offline'}</button>
      </form>}

      {result&&<div className="quick-success"><CheckCircle2 size={28}/><div><b>Pedido #{result.id} confirmado pelo servidor.</b><span>{money(result.total_cents)} de venda · {money(result.contribution_cents)} de contribuição estimada.</span></div><a href="/">Abrir KDS</a></div>}
      {queued&&<div className="quick-success queued"><CloudOff size={28}/><div><b>Pedido salvo neste dispositivo.</b><span>{money(queued.preview_total_cents)} de venda prevista · ainda não confirmado no KDS. A fila segura sincroniza automaticamente quando a internet voltar.</span></div><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('c360-offline-queue-open'))}>Ver fila</button></div>}
    </section>
  </main>
}
