import React,{useEffect,useMemo,useRef,useState} from 'react'
import {
  BarChart3,BookOpen,Boxes,ChefHat,CircleDollarSign,Command,LayoutDashboard,
  Network,Plus,Search,ShieldCheck,ShoppingBag,SlidersHorizontal,
  Sparkles,Store,Sun,Users,WalletCards,X
} from 'lucide-react'

type Action={label:string;href:string;group:'Operar'|'Controlar'|'Crescer'|'Administrar';description:string;keywords:string;icon:React.ElementType}

const actions:Action[]=[
  {label:'Hoje',href:'/?today=1',group:'Operar',description:'prioridades, alertas e sequência de decisões do dia',keywords:'hoje atenção prioridade briefing decisão alertas',icon:Sun},
  {label:'Sistema 360',href:'/?system360=1',group:'Operar',description:'diagnóstico, motores e marco dos 30 pedidos',keywords:'sistema operação diagnóstico 30 pedidos',icon:LayoutDashboard},
  {label:'Modo cozinha',href:'/?kitchen=1',group:'Operar',description:'fila, preparo, componentes e estoque projetado',keywords:'cozinha kds produção preparo componentes',icon:ChefHat},
  {label:'Execution Hub',href:'/?execution=1',group:'Operar',description:'execução de 72h, compras e checklists',keywords:'execução checklist compras 72h',icon:Boxes},
  {label:'Control Tower',href:'/?control=1',group:'Operar',description:'auditoria 30/60/90 e contingência',keywords:'controle auditoria recuperação contingência',icon:SlidersHorizontal},
  {label:'Cash & Margin',href:'/?cash=1',group:'Controlar',description:'caixa, ponto de equilíbrio e runway',keywords:'caixa margem break even runway financeiro',icon:CircleDollarSign},
  {label:'Margens & canais',href:'/?margin=1',group:'Controlar',description:'contribuição por canal e preço mínimo',keywords:'margem canal preço contribuição',icon:WalletCards},
  {label:'Autopilot 360',href:'/?autopilot=1',group:'Controlar',description:'prioridades e próxima ação com dados da operação',keywords:'autopilot prioridade ação briefing ia',icon:Sparkles},
  {label:'Growth Lab',href:'/?growth=1',group:'Crescer',description:'CPA, testes e crescimento responsável',keywords:'growth marketing cpa anúncios tráfego',icon:BarChart3},
  {label:'Vitrine Studio',href:'/?vitrine=1',group:'Crescer',description:'marca, conteúdo e página de venda',keywords:'vitrine marca conteúdo site social',icon:Store},
  {label:'CRM de recompra',href:'/?crm=1',group:'Crescer',description:'clientes, recompra e relacionamento',keywords:'crm clientes recompra relacionamento',icon:Users},
  {label:'Venda direta',href:'/?direct=1',group:'Crescer',description:'loja e pedidos sem marketplace',keywords:'venda direta loja whatsapp pedido',icon:ShoppingBag},
  {label:'Conexões',href:'/?connections=1',group:'Administrar',description:'integrações e saúde das conexões',keywords:'conexões integrações api canais',icon:Network},
  {label:'Plano & acesso',href:'/?plan=1',group:'Administrar',description:'assinatura e permissões disponíveis',keywords:'plano assinatura acesso permissão',icon:ShieldCheck},
  {label:'Laboratório 360',href:'/?playbook=1',group:'Administrar',description:'capacidade, menu 3+1 e playbook',keywords:'laboratório playbook capacidade menu',icon:BookOpen},
  {label:'Segurança',href:'/?security=1',group:'Administrar',description:'conta, senha e proteção de acesso',keywords:'segurança senha conta acesso',icon:ShieldCheck},
]

function useSessionState(){
  const [hasToken,setHasToken]=useState(()=>Boolean(localStorage.getItem('c360_token')))
  useEffect(()=>{
    const sync=()=>setHasToken(Boolean(localStorage.getItem('c360_token')))
    const timer=window.setInterval(sync,700)
    window.addEventListener('focus',sync)
    window.addEventListener('storage',sync)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',sync);window.removeEventListener('storage',sync)}
  },[])
  return hasToken
}

export function SessionAwareControls(){
  const hasToken=useSessionState()
  if(!hasToken)return <a className="account-helper-link" href="/?forgot=1">Esqueci minha senha</a>
  return <OperatorLauncher/>
}

function OperatorLauncher(){
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState('')
  const inputRef=useRef<HTMLInputElement|null>(null)
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();setOpen(value=>!value)
      }
      if(event.key==='Escape')setOpen(false)
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[])
  useEffect(()=>{
    if(!open){document.body.classList.remove('operator-launcher-open');setQuery('');return}
    document.body.classList.add('operator-launcher-open')
    const timer=window.setTimeout(()=>inputRef.current?.focus(),40)
    return()=>{window.clearTimeout(timer);document.body.classList.remove('operator-launcher-open')}
  },[open])
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('pt-BR')
    if(!needle)return actions
    return actions.filter(item=>`${item.label} ${item.description} ${item.keywords}`.toLocaleLowerCase('pt-BR').includes(needle))
  },[query])
  const groups=(['Operar','Controlar','Crescer','Administrar'] as const).map(group=>({group,items:filtered.filter(item=>item.group===group)})).filter(section=>section.items.length)
  return <>
    <nav className="operator-rail" aria-label="Ações principais">
      <a className="operator-rail-link operator-rail-autopilot" href="/?today=1"><Sun size={16}/><span>Hoje</span></a>
      <a className="operator-rail-link operator-rail-primary" href="/?quick=1"><Plus size={17}/><span>+ Pedido rápido</span></a>
      <a className="operator-rail-link" href="/?kitchen=1"><ChefHat size={16}/><span>Cozinha</span></a>
      <a className="operator-rail-link" href="/?cash=1"><CircleDollarSign size={16}/><span>Caixa</span></a>
      <button className="operator-rail-link operator-more" type="button" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><Command size={16}/><span>Mais</span><kbd>⌘K</kbd></button>
    </nav>
    {open&&<div className="operator-launcher-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
      <section className="operator-launcher-panel" role="dialog" aria-modal="true" aria-label="Launcher do Cozinha 360">
        <header className="operator-launcher-head">
          <div><span className="operator-launcher-kicker">COZINHA 360 · COMANDO</span><h2>O que você precisa fazer agora?</h2></div>
          <button type="button" className="operator-launcher-close" onClick={()=>setOpen(false)} aria-label="Fechar launcher"><X size={18}/></button>
        </header>
        <label className="operator-launcher-search"><Search size={18}/><input ref={inputRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar caixa, CRM, cozinha, segurança…" aria-label="Buscar função"/><span>ESC</span></label>
        <div className="operator-launcher-groups">
          {groups.map(section=><div className="operator-launcher-group" key={section.group}><h3>{section.group}</h3><div className="operator-launcher-list">{section.items.map(item=>{const Icon=item.icon;return <a key={item.href} href={item.href} className="operator-launcher-item"><span className="operator-launcher-icon"><Icon size={18}/></span><span><b>{item.label}</b><small>{item.description}</small></span></a>})}</div></div>)}
          {!filtered.length&&<div className="operator-launcher-empty">Nenhuma função encontrada. Tente outro termo.</div>}
        </div>
        <footer className="operator-launcher-foot"><span>4 ações ficam sempre à mão. O restante aparece quando você pedir.</span><span><Command size={13}/> Ctrl/Cmd + K</span></footer>
      </section>
    </div>}
  </>
}
