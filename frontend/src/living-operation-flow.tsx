import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  Bike,
  Check,
  ChefHat,
  CircleDollarSign,
  HeartHandshake,
  MessageCircle,
  MousePointer2,
  PlugZap,
  Radar,
  ShoppingBag,
  Sparkles,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type SignalId = "orders" | "production" | "stock" | "margin" | "clarity";
type ProviderId = "whatsapp" | "ifood" | "mercadopago" | "google" | "meta_ads";
type StageId = "entrada" | "pagamento" | "producao" | "entrega" | "retorno";

type Stage = {
  id: StageId;
  label: string;
  micro: string;
  icon: LucideIcon;
  tone: string;
  glow: string;
  before: string;
  engine: string;
  after: string;
};

type DiscoveryContext = {
  signal: SignalId;
  providers: ProviderId[];
};

const stages: Stage[] = [
  {
    id: "entrada",
    label: "Entrada",
    micro: "pedido nasce",
    icon: ShoppingBag,
    tone: "text-amber-100",
    glow: "rgba(253,230,138,.24)",
    before: "Vários canais disputando atenção",
    engine: "Canais convergem para uma fila",
    after: "Pedido entra com origem preservada",
  },
  {
    id: "pagamento",
    label: "Pagamento",
    micro: "valor confirma",
    icon: WalletCards,
    tone: "text-sky-100",
    glow: "rgba(125,211,252,.25)",
    before: "Conferência manual e troca de tela",
    engine: "Pagamento vira evento operacional",
    after: "Cozinha recebe o estado confiável",
  },
  {
    id: "producao",
    label: "Produção",
    micro: "cozinha reage",
    icon: ChefHat,
    tone: "text-emerald-100",
    glow: "rgba(110,231,183,.24)",
    before: "Comandas e prioridades desconectadas",
    engine: "KDS organiza ritmo e SLA",
    after: "Equipe enxerga o próximo movimento",
  },
  {
    id: "entrega",
    label: "Entrega",
    micro: "pedido se move",
    icon: Bike,
    tone: "text-violet-100",
    glow: "rgba(196,181,253,.24)",
    before: "Status espalhado entre pessoas e apps",
    engine: "Despacho e rastreio viram fluxo",
    after: "Cliente acompanha sem perseguir a loja",
  },
  {
    id: "retorno",
    label: "Retorno",
    micro: "cliente volta",
    icon: HeartHandshake,
    tone: "text-rose-100",
    glow: "rgba(253,164,175,.22)",
    before: "Venda termina quando o pedido sai",
    engine: "Histórico vira contexto de relacionamento",
    after: "Recompra nasce de comportamento real",
  },
];

const providerMeta: Record<ProviderId, { label: string; api: string; stage: StageId; icon: LucideIcon }> = {
  whatsapp: { label: "WhatsApp", api: "Cloud API", stage: "entrada", icon: MessageCircle },
  ifood: { label: "iFood", api: "Orders API", stage: "entrada", icon: ShoppingBag },
  mercadopago: { label: "Mercado Pago", api: "OAuth + Pix", stage: "pagamento", icon: CircleDollarSign },
  google: { label: "Google Business", api: "OAuth 2.0", stage: "retorno", icon: Radar },
  meta_ads: { label: "Meta Ads", api: "Marketing API", stage: "retorno", icon: Sparkles },
};

const signalFocus: Record<SignalId, StageId> = {
  orders: "entrada",
  margin: "pagamento",
  production: "producao",
  stock: "producao",
  clarity: "entrada",
};

function safeSignal(value: unknown): SignalId {
  return ["orders", "production", "stock", "margin"].includes(String(value))
    ? (value as SignalId)
    : "clarity";
}

function readContext(): DiscoveryContext {
  if (typeof window === "undefined") return { signal: "clarity", providers: [] };
  try {
    const exploration = JSON.parse(localStorage.getItem("c360_discovery_exploration") || "null");
    const intent = JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null");
    const allowed = new Set<ProviderId>(["whatsapp", "ifood", "mercadopago", "google", "meta_ads"]);
    const providers = Array.isArray(intent?.providers)
      ? intent.providers.filter((id: ProviderId) => allowed.has(id))
      : [];
    return {
      signal: safeSignal(intent?.signal || exploration?.last_signal || document.documentElement.dataset.discoverySignal),
      providers,
    };
  } catch {
    return { signal: safeSignal(document.documentElement.dataset.discoverySignal), providers: [] };
  }
}

function readVisited(): StageId[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem("c360_living_flow") || "null");
    return Array.isArray(value?.visited)
      ? value.visited.filter((id: StageId) => stages.some((stage) => stage.id === id))
      : [];
  } catch {
    return [];
  }
}

function StageButton({
  stage,
  active,
  visited,
  focused,
  providers,
  onClick,
}: {
  stage: Stage;
  active: boolean;
  visited: boolean;
  focused: boolean;
  providers: ProviderId[];
  onClick: () => void;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const Icon = stage.icon;
  const linked = providers.filter((id) => providerMeta[id].stage === stage.id);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative z-20 grid min-h-[8.4rem] place-items-center gap-3 overflow-hidden rounded-[1.6rem] border p-4 text-center backdrop-blur-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 ${
        active
          ? "border-white/25 bg-white/[0.11]"
          : visited
            ? "border-emerald-100/20 bg-emerald-100/[0.055]"
            : "border-white/[0.08] bg-white/[0.035]"
      }`}
      style={{ boxShadow: active ? `0 0 48px ${stage.glow}, inset 0 1px rgba(255,255,255,.08)` : undefined }}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.015 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      animate={active ? { scale: 1.025 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[15%] top-[-45%] h-24 rounded-full opacity-70 blur-3xl"
        style={{ background: stage.glow }}
      />
      {focused && !visited && (
        <span className="absolute right-3 top-3 size-2.5 rounded-full bg-amber-200 shadow-[0_0_22px_rgba(253,230,138,.55)]" />
      )}
      {visited && (
        <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-emerald-200 text-slate-950">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      <span className={`grid size-12 place-items-center rounded-2xl border border-white/10 bg-black/20 ${stage.tone}`}>
        <Icon size={21} />
      </span>
      <span className="grid gap-1">
        <b className="text-sm font-black tracking-[-0.03em] text-white">{stage.label}</b>
        <small className="text-[0.58rem] font-bold tracking-[0.11em] text-white/35">{stage.micro.toUpperCase()}</small>
      </span>
      {linked.length > 0 && (
        <span className="flex max-w-full flex-wrap justify-center gap-1">
          {linked.map((id) => (
            <small key={id} className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[0.48rem] font-black text-white/55">
              {providerMeta[id].label}
            </small>
          ))}
        </span>
      )}
    </motion.button>
  );
}

export function LivingOperationFlow() {
  const reduceMotion = Boolean(useReducedMotion());
  const [context, setContext] = useState<DiscoveryContext>(() => readContext());
  const [activeId, setActiveId] = useState<StageId>(() => signalFocus[readContext().signal]);
  const [visited, setVisited] = useState<StageId[]>(() => readVisited());
  const [pulse, setPulse] = useState(0);
  const active = stages.find((stage) => stage.id === activeId) || stages[0];
  const focusedId = signalFocus[context.signal];

  useEffect(() => {
    const sync = () => {
      const next = readContext();
      setContext(next);
      setActiveId((current) => (current ? current : signalFocus[next.signal]));
    };
    window.addEventListener("c360:discovery-exploration", sync as EventListener);
    window.addEventListener("c360:connection-intent", sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("c360:discovery-exploration", sync as EventListener);
      window.removeEventListener("c360:connection-intent", sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const plannedByStage = useMemo(() => {
    const grouped = new Map<StageId, ProviderId[]>();
    stages.forEach((stage) => grouped.set(stage.id, []));
    context.providers.forEach((provider) => grouped.get(providerMeta[provider].stage)?.push(provider));
    return grouped;
  }, [context.providers]);

  function explore(stage: Stage) {
    setActiveId(stage.id);
    setPulse((value) => value + 1);
    setVisited((current) => {
      const next = current.includes(stage.id) ? current : [...current, stage.id];
      try {
        const payload = { visited: next, last_stage: stage.id, updated_at: new Date().toISOString() };
        localStorage.setItem("c360_living_flow", JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent("c360:living-flow", { detail: payload }));
      } catch {
        // The visual flow works without persistence.
      }
      return next;
    });
  }

  const allVisited = visited.length === stages.length;

  return (
    <section
      data-living-operation-flow="true"
      className="relative z-[3] mx-auto w-[min(1400px,calc(100%-2rem))] overflow-hidden py-[clamp(6rem,11vw,11rem)]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute left-[3%] top-[17%] size-[28rem] rounded-full bg-sky-300/[0.055] blur-[125px]" />
      <div aria-hidden="true" className="pointer-events-none absolute right-[2%] top-[36%] size-[31rem] rounded-full bg-emerald-300/[0.055] blur-[135px]" />

      <div className="relative mb-10 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.62fr)]">
        <div className="grid gap-4">
          <span className="flex items-center gap-2 text-[0.62rem] font-black tracking-[0.18em] text-sky-200/80">
            <Radar size={15} /> OPERAÇÃO VIVA
          </span>
          <h2 className="max-w-[10ch] font-[var(--font-display)] text-[clamp(3rem,5.6vw,6.2rem)] font-black leading-[0.9] tracking-[-0.07em] text-white">
            Veja sua operação respirar.
          </h2>
        </div>
        <div className="grid gap-3 rounded-[1.7rem] border border-white/[0.08] bg-white/[0.035] p-5 shadow-[inset_0_1px_rgba(255,255,255,.06),0_24px_80px_rgba(0,0,0,.2)] backdrop-blur-3xl">
          <span className="flex items-center gap-2 text-[0.58rem] font-black tracking-[0.14em] text-white/35">
            <MousePointer2 size={13} /> TOQUE EM UM PONTO DO CICLO
          </span>
          <div className="flex items-end justify-between gap-4">
            <div>
              <b className="block text-3xl font-black tracking-[-0.05em] text-white">{visited.length}/5</b>
              <small className="font-bold text-white/40">zonas percebidas</small>
            </div>
            <span className={`rounded-full border px-3 py-1.5 text-[0.56rem] font-black tracking-[0.1em] ${allVisited ? "border-emerald-100/25 bg-emerald-200/[0.09] text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/45"}`}>
              {allVisited ? "CICLO VISÍVEL" : `${context.providers.length} CONEXÕES NA ROTA`}
            </span>
          </div>
        </div>
      </div>

      <div className="relative rounded-[2.3rem] border border-white/[0.08] bg-slate-950/45 p-3 shadow-[0_42px_120px_rgba(0,0,0,.28),inset_0_1px_rgba(255,255,255,.06)] backdrop-blur-3xl sm:p-5 lg:p-7">
        <div aria-hidden="true" className="absolute left-[8%] right-[8%] top-[6.1rem] hidden h-px bg-gradient-to-r from-amber-200/20 via-sky-200/25 via-emerald-200/25 via-violet-200/25 to-rose-200/20 lg:block" />
        {!reduceMotion && pulse > 0 && (
          <motion.span
            key={pulse}
            aria-hidden="true"
            className="absolute top-[6rem] hidden size-2 rounded-full bg-white shadow-[0_0_24px_rgba(255,255,255,.8)] lg:block"
            initial={{ left: "8%", opacity: 0 }}
            animate={{ left: "92%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.55, ease: "easeInOut" }}
          />
        )}

        <div className="grid gap-2.5 lg:grid-cols-5">
          {stages.map((stage) => (
            <StageButton
              key={stage.id}
              stage={stage}
              active={activeId === stage.id}
              visited={visited.includes(stage.id)}
              focused={focusedId === stage.id}
              providers={plannedByStage.get(stage.id) || []}
              onClick={() => explore(stage)}
            />
          ))}
        </div>

        <motion.div
          key={active.id}
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 22 }}
          className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_.75fr]"
        >
          <article className="relative overflow-hidden rounded-[1.9rem] border border-white/[0.09] bg-white/[0.04] p-5 sm:p-6">
            <span aria-hidden="true" className="absolute -right-16 -top-16 size-44 rounded-full blur-[55px]" style={{ background: active.glow }} />
            <div className="relative grid gap-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <small className="font-black tracking-[0.14em] text-white/35">AGORA · {active.label.toUpperCase()}</small>
                  <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">Toque e veja o estado mudar.</h3>
                </div>
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/20 ${active.tone}`}>
                  <active.icon size={21} />
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[['ANTES', active.before], ['MOTOR', active.engine], ['DEPOIS', active.after]].map(([label, value], index) => (
                  <div key={label} className={`rounded-[1.3rem] border p-4 ${index === 1 ? "border-emerald-100/15 bg-emerald-200/[0.055]" : "border-white/[0.07] bg-black/15"}`}>
                    <small className="text-[0.52rem] font-black tracking-[0.12em] text-white/30">{label}</small>
                    <p className="mt-2 text-sm font-bold leading-snug text-white/70">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <aside className="grid content-start gap-3 rounded-[1.9rem] border border-white/[0.08] bg-black/20 p-5 sm:p-6">
            <span className="flex items-center gap-2 text-[0.56rem] font-black tracking-[0.14em] text-white/35">
              <PlugZap size={13} /> CONEXÕES QUE VOCÊ ESCOLHEU
            </span>
            {context.providers.length ? (
              <div className="grid gap-2">
                {context.providers.map((provider) => {
                  const meta = providerMeta[provider];
                  const Icon = meta.icon;
                  return (
                    <div key={provider} className="flex items-center gap-3 rounded-[1.15rem] border border-white/[0.07] bg-white/[0.035] p-3">
                      <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-black/20 text-white/65"><Icon size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-xs font-black text-white/80">{meta.label}</b>
                        <small className="text-[0.55rem] font-bold tracking-[0.08em] text-white/30">{meta.api}</small>
                      </span>
                      <small className="rounded-full border border-emerald-100/15 bg-emerald-200/[0.06] px-2 py-1 text-[0.48rem] font-black text-emerald-100/65">NA ROTA</small>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-28 place-items-center rounded-[1.3rem] border border-dashed border-white/10 bg-white/[0.02] p-5 text-center">
                <span className="grid gap-2 text-white/35">
                  <PlugZap className="mx-auto" size={20} />
                  <small className="max-w-[24ch] font-bold leading-relaxed">A Galaxy só acende aqui o que você escolher conscientemente.</small>
                </span>
              </div>
            )}
          </aside>
        </motion.div>

        {allVisited && (
          <motion.button
            type="button"
            onClick={() => document.querySelector<HTMLElement>(".future-section")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-5 flex items-center gap-2 rounded-full border border-emerald-100/20 bg-emerald-200 px-5 py-3 text-xs font-black text-slate-950 shadow-[0_0_36px_rgba(110,231,183,.16)]"
            whileHover={reduceMotion ? undefined : { scale: 1.035 }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          >
            <Sparkles size={15} /> Ver a operação depois do ciclo
          </motion.button>
        )}
      </div>
    </section>
  );
}

const HOST_ATTRIBUTE = "data-living-operation-flow-host";

export function LivingOperationFlowPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function syncHost() {
      const anchor =
        document.querySelector<HTMLElement>("[data-plug-play-galaxy-host]") ||
        document.querySelector<HTMLElement>(".solution-section");
      const existing = document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`);

      if (!anchor) {
        existing?.remove();
        setHost(null);
        return;
      }

      if (existing) {
        if (existing.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", existing);
        setHost(existing);
        return;
      }

      const next = document.createElement("div");
      next.setAttribute(HOST_ATTRIBUTE, "");
      next.className = "relative z-[3]";
      anchor.insertAdjacentElement("afterend", next);
      setHost(next);
    }

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`)?.remove();
      setHost(null);
    };
  }, []);

  return host ? createPortal(<LivingOperationFlow />, host) : null;
}
