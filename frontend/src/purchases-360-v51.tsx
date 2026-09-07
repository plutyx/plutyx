import React,{useEffect,useMemo,useState}from'react'
import{AlertTriangle,ArrowLeft,ArrowRight,CheckCircle2,ClipboardCheck,History,PackageCheck,RefreshCcw,ShieldCheck,ShoppingBasket,TrendingDown,TrendingUp,Truck,WifiOff}from'lucide-react'
import{money,request}from'./app'
import{purchasesRequest}from'./purchases-api-v51'
import{suppliersRequest}from'./suppliers-api-v52'

type Business={id:number;name:string;city?:string;role:string}
type Ingredient={id:number;name:string;unit:string;on_hand_milliunits:number;par_level_milliunits:number;reorder_target_milliunits:number;last_purchase_price_cents:number;last_purchase_qty_milliunits:number}
type Supplier={id:number;name:string;backup_supplier:boolean}
type PlanItem={ingredient_id:number;name:string;unit:string;on_hand_milliunits:number;par_level_milliunits:number;reorder_target_milliunits:number;suggested_purchase_milliunits:number;last_purchase_price_cents:number;last_purchase_qty_milliunits:number;estimated_landed_cents:number;cost_confidence:string;tone:string}
type Plan={generated_at:string;method:string;summary:{items_to_buy:number;critical:number;estimated_landed_cents:number;missing_cost_reference:number};items:PlanItem[];safety_note:string}
type PurchaseRow={id:number;ingredient_id:number;ingredient_name:string;unit:string;supplier_name:string;quantity_milliunits:number;total_cents:number;freight_cents:number;tax_cents:number;landed_cents:number;landed_per_1000_cents:number;previous_landed_per_1000_cents:number|null;change_bps:number|null;created_at:string}
type HistoryData={generated_at:string;rows:PurchaseRow[]}

const qty=(value=0,unit='un')=>`${Number(value||0).toLocaleString('pt-BR')} ${unit}`
const pctBps=(value:number|null)=>value===null?'novo':`${value>0?'+':''}${(value/100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`
const date=(raw:string)=>{try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(raw))}catch{return raw}}
const toCents=(value:string)=>Math.max(0,Math.round(Number(String(value||'0').replace(',','.'))*100))

export function Purchases360Route(){
 const token=localStorage.getItem('c360_token')||''
 const[businesses,setBusinesses]=useState<Business[]>([]),[businessId,setBusinessId]=useState(0),[ingredients,setIngredients]=useState<Ingredient[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([])
 const[plan,setPlan]=useState<Plan|null>(null),[history,setHistory]=useState<HistoryData|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const[error,setError]=useState(''),[notice,setNotice]=useState('')
 const[ingredientId,setIngredientId]=useState(0),[supplierId,setSupplierId]=useState(0),[quantity,setQuantity]=useState(''),[total,setTotal]=useState(''),[freight,setFreight]=useState('0'),[tax,setTax]=useState('0')
 const currentBusiness=businesses.find(item=>item.id===businessId),canBuy=['owner','admin'].includes(currentBusiness?.role||'')
 const selected=ingredients.find(item=>item.id===ingredientId)
 const landed=toCents(total)+toCents(freight)+toCents(tax)
 const per1000=Number(quantity)>0?Math.round(landed*1000/Number(quantity)):0

 async function load(target=businessId){
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
    purchasesRequest(`/businesses/${id}/purchase-plan`,{},token),
    purchasesRequest(`/businesses/${id}/purchases?limit=40`,{},token),
    suppliersRequest(`/businesses/${id}/suppliers`,{},token).catch(()=>({rows:[]})),
   ])
   const active=(ingredientRows||[]) as Ingredient[],supplierRows=((supplierData as any)?.rows||[]) as Supplier[]
   setIngredients(active);setPlan(planData as Plan);setHistory(historyData as HistoryData);setSuppliers(supplierRows)
   if(!ingredientId&&active[0])setIngredientId(Number(active[0].id))
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
   setQuantity('');setTotal('');setFreight('0');setTax('0');await load(businessId)
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar a compra.')}finally{setBusy(false)}
 }
 const rows=history?.rows||[],topPriceMove=useMemo(()=>rows.find(row=>Number(row.change_bps||0)>=500),[rows])
 if(loading)return <main className="buy51-shell buy51-center"><div className="buy51-loader"><ShoppingBasket/>MONTANDO LISTA, CUSTO E ESTOQUE</div></main>
 if(!plan)return <main className="buy51-shell buy51-center"><section className="buy51-error"><WifiOff/><h1>Compras 360 indisponível.</h1><p>{error||'Crie uma operação e tente novamente.'}</p><a href="/">Voltar</a></section></main>
 return <main className="buy51-shell">
  <header className="buy51-top"><a href="/"><ArrowLeft/>Operação</a><b><ShoppingBasket/> COMPRAS <span>360</span></b><div>{businesses.length>1&&<select aria-label="Operação" value={businessId} onChange={e=>{const id=Number(e.target.value);setBusinessId(id);void load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button aria-label="Atualizar" onClick={()=>void load(businessId)}><RefreshCcw/></button></div></header>
  <section className="buy51-page">
   <header className="buy51-hero"><div><span>COMPRA ORIENTADA POR ESTOQUE · CUSTO POUSADO</span><h1>Compre pelo alvo. Não pelo susto.</h1><p>O 360 transforma mínimo, estoque atual e alvo de reposição em uma lista objetiva. Você confere a cotação e confirma a entrada — o sistema nunca compra sozinho.</p></div><aside className={plan.summary.critical?'critical':''}><PackageCheck/><div><b>{plan.summary.items_to_buy}</b><span>itens para repor</span></div></aside></header>
   {notice&&<div className="buy51-banner ok"><CheckCircle2/>{notice}</div>}{error&&<div className="buy51-banner bad"><AlertTriangle/>{error}</div>}
   <div className="buy51-kpis"><Kpi label="Itens para comprar" value={String(plan.summary.items_to_buy)} note={`${plan.summary.critical} sem estoque`}/><Kpi label="Referência estimada" value={money(plan.summary.estimated_landed_cents)} note="baseada no último custo"/><Kpi label="Sem custo de referência" value={String(plan.summary.missing_cost_reference)} note="exigem cotação manual"/><Kpi label="Compras no histórico" value={String(rows.length)} note="últimos registros"/></div>
   {topPriceMove&&<article className="buy51-signal"><TrendingUp/><div><small>ALERTA DE PREÇO</small><b>{topPriceMove.ingredient_name} subiu {pctBps(topPriceMove.change_bps)} na última compra registrada.</b><span>Antes de repetir o pedido, confira fornecedor, quantidade, frete e tributos.</span></div><button onClick={()=>{setIngredientId(topPriceMove.ingredient_id);document.getElementById('buy51-form')?.scrollIntoView({behavior:'smooth'})}}>Revisar compra<ArrowRight/></button></article>}
   <div className="buy51-grid">
    <section className="buy51-panel"><PanelHead step="PASSO 1" title="Lista inteligente de reposição" meta={`${plan.items.length} itens`}/>{plan.items.length?<div className="buy51-plan">{plan.items.map(item=><PlanRow key={item.ingredient_id} item={item} onPrepare={()=>prepare(item)}/>)}</div>:<div className="buy51-empty"><CheckCircle2/><b>Nenhuma reposição pendente.</b><span>Os ingredientes com mínimo e alvo configurados estão acima do ponto de compra.</span></div>}<p className="buy51-note">{plan.safety_note}</p></section>
    <section className="buy51-panel buy51-sticky" id="buy51-form"><PanelHead step="PASSO 2" title="Confirmar entrada real" meta={canBuy?'owner/admin':'somente leitura'}/>{canBuy?<form className="buy51-form" onSubmit={submit}><label className="wide">Ingrediente<select aria-label="Ingrediente" value={ingredientId} onChange={e=>setIngredientId(Number(e.target.value))}>{ingredients.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="wide">Fornecedor <small>opcional · melhora o histórico</small><select aria-label="Fornecedor" value={supplierId} onChange={e=>setSupplierId(Number(e.target.value))}><option value={0}>Não vincular fornecedor</option>{suppliers.map(item=><option value={item.id} key={item.id}>{item.name}{item.backup_supplier?' · alternativo':''}</option>)}</select></label><label>Quantidade <small>{selected?.unit||'un'}</small><input aria-label="Quantidade" type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="Ex.: 5000"/></label><label>Valor dos itens <small>R$</small><input aria-label="Valor dos itens" type="number" min="0" step="0.01" value={total} onChange={e=>setTotal(e.target.value)} placeholder="0,00"/></label><label>Frete <small>R$</small><input aria-label="Frete" type="number" min="0" step="0.01" value={freight} onChange={e=>setFreight(e.target.value)}/></label><label>Tributos/outros <small>R$</small><input aria-label="Tributos/outros" type="number" min="0" step="0.01" value={tax} onChange={e=>setTax(e.target.value)}/></label>{!suppliers.length&&<div className="buy51-supplier-help wide"><span>Sem fornecedores cadastrados. Você pode registrar a compra mesmo assim.</span><a href="/?suppliers=1">Cadastrar fornecedores<ArrowRight/></a></div>}<div className="buy51-cost wide"><span><small>CUSTO POUSADO</small><b>{money(landed)}</b></span><span><small>POR 1.000 {selected?.unit||'un'}</small><b>{money(per1000)}</b></span></div><div className="buy51-confirm wide"><ClipboardCheck/><span><b>Confirmação com efeito real.</b><small>Ao confirmar, o núcleo soma esta quantidade ao estoque e atualiza a referência de custo usada nas fichas e no CMV. Nada é lançado antes deste clique.</small></span></div><button className="wide" disabled={busy||!selected}><Truck/>{busy?'Registrando entrada…':'Confirmar compra e dar entrada no estoque'}</button></form>:<div className="buy51-empty"><ShieldCheck/><b>Seu acesso é somente leitura.</b><span>Owner ou admin confirma compras porque a ação altera estoque e referência de custo.</span></div>}</section>
   </div>
   <section className="buy51-panel"><PanelHead step="PASSO 3" title="Histórico auditável" meta={`${rows.length} registros`}/>{rows.length?<div className="buy51-history"><div className="buy51-history-head"><span>Compra</span><span>Quantidade</span><span>Custo pousado</span><span>Variação</span></div>{rows.map(row=><HistoryRow key={row.id} row={row}/>)}</div>:<div className="buy51-empty"><History/><b>O histórico começa na primeira compra.</b><span>Registre valor, quantidade, frete e tributos para comparar custo real ao longo do tempo.</span></div>}</section>
   <footer className="buy51-footer"><ShieldCheck/><div><b>O 360 recomenda quantidade; você decide fornecedor e preço.</b><span>Preço estimado não é cotação. Custo pousado é valor dos itens + frete + tributos informados. O registro é operacional e não substitui escrituração contábil ou fiscal.</span></div><a href="/?suppliers=1">Fornecedores 360<ArrowRight/></a></footer>
  </section>
 </main>
}
function Kpi({label,value,note}:{label:string;value:string;note:string}){return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function PanelHead({step,title,meta}:{step:string;title:string;meta?:string}){return <header className="buy51-panel-head"><div><span>{step}</span><h2>{title}</h2></div>{meta&&<b>{meta}</b>}</header>}
function PlanRow({item,onPrepare}:{item:PlanItem;onPrepare:()=>void}){return <article className={`buy51-plan-row ${item.tone}`}><div className="buy51-plan-status">{item.tone==='critical'?<AlertTriangle/>:<ShoppingBasket/>}</div><div className="buy51-plan-main"><span>{item.tone==='critical'?'SEM ESTOQUE':item.tone==='warning'?'ABAIXO DO MÍNIMO':'ABAIXO DO ALVO'}</span><h3>{item.name}</h3><div className="buy51-stock-track"><i style={{width:`${Math.max(0,Math.min(100,item.reorder_target_milliunits?item.on_hand_milliunits/item.reorder_target_milliunits*100:0))}%`}}/><em style={{left:`${Math.max(0,Math.min(100,item.reorder_target_milliunits?item.par_level_milliunits/item.reorder_target_milliunits*100:0))}%`}}/></div><small>{qty(item.on_hand_milliunits,item.unit)} agora · mínimo {qty(item.par_level_milliunits,item.unit)} · alvo {qty(item.reorder_target_milliunits,item.unit)}</small></div><div className="buy51-plan-buy"><span><b>+{qty(item.suggested_purchase_milliunits,item.unit)}</b><small>{item.cost_confidence==='reference'?`≈ ${money(item.estimated_landed_cents)} ref.`:'cotação necessária'}</small></span><button onClick={onPrepare}>Preparar<ArrowRight/></button></div></article>}
function HistoryRow({row}:{row:PurchaseRow}){const change=Number(row.change_bps||0),tone=row.change_bps===null?'neutral':change>=500?'up':change<=-500?'down':'neutral';return <article className="buy51-history-row"><span><b>{row.ingredient_name}</b><small>{date(row.created_at)}{row.supplier_name?` · ${row.supplier_name}`:''}</small></span><span><b>{qty(row.quantity_milliunits,row.unit)}</b><small>entrada registrada</small></span><span><b>{money(row.landed_cents)}</b><small>{money(row.landed_per_1000_cents)} / 1.000 {row.unit}</small></span><span className={tone}>{tone==='up'?<TrendingUp/>:tone==='down'?<TrendingDown/>:null}<b>{pctBps(row.change_bps)}</b><small>vs. compra anterior</small></span></article>}
