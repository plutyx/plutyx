import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  CheckCircle2,
  ChefHat,
  Copy,
  ExternalLink,
  LoaderCircle,
  QrCode,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "./app";

const PAYMENTS_API =
  import.meta.env.VITE_CHECKOUT_PAYMENTS_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-checkout-payments-v57";

type ProviderKey = "mercadopago" | "pagbank";
type ProviderCapability = {
  key: ProviderKey;
  label: string;
  requires_tax_id: boolean;
  reason?: string;
};
type Capability = {
  available: boolean;
  reason?: string;
  provider?: ProviderKey | null;
  preferred?: ProviderKey | null;
  requires_tax_id?: boolean;
  providers?: ProviderCapability[];
};
type PixState = {
  token?: string;
  provider?: ProviderKey;
  status: string;
  status_detail?: string | null;
  paid: boolean;
  amount_cents: number;
  qr_code?: string | null;
  qr_code_base64?: string | null;
  ticket_url?: string | null;
  expires_at?: string | null;
  updated_at?: string | null;
};
type Props = {
  businessId: number;
  orderId: number;
  clientOrderKey: string;
  payerEmail: string;
  amountCents: number;
};

const providerMeta: Record<ProviderKey, { label: string; short: string; accent: string }> = {
  mercadopago: { label: "Mercado Pago", short: "MP", accent: "sky" },
  pagbank: { label: "PagBank", short: "PB", accent: "emerald" },
};
const terminalFailures = new Set(["failed", "canceled", "expired", "refunded", "charged_back"]);

async function payRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${PAYMENTS_API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const parsed = await response.json().catch(() => ({ detail: "Resposta inválida" }));
  if (!response.ok) {
    const error = new Error(
      typeof parsed.detail === "string" ? parsed.detail : "Não foi possível concluir o pagamento",
    ) as Error & { code?: string; provider?: ProviderKey };
    error.code = parsed.code;
    error.provider = parsed.provider;
    throw error;
  }
  return parsed;
}

function qrSource(value?: string | null) {
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  return `data:image/png;base64,${value}`;
}
function taxDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}
function taxValid(value: string) {
  const digits = taxDigits(value);
  return digits.length === 11 || digits.length === 14;
}
function normalizedCapability(raw: Capability): Capability {
  if (!raw.available) return raw;
  const providers = raw.providers?.length
    ? raw.providers
    : [
        {
          key: raw.provider || raw.preferred || "mercadopago",
          label: providerMeta[raw.provider || raw.preferred || "mercadopago"].label,
          requires_tax_id: Boolean(raw.requires_tax_id),
          reason: raw.reason || "ready",
        },
      ];
  const preferred = raw.preferred || raw.provider || providers[0]?.key || "mercadopago";
  return { ...raw, providers, preferred, provider: preferred };
}

function FlowStep({ icon: Icon, label, state, reduced }: { icon: typeof ReceiptText; label: string; state: "done" | "active" | "waiting"; reduced: boolean }) {
  return (
    <motion.div
      className={`relative z-10 grid min-w-0 flex-1 place-items-center gap-2 rounded-[1.15rem] border px-2 py-3 text-center backdrop-blur-2xl ${
        state === "done"
          ? "border-emerald-200/25 bg-emerald-200/[0.09] text-emerald-100"
          : state === "active"
            ? "border-sky-200/30 bg-sky-200/[0.09] text-sky-100"
            : "border-white/[0.07] bg-white/[0.025] text-white/35"
      }`}
      animate={
        reduced || state !== "active"
          ? undefined
          : {
              scale: [1, 1.025, 1],
              boxShadow: [
                "0 0 0 rgba(125,211,252,0)",
                "0 0 30px rgba(125,211,252,.16)",
                "0 0 0 rgba(125,211,252,0)",
              ],
            }
      }
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className="grid size-9 place-items-center rounded-full border border-current/15 bg-black/20">
        {state === "done" ? <Check size={16} strokeWidth={3} /> : <Icon size={16} />}
      </span>
      <small className="truncate text-[0.58rem] font-black tracking-[0.08em]">{label}</small>
    </motion.div>
  );
}

function ProviderRoute({ provider, selected, preferred, disabled, onSelect, reduced }: { provider: ProviderCapability; selected: boolean; preferred: boolean; disabled: boolean; onSelect: () => void; reduced: boolean }) {
  const meta = providerMeta[provider.key];
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      whileHover={reduced || disabled ? undefined : { y: -2, scale: 1.01 }}
      whileTap={reduced || disabled ? undefined : { scale: 0.985 }}
      className={`relative grid min-w-0 gap-1 overflow-hidden rounded-2xl border px-3 py-3 text-left transition disabled:cursor-default ${
        selected
          ? provider.key === "pagbank"
            ? "border-emerald-200/30 bg-emerald-200/[0.09] shadow-[0_0_34px_rgba(110,231,183,.07)]"
            : "border-sky-200/30 bg-sky-200/[0.09] shadow-[0_0_34px_rgba(125,211,252,.07)]"
          : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12]"
      }`}
      data-pix-provider-route={provider.key}
    >
      <span className="flex items-center justify-between gap-2">
        <b className="flex min-w-0 items-center gap-2 text-xs text-white/85">
          <i className={`grid size-7 shrink-0 place-items-center rounded-full border text-[0.55rem] not-italic ${provider.key === "pagbank" ? "border-emerald-200/20 bg-emerald-200/10 text-emerald-100" : "border-sky-200/20 bg-sky-200/10 text-sky-100"}`}>{meta.short}</i>
          <span className="truncate">{meta.label}</span>
        </b>
        {selected && <Check size={14} className={provider.key === "pagbank" ? "text-emerald-200" : "text-sky-200"} />}
      </span>
      <small className="pl-9 text-[0.52rem] font-black tracking-[0.09em] text-white/35">
        {preferred ? "ROTA MAIS SIMPLES" : provider.requires_tax_id ? "CPF/CNPJ NO PIX" : "PIX CONECTADO"}
      </small>
    </motion.button>
  );
}

export function PixCheckoutExperience({ businessId, orderId, clientOrderKey, payerEmail, amountCents }: Props) {
  const reduced = Boolean(useReducedMotion());
  const [capability, setCapability] = useState<Capability | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>("mercadopago");
  const [payment, setPayment] = useState<PixState | null>(null);
  const [email, setEmail] = useState(payerEmail || "");
  const [taxId, setTaxId] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);
  const [needsTaxId, setNeedsTaxId] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    payRequest(`/capability/${businessId}`)
      .then((result) => {
        if (!active) return;
        const next = normalizedCapability(result.pix || { available: false });
        setCapability(next);
        if (next.preferred) setSelectedProvider(next.preferred);
      })
      .catch(() => {
        if (active) setCapability({ available: false, reason: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  const providers = capability?.providers || [];
  const selectedCapability = providers.find((provider) => provider.key === selectedProvider) || providers[0];
  const requiresTaxId = Boolean(selectedCapability?.requires_tax_id);
  const activeProvider = payment?.provider || selectedProvider;
  const activeProviderLabel = providerMeta[activeProvider]?.label || "gateway conectado";

  async function refreshStatus() {
    if (!payment?.token || payment.paid || terminalFailures.has(payment.status)) return;
    try {
      const result = await payRequest(`/status/${encodeURIComponent(payment.token)}`);
      setPayment(result.payment);
      setError("");
    } catch {
      // Keep the last confirmed server state; the next visible poll retries reconciliation.
    }
  }

  useEffect(() => {
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    pollingRef.current = null;
    if (!payment?.token || payment.paid || terminalFailures.has(payment.status)) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refreshStatus();
    };
    pollingRef.current = window.setInterval(tick, 3000);
    const visibility = () => {
      if (document.visibilityState === "visible") void refreshStatus();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [payment?.token, payment?.paid, payment?.status]);

  async function createPix() {
    const candidate = email.trim();
    if (!candidate || !candidate.includes("@")) {
      setNeedsEmail(true);
      setError("");
      return;
    }
    if (requiresTaxId && !taxValid(taxId)) {
      setNeedsTaxId(true);
      setError("");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const result = await payRequest("/pix", {
        method: "POST",
        body: JSON.stringify({
          business_id: businessId,
          order_id: orderId,
          client_order_key: clientOrderKey,
          provider: selectedProvider,
          payer_email: candidate,
          payer_tax_id: requiresTaxId ? taxDigits(taxId) : undefined,
        }),
      });
      setPayment({ ...result.payment, provider: result.payment?.provider || result.provider || selectedProvider });
      setNeedsEmail(false);
      setNeedsTaxId(false);
    } catch (cause) {
      const e = cause as Error & { code?: string; provider?: ProviderKey };
      if (e.code === "payer_email_required") setNeedsEmail(true);
      if (e.code === "payer_tax_id_required") setNeedsTaxId(true);
      if (e.provider) setSelectedProvider(e.provider);
      setError(e.message || "Pix indisponível neste momento.");
    } finally {
      setCreating(false);
    }
  }

  async function copyPix() {
    if (!payment?.qr_code) return;
    try {
      await navigator.clipboard.writeText(payment.qr_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const state = useMemo(() => {
    if (payment?.paid) return "paid";
    if (payment && terminalFailures.has(payment.status)) return "failed";
    if (payment) return "waiting";
    return "ready";
  }, [payment]);

  if (!capability?.available) return null;

  return (
    <motion.section
      data-pix-checkout-experience
      data-pix-provider={activeProvider}
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 170, damping: 22 }}
      className="relative my-4 overflow-hidden rounded-[1.8rem] border border-white/[0.09] bg-[linear-gradient(145deg,rgba(15,23,42,.88),rgba(8,15,27,.94))] p-4 text-white shadow-[0_26px_80px_rgba(2,8,23,.3),inset_0_1px_rgba(255,255,255,.07)] backdrop-blur-3xl sm:p-5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-sky-300/[0.10] blur-[80px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-emerald-300/[0.08] blur-[85px]" />

      <div className="relative grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <span className="flex items-center gap-2 text-[0.58rem] font-black tracking-[0.15em] text-sky-200/75">
              <WalletCards size={14} /> PAGAMENTO CONECTADO
            </span>
            <h3 className="text-lg font-black tracking-[-0.035em] sm:text-xl">
              {state === "paid" ? "O pagamento chegou à operação." : "Finalize por Pix quando quiser."}
            </h3>
          </div>
          <strong className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs">
            {money(payment?.amount_cents ?? amountCents)}
          </strong>
        </div>

        <div className="relative flex gap-2">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[2.25rem] h-px bg-gradient-to-r from-emerald-200/30 via-sky-200/30 to-white/10" />
          <FlowStep icon={ReceiptText} label="PEDIDO" state="done" reduced={reduced} />
          <FlowStep icon={QrCode} label="PIX" state={state === "paid" ? "done" : "active"} reduced={reduced} />
          <FlowStep icon={ChefHat} label="COZINHA" state={state === "paid" ? "done" : "waiting"} reduced={reduced} />
        </div>

        {state === "ready" && providers.length > 1 && (
          <div className="grid grid-cols-2 gap-2" aria-label="Rotas Pix disponíveis">
            {providers.map((provider) => (
              <ProviderRoute
                key={provider.key}
                provider={provider}
                selected={provider.key === selectedProvider}
                preferred={provider.key === capability.preferred}
                disabled={creating}
                reduced={reduced}
                onSelect={() => {
                  setSelectedProvider(provider.key);
                  setNeedsTaxId(false);
                  setError("");
                }}
              />
            ))}
          </div>
        )}

        {state === "ready" && providers.length === 1 && (
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-[0.62rem]">
            <span className="flex items-center gap-2 font-black tracking-[0.08em] text-white/50">
              <i className={`size-1.5 rounded-full ${selectedProvider === "pagbank" ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.6)]" : "bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,.6)]"}`} />
              ROTA PIX PRONTA
            </span>
            <b className="text-white/75">{providerMeta[selectedProvider].label}</b>
          </div>
        )}

        <AnimatePresence mode="wait">
          {state === "ready" && (
            <motion.div key={`ready-${selectedProvider}`} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="grid gap-3">
              {needsEmail && (
                <label className="grid gap-1.5 text-xs font-bold text-white/65">
                  E-mail para gerar o Pix
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="voce@email.com" className="min-h-12 rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-sky-200/35" />
                </label>
              )}

              {requiresTaxId && (
                <motion.label initial={reduced ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="grid gap-1.5 text-xs font-bold text-white/65">
                  CPF ou CNPJ para este Pix
                  <input
                    value={taxId}
                    onChange={(event) => {
                      setTaxId(taxDigits(event.target.value));
                      setNeedsTaxId(false);
                    }}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Somente números"
                    aria-invalid={needsTaxId || undefined}
                    className={`min-h-12 rounded-2xl border bg-black/25 px-4 text-sm text-white outline-none transition ${needsTaxId ? "border-rose-300/45" : "border-white/10 focus:border-emerald-200/35"}`}
                  />
                  <span className="flex items-center gap-1.5 text-[0.58rem] font-semibold leading-relaxed text-emerald-100/55">
                    <ShieldCheck size={13} /> usado só para criar este Pix · não é salvo pelo Cozinha 360
                  </span>
                </motion.label>
              )}

              <motion.button
                type="button"
                onClick={() => void createPix()}
                disabled={creating}
                whileHover={reduced ? undefined : { scale: 1.012 }}
                whileTap={reduced ? undefined : { scale: 0.985 }}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-black text-slate-950 shadow-[0_14px_45px_rgba(125,211,252,.18)] disabled:cursor-wait disabled:opacity-60 ${selectedProvider === "pagbank" ? "border-emerald-100/20 bg-emerald-200" : "border-sky-100/20 bg-sky-200"}`}
              >
                {creating ? <LoaderCircle size={17} className="animate-spin" /> : <QrCode size={17} />}
                {creating ? "Criando Pix seguro…" : "Gerar Pix"}
              </motion.button>
            </motion.div>
          )}

          {state === "waiting" && payment && (
            <motion.div key="waiting" initial={reduced ? false : { opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
              {payment.qr_code_base64 ? (
                <div className="mx-auto grid size-44 place-items-center rounded-[1.45rem] border border-white/10 bg-white p-2 shadow-[0_20px_60px_rgba(0,0,0,.24)] md:mx-0">
                  <img src={qrSource(payment.qr_code_base64)} alt="QR Code Pix" className="size-full object-contain" />
                </div>
              ) : (
                <div className="mx-auto grid size-44 place-items-center rounded-[1.45rem] border border-sky-200/15 bg-sky-200/[0.05] md:mx-0">
                  <QrCode size={58} className="text-sky-100/70" />
                </div>
              )}
              <div className="grid min-w-0 gap-3">
                <div className="flex items-center gap-2 text-sm font-black text-sky-100">
                  <span className="relative flex size-3">
                    {!reduced && <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-300 opacity-50" />}
                    <span className="relative inline-flex size-3 rounded-full bg-sky-300" />
                  </span>
                  Aguardando confirmação
                </div>
                <p className="m-0 text-xs leading-relaxed text-white/50">
                  O Cozinha 360 consulta {activeProviderLabel} e atualiza este cartão quando o Pix for confirmado. A cozinha só recebe o sinal de pago depois da confirmação do provedor.
                </p>
                <span className="w-fit rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[0.55rem] font-black tracking-[0.09em] text-white/40">
                  CONCILIANDO · {activeProviderLabel.toUpperCase()}
                </span>
                {payment.qr_code && (
                  <button type="button" onClick={() => void copyPix()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-white/80 transition hover:bg-white/[0.08]">
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Código copiado" : "Copiar Pix copia e cola"}
                  </button>
                )}
                {payment.ticket_url && (
                  <a href={payment.ticket_url} target="_blank" rel="noreferrer" className="flex min-h-10 items-center justify-center gap-2 text-xs font-bold text-sky-200/80">
                    Abrir cobrança <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </motion.div>
          )}

          {state === "paid" && (
            <motion.div key="paid" initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 240, damping: 18 }} className="grid place-items-center gap-3 rounded-[1.35rem] border border-emerald-200/20 bg-emerald-200/[0.08] px-4 py-7 text-center">
              <motion.span className="grid size-14 place-items-center rounded-full bg-emerald-200 text-slate-950 shadow-[0_0_45px_rgba(110,231,183,.2)]" animate={reduced ? undefined : { scale: [0.94, 1.08, 1] }} transition={{ duration: 0.55 }}>
                <CheckCircle2 size={27} />
              </motion.span>
              <div>
                <b className="block text-lg">Pix confirmado</b>
                <span className="text-xs text-emerald-100/60">{activeProviderLabel} confirmou {money(payment?.amount_cents ?? amountCents)} para esta operação.</span>
              </div>
            </motion.div>
          )}

          {state === "failed" && payment && (
            <motion.div key="failed" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3 rounded-[1.35rem] border border-rose-200/15 bg-rose-200/[0.05] p-4">
              <div>
                <b className="block text-sm text-rose-100">Este Pix não foi concluído.</b>
                <span className="text-xs text-white/45">A operação continua sem pagamento confirmado.</span>
              </div>
              <button type="button" onClick={() => { setPayment(null); setError(""); setCopied(false); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] text-xs font-black text-white/80">
                <RefreshCcw size={14} /> Gerar um novo Pix
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <div role="alert" className="rounded-xl border border-rose-200/15 bg-rose-200/[0.06] px-3 py-2 text-xs leading-relaxed text-rose-100/80">{error}</div>}
      </div>
    </motion.section>
  );
}
