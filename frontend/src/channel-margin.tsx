import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BadgeDollarSign, Boxes, CheckCircle2, CircleAlert, Plus, RefreshCcw, Save, Store, Tags } from 'lucide-react'
import { money, request } from './app'

const MARGIN_API = import.meta.env.VITE_MARGIN_API_URL || 'https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-margin-v14'

type Biz = { id:number; name:string; city:string; role:string }
type Brand = { id:number; name:string; active:boolean }
type Channel = { id:number; name:string; fee_bps:number; fixed_fee_cents:number; delivery_cents:number; promo_cents:number; media_cents:number; traffic_active:boolean }
type Product = { id:number; name:string; category:string; brand_id:number|null; brand_name:string|null; estimated_unit_cost_cents:number }
type MarginRow = {
  product_id:number; product_name:string; brand_id:number|null; channel_id:number; channel_name:string;
  sale_price_cents:number; estimated_unit_cost_cents:number; fee_cents:number; channel_burden_cents:number;
  desired_contribution_cents:number; contribution_cents:number; contribution_margin_bps:number;
  minimum_price_cents:number; gap_to_minimum_cents:number; signal:'unset'|'danger'|'warning'|'healthy'
}
type Matrix = { products:Product[]; brands:Brand[]; channels:Channel[]; rows:MarginRow[]; summary:{configured_prices:number;products_without_brand:number;danger:number;warning:number;healthy:number} }

async function marginRequest(path:string, token:string, options:RequestInit={}){
  const res=await fetch(`${MARGIN_API}${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})}})
  const body=await res.json().catch(()=>({detail:'Resposta inválida'}))
  if(!res.ok)throw new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir')
  return body
}

const cents=(value:string)=>Math.max(0,Math.round(Number(String(value).replace(',','.'))*100||0))
const fromCents=(value:number)=>value?String((value/100).toFixed(2)).replace('.',','):''

export function ChannelMarginRoute(){
  const token=localStorage.getItem('c360_token')||''
  const [businesses,setBusinesses]=useState<Biz[]>([])
  const [businessId,setBusinessId]=useState(0)
  const [matrix,setMatrix]=useState<Matrix|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [brandName,setBrandName]=useState('')
  const [channel,setChannel]=useState({name:'',fee:'',fixed:'',delivery:'',promo:'',media:''})
  const [editing,setEditing]=useState<Record<string,{sale:string;desired:string}>>({})

  async function boot(){
    if(!token){setLoading(false);return}
    try{
      const me=await request('/me',{},token)
      const rows:Biz[]=me.businesses||[]
      setBusinesses(rows)
      const id=businessId||rows[0]?.id||0
      setBusinessId(id)
      if(id)await load(id)
    }catch(e){setError(e instanceof Error?e.message:'Falha ao carregar conta')}finally{setLoading(false)}
  }
  async function load(id=businessId){
    if(!id)return
    setError('')
    try{
      const data:Matrix=await marginRequest(`/businesses/${id}/margin-matrix`,token)
      setMatrix(data)
      const next:Record<string,{sale:string;desired:string}>={}
      for(const row of data.rows){
        next[`${row.product_id}:${row.channel_id}`]={sale:fromCents(row.sale_price_cents),desired:fromCents(row.desired_contribution_cents)}
      }
      setEditing(next)
    }catch(e){setError(e instanceof Error?e.message:'Falha ao carregar margens')}
  }
  useEffect(()=>{boot()},[])

  async function addBrand(e:React.FormEvent){
    e.preventDefault();setError('')
    try{await marginRequest(`/businesses/${businessId}/brands`,token,{method:'POST',body:JSON.stringify({name:brandName})});setBrandName('');await load();flash('Marca criada. O estoque continua compartilhado pela operação.')}catch(e){setError(e instanceof Error?e.message:'Erro')}
  }
  async function assignBrand(productId:number,brandId:string){
    setError('')
    try{await marginRequest(`/businesses/${businessId}/products/${productId}/brand`,token,{method:'PATCH',body:JSON.stringify({brand_id:brandId?Number(brandId):null})});await load();flash('Produto organizado por marca.')}catch(e){setError(e instanceof Error?e.message:'Erro')}
  }
  async function addChannel(e:React.FormEvent){
    e.preventDefault();setError('')
    try{
      await marginRequest(`/businesses/${businessId}/channels`,token,{method:'POST',body:JSON.stringify({
        name:channel.name,fee_bps:Math.round(Number(channel.fee.replace(',','.'))*100),fixed_fee_cents:cents(channel.fixed),
        delivery_cents:cents(channel.delivery),promo_cents:cents(channel.promo),media_cents:cents(channel.media),traffic_active:false,
      })})
      setChannel({name:'',fee:'',fixed:'',delivery:'',promo:'',media:''});await load();flash('Canal cadastrado. Agora defina o preço por produto.')
    }catch(e){setError(e instanceof Error?e.message:'Erro')}
  }
  async function savePrice(row:MarginRow){
    const key=`${row.product_id}:${row.channel_id}`, edit=editing[key]
    setError('')
    try{
      await marginRequest(`/businesses/${businessId}/product-channel-prices`,token,{method:'PUT',body:JSON.stringify({product_id:row.product_id,channel_id:row.channel_id,sale_price_cents:cents(edit?.sale||''),desired_contribution_cents:cents(edit?.desired||'')})})
      await load();flash(`Preço de ${row.product_name} em ${row.channel_name} recalculado.`)
    }catch(e){setError(e instanceof Error?e.message:'Erro')}
  }
  function flash(text:string){setNotice(text);window.setTimeout(()=>setNotice(''),2600)}

  const priority=useMemo(()=>{
    if(!matrix)return 'Carregando a leitura da operação.'
    if(matrix.channels.length===0)return 'Cadastre pelo menos um canal de venda para enxergar a margem real por origem.'
    if(matrix.summary.danger>0)return `${matrix.summary.danger} preço(s) estão abaixo do mínimo definido. Corrija antes de aumentar tráfego.`
    if(matrix.summary.products_without_brand>0)return `${matrix.summary.products_without_brand} produto(s) ainda estão sem marca. Organize o portfólio para operar multimarca sem misturar a leitura.`
    if(matrix.summary.warning>0)return `${matrix.summary.warning} preço(s) estão muito próximos do piso. Proteja a margem antes de dar desconto.`
    return 'Preços configurados estão acima do piso de contribuição. Mantenha custos e taxas atualizados.'
  },[matrix])

  if(!token)return <main className="margin-shell center"><section className="margin-empty"><h1>Entre no Cozinha 360 primeiro.</h1><a href="/">Voltar para login</a></section></main>
  if(loading)return <main className="margin-shell center"><b>Carregando Canais & Margens…</b></main>

  return <main className="margin-shell">
    <header className="margin-topbar"><a href="/" className="margin-back"><ArrowLeft size={18}/> Operação</a><div className="margin-brand"><BadgeDollarSign size={22}/><b>CANAIS & MARGENS</b></div><div className="margin-actions"><select value={businessId} onChange={async e=>{const id=Number(e.target.value);setBusinessId(id);await load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><button onClick={()=>load()} title="Atualizar"><RefreshCcw size={17}/></button></div></header>
    <section className="margin-page">
      <div className="margin-hero"><span className="margin-eyebrow">MULTIMARCA + PRECIFICAÇÃO OMNICHANNEL</span><h1>Um produto pode custar igual. O preço não precisa ser igual em todos os canais.</h1><p>Centralize marcas, taxas e preços por canal sem duplicar o estoque. A leitura mostra contribuição, piso recomendado e onde vender mais pode significar perder mais.</p></div>
      {notice&&<div className="margin-notice">{notice}</div>}{error&&<div className="margin-error">{error}</div>}
      <div className="margin-priority"><CircleAlert size={22}/><div><span>PRÓXIMA AÇÃO</span><b>{priority}</b></div></div>
      {matrix&&<>
        <div className="margin-metrics"><Metric icon={<Store/>} label="Marcas" value={matrix.brands.length}/><Metric icon={<Tags/>} label="Canais" value={matrix.channels.length}/><Metric icon={<CircleAlert/>} label="Preços em risco" value={matrix.summary.danger}/><Metric icon={<CheckCircle2/>} label="Preços saudáveis" value={matrix.summary.healthy}/></div>
        <div className="margin-grid two">
          <article className="margin-card"><div className="margin-card-head"><div><span className="margin-eyebrow">PORTFÓLIO</span><h2>Marcas virtuais</h2></div><Boxes size={22}/></div><p className="margin-muted">Produtos de marcas diferentes continuam consumindo os mesmos ingredientes e o mesmo estoque físico.</p><form className="margin-inline" onSubmit={addBrand}><input value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="Ex.: Brasa Burger" required/><button><Plus size={16}/> Marca</button></form><div className="margin-list">{matrix.products.map(p=><div className="margin-row" key={p.id}><div><b>{p.name}</b><span>{p.category||'Sem categoria'} · custo {money(p.estimated_unit_cost_cents)}</span></div><select value={p.brand_id||''} onChange={e=>assignBrand(p.id,e.target.value)}><option value="">Sem marca</option>{matrix.brands.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></div>)}</div></article>
          <article className="margin-card"><div className="margin-card-head"><div><span className="margin-eyebrow">CUSTO DO CANAL</span><h2>Novo canal</h2></div><Store size={22}/></div><form className="channel-form" onSubmit={addChannel}><label>Nome<input value={channel.name} onChange={e=>setChannel({...channel,name:e.target.value})} placeholder="iFood, WhatsApp, Rappi…" required/></label><label>Comissão %<input inputMode="decimal" value={channel.fee} onChange={e=>setChannel({...channel,fee:e.target.value})} placeholder="23"/></label><label>Taxa fixa R$<input inputMode="decimal" value={channel.fixed} onChange={e=>setChannel({...channel,fixed:e.target.value})} placeholder="0,00"/></label><label>Entrega R$<input inputMode="decimal" value={channel.delivery} onChange={e=>setChannel({...channel,delivery:e.target.value})} placeholder="0,00"/></label><label>Promo por pedido R$<input inputMode="decimal" value={channel.promo} onChange={e=>setChannel({...channel,promo:e.target.value})} placeholder="0,00"/></label><label>Mídia por pedido R$<input inputMode="decimal" value={channel.media} onChange={e=>setChannel({...channel,media:e.target.value})} placeholder="0,00"/></label><button className="wide"><Plus size={16}/> Adicionar canal</button></form><div className="channel-chips">{matrix.channels.map(c=><span key={c.id}><b>{c.name}</b> {(c.fee_bps/100).toLocaleString('pt-BR')}%</span>)}</div></article>
        </div>
        <section className="price-section"><div className="price-head"><div><span className="margin-eyebrow">ENGENHARIA DE CARDÁPIO</span><h2>Preço por produto × canal</h2></div><p>O piso considera custo da ficha técnica, comissão, taxas fixas, entrega, promoção, mídia e a contribuição desejada.</p></div>{matrix.rows.length===0?<div className="margin-empty">Cadastre pelo menos um produto e um canal.</div>:<div className="price-grid">{matrix.rows.map(row=>{const key=`${row.product_id}:${row.channel_id}`,edit=editing[key]||{sale:'',desired:''};return <article className={`price-card ${row.signal}`} key={key}><div className="price-card-top"><div><span>{row.channel_name}</span><h3>{row.product_name}</h3></div><Signal signal={row.signal}/></div><div className="price-facts"><span>Custo produto <b>{money(row.estimated_unit_cost_cents)}</b></span><span>Custo canal <b>{money(row.channel_burden_cents)}</b></span><span>Piso recomendado <b>{money(row.minimum_price_cents)}</b></span><span>Contribuição <b>{money(row.contribution_cents)}</b></span></div><div className="price-edit"><label>Preço de venda R$<input inputMode="decimal" value={edit.sale} onChange={e=>setEditing({...editing,[key]:{...edit,sale:e.target.value}})} placeholder="29,90"/></label><label>Contribuição desejada R$<input inputMode="decimal" value={edit.desired} onChange={e=>setEditing({...editing,[key]:{...edit,desired:e.target.value}})} placeholder="8,00"/></label></div><button className="save-price" onClick={()=>savePrice(row)}><Save size={15}/> Recalcular e salvar</button>{row.sale_price_cents>0&&<small>{(row.contribution_margin_bps/100).toLocaleString('pt-BR',{maximumFractionDigits:1})}% de contribuição sobre a venda · {row.gap_to_minimum_cents>=0?`${money(row.gap_to_minimum_cents)} acima do piso`:`${money(Math.abs(row.gap_to_minimum_cents))} abaixo do piso`}</small>}</article>})}</div>}</section>
      </>}
    </section>
  </main>
}

function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <article className="margin-metric"><i>{icon}</i><div><b>{value}</b><span>{label}</span></div></article>}
function Signal({signal}:{signal:MarginRow['signal']}){const text=signal==='healthy'?'Saudável':signal==='warning'?'Atenção':signal==='danger'?'Abaixo do piso':'Definir preço';return <span className={`signal ${signal}`}>{text}</span>}
