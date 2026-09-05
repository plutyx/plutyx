import React, { useEffect, useState } from 'react'
import { CheckCircle2, ChefHat, KeyRound, MailCheck } from 'lucide-react'

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
      <div><span className="eyebrow">SEGURANÇA DA CONTA</span><h1>Seu acesso também faz parte da operação.</h1><p>Recupere a conta sem expor se um e-mail existe na base e sem reutilizar links antigos.</p></div>
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

export function AccountRoute(){
  const params=new URLSearchParams(window.location.search)
  const reset=params.get('reset_token')
  const verify=params.get('verify_token')
  if(reset)return <ResetPassword token={reset}/>
  if(verify)return <VerifyEmail token={verify}/>
  if(params.get('forgot')==='1')return <ForgotPassword/>
  return null
}
