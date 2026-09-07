import React,{useEffect,useState}from'react'
import{AlertTriangle,CheckCircle2,CloudOff,CloudUpload,RefreshCcw,Trash2,Wifi,WifiOff,X}from'lucide-react'
import{discardOfflineOrder,flushOfflineOrders,queueEventName,readOfflineQueue,retryOfflineOrder,type OfflineQuickOrder}from'./offline-queue-v50'
import{money}from'./app'
import{OperatorExperienceLayer}from'./operator-experience-v60'
import'./operator-experience-v60.css'

function when(raw:string){try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(raw))}catch{return raw}}

export function OfflineQueueStatus(){
 const token=localStorage.getItem('c360_token')||''
 const[online,setOnline]=useState(()=>navigator.onLine),[items,setItems]=useState<OfflineQuickOrder[]>(()=>readOfflineQueue()),[open,setOpen]=useState(false),[syncing,setSyncing]=useState(false),[notice,setNotice]=useState('')
 function refresh(){setOnline(navigator.onLine);setItems(readOfflineQueue())}
 async function sync(){if(!token||!navigator.onLine||syncing)return;setSyncing(true);setNotice('');try{const r=await flushOfflineOrders(token);refresh();if(r.synced)setNotice(`${r.synced} pedido${r.synced===1?'':'s'} sincronizado${r.synced===1?'':'s'} com o servidor.`);else if(r.auth_required)setNotice('Entre novamente para sincronizar os pedidos deste dispositivo.');else if(r.stopped_reason)setNotice(r.stopped_reason);else setNotice('Fila já está sincronizada.')}finally{setSyncing(false)}}
 useEffect(()=>{
  const onOnline=()=>{refresh();void sync()};const onOffline=()=>refresh();const onQueue=()=>refresh();const onOpen=()=>{refresh();setOpen(true)}
  window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);window.addEventListener('storage',onQueue);window.addEventListener(queueEventName(),onQueue);window.addEventListener('c360-offline-queue-open',onOpen)
  const timer=window.setInterval(()=>{if(navigator.onLine&&readOfflineQueue().some(x=>x.state==='pending'))void sync()},30000)
  if(navigator.onLine&&items.some(x=>x.state==='pending'))void sync()
  return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);window.removeEventListener('storage',onQueue);window.removeEventListener(queueEventName(),onQueue);window.removeEventListener('c360-offline-queue-open',onOpen);window.clearInterval(timer)}
 },[token])
 if(!token)return null
 const pending=items.filter(x=>x.state==='pending').length,failed=items.filter(x=>x.state==='failed').length
 const visible=!online||items.length>0||open
 return <><OperatorExperienceLayer/>{visible&&<button className={`offline50-pill ${online?'online':'offline'} ${failed?'has-failed':''}`} type="button" onClick={()=>setOpen(true)} aria-label="Status de conexão e pedidos offline">{online?<Wifi size={15}/>:<WifiOff size={15}/>}<span>{online?(items.length?`${items.length} para sincronizar`:'online'):'modo offline'}</span>{failed>0&&<b>{failed}</b>}</button>}
 {open&&<div className="offline50-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="offline50-panel" role="dialog" aria-modal="true" aria-label="Fila segura offline">
  <header><div className={`offline50-net ${online?'online':'offline'}`}>{online?<Wifi/>:<CloudOff/>}<span><b>{online?'Conectado':'Sem internet'}</b><small>{online?'Pedidos pendentes podem ser enviados agora.':'Vendas rápidas podem ser guardadas neste dispositivo.'}</small></span></div><button onClick={()=>setOpen(false)} aria-label="Fechar"><X/></button></header>
  <div className="offline50-headline"><span>FILA SEGURA</span><h2>{items.length?`${items.length} pedido${items.length===1?'':'s'} aguardando confirmação do servidor.`:'Tudo sincronizado.'}</h2><p>Um pedido offline não aparece como recebido no KDS até o servidor confirmar. Cada tentativa reutiliza a mesma chave idempotente para evitar duplicação.</p></div>
  {notice&&<div className="offline50-notice"><CheckCircle2/>{notice}</div>}
  <div className="offline50-summary"><div><span>Pendentes</span><b>{pending}</b></div><div><span>Revisar</span><b>{failed}</b></div><div><span>Rede</span><b>{online?'online':'offline'}</b></div></div>
  <div className="offline50-list">{items.length?items.map(item=><article key={item.id} className={item.state}><div className="offline50-item-icon">{item.state==='failed'?<AlertTriangle/>:<CloudUpload/>}</div><div className="offline50-item-copy"><span>{item.business_name||`Operação ${item.business_id}`} · {when(item.created_at)}</span><b>{item.payload.quantity}× {item.product_name}</b><small>{money(item.preview_total_cents)} · contribuição prevista {money(item.preview_contribution_cents)}</small>{item.last_error&&<em>{item.last_error}</em>}</div><div className="offline50-item-actions">{item.state==='failed'&&<button onClick={()=>{retryOfflineOrder(item.id);refresh();if(online)void sync()}}><RefreshCcw/>Tentar novamente</button>}<button className="danger" onClick={()=>{discardOfflineOrder(item.id);refresh()}}><Trash2/>Descartar</button></div></article>):<div className="offline50-empty"><CheckCircle2/><b>Nenhum pedido preso neste dispositivo.</b><span>Você pode continuar usando o Cozinha 360 normalmente.</span></div>}</div>
  <footer><div><small>Última palavra: servidor</small><span>Prévia offline usa o último custo salvo; na sincronização o servidor recalcula a ficha técnica e registra o valor vigente.</span></div><button disabled={!online||!pending||syncing} onClick={()=>void sync()}><CloudUpload/>{syncing?'Sincronizando…':'Sincronizar agora'}</button></footer>
 </section></div>}</>
}
