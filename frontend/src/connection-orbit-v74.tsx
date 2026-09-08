import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  BadgeCheck,
  ChefHat,
  ChevronRight,
  CircleDollarSign,
  CircleDot,
  CreditCard,
  MapPin,
  MessageCircle,
  Orbit,
  PlugZap,
  Radar,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { request } from "./app";

type NativeState = "healthy" | "ready" | "connecting" | "stale" | "degraded" | "platform_setup";
type Native = { key: string; name: string; category: string; state: NativeState; score: number };
type Partner = { key: string; name: string; category: string; state: "available" | "requested" };
type Passport = {
  summary: { healthy: number; attention: number; ready: number; platform_setup: number; progress_percent: number };
  native: Native[];
  partners: Partner[];
};

const API =
  import.meta.env.VITE_CONNECT_ORCHESTRATOR_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-connect-orchestrator-v65";

const iconByProvider: Record<string, ComponentType<{ size?: number }>> = {
  whatsapp: MessageCircle,
  ifood: ShoppingBag,
  mercadopago: WalletCards,
  pagbank: CreditCard,
  google: MapPin,
  meta_ads: Radar,
  "99food": Store,
  keeta: Store,
  stone: CreditCard,
  cielo: CreditCard,
  getnet: CreditCard,
  rede: CreditCard,
};

const stateLabel: Record<NativeState, string> = {
  healthy: "VIVO",
  ready: "1 TOQUE",
  connecting: "LIGANDO",
  stale: "REVALIDAR",
  degraded: "REVISAR",
  platform_setup: "360 CUIDA",
};

const stateClass: Record<NativeState, string> = {
  healthy: "border-emerald-300/20 bg-emerald-300/[.07] text-emerald-100 shadow-[0_0_38px_rgba(52,211,153,.08)]",
  ready: "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100 shadow-[0_0_38px_rgba(34,211,238,.07)]",
  connecting: "border-violet-300/20 bg-violet-300/[.07] text-violet-100",
  stale: "border-amber-300/20 bg-amber-300/[.07] text-amber-100",
  degraded: "border-rose-300/20 bg-rose-300/[.07] text-rose-100",
  platform_setup: "border-white/10 bg-white/[.035] text-white/50",
};

async function remote(path: string, token: string) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Passaporte indisponível");
  return body as Passport;
}

function focusProvider(provider: Native) {
  const direct = document.querySelector<HTMLElement>(`[data-passport-provider="${CSS.escape(provider.key)}"]`);
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".cx-card,[data-pagbank-connection-card]"));
  const needle = provider.name.toLowerCase().replace(" business", "").replace(" / pix", "");
  const card = cards.find((item) => (item.textContent || "").toLowerCase().includes(needle));
  const target = direct || card;
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.animate(
    [
      { transform: "scale(1)", boxShadow: "0 0 0 rgba(103,232,249,0)" },
      { transform: "scale(1.018)", boxShadow: "0 0 0 3px rgba(103,232,249,.18),0 0 74px rgba(103,232,249,.15)" },
      { transform: "scale(1)", boxShadow: "0 0 0 rgba(103,232,249,0)" },
    ],
    { duration: 1200, easing: "ease-out" },
  );
}

function rank(progress: number) {
  if (progress >= 100) return ["ECOSSISTEMA VIVO", Sparkles] as const;
  if (progress >= 75) return ["OPERAÇÃO CONECTADA", Zap] as const;
  if (progress >= 45) return ["CIRCUITO ACENDENDO", Activity] as const;
  if (progress >= 15) return ["PRIMEIRO SINAL", PlugZap] as const;
  return ["MAPEANDO SUA COZINHA", CircleDot] as const;
}

export function ConnectionOrbitV74() {
  const reduced = Boolean(useReducedMotion());
  const [open, setOpen] = useState(true);
  const [passport, setPassport] = useState<Passport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    async function load() {
      const token = localStorage.getItem("c360_token") || "";
      if (!token) return;
      try {
        const me = await request("/me", {}, token);
        const businessId = Number(me.businesses?.[0]?.id || 0);
        if (!businessId) return;
        const next = await remote(`/businesses/${businessId}/passport`, token);
        if (!cancelled) {
          setPassport(next);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Pulso indisponível");
      }
    }
    void load();
    timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    }, 45000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const progress = passport?.summary.progress_percent || 0;
  const [rankName, RankIcon] = rank(progress);
  const native = passport?.native || [];
  const healthy = native.filter((item) => item.state === "healthy").length;
  const next = useMemo(
    () => native.find((item) => item.state === "degraded" || item.state === "stale") || native.find((item) => item.state === "ready" || item.state === "connecting") || null,
    [native],
  );
  const capabilities = [
    { label: "PEDIDO", icon: ShoppingBag, on: true },
    { label: "COZINHA", icon: ChefHat, on: true },
    { label: "PAGAR", icon: CircleDollarSign, on: native.some((item) => ["mercadopago", "pagbank"].includes(item.key) && item.state === "healthy") },
    { label: "RECOMPRA", icon: Users, on: native.some((item) => item.key === "whatsapp" && item.state === "healthy") },
  ];

  if (!open) {
    return (
      <motion.button
        data-connection-orbit-v74
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-16 right-4 z-[9994] flex h-12 items-center gap-2 rounded-full border border-cyan-200/15 bg-slate-950/75 px-4 text-[10px] font-black tracking-[.08em] text-cyan-50 shadow-[0_18px_60px_rgba(0,0,0,.32),0_0_35px_rgba(34,211,238,.07)] backdrop-blur-2xl"
        whileTap={reduced ? undefined : { scale: 0.96 }}
      >
        <Orbit size={17} /> CONSTELAÇÃO {healthy ? `· ${healthy} VIVAS` : ""}
      </motion.button>
    );
  }

  return (
    <motion.aside
      data-connection-orbit-v74
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 230, damping: 24 }}
      className="pointer-events-none fixed bottom-16 right-4 z-[9994] w-[min(410px,calc(100vw-24px))] overflow-hidden rounded-[2rem] border border-white/[.08] bg-[#09101a]/80 p-3 shadow-[0_30px_100px_rgba(0,0,0,.42),inset_0_1px_rgba(255,255,255,.05)] backdrop-blur-[28px] [&_button]:pointer-events-auto"
    >
      <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-cyan-300/[.055] blur-[70px]" />
      <div className="pointer-events-none absolute -right-20 top-16 h-64 w-64 rounded-full bg-violet-400/[.06] blur-[75px]" />

      <div className="relative flex items-start justify-between gap-3 rounded-[1.55rem] border border-white/[.055] bg-white/[.025] p-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200/10 bg-cyan-200/[.05] text-cyan-100 shadow-[0_0_36px_rgba(34,211,238,.07)]">
            <RankIcon size={19} />
          </div>
          <div className="min-w-0">
            <span className="block text-[8px] font-black tracking-[.16em] text-cyan-100/40">CONSTELAÇÃO 360 · V7.4</span>
            <b className="mt-1 block truncate text-[13px] font-black tracking-[-.02em] text-white/88">{rankName}</b>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.05]">
              <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-300/70 via-cyan-300/80 to-violet-300/75" initial={false} animate={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <button type="button" aria-label="Fechar constelação" onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.06] bg-white/[.025] text-white/35 hover:text-white/70"><X size={14} /></button>
      </div>

      <div className="relative mt-2 grid grid-cols-4 gap-1.5">
        {capabilities.map(({ label, icon: Icon, on }) => (
          <div key={label} className={`rounded-2xl border px-2 py-2.5 text-center ${on ? "border-emerald-200/10 bg-emerald-200/[.035] text-emerald-50/75" : "border-white/[.05] bg-white/[.018] text-white/25"}`}>
            <Icon size={14} className="mx-auto" />
            <span className="mt-1.5 block text-[7px] font-black tracking-[.08em]">{label}</span>
          </div>
        ))}
      </div>

      <div className="relative mt-2 grid grid-cols-2 gap-1.5" data-orbit-native-grid>
        {native.slice(0, 6).map((provider, index) => {
          const Icon = iconByProvider[provider.key] || PlugZap;
          return (
            <motion.button
              key={provider.key}
              type="button"
              data-orbit-provider={provider.key}
              data-orbit-state={provider.state}
              onClick={() => focusProvider(provider)}
              className={`group flex min-h-[68px] items-center gap-2.5 rounded-[1.2rem] border p-2.5 text-left ${stateClass[provider.state]}`}
              whileHover={reduced ? undefined : { y: -2, scale: 1.01 }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-current/10 bg-black/10"><Icon size={16} /></div>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[10px] font-black text-current/90">{provider.name}</b>
                <span className="mt-1 block text-[7px] font-black tracking-[.1em] text-current/55">{stateLabel[provider.state]}</span>
              </div>
              <motion.div animate={reduced ? undefined : provider.state === "healthy" ? { opacity: [0.35, 1, 0.35] } : undefined} transition={{ duration: 2.2 + index * 0.1, repeat: Infinity }}>
                {provider.state === "healthy" ? <BadgeCheck size={14} /> : <ChevronRight size={14} />}
              </motion.div>
            </motion.button>
          );
        })}
      </div>

      {passport?.partners?.length ? (
        <div className="relative mt-2 flex items-center gap-2 overflow-hidden rounded-[1.15rem] border border-white/[.05] bg-white/[.018] px-2.5 py-2">
          <span className="flex shrink-0 items-center gap-1.5 text-[7px] font-black tracking-[.1em] text-white/30"><Orbit size={12} /> PRÓXIMA ÓRBITA</span>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {passport.partners.slice(0, 5).map((partner) => {
              const Icon = iconByProvider[partner.key] || Store;
              return <span key={partner.key} title={`${partner.name} · ativação assistida`} className="flex shrink-0 items-center gap-1 rounded-full border border-white/[.05] bg-black/10 px-2 py-1 text-[7px] font-bold text-white/30"><Icon size={10} /> {partner.name}</span>;
            })}
          </div>
        </div>
      ) : null}

      <div className="relative mt-2 flex items-center justify-between gap-3 px-1 pb-0.5 pt-1">
        <div className="min-w-0">
          <span className="block text-[7px] font-black tracking-[.1em] text-white/25">PRÓXIMO MOVIMENTO</span>
          <b className="mt-1 block truncate text-[9px] font-bold text-white/55">{next ? `${next.name} · ${stateLabel[next.state]}` : healthy ? "Circuito estável. O sistema continua sentindo a operação." : "Escolha seu primeiro canal para acender o circuito."}</b>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[8px] font-black text-cyan-100/45"><Activity size={11} /> {progress}%</div>
      </div>
      {error ? <div className="relative mt-2 rounded-xl border border-amber-200/10 bg-amber-200/[.035] px-3 py-2 text-[8px] font-bold text-amber-50/55">Pulso visual temporariamente indisponível. As conexões reais continuam no painel.</div> : null}
    </motion.aside>
  );
}
