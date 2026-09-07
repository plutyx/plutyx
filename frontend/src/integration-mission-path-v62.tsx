import { motion, useReducedMotion } from "motion/react";
import {
  BadgeDollarSign,
  Check,
  ChefHat,
  CircleDot,
  ExternalLink,
  RadioTower,
  RefreshCcw,
  Route,
  ShoppingBag,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { money, request, type Dashboard, type KdsOrder } from "./app";

type Business = { id: number; name: string };
type Connection = { status?: string | null };
type Provider = {
  key: string;
  name: string;
  operational?: boolean;
  connection?: Connection | null;
};
type Order = {
  id: number;
  status: string;
  source: string;
  paid: boolean;
  created_at: string;
};
type Snapshot = {
  business: Business | null;
  providers: Provider[];
  pagbankActive: boolean;
  orders: Order[];
  kds: KdsOrder[];
  dashboard: Dashboard | null;
  partial: boolean;
};
type Mission = {
  key: string;
  label: string;
  eyebrow: string;
  description: string;
  done: boolean;
  icon: typeof RadioTower;
  actionLabel: string;
  action: () => void;
};

const INTEGRATIONS_API =
  import.meta.env.VITE_INTEGRATIONS_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29";
const PAGBANK_API =
  import.meta.env.VITE_PAGBANK_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-pagbank-v59";

const empty: Snapshot = {
  business: null,
  providers: [],
  pagbankActive: false,
  orders: [],
  kds: [],
  dashboard: null,
  partial: false,
};

async function remoteJson(base: string, path: string, token: string) {
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "integration read failed");
  return body;
}

function providerIsActive(provider: Provider | undefined) {
  return Boolean(
    provider &&
      (provider.operational || provider.connection?.status === "active"),
  );
}

function findCard(needles: string[]) {
  return Array.from(document.querySelectorAll<HTMLElement>(".cx-card")).find((card) => {
    const title = card.querySelector("h2")?.textContent?.trim().toLowerCase() || "";
    return needles.some((needle) => title.includes(needle.toLowerCase()));
  });
}

function focusCard(needles: string[], reduced: boolean) {
  const target = findCard(needles);
  if (!target) return;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  target.animate(
    [
      { boxShadow: "0 0 0 0 rgba(103,232,249,0)" },
      { boxShadow: "0 0 0 3px rgba(103,232,249,.24), 0 0 70px rgba(103,232,249,.12)" },
      { boxShadow: "0 0 0 0 rgba(103,232,249,0)" },
    ],
    { duration: reduced ? 1 : 1200, easing: "ease-out" },
  );
}

function navigateTo(param: string) {
  const next = new URL(window.location.href);
  next.search = "";
  next.hash = "";
  next.searchParams.set(param, "1");
  window.location.assign(next.toString());
}

function isExternalSource(source: string) {
  const value = source.toLowerCase();
  return ["whatsapp", "ifood", "99food", "keeta", "rappi"].some((needle) =>
    value.includes(needle),
  );
}

function IntegrationMissionPath({ businessId }: { businessId: number }) {
  const reduced = Boolean(useReducedMotion());
  const token = localStorage.getItem("c360_token") || "";
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!token || !businessId || loading) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        remoteJson(INTEGRATIONS_API, `/businesses/${businessId}/integrations`, token),
        remoteJson(PAGBANK_API, `/businesses/${businessId}/status`, token),
        request(`/businesses/${businessId}/orders`, {}, token),
        request(`/businesses/${businessId}/kds`, {}, token),
        request(`/businesses/${businessId}/dashboard`, {}, token),
      ]);
      const read = <T,>(index: number, fallback: T): T =>
        results[index]?.status === "fulfilled"
          ? (results[index] as PromiseFulfilledResult<T>).value
          : fallback;
      const integrations = read<any>(0, { providers: [] });
      const pagbank = read<any>(1, {});
      const kds = read<any>(3, { orders: [] });
      setSnapshot({
        business: { id: businessId, name: integrations.business_name || "Sua operação" },
        providers: Array.isArray(integrations.providers) ? integrations.providers : [],
        pagbankActive: pagbank?.connection?.status === "active",
        orders: read<Order[]>(2, []),
        kds: Array.isArray(kds?.orders) ? kds.orders : [],
        dashboard: read<Dashboard | null>(4, null),
        partial: results.some((result) => result.status === "rejected"),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    }, 30000);
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [businessId]);

  const byKey = useMemo(
    () => new Map(snapshot.providers.map((provider) => [provider.key, provider])),
    [snapshot.providers],
  );
  const channelReady =
    providerIsActive(byKey.get("whatsapp")) || providerIsActive(byKey.get("ifood"));
  const paymentReady =
    snapshot.pagbankActive || providerIsActive(byKey.get("mercadopago"));
  const externalOrder = snapshot.orders.some((order) => isExternalSource(order.source));
  const kitchenSignal =
    snapshot.kds.length > 0 ||
    snapshot.orders.some((order) =>
      ["production", "checking", "delivery", "completed"].includes(order.status),
    );
  const revenue = Number(snapshot.dashboard?.pulse?.revenue_cents || 0);
  const contribution = Number(snapshot.dashboard?.pulse?.contribution_cents || 0);
  const moneySignal = revenue > 0;

  const missions: Mission[] = [
    {
      key: "channel",
      eyebrow: "01 · CANAL",
      label: "Abra uma porta de pedidos",
      description: channelReady
        ? "Um canal externo já consegue conversar com a operação."
        : "Autorize WhatsApp ou iFood sem copiar token ou webhook.",
      done: channelReady,
      icon: RadioTower,
      actionLabel: channelReady ? "Ver canal" : "Conectar canal",
      action: () => focusCard(["WhatsApp Business", "WhatsApp", "iFood"], reduced),
    },
    {
      key: "payment",
      eyebrow: "02 · DINHEIRO",
      label: "Deixe o pagamento rastreável",
      description: paymentReady
        ? "Há uma conta de pagamento autorizada e monitorável."
        : "Conecte PagBank ou Mercado Pago pela autorização oficial.",
      done: paymentReady,
      icon: WalletCards,
      actionLabel: paymentReady ? "Ver pagamento" : "Conectar pagamento",
      action: () => focusCard(["PagBank", "Mercado Pago", "Pix"], reduced),
    },
    {
      key: "order",
      eyebrow: "03 · PRIMEIRO SINAL",
      label: "Receba um pedido de verdade",
      description: externalOrder
        ? "O canal já deixou um pedido real dentro do histórico."
        : "O próximo pedido externo vira o primeiro sinal vivo desta rota.",
      done: externalOrder,
      icon: ShoppingBag,
      actionLabel: externalOrder ? "Ver pedidos" : "Abrir entrada",
      action: () => navigateTo("quick"),
    },
    {
      key: "kitchen",
      eyebrow: "04 · COZINHA",
      label: "Faça o pedido atravessar a produção",
      description: kitchenSignal
        ? "A cozinha já recebeu ou processou sinal vindo de pedido."
        : "Quando o pedido entra no KDS, esta etapa acende automaticamente.",
      done: kitchenSignal,
      icon: ChefHat,
      actionLabel: "Abrir cozinha",
      action: () => navigateTo("kitchen"),
    },
    {
      key: "margin",
      eyebrow: "05 · RESULTADO",
      label: "Veja dinheiro virar decisão",
      description: moneySignal
        ? `${money(revenue)} de receita · ${money(contribution)} de contribuição no pulso atual.`
        : "Depois da primeira venda, caixa e margem deixam de ser números abstratos.",
      done: moneySignal,
      icon: BadgeDollarSign,
      actionLabel: "Abrir caixa",
      action: () => navigateTo("cash"),
    },
  ];

  const completed = missions.filter((mission) => mission.done).length;
  const nextMission = missions.find((mission) => !mission.done) || missions[missions.length - 1];
  const progress = (completed / missions.length) * 100;

  return (
    <section
      data-integration-mission-path-v62
      className="relative z-20 mx-auto mt-5 w-[min(1500px,calc(100%-2rem))] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(8,15,24,.88),rgba(9,13,20,.95))] p-3 text-white shadow-[0_32px_100px_rgba(0,0,0,.28),inset_0_1px_rgba(255,255,255,.06)] backdrop-blur-3xl sm:p-4"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-cyan-300/[0.06] blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute right-[12%] -top-20 size-72 rounded-full bg-violet-300/[0.055] blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-[-8rem] left-[44%] size-72 rounded-full bg-emerald-300/[0.05] blur-[110px]" />

      <div className="relative grid gap-3 xl:grid-cols-[.42fr_1.58fr]">
        <div className="grid min-h-[15rem] content-between rounded-[1.55rem] border border-white/[0.07] bg-white/[0.035] p-5 backdrop-blur-2xl">
          <div>
            <span className="flex items-center gap-2 text-[0.56rem] font-black tracking-[0.16em] text-cyan-100/65">
              <Route size={13} /> IMPLANTAÇÃO VIVA
            </span>
            <h2 className="mt-3 max-w-[11ch] text-3xl font-black leading-[.96] tracking-[-0.055em] sm:text-4xl">
              Não configure. Veja ganhar vida.
            </h2>
            <p className="mt-3 max-w-[34ch] text-xs font-medium leading-relaxed text-white/40">
              Cada missão acende apenas quando a operação deixa um sinal real. Nada é marcado manualmente.
            </p>
          </div>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <b className="text-4xl font-black tracking-[-0.06em]">{completed}/5</b>
              <small className="ml-2 text-[0.52rem] font-black tracking-[0.1em] text-white/28">VIVAS</small>
            </div>
            <button
              type="button"
              aria-label="Atualizar implantação viva"
              onClick={() => void load()}
              disabled={loading}
              className="grid size-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/45 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-30"
            >
              <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="relative overflow-hidden rounded-[1.55rem] border border-white/[0.07] bg-black/15 p-3 sm:p-4">
            <div className="absolute left-[10%] right-[10%] top-[2.9rem] h-[2px] overflow-hidden rounded-full bg-white/[0.05]">
              <motion.i
                className="block h-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-violet-300"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 100, damping: 20 }}
              />
            </div>
            <div className="relative grid grid-cols-5 gap-1.5">
              {missions.map((mission, index) => {
                const Icon = mission.icon;
                const active = nextMission.key === mission.key && !mission.done;
                return (
                  <motion.button
                    key={mission.key}
                    type="button"
                    data-integration-mission={mission.key}
                    data-mission-state={mission.done ? "done" : active ? "next" : "waiting"}
                    onClick={mission.action}
                    className={`group min-w-0 rounded-[1.2rem] border p-2.5 text-left backdrop-blur-2xl transition sm:p-3 ${
                      mission.done
                        ? "border-emerald-200/20 bg-emerald-200/[0.06]"
                        : active
                          ? "border-cyan-200/22 bg-cyan-200/[0.065] shadow-[0_0_38px_rgba(103,232,249,.07)]"
                          : "border-white/[0.06] bg-white/[0.025]"
                    }`}
                    whileHover={reduced ? undefined : { y: -3, scale: 1.01 }}
                    whileTap={reduced ? undefined : { scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 250, damping: 22 }}
                  >
                    <span className={`relative grid size-9 place-items-center rounded-xl border ${mission.done ? "border-emerald-200/20 bg-emerald-200/[0.08] text-emerald-100" : active ? "border-cyan-200/20 bg-cyan-200/[0.08] text-cyan-100" : "border-white/[0.08] bg-black/20 text-white/32"}`}>
                      {mission.done ? <Check size={15} /> : <Icon size={15} />}
                      {active && !reduced && (
                        <motion.i
                          className="absolute inset-[-4px] rounded-[.9rem] border border-cyan-300/18"
                          animate={{ opacity: [0.2, 0.65, 0.2], scale: [0.96, 1.08, 0.96] }}
                          transition={{ duration: 2.1, repeat: Infinity }}
                        />
                      )}
                    </span>
                    <small className="mt-3 block truncate text-[0.46rem] font-black tracking-[0.1em] text-white/28">{mission.eyebrow}</small>
                    <b className="mt-1 block text-[0.62rem] leading-tight text-white/72 sm:text-[0.68rem]">{mission.label}</b>
                    <span className="mt-2 hidden text-[0.54rem] leading-snug text-white/32 md:line-clamp-2 md:block">{mission.description}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <motion.div
            data-next-integration-mission={nextMission.key}
            className="grid gap-3 rounded-[1.55rem] border border-cyan-100/12 bg-[linear-gradient(110deg,rgba(103,232,249,.055),rgba(255,255,255,.025),rgba(167,139,250,.04))] p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
            layout
          >
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-[0.5rem] font-black tracking-[0.13em] text-cyan-100/55">
                {completed === 5 ? <Sparkles size={12} /> : <CircleDot size={12} />}
                {completed === 5 ? "CICLO DE IMPLANTAÇÃO COMPLETO" : "PRÓXIMA MISSÃO"}
              </span>
              <h3 className="mt-1.5 text-lg font-black tracking-[-0.035em] text-white/90 sm:text-xl">{nextMission.label}</h3>
              <p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-white/38">{nextMission.description}</p>
            </div>
            <motion.button
              type="button"
              onClick={nextMission.action}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-100/15 bg-cyan-200 px-4 text-xs font-black text-slate-950 shadow-[0_10px_34px_rgba(103,232,249,.12)]"
              whileHover={reduced ? undefined : { scale: 1.018, y: -2 }}
              whileTap={reduced ? undefined : { scale: 0.985 }}
            >
              {nextMission.actionLabel} <ExternalLink size={13} />
            </motion.button>
          </motion.div>
        </div>
      </div>

      <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 px-2 text-[0.5rem] font-bold text-white/26">
        <span>{snapshot.partial ? "Alguns sinais ainda não responderam · leitura parcial" : "Sinais vindos das APIs e da operação real"}</span>
        <span className="hidden sm:inline">Canal → dinheiro → pedido → cozinha → resultado</span>
      </div>
    </section>
  );
}

export function IntegrationMissionPathPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);

  useEffect(() => {
    let ownedHost: HTMLElement | null = null;
    let cancelled = false;

    const mount = async () => {
      const hero = document.querySelector<HTMLElement>(".cx-hero");
      if (!hero) return;
      let target = document.querySelector<HTMLElement>("[data-integration-mission-path-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-integration-mission-path-host", "true");
        hero.insertAdjacentElement("afterend", target);
        ownedHost = target;
      }
      if (!cancelled) setHost(target);

      const selected = document.querySelector<HTMLSelectElement>(".cx-top select");
      if (selected?.value) {
        setBusinessId(Number(selected.value));
        return;
      }
      const token = localStorage.getItem("c360_token") || "";
      if (!token) return;
      try {
        const me = await request("/me", {}, token);
        if (!cancelled) setBusinessId(Number(me.businesses?.[0]?.id || 0));
      } catch {
        // The Connections Hub remains usable even when this visual layer cannot read /me.
      }
    };

    const observer = new MutationObserver(() => void mount());
    observer.observe(document.body, { childList: true, subtree: true });
    void mount();

    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches(".cx-top select")) setBusinessId(Number(target.value || 0));
    };
    document.addEventListener("change", onChange, true);

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("change", onChange, true);
      if (ownedHost?.isConnected) ownedHost.remove();
    };
  }, []);

  if (!host || !businessId) return null;
  return createPortal(<IntegrationMissionPath businessId={businessId} />, host);
}
