import { motion, useReducedMotion } from "motion/react";
import {
  Boxes,
  CheckCircle2,
  CircleDot,
  Gauge,
  PackageSearch,
  RefreshCcw,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { request } from "./app";

type Ingredient = {
  id: number;
  name: string;
  unit: string;
  on_hand_milliunits: number;
  par_level_milliunits: number;
  reorder_target_milliunits: number;
  version: number;
};
type Business = { id: number; name: string };
type StockState = "rupture" | "risk" | "attention" | "covered" | "unconfigured";

type StockView = Ingredient & {
  state: StockState;
  coverage: number | null;
  suggested: number;
};

const stateRank: Record<StockState, number> = {
  rupture: 0,
  risk: 1,
  attention: 2,
  unconfigured: 3,
  covered: 4,
};

const meta = {
  rupture: { label: "RUPTURA", icon: TriangleAlert },
  risk: { label: "ABAIXO DO PAR", icon: PackageSearch },
  attention: { label: "ENTRE PAR E ALVO", icon: Gauge },
  covered: { label: "COBERTO", icon: CheckCircle2 },
  unconfigured: { label: "SEM REGRA", icon: Settings2 },
} as const;

function derive(row: Ingredient): StockView {
  const onHand = Math.max(0, Number(row.on_hand_milliunits || 0));
  const par = Math.max(0, Number(row.par_level_milliunits || 0));
  const target = Math.max(par, Number(row.reorder_target_milliunits || 0));
  if (!par) return { ...row, state: "unconfigured", coverage: null, suggested: 0 };
  const coverage = Math.max(0, Math.round((onHand / par) * 100));
  const state: StockState = onHand <= 0 ? "rupture" : onHand < par ? "risk" : target > par && onHand < target ? "attention" : "covered";
  return { ...row, state, coverage, suggested: Math.max(0, target - onHand) };
}

function openEditor(name: string) {
  const row = Array.from(document.querySelectorAll<HTMLElement>(".row.richer")).find((node) =>
    node.querySelector("b")?.textContent?.trim() === name,
  );
  const button = Array.from(row?.querySelectorAll<HTMLButtonElement>("button.secondary") || []).find(
    (node) => node.textContent?.trim() === "Estoque",
  );
  button?.click();
}

function InventoryHeatmap({ businessId }: { businessId: number }) {
  const token = localStorage.getItem("c360_token") || "";
  const reduced = Boolean(useReducedMotion());
  const [rows, setRows] = useState<Ingredient[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(silent = false) {
    if (!token || !businessId || busy) return;
    if (!silent) setBusy(true);
    try {
      const next = await request(`/businesses/${businessId}/ingredients`, {}, token);
      setRows(Array.isArray(next) ? next : []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler a cobertura do estoque");
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") void load(true);
    }, 30000);
    const refresh = () => void load(true);
    window.addEventListener("c360:inventory-updated", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("c360:inventory-updated", refresh);
    };
  }, [businessId]);

  const stock = useMemo(() => rows.map(derive).sort((a, b) => stateRank[a.state] - stateRank[b.state] || (a.coverage ?? 9999) - (b.coverage ?? 9999) || a.name.localeCompare(b.name)), [rows]);
  const counts = useMemo(() => ({
    rupture: stock.filter((row) => row.state === "rupture").length,
    risk: stock.filter((row) => row.state === "risk").length,
    attention: stock.filter((row) => row.state === "attention").length,
    covered: stock.filter((row) => row.state === "covered").length,
    unconfigured: stock.filter((row) => row.state === "unconfigured").length,
  }), [stock]);

  return (
    <section data-inventory-heatmap-v67 className="relative mb-4 overflow-hidden rounded-[1.8rem] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(9,15,22,.88),rgba(12,17,23,.96))] p-3 text-white shadow-[0_28px_85px_rgba(0,0,0,.22),inset_0_1px_rgba(255,255,255,.05)] backdrop-blur-3xl sm:p-4">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 size-64 rounded-full bg-amber-300/[0.045] blur-[95px]" />
      <div aria-hidden className="pointer-events-none absolute right-[-4rem] top-0 size-72 rounded-full bg-emerald-300/[0.045] blur-[105px]" />

      <header className="relative flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
        <div>
          <span className="flex items-center gap-2 text-[.5rem] font-black tracking-[.15em] text-emerald-100/50"><Boxes size={13}/> COBERTURA DA DESPENSA</span>
          <h2 className="mt-1 text-xl font-black tracking-[-.04em] text-white/90 sm:text-2xl">Veja a ruptura antes da cozinha sentir.</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {counts.rupture > 0 && <span className="rounded-full border border-rose-200/15 bg-rose-200/[.045] px-2.5 py-1.5 text-[.48rem] font-black tracking-[.08em] text-rose-100/65">{counts.rupture} RUPTURA</span>}
          {counts.risk > 0 && <span className="rounded-full border border-amber-200/15 bg-amber-200/[.045] px-2.5 py-1.5 text-[.48rem] font-black tracking-[.08em] text-amber-100/65">{counts.risk} ABAIXO</span>}
          <button type="button" aria-label="Atualizar mapa de estoque" onClick={() => void load()} className="grid size-9 place-items-center rounded-xl border border-white/[.07] bg-white/[.025] text-white/35 hover:bg-white/[.055] hover:text-white"><RefreshCcw size={13} className={busy ? "animate-spin" : ""}/></button>
        </div>
      </header>

      {error && <div className="relative mb-3 rounded-xl border border-rose-200/15 bg-rose-200/[.04] px-3 py-2 text-[.58rem] text-rose-100/70">{error}</div>}

      <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {stock.map((row, index) => {
          const item = meta[row.state];
          const Icon = item.icon;
          const visualCoverage = row.coverage === null ? 0 : Math.min(100, row.coverage);
          return (
            <motion.button
              key={row.id}
              type="button"
              data-stock-ingredient={row.id}
              data-stock-state={row.state}
              onClick={() => openEditor(row.name)}
              className={`group relative min-h-[9.2rem] overflow-hidden rounded-[1.25rem] border p-3 text-left backdrop-blur-2xl ${row.state === "rupture" ? "border-rose-200/18 bg-rose-200/[.045]" : row.state === "risk" ? "border-amber-200/18 bg-amber-200/[.04]" : row.state === "attention" ? "border-cyan-200/13 bg-cyan-200/[.03]" : row.state === "covered" ? "border-emerald-200/13 bg-emerald-200/[.03]" : "border-white/[.065] bg-white/[.022]"}`}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 23, delay: reduced ? 0 : Math.min(index * .025, .18) }}
              whileHover={reduced ? undefined : { y: -3, scale: 1.008 }}
              whileTap={reduced ? undefined : { scale: .985 }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`grid size-10 place-items-center rounded-full p-[1px] ${row.state === "rupture" ? "bg-rose-300/70" : row.state === "risk" ? "bg-amber-300/65" : row.state === "covered" ? "bg-emerald-300/55" : "bg-white/15"}`} style={{ background: row.coverage === null ? undefined : `conic-gradient(currentColor ${visualCoverage}%,rgba(255,255,255,.07) ${visualCoverage}% 100%)` }}>
                  <span className="grid size-[calc(100%-3px)] place-items-center rounded-full bg-slate-950/95"><Icon size={14}/></span>
                </span>
                <span className="rounded-full border border-white/[.07] bg-black/15 px-2 py-1 text-[.42rem] font-black tracking-[.09em] text-white/35">{item.label}</span>
              </div>
              <b className="mt-3 block truncate text-sm font-black text-white/82">{row.name}</b>
              <div className="mt-2 flex items-end justify-between gap-2">
                <span><strong className="block text-xl font-black tracking-[-.045em] text-white/80">{row.coverage === null ? "—" : `${row.coverage}%`}</strong><small className="text-[.45rem] font-bold tracking-[.07em] text-white/23">DO PAR</small></span>
                <span className="text-right"><strong className="block text-[.7rem] text-white/55">{row.on_hand_milliunits} {row.unit}</strong><small className="text-[.44rem] text-white/22">PAR {row.par_level_milliunits}</small></span>
              </div>
              {row.suggested > 0 && <span className="mt-2 block truncate text-[.48rem] font-bold text-amber-100/45">repor +{row.suggested} {row.unit}</span>}
            </motion.button>
          );
        })}
      </div>

      {!stock.length && !busy && <div className="relative grid min-h-32 place-items-center rounded-[1.2rem] border border-dashed border-white/[.07] bg-white/[.015] text-center"><div><CircleDot className="mx-auto text-white/25" size={18}/><p className="mt-2 text-[.6rem] text-white/30">Cadastre ingredientes para o mapa ganhar forma.</p></div></div>}
      <footer className="relative mt-3 flex items-center justify-between gap-3 px-1 text-[.46rem] font-bold text-white/20"><span>Cada medidor compara o ingrediente apenas com o próprio PAR.</span><span className="hidden sm:inline">Toque para editar com auditoria e controle de versão.</span></footer>
    </section>
  );
}

export function InventoryHeatmapPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);

  useEffect(() => {
    let owned: HTMLElement | null = null;
    let cancelled = false;
    let resolving = false;

    async function mount() {
      const workspace = document.querySelector<HTMLElement>(".workspace");
      const stockButton = Array.from(workspace?.querySelectorAll<HTMLButtonElement>("button.secondary") || []).find((button) => button.textContent?.trim() === "Estoque");
      if (!workspace || !stockButton) {
        if (owned?.isConnected) owned.remove();
        owned = null;
        setHost(null);
        return;
      }
      let target = workspace.querySelector<HTMLElement>("[data-inventory-heatmap-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-inventory-heatmap-host", "true");
        const header = workspace.querySelector(":scope > header");
        header?.insertAdjacentElement("afterend", target);
        owned = target;
      }
      if (!cancelled) setHost(target);
      if (businessId || resolving) return;
      resolving = true;
      try {
        const token = localStorage.getItem("c360_token") || "";
        if (!token) return;
        const me = await request("/me", {}, token);
        const businesses = (me.businesses || []) as Business[];
        const visibleName = workspace.querySelector(":scope > header h2")?.textContent?.trim() || "";
        const business = businesses.find((item) => item.name === visibleName) || businesses[0];
        if (!cancelled) setBusinessId(Number(business?.id || 0));
      } catch {
        // The original inventory list remains fully functional.
      } finally {
        resolving = false;
      }
    }

    const observer = new MutationObserver(() => void mount());
    observer.observe(document.body, { childList: true, subtree: true });
    void mount();
    return () => {
      cancelled = true;
      observer.disconnect();
      if (owned?.isConnected) owned.remove();
    };
  }, [businessId]);

  if (!host || !businessId) return null;
  return createPortal(<InventoryHeatmap businessId={businessId}/>, host);
}
