import React, { useEffect, useState } from 'react'
import { CheckCircle2, ChefHat, KeyRound, LogOut, MailCheck, ShieldCheck } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || '/api'

async function request(path:string, options:RequestInit={}){
  const res=await fetch(`${API}${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}})
  const body=await res.json().catch(()=>({detail:'Resposta inválida'}))
  if(!res.ok) throw new Error(typeof body.detail==='string'?body.detail:'Não foi possível concluir')
  return body
}

function AccountFrame({children}:{children:React.ReactNode}){
  return <main className="account-action-shell">
    <section className="account-action-brand">
      <div className="brand"><ChefHat size={28}/><span>COZINHA 360</span></div>
      <div><span className="eyebrow">SEGURANÇA DA CONTA</span><h1>Seu acesso também faz parte da operação.</h1><p>Recupere a conta sem expor se um e-mail existe na base, confirme seu endereço e revogue sessões antigas quando precisar.</p></div>
    </section>
    <section className="account-action-card">{children}</section>
  </main>
}

export function ForgotPassword(){
  const[email,setEmail]=useState('');const[busy,setBusy]=useState(false);const[done,setDone]=useState(false);const[error,setError]=useState('')
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await request('/auth/password-reset/request',{method:'POST',body:JSON.stringify({email})});setDone(true)}catch(err){setError(err instanceof Error?err.message:'Erro')}finally{setBusy(false)}}
  return <AccountFrame>{done?<div className="account-result"><CheckCircle2 size={34}/><h2>Confira seu e-mail</h2><p>Se houver uma conta elegível para esse endereço, enviaremos um link de recuperação. O link expira em 1 hora.</p><a className="primary account-link" href="/">Voltar para entrar</a></div>:<><KeyRound size={32}/><h2>Esqueci minha senha</h2><p>Informe o e-mail usado na conta. A resposta será a mesma mesmo quando o endereço não estiver cadastrado.</p><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com" required/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Enviando...':'Enviar instruções'}</button></form><a className="account-back" href="/">Voltar para entrar</a></>}</AccountFrame>
}

export function ResetPassword({token}:{token:string}){
  const[password,setPassword]=useState('');const[confirm,setConfirm]=useState('');const[busy,setBusy]=useState(false);const[done,setDone]=useState(false);const[error,setError]=useState('')
  async function submit(e:React.FormEvent){e.preventDefault();setError('');if(password!==confirm){setError('As senhas precisam ser iguais.');return}setBusy(true);try{await request('/auth/password-reset/confirm',{method:'POST',body:JSON.stringify({token,new_password:password})});localStorage.removeItem('c360_token');setDone(true)}catch(err){setError(err instanceof Error?err.message:'Erro')}finally{setBusy(false)}}
  return <AccountFrame>{done?<div className="account-result"><CheckCircle2 size={34}/><h2>Senha atualizada</h2><p>As sessões anteriores foram revogadas. Entre novamente com a nova senha.</p><a className="primary account-link" href="/">Entrar novamente</a></div>:<><KeyRound size={32}/><h2>Crie uma nova senha</h2><p>Use pelo menos 12 caracteres. Este link funciona uma única vez.</p><form onSubmit={submit}><label>Nova senha<input type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required/></label><label>Confirmar senha<input type="password" minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label>{error&&<div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy?'Salvando...':'Salvar nova senha'}</button></form><a className="account-back" href="/">Voltar para entrar</a></>}</AccountFrame>
}

export function VerifyEmail({token}:{token:string}){
  const[state,setState]=useState<'busy'|'done'|'error'>('busy');const[message,setMessage]=useState('Confirmando seu endereço...')
  useEffect(()=>{request('/auth/email-verification/confirm',{method:'POST',body:JSON.stringify({token})}).then(()=>{setState('done');setMessage('E-mail confirmado com sucesso.')}).catch(err=>{setState('error');setMessage(err instanceof Error?err.message:'Não foi possível confirmar')})},[token])
  return <AccountFrame><div className={`account-result ${state}`}><MailCheck size={34}/><h2>{state==='busy'?'Confirmando e-mail':state==='done'?'E-mail confirmado':'Link não confirmado'}</h2><p>{message}</p>{state!=='busy'&&<a className="primary account-link" href="/">Ir para o Cozinha 360</a>}</div></AccountFrame>
}

type SecurityStatus={email:string;email_verified:boolean;email_verified_at:string|null;transactional_email_configured:boolean}

export function SecurityCenter(){
  const token=localStorage.getItem('c360_token')||''
  const[status,setStatus]=useState<SecurityStatus|null>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[message,setMessage]=useState('');const[debugLink,setDebugLink]=useState('')
  const headers=token?{Authorization:`Bearer ${token}`}:{ }
  useEffect(()=>{if(!token)return;request('/auth/security-status',{headers}).then(setStatus).catch(err=>setError(err instanceof Error?err.message:'Erro'))},[])
  async function verify(){setBusy(true);setError('');setMessage('');setDebugLink('');try{const body=await request('/auth/email-verification/request',{method:'POST',headers});if(body.already_verified){setMessage('Seu e-mail já está confirmado.')}else{setMessage(body.delivery==='smtp'?'Enviamos o link de confirmação para seu e-mail.':'Link de confirmação criado para o ambiente de teste.');if(body.debug_link)setDebugLink(body.debug_link)}}catch(err){setError(err instanceof Error?err.message:'Erro')}finally{setBusy(false)}}
  async function logoutAll(){setBusy(true);setError('');try{await request('/auth/logout-all',{method:'POST',headers});localStorage.removeItem('c360_token');window.location.href='/'}catch(err){setError(err instanceof Error?err.message:'Erro');setBusy(false)}}
  if(!token)return <AccountFrame><div className="account-result"><ShieldCheck size={34}/><h2>Sessão necessária</h2><p>Entre na sua conta antes de abrir as configurações de segurança.</p><a className="primary account-link" href="/">Entrar</a></div></AccountFrame>
  return <AccountFrame><ShieldCheck size={32}/><h2>Segurança da conta</h2><p>Controle confirmação de e-mail e sessões ativas sem misturar esses dados com a operação da cozinha.</p>{error&&<div className="error">{error}</div>}{message&&<div className="notice">{message}</div>}{debugLink&&<a className="account-back" href={debugLink}>Abrir link de confirmação do ambiente de teste</a>}{status?<div className="security-summary"><div><span>E-mail</span><b>{status.email}</b></div><div><span>Confirmação</span><b>{status.email_verified?'Confirmado':'Pendente'}</b></div><div><span>Entrega transacional</span><b>{status.transactional_email_configured?'Configurada':'Ainda não configurada'}</b></div></div>:<div className="empty-inline">Carregando status...</div>}<div className="security-actions">{status&&!status.email_verified&&<button className="primary" disabled={busy} onClick={verify}><MailCheck size={17}/> Enviar confirmação</button>}<button className="secondary danger-action" disabled={busy} onClick={logoutAll}><LogOut size={17}/> Encerrar todas as sessões</button></div><a className="account-back" href="/">Voltar para a operação</a></AccountFrame>
}

export function AccountRoute(){
  const params=new URLSearchParams(window.location.search)
  const reset=params.get('reset_token')
  const verify=params.get('verify_token')
  if(reset)return <ResetPassword token={reset}/>
  if(verify)return <VerifyEmail token={verify}/>
  if(params.get('forgot')==='1')return <ForgotPassword/>
  if(params.get('security')==='1')return <SecurityCenter/>
  return null
}
