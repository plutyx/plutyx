import React,{useEffect,useMemo,useState}from'react'
import{AlertTriangle,ArrowLeft,ArrowRight,CheckCircle2,ClipboardCheck,Coins,PackageCheck,RefreshCcw,Scale,ShieldCheck,Sparkles,TriangleAlert,WifiOff}from'lucide-react'
import{money,request}from'./app'

type Business={id:number;name:string;city?:string}
type Ingredient={id:number;name:string;unit:string;on_hand_milliunits:number;par_level_milliunits:number;reorder_target_milliunits:number;version:number}
type SmartRow={ingredient_id:number;name:string;unit:string;status:string;count_count?:number;last_count_at?:string|null;current_on_hand_milliunits?:number;message?:string;from?:string;to?:string;interval_days?:number;opening_milliunits?:number;purchased_milliunits?:number;recorded_loss_milliunits?:number;physical_closing_milliunits?:number;observed_usage_milliunits?:number;theoretical_usage_milliunits?:number;unexplained_usage_milliunits?:number;observed_cmv_cents?:number;theoretical_cmv_cents?:number;unexplained_value_cents?:number;variance_ratio?:number;signal?:string;severity?:string;suggested_action?:string;confidence?:string;cost_basis?:string}
type SmartCMV={generated_at:string;method:string;summary:{ingredients_total:number;ingredients_ready:number;coverage:number;critical:number;warning:number;observed_cmv_cents:number;theoretical_cmv_cents:number;unexplained_value_cents:number};headline:{tone:string;title:string;detail:string;ingredient_id:number|null};ingredients:SmartRow[];accounting_note:string;safety_note:string}

function pct(value=0){return `${(Number(value||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:0})}%`}
function date(raw?:string){if(!raw)return'—';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(raw))}catch{return raw}}
function qty(value=0,unit='un'){return `${Number(value||0).toLocaleString('pt-BR')} ${unit}`}

export function SmartCMVRoute(){
 const token=localStorage.getItem('c360_token')||''
 const[businesses,setBusinesses]=useState<Business[]>([]),[businessId,setBusinessId]=useState(0),[ingredients,setIngredients]=useState<Ingredient[]>([]),[data,setData]=useState<SmartCMV|null>(null)
 const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const[selectedId,setSelectedId]=useState(0),[countValue,setCountValue]=useState(''),[note,setNote]=useState('')
 async function load(target=businessId){
  if(!token){window.location.replace('/');return}setLoading(true);setError('')
  try{
   let id=target;if(!businesses.length){const me=await request('/me',{},token);const rows=(me.businesses||[]) as Business[];setBusinesses(rows);const requested=Number(new URLSearchParams(location.search).get('business_id')||0);id=(requested&&rows.some(x=>x.id===requested))?requested:(id||Number(rows[0]?.id||0));if(id)setBusinessId(id)}
   if(!id){setData(null);setIngredients([]);return}
   const[ingredientRows,smart]=await Promise.all([request(`/businesses/${id}/ingredients`,{},token),request(`/businesses/${id}/smart-cmv`,{},token)])
   const active=(ingredientRows||[]) as Ingredient[];setIngredients(active);setData(smart as SmartCMV)
   const next=(smart.ingredients as SmartRow[]).find(x=>x.status!=='ready')||smart.ingredients[0]
   if(next){setSelectedId(Number(next.ingredient_id));const ingredient=active.find(x=>x.id===Number(next.ingredient_id));setCountValue(String(ingredient?.on_hand_milliunits??next.current_on_hand_milliunits??0))}
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível montar o CMV inteligente.')}finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])
 useEffect(()=>{const ingredient=ingredients.find(x=>x.id===selectedId);if(ingredient)setCountValue(String(ingredient.on_hand_milliunits||0))},[selectedId])
 const selected=ingredients.find(x=>x.id===selectedId)
 const selectedSmart=data?.ingredients.find(x=>x.ingredient_id===selectedId)
 const ready=useMemo(()=>data?.ingredients.filter(x=>x.status==='ready')||[],[data])
 async function saveCount(e:React.FormEvent){
  e.preventDefault();if(!selected||!businessId)return;const value=Number(countValue);if(!Number.isInteger(value)||value<0){setError('Informe uma quantidade inteira igual ou maior que zero.');return}
  setBusy(true);setError('');setNotice('')
  try{await request(`/businesses/${businessId}/inventory/counts`,{method:'POST',body:JSON.stringify({ingredient_id:selected.id,counted_milliunits:value,note:note.trim()})},token);setNotice(`Contagem de ${selected.name} confirmada. O estoque oficial foi atualizado para ${value} ${selected.unit}.`);setNote('');await load(businessId)}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a contagem.')}finally{setBusy(false)}
 }
 if(loading)return <main className="cmv50-shell cmv50-center"><div className="cmv50-loader"><Scale/>CRUZANDO CONTAGENS, COMPRAS E FICHAS</div></main>
 if(!data)return <main className="cmv50-shell cmv50-center"><section className="cmv50-error"><WifiOff/><h1>CMV inteligente indisponível.</h1><p>{error||'Crie uma operação e tente novamente.'}</p><a href="/">Voltar</a></section></main>
 const tone=data.headline.tone||'neutral'
 return <main className="cmv50-shell">
  <header className="cmv50-top"><a href="/"><ArrowLeft/>Operação</a><b><Scale/> CMV <span>360</span></b><div>{businesses.length>1&&<select aria-label="Operação" value={businessId} onChange={e=>{const id=Number(e.target.value);setBusinessId(id);void load(id)}}>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}<button onClick={()=>void load(businessId)} aria-label="Atualizar"><RefreshCcw/></button></div></header>
  <section className="cmv50-page">
   <header className="cmv50-hero"><div><span>CMV OBSERVADO · SEM PLANILHA MÁGICA</span><h1>Conte o estoque. O 360 explica a diferença.</h1><p>O sistema cruza duas contagens físicas, compras, perdas registradas e consumo teórico das fichas. Assim você vê onde o uso real está escapando — sem chamar estimativa de contabilidade.</p></div><aside><ShieldCheck/><div><b>{data.summary.ingredients_ready}/{data.summary.ingredients_total}</b><span>ingredientes comparáveis</span></div></aside></header>
   <article className={`cmv50-headline ${tone}`}><div>{tone==='critical'?<TriangleAlert/>:tone==='warning'?<AlertTriangle/>:<Sparkles/>}</div><span><small>PRIMEIRA LEITURA</small><b>{data.headline.title}</b><p>{data.headline.detail}</p></span>{data.headline.ingredient_id&&<button onClick={()=>{setSelectedId(Number(data.headline.ingredient_id));document.getElementById('cmv50-count')?.scrollIntoView({behavior:'smooth'})}}>Conferir ingrediente<ArrowRight/></button>}</article>
   {notice&&<div className="cmv50-banner ok"><CheckCircle2/>{notice}</div>}{error&&<div className="cmv50-banner bad"><WifiOff/>{error}</div>}
   <div className="cmv50-kpis"><Kpi label="Cobertura" value={pct(data.summary.coverage)} note="com duas contagens"/><Kpi label="CMV observado*" value={money(data.summary.observed_cmv_cents)} note="somente itens comparáveis"/><Kpi label="CMV teórico*" value={money(data.summary.theoretical_cmv_cents)} note="fichas e pedidos concluídos"/><Kpi label="Diferença sem explicação*" value={money(data.summary.unexplained_value_cents)} note={`${data.summary.critical} crítico · ${data.summary.warning} atenção`} warn={Math.abs(data.summary.unexplained_value_cents)>0}/></div>
   <div className="cmv50-grid">
    <section className="cmv50-panel" id="cmv50-count"><PanelHead step="PASSO 1" title="Contagem física guiada" meta={selectedSmart?.status==='ready'?'já comparável':selectedSmart?.count_count===1?'falta 1 contagem':'comece agora'}/><p className="cmv50-lead">Escolha o ingrediente, conte o que existe de verdade e confirme. A confirmação atualiza o estoque oficial; por isso o 360 nunca faz isso sozinho.</p>
     {ingredients.length?<form className="cmv50-count-form" onSubmit={saveCount}><label>Ingrediente<select value={selectedId} onChange={e=>setSelectedId(Number(e.target.value))}>{ingredients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Quantidade física <small>{selected?.unit}</small><input inputMode="numeric" type="number" min="0" step="1" value={countValue} onChange={e=>setCountValue(e.target.value)}/></label><label className="wide">Observação <small>opcional</small><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: fechamento de domingo, freezer 1"/></label><div className="cmv50-confirm"><ClipboardCheck/><span><b>Esta ação altera o estoque.</b><small>O valor contado passa a ser a quantidade oficial do ingrediente. A auditoria registra antes, depois, usuário e horário.</small></span></div><button disabled={busy}><PackageCheck/>{busy?'Confirmando…':'Confirmar contagem e atualizar estoque'}</button></form>:<div className="cmv50-empty">Cadastre ingredientes para iniciar a contagem.</div>}
    </section>
    <section className="cmv50-panel"><PanelHead step="PASSO 2" title="Quando a comparação fica confiável"/><div className="cmv50-rules"><Rule n="01" title="Duas contagens" text="Uma abre o período; a próxima fecha. O intervalo precisa representar uma operação real."/><Rule n="02" title="Compras registradas" text="O custo usa compras do período quando existem; senão usa o último custo conhecido e reduz a confiança."/><Rule n="03" title="Pedidos concluídos" text="Consumo teórico usa snapshots da ficha capturados na conclusão, evitando reescrever o passado quando a receita muda."/><Rule n="04" title="Perdas separadas" text="Perda já registrada é retirada da diferença para não ser acusada de novo como desperdício inexplicado."/></div></section>
   </div>
   <section className="cmv50-panel"><PanelHead step="PASSO 3" title="Diferença física × teórica" meta={`${ready.length} comparáveis`}/>{ready.length?<div className="cmv50-variance">{ready.map(row=><VarianceRow key={row.ingredient_id} row={row}/>)}</div>:<div className="cmv50-empty"><Scale/><b>A comparação aparece depois da segunda contagem.</b><span>Não há dado suficiente para inventar um “CMV real”. Continue registrando normalmente.</span></div>}</section>
   <footer className="cmv50-note"><Coins/><div><b>* Visão operacional, não DRE contábil.</b><span>{data.accounting_note} Intervalos podem ser diferentes por ingrediente, então os totais servem para diagnóstico operacional e não para fechamento fiscal.</span></div><a href="/?cash=1">Abrir Caixa<ArrowRight/></a></footer>
  </section>
 </main>
}
function Kpi({label,value,note,warn=false}:{label:string;value:string;note:string;warn?:boolean}){return <article className={warn?'warn':''}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function PanelHead({step,title,meta}:{step:string;title:string;meta?:string}){return <header className="cmv50-panel-head"><div><span>{step}</span><h2>{title}</h2></div>{meta&&<b>{meta}</b>}</header>}
function Rule({n,title,text}:{n:string;title:string;text:string}){return <article><span>{n}</span><div><b>{title}</b><p>{text}</p></div></article>}
function VarianceRow({row}:{row:SmartRow}){const diff=Number(row.unexplained_usage_milliunits||0);return <article className={`cmv50-var ${row.severity||'stable'}`}><div className="cmv50-var-status">{row.severity==='critical'?<TriangleAlert/>:row.severity==='warning'?<AlertTriangle/>:<CheckCircle2/>}</div><div className="cmv50-var-main"><span>{date(row.from)} → {date(row.to)} · confiança {row.confidence||'baixa'}</span><h3>{row.name}</h3><p>{row.suggested_action}</p></div><div className="cmv50-var-metrics"><span><b>{qty(row.observed_usage_milliunits,row.unit)}</b><small>uso observado</small></span><span><b>{qty(row.theoretical_usage_milliunits,row.unit)}</b><small>uso teórico</small></span><span className={diff>0?'bad':diff<0?'warn':''}><b>{diff>0?'+':''}{qty(diff,row.unit)}</b><small>sem explicação</small></span><span><b>{money(Number(row.unexplained_value_cents||0))}</b><small>valor estimado</small></span></div></article>}
