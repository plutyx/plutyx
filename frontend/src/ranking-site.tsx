import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import "./ranking-site.css";

const API = "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/sac-ranking-site-api";

type AnyRecord = Record<string, any>;

async function post(body: AnyRecord) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

function pct(n: unknown) {
  const v = Number(n || 0);
  return `${Math.max(0, Math.min(100, v)).toFixed(v >= 10 ? 0 : 1)}%`;
}
function fmt(n: unknown) {
  const v = Number(n || 0);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v);
}
function humanStatus(s: string) {
  return ({ queued: "Na fila", processing: "Analisando", completed: "Concluído", failed: "Falhou" } as AnyRecord)[s] || s || "Preparando";
}
function statusTone(s: string) {
  if (["pass", "healthy", "completed"].includes(s)) return "good";
  if (["fail", "critical", "failed"].includes(s)) return "bad";
  if (["warning", "attention", "insufficient_coverage"].includes(s)) return "warn";
  return "neutral";
}

function Metric({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="rs-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function RankingSiteRoute() {
  const initialToken = new URLSearchParams(window.location.search).get("scan") || "";
  const [url, setUrl] = useState("");
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(Boolean(initialToken));
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnyRecord | null>(null);
  const timer = useRef<number | null>(null);

  const evidence = result?.evidence_dashboard || {};
  const capabilities = evidence?.metric_capabilities || {};
  const coverage = evidence?.metric_coverage || {};
  const layers = Array.isArray(evidence?.conversion_layers) ? evidence.conversion_layers : [];
  const priorities = Array.isArray(result?.priority_actions) ? result.priority_actions : [];
  const benchmark = result?.benchmark_comparison || evidence?.benchmark_comparison || null;
  const benchmarkRows = Array.isArray(benchmark?.comparison) ? benchmark.comparison : [];
  const activeCollectors = Number(capabilities?.autonomous_implemented || 0);
  const observed = Number(coverage?.observed_distinct || 0);
  const autonomousCoverage = activeCollectors ? Math.min(100, (observed / activeCollectors) * 100) : 0;

  const headlineScore = useMemo(() => {
    if (result?.preview_score != null) return { label: "Score preliminar", value: Math.round(Number(result.preview_score)) };
    if (!layers.length) return { label: "Cobertura medida", value: Math.round(autonomousCoverage) };
    const ready = layers.map((x: AnyRecord) => Number(x.evidence_readiness || 0)).filter((x: number) => Number.isFinite(x));
    return { label: "Cobertura de evidência", value: ready.length ? Math.round((ready.reduce((a: number, b: number) => a + b, 0) / ready.length) * 100) : Math.round(autonomousCoverage) };
  }, [result, layers, autonomousCoverage]);

  async function check(scanToken: string) {
    try {
      const data = await post({ action: "status", token: scanToken });
      const next = data?.result || null;
      setResult(next);
      setError("");
      if (next?.status === "completed" || next?.status === "failed") {
        setBusy(false);
        return;
      }
      timer.current = window.setTimeout(() => void check(scanToken), 2400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar a análise");
      setBusy(false);
    }
  }

  useEffect(() => {
    document.title = "Ranking Site — Auditoria autônoma | Plutyx";
    if (initialToken) void check(initialToken);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(""); setResult(null); setBusy(true);
    try {
      const data = await post({ action: "start", url });
      const nextToken = String(data?.token || "");
      if (!nextToken) throw new Error("scan_token_missing");
      setToken(nextToken);
      window.history.replaceState(null, "", `/ranking-site?scan=${encodeURIComponent(nextToken)}`);
      await check(nextToken);
    } catch (e) {
      setBusy(false);
      const code = e instanceof Error ? e.message : "internal_error";
      const messages: AnyRecord = {
        invalid_url: "Digite uma URL válida, como exemplo.com ou https://exemplo.com.",
        daily_preview_limit: "O limite diário desta conexão foi atingido.",
        scanner_busy: "Os coletores estão ocupados. Tente novamente em seguida.",
      };
      setError(messages[code] || "Não foi possível iniciar a análise agora.");
    }
  }

  const scanStatus = result?.status || (busy ? "processing" : "");
  const accessLimited = result?.error_code === "access_limited" || result?.access?.limited === true;

  return <main className="rs-page">
    <div className="rs-ambient rs-ambient-a" /><div className="rs-ambient rs-ambient-b" />
    <header className="rs-topbar">
      <a className="rs-brand" href="/"><span className="rs-brand-mark">P</span><span>PLUTYX</span></a>
      <div className="rs-live"><i /> SAC · Autonomous Site Intelligence</div>
    </header>

    <section className="rs-hero">
      <div className="rs-kicker">AUDITORIA REAL · SEM CHECKLIST MANUAL</div>
      <h1>Descubra o que seu site <em>realmente</em> entrega.</h1>
      <p>Cole a URL. O SAC coleta sozinho performance, SEO, acessibilidade, segurança, arquitetura, UX, CRO e evidências públicas — e separa fato medido de inferência.</p>
      <form className="rs-search" onSubmit={submit}>
        <div className="rs-input-wrap"><span>↗</span><input value={url} onChange={e => setUrl(e.target.value)} placeholder="seusite.com.br" aria-label="URL do site" autoComplete="url" /></div>
        <button disabled={busy || !url.trim()}>{busy ? "Analisando…" : "Analisar site"}</button>
      </form>
      <div className="rs-proofline"><span>HTTP + DOM</span><span>Browser real</span><span>PageSpeed + CrUX</span><span>WCAG</span><span>Security</span><span>Benchmark próprio</span></div>
      {error && <div className="rs-error">{error}</div>}
    </section>

    {(busy || result) && <section className="rs-console">
      <div className="rs-console-head">
        <div><span className={`rs-status ${statusTone(scanStatus)}`}><i />{humanStatus(scanStatus)}</span><h2>{result?.url || url || "Preparando domínio"}</h2></div>
        {token && <code>{token.slice(0, 8)}…</code>}
      </div>
      <div className="rs-pipeline">
        {["Descoberta", "HTTP / DOM", "PageSpeed / CrUX", "Browser / WCAG", "Evidência / Benchmark"].map((x, i) => <div className={`rs-step ${result?.status === "completed" || i < (busy ? 2 : 5) ? "on" : ""}`} key={x}><b>{String(i + 1).padStart(2, "0")}</b><span>{x}</span></div>)}
      </div>
      {busy && !result?.evidence_dashboard && <div className="rs-scanline"><span /></div>}
      {accessLimited && <div className="rs-notice">O origin limitou a coleta direta. O SAC não pontua página de desafio como se fosse o site; fontes alternativas só entram com identificação explícita.</div>}
    </section>}

    {result?.status === "completed" && <>
      <section className="rs-overview">
        <div className="rs-scorecard">
          <div className="rs-score-ring" style={{ "--score": `${headlineScore.value * 3.6}deg` } as React.CSSProperties}><div><strong>{headlineScore.value}</strong><span>/100</span></div></div>
          <div><span>{headlineScore.label}</span><h2>{result?.official_score ? "Score oficial" : "Leitura baseada em evidência disponível"}</h2><p>Uma ausência de evidência nunca é convertida silenciosamente em aprovação.</p></div>
        </div>
        <div className="rs-metrics-grid">
          <Metric label="Coletores autônomos" value={activeCollectors || "—"} note="implementados no motor" />
          <Metric label="Métricas observadas" value={observed || "—"} note="nesta execução" />
          <Metric label="Checks aprovados" value={evidence?.atomic_status?.pass ?? "—"} />
          <Metric label="Falhas reais" value={evidence?.atomic_status?.fail ?? "—"} />
        </div>
      </section>

      <section className="rs-section">
        <div className="rs-section-title"><div><span>CAMADAS DE CONVERSÃO</span><h2>N0 → N∞, sem nota inventada</h2></div><p>O score de uma camada só existe quando a cobertura mínima é atingida.</p></div>
        <div className="rs-layers">
          {layers.map((l: AnyRecord) => {
            const readiness = Number(l.evidence_readiness || 0) * 100;
            return <article className="rs-layer" key={l.layer_code}>
              <div className="rs-layer-top"><b>{l.layer_code}</b><span className={statusTone(l.status)}>{l.score_10 != null ? `${fmt(l.score_10)}/10` : l.status === "pending_evidence" ? "aguardando evidência" : "cobertura insuficiente"}</span></div>
              <h3>{l.label}</h3><p>{l.description}</p>
              <div className="rs-bar"><i style={{ width: pct(readiness) }} /></div>
              <small>{pct(readiness)} de prontidão de evidência · {l.checks?.verified || 0} verificações comprovadas</small>
            </article>;
          })}
        </div>
      </section>

      {priorities.length > 0 && <section className="rs-section">
        <div className="rs-section-title"><div><span>PRIORIDADE AUTOMÁTICA</span><h2>O que corrigir primeiro</h2></div><p>Impacto × severidade × confiança da evidência. Esforço não é inventado sem conhecer sua stack.</p></div>
        <div className="rs-actions">
          {priorities.slice(0, 8).map((a: AnyRecord, i: number) => <article className="rs-action" key={`${a.check_code}-${i}`}>
            <div className="rs-action-rank">{String(i + 1).padStart(2, "0")}</div>
            <div className="rs-action-body"><div><span className={`rs-pill ${statusTone(a.status)}`}>{a.status}</span><span className="rs-engine">{a.engine}</span></div><h3>{a.title}</h3><p>{a.explanation || a.recommendation || "Evidência técnica observada."}</p><small>Confiança {pct(Number(a.confidence || 0) * 100)} · fonte {a.evidence_tier || a.source_kind || "observada"}</small></div>
            <strong className="rs-priority">{fmt(a.evidence_priority)}</strong>
          </article>)}
        </div>
      </section>}

      {benchmarkRows.length > 0 && <section className="rs-section">
        <div className="rs-section-title"><div><span>BENCHMARK PRÓPRIO</span><h2>Seu site vs corpus técnico</h2></div><p>Comparação de prevalência técnica. Não é promessa de vendas nem de ranking.</p></div>
        <div className="rs-benchmark">
          {benchmarkRows.slice(0, 12).map((b: AnyRecord) => <div className="rs-bench-row" key={b.metric}><div><strong>{String(b.metric).replaceAll("_", " ")}</strong><span>{fmt(b.site_percent)}% no site</span></div><div className="rs-dual"><i style={{ width: pct(b.benchmark_percent) }} /><b style={{ width: pct(b.site_percent) }} /></div><em className={Number(b.delta_pp) >= 0 ? "good" : "bad"}>{Number(b.delta_pp) >= 0 ? "+" : ""}{fmt(b.delta_pp)} p.p.</em></div>)}
        </div>
      </section>}

      <section className="rs-section rs-evidence-section">
        <div className="rs-section-title"><div><span>EVIDENCE OS</span><h2>O que foi realmente medido</h2></div><p>Métricas dependentes de dados privados não são exibidas como coletadas.</p></div>
        <div className="rs-evidence-grid">
          {Object.entries(coverage?.by_evidence_class || {}).map(([key, value]: [string, any]) => <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value?.observed || 0}</strong><small>observadas</small></div>)}
        </div>
      </section>
    </>}

    <footer className="rs-footer"><span>Plutyx · SAC</span><span>Resultado auditável por evidência · {new Date().getFullYear()}</span></footer>
  </main>;
}
