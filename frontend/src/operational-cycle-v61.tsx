import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  RefreshCcw,
  ShoppingBag,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, request, type Dashboard, type Finance, type InventoryAlert, type KdsOrder } from "./app";

type Order = {
  id: number;
  status: string;
  source: string;
  total_cents: number;
  contribution_cents: number;
  paid: boolean;
  delayed: boolean;
  inventory_consumed?: boolean;
  created_at: string;
};

type Business = { id: number; name: string };
type SignalState = "quiet" | "live" | "passed" | "attention";
type Snapshot = {
  business: Business | null;
  orders: Order[];
  kds: KdsOrder[];
  alerts: InventoryAlert[];
  dashboard: Dashboard | null;
  finance: Finance | null;
  updatedAt: Date | null;
  partial: boolean;
};

type Step = {
  key: "sale" | "kitchen" | "stock" | "cash" | "margin";
  label: string;
  icon: typeof ShoppingBag;
  state: SignalState;
  value: string;
  detail: string;
  route: string;
};

const emptySnapshot: Snapshot = {
  business: null,
  orders: [],
  kds: [],
  alerts: [],
  dashboard: null,
  finance: null,
  updatedAt: null,
  partial: false,
};

const stateStyles: Record<SignalState, string> = {
  quiet: "border-white/[0.07] bg-white/[0.025] text-white/38",
  live: "border-cyan-200/25 bg-cyan-200/[0.075] text-cyan-100 shadow-[0_0_30px_rgba(103,232,249,.08)]",
  passed: "border-emerald-200/25 bg-emerald-200/[0.075] text-emerald-100 shadow-[0_0_30px_rgba(110,231,183,.08)]",
  attention: "border-amber-200/30 bg-amber-200/[0.09] text-amber-100 shadow-[0_0_32px_rgba(252,211,77,.10)]",
};

const dotStyles: Record<SignalState, string> = {
  quiet: "bg-white/20",
  live: "bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,.65)]",
  passed: "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.62)]",
  attention: "bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,.62)]",
};

function sameLocalDay(raw: string) {
  const d = new Date(raw);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function currentStage() {
  const p = new URLSearchParams(window.location.search);
  if (p.get("quick") === "1" || p.get("delivery") === "1" || p.get("direct") === "1") return "sale";
  if (p.get("kitchen") === "1") return "kitchen";
  if (window.location.hash === "#produtos" || p.get("purchases") === "1" || p.get("suppliers") === "1") return "stock";
  if (p.get("cash") === "1") return "cash";
  if (p.get("margin") === "1" || p.get("cmv") === "1") return "margin";
  return "";
}

function go(route: string) {
  const next = new URL(window.location.href);
  next.search = "";
  next.hash = "";
  if (route === "#produtos") next.hash = "produtos";
  else next.searchParams.set(route, "1");
  window.location.assign(next.toString());
}

function sourceLabel(source: string) {
  const key = source.toLowerCase();
  if (key.includes("ifood")) return "iFood";
  if (key.includes("99")) return "99Food";
  if (key.includes("keeta")) return "Keeta";
  if (key.includes("whatsapp")) return "WhatsApp";
  if (key.includes("direct") || key.includes("store")) return "Canal próprio";
  if (key.includes("counter") || key.includes("balcao")) return "Balcão";
  return source || "Operação";
}

export function OperationalCycleV61() {
  const token = localStorage.getItem("c360_token") || "";
  const reduced = Boolean(useReducedMotion());
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(() => {
    const saved = sessionStorage.getItem("c360-cycle-v61-open");
    return saved == null ? window.innerWidth >= 1180 : saved === "1";
  });
  const mounted = useRef(true);

  async function load() {
    if (!token || !navigator.onLine || loading) return;
    setLoading(true);
    try {
      const me = await request("/me", {}, token);
      const business = ((me.businesses || []) as Business[])[0] || null;
      if (!business) {
        if (mounted.current) setSnapshot(emptySnapshot);
        return;
      }
      const paths = [
        `/businesses/${business.id}/orders`,
        `/businesses/${business.id}/kds`,
        `/businesses/${business.id}/inventory/alerts`,
        `/businesses/${business.id}/dashboard`,
        `/businesses/${business.id}/finance/summary?days=30`,
      ];
      const settled = await Promise.allSettled(paths.map((path) => request(path, {}, token)));
      if (!mounted.current) return;
      const pick = <T,>(index: number, fallback: T): T =>
        settled[index]?.status === "fulfilled" ? (settled[index] as PromiseFulfilledResult<T>).value : fallback;
      const kdsPayload = pick<any>(1, { orders: [] });
      setSnapshot({
        business,
        orders: pick<Order[]>(0, []),
        kds: Array.isArray(kdsPayload?.orders) ? kdsPayload.orders : [],
        alerts: pick<InventoryAlert[]>(2, []),
        dashboard: pick<Dashboard | null>(3, null),
        finance: pick<Finance | null>(4, null),
        updatedAt: new Date(),
        partial: settled.some((entry) => entry.status === "rejected"),
      });
    } catch {
      if (mounted.current) setSnapshot((prev) => ({ ...prev, partial: true }));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (token) void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    }, 30000);
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    const online = () => void load();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    window.addEventListener("c360:auth", online as EventListener);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", online);
      window.removeEventListener("c360:auth", online as EventListener);
    };
  }, [token]);

  useEffect(() => {
    sessionStorage.setItem("c360-cycle-v61-open", open ? "1" : "0");
  }, [open]);

  const todayOrders = useMemo(
    () => snapshot.orders.filter((order) => sameLocalDay(order.created_at)),
    [snapshot.orders],
  );
  const paidToday = todayOrders.filter((order) => order.paid).length;
  const completedToday = todayOrders.filter((order) => order.status === "completed").length;
  const activeKds = snapshot.kds.filter((order) => !["completed", "cancelled"].includes(order.status));
  const delayedKds = activeKds.filter((order) => order.delayed).length;
  const stockTouched = todayOrders.some((order) => order.inventory_consumed === true);
  const revenue = Number(snapshot.dashboard?.pulse?.revenue_cents || 0);
  const contribution = Number(snapshot.dashboard?.pulse?.contribution_cents || 0);
  const marginPct = revenue > 0 ? Math.round((contribution / revenue) * 100) : null;
  const sources = Array.from(new Set(todayOrders.map((order) => sourceLabel(order.source)).filter(Boolean))).slice(0, 6);

  const steps: Step[] = [
    {
      key: "sale",
      label: "Venda",
      icon: ShoppingBag,
      state: todayOrders.length ? "live" : "quiet",
      value: todayOrders.length ? `${todayOrders.length} hoje` : "aguardando",
      detail: todayOrders.length
        ? `${paidToday} pagos · ${sources.length || 1} ${sources.length === 1 ? "origem" : "origens"}`
        : "O próximo pedido acende o ciclo.",
      route: "quick",
    },
    {
      key: "kitchen",
      label: "Cozinha",
      icon: ChefHat,
      state: delayedKds ? "attention" : activeKds.length ? "live" : completedToday || todayOrders.length ? "passed" : "quiet",
      value: delayedKds ? `${delayedKds} atrasado${delayedKds === 1 ? "" : "s"}` : activeKds.length ? `${activeKds.length} em preparo` : completedToday ? `${completedToday} passou` : "em espera",
      detail: delayedKds ? "Prioridade operacional agora." : activeKds.length ? "KDS recebendo o fluxo." : todayOrders.length ? "Sem fila ativa neste momento." : "A cozinha acende após a venda.",
      route: "kitchen",
    },
    {
      key: "stock",
      label: "Estoque",
      icon: Boxes,
      state: snapshot.alerts.length ? "attention" : stockTouched ? "passed" : todayOrders.length ? "live" : "quiet",
      value: snapshot.alerts.length ? `${snapshot.alerts.length} atenção` : stockTouched ? "baixa feita" : todayOrders.length ? "monitorando" : "em espera",
      detail: snapshot.alerts.length ? "Reposição merece revisão." : stockTouched ? "Consumo confirmado pelo servidor." : todayOrders.length ? "Aguardando baixa confirmada." : "Sem movimento hoje.",
      route: "#produtos",
    },
    {
      key: "cash",
      label: "Caixa",
      icon: WalletCards,
      state: paidToday ? "passed" : todayOrders.length ? "live" : "quiet",
      value: revenue ? money(revenue) : paidToday ? `${paidToday} pago${paidToday === 1 ? "" : "s"}` : "sem entrada",
      detail: paidToday ? `${paidToday} confirmação${paidToday === 1 ? "" : "ões"} de pagamento hoje.` : todayOrders.length ? "Pedidos existem; aguardando confirmação financeira." : "Nenhuma entrada confirmada hoje.",
      route: "cash",
    },
    {
      key: "margin",
      label: "Margem",
      icon: TrendingUp,
      state: revenue > 0 && contribution < 0 ? "attention" : revenue > 0 ? "passed" : "quiet",
      value: marginPct == null ? "sem leitura" : `${marginPct}%`,
      detail: revenue > 0 ? `${money(contribution)} de contribuição no pulso atual.` : "A margem aparece quando existe venda registrada.",
      route: "margin",
    },
  ];

  const litCount = steps.filter((step) => step.state !== "quiet").length;
  const attentionCount = steps.filter((step) => step.state === "attention").length;
  const active = currentStage();
  const updated = snapshot.updatedAt?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) || "—";

  if (!token) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[84] flex justify-center px-3 sm:bottom-4" data-operational-cycle-v61>
      <AnimatePresence initial={false} mode="wait">
        {!open ? (
          <motion.button
            key="collapsed"
            type="button"
            aria-label="Abrir fluxo vivo da operação"
            aria-expanded="false"
            data-operational-cycle-toggle
            onClick={() => setOpen(true)}
            className="pointer-events-auto flex min-h-12 items-center gap-3 rounded-full border border-white/[0.09] bg-[#091019]/82 px-4 text-white shadow-[0_20px_70px_rgba(0,0,0,.35),inset_0_1px_rgba(255,255,255,.07)] backdrop-blur-3xl"
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: 8, scale: 0.97 }}
            whileHover={reduced ? undefined : { scale: 1.015 }}
            whileTap={reduced ? undefined : { scale: 0.985 }}
          >
            <span className="relative grid size-8 place-items-center rounded-full border border-emerald-200/20 bg-emerald-200/[0.08] text-emerald-100">
              {!reduced && litCount > 0 && <span className="absolute inset-0 animate-ping rounded-full border border-emerald-300/20" />}
              <Activity size={15} />
            </span>
            <span className="grid text-left leading-none">
              <small className="text-[0.52rem] font-black tracking-[0.15em] text-white/38">FLUXO VIVO</small>
              <b className="mt-1 text-xs">{litCount}/5 etapas com sinal</b>
            </span>
            {attentionCount > 0 && <span className="rounded-full bg-amber-300 px-2 py-1 text-[0.58rem] font-black text-slate-950">{attentionCount} ATENÇÃO</span>}
          </motion.button>
        ) : (
          <motion.section
            key="expanded"
            aria-label="Fluxo vivo da operação"
            className="pointer-events-auto w-full max-w-[980px] overflow-hidden rounded-[1.65rem] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(8,14,22,.91),rgba(8,12,18,.96))] text-white shadow-[0_28px_90px_rgba(0,0,0,.42),inset_0_1px_rgba(255,255,255,.07)] backdrop-blur-3xl"
            initial={reduced ? false : { opacity: 0, y: 24, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: 16, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 190, damping: 24 }}
          >
            <div className="relative overflow-hidden border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <div aria-hidden="true" className="absolute -left-16 -top-20 size-52 rounded-full bg-emerald-300/[0.075] blur-[80px]" />
              <div aria-hidden="true" className="absolute -right-12 -top-24 size-56 rounded-full bg-cyan-300/[0.07] blur-[90px]" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-emerald-100">
                    {!reduced && litCount > 0 && <motion.i className="absolute inset-[-4px] rounded-[.9rem] border border-emerald-300/15" animate={{ opacity: [0.15, 0.5, 0.15], scale: [0.96, 1.08, 0.96] }} transition={{ duration: 2.4, repeat: Infinity }} />}
                    <Activity size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[0.62rem] tracking-[0.16em] text-white/58">FLUXO VIVO · {snapshot.business?.name || "OPERAÇÃO"}</b>
                      {snapshot.partial && <span className="rounded-full border border-amber-200/15 bg-amber-200/[0.07] px-2 py-1 text-[0.5rem] font-black tracking-[0.08em] text-amber-100/75">LEITURA PARCIAL</span>}
                    </div>
                    <p className="m-0 mt-1 text-xs text-white/42">{litCount === 5 ? "O ciclo inteiro deixou sinal real." : `${litCount}/5 etapas já deixaram sinal real hoje.`}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => void load()} disabled={loading} aria-label="Atualizar fluxo" className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-white/48 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-35">
                    <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                  </button>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Recolher fluxo vivo" aria-expanded="true" data-operational-cycle-toggle className="grid size-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-white/48 transition hover:bg-white/[0.07] hover:text-white">
                    <ChevronDown size={15} />
                  </button>
                </div>
              </div>

              {sources.length > 0 && (
                <div className="relative mt-3 overflow-hidden rounded-xl border border-white/[0.05] bg-black/15 py-1.5">
                  <motion.div
                    className="flex w-max items-center gap-2 px-3"
                    animate={reduced || sources.length < 2 ? undefined : { x: [0, -80, 0] }}
                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                  >
                    {[...sources, ...sources].map((source, index) => (
                      <span key={`${source}-${index}`} className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.035] px-2.5 py-1 text-[0.52rem] font-black tracking-[0.08em] text-white/45">
                        <i className="size-1.5 rounded-full bg-cyan-300/70" /> {source}
                      </span>
                    ))}
                  </motion.div>
                </div>
              )}
            </div>

            <div className="relative grid grid-cols-5 gap-1.5 p-2 sm:gap-2 sm:p-3">
              <div aria-hidden="true" className="pointer-events-none absolute left-[10%] right-[10%] top-[41%] h-px bg-gradient-to-r from-cyan-300/12 via-emerald-300/18 to-violet-300/12" />
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = active === step.key;
                return (
                  <motion.button
                    key={step.key}
                    type="button"
                    data-operational-cycle-step={step.key}
                    onClick={() => go(step.route)}
                    className={`group relative z-10 min-w-0 rounded-[1.15rem] border px-2 py-3 text-left backdrop-blur-2xl transition ${stateStyles[step.state]} ${isActive ? "ring-1 ring-white/20" : ""}`}
                    whileHover={reduced ? undefined : { y: -3, scale: 1.012 }}
                    whileTap={reduced ? undefined : { scale: 0.985 }}
                    transition={{ type: "spring", stiffness: 280, damping: 22 }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="grid size-8 place-items-center rounded-xl border border-current/10 bg-black/20 sm:size-9">
                        <Icon size={15} />
                      </span>
                      <span className={`size-2 rounded-full ${dotStyles[step.state]}`} />
                    </div>
                    <div className="mt-3 grid gap-0.5">
                      <small className="truncate text-[0.5rem] font-black tracking-[0.12em] text-current/55">0{index + 1} · {step.label.toUpperCase()}</small>
                      <b className="truncate text-[0.68rem] sm:text-xs">{step.value}</b>
                      <span className="mt-1 hidden text-[0.58rem] leading-snug text-current/45 sm:line-clamp-2 sm:block">{step.detail}</span>
                    </div>
                    {step.state === "attention" && <AlertTriangle size={12} className="absolute right-2 top-2 text-amber-200/65" />}
                    {step.state === "passed" && <CheckCircle2 size={12} className="absolute right-2 top-2 text-emerald-200/60" />}
                  </motion.button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.055] px-4 py-2 text-[0.52rem] font-bold text-white/28 sm:px-5">
              <span>{navigator.onLine ? "Nuvem sincronizada" : "Leitura local · sem internet"} · última leitura {updated}</span>
              <span className="hidden sm:inline">Venda → Cozinha → Estoque → Caixa → Margem</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
