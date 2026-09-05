import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import { AccountRoute } from './account-actions'
import './styles.css'
import './market.css'

function Root(){
  const accountRoute=<AccountRoute/>
  if(accountRoute)return accountRoute
  const hasSession=Boolean(localStorage.getItem('c360_token'))
  return <>
    <App/>
    {!hasSession&&<a className="account-helper-link" href="/?forgot=1">Esqueci minha senha</a>}
  </>
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
