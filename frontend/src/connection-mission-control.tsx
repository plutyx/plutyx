import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Check,
  CloudCog,
  Orbit,
  PlugZap,
  Radar,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { request } from "./app";

type CoreProvider = {
  key: string;
  name: string;
  platform_ready: boolean;
  connection: null | { status: string; last_success_at?: string | null };
  operational?: boolean;
  selection_required?: boolean;
};

type NodeState = "active" | "degraded" | "ready" | "platform" | "future" | "checking";
type MissionNode = {
  id: string;
  name: string;
  state: NodeState;
  note: string;
  future?: boolean;
};

const INTEGRATIONS_API =
  import.meta.env.VITE_INTEGRATIONS_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29";
const PAGBANK_API =
  import.meta.env.VITE_PAGBANK_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-pagbank-v59";

const stateMeta: Record<NodeState, { label: string; dot: string; ring: string }> = {
  active: { label: "ATIVO", dot: "bg-emerald-200", ring: "border-emerald-100/25 bg-emerald-200/[0.07]" },
  degraded: { label: "REVISAR", dot: "bg-rose-200", ring: "border-rose-100/20 bg-rose-200/[0.055]" },
  ready: { label: "AUTORIZAR", dot: "bg-cyan-200", ring: "border-cyan-100/20 bg-cyan-200/[0.055]" },
  platform: { label: "PLATAFORMA", dot: "bg-amber-200", ring: "border-amber-100/15 bg-amber-200/[0.035]" },
  future: { label: "PRIORIDADE", dot: "bg-violet-200", ring: "border-violet-100/18 bg-violet-200/[0.045]" },
  checking: { label: "LENDO", dot: "bg-white/30", ring: "border-white/[0.08] bg-white/[0.025]" },
};

function readFutureInterest() {
  try {
    const raw = JSON.parse(localStorage.getItem("c360_ecosystem_interest") || "null");
    return Array.isArray(raw?.providers)
      ? raw.providers.filter((id: string) => id === "99food" || id === "keeta")
      : [];
  } catch {
    return [];
  }
}

function nodeState(provider: CoreProvider): NodeState {
  if (provider.connection?.status === "degraded") return "degraded";
  if (provider.operational || provider.connection?.status === "active") return "active";
  if (provider.platform_ready) return "ready";
  return "platform";
}

function providerCardTarget(node: MissionNode) {
  if (node.id === "pagbank") return document.querySelector<HTMLElement>("[data-pagbank-connection-card]");
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".cx-card"));
  return cards.find((card) => {
    const heading = card.querySelector("h2")?.textContent?.trim().toLowerCase() || "";
    return heading.includes(node.name.toLowerCase()) || node.name.toLowerCase().includes(heading);
  }) || null;
}

function focusCard(node: MissionNode, reduceMotion: boolean) {
  if (node.future) return;
  const target = providerCardTarget(node);
  if (!target) return;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  target.animate(
    [
      { boxShadow: "0 0 0 0 rgba(165,243,252,0)" },
      { boxShadow: "0 0 0 2px rgba(165,243,252,.32),0 0 58px rgba(103,232,249,.16)" },
      { boxShadow: "0 0 0 0 rgba(165,243,252,0)" },
    ],
    { duration: reduceMotion ? 1 : 1200, easing: "ease-out" },
  );
}

function MissionControl() {
  const reduceMotion = Boolean(useReducedMotion());
  const [nodes, setNodes] = useState<MissionNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>("");
  const [error, setError] = useState("");

  async function load() {
    const token = localStorage.getItem("c360_token") || "";
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const me = await request("/me", {}, token);
      const businessId = Number(me.businesses?.[0]?.id || 0);
      if (!businessId) throw new Error("Operação não encontrada");
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
      const [coreResponse, pagbankResponse] = await Promise.all([
        fetch(`${INTEGRATIONS_API}/businesses/${businessId}/integrations`, { headers }),
        fetch(`${PAGBANK_API}/businesses/${businessId}/status`, { headers }),
      ]);
      const core = await coreResponse.json().catch(() => ({}));
      const pagbank = await pagbankResponse.json().catch(() => ({}));
      if (!coreResponse.ok) throw new Error(core.detail || "Não foi possível ler as conexões");

      const coreNodes: MissionNode[] = (Array.isArray(core.providers) ? core.providers : []).map((provider: CoreProvider) => ({
        id: provider.key,
        name: provider.name.replace(" / Pix", "").replace(" + Ads", ""),
        state: nodeState(provider),
        note:
          provider.connection?.status === "degraded"
            ? "revalidar autorização"
            : provider.operational || provider.connection?.status === "active"
              ? "operacional"
              : provider.platform_ready
                ? provider.selection_required
                  ? "escolher conta"
                  : "consentimento disponível"
                : "ativação central",
      }));

      const pagbankState: NodeState = pagbankResponse.ok
        ? pagbank.connection?.status === "degraded"
          ? "degraded"
          : pagbank.connection?.status === "active"
            ? "active"
            : pagbank.readiness?.state === "ready_to_authorize"
              ? "ready"
              : "platform"
        : "platform";
      const pagbankNode: MissionNode = {
        id: "pagbank",
        name: "PagBank",
        state: pagbankState,
        note:
          pagbankState === "active"
            ? "operacional"
            : pagbank.readiness?.state === "partner_approval"
              ? "homologação"
              : pagbankState === "ready"
                ? "consentimento disponível"
                : "ativação central",
      };

      const future = readFutureInterest().map((id: string): MissionNode => ({
        id,
        name: id === "99food" ? "99Food" : "Keeta",
        state: "future",
        note: id === "99food" ? "parceria técnica priorizada" : "acesso técnico priorizado",
        future: true,
      }));
      const next = [...coreNodes, pagbankNode, ...future];
      setNodes(next);
      setActiveId((current) => current || next.find((node) => node.state !== "active")?.id || next[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o mapa de conexões");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("c360:ecosystem-interest", refresh as EventListener);
    return () => window.removeEventListener("c360:ecosystem-interest", refresh as EventListener);
  }, []);

  const active = nodes.find((node) => node.id === activeId) || nodes[0];
  const activeCount = useMemo(() => nodes.filter((node) => node.state === "active").length, [nodes]);
  const actionable = useMemo(() => nodes.filter((node) => node.state === "ready" || node.state === "degraded").length, [nodes]);
  const operationalNodes = nodes.filter((node) => !node.future);
  const completion = operationalNodes.length ? Math.round((activeCount / operationalNodes.length) * 100) : 0;

  return (
    <section
      data-connection-mission-control="true"
      className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(10,17,28,.94),rgba(4,8,14,.92))] p-4 text-white shadow-[inset_0_1px_rgba(255,255,255,.06),0_28px_90px_rgba(0,0,0,.22)] backdrop-blur-3xl sm:p-5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-28 size-72 rounded-full bg-cyan-300/[0.055] blur-[105px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-32 size-72 rounded-full bg-violet-300/[0.05] blur-[110px]" />

      <header className="relative z-10 flex flex-col gap-4 border-b border-white/[0.06] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="flex items-center gap-2 text-[0.52rem] font-black tracking-[0.15em] text-cyan-100/65"><Orbit size={13} /> MISSION CONTROL</span>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.045em] sm:text-3xl">Sua operação, vista como sistema.</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-100/10 bg-emerald-200/[0.035] px-3 py-2 text-[0.52rem] font-black text-emerald-100/65">{activeCount} ATIVAS</span>
          <span className="rounded-full border border-cyan-100/10 bg-cyan-200/[0.035] px-3 py-2 text-[0.52rem] font-black text-cyan-100/60">{actionable} AÇÕES</span>
          <button type="button" onClick={() => void load()} disabled={loading} className="grid size-9 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03] text-white/45 disabled:opacity-40" aria-label="Atualizar mapa de conexões">
            <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="relative z-10 mt-4 flex items-center gap-2 rounded-xl border border-rose-100/10 bg-rose-200/[0.035] px-3 py-2 text-xs font-semibold text-rose-100/65"><AlertTriangle size={14} />{error}</div>
      ) : (
        <div className="relative z-10 mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)] xl:items-center">
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-2.5 xl:min-w-0 xl:flex-wrap">
              {loading && !nodes.length
                ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[5.7rem] w-[9.5rem] animate-pulse rounded-[1.3rem] border border-white/[0.06] bg-white/[0.02]" />)
                : nodes.map((node, index) => {
                    const meta = stateMeta[node.state];
                    const selected = active?.id === node.id;
                    return (
                      <motion.button
                        key={node.id}
                        type="button"
                        data-mission-node={node.id}
                        onClick={() => {
                          setActiveId(node.id);
                          focusCard(node, reduceMotion);
                        }}
                        className={`relative min-h-[5.7rem] w-[9.5rem] shrink-0 rounded-[1.3rem] border p-3 text-left ${meta.ring} ${selected ? "ring-1 ring-white/20" : ""}`}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0, scale: selected ? 1.025 : 1 }}
                        transition={{ delay: index * 0.025, type: "spring", stiffness: 180, damping: 20 }}
                        whileHover={reduceMotion ? undefined : { y: -2 }}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <i className={`size-2 rounded-full ${meta.dot} shadow-[0_0_14px_currentColor]`} />
                          <small className="text-[0.41rem] font-black tracking-[0.08em] text-white/35">{meta.label}</small>
                        </span>
                        <b className="mt-3 block truncate text-[0.68rem] font-black text-white/75">{node.name}</b>
                        <small className="mt-1 block truncate text-[0.48rem] font-semibold text-white/28">{node.note}</small>
                      </motion.button>
                    );
                  })}
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-4">
              <span>
                <small className="block text-[0.46rem] font-black tracking-[0.11em] text-white/28">SAÚDE DO SISTEMA</small>
                <b className="mt-1 block text-2xl font-black">{completion}%</b>
              </span>
              <div className="relative grid size-14 place-items-center rounded-full border border-white/[0.08] bg-black/20">
                <svg className="absolute inset-1 size-12 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="3" />
                  <motion.circle cx="22" cy="22" r="18" fill="none" stroke="rgba(110,231,183,.8)" strokeWidth="3" strokeLinecap="round" pathLength="1" strokeDasharray="1" animate={{ strokeDashoffset: 1 - completion / 100 }} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }} />
                </svg>
                {active?.state === "active" ? <Check size={15} className="text-emerald-100" /> : active?.state === "future" ? <Sparkles size={15} className="text-violet-100" /> : active?.state === "ready" ? <PlugZap size={15} className="text-cyan-100" /> : <CloudCog size={15} className="text-amber-100/60" />}
              </div>
            </div>
            {active && (
              <motion.div key={active.id} className="mt-4 border-t border-white/[0.05] pt-4" initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}>
                <span className="flex items-center gap-2 text-[0.48rem] font-black tracking-[0.08em] text-white/32"><Radar size={11} /> EM FOCO</span>
                <b className="mt-2 block text-sm font-black text-white/72">{active.name}</b>
                <small className="mt-1 block text-[0.58rem] leading-5 text-white/32">{active.future ? "Prioridade descoberta na home. A configuração só aparecerá quando o acesso técnico virar integração executável." : active.state === "ready" ? "Toque no nó para ir ao consentimento real deste provedor." : active.state === "degraded" ? "Toque no nó para revisar e revalidar esta autorização." : active.state === "active" ? "Conexão operacional e disponível para o restante do sistema." : "A plataforma resolve esta dependência; o restaurante não precisa configurar API."}</small>
              </motion.div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

export function ConnectionMissionControlPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function sync() {
      const hero = document.querySelector<HTMLElement>(".cx-hero");
      const current = document.querySelector<HTMLElement>("[data-mission-control-host]");
      if (!hero) {
        current?.remove();
        setHost(null);
        return;
      }
      if (current) {
        if (current.previousElementSibling !== hero) hero.insertAdjacentElement("afterend", current);
        setHost(current);
        return;
      }
      const next = document.createElement("div");
      next.dataset.missionControlHost = "true";
      hero.insertAdjacentElement("afterend", next);
      setHost(next);
    }
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector<HTMLElement>("[data-mission-control-host]")?.remove();
      setHost(null);
    };
  }, []);

  return host ? createPortal(<MissionControl />, host) : null;
}
