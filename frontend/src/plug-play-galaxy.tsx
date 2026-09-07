import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Compass,
  MapPinned,
  Megaphone,
  MessageCircle,
  PlugZap,
  Radar,
  ShoppingBag,
  Sparkles,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollRevealText } from "./experience-layer";

type SignalId = "orders" | "production" | "stock" | "margin" | "clarity";
type ProviderId = "whatsapp" | "ifood" | "mercadopago" | "google" | "meta_ads";

type Provider = {
  id: ProviderId;
  name: string;
  category: string;
  icon: LucideIcon;
  effect: string;
  found: string;
  tone: string;
  glow: string;
  point: { x: number; y: number };
};

const providers: Provider[] = [
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "CONVERSAS",
    icon: MessageCircle,
    effect: "A conversa pode nascer como pedido, sem redigitação.",
    found: "número empresarial",
    tone: "text-emerald-200",
    glow: "rgba(110,231,183,.26)",
    point: { x: 50, y: 8 },
  },
  {
    id: "ifood",
    name: "iFood",
    category: "MARKETPLACE",
    icon: ShoppingBag,
    effect: "O pedido entra na mesma fila operacional da cozinha.",
    found: "loja autorizada",
    tone: "text-rose-200",
    glow: "rgba(251,113,133,.24)",
    point: { x: 87, y: 34 },
  },
  {
    id: "mercadopago",
    name: "Mercado Pago",
    category: "PAGAMENTO",
    icon: WalletCards,
    effect: "Pix e pagamento podem confirmar o pedido automaticamente.",
    found: "conta do vendedor",
    tone: "text-sky-200",
    glow: "rgba(125,211,252,.24)",
    point: { x: 75, y: 83 },
  },
  {
    id: "google",
    name: "Google Business",
    category: "PRESENÇA LOCAL",
    icon: MapPinned,
    effect: "A presença local passa a conversar com a mesma operação.",
    found: "perfil da empresa",
    tone: "text-amber-200",
    glow: "rgba(253,230,138,.22)",
    point: { x: 25, y: 83 },
  },
  {
    id: "meta_ads",
    name: "Meta Ads",
    category: "AQUISIÇÃO",
    icon: Megaphone,
    effect: "Aquisição pode ser lida junto de venda e margem.",
    found: "conta de anúncios",
    tone: "text-violet-200",
    glow: "rgba(196,181,253,.24)",
    point: { x: 13, y: 34 },
  },
];

const suggestions: Record<SignalId, ProviderId[]> = {
  orders: ["whatsapp", "ifood", "mercadopago"],
  margin: ["mercadopago", "ifood", "meta_ads"],
  production: [],
  stock: [],
  clarity: [],
};

const signalCopy: Record<SignalId, { label: string; headline: string; note: string; icon: LucideIcon }> = {
  orders: {
    label: "PEDIDOS",
    headline: "Canais entram. Uma fila sai.",
    note: "Sua leitura indica que reduzir troca de contexto pode vir antes de adicionar mais ferramentas.",
    icon: ShoppingBag,
  },
  production: {
    label: "PRODUÇÃO",
    headline: "Primeiro organize o ritmo. Depois conecte o resto.",
    note: "Nenhuma API externa é obrigatória para começar a enxergar a fila de produção.",
    icon: Radar,
  },
  stock: {
    label: "ESTOQUE",
    headline: "A primeira evolução pode acontecer sem conexão externa.",
    note: "Consumo, mínimo e compras podem nascer dentro da operação antes de qualquer canal adicional.",
    icon: Compass,
  },
  margin: {
    label: "MARGEM",
    headline: "Venda, taxa e aquisição precisam conversar.",
    note: "Conexões entram quando ajudam a transformar faturamento em leitura de contribuição real.",
    icon: CircleDollarSign,
  },
  clarity: {
    label: "EXPLORAÇÃO",
    headline: "Toque nas conexões e descubra o que cada uma muda.",
    note: "Nada é obrigatório. A rota só guarda o que você escolher conscientemente.",
    icon: Sparkles,
  },
};

function readSignal(): SignalId {
  if (typeof window === "undefined") return "clarity";
  const dataset = document.documentElement.dataset.discoverySignal as SignalId | undefined;
  if (dataset && signalCopy[dataset]) return dataset;
  try {
    const exploration = JSON.parse(localStorage.getItem("c360_discovery_exploration") || "null");
    if (exploration?.last_signal && signalCopy[exploration.last_signal as SignalId]) return exploration.last_signal as SignalId;
    const profile = JSON.parse(localStorage.getItem("c360_discovery_profile") || "null");
    if (profile?.profile && signalCopy[profile.profile as SignalId]) return profile.profile as SignalId;
  } catch {
    // The experience remains usable without local persistence.
  }
  return "clarity";
}

function readPlanned(): ProviderId[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null");
    return Array.isArray(value?.providers)
      ? value.providers.filter((id: string) => providers.some((provider) => provider.id === id))
      : [];
  } catch {
    return [];
  }
}

function ProviderNode({
  provider,
  suggested,
  planned,
  active,
  onSelect,
}: {
  provider: Provider;
  suggested: boolean;
  planned: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = provider.icon;
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group absolute z-20 grid size-[4.8rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-center backdrop-blur-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 ${
        planned
          ? "border-emerald-100/35 bg-emerald-200/[0.11]"
          : active
            ? "border-white/25 bg-white/[0.11]"
            : suggested
              ? "border-white/[0.16] bg-white/[0.055]"
              : "border-white/[0.07] bg-slate-950/55"
      }`}
      style={{ left: `${provider.point.x}%`, top: `${provider.point.y}%`, boxShadow: planned || active ? `0 0 42px ${provider.glow}` : undefined }}
      whileHover={reduceMotion ? undefined : { scale: 1.08 }}
      whileTap={reduceMotion ? undefined : { scale: 0.95 }}
      animate={{ scale: active ? 1.08 : planned ? 1.03 : 1, opacity: suggested || planned || active ? 1 : 0.54 }}
      transition={{ type: "spring", stiffness: 250, damping: 18 }}
      title={provider.name}
    >
      <span className="grid place-items-center gap-1">
        <Icon size={20} className={provider.tone} />
        <small className="max-w-[8ch] text-[0.46rem] font-black leading-tight tracking-[-0.01em] text-white/60">
          {provider.name}
        </small>
      </span>
      {planned && (
        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-emerald-200 text-slate-950 shadow-[0_0_22px_rgba(110,231,183,.35)]">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      {!planned && suggested && (
        <span className="absolute -right-1 -top-1 size-3 rounded-full border border-amber-100/60 bg-amber-200 shadow-[0_0_18px_rgba(253,230,138,.32)]" />
      )}
    </motion.button>
  );
}

function MobileProvider({
  provider,
  suggested,
  planned,
  active,
  onSelect,
}: {
  provider: Provider;
  suggested: boolean;
  planned: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = provider.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex min-h-20 items-center gap-3 rounded-[1.2rem] border p-3 text-left backdrop-blur-2xl ${
        planned
          ? "border-emerald-100/25 bg-emerald-200/[0.08]"
          : active
            ? "border-white/20 bg-white/[0.08]"
            : "border-white/[0.08] bg-white/[0.035]"
      }`}
    >
      <i className={`grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 ${provider.tone}`}>
        <Icon size={18} />
      </i>
      <span className="grid min-w-0 gap-1">
        <b className="truncate text-xs font-black text-white">{provider.name}</b>
        <small className="text-[0.58rem] font-black tracking-[0.1em] text-white/35">
          {planned ? "NA SUA ROTA" : suggested ? "SUGERIDA" : "EXPLORAR"}
        </small>
      </span>
    </button>
  );
}

export function PlugPlayGalaxy() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const [signal, setSignal] = useState<SignalId>(() => readSignal());
  const [activeId, setActiveId] = useState<ProviderId>("whatsapp");
  const [planned, setPlanned] = useState<ProviderId[]>(() => readPlanned());
  const [explored, setExplored] = useState<ProviderId[]>([]);
  const recommended = suggestions[signal];
  const active = providers.find((provider) => provider.id === activeId) || providers[0];
  const copy = signalCopy[signal];
  const SignalIcon = copy.icon;
  const recommendedDone = recommended.length > 0 && recommended.every((id) => planned.includes(id));

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 24, mass: 0.35 });
  const glowY = useTransform(smooth, [0, 1], [80, -90]);
  const ringRotate = useTransform(smooth, [0, 1], [-7, 8]);
  const titleY = useTransform(smooth, [0, 0.5, 1], [28, 0, -18]);

  useEffect(() => {
    const sync = () => {
      const next = readSignal();
      setSignal(next);
      const suggested = suggestions[next];
      if (suggested.length) setActiveId((current) => (suggested.includes(current) ? current : suggested[0]));
    };
    const onExploration = () => sync();
    window.addEventListener("c360:discovery-exploration", onExploration as EventListener);
    window.addEventListener("storage", onExploration);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-discovery-signal"] });
    return () => {
      observer.disconnect();
      window.removeEventListener("c360:discovery-exploration", onExploration as EventListener);
      window.removeEventListener("storage", onExploration);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "c360_discovery_connection_intent",
        JSON.stringify({ providers: planned, signal, updated_at: new Date().toISOString() }),
      );
      window.dispatchEvent(new CustomEvent("c360:connection-intent", { detail: { providers: planned, signal } }));
    } catch {
      // Selection still works for the current session.
    }
  }, [planned, signal]);

  const plannedNames = useMemo(
    () => planned.map((id) => providers.find((provider) => provider.id === id)?.name).filter(Boolean),
    [planned],
  );

  function selectProvider(id: ProviderId) {
    setActiveId(id);
    setExplored((current) => (current.includes(id) ? current : [...current, id]));
  }

  function togglePlanned() {
    setPlanned((current) =>
      current.includes(active.id) ? current.filter((id) => id !== active.id) : [...current, active.id],
    );
  }

  return (
    <section ref={sectionRef} className="relative z-[3] mx-auto w-[min(1400px,calc(100%-2rem))] overflow-hidden py-[clamp(6rem,11vw,11rem)]">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-[10%] top-[26%] size-[34rem] rounded-full bg-emerald-300/[0.07] blur-[130px]"
        style={reduceMotion ? undefined : { y: glowY }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute right-[3%] top-[10%] size-[30rem] rounded-full bg-violet-300/[0.06] blur-[130px]"
        style={reduceMotion ? undefined : { y: useTransform(smooth, [0, 1], [-70, 80]) }}
      />

      <div className="relative mb-10 grid items-end gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.62fr)]">
        <motion.div className="grid gap-4" style={reduceMotion ? undefined : { y: titleY }}>
          <span className="flex items-center gap-2 text-[0.62rem] font-black tracking-[0.18em] text-emerald-200/80">
            <PlugZap size={15} /> CONNECTION GALAXY
          </span>
          <h2 className="max-w-[11ch] font-[var(--font-display)] text-[clamp(3rem,5.6vw,6.2rem)] font-black leading-[0.9] tracking-[-0.07em] text-white">
            Sua rota acende só o que precisa.
          </h2>
        </motion.div>
        <div className="rounded-[1.7rem] border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-3xl shadow-[inset_0_1px_rgba(255,255,255,.06)]">
          <span className="flex items-center gap-2 text-[0.58rem] font-black tracking-[0.14em] text-white/35">
            <SignalIcon size={14} className="text-amber-200" /> LEITURA ATUAL · {copy.label}
          </span>
          <div className="mt-3 text-[clamp(1.2rem,2vw,1.8rem)] font-black leading-tight tracking-[-0.04em] text-white">
            {copy.headline}
          </div>
          <p className="mb-0 mt-3 text-[0.72rem] leading-5 text-white/40">{copy.note}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.72fr)]">
        <div className="relative min-h-[40rem] overflow-hidden rounded-[2.4rem] border border-white/[0.09] bg-[radial-gradient(circle_at_50%_46%,rgba(110,231,183,.08),transparent_22%),linear-gradient(145deg,rgba(16,23,34,.88),rgba(5,9,16,.78))] p-5 shadow-[inset_0_1px_rgba(255,255,255,.07),0_45px_120px_rgba(0,0,0,.28)] backdrop-blur-3xl sm:p-7">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[0.6rem] font-black tracking-[0.14em] text-white/35">
              <Radar size={14} className="text-emerald-200" /> EXPLORE ANTES DE CONECTAR
            </span>
            <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-2 text-[0.55rem] font-black tracking-[0.12em] text-white/35">
              {planned.length ? `${planned.length} NA SUA ROTA` : "0 APIs OBRIGATÓRIAS"}
            </span>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 md:hidden">
            {providers.map((provider) => (
              <MobileProvider
                key={provider.id}
                provider={provider}
                suggested={recommended.includes(provider.id)}
                planned={planned.includes(provider.id)}
                active={active.id === provider.id}
                onSelect={() => selectProvider(provider.id)}
              />
            ))}
          </div>

          <div className="relative mx-auto mt-2 hidden h-[34rem] max-w-[48rem] md:block">
            <motion.div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 size-[25rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.055]"
              style={reduceMotion ? undefined : { rotate: ringRotate }}
            />
            <div aria-hidden="true" className="absolute left-1/2 top-1/2 size-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/[0.055]" />
            <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <defs>
                <linearGradient id="plug-play-line" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="rgba(110,231,183,.76)" />
                  <stop offset=".5" stopColor="rgba(253,230,138,.66)" />
                  <stop offset="1" stopColor="rgba(196,181,253,.7)" />
                </linearGradient>
              </defs>
              {providers.map((provider) => {
                const isPlanned = planned.includes(provider.id);
                const suggested = recommended.includes(provider.id);
                const isActive = active.id === provider.id;
                return (
                  <motion.line
                    key={provider.id}
                    x1="50"
                    y1="50"
                    x2={provider.point.x}
                    y2={provider.point.y}
                    stroke="url(#plug-play-line)"
                    strokeWidth={isPlanned ? 0.72 : suggested || isActive ? 0.42 : 0.24}
                    strokeDasharray={isPlanned ? "0" : "2.2 3.7"}
                    animate={{ opacity: isPlanned ? 0.78 : suggested || isActive ? 0.34 : 0.08, pathLength: isPlanned ? 1 : isActive ? 0.8 : 0.48 }}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
                  />
                );
              })}
            </svg>

            <motion.div
              className="absolute left-1/2 top-1/2 z-10 grid size-[10.5rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-emerald-100/15 bg-slate-950/75 text-center shadow-[0_0_90px_rgba(110,231,183,.12)] backdrop-blur-3xl"
              animate={reduceMotion ? undefined : { scale: planned.length ? [1, 1.025, 1] : 1 }}
              transition={{ duration: 3.4, repeat: planned.length ? Infinity : 0, ease: "easeInOut" }}
            >
              <span className="grid place-items-center gap-2">
                <i className="grid size-10 place-items-center rounded-2xl border border-emerald-100/15 bg-emerald-200/[0.08] text-emerald-200">
                  <PlugZap size={19} />
                </i>
                <span className="grid gap-0.5">
                  <b className="font-[var(--font-display)] text-xl font-black tracking-[-0.04em] text-white">Cozinha 360</b>
                  <small className="text-[0.48rem] font-black tracking-[0.14em] text-white/30">1 OPERAÇÃO</small>
                </span>
              </span>
            </motion.div>

            {providers.map((provider) => (
              <ProviderNode
                key={provider.id}
                provider={provider}
                suggested={recommended.includes(provider.id)}
                planned={planned.includes(provider.id)}
                active={active.id === provider.id}
                onSelect={() => selectProvider(provider.id)}
              />
            ))}
          </div>

          <div className="relative z-10 -mt-2 grid gap-3 rounded-[1.5rem] border border-white/[0.07] bg-black/20 p-4 backdrop-blur-xl sm:grid-cols-3 md:mt-[-1.5rem]">
            <div>
              <small className="text-[0.5rem] font-black tracking-[0.13em] text-white/30">01 · AUTORIZAR</small>
              <b className="mt-2 block text-sm font-black text-white/80">Você confirma</b>
            </div>
            <div>
              <small className="text-[0.5rem] font-black tracking-[0.13em] text-white/30">02 · ENCONTRAR</small>
              <b className="mt-2 block text-sm font-black text-white/80">O 360 acha a conta</b>
            </div>
            <div>
              <small className="text-[0.5rem] font-black tracking-[0.13em] text-white/30">03 · OPERAR</small>
              <b className="mt-2 block text-sm font-black text-white/80">O sinal entra no fluxo</b>
            </div>
          </div>
        </div>

        <motion.aside
          key={active.id}
          className="relative overflow-hidden rounded-[2.3rem] border border-white/[0.09] bg-[linear-gradient(155deg,rgba(20,27,40,.86),rgba(7,10,17,.82))] p-5 shadow-[inset_0_1px_rgba(255,255,255,.07),0_35px_100px_rgba(0,0,0,.24)] backdrop-blur-3xl sm:p-7"
          initial={reduceMotion ? false : { opacity: 0.55, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 23 }}
        >
          <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-[90px]" style={{ background: active.glow }} />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <i className={`grid size-12 place-items-center rounded-[1.1rem] border border-white/10 bg-black/20 ${active.tone}`}>
                <active.icon size={22} />
              </i>
              <span className="grid gap-1">
                <small className="text-[0.54rem] font-black tracking-[0.15em] text-white/30">{active.category}</small>
                <b className="text-lg font-black tracking-[-0.03em] text-white">{active.name}</b>
              </span>
            </div>
            <span className={`rounded-full border px-2.5 py-1.5 text-[0.5rem] font-black tracking-[0.1em] ${planned.includes(active.id) ? "border-emerald-100/20 bg-emerald-200/[0.08] text-emerald-100" : recommended.includes(active.id) ? "border-amber-100/20 bg-amber-200/[0.06] text-amber-100" : "border-white/[0.08] bg-white/[0.03] text-white/30"}`}>
              {planned.includes(active.id) ? "NA SUA ROTA" : recommended.includes(active.id) ? "SUGERIDA" : "EXPLORAÇÃO"}
            </span>
          </div>

          <div className="relative z-10 mt-9">
            <ScrollRevealText>{active.effect}</ScrollRevealText>
          </div>

          <div className="relative z-10 mt-7 grid gap-2">
            {[
              ["VOCÊ", "autoriza na tela oficial"],
              ["360", `encontra ${active.found}`],
              ["OPERAÇÃO", active.effect],
            ].map(([marker, text], index) => (
              <motion.div
                key={marker}
                className="flex min-h-16 items-center gap-3 rounded-[1.15rem] border border-white/[0.07] bg-white/[0.03] p-3"
                initial={reduceMotion ? false : { opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.055 }}
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-full border text-[0.58rem] font-black ${index === 2 ? "border-emerald-100/20 bg-emerald-200/[0.08] text-emerald-200" : "border-white/[0.08] bg-black/20 text-white/40"}`}>
                  {index + 1}
                </span>
                <span className="grid gap-0.5">
                  <small className="text-[0.48rem] font-black tracking-[0.13em] text-white/25">{marker}</small>
                  <b className="text-xs font-bold leading-5 text-white/72">{text}</b>
                </span>
              </motion.div>
            ))}
          </div>

          <motion.button
            type="button"
            onClick={togglePlanned}
            className={`relative z-10 mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 ${planned.includes(active.id) ? "border-white/10 bg-white/[0.045] text-white/65" : "border-emerald-100/25 bg-emerald-200 text-slate-950 shadow-[0_14px_44px_rgba(110,231,183,.14)]"}`}
            whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          >
            {planned.includes(active.id) ? (
              <>Remover da minha rota</>
            ) : (
              <>Adicionar à minha rota <ArrowRight size={14} /></>
            )}
          </motion.button>

          <div className="relative z-10 mt-5 rounded-[1.35rem] border border-white/[0.07] bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[0.55rem] font-black tracking-[0.12em] text-white/35">
                <Sparkles size={13} className="text-amber-200" /> SUA CONSTELAÇÃO
              </span>
              <b className="text-xs text-white/70">{planned.length}/5</b>
            </div>
            <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
              {plannedNames.length ? plannedNames.map((name) => (
                <span key={name} className="rounded-full border border-emerald-100/15 bg-emerald-200/[0.05] px-2.5 py-1 text-[0.52rem] font-bold text-emerald-100/70">{name}</span>
              )) : (
                <span className="text-[0.65rem] leading-5 text-white/30">Explore. Guarde apenas o que realmente faria sentido no seu dia.</span>
              )}
            </div>
            {recommendedDone && (
              <motion.div
                className="mt-3 flex items-center gap-2 rounded-xl border border-amber-100/15 bg-amber-200/[0.05] p-2.5 text-[0.62rem] font-bold text-amber-100/75"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Check size={13} /> Você entendeu todas as conexões sugeridas para este sinal.
              </motion.div>
            )}
          </div>

          <p className="relative z-10 mb-0 mt-4 text-[0.62rem] leading-5 text-white/28">
            Esta etapa só guarda preferências neste navegador. Nenhuma conta externa é conectada sem sua autorização explícita dentro da operação.
          </p>
        </motion.aside>
      </div>
    </section>
  );
}
