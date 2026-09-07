import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ChefHat,
  CircleDollarSign,
  Gauge,
  Layers3,
  Radar,
  ShoppingBag,
  Sparkles,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

type SignalId = "orders" | "production" | "stock" | "margin";

type Signal = {
  id: SignalId;
  label: string;
  prompt: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
  capture: string;
  decision: string;
  action: string;
  before: string;
  after: string;
};

const signals: Signal[] = [
  {
    id: "orders",
    label: "Pedido fora do fluxo",
    prompt: "WhatsApp, balcão e delivery disputam atenção.",
    icon: ShoppingBag,
    accent: "text-amber-200",
    glow: "rgba(255,189,89,.22)",
    capture: "Entrada reunida",
    decision: "Prioridade por prazo",
    action: "Fila atualizada",
    before: "Caçando contexto",
    after: "1 próxima ação",
  },
  {
    id: "production",
    label: "Produção atrasando",
    prompt: "A equipe descobre a urgência tarde demais.",
    icon: ChefHat,
    accent: "text-emerald-200",
    glow: "rgba(110,231,199,.2)",
    capture: "SLA percebido",
    decision: "Lote reordenado",
    action: "Ritmo compartilhado",
    before: "Interrupções",
    after: "Fila viva",
  },
  {
    id: "stock",
    label: "Estoque no limite",
    prompt: "A falta aparece quando já virou urgência.",
    icon: Boxes,
    accent: "text-violet-200",
    glow: "rgba(159,122,234,.22)",
    capture: "Consumo lido",
    decision: "Risco antecipado",
    action: "Compra sugerida",
    before: "Surpresa",
    after: "Antecipação",
  },
  {
    id: "margin",
    label: "Venda sem sobra",
    prompt: "Faturamento cresce, mas a margem não acompanha.",
    icon: CircleDollarSign,
    accent: "text-rose-200",
    glow: "rgba(251,113,133,.18)",
    capture: "Custo + taxa",
    decision: "Contribuição real",
    action: "Preço sinalizado",
    before: "Achismo",
    after: "Margem visível",
  },
];

function SignalButton({
  signal,
  active,
  explored,
  onSelect,
}: {
  signal: Signal;
  active: boolean;
  explored: boolean;
  onSelect: () => void;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const Icon = signal.icon;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group relative min-h-40 overflow-hidden rounded-[1.6rem] border p-4 text-left backdrop-blur-2xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 ${
        active
          ? "border-white/20 bg-white/[0.085]"
          : "border-white/[0.08] bg-white/[0.035] hover:border-white/[0.14] hover:bg-white/[0.055]"
      }`}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.012 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 250, damping: 20 }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-3xl transition-opacity duration-500"
        style={{ background: signal.glow, opacity: active ? 1 : 0.48 }}
      />
      <span className="relative flex h-full flex-col justify-between gap-5">
        <span className="flex items-start justify-between gap-3">
          <i
            className={`grid size-10 place-items-center rounded-2xl border border-white/10 bg-black/20 ${signal.accent}`}
          >
            <Icon size={19} />
          </i>
          <span
            className={`grid size-7 place-items-center rounded-full border text-[0.62rem] font-black ${
              explored
                ? "border-emerald-200/35 bg-emerald-200 text-slate-950"
                : active
                  ? "border-white/25 bg-white/10 text-white"
                  : "border-white/10 text-white/35"
            }`}
          >
            {explored ? <Check size={13} /> : "●"}
          </span>
        </span>
        <span className="grid gap-2">
          <b className="text-[0.95rem] font-black tracking-[-0.02em] text-white">
            {signal.label}
          </b>
          <small className="max-w-[27ch] text-[0.72rem] font-medium leading-5 text-white/40">
            {signal.prompt}
          </small>
        </span>
      </span>
    </motion.button>
  );
}

function FlowNode({
  marker,
  label,
  icon: Icon,
  delay,
}: {
  marker: string;
  label: string;
  icon: LucideIcon;
  delay: number;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  return (
    <motion.div
      className="relative z-10 grid min-h-28 content-between rounded-[1.4rem] border border-white/10 bg-slate-950/35 p-4 backdrop-blur-xl"
      initial={reduceMotion ? false : { opacity: 0.35, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 170, damping: 22, delay }}
    >
      <span className="flex items-center justify-between gap-3 text-white/35">
        <small className="text-[0.55rem] font-black tracking-[0.16em]">{marker}</small>
        <Icon size={15} />
      </span>
      <b className="max-w-[15ch] text-sm font-black leading-tight text-white/90">{label}</b>
    </motion.div>
  );
}

const fingerprintNodes: Record<SignalId, { x: string; y: string }> = {
  orders: { x: "14%", y: "18%" },
  production: { x: "86%", y: "18%" },
  stock: { x: "14%", y: "82%" },
  margin: { x: "86%", y: "82%" },
};

function ExplorationFingerprint({
  explored,
  activeId,
}: {
  explored: SignalId[];
  activeId: SignalId;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const connected = explored.length;
  return (
    <div className="relative z-10 mt-4 overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-black/20 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-[0.58rem] font-black tracking-[0.14em] text-white/40">
          <Radar size={14} className="text-emerald-200" /> MAPA DE ATENÇÃO
        </span>
        <span className="text-[0.58rem] font-black tracking-[0.12em] text-white/35">
          {connected === 4 ? "COMPLETO" : `${connected}/4 CONECTADOS`}
        </span>
      </div>

      <div className="relative mx-auto mt-3 h-40 w-full max-w-[31rem]" aria-label={`${connected} de 4 sinais conectados`}>
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="attention-line" x1="0" x2="1">
              <stop offset="0" stopColor="rgba(255,189,89,.75)" />
              <stop offset=".5" stopColor="rgba(110,231,199,.75)" />
              <stop offset="1" stopColor="rgba(159,122,234,.75)" />
            </linearGradient>
          </defs>
          {signals.map((signal) => {
            const node = fingerprintNodes[signal.id];
            const x = parseFloat(node.x);
            const y = parseFloat(node.y);
            const lit = explored.includes(signal.id);
            return (
              <motion.line
                key={signal.id}
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                stroke="url(#attention-line)"
                strokeWidth={lit ? 0.8 : 0.35}
                strokeDasharray={lit ? "0" : "2.5 4"}
                initial={false}
                animate={{ opacity: lit ? 0.7 : 0.12, pathLength: lit ? 1 : 0.45 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
              />
            );
          })}
        </svg>

        <motion.div
          className="absolute left-1/2 top-1/2 grid size-[4.8rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-emerald-100/15 bg-slate-950/75 text-center shadow-[0_0_55px_rgba(110,231,199,.08)] backdrop-blur-2xl"
          animate={
            reduceMotion
              ? undefined
              : { scale: connected >= 2 ? [1, 1.045, 1] : 1 }
          }
          transition={{ duration: 2.8, repeat: connected >= 2 ? Infinity : 0, ease: "easeInOut" }}
        >
          <span className="grid gap-0.5">
            <b className="text-lg font-black text-white">{connected || "·"}</b>
            <small className="text-[0.48rem] font-black tracking-[0.14em] text-white/30">
              {connected >= 2 ? "PADRÃO" : "SINAIS"}
            </small>
          </span>
        </motion.div>

        {signals.map((signal) => {
          const Icon = signal.icon;
          const node = fingerprintNodes[signal.id];
          const lit = explored.includes(signal.id);
          const active = activeId === signal.id;
          return (
            <motion.div
              key={signal.id}
              className={`absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border backdrop-blur-xl ${
                lit
                  ? `border-white/20 bg-white/[0.09] ${signal.accent}`
                  : "border-white/[0.07] bg-slate-950/65 text-white/20"
              }`}
              style={{ left: node.x, top: node.y, boxShadow: lit ? `0 0 28px ${signal.glow}` : undefined }}
              animate={{ scale: active ? 1.14 : lit ? 1 : 0.88, opacity: lit || active ? 1 : 0.55 }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 18 }}
              aria-hidden="true"
            >
              <Icon size={15} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function OperationalPlayground({ onContinue }: { onContinue: () => void }) {
  const reduceMotion = Boolean(useReducedMotion());
  const [activeId, setActiveId] = useState<SignalId>("orders");
  const [explored, setExplored] = useState<SignalId[]>([]);
  const active = useMemo(
    () => signals.find((signal) => signal.id === activeId) || signals[0],
    [activeId],
  );
  const ActiveIcon = active.icon;
  const progress = Math.round((explored.length / signals.length) * 100);
  const continueLabel =
    explored.length === 4
      ? "Mapa completo · revelar rota"
      : explored.length >= 2
        ? "Transformar meu padrão em rota"
        : "Seguir com este sinal";

  function selectSignal(id: SignalId) {
    setActiveId(id);
    setExplored((current) => (current.includes(id) ? current : [...current, id]));
  }

  return (
    <section className="relative z-[3] mx-auto w-[min(1400px,calc(100%-2rem))] py-[clamp(6rem,11vw,11rem)]">
      <div className="mb-8 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.65fr)]">
        <div className="grid gap-4">
          <span className="text-[0.62rem] font-black tracking-[0.18em] text-amber-200/80">
            LABORATÓRIO DE SINAIS
          </span>
          <h2 className="max-w-[10ch] font-[var(--font-display)] text-[clamp(3rem,5.6vw,6.4rem)] font-black leading-[0.9] tracking-[-0.07em] text-white">
            Toque no ruído. Veja a operação reagir.
          </h2>
        </div>
        <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.025] p-4 backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-[0.68rem] font-bold text-white/45">
              <Radar size={15} className="text-emerald-200" /> sinais explorados
            </span>
            <b className="text-sm text-white">{explored.length}/4</b>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-200 via-emerald-200 to-violet-300"
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          <p className="mb-0 mt-3 text-[0.72rem] leading-5 text-white/35">
            Não existe resposta certa. Explore o que mais parece com o seu dia.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="grid gap-3 sm:grid-cols-2 xl:col-span-5">
          {signals.map((signal) => (
            <SignalButton
              key={signal.id}
              signal={signal}
              active={signal.id === activeId}
              explored={explored.includes(signal.id)}
              onSelect={() => selectSignal(signal.id)}
            />
          ))}
        </div>

        <motion.div
          layout
          className="relative min-h-[34rem] overflow-hidden rounded-[2.2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(18,24,36,.84),rgba(6,10,17,.78))] p-5 shadow-[inset_0_1px_rgba(255,255,255,.08),0_50px_120px_rgba(0,0,0,.28)] backdrop-blur-3xl sm:p-7 xl:col-span-7"
          transition={{ type: "spring", stiffness: 140, damping: 24 }}
        >
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute left-[45%] top-[20%] size-[26rem] rounded-full blur-[120px]"
            animate={{ backgroundColor: active.glow, scale: reduceMotion ? 1 : [0.9, 1.08, 0.96] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { scale: { duration: 8, repeat: Infinity, ease: "easeInOut" }, backgroundColor: { duration: 0.5 } }
            }
          />

          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <i className={`grid size-12 place-items-center rounded-[1.1rem] border border-white/10 bg-black/20 ${active.accent}`}>
                <ActiveIcon size={22} />
              </i>
              <span className="grid gap-1">
                <small className="text-[0.55rem] font-black tracking-[0.16em] text-white/35">SINAL ATIVO</small>
                <b className="text-base font-black text-white">{active.label}</b>
              </span>
            </div>
            <span className="rounded-full border border-emerald-200/15 bg-emerald-200/[0.05] px-3 py-2 text-[0.58rem] font-black tracking-[0.12em] text-emerald-100/75">
              SIMULAÇÃO · SEM CADASTRO
            </span>
          </div>

          <div className="relative z-10 mt-10 grid gap-3 md:grid-cols-3">
            <FlowNode marker="01 · CAPTAR" label={active.capture} icon={Radar} delay={0} />
            <FlowNode marker="02 · DECIDIR" label={active.decision} icon={Gauge} delay={0.06} />
            <FlowNode marker="03 · AGIR" label={active.action} icon={Layers3} delay={0.12} />
          </div>

          <ExplorationFingerprint explored={explored} activeId={activeId} />

          <div className="relative z-10 mt-4 grid gap-3 sm:grid-cols-2">
            <motion.div
              key={`${active.id}-before`}
              className="rounded-[1.5rem] border border-rose-200/10 bg-rose-300/[0.035] p-5"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="flex items-center gap-2 text-[0.58rem] font-black tracking-[0.14em] text-rose-100/45">
                <AlertTriangle size={14} /> ANTES
              </span>
              <strong className="mt-7 block font-[var(--font-display)] text-3xl font-black tracking-[-0.055em] text-white/75">
                {active.before}
              </strong>
            </motion.div>
            <motion.div
              key={`${active.id}-after`}
              className="rounded-[1.5rem] border border-emerald-200/15 bg-emerald-200/[0.045] p-5"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <span className="flex items-center gap-2 text-[0.58rem] font-black tracking-[0.14em] text-emerald-100/55">
                <Sparkles size={14} /> DEPOIS DO SINAL
              </span>
              <strong className="mt-7 block font-[var(--font-display)] text-3xl font-black tracking-[-0.055em] text-white">
                {active.after}
              </strong>
            </motion.div>
          </div>

          <div className="relative z-10 mt-5 flex flex-col justify-between gap-4 rounded-[1.4rem] border border-white/[0.075] bg-black/20 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <TimerReset size={17} className="text-amber-200" />
              <span className="grid gap-0.5">
                <b className="text-xs text-white/80">
                  {explored.length >= 2 ? "Seu padrão começa a aparecer." : "Você não precisa conhecer o sistema."}
                </b>
                <small className="text-[0.68rem] text-white/35">
                  {explored.length >= 2
                    ? "Continue explorando ou transforme o que já percebeu em uma rota."
                    : "O próximo passo apenas transforma o que você sentiu em uma rota."}
                </small>
              </span>
            </div>
            <motion.button
              type="button"
              onClick={onContinue}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200 ${
                explored.length >= 2
                  ? "border-emerald-100/30 bg-emerald-200 shadow-[0_12px_40px_rgba(110,231,199,.14)]"
                  : "border-amber-100/25 bg-amber-200 shadow-[0_12px_35px_rgba(255,189,89,.12)]"
              }`}
              whileHover={reduceMotion ? undefined : { y: -2, scale: 1.012 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
              {continueLabel} <ArrowRight size={15} />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}