import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  ArrowRight,
  Banknote,
  CircleDollarSign,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money, request } from "./app";

type FinanceFlow = {
  period_days: number;
  revenue_cents: number;
  variable_costs_cents: number;
  contribution_cents: number;
  contribution_margin_bps: number;
  loss_cents: number;
  purchases_landed_cents: number;
  order_count: number;
};

type Business = { id: number; name: string };

const empty: FinanceFlow = {
  period_days: 30,
  revenue_cents: 0,
  variable_costs_cents: 0,
  contribution_cents: 0,
  contribution_margin_bps: 0,
  loss_cents: 0,
  purchases_landed_cents: 0,
  order_count: 0,
};

function clampShare(value: number, total: number) {
  if (!total || value <= 0) return 0;
  return Math.max(0.04, Math.min(1, value / total));
}

function percentFromBps(value: number) {
  return `${(Number(value || 0) / 100).toFixed(1).replace(".0", "")}%`;
}

function FlowRail({ data }: { data: FinanceFlow }) {
  const reduced = Boolean(useReducedMotion());
  const revenue = Math.max(0, Number(data.revenue_cents || 0));
  const variable = Math.max(0, Number(data.variable_costs_cents || 0));
  const contribution = Number(data.contribution_cents || 0);
  const contributionPositive = Math.max(0, contribution);
  const variableShare = clampShare(variable, revenue);
  const contributionShare = clampShare(contributionPositive, revenue);

  return (
    <div className="cashflow68-rail" aria-label="Fluxo financeiro observado nos últimos 30 dias">
      <div className="cashflow68-node cashflow68-revenue">
        <span><Banknote size={15} /> ENTRADA</span>
        <strong>{money(revenue)}</strong>
        <small>{data.order_count || 0} pedidos pagos</small>
      </div>

      <div className="cashflow68-lines" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cashflow68-main" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(103,232,249,.85)" />
              <stop offset="1" stopColor="rgba(110,231,183,.9)" />
            </linearGradient>
            <linearGradient id="cashflow68-cost" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(103,232,249,.5)" />
              <stop offset="1" stopColor="rgba(251,191,36,.8)" />
            </linearGradient>
          </defs>
          <motion.path
            d="M 3 50 C 25 50, 29 50, 48 50"
            fill="none"
            stroke="url(#cashflow68-main)"
            strokeWidth="2.1"
            vectorEffect="non-scaling-stroke"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.9, ease: "easeOut" }}
          />
          <motion.path
            d="M 49 49 C 59 34, 68 27, 97 27"
            fill="none"
            stroke="url(#cashflow68-cost)"
            strokeWidth={Math.max(1.2, variableShare * 5.2)}
            vectorEffect="non-scaling-stroke"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: variable ? 0.86 : 0.18 }}
            transition={{ duration: reduced ? 0 : 1, delay: reduced ? 0 : 0.12, ease: "easeOut" }}
          />
          <motion.path
            d="M 49 51 C 59 66, 68 73, 97 73"
            fill="none"
            stroke="url(#cashflow68-main)"
            strokeWidth={Math.max(1.2, contributionShare * 5.8)}
            vectorEffect="non-scaling-stroke"
            initial={reduced ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: contributionPositive ? 1 : 0.18 }}
            transition={{ duration: reduced ? 0 : 1, delay: reduced ? 0 : 0.2, ease: "easeOut" }}
          />
        </svg>
        <motion.i
          className="cashflow68-pulse"
          animate={reduced ? undefined : { x: ["0%", "410%"], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="cashflow68-split">
        <div className="cashflow68-node cashflow68-cost">
          <span><ReceiptText size={14} /> CUSTO VARIÁVEL</span>
          <strong>{money(variable)}</strong>
          <small>{revenue ? `${Math.round((variable / revenue) * 100)}% da receita observada` : "sem receita no período"}</small>
        </div>
        <div className={`cashflow68-node cashflow68-contribution ${contribution < 0 ? "negative" : ""}`}>
          <span><TrendingUp size={14} /> CONTRIBUIÇÃO</span>
          <strong>{money(contribution)}</strong>
          <small>{percentFromBps(data.contribution_margin_bps)} de margem de contribuição</small>
        </div>
      </div>
    </div>
  );
}

function CashFlowVisual({ businessId }: { businessId: number }) {
  const reduced = Boolean(useReducedMotion());
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 90%", "end 20%"] });
  const scale = useTransform(scrollYProgress, [0, 0.35, 1], reduced ? [1, 1, 1] : [0.97, 1, 1]);
  const glowY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [32, -34]);
  const token = localStorage.getItem("c360_token") || "";
  const [data, setData] = useState<FinanceFlow>(empty);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [partial, setPartial] = useState(false);

  async function load() {
    if (!token || !businessId || loading) return;
    setLoading(true);
    setPartial(false);
    try {
      const next = await request(`/businesses/${businessId}/finance/summary?days=30`, {}, token);
      setData({ ...empty, ...(next || {}) });
      setUpdatedAt(new Date());
    } catch {
      setPartial(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    }, 30000);
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void load();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [businessId]);

  const formula = useMemo(() => {
    const derived = Number(data.revenue_cents || 0) - Number(data.variable_costs_cents || 0);
    const delta = Number(data.contribution_cents || 0) - derived;
    return { derived, delta, consistent: Math.abs(delta) <= 1 };
  }, [data]);

  return (
    <motion.section
      ref={ref}
      data-cash-flow-v68
      className="cashflow68-shell"
      style={{ scale }}
      aria-labelledby="cashflow68-title"
    >
      <motion.div className="cashflow68-aura cashflow68-aura-a" style={{ y: glowY }} aria-hidden="true" />
      <motion.div className="cashflow68-aura cashflow68-aura-b" style={{ y: glowY }} aria-hidden="true" />

      <div className="cashflow68-head">
        <div>
          <span><Sparkles size={13} /> FLUXO OBSERVADO · 30 DIAS</span>
          <h2 id="cashflow68-title">Veja para onde o dinheiro foi.</h2>
          <p>O desenho abaixo é gerado apenas pelos números registrados no servidor. Não projeta demanda e não completa custos ausentes.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Atualizar fluxo do dinheiro">
          <RefreshCcw size={14} className={loading ? "cashflow68-spin" : ""} />
          <span>{updatedAt ? updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora"}</span>
        </button>
      </div>

      <FlowRail data={data} />

      <div className="cashflow68-context">
        <article className={Number(data.loss_cents || 0) > 0 ? "attention" : ""}>
          <i><CircleDollarSign size={16} /></i>
          <div><span>PERDAS REGISTRADAS</span><strong>{money(data.loss_cents || 0)}</strong></div>
          <small>contexto operacional separado</small>
        </article>
        <article>
          <i><PackageCheck size={16} /></i>
          <div><span>COMPRAS RECEBIDAS</span><strong>{money(data.purchases_landed_cents || 0)}</strong></div>
          <small>não é subtraído novamente da contribuição</small>
        </article>
        <article className={formula.consistent ? "verified" : "attention"}>
          <i>{formula.consistent ? <Sparkles size={16} /> : <ReceiptText size={16} />}</i>
          <div><span>COERÊNCIA DO FLUXO</span><strong>{formula.consistent ? "CONFERIDA" : "LEITURA DO SERVIDOR"}</strong></div>
          <small>{formula.consistent ? "receita − variável = contribuição" : "a contribuição possui ajustes além do fluxo simples"}</small>
        </article>
      </div>

      <div className="cashflow68-foot">
        <span>{partial ? "A leitura financeira não respondeu agora; o restante do Cash Engine continua disponível." : "Fluxo observado, não DRE contábil."}</span>
        <a href="/?margin=1">Abrir margem por canal <ArrowRight size={13} /></a>
      </div>
    </motion.section>
  );
}

export function CashFlowVisualPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);

  useEffect(() => {
    let ownedHost: HTMLElement | null = null;
    let cancelled = false;

    const sync = async () => {
      const live = document.querySelector<HTMLElement>(".cash-live");
      if (!live) return;
      let target = document.querySelector<HTMLElement>("[data-cash-flow-v68-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-cash-flow-v68-host", "true");
        live.insertAdjacentElement("afterend", target);
        ownedHost = target;
      }
      if (!cancelled) setHost(target);

      const selected = document.querySelector<HTMLSelectElement>(".cash-topbar select");
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
        // Cash Engine remains usable even if this visual layer cannot resolve /me.
      }
    };

    const observer = new MutationObserver(() => void sync());
    observer.observe(document.body, { childList: true, subtree: true });
    void sync();

    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches(".cash-topbar select")) setBusinessId(Number(target.value || 0));
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
  return createPortal(<CashFlowVisual businessId={businessId} />, host);
}
