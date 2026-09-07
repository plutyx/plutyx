import React,{useEffect,useMemo,useState}from'react'
import{AlertTriangle,ArrowLeft,ArrowRight,CheckCircle2,ClipboardCheck,History,PackageCheck,RefreshCcw,ShieldCheck,ShoppingBasket,Sparkles,TrendingDown,TrendingUp,Truck,WifiOff}from'lucide-react'
import{money,request}from'./app'
import{purchasesRequest}from'./purchases-api-v53'
import{suppliersRequest}from'./suppliers-api-v52'

type Business={id:number;name:string;city?:string;role:string}
type Ingredient={id:number;name:string;unit:string;on_hand_milliunits:number;par_level_milliunits:number;reorder_target_milliunits:number;last_purchase_price_cents:number;last_purchase_qty_milliunits:number}
type Supplier={id:number;name:string;backup_supplier:boolean}
type PlanItem={ingredient_id:number;name:string;unit:string;on_hand_milliunits:number;par_level_milliunits:number;reorder_target_milliunits:number;baseline_purchase_milliunits:number;committed_milliunits:number;forecast_milliunits:number;projected_after_committed_milliunits:number;demand_uplift_milliunits:number;stock_cover_days:number|null;suggested_purchase_milliunits:number;last_purchase_price_cents:number;last_purchase_qty_milliunits:number;estimated_landed_cents:number;cost_confidence:string;demand_signal:'high'|'medium'|'low'|'none';reason:'demand'|'target'|'none';tone:string}
type Plan={generated_at:string;method:string;summary:{items_to_buy:number;critical:number;estimated_landed_cents:number;missing_cost_reference:number;demand_protected_items:number;history_days:number;cover_days:number;completed_orders:number;open_orders:number;recipe_coverage_bps:number;demand_confidence:'high'|'medium'|'low'};items:PlanItem[];safety_note:string}
type PurchaseRow={id:number;ingredient_id:number;ingredient_name:string;unit:string;supplier_name:string;quantity_milliunits:number;total_cents:number;freight_cents:number;tax_cents:number;landed_cents:number;landed_per_1000_cents:number;previous_landed_per_1000_cents:number|null;change_bps:number|null;created_at:string}
type HistoryData={generated_at:string;rows:PurchaseRow[]}

const qty=(value=0,unit='un')=>`${Number(value||0).toLocaleString('pt-BR')} ${unit}`
const pctBps=(value:number|null)=>value===null?'novo':`${value>0?'+':''}${(value/100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`
const pct=(bps=0)=>`${(Number(bps||0)/100).toLocaleString('pt-BR',{maximumFractionDigits:0})}%`
const date=(raw:string)=>{try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(raw))}catch{return raw}}
const toCents=(value:string)=>Math.max(0,Math.round(Number(String(value||'0').replace(',','.'))*100))
const initialCover=()=>{const value=Number(new URLSearchParams(location.search).get('cover_days')||7);return[3,7,14].includes(value)?value:7}

export function Purchases360Route(){
 const token=localStorage.getItem('c360_token')||''
 const[businesses,setBusinesses]=useState<Business[]>([]),[businessId,setBusinessId]=useState(0),[ingredients,setIngredients]=useState<Ingredient[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([])
 const[plan,setPlan]=useState<Plan|null>(null),[history,setHistory]=useState<HistoryData|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[coverDays,setCoverDays]=useState(initialCover)
 const[error,setError]=useState(''),[notice,setNotice]=useState('')
 const[ingredientId,setIngredientId]=useState(0),[supplierId,setSupplierId]=useState(0),[quantity,setQuantity]=useState(''),[total,setTotal]=useState(''),[freight,setFreight]=useState('0'),[tax,setTax]=useState('0')
 const currentBusiness=businesses.find(item=>item.id===businessId),canBuy=['owner','admin'].includes(currentBusiness?.role||'')
 const selected=ingredients.find(item=>item.id===ingredientId)
 const landed=toCents(total)+toCents(freight)+toCents(tax)
 const per1000=Number(quantity)>0?Math.round(landed*1000/Number(quantity)):0

 async function load(target=businessId,nextCover=coverDays){
  if(!token){window.location.replace('/');return}
  setLoading(true);setError('')
  try{
   let id=target
   if(!businesses.length){
    const me=await request('/me',{},token);const rows=(me.businesses||[]) as Business[];setBusinesses(rows)
    const requested=Number(new URLSearchParams(location.search).get('business_id')||0)
    id=(requested&&rows.some(item=>item.id===requested))?requested:(id||Number(rows[0]?.id||0));if(id)setBusinessId(id)
   }
   if(!id){setPlan(null);setHistory(null);setIngredients([]);setSuppliers([]);return}
   const[ingredientRows,planData,historyData,supplierData]=await Promise.all([
    request(`/businesses/${id}/ingredients`,{},token),
    purchasesRequest(`/businesses/${id}/purchase-plan?history_days=28&cover_days=${nextCover}`,{},token),
    purchasesRequest(`/businesses/${id}/purchases?limit=40`,{},token),
    suppliersRequest(`/businesses/${id}/suppliers`,{},token).catch(()=>({rows:[]})),
   ])
   const active=(ingredientRows||[]) as Ingredient[],supplierRows=((supplierData as any)?.rows||[]) as Supplier[]
   setIngredients(active);setPlan(planData as Plan);setHistory(historyData as HistoryData);setSuppliers(supplierRows)
   const requestedIngredient=Number(new URLSearchParams(location.search).get('ingredient_id')||0)
   if(requestedIngredient&&active.some(row=>row.id===requestedIngredient))setIngredientId(requestedIngredient)
   else if(!ingredientId&&active[0])setIngredientId(Number(active[0].id))
   if(!supplierId){const requestedSupplier=Number(new URLSearchParams(location.search).get('supplier_id')||0);if(requestedSupplier&&supplierRows.some(row=>row.id===requestedSupplier))setSupplierId(requestedSupplier)}
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível montar a lista de compras.')}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])

 function prepare(item:PlanItem){setIngredientId(item.ingredient_id);setQuantity(String(item.suggested_purchase_milliunits));setTotal('');setFreight('0');setTax('0');setNotice('');setError('');requestAnimationFrame(()=>document.getElementById('buy51-form')?.scrollIntoView({behavior:'smooth',block:'start'}))}
 async function submit(event:React.FormEvent){
  event.preventDefault();if(!businessId||!selected)return
  const q=Math.round(Number(quantity));if(!Number.isFinite(q)||q<=0){setError('Informe uma quantidade maior que zero.');return}
  const productCents=toCents(total);if(productCents<=0){setError('Informe o valor real dos itens da compra.');return}
  setBusy(true);setError('');setNotice('')
  try{
   const result=await purchasesRequest(`/businesses/${businessId}/purchases`,{method:'POST',body:JSON.stringify({ingredient_id:selected.id,supplier_id:supplierId||null,quantity_milliunits:q,total_cents:productCents,freight_cents:toCents(freight),tax_cents:toCents(tax),idempotency_key:crypto.randomUUID()})},token)
   const change=Number(result.increase_bps||0)/100
   setNotice(result.price_alert?`Compra confirmada e estoque atualizado. Atenção: a referência de custo subiu ${change.toLocaleString('pt-BR',{maximumFractionDigits:1})}%.`:`Compra confirmada e estoque atualizado para ${qty(Number(result.on_hand_milliunits||0),selected.unit)}.`)
   setQuantity('');setTotal('');setFreight('0');setTax('0');await load(businessId,coverDays)
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar a compra.')}finally{setBusy(false)}
 }
 const rows=history?.rows||[],topPriceMove=useMemo(()=>rows.find(row=>Number(row.change_bps||0)>=500),[rows])
 if(loading)return <main className="buy51-shell buy51-center"><div className="buy51-loader"><ShoppingBasket/>CRUZANDO ESTOQUE, FILA E DEMANDA</div></main>
 if(!plan)return <main className="buy51-shell buy51-center"><section className="buy51-error"><WifiOff/><h1>Compras 360 indisponível.</h1><p>{error||'Crie uma operação e tente novamente.'}</p><a href="/">Voltar</a></section></main>
 const coverage=plan.summary.recipe_coverage_bps||0
 return <main className="buy51-shell">
  <header className="buy51-top"><a href="/"><ArrowLeft/>Operação</a><b><ShoppingBasket/> COMPRAS <span>360</span></b><div>{businesses.length>1&&<select aria-label="Operação" value={businessId} onChange={e=>{const id=Number(e.target.value);setBusinessId(id);void load(id,coverDays)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button aria-label="Atualizar" onClick={()=>void load(businessId,coverDays)}><RefreshCcw/></button></div></header>
  <section className="buy51-page">
   <header className="buy51-hero"><div><span>ESTOQUE · FILA ABERTA · DEMANDA OBSERVADA · CUSTO POUSADO</span><h1>Compre pelo alvo. Não pelo susto.</h1><p>O 360 cruza estoque atual, pedidos ainda não baixados, fichas técnicas e vendas recentes. A previsão é determinística e conservadora: ela aumenta a compra somente quando a demanda observada pede proteção adicional.</p></div><aside className={plan.summary.critical?'critical':''}><PackageCheck/><div><b>{plan.summary.items_to_buy}</b><span>itens para repor</span></div></aside></header>
   {notice&&<div className="buy51-banner ok"><CheckCircle2/>{notice}</div>}{error&&<div className="buy51-banner bad"><AlertTriangle/>{error}</div>}
   <div className="buy51-kpis"><Kpi label="Itens para comprar" value={String(plan.summary.items_to_buy)} note={`${plan.summary.critical} críticos após a fila`}/><Kpi label="Protegidos pela demanda" value={String(plan.summary.demand_protected_items)} note="acima da reposição ao alvo"/><Kpi label="Cobertura de fichas" value={pct(coverage)} note={`${plan.summary.completed_orders} pedidos analisados`}/><Kpi label="Referência estimada" value={money(plan.summary.estimated_landed_cents)} note={`${plan.summary.missing_cost_reference} sem custo histórico`}/></div>
   <div className={`buy51-forecast ${coverage<9000?'warn':''}`}><Sparkles/><div><small>PREVISÃO OPERACIONAL</small><b>{plan.summary.history_days} dias de histórico → proteção para os próximos {plan.summary.cover_days} dias</b><span>{plan.summary.open_orders} pedido(s) ainda não baixados · confiança {plan.summary.demand_confidence==='high'?'alta':plan.summary.demand_confidence==='medium'?'média':'cautelosa'} · {pct(coverage)} das unidades vendidas com ficha técnica</span></div><label>Horizonte<select aria-label="Horizonte da previsão" value={coverDays} onChange={e=>{const days=Number(e.target.value);setCoverDays(days);void load(businessId,days)}}><option value={3}>3 dias</option><option value={7}>7 dias</option><option value={14}>14 dias</option></select></label></div>
   {coverage<9000&&<div className="buy51-banner bad"><AlertTriangle/>Parte das vendas não possui ficha técnica completa. O 360 não inventa consumo para esses produtos; complete as fichas para melhorar a previsão.</div>}
   {topPriceMove&&<article className="buy51-signal"><TrendingUp/><div><small>ALERTA DE PREÇO</small><b>{topPriceMove.ingredient_name} subiu {pctBps(topPriceMove.change_bps)} na última compra registrada.</b><span>Antes de repetir o pedido, confira fornecedor, quantidade, frete e tributos.</span></div><button onClick={()=>{setIngredientId(topPriceMove.ingredient_id);document.getElementById('buy51-form')?.scrollIntoView({behavior:'smooth'})}}>Revisar compra<ArrowRight/></button></article>}
   <div className="buy51-grid">
    <section className="buy51-panel"><PanelHead step="PASSO 1" title="Lista inteligente de reposição" meta={`${plan.items.length} itens`}/>{plan.items.length?<div className="buy51-plan">{plan.items.map(item=><PlanRow key={item.ingredient_id} item={item} coverDays={plan.summary.cover_days} onPrepare={()=>prepare(item)}/>)}</div>:<div className="buy51-empty"><CheckCircle2/><b>Nenhuma reposição pendente.</b><span>Estoque, fila aberta e previsão estão cobertos para o horizonte escolhido.</span></div>}<p className="buy51-note">{plan.safety_note}</p></section>
    <section className="buy51-panel buy51-sticky" id="buy51-form"><PanelHead step="PASSO 2" title="Confirmar entrada real" meta={canBuy?'owner/admin':'somente leitura'}/>{canBuy?<form className="buy51-form" onSubmit={submit}><label className="wide">Ingrediente<select aria-label="Ingrediente" value={ingredientId} onChange={e=>setIngredientId(Number(e.target.value))}>{ingredients.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="wide">Fornecedor <small>opcional · melhora o histórico</small><select aria-label="Fornecedor" value={supplierId} onChange={e=>setSupplierId(Number(e.target.value))}><option value={0}>Não vincular fornecedor</option>{suppliers.map(item=><option value={item.id} key={item.id}>{item.name}{item.backup_supplier?' · alternativo':''}</option>)}</select></label><label>Quantidade <small>{selected?.unit||'un'}</small><input aria-label="Quantidade" type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Ex.: 5000"/></label><label>Valor dos itens <small>R$</small><input aria-label="Valor dos itens" type="number" min="0" step="0.01" value={total} onChange={e=>setTotal(e.target.value)} placeholder="0,00"/></label><label>Frete <small>R$</small><input aria-label="Frete" type="number" min="0" step="0.01" value={freight} onChange={e=>setFreight(e.target.value)}/></label><label>Tributos/outros <small>R$</small><input aria-label="Tributos/outros" type="number" min="0" step="0.01" value={tax} onChange={e=>setTax(e.target.value)}/></label>{!suppliers.length&&<div className="buy51-supplier-help wide"><span>Sem fornecedores cadastrados. Você pode registrar a compra mesmo assim.</span><a href="/?suppliers=1">Cadastrar fornecedores<ArrowRight/></a></div>}<div className="buy51-cost wide"><span><small>CUSTO POUSADO</small><b>{money(landed)}</b></span><span><small>POR 1.000 {selected?.unit||'un'}</small><b>{money(per1000)}</b></span></div><div className="buy51-confirm wide"><ClipboardCheck/><span><b>Confirmação com efeito real.</b><small>Ao confirmar, o núcleo soma esta quantidade ao estoque e atualiza a referência de custo usada nas fichas e no CMV. A previsão nunca compra, reserva ou altera estoque sozinha.</small></span></div><button className="wide" disabled={busy||!selected}><Truck/>{busy?'Registrando entrada…':'Confirmar compra e dar entrada no estoque'}</button></form>:<div className="buy51-empty"><ShieldCheck/><b>Seu acesso é somente leitura.</b><span>Owner ou admin confirma compras porque a ação altera estoque e referência de custo.</span></div>}</section>
   </div>
   <section className="buy51-panel"><PanelHead step="PASSO 3" title="Histórico auditável" meta={`${rows.length} registros`}/>{rows.length?<div className="buy51-history"><div className="buy51-history-head"><span>Compra</span><span>Quantidade</span><span>Custo pousado</span><span>Variação</span></div>{rows.map(row=><HistoryRow key={row.id} row={row}/>)}</div>:<div className="buy51-empty"><History/><b>O histórico começa na primeira compra.</b><span>Registre valor, quantidade, frete, tributos e fornecedor para comparar custo real ao longo do tempo.</span></div>}</section>
   <footer className="buy51-footer"><ShieldCheck/><div><b>O 360 calcula necessidade; você decide fornecedor, cotação e quantidade final.</b><span>Previsão não é garantia de venda. Custo estimado usa apenas referências registradas. O módulo é operacional e não substitui escrituração contábil, fiscal ou política de compras da empresa.</span></div><a href="/?suppliers=1">Fornecedores 360<ArrowRight/></a></footer>
  </section>
 </main>
}
function Kpi({label,value,note}:{label:string;value:string;note:string}){return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function PanelHead({step,title,meta}:{step:string;title:string;meta?:string}){return <header className="buy51-panel-head"><div><span>{step}</span><h2>{title}</h2></div>{meta&&<b>{meta}</b>}</header>}
function PlanRow({item,coverDays,onPrepare}:{item:PlanItem;coverDays:number;onPrepare:()=>void}){
 const state=item.tone==='critical'?'FILA SUPERA ESTOQUE':item.reason==='demand'?'DEMANDA ELEVA COMPRA':item.tone==='warning'?'ABAIXO DO MÍNIMO':'REPOR AO ALVO'
 return <article className={`buy51-plan-row ${item.tone} ${item.reason==='demand'?'demand':''}`}><div className="buy51-plan-status">{item.tone==='critical'?<AlertTriangle/>:item.reason==='demand'?<Sparkles/>:<ShoppingBasket/>}</div><div className="buy51-plan-main"><span>{state}</span><h3>{item.name}</h3><div className="buy51-stock-track"><i style={{width:`${Math.max(0,Math.min(100,item.reorder_target_milliunits?item.on_hand_milliunits/item.reorder_target_milliunits*100:0))}%`}}/><em style={{left:`${Math.max(0,Math.min(100,item.reorder_target_milliunits?item.par_level_milliunits/item.reorder_target_milliunits*100:0))}%`}}/></div><small>{qty(item.on_hand_milliunits,item.unit)} agora · fila aberta {qty(item.committed_milliunits,item.unit)} · previsão {coverDays}d {qty(item.forecast_milliunits,item.unit)}</small><div className="buy51-demand-detail"><span>após fila <b>{qty(item.projected_after_committed_milliunits,item.unit)}</b></span><span>alvo base <b>+{qty(item.baseline_purchase_milliunits,item.unit)}</b></span>{item.demand_uplift_milliunits>0&&<span className="boost">proteção demanda <b>+{qty(item.demand_uplift_milliunits,item.unit)}</b></span>}{item.stock_cover_days!==null&&<span>cobertura ≈ <b>{item.stock_cover_days.toLocaleString('pt-BR',{maximumFractionDigits:1})} d</b></span>}<a href={`/?suppliers=1&ingredient_id=${item.ingredient_id}`}>comparar fornecedores</a></div></div><div className="buy51-plan-buy"><span><b>+{qty(item.suggested_purchase_milliunits,item.unit)}</b><small>{item.cost_confidence==='reference'?`≈ ${money(item.estimated_landed_cents)} ref.`:'cotação necessária'}</small></span><button onClick={onPrepare}>Preparar<ArrowRight/></button></div></article>
}
function HistoryRow({row}:{row:PurchaseRow}){const change=Number(row.change_bps||0),tone=row.change_bps===null?'neutral':change>=500?'up':change<=-500?'down':'neutral';return <article className="buy51-history-row"><span><b>{row.ingredient_name}</b><small>{date(row.created_at)}{row.supplier_name?` · ${row.supplier_name}`:''}</small></span><span><b>{qty(row.quantity_milliunits,row.unit)}</b><small>entrada registrada</small></span><span><b>{money(row.landed_cents)}</b><small>{money(row.landed_per_1000_cents)} / 1.000 {row.unit}</small></span><span className={tone}>{tone==='up'?<TrendingUp/>:tone==='down'?<TrendingDown/>:null}<b>{pctBps(row.change_bps)}</b><small>vs. compra anterior</small></span></article>}
