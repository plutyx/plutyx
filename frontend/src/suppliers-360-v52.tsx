import React,{useEffect,useMemo,useState}from'react'
import{ArrowLeft,ArrowRight,Building2,CheckCircle2,ClipboardList,Clock3,PackageSearch,Phone,Plus,RefreshCcw,ShieldCheck,Star,Store,Truck,Users,WifiOff}from'lucide-react'
import{money,request}from'./app'
import{suppliersRequest}from'./suppliers-api-v52'

type Business={id:number;name:string;city?:string;role:string}
type Ingredient={id:number;name:string;unit:string}
type Supplier={id:number;name:string;cnpj:string;phone:string;backup_supplier:boolean;notes:string;purchase_count:number;ingredients_count:number;last_purchase_at:string|null;landed_total_cents:number}
type SupplierData={generated_at:string;summary:{suppliers_total:number;backup_suppliers:number;purchases_mapped:number;ingredients_covered:number};rows:Supplier[]}
type ComparisonRow={supplier_id:number;supplier_name:string;phone:string;backup_supplier:boolean;has_history:boolean;last_purchase_at:string|null;quantity_milliunits:number;landed_cents:number;landed_per_1000_cents:number|null;days_since:number|null;best_historical_reference:boolean}
type Comparison={generated_at:string;ingredient:{id:number;name:string;unit:string};summary:{suppliers_total:number;suppliers_with_history:number;best_historical_per_1000_cents:number|null};rows:ComparisonRow[];safety_note:string}

const date=(raw:string|null)=>{if(!raw)return'—';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'2-digit'}).format(new Date(raw))}catch{return raw}}
const wa=(phone:string)=>{const digits=String(phone||'').replace(/\D/g,'');if(!digits)return'';return digits.length===10||digits.length===11?`55${digits}`:digits}
const qty=(value=0,unit='un')=>`${Number(value||0).toLocaleString('pt-BR')} ${unit}`

export function Suppliers360Route(){
 const token=localStorage.getItem('c360_token')||''
 const[businesses,setBusinesses]=useState<Business[]>([]),[businessId,setBusinessId]=useState(0),[ingredients,setIngredients]=useState<Ingredient[]>([])
 const[data,setData]=useState<SupplierData|null>(null),[comparison,setComparison]=useState<Comparison|null>(null),[ingredientId,setIngredientId]=useState(0)
 const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const[name,setName]=useState(''),[cnpj,setCnpj]=useState(''),[phone,setPhone]=useState(''),[notes,setNotes]=useState(''),[backup,setBackup]=useState(false)
 const currentBusiness=businesses.find(item=>item.id===businessId),canEdit=['owner','admin'].includes(currentBusiness?.role||'')

 async function load(target=businessId){
  if(!token){window.location.replace('/');return}
  setLoading(true);setError('')
  try{
   let id=target
   if(!businesses.length){
    const me=await request('/me',{},token);const rows=(me.businesses||[])as Business[];setBusinesses(rows)
    const requested=Number(new URLSearchParams(location.search).get('business_id')||0)
    id=(requested&&rows.some(row=>row.id===requested))?requested:(id||Number(rows[0]?.id||0));if(id)setBusinessId(id)
   }
   if(!id){setData(null);setIngredients([]);setComparison(null);return}
   const[ingredientRows,supplierRows]=await Promise.all([request(`/businesses/${id}/ingredients`,{},token),suppliersRequest(`/businesses/${id}/suppliers`,{},token)])
   const active=(ingredientRows||[])as Ingredient[];setIngredients(active);setData(supplierRows as SupplierData)
   const requestedIngredient=Number(new URLSearchParams(location.search).get('ingredient_id')||0)
   const next=requestedIngredient&&active.some(row=>row.id===requestedIngredient)?requestedIngredient:ingredientId&&active.some(row=>row.id===ingredientId)?ingredientId:Number(active[0]?.id||0)
   setIngredientId(next)
   if(next){try{setComparison(await suppliersRequest(`/businesses/${id}/supplier-comparison?ingredient_id=${next}`,{},token)as Comparison)}catch{setComparison(null)}}else setComparison(null)
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar fornecedores.')}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])
 async function chooseIngredient(id:number){setIngredientId(id);setComparison(null);if(!id||!businessId)return;try{setComparison(await suppliersRequest(`/businesses/${businessId}/supplier-comparison?ingredient_id=${id}`,{},token)as Comparison)}catch(e){setError(e instanceof Error?e.message:'Não foi possível comparar fornecedores.')}}
 async function create(event:React.FormEvent){
  event.preventDefault();if(!canEdit||!businessId)return;setBusy(true);setError('');setNotice('')
  try{
   await suppliersRequest(`/businesses/${businessId}/suppliers`,{method:'POST',body:JSON.stringify({name,cnpj,phone,notes,backup_supplier:backup})},token)
   setName('');setCnpj('');setPhone('');setNotes('');setBackup(false);setNotice('Fornecedor salvo. Use compras reais para construir a comparação histórica.');await load(businessId)
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o fornecedor.')}finally{setBusy(false)}
 }
 async function toggleBackup(row:Supplier){
  if(!canEdit)return;setBusy(true);setError('');setNotice('')
  try{await suppliersRequest(`/businesses/${businessId}/suppliers/${row.id}`,{method:'PATCH',body:JSON.stringify({backup_supplier:!row.backup_supplier})},token);setNotice(!row.backup_supplier?`${row.name} marcado como fornecedor alternativo.`:`${row.name} deixou de ser fornecedor alternativo.`);await load(businessId)}catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o fornecedor.')}finally{setBusy(false)}
 }
 const rows=data?.rows||[],withHistory=useMemo(()=>rows.filter(row=>row.purchase_count>0),[rows])
 if(loading)return <main className="sup52-shell sup52-center"><div className="sup52-loader"><Truck/>ORGANIZANDO FORNECEDORES E HISTÓRICO</div></main>
 if(!data)return <main className="sup52-shell sup52-center"><section className="sup52-error"><WifiOff/><h1>Fornecedores 360 indisponível.</h1><p>{error||'Crie uma operação e tente novamente.'}</p><a href="/">Voltar</a></section></main>
 return <main className="sup52-shell">
  <header className="sup52-top"><a href="/"><ArrowLeft/>Operação</a><b><Building2/> FORNECEDORES <span>360</span></b><div>{businesses.length>1&&<select aria-label="Operação" value={businessId} onChange={e=>{const id=Number(e.target.value);setBusinessId(id);void load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button aria-label="Atualizar" onClick={()=>void load(businessId)}><RefreshCcw/></button></div></header>
  <section className="sup52-page">
   <header className="sup52-hero"><div><span>BASE DE FORNECEDORES · HISTÓRICO REAL · PLANO B</span><h1>Saiba com quem comprar antes de faltar.</h1><p>Cadastre fornecedores, mantenha uma alternativa e compare o último custo pousado por ingrediente. O 360 usa apenas compras registradas — não inventa cotação nem disponibilidade.</p></div><aside className={data.summary.backup_suppliers?'ready':''}><ShieldCheck/><div><b>{data.summary.backup_suppliers}</b><span>fornecedores alternativos</span></div></aside></header>
   {notice&&<div className="sup52-banner ok"><CheckCircle2/>{notice}</div>}{error&&<div className="sup52-banner bad"><WifiOff/>{error}</div>}
   <div className="sup52-kpis"><Kpi label="Fornecedores" value={String(data.summary.suppliers_total)} note={`${withHistory.length} com compra registrada`}/><Kpi label="Alternativos" value={String(data.summary.backup_suppliers)} note="plano B operacional"/><Kpi label="Ingredientes cobertos" value={String(data.summary.ingredients_covered)} note="com histórico mapeado"/><Kpi label="Compras vinculadas" value={String(data.summary.purchases_mapped)} note="base para comparação"/></div>
   <div className="sup52-grid">
    <section className="sup52-panel"><PanelHead step="PASSO 1" title="Sua rede de fornecimento" meta={`${rows.length} cadastrados`}/>{rows.length?<div className="sup52-suppliers">{rows.map(row=><SupplierCard key={row.id} row={row} canEdit={canEdit} busy={busy} onToggle={()=>void toggleBackup(row)}/>)}</div>:<div className="sup52-empty"><Store/><b>Cadastre o primeiro fornecedor.</b><span>Comece pelo fornecedor principal de insumos e depois adicione uma alternativa para os itens críticos.</span></div>}</section>
    <section className="sup52-panel sup52-sticky"><PanelHead step="PASSO 2" title="Adicionar fornecedor" meta={canEdit?'owner/admin':'somente leitura'}/>{canEdit?<form className="sup52-form" onSubmit={create}><label className="wide">Nome<input aria-label="Nome do fornecedor" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Atacadão do Bairro" required minLength={2}/></label><label>CNPJ <small>opcional</small><input aria-label="CNPJ" value={cnpj} onChange={e=>setCnpj(e.target.value)} placeholder="00.000.000/0000-00"/></label><label>WhatsApp/telefone <small>opcional</small><input aria-label="Telefone" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="11 99999-9999"/></label><label className="wide">Notas <small>condição, dia de entrega, pedido mínimo</small><textarea aria-label="Notas" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: entrega ter/qui; confirmar pedido até 14h"/></label><label className="sup52-check wide"><input type="checkbox" checked={backup} onChange={e=>setBackup(e.target.checked)}/><span><b>É fornecedor alternativo</b><small>Marque quando ele puder substituir seu fornecedor principal em uma falta.</small></span></label><button className="wide" disabled={busy}><Plus/>{busy?'Salvando…':'Salvar fornecedor'}</button></form>:<div className="sup52-empty"><ShieldCheck/><b>Seu acesso é somente leitura.</b><span>Owner ou admin mantém a base de fornecedores.</span></div>}</section>
   </div>
   <section className="sup52-panel"><PanelHead step="PASSO 3" title="Comparar referência histórica" meta={comparison?`${comparison.summary.suppliers_with_history} comparáveis`:'selecione um ingrediente'}/><div className="sup52-compare-toolbar"><label>Ingrediente<select aria-label="Ingrediente para comparar" value={ingredientId} onChange={e=>void chooseIngredient(Number(e.target.value))}><option value={0}>Selecione</option>{ingredients.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><a href={`/?purchases=1${ingredientId?`&ingredient_id=${ingredientId}`:''}`}><PackageSearch/>Abrir Compras 360<ArrowRight/></a></div>{comparison?<><div className="sup52-compare-head"><div><small>REFERÊNCIA MAIS BAIXA REGISTRADA</small><b>{comparison.summary.best_historical_per_1000_cents===null?'sem histórico':money(comparison.summary.best_historical_per_1000_cents)}</b><span>por 1.000 {comparison.ingredient.unit} · não é cotação atual</span></div><ClipboardList/></div><div className="sup52-comparison">{comparison.rows.map(row=><ComparisonCard key={row.supplier_id} row={row} unit={comparison.ingredient.unit}/>)}</div><p className="sup52-note">{comparison.safety_note}</p></>:<div className="sup52-empty"><PackageSearch/><b>Escolha um ingrediente para comparar.</b><span>O sistema normaliza o custo pousado da compra mais recente de cada fornecedor para 1.000 unidades da medida cadastrada.</span></div>}</section>
   <footer className="sup52-footer"><ShieldCheck/><div><b>Preço histórico é memória operacional, não promessa.</b><span>Antes de comprar, confirme cotação, disponibilidade, qualidade, prazo, frete, impostos, pedido mínimo e condições de pagamento.</span></div><a href={`/?purchases=1${ingredientId?`&ingredient_id=${ingredientId}`:''}`}>Planejar compra<ArrowRight/></a></footer>
  </section>
 </main>
}
function Kpi({label,value,note}:{label:string;value:string;note:string}){return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function PanelHead({step,title,meta}:{step:string;title:string;meta?:string}){return <header className="sup52-panel-head"><div><span>{step}</span><h2>{title}</h2></div>{meta&&<b>{meta}</b>}</header>}
function SupplierCard({row,canEdit,busy,onToggle}:{row:Supplier;canEdit:boolean;busy:boolean;onToggle:()=>void}){const phone=wa(row.phone);return <article className={`sup52-card ${row.backup_supplier?'backup':''}`}><header><span className="sup52-card-icon">{row.backup_supplier?<Star/>:<Building2/>}</span><div><small>{row.backup_supplier?'ALTERNATIVO':'FORNECEDOR'}</small><h3>{row.name}</h3></div></header><p>{row.notes||'Sem observações operacionais cadastradas.'}</p><div className="sup52-card-metrics"><span><b>{row.purchase_count}</b><small>compras</small></span><span><b>{row.ingredients_count}</b><small>ingredientes</small></span><span><b>{date(row.last_purchase_at)}</b><small>última compra</small></span></div><footer>{phone?<a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><Phone/>WhatsApp</a>:<span className="sup52-muted"><Phone/>sem telefone</span>}{canEdit&&<button type="button" disabled={busy} onClick={onToggle}><Star/>{row.backup_supplier?'Remover plano B':'Marcar plano B'}</button>}</footer></article>}
function ComparisonCard({row,unit}:{row:ComparisonRow;unit:string}){const phone=wa(row.phone);return <article className={`sup52-compare-row ${row.best_historical_reference?'best':''}`}><div className="sup52-compare-status">{row.best_historical_reference?<Star/>:row.backup_supplier?<ShieldCheck/>:<Building2/>}</div><div><small>{row.best_historical_reference?'MENOR REFERÊNCIA HISTÓRICA':row.backup_supplier?'ALTERNATIVO':'FORNECEDOR'}</small><h3>{row.supplier_name}</h3><span>{row.has_history?`${date(row.last_purchase_at)} · ${qty(row.quantity_milliunits,unit)}`:'ainda sem compra deste ingrediente'}</span></div><div className="sup52-compare-price"><b>{row.landed_per_1000_cents===null?'—':money(row.landed_per_1000_cents)}</b><small>{row.has_history?`/ 1.000 ${unit}`:'sem referência'}</small>{row.days_since!==null&&<em><Clock3/>{row.days_since} dias</em>}</div>{phone?<a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label={`Falar com ${row.supplier_name}`}><Phone/></a>:<span className="sup52-no-phone"><Users/></span>}</article>}
