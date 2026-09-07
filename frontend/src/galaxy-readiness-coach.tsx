import { motion, useReducedMotion } from "motion/react";
import {
  CheckCircle2,
  CloudCog,
  LockKeyhole,
  PlugZap,
  Radar,
  ShieldCheck,
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

type CapabilitySnapshot = {
  id: ProviderId;
  platform_ready: boolean | null;
  authorization: string;
};

const API =
  import.meta.env.VITE_PUBLIC_INTEGRATIONS_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-public-integrations-v58";

const providerMeta: Record<ProviderId, { label: string; short: string }> = {
  whatsapp: { label: "WhatsApp Business", short: "WhatsApp" },
  ifood: { label: "iFood", short: "iFood" },
  mercadopago: { label: "Mercado Pago", short: "Mercado Pago" },
  google: { label: "Google Business", short: "Google" },
  meta_ads: { label: "Meta Ads", short: "Meta Ads" },
};

const ids = Object.keys(providerMeta) as ProviderId[];

function markGalaxyNodes(snapshot: CapabilitySnapshot[]) {
  const host = document.querySelector<HTMLElement>("[data-plug-play-galaxy-host]");
  if (!host) return;

  for (const button of Array.from(host.querySelectorAll<HTMLButtonElement>("button"))) {
    const text = (button.textContent || "").toLowerCase();
    const title = (button.getAttribute("title") || "").toLowerCase();
    const capability = snapshot.find(({ id }) => {
      const names = [providerMeta[id].label, providerMeta[id].short].map((name) => name.toLowerCase());
      return names.some((name) => title === name || text.includes(name));
    });

    if (!capability) continue;
    button.dataset.platformReady = capability.platform_ready === null ? "checking" : String(capability.platform_ready);
    button.setAttribute(
      "aria-description",
      capability.platform_ready === null
        ? "Consultando disponibilidade da integração"
        : capability.platform_ready
          ? "Infraestrutura pronta para iniciar autorização oficial"
          : "Integração planejável; ativação da plataforma ainda necessária",
    );
  }
}

function selectGalaxyProvider(id: ProviderId) {
  const host = document.querySelector<HTMLElement>("[data-plug-play-galaxy-host]");
  if (!host) return;
  const names = [providerMeta[id].label, providerMeta[id].short].map((name) => name.toLowerCase());
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
  const target = buttons.find((button) => {
    const text = (button.textContent || "").toLowerCase();
    const title = (button.getAttribute("title") || "").toLowerCase();
    return names.some((name) => title === name || text.includes(name));
  });
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target.click(), 260);
}

export function GalaxyReadinessCoach() {
  const reduceMotion = Boolean(useReducedMotion());
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/capabilities`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("capabilities unavailable");
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        setCapabilities(Array.isArray(body.providers) ? body.providers : []);
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

  const snapshot = useMemo<CapabilitySnapshot[]>(
    () =>
      ids.map((id) => {
        const capability = capabilities.find((item) => item.id === id);
        return {
          id,
          platform_ready: loaded ? Boolean(capability?.platform_ready) : null,
          authorization: capability?.authorization || "Autorização oficial",
        };
      }),
    [capabilities, loaded],
  );

  useEffect(() => {
    markGalaxyNodes(snapshot);
    const observer = new MutationObserver(() => markGalaxyNodes(snapshot));
    const host = document.querySelector<HTMLElement>("[data-plug-play-galaxy-host]");
    if (host) observer.observe(host, { childList: true, subtree: true });
    try {
      localStorage.setItem(
        "c360_public_capabilities_snapshot",
        JSON.stringify({
          providers: snapshot,
          updated_at: new Date().toISOString(),
        }),
      );
    } catch {
      // The public journey remains fully usable without local persistence.
    }
    return () => observer.disconnect();
  }, [snapshot]);

  const readyCount = snapshot.filter((item) => item.platform_ready === true).length;
  const progress = loaded ? Math.round((readyCount / snapshot.length) * 100) : 0;

  return (
    <section
      data-galaxy-readiness-coach="true"
      className="relative z-[4] mx-auto -mt-12 mb-20 w-[min(1320px,calc(100%-2rem))] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-slate-950/70 p-4 text-white shadow-[inset_0_1px_rgba(255,255,255,.06),0_35px_110px_rgba(0,0,0,.24)] backdrop-blur-3xl sm:p-5"
    >
      <style>{`
        [data-plug-play-galaxy-host] button[data-platform-ready="true"] {
          box-shadow: 0 0 0 1px rgba(110,231,183,.16), 0 0 32px rgba(110,231,183,.10) !important;
        }
        [data-plug-play-galaxy-host] button[data-platform-ready="false"] {
          box-shadow: 0 0 0 1px rgba(253,230,138,.10), 0 0 26px rgba(253,230,138,.055) !important;
        }
        [data-plug-play-galaxy-host] button[data-platform-ready="checking"] {
          filter: saturate(.8);
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-emerald-300/[0.055] blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -bottom-28 size-72 rounded-full bg-amber-200/[0.04] blur-[110px]" />

      <div className="relative grid gap-4 xl:grid-cols-[minmax(250px,.43fr)_minmax(0,1.57fr)] xl:items-center">
        <div className="grid gap-3">
          <span className="flex items-center gap-2 text-[0.56rem] font-black tracking-[0.16em] text-emerald-100/65">
            <Radar size={13} /> REALIDADE DA PLATAFORMA
          </span>
          <div className="flex items-end justify-between gap-4 xl:block">
            <div>
              <b className="block text-xl font-black tracking-[-0.035em] sm:text-2xl">
                {loaded ? `${readyCount}/${snapshot.length} autorizáveis agora` : "Consultando conexões reais"}
              </b>
              <small className="mt-1 block max-w-[42ch] text-[0.62rem] font-medium leading-5 text-white/36">
                Sua rota pode ser montada antes da ativação. O botão de autorização só aparece quando a infraestrutura oficial estiver pronta.
              </small>
            </div>
            <div className="relative grid size-14 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-black/20 xl:mt-4">
              <svg className="absolute inset-1 size-12 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="3" />
                <motion.circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="rgba(110,231,183,.78)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength="1"
                  strokeDasharray="1"
                  animate={{ strokeDashoffset: 1 - progress / 100 }}
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 20 }}
                />
              </svg>
              <span className="text-[0.58rem] font-black text-white/65">{loaded ? `${progress}%` : "···"}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {snapshot.map((item, index) => {
            const ready = item.platform_ready === true;
            const checking = item.platform_ready === null;
            return (
              <motion.button
                key={item.id}
                type="button"
                data-readiness-provider={item.id}
                onClick={() => selectGalaxyProvider(item.id)}
                className={`group relative overflow-hidden rounded-[1.3rem] border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 ${
                  checking
                    ? "border-white/[0.07] bg-white/[0.025]"
                    : ready
                      ? "border-emerald-100/15 bg-emerald-200/[0.045]"
                      : "border-amber-100/10 bg-amber-100/[0.025]"
                }`}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { delay: index * 0.035, type: "spring", stiffness: 170, damping: 22 }}
                whileHover={reduceMotion ? undefined : { y: -2, scale: 1.012 }}
                whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-8 place-items-center rounded-xl border border-white/[0.08] bg-black/20 text-white/55">
                    {checking ? <CloudCog size={14} /> : ready ? <PlugZap size={14} /> : <LockKeyhole size={14} />}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[0.42rem] font-black tracking-[0.08em] ${
                    checking
                      ? "border-white/10 text-white/32"
                      : ready
                        ? "border-emerald-100/15 text-emerald-100/70"
                        : "border-amber-100/12 text-amber-100/55"
                  }`}>
                    {checking ? "LENDO" : ready ? "AUTORIZAR" : "PLATAFORMA"}
                  </span>
                </div>
                <b className="mt-3 block truncate text-xs font-black text-white/78">{providerMeta[item.id].short}</b>
                <small className="mt-1 block truncate text-[0.48rem] font-bold text-white/28">{item.authorization}</small>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.05] pt-3 text-[0.5rem] font-bold text-white/28">
        <span className="flex items-center gap-1.5"><ShieldCheck size={11} /> nenhum segredo vai para o navegador</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 size={11} /> tocar apenas explora; não conecta conta</span>
      </div>
    </section>
  );
}
