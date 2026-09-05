import React,{useEffect,useRef,useState}from'react'
import{BellRing,Volume2,VolumeX}from'lucide-react'
import{request}from'./app'

type Ticket={id:number;status:string;source:string}

function tone(ctx:AudioContext,frequency:number,start:number,duration:number,gain=.08){
  const osc=ctx.createOscillator(),amp=ctx.createGain()
  osc.type='sine';osc.frequency.value=frequency;osc.connect(amp);amp.connect(ctx.destination)
  amp.gain.setValueAtTime(0.0001,start);amp.gain.exponentialRampToValueAtTime(gain,start+.015);amp.gain.exponentialRampToValueAtTime(0.0001,start+duration)
  osc.start(start);osc.stop(start+duration+.03)
}

function playNewOrder(ctx:AudioContext,source:string){
  const t=ctx.currentTime+.03
  if(source.toLowerCase().includes('whatsapp')){tone(ctx,620,t,.15,.045);tone(ctx,780,t+.18,.16,.045);return}
  tone(ctx,740,t,.18,.07);tone(ctx,980,t+.2,.22,.075)
}

function playDelivery(ctx:AudioContext){
  const t=ctx.currentTime+.03
  tone(ctx,520,t,.12,.04);tone(ctx,520,t+.15,.12,.04);tone(ctx,680,t+.3,.18,.05)
}

export function KitchenAlerts(){
  const token=localStorage.getItem('c360_token')||''
  const[enabled,setEnabled]=useState(false),[label,setLabel]=useState('Som da cozinha'),[error,setError]=useState('')
  const ctxRef=useRef<AudioContext|null>(null)
  const knownRef=useRef<Map<number,string>>(new Map())
  const businessRef=useRef<number>(0)
  const timerRef=useRef<number|undefined>(undefined)

  async function resolveBusiness(){
    if(businessRef.current)return businessRef.current
    const me=await request('/me',{},token)
    businessRef.current=Number(me.businesses?.[0]?.id||0)
    return businessRef.current
  }

  async function poll(first=false){
    if(!token||!enabled)return
    try{
      const bid=await resolveBusiness();if(!bid)return
      const data=await request(`/businesses/${bid}/kds`,{},token);const rows:Ticket[]=data.orders||[];const current=new Map<number,string>()
      for(const row of rows){
        current.set(row.id,row.status);const previous=knownRef.current.get(row.id)
        if(!first&&previous===undefined&&row.status==='new'&&ctxRef.current)playNewOrder(ctxRef.current,row.source||'')
        if(!first&&previous&&previous!=='awaiting_delivery'&&row.status==='awaiting_delivery'&&ctxRef.current)playDelivery(ctxRef.current)
      }
      knownRef.current=current;setError('')
    }catch(e){setError(e instanceof Error?e.message:'Falha no alerta')}
  }

  async function toggle(){
    if(enabled){setEnabled(false);setLabel('Som da cozinha');if(timerRef.current)window.clearInterval(timerRef.current);ctxRef.current?.close();ctxRef.current=null;return}
    if(!token){location.href='/';return}
    try{
      const AudioCtor=window.AudioContext||(window as any).webkitAudioContext
      const ctx:AudioContext=new AudioCtor();await ctx.resume();ctxRef.current=ctx;setEnabled(true);setLabel('Alertas ativos')
    }catch{setError('Seu navegador bloqueou o áudio. Toque novamente para ativar.')}
  }

  useEffect(()=>{
    if(!enabled)return
    poll(true);timerRef.current=window.setInterval(()=>poll(false),12000)
    return()=>{if(timerRef.current)window.clearInterval(timerRef.current)}
  },[enabled])

  useEffect(()=>()=>{ctxRef.current?.close()},[])

  if(!token)return null
  return <div className="kitchen-alert-wrap"><button className={`kitchen-alert-toggle ${enabled?'on':''}`} onClick={toggle} title="Alertas sonoros de pedidos"><span>{enabled?<Volume2 size={17}/>:<VolumeX size={17}/>}</span><label>{label}</label></button>{error&&<div className="kitchen-alert-error">{error}</div>}</div>
}
