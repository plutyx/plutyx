import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChefHat, CircleDollarSign, ShoppingBag } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || '/api'

type Business = { id:number; name:string; city:string; role:string }
type Product = { id:number; name:string; category:string; active:boolean }
type CostPreview = {
  product_id:number; product_name:string; ingredients_cents:number; packaging_cents:number;
  energy_cents:number; labor_cents:number; direct_cost_per_unit_cents:number; method:string
}
type QuickResult = { id:number; total_cents:number; variable_cost_cents:number; contribution_cents:number }

const money=(c=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100)

async function request(path:string, options:RequestInit={}, token?:string){
  const res=await fetch(`${API}${path}`,{
    ...options,
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})},
  })
  const body=await res.json().catch(()=>({detail:'Resposta inválida'}))
  if(!res.ok) throw new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir')
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
  const[error,setError]=useState('')
  const[result,setResult]=useState<QuickResult|null>(null)

  useEffect(()=>{
    if(!token){setLoading(false);return}
    request('/me',{},token).then(body=>{
      const rows:Business[]=body.businesses||[]
      setBusinesses(rows)
      if(rows[0])setBusinessId(rows[0].id)
    }).catch(err=>setError(err instanceof Error?err.message:'Falha ao carregar conta')).finally(()=>setLoading(false))
  },[token])

  useEffect(()=>{
    if(!businessId)return
    setError('');setCost(null);setResult(null)
    request(`/businesses/${businessId}/products`,{},token).then((rows:Product[])=>{
      const active=rows.filter(x=>x.active)
      setProducts(active)
      setProductId(active[0]?.id||0)
    }).catch(err=>setError(err instanceof Error?err.message:'Falha ao carregar produtos'))
  },[businessId,token])

  useEffect(()=>{
    if(!businessId||!productId){setCost(null);return}
    setError('');setCost(null)
    request(`/businesses/${businessId}/products/${productId}/cost-preview`,{},token)
      .then(setCost)
      .catch(err=>setError(err instanceof Error?err.message:'Cadastre a ficha técnica antes de vender'))
  },[businessId,productId,token])

  const priceCents=Math.round((Number(price)||0)*100)
  const preview=useMemo(()=>{
    const total=priceCents*qty
    const variable=(cost?.direct_cost_per_unit_cents||0)*qty
    return {total,variable,contribution:total-variable}
  },[priceCents,qty,cost])

  async function submit(e:React.FormEvent){
    e.preventDefault();if(!cost||!businessId||!productId)return
    setBusy(true);setError('');setResult(null)
    try{
      const body=await request(`/businesses/${businessId}/orders/quick`,{
        method:'POST',
        body:JSON.stringify({
          product_id:productId,
          quantity:qty,
          unit_price_cents:priceCents,
          paid:true,
          source,
          idempotency_key:`quick-ui-${crypto.randomUUID()}`,
        }),
      },token)
      setResult(body)
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível registrar o pedido')}
    finally{setBusy(false)}
  }

  if(!token)return <main className="quick-shell"><section className="quick-card"><ChefHat size={34}/><h1>Entre para registrar um pedido.</h1><a className="primary quick-link" href="/">Ir para login</a></section></main>
  if(loading)return <main className="quick-shell"><div className="quick-loader">COZINHA 360</div></main>
  if(!businesses.length)return <main className="quick-shell"><section className="quick-card"><h1>Crie sua operação primeiro.</h1><a className="primary quick-link" href="/">Criar operação</a></section></main>

  return <main className="quick-shell">
    <section className="quick-order-wrap">
      <div className="quick-topbar"><a href="/" className="quick-back"><ArrowLeft size={17}/> Operação</a><div className="brand"><ChefHat size={23}/><span>COZINHA 360</span></div></div>
      <div className="quick-heading"><span className="eyebrow">PEDIDO RÁPIDO</span><h1>Venda sem digitar o custo que o sistema já conhece.</h1><p>Escolha o produto e informe o preço. A ficha técnica calcula o custo variável direto automaticamente.</p></div>

      {businesses.length>1&&<label className="quick-field"><span>Operação</span><select aria-label="Operação" value={businessId} onChange={e=>setBusinessId(Number(e.target.value))}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}

      {error&&<div className="quick-error">{error}</div>}
      {!products.length&&!error&&<div className="quick-empty">Nenhum produto ativo. Volte para a operação e cadastre seu primeiro produto.</div>}

      {products.length>0&&<form className="quick-form" onSubmit={submit}>
        <div className="quick-fields-grid">
          <label className="quick-field"><span>Produto</span><select aria-label="Produto" value={productId} onChange={e=>setProductId(Number(e.target.value))}>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          <label className="quick-field"><span>Quantidade</span><input aria-label="Quantidade" type="number" min="1" max="10000" value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/></label>
          <label className="quick-field"><span>Preço por unidade</span><div className="money-input"><span>R$</span><input aria-label="Preço por unidade" inputMode="decimal" type="number" min="0.01" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="20,00" required/></div></label>
          <label className="quick-field"><span>Origem</span><select aria-label="Origem" value={source} onChange={e=>setSource(e.target.value)}><option value="whatsapp">WhatsApp</option><option value="balcao">Balcão</option><option value="instagram">Instagram</option><option value="telefone">Telefone</option><option value="manual">Outro</option></select></label>
        </div>

        {cost&&<div className="quick-cost-card">
          <div className="quick-cost-head"><div><span className="eyebrow">CUSTO AUTOMÁTICO</span><b>{cost.product_name}</b></div><strong>{money(cost.direct_cost_per_unit_cents)}<small>/un.</small></strong></div>
          <div className="quick-cost-breakdown"><span>Ingredientes <b>{money(cost.ingredients_cents)}</b></span><span>Embalagem <b>{money(cost.packaging_cents)}</b></span><span>Energia <b>{money(cost.energy_cents)}</b></span><span>Mão de obra <b>{money(cost.labor_cents)}</b></span></div>
        </div>}

        <div className="quick-summary">
          <div><span>Total da venda</span><strong>{money(preview.total)}</strong></div>
          <div><span>Custo direto estimado</span><strong>{money(preview.variable)}</strong></div>
          <div className={preview.contribution<0?'negative':'positive'}><span>Contribuição estimada</span><strong>{money(preview.contribution)}</strong></div>
        </div>
        <p className="quick-disclaimer">Atalho para venda direta. Taxas de marketplace, mídia, entrega ou promoções só entram quando o pedido usa um canal configurado.</p>
        <button className="primary quick-submit" disabled={busy||!cost||priceCents<=0}><ShoppingBag size={18}/>{busy?'Registrando...':'Registrar no KDS'}</button>
      </form>}

      {result&&<div className="quick-success"><CheckCircle2 size={28}/><div><b>Pedido #{result.id} registrado.</b><span>{money(result.total_cents)} de venda · {money(result.contribution_cents)} de contribuição estimada.</span></div><a href="/">Abrir KDS</a></div>}
    </section>
  </main>
}
