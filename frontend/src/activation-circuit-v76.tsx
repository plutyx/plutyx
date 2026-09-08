import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  BadgeCheck,
  ChevronRight,
  CircleDollarSign,
  CloudCog,
  Gauge,
  HeartPulse,
  MapPin,
  MessageCircleMore,
  Orbit,
  PackageCheck,
  PlugZap,
  Radar,
  ShieldCheck,
  Sparkles,
  Store,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { request } from "./app";

type Connection = {
  status?: string;
  display_name?: string | null;
  last_success_at?: string | null;
};

type Provider = {
  key: string;
  name: string;
  category?: string;
  impact?: string;
  platform_ready?: boolean;
  operational?: boolean;
  selection_required?: boolean;
  connection?: Connection | null;
};

type Catalog = {
  recommended_order?: string[];
  providers?: Provider[];
};

type HealthSummary = {
  healthy?: number;
  degrading?: number;
  review?: number;
  recovered?: number;
  total?: number;
};

type Snapshot = {
  providers: Provider[];
  recommended: string[];
  health: HealthSummary | null;
  readAt: string;
};

type Capability = {
  label: string;
  icon: ComponentType<{ size?: number }>;
  outcome: string;
};

const INTEGRATIONS_API =
  import.meta.env.VITE_INTEGRATIONS_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29";
const HEALTH_API =
  import.meta.env.VITE_INTEGRATION_HEALTH_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integration-health-v73";

const capabilityByProvider: Record<string, Capability> = {
  whatsapp: {
    label: "RECOMPRA",
    icon: MessageCircleMore,
    outcome: "Conversa, recuperação e relacionamento entram no mesmo fluxo.",
  },
  ifood: {
    label: "PEDIDOS",
    icon: PackageCheck,
    outcome: "Marketplace cai na mesma operação da cozinha.",
  },
  mercadopago: {
    label: "PAGAR",
    icon: WalletCards,
    outcome: "Pix confirmado sem conferência manual.",
  },
  pagbank: {
    label: "PAGAR",
    icon: CircleDollarSign,
    outcome: "Pagamento confirmado e ligado ao pedido.",
  },
  google: {
    label: "DESCOBRIR",
    icon: MapPin,
    outcome: "Presença local e avaliações ligadas à operação.",
  },
  meta_ads: {
    label: "ATRIBUIR",
    icon: Radar,
    outcome: "Aquisição conversa com venda e margem.",
  },
};

function providerState(provider: Provider) {
  if (provider.operational || provider.connection?.status === "active") return "live" as const;
  if (provider.selection_required) return "choose" as const;
  if (provider.connection?.status === "degraded") return "attention" as const;
  if (!provider.platform_ready) return "platform" as const;
  return "ready" as const;
}

function stateLabel(state: ReturnType<typeof providerState>) {
  if (state === "live") return "VIVO";
  if (state === "choose") return "ESCOLHER";
  if (state === "attention") return "REVISAR";
  if (state === "platform") return "360 PREPARA";
  return "1 TOQUE";
}

function rank(progress: number) {
  if (progress >= 100) return "ECOSSISTEMA VIVO";
  if (progress >= 75) return "OPERAÇÃO CONECTADA";
  if (progress >= 45) return "CIRCUITO ACENDENDO";
  if (progress > 0) return "PRIMEIRO SINAL";
  return "MAPEANDO A COZINHA";
}

function formatPulse(value?: string | null) {
  if (!value) return "sem validação ainda";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "pulso registrado";
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  if (minutes < 2) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return new Date(parsed).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

async function edge(base: string, path: string, token: string, optional = false) {
  const response = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !optional) throw new Error(body?.detail || "Leitura indisponível");
  return { ok: response.ok, body };
}

function focusProvider(provider: Provider, reduced: boolean) {
  const passport = document.querySelector<HTMLElement>(
    `[data-passport-provider="${CSS.escape(provider.key)}"]`,
  );
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".cx-card,[data-pagbank-connection-card]"));
  const card = cards.find((item) => (item.textContent || "").toLowerCase().includes(provider.name.toLowerCase()));
  const target = passport || card;
  if (!target) return;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  target.classList.add("c76-focus");
  window.setTimeout(() => target.classList.remove("c76-focus"), 1600);
}

export function ActivationCircuitV76() {
  const reduced = Boolean(useReducedMotion());
  const isConnections = useMemo(
    () => new URLSearchParams(window.location.search).get("connections") === "1",
    [],
  );
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [celebration, setCelebration] = useState("");

  useEffect(() => {
    if (!isConnections) return;
    let frame = 0;
    let cancelled = false;
    const mount = () => {
      if (cancelled) return;
      const page = document.querySelector<HTMLElement>(".cx-page");
      const hero = page?.querySelector<HTMLElement>(".cx-hero");
      if (!page || !hero) {
        frame = window.requestAnimationFrame(mount);
        return;
      }
      let node = page.querySelector<HTMLElement>("[data-c76-host]");
      if (!node) {
        node = document.createElement("div");
        node.dataset.c76Host = "true";
        hero.insertAdjacentElement("afterend", node);
      }
      setHost(node);
    };
    mount();
    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      const node = document.querySelector<HTMLElement>("[data-c76-host]");
      node?.remove();
    };
  }, [isConnections]);

  useEffect(() => {
    if (!isConnections) return;
    let disposed = false;
    const token = localStorage.getItem("c360_token") || "";
    if (!token) return;
    request("/me", {}, token)
      .then((me) => {
        if (!disposed) setBusinessId(Number(me?.businesses?.[0]?.id || 0));
      })
      .catch(() => !disposed && setError(true));

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.closest(".cx-top")) return;
      const id = Number(target.value || 0);
      if (id) setBusinessId(id);
    };
    document.addEventListener("change", onChange);
    return () => {
      disposed = true;
      document.removeEventListener("change", onChange);
    };
  }, [isConnections]);

  useEffect(() => {
    if (!isConnections || !businessId) return;
    const token = localStorage.getItem("c360_token") || "";
    if (!token) return;
    let disposed = false;
    let timer = 0;

    const load = async () => {
      try {
        const [catalogResult, healthResult] = await Promise.all([
          edge(INTEGRATIONS_API, `/businesses/${businessId}/integrations`, token),
          edge(HEALTH_API, `/businesses/${businessId}/health`, token, true),
        ]);
        if (disposed) return;
        const catalog = catalogResult.body as Catalog;
        const providers = Array.isArray(catalog.providers) ? catalog.providers : [];
        const nextSnapshot: Snapshot = {
          providers,
          recommended: Array.isArray(catalog.recommended_order) ? catalog.recommended_order : [],
          health: healthResult.ok ? (healthResult.body?.summary || null) : null,
          readAt: new Date().toISOString(),
        };

        const liveNow = providers.filter((provider) => providerState(provider) === "live").map((provider) => provider.key);
        const memoryKey = `c360:c76:live:${businessId}`;
        const beforeRaw = sessionStorage.getItem(memoryKey);
        if (beforeRaw) {
          const before = new Set<string>(JSON.parse(beforeRaw));
          const unlocked = liveNow.find((key) => !before.has(key));
          if (unlocked) {
            const provider = providers.find((item) => item.key === unlocked);
            setCelebration(provider?.name || "Nova conexão");
            window.setTimeout(() => setCelebration(""), 4200);
          }
        }
        sessionStorage.setItem(memoryKey, JSON.stringify(liveNow));
        setSnapshot(nextSnapshot);
        setError(false);
      } catch {
        if (!disposed) setError(true);
      }
    };

    void load();
    timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    }, 45000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [businessId, isConnections]);

  const model = useMemo(() => {
    if (!snapshot) return null;
    const byKey = new Map(snapshot.providers.map((provider) => [provider.key, provider]));
    const ordered = snapshot.recommended.length
      ? snapshot.recommended.map((key) => byKey.get(key)).filter(Boolean) as Provider[]
      : snapshot.providers;
    const display = ordered.slice(0, 6);
    const live = display.filter((provider) => providerState(provider) === "live");
    const progress = display.length ? Math.round((live.length / display.length) * 100) : 0;
    const next = display.find((provider) => providerState(provider) !== "live") || null;
    const latestSuccess = snapshot.providers
      .map((provider) => provider.connection?.last_success_at || "")
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    return { display, live, progress, next, latestSuccess };
  }, [snapshot]);

  if (!isConnections || !host) return null;

  return createPortal(
    <section className="c76-shell" data-activation-circuit-v76 aria-label="Circuito vivo das conexões">
      <div className="c76-ambient" aria-hidden="true" />
      <motion.div
        className="c76-bento c76-bento--core"
        initial={reduced ? false : { opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 210, damping: 25 }}
      >
        <div className="c76-core-copy">
          <span>CIRCUITO VIVO · V7.6</span>
          <h2>{model ? rank(model.progress) : "LENDO A OPERAÇÃO"}</h2>
          <p>O que acende aqui já existe do lado de fora. Nada fica verde por animação, clique ou promessa.</p>
        </div>
        <div className="c76-gauge" style={{ "--c76-progress": `${model?.progress || 0}%` } as React.CSSProperties}>
          <div>
            <Gauge />
            <b>{model?.progress || 0}%</b>
            <small>circuito</small>
          </div>
        </div>
        <div className="c76-flow" aria-hidden="true">
          <span>ENTRA</span><i /><span>OPERA</span><i /><span>APRENDE</span>
        </div>
      </motion.div>

      <div className="c76-bento c76-bento--evidence" data-c76-evidence>
        <header><HeartPulse /><span>PROVA OPERACIONAL</span></header>
        <div className="c76-evidence-grid">
          <div><b>{model?.live.length ?? "·"}</b><small>conexões vivas</small></div>
          <div><b>{snapshot?.health ? `${(snapshot.health.healthy || 0) + (snapshot.health.recovered || 0)}/${snapshot.health.total || 0}` : "SERVER"}</b><small>saúde real</small></div>
          <div><b>{model ? formatPulse(model.latestSuccess) : "lendo"}</b><small>último OK</small></div>
        </div>
        <footer>
          <ShieldCheck />
          <span>{error ? "Leitura visual indisponível; os controles abaixo continuam operacionais." : "Leitura passiva. Nenhum teste externo foi disparado."}</span>
        </footer>
      </div>

      <div className="c76-bento c76-bento--nodes">
        <header>
          <div><Orbit /><span>CAPACIDADES</span></div>
          <small>{model?.next ? `próximo: ${model.next.name}` : model ? "circuito planejado aceso" : "mapeando"}</small>
        </header>
        <div className="c76-node-grid" role="list">
          {(model?.display || []).map((provider, index) => {
            const state = providerState(provider);
            const capability = capabilityByProvider[provider.key] || {
              label: provider.name.toUpperCase(),
              icon: provider.key.includes("food") ? Store : PlugZap,
              outcome: provider.impact || "Capacidade ligada à operação.",
            };
            const Icon = capability.icon;
            return (
              <motion.button
                key={provider.key}
                type="button"
                role="listitem"
                className={`c76-node c76-node--${state}`}
                data-c76-provider={provider.key}
                data-c76-state={state}
                onClick={() => focusProvider(provider, reduced)}
                whileHover={reduced ? undefined : { y: -3, scale: 1.012 }}
                whileTap={reduced ? undefined : { scale: 0.985 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
              >
                <span className="c76-node-index">{String(index + 1).padStart(2, "0")}</span>
                <i>{state === "live" ? <BadgeCheck size={19} /> : <Icon size={19} />}</i>
                <div>
                  <b>{capability.label}</b>
                  <strong>{provider.name}</strong>
                  <small>{capability.outcome}</small>
                </div>
                <em>{stateLabel(state)} <ChevronRight /></em>
              </motion.button>
            );
          })}
          {!model?.display.length && !error ? (
            <div className="c76-skeleton"><Activity /><span>Descobrindo quais capacidades pertencem à sua operação…</span></div>
          ) : null}
          {error && !model ? (
            <div className="c76-skeleton c76-skeleton--error"><CloudCog /><span>O mapa visual não respondeu. Use os controles operacionais abaixo normalmente.</span></div>
          ) : null}
        </div>
      </div>

      {celebration ? (
        <motion.div
          className="c76-unlock"
          role="status"
          initial={reduced ? false : { opacity: 0, scale: 0.88, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <Sparkles />
          <div><span>CAPACIDADE ACESA DE VERDADE</span><b>{celebration}</b></div>
        </motion.div>
      ) : null}
    </section>,
    host,
  );
}
