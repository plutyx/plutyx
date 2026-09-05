import React,{useEffect,useMemo,useState}from'react'
import{ArrowLeft,Boxes,ChefHat,Clock3,Layers3,PackageCheck,RefreshCcw,ShoppingCart,TriangleAlert,UtensilsCrossed}from'lucide-react'
import{request,type Ingredient,type KdsOrder}from'./app'

type Business={id:number;name:string;city:string;role:string}
type PrepGroup={product_id:number;name:string;quantity:number;orderIds:number[];oldest:number;delayed:boolean;statuses:Record<string,number>}
type RecipeView={product_id:number;product_name:string;items:{ingredient_id:number;name:string;qty_used_milliunits:number;on_hand_milliunits:number}[]}
type ComponentProduct={product_id:number;name:string;units:number;required:number}
type ComponentGroup={ingredient_id:number;name:string;unit:string;required:number;onHand:number;projected:number;par:number;target:number;shortage:number;suggestedPurchase:number;status:'shortage'|'below_par'|'covered';orderIds:number[];products:ComponentProduct[]}
const labels:Record<string,string>={new:'novo',confirmed:'confirmado',production:'em preparo'}

export function KitchenBatchRoute(){
  const token=localStorage.getItem('c360_token')||''
  const[businesses,setBusinesses]=useState<Business[]>([])
  const[businessId,setBusinessId]=useState(0)
  const[orders,setOrders]=useState<KdsOrder[]>([])
  const[ingredients,setIngredients]=useState<Ingredient[]>([])
  const[recipes,setRecipes]=useState<RecipeView[]>([])
  const[view,setView]=useState<'products'|'components'>('products')
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[lastUpdate,setLastUpdate]=useState<Date|null>(null)

  async function load(targetId=businessId){
    if(!token){setLoading(false);return}
    try{
      let bid=targetId
      if(!businesses.length){
        const me=await request('/me',{},token);const rows=(me.businesses||[]) as Business[]
        setBusinesses(rows);bid=bid||Number(rows[0]?.id||0);if(bid)setBusinessId(bid)
      }
      if(!bid)return
      const[data,stock]=await Promise.all([
        request(`/businesses/${bid}/kds`,{},token),
        request(`/businesses/${bid}/ingredients`,{},token),
      ])
      const liveOrders=(data.orders||[]) as KdsOrder[]
      const productIds=[...new Set(liveOrders.filter(o=>['new','confirmed','production'].includes(o.status)).flatMap(o=>(o.items||[]).map(i=>i.product_id)))]
      const recipeRows=await Promise.all(productIds.map(async id=>{
        try{return await request(`/businesses/${bid}/products/${id}/recipe`,{},token) as RecipeView}
        catch{return {product_id:id,product_name:'',items:[]} as RecipeView}
      }))
      setOrders(liveOrders);setIngredients(stock||[]);setRecipes(recipeRows);setLastUpdate(new Date());setError('')
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o preparo')}
    finally{setLoading(false)}
  }

  useEffect(()=>{load()},[])
  useEffect(()=>{
    if(!token||!businessId)return
    const id=window.setInterval(()=>load(businessId),8000)
    return()=>window.clearInterval(id)
  },[businessId,token])

  const prepOrders=useMemo(()=>orders.filter(o=>['new','confirmed','production'].includes(o.status)),[orders])
  const groups=useMemo(()=>{
    const map=new Map<number,PrepGroup>()
    for(const order of prepOrders){
      for(const item of order.items||[]){
        const current=map.get(item.product_id)||{product_id:item.product_id,name:item.name,quantity:0,orderIds:[],oldest:0,delayed:false,statuses:{}}
        current.quantity+=Number(item.quantity||0)
        if(!current.orderIds.includes(order.id))current.orderIds.push(order.id)
        current.oldest=Math.max(current.oldest,Number(order.age_minutes||0))
        current.delayed=current.delayed||Boolean(order.delayed)
        current.statuses[order.status]=(current.statuses[order.status]||0)+Number(item.quantity||0)
        map.set(item.product_id,current)
      }
    }
    return [...map.values()].sort((a,b)=>Number(b.delayed)-Number(a.delayed)||b.oldest-a.oldest||b.quantity-a.quantity||a.name.localeCompare(b.name))
  },[prepOrders])

  const recipeMap=useMemo(()=>new Map(recipes.map(r=>[r.product_id,r])),[recipes])
  const ingredientMap=useMemo(()=>new Map(ingredients.map(i=>[i.id,i])),[ingredients])
  const componentData=useMemo(()=>{
    const map=new Map<number,{ingredient_id:number;name:string;unit:string;required:number;onHand:number;par:number;target:number;orderIds:Set<number>;products:Map<number,ComponentProduct>}>()
    const unmapped:PrepGroup[]=[]
    let mappedUnits=0
    for(const group of groups){
      const recipe=recipeMap.get(group.product_id)
      if(!recipe?.items?.length){unmapped.push(group);continue}
      mappedUnits+=group.quantity
      for(const item of recipe.items){
        const stock=ingredientMap.get(item.ingredient_id)
        const required=Number(item.qty_used_milliunits||0)*group.quantity
        const current=map.get(item.ingredient_id)||{
          ingredient_id:item.ingredient_id,name:item.name,unit:stock?.unit||'un',required:0,
          onHand:Number(stock?.on_hand_milliunits??item.on_hand_milliunits??0),par:Number(stock?.par_level_milliunits||0),target:Number(stock?.reorder_target_milliunits||0),
          orderIds:new Set<number>(),products:new Map<number,ComponentProduct>(),
        }
        current.required+=required
        group.orderIds.forEach(id=>current.orderIds.add(id))
        const product=current.products.get(group.product_id)||{product_id:group.product_id,name:group.name,units:0,required:0}
        product.units+=group.quantity;product.required+=required;current.products.set(group.product_id,product)
        map.set(item.ingredient_id,current)
      }
    }
    const components:ComponentGroup[]=[...map.values()].map(c=>{
      const projected=c.onHand-c.required
      const shortage=Math.max(0,-projected)
      const belowPar=c.par>0&&projected<c.par
      const suggestedPurchase=c.target>0&&projected<c.target?Math.max(0,c.target-projected):shortage
      const status:ComponentGroup['status']=shortage?'shortage':belowPar?'below_par':'covered'
      return{ingredient_id:c.ingredient_id,name:c.name,unit:c.unit,required:c.required,onHand:c.onHand,projected,par:c.par,target:c.target,shortage,suggestedPurchase,status,orderIds:[...c.orderIds].sort((a,b)=>a-b),products:[...c.products.values()].sort((a,b)=>b.required-a.required||a.name.localeCompare(b.name))}
    }).sort((a,b)=>severity(a.status)-severity(b.status)||b.required-a.required||a.name.localeCompare(b.name))
    return{components,unmapped,mappedUnits}
  },[groups,recipeMap,ingredientMap])

  const prepUnits=groups.reduce((a,g)=>a+g.quantity,0)
  const delayed=prepOrders.filter(o=>o.delayed).length
  const delivery=orders.filter(o=>o.status==='awaiting_delivery').length
  const shortages=componentData.components.filter(c=>c.status==='shortage').length
  const belowPar=componentData.components.filter(c=>c.status==='below_par').length
  const coverage=prepUnits?Math.round(componentData.mappedUnits/prepUnits*100):100
  const currentBusiness=businesses.find(x=>x.id===businessId)

  if(!token)return <main className="batch-shell center"><div className="batch-empty"><ChefHat/><h1>Entre na operação primeiro.</h1><p>O modo cozinha usa a mesma sessão segura do Cozinha 360.</p><a href="/">Entrar</a></div></main>
  if(loading)return <main className="batch-shell center"><div className="batch-loader"><ChefHat/>PREPARANDO MODO COZINHA</div></main>

  return <main className="batch-shell">
    <header className="batch-topbar"><a href="/"><ArrowLeft size={17}/> Voltar à operação</a><b><ChefHat size={19}/> COZINHA 360 <span>INTELLIGENCE</span></b><div>{businesses.length>1&&<select value={businessId} onChange={async e=>{const id=Number(e.target.value);setBusinessId(id);await load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button onClick={()=>load()} title="Atualizar agora"><RefreshCcw size={17}/></button></div></header>
    <section className="batch-page">
      <div className="batch-hero"><div><span>MODO COZINHA · {currentBusiness?.name||'OPERAÇÃO'}</span><h1>Produção agrupada.</h1><p>Alterne entre o que venderam e os <b>componentes reais das fichas técnicas</b>. A projeção cruza a fila atual com o estoque sem dar baixa antecipada.</p></div><div className="batch-live"><i></i><span>Atualização automática</span><small>{lastUpdate?lastUpdate.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'} · 8 s</small></div></div>
      {error&&<div className="batch-error">{error}</div>}
      <div className="batch-metrics"><Metric icon={<UtensilsCrossed/>} label="Unidades a preparar" value={prepUnits}/><Metric icon={<Layers3/>} label="Produtos agrupados" value={groups.length}/><Metric icon={<Boxes/>} label="Componentes necessários" value={componentData.components.length}/><Metric icon={<TriangleAlert/>} label="Faltas de estoque" value={shortages} danger={shortages>0}/></div>
      <div className="batch-command-row"><div className="batch-view-switch" role="tablist" aria-label="Agrupamento da cozinha"><button role="tab" aria-selected={view==='products'} className={view==='products'?'active':''} onClick={()=>setView('products')}><UtensilsCrossed/>Por produto</button><button role="tab" aria-selected={view==='components'} className={view==='components'?'active':''} onClick={()=>setView('components')}><Boxes/>Por componente</button></div><div className={`batch-coverage ${coverage<100?'warn':''}`}><PackageCheck/><span><b>{coverage}%</b> da fila com ficha técnica</span></div></div>
      <div className="batch-strip"><span><b>{delivery}</b> aguardando entrega</span><span><b>{prepOrders.length}</b> pedidos em preparo</span>{view==='components'&&<><span><b>{belowPar}</b> abaixo do mínimo após a fila</span><small>Previsão de consumo: a baixa real continua ocorrendo no encerramento do pedido.</small></>}{view==='products'&&<small>Produto agrupado por quantidade, status e idade do pedido mais antigo.</small>}</div>

      {view==='products'&&(groups.length?<div className="batch-grid">{groups.map(group=><article className={`batch-card ${group.delayed?'late':''}`} key={group.product_id}>
        <div className="batch-card-head"><div className="batch-qty"><strong>{group.quantity}</strong><span>un</span></div>{group.delayed&&<span className="batch-late"><TriangleAlert size={14}/> ATRASO</span>}</div>
        <h2>{group.name}</h2>
        <div className="batch-statuses">{Object.entries(group.statuses).map(([statusName,qtyValue])=><span key={statusName}>{qtyValue} {labels[statusName]||statusName}</span>)}</div>
        <div className="batch-orders"><span>Pedidos</span><div>{group.orderIds.map(id=><b key={id}>#{id}</b>)}</div></div>
        <footer><span>mais antigo</span><b>{group.oldest} min</b></footer>
      </article>)}</div>:<Empty/>)}

      {view==='components'&&<>
        {componentData.unmapped.length>0&&<div className="batch-recipe-warning"><TriangleAlert/><div><b>{componentData.unmapped.length} produto(s) sem ficha técnica completa</b><span>{componentData.unmapped.map(g=>`${g.quantity}× ${g.name}`).join(' · ')}. Esses itens não entram no cálculo de componentes.</span></div><a href="/#produtos">Completar fichas</a></div>}
        {componentData.components.length?<div className="component-grid">{componentData.components.map(component=><article className={`component-card ${component.status}`} key={component.ingredient_id}>
          <header><div><span>COMPONENTE</span><h2>{component.name}</h2></div><Status state={component.status}/></header>
          <div className="component-need"><div><span>Preparar / separar</span><strong>{qty(component.required,component.unit)}</strong></div><div><span>Em estoque</span><b>{qty(component.onHand,component.unit)}</b></div><div><span>Após esta fila</span><b className={component.projected<0?'negative':''}>{qty(component.projected,component.unit)}</b></div></div>
          {component.status==='shortage'&&<div className="component-alert"><TriangleAlert/><span>Faltam <b>{qty(component.shortage,component.unit)}</b> para cobrir a fila atual.</span></div>}
          {component.status==='below_par'&&<div className="component-alert warn"><ShoppingCart/><span>A fila cabe, mas o saldo cai abaixo do mínimo de <b>{qty(component.par,component.unit)}</b>.</span></div>}
          {component.suggestedPurchase>0&&<div className="component-buy"><span>Sugestão até o alvo</span><b>{qty(component.suggestedPurchase,component.unit)}</b></div>}
          <div className="component-products"><span>Vem de</span>{component.products.map(p=><div key={p.product_id}><b>{p.units}× {p.name}</b><small>{qty(p.required,component.unit)}</small></div>)}</div>
          <footer><span>Pedidos</span><div>{component.orderIds.map(id=><b key={id}>#{id}</b>)}</div></footer>
        </article>)}</div>:<Empty components/>}
      </>}
    </section>
  </main>
}

function severity(status:ComponentGroup['status']){return status==='shortage'?0:status==='below_par'?1:2}
function qty(value:number,unit:string){return `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value)} ${unit}`}
function Status({state}:{state:ComponentGroup['status']}){return <span className={`component-status ${state}`}>{state==='shortage'?'FALTA':state==='below_par'?'ATENÇÃO':'COBERTO'}</span>}
function Empty({components=false}:{components?:boolean}){return <div className="batch-empty inline"><UtensilsCrossed/><h2>{components?'Nenhum componente calculável agora.':'Nada para agrupar agora.'}</h2><p>{components?'Cadastre fichas técnicas nos produtos da fila para transformar pedidos em uma lista de preparação.':'Quando pedidos novos entrarem, as quantidades aparecem aqui automaticamente.'}</p></div>}
function Metric({icon,label,value,danger=false}:{icon:React.ReactNode;label:string;value:number;danger?:boolean}){return <article className={`batch-metric ${danger?'danger':''}`}><i>{icon}</i><div><strong>{value}</strong><span>{label}</span></div></article>}
