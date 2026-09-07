import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { Check, CloudCog, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ProviderId = "whatsapp" | "ifood" | "mercadopago" | "google" | "meta_ads";
type Capability = {
  id: ProviderId;
  name: string;
  mode: string;
  authorization: string;
  partner_access: string;
  platform_ready: boolean;
  state: "ready_to_authorize" | "platform_setup_required";
  user_action: "authorize_account" | "none";
};

const API =
  import.meta.env.VITE_PUBLIC_INTEGRATIONS_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-public-integrations-v58";

const labels: Record<ProviderId, string> = {
  whatsapp: "WhatsApp",
  ifood: "iFood",
  mercadopago: "Mercado Pago",
  google: "Google Business",
  meta_ads: "Meta Ads",
};

function readPlanned(): ProviderId[] {
  try {
    const value = JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null");
    const allowed = new Set<ProviderId>(["whatsapp", "ifood", "mercadopago", "google", "meta_ads"]);
    return Array.isArray(value?.providers)
      ? value.providers.filter((id: ProviderId) => allowed.has(id))
      : [];
  } catch {
    return [];
  }
}

export function IntegrationRealityRibbon() {
  const reduceMotion = Boolean(useReducedMotion());
  const [planned, setPlanned] = useState<ProviderId[]>(() => readPlanned());
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => setPlanned(readPlanned());
    window.addEventListener("c360:connection-intent", sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("c360:connection-intent", sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/capabilities`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("capabilities unavailable");
        return response.json();
      })
      .then((body) => {
        if (!cancelled) setCapabilities(Array.isArray(body.providers) ? body.providers : []);
      })
      .catch(() => {
        if (!cancelled) setCapabilities([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => planned.map((id) => ({ id, capability: capabilities.find((item) => item.id === id) })),
    [planned, capabilities],
  );
  if (!planned.length) return null;

  const ready = selected.filter((item) => item.capability?.platform_ready).length;

  return (
    <motion.section
      aria-label="Estado real das integrações escolhidas"
      className="relative z-[3] mx-auto -mt-[clamp(3rem,5vw,5rem)] mb-[clamp(5rem,9vw,9rem)] w-[min(1360px,calc(100%-2rem))] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.035] p-4 shadow-[0_30px_100px_rgba(0,0,0,.24),inset_0_1px_rgba(255,255,255,.06)] backdrop-blur-3xl sm:p-5"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 24 }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-20 size-52 rounded-full bg-sky-300/[0.07] blur-[70px]" />
      <div className="relative grid gap-4 xl:grid-cols-[minmax(260px,.55fr)_minmax(0,1.45fr)] xl:items-center">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-black/20 text-sky-100">
            <CloudCog size={21} />
          </span>
          <div>
            <span className="text-[0.52rem] font-black tracking-[0.15em] text-white/35">REALIDADE DA PLATAFORMA</span>
            <div className="mt-1 flex items-baseline gap-2">
              <b className="text-2xl font-black tracking-[-0.05em] text-white">{loaded ? `${ready}/${planned.length}` : "···"}</b>
              <small className="font-bold text-white/40">prontas para autorizar agora</small>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {selected.map(({ id, capability }) => {
            const isReady = Boolean(capability?.platform_ready);
            return (
              <div
                key={id}
                className={`flex min-h-[4.8rem] items-center gap-3 rounded-[1.25rem] border p-3 ${
                  isReady
                    ? "border-emerald-100/18 bg-emerald-200/[0.055]"
                    : "border-amber-100/12 bg-amber-100/[0.035]"
                }`}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl border ${isReady ? "border-emerald-100/15 bg-emerald-200/[0.08] text-emerald-100" : "border-amber-100/12 bg-amber-100/[0.05] text-amber-100/70"}`}>
                  {isReady ? <Check size={15} strokeWidth={3} /> : <LockKeyhole size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-xs font-black text-white/80">{labels[id]}</b>
                  <small className="block truncate text-[0.52rem] font-bold text-white/30">
                    {capability?.authorization || (loaded ? "estado indisponível" : "consultando backend")}
                  </small>
                </span>
                <small className={`shrink-0 rounded-full border px-2 py-1 text-[0.45rem] font-black tracking-[0.06em] ${isReady ? "border-emerald-100/15 text-emerald-100/70" : "border-amber-100/12 text-amber-100/55"}`}>
                  {isReady ? "AUTORIZAR" : "PLATAFORMA"}
                </small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-4 text-[0.55rem] font-bold text-white/35">
        <span className="flex items-center gap-1.5"><ShieldCheck size={12} /> autorização oficial</span>
        <span className="flex items-center gap-1.5"><LockKeyhole size={12} /> segredo nunca vai para o navegador</span>
        <span className="flex items-center gap-1.5"><PlugZap size={12} /> se a plataforma não estiver pronta, o cliente não configura API</span>
      </div>
    </motion.section>
  );
}

const HOST_ATTRIBUTE = "data-integration-reality-host";

export function IntegrationRealityRibbonPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function syncHost() {
      const anchor = document.querySelector<HTMLElement>("[data-living-operation-flow-host]");
      const existing = document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`);
      if (!anchor) {
        existing?.remove();
        setHost(null);
        return;
      }
      if (existing) {
        if (existing.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", existing);
        setHost(existing);
        return;
      }
      const next = document.createElement("div");
      next.setAttribute(HOST_ATTRIBUTE, "");
      next.className = "relative z-[3]";
      anchor.insertAdjacentElement("afterend", next);
      setHost(next);
    }

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`)?.remove();
      setHost(null);
    };
  }, []);

  return host ? createPortal(<IntegrationRealityRibbon />, host) : null;
}