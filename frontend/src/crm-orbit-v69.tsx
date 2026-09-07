import { motion, useReducedMotion } from "motion/react";
import { HeartHandshake, RefreshCcw, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { request } from "./app";

type Segment = "new" | "repeat" | "dormant" | "prospect";
type Lifecycle = {
  dormant_days: number;
  summary: {
    total: number;
    new: number;
    repeat: number;
    dormant: number;
    prospect: number;
    contactable: number;
    dormant_contactable: number;
    revenue_cents: number;
    contribution_cents: number;
  };
};

const CRM_API = import.meta.env.VITE_CRM_API_URL || "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-crm-v16";
const segmentMeta: Array<{ key: Segment; label: string; tab: string; x: number; y: number; angle: number }> = [
  { key: "new", label: "CHEGOU", tab: "Novos", x: 26, y: 25, angle: -135 },
  { key: "repeat", label: "VOLTOU", tab: "Recorrentes", x: 76, y: 24, angle: -45 },
  { key: "dormant", label: "SUMIU", tab: "Sumidos", x: 77, y: 76, angle: 45 },
  { key: "prospect", label: "AINDA NÃO COMPROU", tab: "Sem compra", x: 25, y: 77, angle: 135 },
];

async function crmJson(path: string, token: string) {
  const response = await fetch(`${CRM_API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "CRM não respondeu");
  return body;
}

function clickExistingTab(tab: string, reduced: boolean) {
  const button = [...document.querySelectorAll<HTMLButtonElement>(".crm-tabs button")].find((item) => item.textContent?.trim() === tab);
  if (!button) return;
  button.click();
  document.querySelector<HTMLElement>(".crm-toolbar")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
}

function RelationshipOrbit({ businessId }: { businessId: number }) {
  const reduced = Boolean(useReducedMotion());
  const token = localStorage.getItem("c360_token") || "";
  const [data, setData] = useState<Lifecycle | null>(null);
  const [active, setActive] = useState<Segment | "all">("all");
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);

  async function load() {
    if (!businessId || !token || loading) return;
    setLoading(true);
    setPartial(false);
    try {
      setData(await crmJson(`/businesses/${businessId}/customer-lifecycle?dormant_days=30`, token));
    } catch {
      setPartial(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onTab = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLButtonElement>(".crm-tabs button");
      if (!target) return;
      const text = target.textContent?.trim() || "";
      const found = segmentMeta.find((item) => item.tab === text);
      setActive(found?.key || "all");
    };
    document.addEventListener("click", onTab, true);
    return () => document.removeEventListener("click", onTab, true);
  }, [businessId]);

  const summary = data?.summary;
  const total = Number(summary?.total || 0);
  const contactable = Number(summary?.contactable || 0);
  const consentPct = total ? Math.round((contactable / total) * 100) : 0;
  const counts = useMemo<Record<Segment, number>>(() => ({
    new: Number(summary?.new || 0),
    repeat: Number(summary?.repeat || 0),
    dormant: Number(summary?.dormant || 0),
    prospect: Number(summary?.prospect || 0),
  }), [summary]);

  function choose(item: typeof segmentMeta[number]) {
    setActive(item.key);
    clickExistingTab(item.tab, reduced);
  }

  return (
    <section data-crm-orbit-v69 className="crm69-shell" aria-labelledby="crm69-title">
      <div className="crm69-aura crm69-aura-a" aria-hidden="true" />
      <div className="crm69-aura crm69-aura-b" aria-hidden="true" />
      <header className="crm69-head">
        <div>
          <span><Sparkles size={12} /> MAPA DE RELAÇÕES · DADOS OBSERVADOS</span>
          <h2 id="crm69-title">Veja sua base se mover.</h2>
          <p>O ciclo muda quando pedidos concluídos mudam. Consentimento é uma camada separada e nunca transforma alguém em contato permitido por inferência.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Atualizar mapa de relações">
          <RefreshCcw size={14} className={loading ? "crm69-spin" : ""} />
        </button>
      </header>

      <div className="crm69-stage">
        <svg className="crm69-orbits" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth=".55" />
          <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,255,255,.045)" strokeWidth=".45" strokeDasharray="2 3" />
          {segmentMeta.map((item) => (
            <motion.line
              key={item.key}
              x1="50" y1="50" x2={item.x} y2={item.y}
              stroke={active === item.key ? "rgba(167,243,208,.72)" : "rgba(255,255,255,.075)"}
              strokeWidth={active === item.key ? ".9" : ".5"}
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduced ? 0 : .8, delay: reduced ? 0 : .08 }}
            />
          ))}
        </svg>

        <div className="crm69-center">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="53" fill="none" stroke="rgba(255,255,255,.055)" strokeWidth="5" />
            <motion.circle
              cx="60" cy="60" r="53" fill="none" stroke="rgba(103,232,249,.72)" strokeWidth="5" strokeLinecap="round"
              transform="rotate(-90 60 60)"
              strokeDasharray={`${Math.max(0, Math.min(100, consentPct)) * 3.33} 333`}
              initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }}
            />
          </svg>
          <div>
            <i><Users size={18} /></i>
            <strong>{total}</strong>
            <span>CLIENTES</span>
            <small>{contactable} com consentimento</small>
          </div>
        </div>

        {segmentMeta.map((item, index) => {
          const count = counts[item.key];
          const isActive = active === item.key;
          return (
            <motion.button
              key={item.key}
              type="button"
              className={`crm69-node crm69-${item.key} ${isActive ? "active" : ""}`}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              onClick={() => choose(item)}
              aria-label={`${item.tab}: ${count}`}
              whileHover={reduced ? undefined : { scale: 1.06, y: -3 }}
              whileTap={reduced ? undefined : { scale: .97 }}
              animate={isActive && !reduced ? { scale: [1, 1.04, 1] } : undefined}
              transition={{ type: "spring", stiffness: 250, damping: 20, delay: reduced ? 0 : index * .03 }}
            >
              <span>{item.label}</span>
              <strong>{count}</strong>
              <small>{item.tab}</small>
            </motion.button>
          );
        })}
      </div>

      <div className="crm69-consent">
        <article>
          <i><ShieldCheck size={17} /></i>
          <div><span>CONSENTIMENTO ATIVO</span><strong>{consentPct}% da base</strong></div>
          <small>{contactable} de {total || 0}</small>
        </article>
        <article className={Number(summary?.dormant_contactable || 0) > 0 ? "signal" : ""}>
          <i><HeartHandshake size={17} /></i>
          <div><span>SUMIDOS + CONTATO PERMITIDO</span><strong>{Number(summary?.dormant_contactable || 0)}</strong></div>
          <small>filtro operacional, não previsão</small>
        </article>
        <button type="button" onClick={() => { setActive("all"); clickExistingTab("Todos", reduced); }}>
          Ver todos
        </button>
      </div>

      {partial && <div className="crm69-partial">O mapa não respondeu agora. A lista principal continua disponível.</div>}
    </section>
  );
}

export function CrmRelationshipOrbitPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);

  useEffect(() => {
    let ownedHost: HTMLElement | null = null;
    let cancelled = false;
    const mount = async () => {
      const priority = document.querySelector<HTMLElement>(".crm-priority");
      if (!priority) return;
      let target = document.querySelector<HTMLElement>("[data-crm-orbit-v69-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-crm-orbit-v69-host", "true");
        priority.insertAdjacentElement("afterend", target);
        ownedHost = target;
      }
      if (!cancelled) setHost(target);

      const selected = document.querySelector<HTMLSelectElement>(".crm-top select");
      if (selected?.value) {
        if (!cancelled) setBusinessId(Number(selected.value));
        return;
      }
      const token = localStorage.getItem("c360_token") || "";
      if (!token || businessId) return;
      try {
        const me = await request("/me", {}, token);
        if (!cancelled) setBusinessId(Number((me.businesses || [])[0]?.id || 0));
      } catch {
        // CRM remains usable without this visual enhancement.
      }
    };
    const observer = new MutationObserver(() => void mount());
    observer.observe(document.body, { childList: true, subtree: true });
    void mount();
    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches(".crm-top select")) setBusinessId(Number(target.value || 0));
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
  return createPortal(<RelationshipOrbit businessId={businessId} />, host);
}
