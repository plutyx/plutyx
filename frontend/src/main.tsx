import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import { AccountRoute } from './account-actions'
import './styles.css'
import './market.css'
import './account.css'

function Root(){
  const params=new URLSearchParams(window.location.search)
  const hasAccountRoute=Boolean(params.get('reset_token')||params.get('verify_token')||params.get('forgot')==='1'||params.get('security')==='1')
  if(hasAccountRoute)return <AccountRoute/>
  return <>
    <App/>
    <a className="account-helper-link" href="/?forgot=1">Esqueci minha senha</a>
    <a className="account-security-link" href="/?security=1">Segurança da conta</a>
  </>
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
