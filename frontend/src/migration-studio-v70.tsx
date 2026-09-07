import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  DatabaseZap,
  Eye,
  KeyRound,
  Loader2,
  PackageOpen,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Store,
  TriangleAlert,
  Unplug,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { request } from "./app";

type Resource = {
  available: boolean;
  count: number;
  conflicts: number;
  review_required?: number;
  error?: string | null;
  consent_policy?: string;
};
type Preview = {
  resources: { products: Resource; inputs: Resource; customers: Resource };
  samples: {
    products: Array<{ name: string; category?: string }>;
    inputs: Array<{ name: string; unit?: string; quantity?: string; needs_review?: boolean }>;
    customers: Array<{ name: string; visits?: number; favorite_product?: string }>;
  };
  warnings: string[];
};
type MigrationStatus = {
  connection?: {
    status?: string | null;
    display_name?: string | null;
    external_account_ref?: string | null;
    last_success_at?: string | null;
    last_error?: string | null;
  } | null;
  scopes?: string[];
  auth?: { current?: string; recommended_for_saas?: string; client_id_configured?: boolean };
};
type ApplyResult = {
  result: {
    products: { created: number; skipped: number };
    inputs: { created: number; skipped: number; review?: number };
    customers: { created: number; skipped: number; consent_reset: number };
  };
  review_required?: {
    product_channel_prices?: boolean;
    customer_marketing_consent?: boolean;
    invalid_input_numbers?: number;
    unknown_fields_not_imported?: boolean;
  };
};

type StepId = "connect" | "read" | "review" | "bring";

const API =
  import.meta.env.VITE_MIGRATION_API_URL ||
  "https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-migration-v70";

async function migrationRequest(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Não foi possível concluir a migração");
  return body;
}

const steps: Array<{ id: StepId; label: string; icon: typeof KeyRound }> = [
  { id: "connect", label: "CONECTAR", icon: KeyRound },
  { id: "read", label: "LER", icon: Eye },
  { id: "review", label: "REVISAR", icon: ShieldCheck },
  { id: "bring", label: "TRAZER", icon: DatabaseZap },
];

function reviewLabel(count: number) {
  return count === 1 ? "1 precisa revisão" : `${count} precisam revisão`;
}

function MigrationStudio({ businessId }: { businessId: number }) {
  const reduced = Boolean(useReducedMotion());
  const token = localStorage.getItem("c360_token") || "";
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [include, setInclude] = useState({ products: true, inputs: true, customers: false });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadStatus(silent = false) {
    if (!token || !businessId) return;
    if (!silent) setBusy("status");
    try {
      const next = await migrationRequest(`/businesses/${businessId}/takeat/status`, token);
      setStatus(next);
      setError("");
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Não foi possível ler a migração");
    } finally {
      if (!silent) setBusy("");
    }
  }

  useEffect(() => {
    void loadStatus();
  }, [businessId]);

  const connected = ["active", "degraded"].includes(status?.connection?.status || "");
  const stage: StepId = result ? "bring" : preview ? "review" : connected ? "read" : "connect";
  const stageIndex = steps.findIndex((item) => item.id === stage);

  async function readPreview() {
    if (!token || !businessId) return;
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const next = await migrationRequest(`/businesses/${businessId}/takeat/preview`, token, { method: "POST" });
      setPreview(next);
      setResult(null);
      setNotice("Leitura concluída. Nada foi gravado ainda.");
      await loadStatus(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler a Takeat");
    } finally {
      setBusy("");
    }
  }

  async function connect() {
    if (!apiKey.trim() || busy) return;
    const transientKey = apiKey.trim();
    setBusy("connect");
    setError("");
    setNotice("");
    try {
      const next = await migrationRequest(`/businesses/${businessId}/takeat/connect`, token, {
        method: "POST",
        body: JSON.stringify({ api_key: transientKey, restaurant_id: restaurantId.trim() || undefined }),
      });
      setApiKey("");
      setStatus((current) => ({ ...(current || {}), connection: next.connection, scopes: next.scopes || [] }));
      setNotice("Conta autorizada. A chave de origem já saiu do navegador e não foi armazenada pelo 360.");
      await readPreview();
    } catch (e) {
      setApiKey("");
      setError(e instanceof Error ? e.message : "A Takeat recusou a autorização");
    } finally {
      setBusy("");
    }
  }

  async function apply() {
    if (!preview || busy || (!include.products && !include.inputs && !include.customers)) return;
    setBusy("apply");
    setError("");
    setNotice("");
    try {
      const next = await migrationRequest(`/businesses/${businessId}/takeat/apply`, token, {
        method: "POST",
        body: JSON.stringify(include),
      });
      setResult(next);
      setNotice("Importação concluída. Agora revise apenas os pontos que não têm equivalência automática.");
      window.dispatchEvent(new CustomEvent("c360:migration-applied", { detail: { businessId, result: next.result } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "A importação não pôde ser concluída");
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    if (!connected || busy) return;
    setBusy("disconnect");
    setError("");
    try {
      const response = await migrationRequest(`/businesses/${businessId}/takeat`, token, { method: "DELETE" });
      setStatus(null);
      setPreview(null);
      setResult(null);
      setNotice(
        response?.remote_revoke?.required
          ? "Tokens locais removidos. Para encerrar todas as sessões emitidas pela chave, revogue-a também no AI Builders da Takeat."
          : "Migração encerrada e credenciais locais removidas.",
      );
      await loadStatus(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível encerrar a migração");
    } finally {
      setBusy("");
    }
  }

  const totals = useMemo(() => {
    if (!preview) return { count: 0, conflicts: 0, review: 0 };
    const rows = Object.values(preview.resources);
    return {
      count: rows.reduce((sum, item) => sum + Number(item.count || 0), 0),
      conflicts: rows.reduce((sum, item) => sum + Number(item.conflicts || 0), 0),
      review: rows.reduce((sum, item) => sum + Number(item.review_required || 0), 0),
    };
  }, [preview]);

  return (
    <section data-migration-studio-v70 className="migration70-shell" aria-labelledby="migration70-title">
      <div className="migration70-aura migration70-aura-a" aria-hidden="true" />
      <div className="migration70-aura migration70-aura-b" aria-hidden="true" />

      <header className="migration70-head">
        <div>
          <span><Sparkles size={13} /> MIGRAÇÃO ASSISTIDA · TAKEAT → COZINHA 360</span>
          <h2 id="migration70-title">Sua operação não começa do zero.</h2>
          <p>Conecte uma vez, veja o que existe e escolha o que trazer. O 360 só grava depois do preview.</p>
        </div>
        <div className={`migration70-status ${connected ? "connected" : ""}`}>
          <i>{connected ? <Check size={14} /> : <Store size={14} />}</i>
          <div><span>{connected ? "ORIGEM AUTORIZADA" : "ORIGEM"}</span><b>{status?.connection?.display_name || "Takeat"}</b></div>
        </div>
      </header>

      <div className="migration70-path" aria-label="Etapas da migração">
        <div className="migration70-path-line" aria-hidden="true">
          <motion.i
            initial={false}
            animate={{ width: `${(Math.max(0, stageIndex) / (steps.length - 1)) * 100}%` }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 22 }}
          />
        </div>
        {steps.map((item, index) => {
          const Icon = item.icon;
          const done = index < stageIndex || (item.id === "bring" && Boolean(result));
          const active = index === stageIndex;
          return (
            <div key={item.id} className={`migration70-step ${done ? "done" : ""} ${active ? "active" : ""}`} data-migration-step={item.id}>
              <i>{done ? <Check size={14} /> : <Icon size={14} />}</i>
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {!connected && (
        <motion.div className="migration70-connect" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="migration70-key-visual"><KeyRound size={24} /><span>1 VEZ</span></div>
          <div className="migration70-connect-copy">
            <span>AUTORIZE A LEITURA</span>
            <h3>Use a chave criada na Takeat apenas para abrir a porta.</h3>
            <p>Depois da autorização, a chave é apagada do formulário. O backend guarda somente os tokens rotativos criptografados.</p>
          </div>
          <div className="migration70-connect-form">
            <label>
              <span>Chave Takeat</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="tk_live_… ou tk_test_…"
                aria-label="Chave Takeat"
              />
            </label>
            <button type="button" className="migration70-advanced-toggle" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>
              Tenho mais de um restaurante <ChevronDown size={13} />
            </button>
            {advanced && (
              <label>
                <span>ID do restaurante <small>opcional</small></span>
                <input value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)} placeholder="restaurant_id" aria-label="ID do restaurante Takeat" />
              </label>
            )}
            <motion.button
              type="button"
              className="migration70-primary"
              disabled={!apiKey.trim() || Boolean(busy)}
              onClick={() => void connect()}
              whileHover={reduced ? undefined : { y: -2, scale: 1.01 }}
              whileTap={reduced ? undefined : { scale: .985 }}
            >
              {busy === "connect" ? <Loader2 className="migration70-spin" size={15} /> : <ShieldCheck size={15} />}
              Autorizar e ler minha operação
            </motion.button>
          </div>
        </motion.div>
      )}

      {connected && !preview && (
        <div className="migration70-reading">
          <motion.div animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}><DatabaseZap size={28} /></motion.div>
          <div><span>ORIGEM AUTORIZADA</span><h3>Pronto para ler sem gravar.</h3><p>Cardápio, insumos e relações serão comparados com o que já existe no 360.</p></div>
          <button type="button" onClick={() => void readPreview()} disabled={Boolean(busy)}>{busy === "preview" ? <Loader2 className="migration70-spin" size={14} /> : <Eye size={14} />} Ler agora</button>
        </div>
      )}

      {preview && (
        <>
          <div className="migration70-overview">
            <div><span>ENCONTRADOS</span><strong>{totals.count}</strong><small>registros legíveis</small></div>
            <div className={totals.conflicts ? "attention" : ""}><span>JÁ EXISTEM</span><strong>{totals.conflicts}</strong><small>serão pulados, não sobrescritos</small></div>
            <div className={totals.review ? "attention" : ""}><span>REVISÃO HUMANA</span><strong>{totals.review}</strong><small>{totals.review ? "não viram zero nem são importados no escuro" : "nenhum número inválido detectado"}</small></div>
          </div>

          <div className="migration70-resources">
            <ResourceCard
              icon={Boxes}
              title="Cardápio"
              eyebrow="PRODUTOS"
              resource={preview.resources.products}
              selected={include.products}
              onToggle={() => setInclude((value) => ({ ...value, products: !value.products }))}
              samples={preview.samples.products.map((item) => item.name)}
              note="Cadastro base. Preço por canal fica para revisão."
            />
            <ResourceCard
              icon={PackageOpen}
              title="Estoque"
              eyebrow="INSUMOS + PAR"
              resource={preview.resources.inputs}
              selected={include.inputs}
              onToggle={() => setInclude((value) => ({ ...value, inputs: !value.inputs }))}
              samples={preview.samples.inputs.map((item) => item.name)}
              note="Quantidade, mínimo e alvo entram quando a unidade é compatível."
            />
            <ResourceCard
              icon={Users}
              title="Relações"
              eyebrow="CLIENTES"
              resource={preview.resources.customers}
              selected={include.customers}
              onToggle={() => setInclude((value) => ({ ...value, customers: !value.customers }))}
              samples={preview.samples.customers.map((item) => item.name)}
              note="Desligado por padrão. Consentimento de marketing será reiniciado."
              sensitive
            />
          </div>

          <div className="migration70-review">
            <div>
              <span><ShieldCheck size={13} /> REGRA DE SEGURANÇA</span>
              <b>Conflitos são pulados. O 360 não sobrescreve cadastros existentes nesta migração.</b>
            </div>
            <div>
              <span><TriangleAlert size={13} /> O QUE NÃO SERÁ INFERIDO</span>
              <b>{totals.review ? `${reviewLabel(totals.review)} antes de entrar no estoque. ` : ""}Preço por canal, consentimento e campos sem equivalência exigem revisão humana.</b>
            </div>
          </div>

          {!result ? (
            <div className="migration70-action">
              <div><span>PRONTO PARA TRAZER</span><b>{[include.products && "Cardápio", include.inputs && "Estoque", include.customers && "Relações"].filter(Boolean).join(" + ") || "Escolha ao menos um bloco"}</b><small>Nenhuma escrita acontece antes deste botão.</small></div>
              <motion.button type="button" className="migration70-primary" disabled={Boolean(busy) || (!include.products && !include.inputs && !include.customers)} onClick={() => void apply()} whileHover={reduced ? undefined : { y: -2, scale: 1.01 }} whileTap={reduced ? undefined : { scale: .985 }}>
                {busy === "apply" ? <Loader2 className="migration70-spin" size={15} /> : <DatabaseZap size={15} />}
                Trazer para o Cozinha 360 <ArrowRight size={14} />
              </motion.button>
            </div>
          ) : (
            <div className="migration70-complete">
              <div className="migration70-complete-orb"><Sparkles size={24} /></div>
              <div>
                <span>MIGRAÇÃO CONCLUÍDA</span>
                <h3>A operação chegou. Agora revise só o que pede decisão.</h3>
                <p>
                  {result.result.products.created} produtos · {result.result.inputs.created} insumos · {result.result.customers.created} clientes criados.
                  {Number(result.result.inputs.review || result.review_required?.invalid_input_numbers || 0) > 0 && ` ${reviewLabel(Number(result.result.inputs.review || result.review_required?.invalid_input_numbers || 0))} no estoque.`}
                </p>
              </div>
              <div className="migration70-next"><a href="/?margin=1">Revisar preços <ArrowRight size={13} /></a><a href="/?crm=1">Revisar relações <ArrowRight size={13} /></a></div>
            </div>
          )}
        </>
      )}

      {(notice || error) && <div className={`migration70-message ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{error || notice}</div>}

      {connected && (
        <footer className="migration70-foot">
          <span><ShieldCheck size={12} /> API key não é armazenada · tokens ficam criptografados no servidor</span>
          <div>
            <button type="button" onClick={() => void readPreview()} disabled={Boolean(busy)}><RefreshCcw size={12} /> Atualizar leitura</button>
            <button type="button" onClick={() => void disconnect()} disabled={Boolean(busy)}><Unplug size={12} /> Encerrar migração</button>
          </div>
        </footer>
      )}
    </section>
  );
}

function ResourceCard({ icon: Icon, title, eyebrow, resource, selected, onToggle, samples, note, sensitive = false }: {
  icon: typeof Boxes;
  title: string;
  eyebrow: string;
  resource: Resource;
  selected: boolean;
  onToggle: () => void;
  samples: string[];
  note: string;
  sensitive?: boolean;
}) {
  const reduced = Boolean(useReducedMotion());
  const review = Number(resource.review_required || 0);
  return (
    <motion.button
      type="button"
      className={`migration70-resource ${selected ? "selected" : ""} ${sensitive ? "sensitive" : ""} ${!resource.available ? "unavailable" : ""}`}
      onClick={onToggle}
      disabled={!resource.available}
      aria-pressed={selected}
      whileHover={reduced || !resource.available ? undefined : { y: -3, scale: 1.008 }}
      whileTap={reduced || !resource.available ? undefined : { scale: .985 }}
      transition={{ type: "spring", stiffness: 260, damping: 23 }}
    >
      <div className="migration70-resource-top">
        <i><Icon size={18} /></i>
        <span className={`migration70-check ${selected ? "on" : ""}`}>{selected && <Check size={12} />}</span>
      </div>
      <small>{eyebrow}</small>
      <h3>{title}</h3>
      <div className="migration70-resource-count"><strong>{resource.count || 0}</strong><span>encontrados</span></div>
      <div className={`migration70-conflicts ${resource.conflicts ? "has" : ""}`}>{resource.conflicts || 0} já existem</div>
      {review > 0 && <div className="migration70-conflicts has"><TriangleAlert size={10} /> {reviewLabel(review)}</div>}
      <div className="migration70-samples">{samples.slice(0, 3).map((sample) => <span key={sample}>{sample}</span>)}</div>
      <p>{resource.error || note}</p>
    </motion.button>
  );
}

export function MigrationStudioPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);

  useEffect(() => {
    let ownedHost: HTMLElement | null = null;
    let cancelled = false;

    const mount = async () => {
      const passport = document.querySelector<HTMLElement>("[data-integration-passport-v65]");
      if (!passport) return;
      let target = document.querySelector<HTMLElement>("[data-migration-studio-v70-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-migration-studio-v70-host", "true");
        passport.insertAdjacentElement("afterend", target);
        ownedHost = target;
      }
      if (!cancelled) setHost(target);

      const selected = document.querySelector<HTMLSelectElement>(".cx-top select");
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
        // Connections Hub remains usable if migration cannot resolve the tenant.
      }
    };

    const observer = new MutationObserver(() => void mount());
    observer.observe(document.body, { childList: true, subtree: true });
    void mount();
    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (target?.matches(".cx-top select")) setBusinessId(Number(target.value || 0));
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
  return createPortal(<MigrationStudio businessId={businessId} />, host);
}
