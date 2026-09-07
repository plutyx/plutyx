import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Check,
  CircleDot,
  CloudCog,
  Orbit,
  PlugZap,
  Radar,
  Rocket,
  ShoppingBag,
  Sparkles,
  Store,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ExpansionId = "pagbank" | "99food" | "keeta";
type PagBankHealth = {
  readiness?: {
    state?: "ready_to_authorize" | "partner_approval" | "platform_setup_required";
    platform_ready?: boolean;
  };
};

type Expansion = {
  id: ExpansionId;
  name: string;
  eyebrow: string;
  impact: string;
  capabilities: string[];
  tone: string;
  glow: string;
  point: { x: number; y: number };
};

const PAGBANK_API =
  import.meta.env.VITE_PAGBANK_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-pagbank-v59";

const expansions: Expansion[] = [
  {
    id: "pagbank",
    name: "PagBank",
    eyebrow: "PAGAMENTO",
    impact: "Um consentimento oficial pode transformar pagamento em evento operacional.",
    capabilities: ["OAuth Connect", "renovação", "revogação"],
    tone: "text-cyan-100",
    glow: "rgba(103,232,249,.25)",
    point: { x: 50, y: 12 },
  },
  {
    id: "99food",
    name: "99Food",
    eyebrow: "MARKETPLACE",
    impact: "Pedidos, cardápio e logística podem entrar na mesma fila quando a parceria técnica estiver certificada.",
    capabilities: ["Order", "Menu", "Logistics"],
    tone: "text-amber-100",
    glow: "rgba(253,230,138,.22)",
    point: { x: 83, y: 72 },
  },
  {
    id: "keeta",
    name: "Keeta",
    eyebrow: "MARKETPLACE",
    impact: "A API de parceiros pode sincronizar pedidos e menu quando o acesso técnico for aprovado.",
    capabilities: ["Orders", "Menu sync", "Core services"],
    tone: "text-emerald-100",
    glow: "rgba(110,231,183,.22)",
    point: { x: 17, y: 72 },
  },
];

const partnerPath = [
  "Certificação",
  "App de teste",
  "Depuração",
  "Aceitação",
  "Autorização",
  "Produção",
];

function readInterest(): ExpansionId[] {
  try {
    const raw = JSON.parse(localStorage.getItem("c360_ecosystem_interest") || "null");
    return Array.isArray(raw?.providers)
      ? raw.providers.filter((id: string) => id === "99food" || id === "keeta")
      : [];
  } catch {
    return [];
  }
}

function statusFor(id: ExpansionId, pagbank: PagBankHealth | null, loaded: boolean) {
  if (id === "99food") return { label: "PARCEIRO", note: "6 etapas oficiais", ready: false };
  if (id === "keeta") return { label: "PARCEIRO", note: "acesso técnico", ready: false };
  if (!loaded) return { label: "LENDO", note: "readiness real", ready: false };
  const state = pagbank?.readiness?.state;
  if (state === "ready_to_authorize") return { label: "PRONTO", note: "OAuth disponível", ready: true };
  if (state === "partner_approval") return { label: "HOMOLOGAÇÃO", note: "produção", ready: false };
  return { label: "PLATAFORMA", note: "ativação central", ready: false };
}

export function EcosystemExpansionOrbit() {
  const reduceMotion = Boolean(useReducedMotion());
  const [activeId, setActiveId] = useState<ExpansionId>("pagbank");
  const [interest, setInterest] = useState<ExpansionId[]>(() => readInterest());
  const [pagbank, setPagbank] = useState<PagBankHealth | null>(null);
  const [pagbankLoaded, setPagbankLoaded] = useState(false);
  const active = expansions.find((item) => item.id === activeId) || expansions[0];
  const activeStatus = statusFor(active.id, pagbank, pagbankLoaded);

  useEffect(() => {
    let cancelled = false;
    fetch(`${PAGBANK_API}/health`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("PagBank health unavailable");
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setPagbank(body);
      })
      .catch(() => {
        if (!cancelled) setPagbank(null);
      })
      .finally(() => {
        if (!cancelled) setPagbankLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "c360_ecosystem_interest",
        JSON.stringify({ providers: interest, updated_at: new Date().toISOString() }),
      );
      window.dispatchEvent(new CustomEvent("c360:ecosystem-interest", { detail: { providers: interest } }));
    } catch {
      // Interest remains usable for the current visit when persistence is unavailable.
    }
  }, [interest]);

  const interestCount = useMemo(
    () => interest.filter((id) => id === "99food" || id === "keeta").length,
    [interest],
  );

  function toggleInterest(id: ExpansionId) {
    if (id === "pagbank") return;
    setInterest((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <section
      data-ecosystem-expansion="true"
      className="relative z-[3] mx-auto mb-[clamp(6rem,10vw,10rem)] mt-4 w-[min(1320px,calc(100%-2rem))] overflow-hidden rounded-[2.4rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(10,17,30,.92),rgba(3,7,13,.9))] p-4 text-white shadow-[inset_0_1px_rgba(255,255,255,.06),0_45px_130px_rgba(0,0,0,.28)] backdrop-blur-3xl sm:p-6 lg:p-8"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-[18%] size-[30rem] rounded-full bg-emerald-300/[0.045] blur-[125px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-28 size-[32rem] rounded-full bg-violet-300/[0.045] blur-[130px]" />

      <header className="relative z-10 flex flex-col gap-5 border-b border-white/[0.06] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="flex items-center gap-2 text-[0.56rem] font-black tracking-[0.17em] text-violet-100/65">
            <Orbit size={14} /> ÓRBITAS DE EXPANSÃO
          </span>
          <h3 className="mt-3 max-w-[12ch] text-[clamp(2.3rem,4vw,4.6rem)] font-black leading-[0.92] tracking-[-0.065em]">
            Explore o próximo canal antes de depender dele.
          </h3>
        </div>
        <div className="flex items-center gap-3 rounded-[1.4rem] border border-white/[0.07] bg-white/[0.025] px-4 py-3">
          <div className="grid size-11 place-items-center rounded-full border border-violet-100/10 bg-violet-200/[0.05] text-violet-100/65">
            <Radar size={18} />
          </div>
          <div>
            <b className="block text-lg font-black">{interestCount}/2</b>
            <small className="text-[0.48rem] font-black tracking-[0.1em] text-white/28">PRIORIDADES FUTURAS</small>
          </div>
        </div>
      </header>

      <div className="relative z-10 mt-7 grid gap-5 lg:grid-cols-[minmax(360px,.82fr)_minmax(0,1.18fr)]">
        <div className="hidden min-h-[32rem] lg:block">
          <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
            <motion.div
              aria-hidden="true"
              className="absolute inset-[13%] rounded-full border border-dashed border-white/[0.075]"
              animate={reduceMotion ? undefined : { rotate: 360 }}
              transition={reduceMotion ? undefined : { duration: 80, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              aria-hidden="true"
              className="absolute inset-[29%] rounded-full border border-white/[0.07]"
              animate={reduceMotion ? undefined : { rotate: -360 }}
              transition={reduceMotion ? undefined : { duration: 65, repeat: Infinity, ease: "linear" }}
            />
            <div className="absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/[0.12] bg-white/[0.05] text-center shadow-[inset_0_1px_rgba(255,255,255,.08),0_0_55px_rgba(110,231,183,.07)] backdrop-blur-3xl">
              <span>
                <Sparkles className="mx-auto text-emerald-100/65" size={18} />
                <b className="mt-1 block text-[0.57rem] font-black tracking-[0.1em]">COZINHA 360</b>
                <small className="text-[0.46rem] font-black text-white/25">NÚCLEO</small>
              </span>
            </div>

            {expansions.map((item) => {
              const selected = active.id === item.id;
              const prioritized = interest.includes(item.id);
              const status = statusFor(item.id, pagbank, pagbankLoaded);
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  data-ecosystem-node={item.id}
                  onClick={() => setActiveId(item.id)}
                  className={`absolute z-10 grid size-[7.2rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-center backdrop-blur-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-100 ${
                    selected
                      ? "border-white/20 bg-white/[0.095]"
                      : prioritized
                        ? "border-violet-100/20 bg-violet-200/[0.06]"
                        : "border-white/[0.08] bg-slate-950/72"
                  }`}
                  style={{ left: `${item.point.x}%`, top: `${item.point.y}%`, boxShadow: selected ? `0 0 52px ${item.glow}` : undefined }}
                  whileHover={reduceMotion ? undefined : { scale: 1.07 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                  animate={{ scale: selected ? 1.07 : 1, opacity: selected || prioritized ? 1 : 0.75 }}
                  transition={{ type: "spring", stiffness: 210, damping: 19 }}
                >
                  <span>
                    {item.id === "pagbank" ? <CircleDot className={`mx-auto ${item.tone}`} size={20} /> : item.id === "99food" ? <ShoppingBag className={`mx-auto ${item.tone}`} size={20} /> : <Store className={`mx-auto ${item.tone}`} size={20} />}
                    <b className="mt-1 block text-[0.63rem] font-black">{item.name}</b>
                    <small className="mt-1 inline-flex rounded-full border border-white/[0.08] px-1.5 py-0.5 text-[0.39rem] font-black tracking-[0.07em] text-white/42">{status.label}</small>
                  </span>
                  {prioritized && (
                    <span className="absolute -right-0.5 -top-0.5 grid size-6 place-items-center rounded-full bg-violet-100 text-slate-950 shadow-[0_0_24px_rgba(221,214,254,.24)]">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 lg:hidden">
          {expansions.map((item) => {
            const status = statusFor(item.id, pagbank, pagbankLoaded);
            return (
              <button
                key={item.id}
                type="button"
                data-ecosystem-node={item.id}
                onClick={() => setActiveId(item.id)}
                className={`flex items-center gap-3 rounded-[1.3rem] border p-3 text-left ${active.id === item.id ? "border-white/18 bg-white/[0.07]" : "border-white/[0.07] bg-white/[0.025]"}`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-black/20 ${item.tone}`}>
                  {item.id === "pagbank" ? <CircleDot size={17} /> : item.id === "99food" ? <ShoppingBag size={17} /> : <Store size={17} />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-xs font-black">{item.name}</b>
                  <small className="text-[0.5rem] font-black tracking-[0.08em] text-white/32">{status.label} · {status.note}</small>
                </span>
                <ArrowRight size={14} className="text-white/25" />
              </button>
            );
          })}
        </div>

        <motion.article
          key={active.id}
          data-ecosystem-detail={active.id}
          className="relative overflow-hidden rounded-[2rem] border border-white/[0.09] bg-white/[0.035] p-5 shadow-[inset_0_1px_rgba(255,255,255,.055)] backdrop-blur-3xl sm:p-6"
          initial={reduceMotion ? false : { opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full blur-[100px]" style={{ background: active.glow }} />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
              <span className={`text-[0.54rem] font-black tracking-[0.14em] ${active.tone}`}>{active.eyebrow}</span>
              <h4 className="mt-2 text-3xl font-black tracking-[-0.055em] sm:text-4xl">{active.name}</h4>
            </div>
            <span className={`rounded-full border px-2.5 py-1.5 text-[0.47rem] font-black tracking-[0.08em] ${activeStatus.ready ? "border-emerald-100/15 bg-emerald-200/[0.06] text-emerald-100/75" : "border-amber-100/12 bg-amber-200/[0.035] text-amber-100/60"}`}>
              {activeStatus.label}
            </span>
          </div>

          <p className="relative z-10 mt-4 max-w-[54ch] text-sm font-semibold leading-6 text-white/58">{active.impact}</p>

          <div className="relative z-10 mt-5 grid grid-cols-3 gap-2">
            {active.capabilities.map((capability) => (
              <div key={capability} className="rounded-[1rem] border border-white/[0.07] bg-black/15 px-3 py-3 text-center">
                <b className="text-[0.56rem] font-black text-white/55">{capability}</b>
              </div>
            ))}
          </div>

          {active.id === "99food" ? (
            <div className="relative z-10 mt-5 rounded-[1.25rem] border border-white/[0.07] bg-black/15 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[0.52rem] font-black tracking-[0.1em] text-white/42"><Rocket size={12} /> CAMINHO OFICIAL</span>
                <small className="text-[0.48rem] font-black text-amber-100/55">PARCERIA ANTES DE API</small>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {partnerPath.map((step, index) => (
                  <div key={step} className="grid gap-2 text-center">
                    <span className="mx-auto grid size-7 place-items-center rounded-full border border-white/[0.09] bg-white/[0.025] text-[0.48rem] font-black text-white/35">{index + 1}</span>
                    <small className="text-[0.44rem] font-bold leading-tight text-white/28">{step}</small>
                  </div>
                ))}
              </div>
            </div>
          ) : active.id === "keeta" ? (
            <div className="relative z-10 mt-5 flex items-center gap-3 rounded-[1.25rem] border border-emerald-100/[0.08] bg-emerald-200/[0.025] p-4">
              <CloudCog size={17} className="shrink-0 text-emerald-100/55" />
              <span>
                <b className="block text-xs font-black text-white/66">API existe. Credencial ainda não.</b>
                <small className="mt-1 block text-[0.56rem] leading-5 text-white/32">O 360 só transformará esta órbita em “Conectar” depois da entrada técnica oficial da plataforma.</small>
              </span>
            </div>
          ) : (
            <div className="relative z-10 mt-5 flex items-center gap-3 rounded-[1.25rem] border border-cyan-100/[0.08] bg-cyan-200/[0.025] p-4">
              {activeStatus.ready ? <PlugZap size={17} className="shrink-0 text-cyan-100/70" /> : <CloudCog size={17} className="shrink-0 text-cyan-100/50" />}
              <span>
                <b className="block text-xs font-black text-white/66">{activeStatus.ready ? "Adaptador v5.9 pronto para autorização" : activeStatus.note}</b>
                <small className="mt-1 block text-[0.56rem] leading-5 text-white/32">O conector já existe no ambiente real e muda de estado conforme infraestrutura e homologação.</small>
              </span>
            </div>
          )}

          {active.id !== "pagbank" && (
            <button
              type="button"
              data-ecosystem-priority={active.id}
              onClick={() => toggleInterest(active.id)}
              className={`relative z-10 mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-black transition-colors ${interest.includes(active.id) ? "border-violet-100/20 bg-violet-100 text-slate-950" : "border-white/10 bg-white/[0.045] text-white/68 hover:bg-white/[0.075]"}`}
            >
              {interest.includes(active.id) ? <Check size={14} /> : <Sparkles size={14} />}
              {interest.includes(active.id) ? "Prioridade marcada" : "Quero esta órbita na minha rota"}
            </button>
          )}
        </motion.article>
      </div>
    </section>
  );
}
