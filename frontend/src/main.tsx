import React, { Suspense, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import { KitchenAlerts } from "./kitchen-alerts";
import { InventoryStockEditor } from "./inventory-editor";
import { SessionAwareControls } from "./operator-launcher-v38";
import { OfflineQueueStatus } from "./offline-status-v50";
import { prepareOperatingMemory } from "./operating-memory";
import { DiscoveryPlaygroundPortal } from "./operational-playground-portal";
import { PlugPlayGalaxyPortal } from "./plug-play-galaxy-portal";
import { LivingOperationFlowPortal } from "./living-operation-flow";
import { IntegrationRealityRibbonPortal } from "./integration-reality-ribbon";
import "./tailwind.css";
import "./styles.css";
import "./market.css";
import "./account.css";
import "./quick-order.css";
import "./channel-margin.css";
import "./crm-lifecycle.css";
import "./direct-order.css";
import "./direct-order-v40.css";
import "./kitchen-alerts.css";
import "./super-flow.css";
import "./flow-v18.css";
import "./flow-v181.css";
import "./inventory-editor.css";
import "./module-flow-v183.css";
import "./kitchen-batch.css";
import "./kds-sla-v54.css";
import "./kitchen-control-room-v63.css";
import "./orders-command-board-v64.css";
import "./system360.css";
import "./shell-v20.css";
import "./playbook-lab.css";
import "./playbook-nav.css";
import "./vitrine-studio.css";
import "./vitrine-nav.css";
import "./growth-lab.css";
import "./growth-nav.css";
import "./control-tower.css";
import "./control-nav.css";
import "./execution-hub.css";
import "./execution-nav.css";
import "./cash-engine.css";
import "./cash-nav.css";
import "./connections-hub.css";
import "./subscription-status.css";
import "./subscription-nav.css";
import "./autopilot-360.css";
import "./dock-v37.css";
import "./operator-launcher-v38.css";
import "./today-attention-v39.css";
import "./today-cockpit-v66.css";
import "./delivery-os-v40.css";
import "./delivery-os-market-v40.css";
import "./offline-status-v50.css";
import "./network-360-v50.css";
import "./smart-cmv-v50.css";
import "./purchases-360-v51.css";
import "./purchases-360-v53.css";
import "./suppliers-360-v52.css";
import "./experience.css";

const AccountRoute = lazy(async () => ({ default: (await import("./account-actions")).AccountRoute }));
const QuickOrderRoute = lazy(async () => ({ default: (await import("./quick-order")).QuickOrderRoute }));
const ChannelMarginRoute = lazy(async () => ({ default: (await import("./channel-margin")).ChannelMarginRoute }));
const CrmLifecycleRoute = lazy(async () => ({ default: (await import("./crm-lifecycle")).CrmLifecycleRoute }));
const DeliveryTrackingRoute = lazy(async () => ({ default: (await import("./direct-order")).DeliveryTrackingRoute }));
const DirectCommerceAdminRoute = lazy(async () => ({ default: (await import("./direct-order")).DirectCommerceAdminRoute }));
const PublicStorefrontRoute = lazy(async () => ({ default: (await import("./direct-order")).PublicStorefrontRoute }));
const KitchenBatchRoute = lazy(async () => ({ default: (await import("./kitchen-batch")).KitchenBatchRoute }));
const System360Route = lazy(async () => ({ default: (await import("./system360")).System360Route }));
const PlaybookLabRoute = lazy(async () => ({ default: (await import("./playbook-lab")).PlaybookLabRoute }));
const VitrineStudioRoute = lazy(async () => ({ default: (await import("./vitrine-studio")).VitrineStudioRoute }));
const GrowthLabRoute = lazy(async () => ({ default: (await import("./growth-lab")).GrowthLabRoute }));
const ControlTowerRoute = lazy(async () => ({ default: (await import("./control-tower")).ControlTowerRoute }));
const ExecutionHubRoute = lazy(async () => ({ default: (await import("./execution-hub")).ExecutionHubRoute }));
const CashEngineRoute = lazy(async () => ({ default: (await import("./cash-engine")).CashEngineRoute }));
const ConnectionsHubRoute = lazy(async () => ({ default: (await import("./personalized-connections-route")).PersonalizedConnectionsRoute }));
const IntegrationSetupLauncher = lazy(async () => ({ default: (await import("./integration-setup-v42")).IntegrationSetupLauncher }));
const IntegrationSetupV42Route = lazy(async () => ({ default: (await import("./integration-setup-v42")).IntegrationSetupV42Route }));
const SubscriptionStatusRoute = lazy(async () => ({ default: (await import("./subscription-status")).SubscriptionStatusRoute }));
const Autopilot360Route = lazy(async () => ({ default: (await import("./autopilot-360")).Autopilot360Route }));
const TodayAttentionRoute = lazy(async () => ({ default: (await import("./today-attention-v39")).TodayAttentionRoute }));
const DeliveryOSMarketRoute = lazy(async () => ({ default: (await import("./delivery-os-market-v40")).DeliveryOSMarketRoute }));
const Network360Route = lazy(async () => ({ default: (await import("./network-360-v50")).Network360Route }));
const SmartCMVRoute = lazy(async () => ({ default: (await import("./smart-cmv-v50")).SmartCMVRoute }));
const Purchases360Route = lazy(async () => ({ default: (await import("./purchases-360-v51")).Purchases360Route }));
const Suppliers360Route = lazy(async () => ({ default: (await import("./suppliers-360-v52")).Suppliers360Route }));

const tabLabels: Record<string, string> = { hoje: "Hoje", pedidos: "Pedidos", producao: "Produção", produtos: "Produtos", custos: "Custos", financeiro: "Financeiro", clientes: "Clientes", equipe: "Equipe", config: "Minha área" };
function TabHashBridge() {
  useEffect(() => {
    const key = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    const label = tabLabels[key];
    if (!label) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const button = [...document.querySelectorAll<HTMLButtonElement>(".app-shell nav button")].find((x) => x.textContent?.trim() === label);
      if (button) {
        button.click();
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        window.clearInterval(timer);
      }
      if (attempts > 40) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
function OperatorRoute({ children, alerts = true }: { children: React.ReactNode; alerts?: boolean }) {
  return <>{children}{alerts && <KitchenAlerts />}<SessionAwareControls /><OfflineQueueStatus /></>;
}
function Root() {
  const params = new URLSearchParams(window.location.search);
  const hasAccountRoute = Boolean(params.get("reset_token") || params.get("verify_token") || params.get("forgot") === "1" || params.get("security") === "1");
  const tracking = params.get("track") || "", storeSlug = params.get("loja") || "";
  if (tracking) return <DeliveryTrackingRoute token={tracking} />;
  if (storeSlug) return <PublicStorefrontRoute slug={storeSlug} />;
  if (hasAccountRoute) return <AccountRoute />;
  if (params.get("network") === "1") return <OperatorRoute><Network360Route /></OperatorRoute>;
  if (params.get("cmv") === "1") return <OperatorRoute><SmartCMVRoute /></OperatorRoute>;
  if (params.get("purchases") === "1") return <OperatorRoute><Purchases360Route /></OperatorRoute>;
  if (params.get("suppliers") === "1") return <OperatorRoute><Suppliers360Route /></OperatorRoute>;
  if (params.get("today") === "1") return <OperatorRoute><TodayAttentionRoute /></OperatorRoute>;
  if (params.get("delivery") === "1") return <OperatorRoute><DeliveryOSMarketRoute /></OperatorRoute>;
  if (params.get("quick") === "1") return <OperatorRoute><QuickOrderRoute /></OperatorRoute>;
  if (params.get("margin") === "1") return <OperatorRoute><ChannelMarginRoute /></OperatorRoute>;
  if (params.get("crm") === "1") return <OperatorRoute><CrmLifecycleRoute /></OperatorRoute>;
  if (params.get("direct") === "1") return <OperatorRoute><DirectCommerceAdminRoute /></OperatorRoute>;
  if (params.get("kitchen") === "1") return <OperatorRoute><KitchenBatchRoute /></OperatorRoute>;
  if (params.get("system360") === "1") return <OperatorRoute><System360Route /></OperatorRoute>;
  if (params.get("playbook") === "1") return <OperatorRoute><PlaybookLabRoute /></OperatorRoute>;
  if (params.get("vitrine") === "1") return <OperatorRoute><VitrineStudioRoute /></OperatorRoute>;
  if (params.get("growth") === "1") return <OperatorRoute><GrowthLabRoute /></OperatorRoute>;
  if (params.get("control") === "1") return <OperatorRoute><ControlTowerRoute /></OperatorRoute>;
  if (params.get("execution") === "1") return <OperatorRoute><ExecutionHubRoute /></OperatorRoute>;
  if (params.get("cash") === "1") return <OperatorRoute><CashEngineRoute /></OperatorRoute>;
  if (params.get("setup") === "1") return <OperatorRoute><IntegrationSetupV42Route /></OperatorRoute>;
  if (params.get("connections") === "1") return <OperatorRoute><><ConnectionsHubRoute /><IntegrationSetupLauncher /></></OperatorRoute>;
  if (params.get("plan") === "1") return <OperatorRoute alerts={false}><SubscriptionStatusRoute /></OperatorRoute>;
  if (params.get("autopilot") === "1") return <OperatorRoute><Autopilot360Route /></OperatorRoute>;
  return <><App /><DiscoveryPlaygroundPortal /><PlugPlayGalaxyPortal /><LivingOperationFlowPortal /><IntegrationRealityRibbonPortal /><TabHashBridge /><KitchenAlerts /><InventoryStockEditor /><SessionAwareControls guestHelper={false} /><OfflineQueueStatus /></>;
}
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}); }, { once: true });
}
async function boot() {
  registerServiceWorker();
  await prepareOperatingMemory();
  createRoot(document.getElementById("root")!).render(<React.StrictMode><Suspense fallback={<main className="center"><div className="loader">COZINHA 360</div></main>}><Root /></Suspense></React.StrictMode>);
}
void boot();