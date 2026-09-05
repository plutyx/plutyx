import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import { AccountRoute } from './account-actions'
import { QuickOrderRoute } from './quick-order'
import './styles.css'
import './market.css'
import './account.css'
import './quick-order.css'

function Root(){
  const params=new URLSearchParams(window.location.search)
  const hasAccountRoute=Boolean(params.get('reset_token')||params.get('verify_token')||params.get('forgot')==='1'||params.get('security')==='1')
  if(hasAccountRoute)return <AccountRoute/>
  if(params.get('quick')==='1')return <QuickOrderRoute/>
  return <>
    <App/>
    <a className="account-helper-link" href="/?forgot=1">Esqueci minha senha</a>
    <a className="account-security-link" href="/?security=1">Segurança da conta</a>
    <a className="global-quick-link" href="/?quick=1">+ Pedido rápido</a>
  </>
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
