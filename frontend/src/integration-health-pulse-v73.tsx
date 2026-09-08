import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Radio,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { request } from "./app";
import "./integration-health-pulse-v73.css";

type HealthState = "healthy" | "degrading" | "review" | "recovered";
type HealthItem = {
  connection_id: number;
  provider: string;
  name: string | null;
  connection_status: string;
  state: HealthState | null;
  effective_state: HealthState;
  strategy: "probe" | "signal";
  consecutive_failures: number;
  last_checked_at: string | null;
  last_probe_ok_at: string | null;
  last_probe_error_at: string | null;
  last_probe_error: string | null;
  next_check_at: string | null;
  last_success_at: string | null;
  operational_error_at: string | null;
  operational_error_present: boolean;
  operational_error: string | null;
};
type HealthPayload = {
  business_id: number;
  generated_at: string;
  summary: { healthy: number; degrading: number; review: number; recovered: number; total: number };
  items: HealthItem[];
  principles: { server_side: boolean; ifood_passive_signal: boolean; operational_errors_preserved: boolean };
};

const API =
  import.meta.env.VITE_INTEGRATION_HEALTH_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integration-health-v73";

const providerLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  ifood: "iFood",
  mercadopago: "Mercado Pago",
  google: "Google",
  meta_ads: "Meta Ads",
};

const stateMeta: Record<HealthState, { label: string; hint: string; icon: typeof Activity }> = {
  healthy: { label: "SAUDÁVEL", hint: "Pulso confirmado pelo servidor", icon: CheckCircle2 },
  degrading: { label: "DEGRADANDO", hint: "Primeira falha; nova leitura programada", icon: Activity },
  review: { label: "REVISAR", hint: "Falha repetida ou erro operacional preservado", icon: AlertTriangle },
  recovered: { label: "RECUPERADO", hint: "Voltou a responder após falha", icon: Sparkles },
};

async function healthRequest(businessId: number, token: string) {
  const response = await fetch(`${API}/businesses/${businessId}/health`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Não foi possível ler o pulso automático");
  return body as HealthPayload;
}

function relativeTime(value: string | null) {
  if (!value) return "aguardando primeiro pulso";
  const diff = Math.max(0, Date.now() - Date.parse(value));
  if (diff < 60_000) return "agora";
  if (diff < 60 * 60_000) return `há ${Math.max(1, Math.round(diff / 60_000))} min`;
  return `há ${Math.max(1, Math.round(diff / 3_600_000))} h`;
}

function annotate(items: HealthItem[]) {
  const active = new Set<string>();
  for (const item of items) {
    active.add(item.provider);
    const state = item.effective_state;
    const label = `${providerLabels[item.provider] || item.provider}: ${stateMeta[state].label}`;
    const selectors = [
      `[data-passport-provider="${CSS.escape(item.provider)}"]`,
      `[data-mission-node="${CSS.escape(item.provider)}"]`,
    ];
    for (const selector of selectors) {
      document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
        node.dataset.healthState = state;
        node.dataset.healthAutomatic = "true";
        node.title = label;
      });
    }
  }
  document
    .querySelectorAll<HTMLElement>("[data-health-automatic='true']")
    .forEach((node) => {
      const provider = node.dataset.passportProvider || node.dataset.missionNode || "";
      if (!active.has(provider)) {
        delete node.dataset.healthState;
        delete node.dataset.healthAutomatic;
      }
    });
}

function Pulse({ businessId }: { businessId: number }) {
  const reduced = Boolean(useReducedMotion());
  const token = localStorage.getItem("c360_token") || "";
  const [data, setData] = useState<HealthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(manual = false) {
    if (!businessId || !token || busy) return;
    if (manual) setBusy(true);
    try {
      const next = await healthRequest(businessId, token);
      setData(next);
      setError("");
      annotate(next.items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pulso indisponível");
    } finally {
      if (manual) setBusy(false);
    }
  }

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") void load(false);
    }, 45_000);
    const wake = () => {
      if (navigator.onLine && document.visibilityState === "visible") void load(false);
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [businessId]);

  useEffect(() => {
    if (!data?.items?.length) return;
    annotate(data.items);
    const observer = new MutationObserver(() => annotate(data.items));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [data]);

  const lastPulse = useMemo(() => {
    const stamps = (data?.items || [])
      .map((item) => item.last_checked_at || item.last_success_at)
      .filter(Boolean)
      .map((value) => Date.parse(value as string))
      .filter(Number.isFinite);
    return stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
  }, [data]);
  const summary = data?.summary || { healthy: 0, degrading: 0, review: 0, recovered: 0, total: 0 };
  const attention = summary.degrading + summary.review;

  return (
    <motion.section
      data-integration-health-v73
      className="ih-pulse"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 180, damping: 22 }}
    >
      <div className="ih-pulse__glow" aria-hidden="true" />
      <header className="ih-pulse__head">
        <div className="ih-pulse__identity">
          <span className="ih-pulse__icon"><HeartPulse size={17} /></span>
          <span>
            <small>PULSO AUTOMÁTICO · V7.3</small>
            <b>O sistema sente as próprias conexões.</b>
          </span>
        </div>
        <div className="ih-pulse__head-actions">
          <span className={`ih-pulse__status ${attention ? "attention" : "good"}`}>
            <Radio size={11} />
            {summary.total ? (attention ? `${attention} pedem atenção` : "circuito estável") : "pronto para observar"}
          </span>
          <button type="button" onClick={() => void load(true)} disabled={busy} aria-label="Atualizar leitura do pulso">
            <RefreshCcw size={13} className={busy ? "ih-spin" : ""} />
          </button>
        </div>
      </header>

      <div className="ih-pulse__states" aria-label="Estados automáticos das integrações">
        {(Object.keys(stateMeta) as HealthState[]).map((state) => {
          const meta = stateMeta[state];
          const Icon = meta.icon;
          const value = state === "healthy" ? summary.healthy : state === "degrading" ? summary.degrading : state === "review" ? summary.review : summary.recovered;
          return (
            <div className={`ih-pulse__state ${state}`} key={state} data-health-summary={state}>
              <span><Icon size={13} />{meta.label}</span>
              <b>{value}</b>
              <small>{meta.hint}</small>
            </div>
          );
        })}
      </div>

      <footer className="ih-pulse__foot">
        <span><ShieldCheck size={12} /> erros de pedidos/webhooks nunca são apagados pelo health-check</span>
        <span><Radio size={12} /> iFood usa o polling existente como presença — zero chamada duplicada do monitor</span>
        <span><Activity size={12} /> última leitura: {relativeTime(lastPulse)}</span>
      </footer>
      {error && <div className="ih-pulse__error"><AlertTriangle size={13} />{error}</div>}
    </motion.section>
  );
}

export function IntegrationHealthPulsePortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("c360_token") || "";
    async function resolveBusiness() {
      if (!token) return;
      try {
        const me = await request("/me", {}, token);
        const selected = Number(document.querySelector<HTMLSelectElement>(".cx-top select")?.value || 0);
        const id = selected || Number(me.businesses?.[0]?.id || 0);
        if (!cancelled) setBusinessId(id);
      } catch {
        // The underlying connection hub owns the auth error surface.
      }
    }
    void resolveBusiness();
    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches?.(".cx-top select")) setBusinessId(Number(target.value || 0));
    };
    document.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      document.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    let created: HTMLElement | null = null;
    const mount = () => {
      const page = document.querySelector<HTMLElement>(".cx-page");
      if (!page) return false;
      let node = page.querySelector<HTMLElement>("[data-integration-health-v73-host]");
      if (!node) {
        node = document.createElement("div");
        node.dataset.integrationHealthV73Host = "true";
        const hero = page.querySelector<HTMLElement>(".cx-hero");
        if (hero?.nextSibling) page.insertBefore(node, hero.nextSibling);
        else page.prepend(node);
        created = node;
      }
      setHost(node);
      return true;
    };
    if (mount()) return () => created?.remove();
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      created?.remove();
    };
  }, []);

  return host && businessId ? createPortal(<Pulse businessId={businessId} />, host) : null;
}
