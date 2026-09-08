import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  Activity,
  Check,
  ChefHat,
  ChevronRight,
  CircleDollarSign,
  CloudCog,
  Gauge,
  MessageCircleMore,
  PackageCheck,
  PlugZap,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { request } from "./app";

const routeNames: Array<[string, string]> = [
  ["connections", "Conexões vivas"],
  ["delivery", "Delivery em movimento"],
  ["today", "Pulso de hoje"],
  ["cash", "Dinheiro em fluxo"],
  ["crm", "Relacionamentos"],
  ["kitchen", "Cozinha em tempo real"],
  ["cmv", "CMV inteligente"],
  ["purchases", "Compras 360"],
  ["suppliers", "Rede de fornecedores"],
  ["autopilot", "Autopilot 360"],
];

const INTEGRATIONS_API =
  import.meta.env.VITE_INTEGRATIONS_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29";
const HEALTH_API =
  import.meta.env.VITE_INTEGRATION_HEALTH_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integration-health-v73";
const WHATSAPP_RUNTIME =
  import.meta.env.VITE_WHATSAPP_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-whatsapp-v74";

type ConnectionLite = {
  status?: string;
  display_name?: string | null;
  last_success_at?: string | null;
};
type ProviderLite = {
  key: string;
  name: string;
  category?: string;
  impact?: string;
  platform_ready?: boolean;
  operational?: boolean;
  selection_required?: boolean;
  connection?: ConnectionLite | null;
};
type HealthSummary = {
  healthy: number;
  degrading: number;
  review: number;
  recovered: number;
  total: number;
};
type IntegrationSnapshot = {
  recommended_order: string[];
  providers: ProviderLite[];
  health: HealthSummary | null;
  whatsappRuntimeReady: boolean;
};

function currentSurface() {
  const params = new URLSearchParams(window.location.search);
  const found = routeNames.find(([key]) => params.get(key) === "1");
  return found?.[1] || "Operação viva";
}

function onConnectionsRoute() {
  return new URLSearchParams(window.location.search).get("connections") === "1";
}

async function edgeJson(
  base: string,
  path: string,
  token: string,
  allowFailure = false,
) {
  const response = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !allowFailure) {
    throw new Error(
      typeof body?.detail === "string" ? body.detail : "Falha ao ler integração",
    );
  }
  return { ok: response.ok, body };
}

function providerState(provider: ProviderLite) {
  if (provider.operational || provider.connection?.status === "active") return "live";
  if (provider.selection_required) return "choose";
  if (provider.connection?.status === "degraded") return "attention";
  if (!provider.platform_ready) return "platform";
  return "ready";
}

const capabilityByProvider: Record<
  string,
  { label: string; icon: typeof PlugZap; promise: string }
> = {
  whatsapp: {
    label: "RECOMPRA",
    icon: MessageCircleMore,
    promise: "Atendimento, recuperação e relacionamento no mesmo número.",
  },
  ifood: {
    label: "PEDIDOS",
    icon: PackageCheck,
    promise: "Marketplace cai na mesma fila da cozinha.",
  },
  mercadopago: {
    label: "PAGAR",
    icon: WalletCards,
    promise: "Pix confirmado sem conferência manual.",
  },
  google: {
    label: "DESCOBRIR",
    icon: Search,
    promise: "Presença local ligada à operação.",
  },
  meta_ads: {
    label: "ATRIBUIR",
    icon: Radar,
    promise: "Aquisição conversa com venda e margem.",
  },
};

function enhanceSemantics() {
  const drawer = document.querySelector<HTMLElement>(".access-drawer");
  if (!drawer) return;
  const fields = [
    {
      selector: 'input[autocomplete="name"]',
      id: "c360-auth-name",
      name: "name",
    },
    {
      selector: 'input[autocomplete="email"]',
      id: "c360-auth-email",
      name: "email",
    },
    {
      selector:
        'input[autocomplete="new-password"], input[autocomplete="current-password"]',
      id: "c360-auth-password",
      name: "password",
    },
  ];
  fields.forEach(({ selector, id, name }) => {
    const input = drawer.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    input.id = id;
    input.name = name;
    const label = input.closest<HTMLLabelElement>("label");
    if (label) {
      label.htmlFor = id;
      label.dataset.c360ExplicitLabel = "true";
    }
  });
}

const revealSelector = [
  ".card",
  ".panel",
  ".today-card",
  ".ticket",
  ".batch-card",
  ".cx-card",
  ".margin-panel",
  ".cash-panel",
  ".network-card",
  ".purchase-card",
  ".supplier-card",
  ".kds-card",
  ".playbook-card",
  ".direct-card",
  ".subscription-card",
  ".autopilot-card",
].join(",");

/**
 * Experience v7.5 keeps the v7.4 DOM contract for existing release gates while
 * extending it with read-only integration guidance, explicit form semantics and
 * progressive visual depth. It never calls provider /test or any write endpoint.
 */
export function ExperienceOrchestratorV74() {
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 150,
    damping: 30,
    mass: 0.18,
  });
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const auraX = useTransform(pointerX, [0, 1], reduced ? [0, 0] : [-28, 28]);
  const auraY = useTransform(pointerY, [0, 1], reduced ? [0, 0] : [-22, 22]);
  const surface = useMemo(currentSurface, []);
  const isConnections = useMemo(onConnectionsRoute, []);
  const [missionOpen, setMissionOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 820,
  );
  const [businessId, setBusinessId] = useState(0);
  const [snapshot, setSnapshot] = useState<IntegrationSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.c360Experience = "v74";
    document.documentElement.dataset.c360ExperienceNext = "v75";
    const move = (event: PointerEvent) => {
      if (!reduced) {
        pointerX.set(
          Math.min(1, Math.max(0, event.clientX / Math.max(window.innerWidth, 1))),
        );
        pointerY.set(
          Math.min(1, Math.max(0, event.clientY / Math.max(window.innerHeight, 1))),
        );
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest<HTMLElement>(revealSelector);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty(
        "--x75-x",
        `${Math.round(((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100)}%`,
      );
      card.style.setProperty(
        "--x75-y",
        `${Math.round(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100)}%`,
      );
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      delete document.documentElement.dataset.c360Experience;
      delete document.documentElement.dataset.c360ExperienceNext;
    };
  }, [pointerX, pointerY, reduced]);

  useEffect(() => {
    const intersection = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("x75-visible");
        });
      },
      { threshold: 0.08, rootMargin: "80px 0px -6%" },
    );
    const observed = new WeakSet<Element>();
    const hydrate = () => {
      enhanceSemantics();
      document.querySelectorAll(revealSelector).forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        element.classList.add("x75-reveal");
        intersection.observe(element);
      });
    };
    hydrate();
    const mutation = new MutationObserver(hydrate);
    mutation.observe(document.getElementById("root") || document.body, {
      subtree: true,
      childList: true,
    });
    return () => {
      mutation.disconnect();
      intersection.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isConnections) return;
    let disposed = false;
    const token = localStorage.getItem("c360_token") || "";
    if (!token) return;
    request("/me", {}, token)
      .then((me) => {
        if (!disposed) setBusinessId(Number(me?.businesses?.[0]?.id || 0));
      })
      .catch(() => {
        if (!disposed) setSnapshotError(true);
      });
    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (!target.closest(".cx-top")) return;
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
    let disposed = false;
    const token = localStorage.getItem("c360_token") || "";
    setSnapshotError(false);
    Promise.all([
      edgeJson(INTEGRATIONS_API, `/businesses/${businessId}/integrations`, token),
      edgeJson(HEALTH_API, `/businesses/${businessId}/health`, token, true),
      edgeJson(WHATSAPP_RUNTIME, "/readyz", "", true),
    ])
      .then(([catalog, health, whatsapp]) => {
        if (disposed) return;
        setSnapshot({
          recommended_order: catalog.body?.recommended_order || [],
          providers: catalog.body?.providers || [],
          health: health.ok ? health.body?.summary || null : null,
          whatsappRuntimeReady: Boolean(
            whatsapp.ok && whatsapp.body?.signature_verification,
          ),
        });
      })
      .catch(() => {
        if (!disposed) setSnapshotError(true);
      });
    return () => {
      disposed = true;
    };
  }, [businessId, isConnections]);

  const mission = useMemo(() => {
    if (!snapshot) return null;
    const providers = snapshot.providers;
    const byKey = new Map(providers.map((provider) => [provider.key, provider]));
    const order = snapshot.recommended_order.length
      ? snapshot.recommended_order
      : ["whatsapp", "mercadopago", "google", "ifood", "meta_ads"];
    const next = order
      .map((key) => byKey.get(key))
      .find((provider) => provider && providerState(provider) !== "live");
    const live = providers.filter((provider) => providerState(provider) === "live");
    return { providers, next: next || null, live };
  }, [snapshot]);

  function focusProvider(provider: ProviderLite) {
    const cards = [...document.querySelectorAll<HTMLElement>(".cx-card")];
    const card = cards.find((item) => item.textContent?.includes(provider.name));
    if (!card) return;
    card.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
    card.classList.add("x75-focus-ring");
    window.setTimeout(() => card.classList.remove("x75-focus-ring"), 1800);
  }

  return (
    <>
      <div className="x74-atmosphere" aria-hidden="true" data-experience-v74>
        <motion.div
          className="x74-aura x74-aura--mint"
          style={{ x: auraX, y: auraY }}
        />
        <motion.div
          className="x74-aura x74-aura--violet"
          style={{ x: auraY, y: auraX }}
        />
        <div className="x74-grid" />
        <motion.div className="x74-scroll-progress" style={{ scaleX: progress }} />
        <div className="x74-pulse-rail">
          <div className="x74-pulse-dot">
            <Activity size={13} />
          </div>
          <strong>{surface}</strong>
          <div className="x74-marquee-clip">
            <motion.div
              className="x74-marquee"
              animate={reduced ? undefined : { x: ["0%", "-50%"] }}
              transition={
                reduced
                  ? undefined
                  : { duration: 24, repeat: Infinity, ease: "linear" }
              }
            >
              {[0, 1].map((copy) => (
                <div className="x74-marquee-set" key={copy}>
                  <span>
                    <PlugZap size={11} /> CONECTAR
                  </span>
                  <span>
                    <PackageCheck size={11} /> PRODUZIR
                  </span>
                  <span>
                    <ChefHat size={11} /> ENTREGAR
                  </span>
                  <span>
                    <CircleDollarSign size={11} /> MARGEM
                  </span>
                  <span>
                    <Sparkles size={11} /> APRENDER
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      {isConnections && (
        <aside
          className={`x75-mission ${missionOpen ? "x75-mission--open" : ""}`}
          data-activation-cockpit-v75
          aria-label="Missão de ativação das conexões"
        >
          <button
            className="x75-mission-toggle"
            type="button"
            onClick={() => setMissionOpen((value) => !value)}
            aria-expanded={missionOpen}
          >
            <span>
              <i>
                <Gauge size={15} />
              </i>
              <b>MISSÃO 360</b>
            </span>
            <em>{mission ? `${mission.live.length}/${mission.providers.length}` : "···"}</em>
          </button>

          {missionOpen && (
            <motion.div
              className="x75-mission-panel"
              initial={reduced ? false : { opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
            >
              <header>
                <div>
                  <span>ATIVAÇÃO 360 · V7.5</span>
                  <h2>Acenda capacidades, não integrações.</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMissionOpen(false)}
                  aria-label="Fechar missão de ativação"
                >
                  <X size={16} />
                </button>
              </header>

              {snapshotError ? (
                <div className="x75-mission-empty">
                  <CloudCog />
                  <b>O painel operacional continua disponível.</b>
                  <small>Não foi possível sincronizar a leitura visual agora.</small>
                </div>
              ) : !mission ? (
                <div className="x75-mission-empty">
                  <Activity />
                  <b>Lendo sua operação…</b>
                  <small>Nenhum teste externo é disparado nesta leitura.</small>
                </div>
              ) : (
                <>
                  <div className="x75-circuit" role="list">
                    {mission.providers.slice(0, 5).map((provider) => {
                      const state = providerState(provider);
                      const capability = capabilityByProvider[provider.key] || {
                        label: provider.name.toUpperCase(),
                        icon: PlugZap,
                        promise: provider.impact || "Capacidade conectada à operação.",
                      };
                      const Icon = capability.icon;
                      return (
                        <button
                          type="button"
                          role="listitem"
                          key={provider.key}
                          className={`x75-node x75-node--${state}`}
                          data-provider-state={state}
                          onClick={() => focusProvider(provider)}
                          aria-label={`${provider.name}: ${state}`}
                        >
                          <i>
                            {state === "live" ? <Check /> : <Icon />}
                          </i>
                          <span>
                            <b>{capability.label}</b>
                            <small>{provider.name}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="x75-truth-row">
                    <span>
                      <ShieldCheck />
                      {snapshot?.health
                        ? `${snapshot.health.healthy + snapshot.health.recovered}/${snapshot.health.total} saudáveis`
                        : "Saúde cuidada no servidor"}
                    </span>
                    <span>
                      <MessageCircleMore />
                      {snapshot?.whatsappRuntimeReady
                        ? "WhatsApp protegido"
                        : "WhatsApp · 360 preparando"}
                    </span>
                  </div>

                  {mission.next ? (
                    <div className="x75-next-mission">
                      <div>
                        <span>PRÓXIMO DESBLOQUEIO</span>
                        <h3>{mission.next.name}</h3>
                        <p>
                          {(capabilityByProvider[mission.next.key]?.promise ||
                            mission.next.impact ||
                            "Abra o controle e conclua a autorização oficial.")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => focusProvider(mission.next!)}
                        disabled={!mission.next.platform_ready}
                      >
                        {mission.next.platform_ready ? (
                          <>
                            {mission.next.selection_required
                              ? "Escolher conta"
                              : "Abrir controle"}
                            <ChevronRight />
                          </>
                        ) : (
                          <>
                            <CloudCog /> 360 cuidando
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="x75-next-mission x75-next-mission--complete">
                      <Sparkles />
                      <div>
                        <span>CIRCUITO ACESO</span>
                        <h3>As conexões planejadas estão operacionais.</h3>
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </aside>
      )}
    </>
  );
}
