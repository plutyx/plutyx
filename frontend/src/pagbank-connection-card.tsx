import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CloudCog,
  CreditCard,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { request } from "./app";

type ReadinessState = "ready_to_authorize" | "partner_approval" | "platform_setup_required";
type StatusPayload = {
  ok: boolean;
  version: string;
  readiness: {
    platform_ready: boolean;
    state: ReadinessState;
    authorization: string;
    environment: "production" | "sandbox";
    homologated: boolean;
  };
  connection: null | {
    provider: "pagbank";
    status: "inactive" | "connecting" | "active" | "degraded" | "disabled";
    display_name: string | null;
    external_account_ref: string | null;
    last_success_at: string | null;
    last_error: string | null;
  };
};

const API =
  import.meta.env.VITE_PAGBANK_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-pagbank-v59";

function stateCopy(payload: StatusPayload | null) {
  if (!payload) return { chip: "LENDO", note: "Consultando a infraestrutura real", tone: "neutral" };
  if (payload.connection?.status === "active") return { chip: "ATIVO", note: "Autorização operacional", tone: "ready" };
  if (payload.connection?.status === "degraded") return { chip: "REVISAR", note: "A autorização precisa de atenção", tone: "bad" };
  if (payload.readiness.state === "ready_to_authorize") return { chip: "PRONTO", note: "Pode autorizar na tela oficial", tone: "ready" };
  if (payload.readiness.state === "partner_approval") return { chip: "HOMOLOGAÇÃO", note: "Produção aguarda aprovação PagBank", tone: "wait" };
  return { chip: "PLATAFORMA", note: "Credenciais da plataforma ainda não habilitadas", tone: "wait" };
}

function trustedAuthorizationUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return ["https://connect.pagbank.com.br", "https://connect.sandbox.pagbank.com.br"].includes(url.origin)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function PagBankCard() {
  const reduceMotion = Boolean(useReducedMotion());
  const [token, setToken] = useState("");
  const [businessId, setBusinessId] = useState(0);
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState<"loading" | "connect" | "test" | "disconnect" | "">("loading");
  const [notice, setNotice] = useState("");
  const state = stateCopy(payload);

  async function call(path: string, options: RequestInit = {}) {
    if (!token) throw new Error("Sessão indisponível");
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "PagBank não respondeu como esperado");
    return body;
  }

  async function load(id = businessId, authToken = token) {
    if (!id || !authToken) return;
    setBusy("loading");
    try {
      const response = await fetch(`${API}/businesses/${id}/status`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${authToken}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "Não foi possível consultar PagBank");
      setPayload(body as StatusPayload);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao consultar PagBank");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const authToken = localStorage.getItem("c360_token") || "";
      setToken(authToken);
      if (!authToken) {
        setBusy("");
        return;
      }
      try {
        const me = await request("/me", {}, authToken);
        const id = Number(me.businesses?.[0]?.id || 0);
        if (!id || cancelled) return;
        setBusinessId(id);
        await load(id, authToken);
      } catch (error) {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "Não foi possível localizar sua operação");
          setBusy("");
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("pagbank");
    if (!result) return;
    const copy: Record<string, string> = {
      connected: "PagBank autorizado. Validando a conexão…",
      denied: "Autorização cancelada no PagBank.",
      error: "O PagBank devolveu um erro de autorização.",
      membership_changed: "Seu acesso à operação mudou durante a autorização.",
      missing_code: "O PagBank não devolveu o código de autorização.",
    };
    setNotice(copy[result] || "Retorno do PagBank recebido.");
    url.searchParams.delete("pagbank");
    window.history.replaceState({}, "", url.toString());
  }, []);

  async function connect() {
    if (!businessId || !payload?.readiness.platform_ready) return;
    setBusy("connect");
    setNotice("");
    try {
      const body = await call(`/businesses/${businessId}/connect`, {
        method: "POST",
        body: JSON.stringify({ return_origin: window.location.origin }),
      });
      const target = trustedAuthorizationUrl(body.authorization_url);
      if (!target) throw new Error("URL oficial de autorização não foi reconhecida");
      window.location.assign(target);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a autorização");
      setBusy("");
    }
  }

  async function test() {
    if (!businessId) return;
    setBusy("test");
    setNotice("");
    try {
      await call(`/businesses/${businessId}/test`, { method: "POST", body: "{}" });
      setNotice("Conexão validada no PagBank.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível validar a conexão");
      setBusy("");
    }
  }

  async function disconnect() {
    if (!businessId || !window.confirm("Desconectar o PagBank desta operação?")) return;
    setBusy("disconnect");
    setNotice("");
    try {
      await call(`/businesses/${businessId}/disconnect`, { method: "DELETE" });
      setNotice("PagBank desconectado desta operação.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível desconectar");
      setBusy("");
    }
  }

  const active = payload?.connection?.status === "active";
  const degraded = payload?.connection?.status === "degraded";
  const statusClass = useMemo(
    () =>
      state.tone === "ready"
        ? "border-emerald-100/20 bg-emerald-200/[0.08] text-emerald-100"
        : state.tone === "bad"
          ? "border-rose-100/20 bg-rose-200/[0.07] text-rose-100"
          : state.tone === "wait"
            ? "border-amber-100/15 bg-amber-200/[0.05] text-amber-100/75"
            : "border-white/10 bg-white/[0.035] text-white/45",
    [state.tone],
  );

  return (
    <motion.article
      data-pagbank-connection-card="true"
      className="relative isolate min-h-[25rem] overflow-hidden rounded-[2rem] border border-white/[0.09] bg-[linear-gradient(150deg,rgba(18,27,40,.95),rgba(4,9,16,.9))] p-5 text-white shadow-[inset_0_1px_rgba(255,255,255,.07),0_30px_90px_rgba(0,0,0,.26)] backdrop-blur-3xl sm:p-6"
      initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 150, damping: 22 }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-cyan-300/[0.07] blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full bg-emerald-300/[0.055] blur-[100px]" />

      <header className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <i className="grid size-12 place-items-center rounded-[1.1rem] border border-cyan-100/15 bg-cyan-200/[0.07] text-cyan-100 shadow-[0_0_34px_rgba(103,232,249,.08)]">
            <CreditCard size={22} />
          </i>
          <span className="grid gap-1">
            <small className="text-[0.52rem] font-black tracking-[0.14em] text-white/28">PAGAMENTO · CONNECT</small>
            <b className="text-xl font-black tracking-[-0.04em]">PagBank</b>
          </span>
        </div>
        <span className={`rounded-full border px-2.5 py-1.5 text-[0.48rem] font-black tracking-[0.09em] ${statusClass}`}>
          {busy === "loading" ? "LENDO" : state.chip}
        </span>
      </header>

      <div className="relative z-10 mt-7 grid gap-2 sm:grid-cols-3">
        {[
          ["01", "VOCÊ", "autoriza no PagBank"],
          ["02", "PAGBANK", "devolve acesso seguro"],
          ["03", "360", "renova e protege o token"],
        ].map(([n, marker, text], index) => (
          <motion.div
            key={marker}
            className="rounded-[1.15rem] border border-white/[0.07] bg-white/[0.025] p-3"
            initial={reduceMotion ? false : { opacity: 0, y: 9 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.045 }}
          >
            <span className="text-[0.48rem] font-black text-cyan-100/45">{n}</span>
            <b className="mt-2 block text-[0.58rem] font-black tracking-[0.1em] text-white/45">{marker}</b>
            <small className="mt-1 block text-[0.62rem] font-semibold leading-5 text-white/68">{text}</small>
          </motion.div>
        ))}
      </div>

      <div className="relative z-10 mt-5 rounded-[1.25rem] border border-white/[0.07] bg-black/20 p-4">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 ${active ? "text-emerald-200" : degraded ? "text-rose-200" : payload?.readiness.state === "ready_to_authorize" ? "text-cyan-100" : "text-amber-100/70"}`}>
            {busy === "loading" ? <Loader2 className="animate-spin" size={16} /> : active ? <Check size={16} /> : degraded ? <AlertTriangle size={16} /> : payload?.readiness.state === "ready_to_authorize" ? <Sparkles size={16} /> : <LockKeyhole size={16} />}
          </span>
          <span className="min-w-0">
            <b className="block text-xs font-black text-white/78">{active ? payload?.connection?.display_name || "Conta PagBank conectada" : state.note}</b>
            <small className="mt-1 block text-[0.58rem] leading-5 text-white/34">
              {active
                ? "A autorização fica criptografada no servidor. O navegador nunca recebe refresh token ou client secret."
                : payload?.readiness.state === "partner_approval"
                  ? "A rota já está pronta; o botão será liberado automaticamente depois da homologação da plataforma."
                  : payload?.readiness.state === "platform_setup_required"
                    ? "Nenhuma configuração técnica é pedida ao restaurante. A plataforma habilita a aplicação uma única vez."
                    : "O próximo passo abre apenas a tela oficial do PagBank para seu consentimento."}
            </small>
          </span>
        </div>
      </div>

      {notice && (
        <motion.div
          className="relative z-10 mt-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[0.6rem] font-semibold text-white/55"
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
        >
          {notice}
        </motion.div>
      )}

      <footer className="relative z-10 mt-5 flex flex-wrap items-center gap-2">
        {active ? (
          <>
            <button
              type="button"
              onClick={test}
              disabled={Boolean(busy)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-xs font-black text-white/72 disabled:opacity-40"
            >
              {busy === "test" ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />} Testar
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={Boolean(busy)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-100/10 bg-rose-200/[0.035] px-4 text-xs font-black text-rose-100/65 disabled:opacity-40"
            >
              {busy === "disconnect" ? <Loader2 className="animate-spin" size={14} /> : <Unplug size={14} />} Desconectar
            </button>
          </>
        ) : payload?.readiness.state === "ready_to_authorize" ? (
          <button
            type="button"
            onClick={connect}
            disabled={Boolean(busy)}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-cyan-100/25 bg-cyan-100 px-4 text-xs font-black text-slate-950 shadow-[0_14px_42px_rgba(165,243,252,.12)] disabled:opacity-40"
          >
            {busy === "connect" ? <Loader2 className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
            Autorizar no PagBank <ChevronRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 text-xs font-black text-white/30"
          >
            <CloudCog size={14} /> {payload?.readiness.state === "partner_approval" ? "Aguardando homologação" : "Ativação da plataforma"}
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-[0.5rem] font-bold text-white/25">
          <ShieldCheck size={11} /> consentimento oficial · sem copiar token
        </span>
      </footer>
    </motion.article>
  );
}

export function PagBankConnectionCardPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function sync() {
      const grid = document.querySelector<HTMLElement>(".cx-grid");
      const current = document.querySelector<HTMLElement>("[data-pagbank-card-host]");
      if (!grid) {
        current?.remove();
        setHost(null);
        return;
      }
      if (current) {
        if (current.parentElement !== grid) grid.appendChild(current);
        setHost(current);
        return;
      }
      const next = document.createElement("div");
      next.dataset.pagbankCardHost = "true";
      next.className = "contents";
      grid.appendChild(next);
      setHost(next);
    }

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector<HTMLElement>("[data-pagbank-card-host]")?.remove();
      setHost(null);
    };
  }, []);

  return host ? createPortal(<PagBankCard />, host) : null;
}
