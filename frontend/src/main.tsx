import React,{useEffect} from 'react'
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
import { System360Route } from './system360'
import { PlaybookLabRoute } from './playbook-lab'
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
import './system360.css'
import './shell-v20.css'
import './playbook-lab.css'
import './playbook-nav.css'

const tabLabels:Record<string,string>={hoje:'Hoje',pedidos:'Pedidos',producao:'Produção',produtos:'Produtos',custos:'Custos',financeiro:'Financeiro',clientes:'Clientes',equipe:'Equipe',config:'Minha área'}
function TabHashBridge(){
  useEffect(()=>{
    const key=decodeURIComponent(window.location.hash.replace(/^#/,''));const label=tabLabels[key]
    if(!label)return
    let attempts=0
    const timer=window.setInterval(()=>{
      attempts+=1
      const button=[...document.querySelectorAll<HTMLButtonElement>('.app-shell nav button')].find(x=>x.textContent?.trim()===label)
      if(button){button.click();window.history.replaceState(null,'',window.location.pathname+window.location.search);window.clearInterval(timer)}
      if(attempts>40)window.clearInterval(timer)
    },100)
    return()=>window.clearInterval(timer)
  },[])
  return null
}

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
  if(params.get('system360')==='1')return <><System360Route/><KitchenAlerts/></>
  if(params.get('playbook')==='1')return <><PlaybookLabRoute/><KitchenAlerts/></>
  return <>
    <App/>
    <TabHashBridge/>
    <KitchenAlerts/>
    <InventoryStockEditor/>
    <a className="account-helper-link" href="/?forgot=1">Esqueci minha senha</a>
    <div className="command-dock" aria-label="Ações rápidas">
      <span className="command-dock-label">AÇÕES</span>
      <a className="command-link system360" href="/?system360=1">Sistema 360</a>
      <a className="command-link lab" href="/?playbook=1">Laboratório 360</a>
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
