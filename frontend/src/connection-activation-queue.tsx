import { motion, useReducedMotion } from "motion/react";
import {
  ArrowDown,
  Check,
  CloudCog,
  LockKeyhole,
  PlugZap,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ProviderId = "whatsapp" | "ifood" | "mercadopago" | "google" | "meta_ads";
type Capability = {
  id: ProviderId;
  authorization: string;
  platform_ready: boolean;
  state: "ready_to_authorize" | "platform_setup_required";
  user_action: "authorize_account" | "none";
};

type QueueItem = {
  id: ProviderId;
  position: number;
  platform_ready: boolean | null;
  state: "ready_to_authorize" | "platform_setup_required" | "checking";
  authorization: string;
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

const allowed = new Set<ProviderId>([
  "whatsapp",
  "ifood",
  "mercadopago",
  "google",
  "meta_ads",
]);

function readProviders(): ProviderId[] {
  try {
    const raw = JSON.parse(localStorage.getItem("c360_discovery_connection_intent") || "null");
    if (!Array.isArray(raw?.providers)) return [];
    return raw.providers.filter((id: ProviderId) => allowed.has(id));
  } catch {
    return [];
  }
}

export function ConnectionActivationQueue({
  restored,
}: {
  restored: boolean;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const [providers, setProviders] = useState<ProviderId[]>(() => readProviders());
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => setProviders(readProviders());
    window.addEventListener("storage", sync);
    window.addEventListener("c360:connection-intent", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("c360:connection-intent", sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!providers.length) return;
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
  }, [providers.join("|")]);

  const queue = useMemo<QueueItem[]>(
    () =>
      providers.map((id, index) => {
        const capability = capabilities.find((item) => item.id === id);
        return {
          id,
          position: index + 1,
          platform_ready: loaded ? Boolean(capability?.platform_ready) : null,
          state: !loaded
            ? "checking"
            : capability?.platform_ready
              ? "ready_to_authorize"
              : "platform_setup_required",
          authorization: capability?.authorization || "Autorização oficial",
        };
      }),
    [providers, capabilities, loaded],
  );

  useEffect(() => {
    if (!providers.length) return;
    try {
      localStorage.setItem(
        "c360_connection_activation_queue",
        JSON.stringify({
          providers,
          queue,
          restored_to_profile: restored,
          updated_at: new Date().toISOString(),
        }),
      );
    } catch {
      // The authenticated hub works even when local persistence is unavailable.
    }
  }, [providers, queue, restored]);

  if (!providers.length) return null;

  const ready = queue.filter((item) => item.platform_ready).length;
  const next = queue.find((item) => item.platform_ready) || queue[0];

  return (
    <section
      data-connection-activation-queue="true"
      className="relative z-[30] overflow-hidden border-b border-white/[0.07] bg-slate-950/90 px-4 py-5 text-white shadow-[0_28px_90px_rgba(0,0,0,.26)] backdrop-blur-3xl sm:px-6"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-emerald-300/[0.06] blur-[90px]" />
      <div aria-hidden="true" className="pointer-events-none absolute right-[10%] top-[-8rem] size-72 rounded-full bg-violet-300/[0.05] blur-[100px]" />

      <div className="relative mx-auto grid w-[min(1500px,100%)] gap-5 xl:grid-cols-[minmax(260px,.45fr)_minmax(0,1.55fr)] xl:items-center">
        <div className="grid gap-3">
          <span className="flex items-center gap-2 text-[0.58rem] font-black tracking-[0.15em] text-emerald-100/70">
            <Route size={14} /> SUA ROTA CHEGOU AQUI
          </span>
          <div className="flex items-end justify-between gap-4 xl:block">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.045em] sm:text-3xl">Ative na ordem que você escolheu.</h2>
              <p className="mt-1 max-w-[42ch] text-xs font-medium leading-relaxed text-white/42">
                {restored
                  ? "A exploração virou plano. A autorização continua sendo sua, dentro do provedor oficial."
                  : "Sua operação atual foi preservada. A rota abaixo fica como referência, sem sobrescrever configuração existente."}
              </p>
            </div>
            <div className="shrink-0 rounded-[1.15rem] border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-right xl:mt-4 xl:w-fit xl:text-left">
              <b className="block text-lg font-black text-white">{loaded ? `${ready}/${queue.length}` : "···"}</b>
              <small className="text-[0.5rem] font-black tracking-[0.09em] text-white/30">AUTORIZÁVEIS AGORA</small>
            </div>
          </div>
        </div>

        <div className="relative overflow-x-auto pb-1">
          <div className="flex min-w-max items-stretch gap-2.5 xl:min-w-0 xl:grid xl:grid-flow-col xl:auto-cols-fr">
            {queue.map((item, index) => {
              const isNext = next?.id === item.id;
              const isReady = item.platform_ready === true;
              const checking = item.platform_ready === null;
              return (
                <motion.div
                  key={`${item.position}-${item.id}`}
                  className={`relative flex min-w-[13rem] items-center gap-3 rounded-[1.35rem] border p-3.5 xl:min-w-0 ${
                    isNext
                      ? "border-emerald-100/20 bg-emerald-200/[0.065] shadow-[0_0_38px_rgba(110,231,183,.08)]"
                      : isReady
                        ? "border-white/10 bg-white/[0.045]"
                        : "border-amber-100/10 bg-amber-100/[0.025]"
                  }`}
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { delay: index * 0.045, type: "spring", stiffness: 180, damping: 22 }}
                >
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl border text-xs font-black ${isNext ? "border-emerald-100/20 bg-emerald-200 text-slate-950" : "border-white/10 bg-black/20 text-white/55"}`}>
                    {item.position}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-xs font-black text-white/80">{labels[item.id]}</b>
                    <small className="mt-0.5 block truncate text-[0.5rem] font-bold text-white/30">{item.authorization}</small>
                    <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.46rem] font-black tracking-[0.06em] ${
                      checking
                        ? "border-white/10 text-white/35"
                        : isReady
                          ? "border-emerald-100/15 text-emerald-100/70"
                          : "border-amber-100/12 text-amber-100/55"
                    }`}>
                      {checking ? <CloudCog size={10} /> : isReady ? <Check size={10} /> : <LockKeyhole size={10} />}
                      {checking ? "CONSULTANDO" : isReady ? "AUTORIZAR" : "PLATAFORMA"}
                    </span>
                  </span>
                  {index < queue.length - 1 && (
                    <ArrowDown className="absolute -right-[1.05rem] top-1/2 z-10 hidden -translate-y-1/2 -rotate-90 text-white/15 xl:block" size={14} />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-4 flex w-[min(1500px,100%)] flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.05] pt-3 text-[0.52rem] font-bold text-white/30">
        <span className="flex items-center gap-1.5"><ShieldCheck size={11} /> consentimento oficial</span>
        <span className="flex items-center gap-1.5"><PlugZap size={11} /> sem copiar token</span>
        <span className="flex items-center gap-1.5"><Sparkles size={11} /> nenhuma conexão é aberta automaticamente</span>
      </div>
    </section>
  );
}