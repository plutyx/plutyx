import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import { AccountRoute } from './account-actions'
import { QuickOrderRoute } from './quick-order'
import { ChannelMarginRoute } from './channel-margin'
import { CrmLifecycleRoute } from './crm-lifecycle'
import { DirectCommerceAdminRoute, PublicStorefrontRoute } from './direct-order'
import { KitchenAlerts } from './kitchen-alerts'
import { InventoryStockEditor } from './inventory-editor'
import { KitchenBatchRoute } from './kitchen-batch'
import './styles.css'
import './market.css'
import './account.css'
import './quick-order.css'
import './channel-margin.css'
import './crm-lifecycle.css'
import './direct-order.css'
import './kitchen-alerts.css'
import './super-flow.css'
import './flow-v18.css'
import './flow-v181.css'
import './inventory-editor.css'
import './module-flow-v183.css'
import './kitchen-batch.css'

function Root(){
  const params=new URLSearchParams(window.location.search)
  const hasAccountRoute=Boolean(params.get('reset_token')||params.get('verify_token')||params.get('forgot')==='1'||params.get('security')==='1')
  const storeSlug=params.get('loja')||''
  if(storeSlug)return <PublicStorefrontRoute slug={storeSlug}/>
  if(hasAccountRoute)return <AccountRoute/>
  if(params.get('quick')==='1')return <QuickOrderRoute/>
  if(params.get('margin')==='1')return <ChannelMarginRoute/>
  if(params.get('crm')==='1')return <CrmLifecycleRoute/>
  if(params.get('direct')==='1')return <DirectCommerceAdminRoute/>
  if(params.get('kitchen')==='1')return <><KitchenBatchRoute/><KitchenAlerts/></>
  return <>
    <App/>
    <KitchenAlerts/>
    <InventoryStockEditor/>
    <a className="account-helper-link" href="/?forgot=1">Esqueci minha senha</a>
    <div className="command-dock" aria-label="Ações rápidas">
      <span className="command-dock-label">AÇÕES</span>
      <a className="command-link kitchen" href="/?kitchen=1">Modo cozinha</a>
      <a className="command-link crm" href="/?crm=1">CRM de recompra</a>
      <a className="command-link margin" href="/?margin=1">Margens & canais</a>
      <a className="command-link direct" href="/?direct=1">Venda direta</a>
      <a className="command-link security" href="/?security=1">Segurança</a>
      <a className="command-link primary" href="/?quick=1">+ Pedido rápido</a>
    </div>
  </>
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
