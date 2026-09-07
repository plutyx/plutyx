import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  CircleDot,
  CreditCard,
  HeartPulse,
  Link2,
  MapPin,
  Megaphone,
  MessageCircle,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Unplug,
  WalletCards,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { request } from "./app";

type Evidence = { authorization: boolean; account_linked: boolean; health: boolean };
type NativeProvider = {
  key: string;
  name: string;
  category: string;
  capability: string;
  mode: string;
  eta: string;
  platform_ready: boolean;
  state: "healthy" | "ready" | "connecting" | "stale" | "degraded" | "platform_setup";
  score: number;
  evidence: Evidence;
  connection?: {
    status?: string | null;
    display_name?: string | null;
    external_account_ref?: string | null;
    last_success_at?: string | null;
    last_error?: string | null;
  } | null;
};
type PartnerProvider = {
  key: string;
  name: string;
  category: string;
  capability: string;
  state: "available" | "requested";
  requested_at?: string | null;
};
type Passport = {
  business_id: number;
  generated_at: string;
  summary: {
    native_total: number;
    healthy: number;
    attention: number;
    ready: number;
    platform_setup: number;
    evidence_score: number;
    evidence_max: number;
    progress_percent: number;
  };
  native: NativeProvider[];
  partners: PartnerProvider[];
};

const API =
  import.meta.env.VITE_CONNECT_ORCHESTRATOR_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-connect-orchestrator-v65";

const icons: Record<string, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  ifood: ShoppingBag,
  mercadopago: WalletCards,
  pagbank: CreditCard,
  google: MapPin,
  meta_ads: Megaphone,
  "99food": Store,
  keeta: Store,
  stone: CreditCard,
  cielo: CreditCard,
  getnet: CreditCard,
  rede: CreditCard,
};

const stateMeta = {
  healthy: { label: "VIVO", tone: "emerald", hint: "Autorizado, vinculado e respondendo agora." },
  ready: { label: "1 TOQUE", tone: "cyan", hint: "Plataforma pronta para autorização oficial." },
  connecting: { label: "LIGANDO", tone: "violet", hint: "Autorização iniciada; falta concluir o vínculo." },
  stale: { label: "REVALIDAR", tone: "amber", hint: "Conectado, mas precisa provar saúde novamente." },
  degraded: { label: "ATENÇÃO", tone: "rose", hint: "O provedor respondeu com erro e precisa de revisão." },
  platform_setup: { label: "360 CUIDA", tone: "slate", hint: "Habilitação da plataforma; o restaurante não configura API." },
} as const;

async function remote(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Não foi possível atualizar o passaporte");
  return body;
}

function focusConnection(name: string, reduced: boolean) {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(".cx-card,[data-pagbank-connection-card]"),
  );
  const needle = name.toLowerCase().replace(" business", "");
  const target = candidates.find((card) =>
    (card.textContent || "").toLowerCase().includes(needle),
  );
  if (!target) return;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  if (!reduced) {
    target.animate(
      [
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(103,232,249,0)" },
        { transform: "scale(1.012)", boxShadow: "0 0 0 3px rgba(103,232,249,.18),0 0 72px rgba(103,232,249,.12)" },
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(103,232,249,0)" },
      ],
      { duration: 1100, easing: "ease-out" },
    );
  }
}

function rank(progress: number) {
  if (progress >= 100) return { name: "PLUG & PLAY COMPLETO", icon: Sparkles };
  if (progress >= 80) return { name: "PULSO VIVO", icon: HeartPulse };
  if (progress >= 50) return { name: "OPERAÇÃO CONECTADA", icon: Link2 };
  if (progress >= 20) return { name: "LIGANDO PONTOS", icon: Zap };
  return { name: "PRIMEIRO SINAL", icon: CircleDot };
}

function toneClasses(tone: string) {
  if (tone === "emerald") return "border-emerald-200/20 bg-emerald-200/[0.055] text-emerald-100 shadow-[0_0_45px_rgba(52,211,153,.05)]";
  if (tone === "cyan") return "border-cyan-200/20 bg-cyan-200/[0.055] text-cyan-100 shadow-[0_0_45px_rgba(103,232,249,.05)]";
  if (tone === "violet") return "border-violet-200/20 bg-violet-200/[0.055] text-violet-100";
  if (tone === "amber") return "border-amber-200/20 bg-amber-200/[0.055] text-amber-100";
  if (tone === "rose") return "border-rose-200/20 bg-rose-200/[0.055] text-rose-100";
  return "border-white/[0.07] bg-white/[0.025] text-white/55";
}

function IntegrationPassport({ businessId }: { businessId: number }) {
  const token = localStorage.getItem("c360_token") || "";
  const reduced = Boolean(useReducedMotion());
  const [data, setData] = useState<Passport | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [partnersOpen, setPartnersOpen] = useState(false);

  async function load(silent = false) {
    if (!token || !businessId || busy === "refresh") return;
    if (!silent) setBusy("refresh");
    try {
      const next = await remote(`/businesses/${businessId}/passport`, token);
      setData(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler as conexões");
    } finally {
      if (!silent) setBusy("");
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") void load(true);
    }, 45000);
    const wake = () => {
      if (navigator.onLine && document.visibilityState === "visible") void load(true);
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [businessId]);

  async function requestPartner(provider: PartnerProvider) {
    if (provider.state === "requested" || busy) return;
    setBusy(`partner-${provider.key}`);
    setNotice("");
    setError("");
    try {
      await remote(`/businesses/${businessId}/partners/${provider.key}`, token, {
        method: "POST",
        body: JSON.stringify({ source: "integration_passport_v65" }),
      });
      setNotice(`${provider.name}: ativação registrada. O restaurante não precisa configurar credenciais.`);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível solicitar a ativação");
    } finally {
      setBusy("");
    }
  }

  const progress = data?.summary.progress_percent || 0;
  const level = rank(progress);
  const LevelIcon = level.icon;
  const nextAction = useMemo(() => {
    if (!data) return null;
    return (
      data.native.find((p) => p.state === "degraded" || p.state === "stale") ||
      data.native.find((p) => p.state === "ready") ||
      data.native.find((p) => p.state === "connecting") ||
      null
    );
  }, [data]);

  if (!data && !error) {
    return (
      <section data-integration-passport-v65 className="mx-auto mt-4 w-[min(1500px,calc(100%-2rem))] rounded-[2rem] border border-white/[0.07] bg-white/[0.025] p-5 text-white/50 backdrop-blur-3xl">
        <div className="flex items-center gap-3 text-xs font-black tracking-[.13em]"><RefreshCcw className="animate-spin" size={15}/> LENDO O PULSO DAS CONEXÕES</div>
      </section>
    );
  }

  return (
    <section
      data-integration-passport-v65
      className="relative z-20 mx-auto mt-4 w-[min(1500px,calc(100%-2rem))] overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(7,12,20,.9),rgba(8,13,21,.96))] p-3 text-white shadow-[0_34px_110px_rgba(0,0,0,.3),inset_0_1px_rgba(255,255,255,.055)] backdrop-blur-3xl sm:p-4"
    >
      <div aria-hidden className="pointer-events-none absolute -left-24 top-8 size-72 rounded-full bg-cyan-300/[0.055] blur-[105px]" />
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 size-80 rounded-full bg-violet-300/[0.05] blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-9rem] left-[38%] size-80 rounded-full bg-emerald-300/[0.045] blur-[115px]" />

      <div className="relative grid gap-3 xl:grid-cols-[.58fr_1.42fr]">
        <div className="grid min-h-[18rem] grid-cols-[auto_1fr] gap-5 rounded-[1.6rem] border border-white/[0.07] bg-white/[0.035] p-5 backdrop-blur-2xl sm:items-center">
          <div
            className="relative grid size-32 place-items-center rounded-full p-[1px] sm:size-36"
            style={{ background: `conic-gradient(rgba(103,232,249,.95) ${progress}%,rgba(255,255,255,.07) ${progress}% 100%)` }}
          >
            <div className="grid size-[calc(100%-5px)] place-items-center rounded-full border border-white/[0.08] bg-slate-950/90 shadow-[inset_0_0_45px_rgba(103,232,249,.04)]">
              <div className="text-center">
                <motion.b
                  key={progress}
                  initial={reduced ? false : { scale: .88, opacity: .5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="block text-4xl font-black tracking-[-.07em]"
                >{progress}%</motion.b>
                <small className="text-[.48rem] font-black tracking-[.15em] text-white/30">PROVAS REAIS</small>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <span className="flex items-center gap-2 text-[.53rem] font-black tracking-[.16em] text-cyan-100/55"><ShieldCheck size={13}/> PASSAPORTE DA OPERAÇÃO</span>
            <h2 className="mt-2 text-2xl font-black leading-[.95] tracking-[-.045em] sm:text-3xl">{level.name}</h2>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/38"><LevelIcon size={14}/><span>{data?.summary.healthy || 0} conexões respondendo agora</span></div>
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              <Proof icon={BadgeCheck} label="AUTORIZAR" active={(data?.summary.evidence_score || 0) > 0}/>
              <Proof icon={Link2} label="VINCULAR" active={(data?.native.some(p=>p.evidence.account_linked)) || false}/>
              <Proof icon={Activity} label="RESPONDER" active={(data?.summary.healthy || 0) > 0}/>
            </div>
            <p className="mt-4 text-[.64rem] leading-relaxed text-white/30">Credenciais ficam na plataforma. O restaurante autoriza contas; não copia token, webhook ou client secret.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {(data?.native || []).map((provider) => {
            const Icon = icons[provider.key] || Building2;
            const meta = stateMeta[provider.state];
            return (
              <motion.button
                type="button"
                key={provider.key}
                data-passport-provider={provider.key}
                data-passport-state={provider.state}
                onClick={() => focusConnection(provider.name, reduced)}
                className={`group relative min-h-[9.7rem] overflow-hidden rounded-[1.35rem] border p-3 text-left backdrop-blur-2xl ${toneClasses(meta.tone)}`}
                whileHover={reduced ? undefined : { y: -3, scale: 1.008 }}
                whileTap={reduced ? undefined : { scale: .985 }}
                transition={{ type: "spring", stiffness: 260, damping: 23 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-9 place-items-center rounded-xl border border-white/[.09] bg-black/20"><Icon size={16}/></span>
                  <span className="rounded-full border border-current/15 bg-black/15 px-2 py-1 text-[.45rem] font-black tracking-[.1em]">{meta.label}</span>
                </div>
                <b className="mt-3 block truncate text-sm font-black text-white/86">{provider.name}</b>
                <small className="mt-1 block truncate text-[.52rem] font-bold tracking-[.08em] text-white/28">{provider.category}</small>
                <div className="mt-3 grid grid-cols-3 gap-1" aria-label={`${provider.score} de 3 provas confirmadas`}>
                  <EvidenceDot active={provider.evidence.authorization} label="AUTH" />
                  <EvidenceDot active={provider.evidence.account_linked} label="CONTA" />
                  <EvidenceDot active={provider.evidence.health} label="PULSO" />
                </div>
                <span className="mt-2 line-clamp-1 text-[.52rem] text-white/28">{meta.hint}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="relative mt-3 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-center">
        <motion.button
          type="button"
          onClick={() => nextAction && focusConnection(nextAction.name, reduced)}
          disabled={!nextAction}
          className="flex min-h-14 items-center justify-between gap-4 rounded-[1.25rem] border border-cyan-100/12 bg-cyan-200/[0.045] px-4 text-left disabled:opacity-45"
          whileHover={!reduced && nextAction ? { y: -2 } : undefined}
        >
          <span className="min-w-0">
            <small className="block text-[.48rem] font-black tracking-[.13em] text-cyan-100/45">{nextAction ? "PRÓXIMO DESBLOQUEIO" : "NÚCLEO ESTÁVEL"}</small>
            <b className="mt-1 block truncate text-xs text-white/75">{nextAction ? `${nextAction.name} · ${stateMeta[nextAction.state].label}` : "Nenhuma ação de conexão exige atenção agora"}</b>
          </span>
          {nextAction ? <ChevronRight size={16} className="text-cyan-100/55"/> : <Check size={16} className="text-emerald-200/65"/>}
        </motion.button>

        <button
          type="button"
          onClick={() => setPartnersOpen((value) => !value)}
          aria-expanded={partnersOpen}
          className="flex min-h-14 items-center justify-center gap-2 rounded-[1.25rem] border border-white/[.08] bg-white/[.025] px-4 text-[.58rem] font-black tracking-[.08em] text-white/50 hover:bg-white/[.05]"
        >
          <Rocket size={14}/> EXPANDIR ECOSSISTEMA <span className="text-white/25">{data?.partners.filter(p=>p.state==='requested').length || 0}/{data?.partners.length || 0}</span>
        </button>
      </div>

      {partnersOpen && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mt-2 overflow-x-auto rounded-[1.4rem] border border-white/[.07] bg-black/15 p-3"
        >
          <div className="flex min-w-max gap-2">
            {(data?.partners || []).map((provider) => {
              const Icon = icons[provider.key] || Building2;
              const requested = provider.state === "requested";
              return (
                <motion.button
                  key={provider.key}
                  type="button"
                  data-partner-provider={provider.key}
                  data-partner-state={provider.state}
                  onClick={() => void requestPartner(provider)}
                  disabled={requested || Boolean(busy)}
                  className={`w-44 rounded-[1.15rem] border p-3 text-left ${requested ? "border-violet-200/18 bg-violet-200/[.055]" : "border-white/[.07] bg-white/[.025] hover:bg-white/[.05]"}`}
                  whileTap={!reduced && !requested ? { scale: .985 } : undefined}
                >
                  <div className="flex items-center justify-between"><span className="grid size-8 place-items-center rounded-lg border border-white/[.08] bg-black/20"><Icon size={14}/></span>{requested ? <BadgeCheck size={15} className="text-violet-200/70"/> : <Unplug size={14} className="text-white/25"/>}</div>
                  <b className="mt-3 block text-xs text-white/75">{provider.name}</b>
                  <small className="mt-1 block text-[.49rem] font-bold tracking-[.07em] text-white/25">{provider.category}</small>
                  <span className="mt-3 block text-[.54rem] leading-relaxed text-white/34">{requested ? "Ativação registrada pelo 360" : "Ativar pelo 360 · sem credenciais"}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      )}

      {(notice || error) && (
        <div className={`relative mt-2 rounded-xl border px-3 py-2 text-[.6rem] font-semibold ${error ? "border-rose-200/15 bg-rose-200/[.04] text-rose-100/70" : "border-emerald-200/15 bg-emerald-200/[.04] text-emerald-100/70"}`}>
          {error || notice}
        </div>
      )}

      <div className="relative mt-2 flex items-center justify-between px-2 text-[.48rem] font-bold text-white/22">
        <span>OAuth/device-code para conexões imediatas · homologação tratada pela plataforma</span>
        <button type="button" onClick={() => void load()} aria-label="Atualizar passaporte" className="grid size-8 place-items-center rounded-lg hover:bg-white/[.05]"><RefreshCcw size={12} className={busy==='refresh'?"animate-spin":""}/></button>
      </div>
    </section>
  );
}

function Proof({ icon: Icon, label, active }: { icon: typeof BadgeCheck; label: string; active: boolean }) {
  return <div className={`grid min-w-0 place-items-center gap-1 rounded-xl border px-1 py-2 ${active ? "border-emerald-200/16 bg-emerald-200/[.045] text-emerald-100/70" : "border-white/[.06] bg-black/15 text-white/22"}`}><Icon size={13}/><small className="truncate text-[.42rem] font-black tracking-[.08em]">{label}</small></div>;
}

function EvidenceDot({ active, label }: { active: boolean; label: string }) {
  return <span className={`flex items-center justify-center gap-1 rounded-md border py-1 text-[.4rem] font-black tracking-[.06em] ${active ? "border-emerald-200/14 bg-emerald-200/[.06] text-emerald-100/70" : "border-white/[.05] bg-black/15 text-white/20"}`}><i className={`size-1.5 rounded-full ${active ? "bg-emerald-300 shadow-[0_0_9px_rgba(110,231,183,.55)]" : "bg-white/15"}`}/>{label}</span>;
}

export function IntegrationPassportPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);

  useEffect(() => {
    let owned: HTMLElement | null = null;
    let cancelled = false;
    async function mount() {
      const hero = document.querySelector<HTMLElement>(".cx-hero");
      if (!hero) return;
      let target = document.querySelector<HTMLElement>("[data-integration-passport-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-integration-passport-host", "true");
        const mission = document.querySelector<HTMLElement>("[data-integration-mission-path-host]");
        if (mission) mission.insertAdjacentElement("beforebegin", target);
        else hero.insertAdjacentElement("afterend", target);
        owned = target;
      }
      if (!cancelled) setHost(target);
      const selected = document.querySelector<HTMLSelectElement>(".cx-top select");
      if (selected?.value) return void setBusinessId(Number(selected.value));
      const token = localStorage.getItem("c360_token") || "";
      if (!token) return;
      try {
        const me = await request("/me", {}, token);
        if (!cancelled) setBusinessId(Number(me.businesses?.[0]?.id || 0));
      } catch {
        // The hub stays usable when this enhancement cannot resolve /me.
      }
    }
    const observer = new MutationObserver(() => void mount());
    observer.observe(document.body, { childList: true, subtree: true });
    void mount();
    const change = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches(".cx-top select")) setBusinessId(Number(target.value || 0));
    };
    document.addEventListener("change", change, true);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("change", change, true);
      if (owned?.isConnected) owned.remove();
    };
  }, []);

  if (!host || !businessId) return null;
  return createPortal(<IntegrationPassport businessId={businessId}/>, host);
}
