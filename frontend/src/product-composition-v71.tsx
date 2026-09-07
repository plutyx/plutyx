import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Boxes,
  CircleGauge,
  CookingPot,
  Edit3,
  Flame,
  Layers3,
  Loader2,
  Package,
  RefreshCcw,
  Sparkles,
  Utensils,
  Weight,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { money, request, type Ingredient, type Product } from "./app";
import { intelligenceRequest } from "./intelligence-api-v50";

type RecipeRow = {
  id?: number;
  product_id?: number;
  ingredient_id: number;
  qty_used_milliunits: number;
};

type CostRecipeItem = {
  ingredient_id: number;
  name: string;
  qty_used_milliunits: number;
  estimated_cost_cents: number;
};

type CostPreview = {
  product_id: number;
  product_name: string;
  ingredients_cents: number;
  packaging_cents: number;
  energy_cents: number;
  labor_cents: number;
  direct_cost_per_unit_cents: number;
  recipe_items?: CostRecipeItem[];
  method?: string;
};

type IngredientView = {
  ingredient: Ingredient;
  qty: number;
  estimatedCost: number;
  coverage: number | null;
  state: "critical" | "attention" | "covered" | "unconfigured";
};

const orbitPositions = [
  { x: 50, y: 8 },
  { x: 78, y: 17 },
  { x: 92, y: 45 },
  { x: 82, y: 76 },
  { x: 50, y: 91 },
  { x: 18, y: 76 },
  { x: 8, y: 45 },
  { x: 22, y: 17 },
];

function stateFor(ingredient: Ingredient) {
  if (ingredient.on_hand_milliunits <= 0) return "critical" as const;
  if (ingredient.par_level_milliunits <= 0) return "unconfigured" as const;
  if (ingredient.on_hand_milliunits <= ingredient.par_level_milliunits) return "attention" as const;
  return "covered" as const;
}

function formatQty(value: number, unit: string) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} ${unit || "un"}`;
}

function coverageText(view: IngredientView) {
  if (view.coverage === null) return "quantidade da ficha ausente";
  if (view.coverage < 1) return "estoque não cobre 1× esta ficha";
  return `estoque cobre ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(view.coverage)}× esta ficha`;
}

function focusRecipeIngredient(ingredient: Ingredient, reduced: boolean) {
  const panel = document.querySelector<HTMLElement>(".recipe-panel");
  if (!panel) return;
  const select = panel.querySelector<HTMLSelectElement>("select");
  if (select) {
    const byId = Array.from(select.options).find((option) => option.value === String(ingredient.id));
    const byName = Array.from(select.options).find((option) => option.textContent?.trim() === ingredient.name);
    const option = byId || byName;
    if (option) {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    select.focus({ preventScroll: true });
  }
  panel.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  if (!reduced) {
    panel.animate(
      [
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(103,232,249,0)" },
        { transform: "scale(1.008)", boxShadow: "0 0 0 3px rgba(103,232,249,.15),0 0 70px rgba(103,232,249,.08)" },
        { transform: "scale(1)", boxShadow: "0 0 0 rgba(103,232,249,0)" },
      ],
      { duration: 900, easing: "ease-out" },
    );
  }
}

function ProductCompositionMap({ businessId, product, ingredients, revision }: {
  businessId: number;
  product: Product;
  ingredients: Ingredient[];
  revision: number;
}) {
  const reduced = Boolean(useReducedMotion());
  const token = localStorage.getItem("c360_token") || "";
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [cost, setCost] = useState<CostPreview | null>(null);
  const [costError, setCostError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  async function load() {
    if (!businessId || !product.id || !token) return;
    const id = ++requestId.current;
    setBusy(true);
    setCostError("");
    try {
      const raw = await request(`/businesses/${businessId}/products/${product.id}/recipe`, {}, token);
      if (id !== requestId.current) return;
      setRecipe(Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : []);
      try {
        const next = await intelligenceRequest(`/businesses/${businessId}/products/${product.id}/cost-preview`, {}, token) as CostPreview;
        if (id !== requestId.current) return;
        setCost(next);
      } catch (error) {
        if (id !== requestId.current) return;
        setCost(null);
        setCostError(error instanceof Error ? error.message : "Custo ainda incompleto");
      }
    } catch {
      if (id === requestId.current) {
        setRecipe([]);
        setCost(null);
        setCostError("Não foi possível ler esta ficha agora.");
      }
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [businessId, product.id, revision]);

  const views = useMemo<IngredientView[]>(() => {
    const byId = new Map(ingredients.map((item) => [item.id, item]));
    const costById = new Map((cost?.recipe_items || []).map((item) => [Number(item.ingredient_id), Number(item.estimated_cost_cents || 0)]));
    return recipe
      .map((row) => {
        const ingredient = byId.get(Number(row.ingredient_id));
        if (!ingredient) return null;
        const qty = Math.max(0, Number(row.qty_used_milliunits || 0));
        return {
          ingredient,
          qty,
          estimatedCost: costById.get(ingredient.id) || 0,
          coverage: qty > 0 ? Math.max(0, ingredient.on_hand_milliunits) / qty : null,
          state: stateFor(ingredient),
        } satisfies IngredientView;
      })
      .filter(Boolean) as IngredientView[];
  }, [recipe, ingredients, cost]);

  const topViews = views.slice(0, 8);
  const maxIngredientCost = Math.max(1, ...views.map((item) => item.estimatedCost));
  const breakdown = cost ? [
    { id: "ingredients", label: "Ingredientes", value: cost.ingredients_cents, icon: Utensils },
    { id: "packaging", label: "Embalagem", value: cost.packaging_cents, icon: Package },
    { id: "energy", label: "Energia", value: cost.energy_cents, icon: Flame },
    { id: "labor", label: "Mão de obra", value: cost.labor_cents, icon: Wrench },
  ] : [];
  const breakdownTotal = Math.max(1, breakdown.reduce((sum, item) => sum + item.value, 0));
  const attention = views.filter((item) => item.state === "critical" || item.state === "attention").length;
  const unconfigured = views.filter((item) => item.state === "unconfigured").length;

  return (
    <section data-product-composition-v71 className="pc71-shell" aria-labelledby="pc71-title">
      <div className="pc71-aura pc71-aura-a" aria-hidden="true" />
      <div className="pc71-aura pc71-aura-b" aria-hidden="true" />

      <header className="pc71-head">
        <div>
          <span><Sparkles size={13} /> MAPA VIVO DA FICHA · V7.1</span>
          <h2 id="pc71-title">Veja o produto por dentro.</h2>
          <p>Quantidade, custo e estoque da mesma ficha técnica que a cozinha já usa.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} aria-label="Atualizar mapa da ficha">
          <RefreshCcw className={busy ? "pc71-spin" : ""} size={14} /> Atualizar
        </button>
      </header>

      {!recipe.length && !busy ? (
        <motion.button
          type="button"
          className="pc71-empty"
          onClick={() => {
            const panel = document.querySelector<HTMLElement>(".recipe-panel");
            panel?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
            panel?.querySelector<HTMLSelectElement>("select")?.focus();
          }}
          whileHover={reduced ? undefined : { y: -3, scale: 1.006 }}
          whileTap={reduced ? undefined : { scale: .99 }}
        >
          <div><CookingPot size={28} /></div>
          <span>FICHA AINDA VAZIA</span>
          <h3>Comece ligando o primeiro ingrediente.</h3>
          <p>O mapa nasce automaticamente quando a receita é salva.</p>
          <b>Ir para o editor <ArrowRight size={13} /></b>
        </motion.button>
      ) : (
        <div className="pc71-grid">
          <div className="pc71-orbit-card">
            <div className="pc71-orbit-meta">
              <span><Layers3 size={12} /> COMPOSIÇÃO REAL</span>
              <div><b>{views.length}</b> ingredientes</div>
            </div>

            <div className="pc71-orbit" aria-label={`Composição de ${product.name}`}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                  <linearGradient id={`pc71-line-${product.id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="rgba(103,232,249,.65)" />
                    <stop offset="1" stopColor="rgba(167,139,250,.4)" />
                  </linearGradient>
                </defs>
                {topViews.map((view, index) => {
                  const pos = orbitPositions[index];
                  const share = .5 + (view.estimatedCost / maxIngredientCost) * 1.9;
                  return <motion.line key={view.ingredient.id} x1="50" y1="50" x2={pos.x} y2={pos.y} stroke={`url(#pc71-line-${product.id})`} strokeWidth={share} strokeLinecap="round" initial={reduced ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: .78 }} transition={{ type: "spring", stiffness: 80, damping: 22, delay: index * .035 }} />;
                })}
              </svg>

              <motion.div
                className="pc71-core"
                initial={reduced ? false : { scale: .92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 130, damping: 20 }}
              >
                <span>{product.category || "PRODUTO"}</span>
                <h3>{product.name}</h3>
                <div>{cost ? money(cost.direct_cost_per_unit_cents) : "—"}</div>
                <small>{cost ? "CUSTO DIRETO / UN." : "CUSTO A COMPLETAR"}</small>
              </motion.div>

              {topViews.map((view, index) => {
                const pos = orbitPositions[index];
                return (
                  <motion.button
                    type="button"
                    key={view.ingredient.id}
                    className={`pc71-node pc71-${view.state}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onClick={() => focusRecipeIngredient(view.ingredient, reduced)}
                    aria-label={`${view.ingredient.name}: ${formatQty(view.qty, view.ingredient.unit)} na ficha; ${coverageText(view)}. Editar ingrediente.`}
                    whileHover={reduced ? undefined : { scale: 1.08, zIndex: 5 }}
                    whileTap={reduced ? undefined : { scale: .96 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <i><Weight size={12} /></i>
                    <b>{view.ingredient.name}</b>
                    <span>{formatQty(view.qty, view.ingredient.unit)}</span>
                  </motion.button>
                );
              })}
            </div>

            {views.length > 8 && <div className="pc71-more">+ {views.length - 8} ingredientes continuam abaixo</div>}
          </div>

          <div className="pc71-cost-card">
            <div className="pc71-cost-title">
              <span><BadgeDollarSign size={13} /> PARA ONDE O CUSTO VAI</span>
              <b>{cost ? money(cost.direct_cost_per_unit_cents) : "Custo ainda incompleto"}</b>
            </div>

            {cost ? (
              <>
                <div className="pc71-cost-bar" aria-label="Distribuição do custo direto">
                  {breakdown.map((item) => <motion.i key={item.id} initial={reduced ? false : { width: 0 }} animate={{ width: `${Math.max(2, item.value * 100 / breakdownTotal)}%` }} transition={{ type: "spring", stiffness: 95, damping: 20 }} title={`${item.label}: ${money(item.value)}`} />)}
                </div>
                <div className="pc71-cost-bento">
                  {breakdown.map((item) => {
                    const Icon = item.icon;
                    return <div key={item.id}><i><Icon size={14} /></i><span>{item.label}</span><b>{money(item.value)}</b><small>{Math.round(item.value * 100 / breakdownTotal)}%</small></div>;
                  })}
                </div>
              </>
            ) : (
              <div className="pc71-cost-missing">
                <AlertTriangle size={20} />
                <div><b>O servidor ainda não consegue fechar o custo.</b><span>{costError || "Complete os custos de compra dos ingredientes."}</span></div>
              </div>
            )}

            <div className="pc71-health">
              <div className={attention ? "attention" : "good"}><CircleGauge size={15} /><span><b>{attention}</b> ingredientes no limite/ruptura</span></div>
              <div className={unconfigured ? "neutral" : "good"}><Boxes size={15} /><span><b>{unconfigured}</b> sem regra mínima</span></div>
            </div>

            <button type="button" className="pc71-edit" onClick={() => {
              const panel = document.querySelector<HTMLElement>(".recipe-panel");
              panel?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
              panel?.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true });
            }}><Edit3 size={13} /> Editar a ficha real <ArrowRight size={13} /></button>
          </div>
        </div>
      )}

      {!!views.length && (
        <div className="pc71-strip" aria-label="Ingredientes e cobertura de estoque">
          {views.map((view) => (
            <button type="button" key={view.ingredient.id} onClick={() => focusRecipeIngredient(view.ingredient, reduced)} className={`pc71-strip-item pc71-${view.state}`}>
              <div><i /><b>{view.ingredient.name}</b><small>{formatQty(view.qty, view.ingredient.unit)} na ficha</small></div>
              <div><span>{formatQty(view.ingredient.on_hand_milliunits, view.ingredient.unit)} em estoque</span><strong>{coverageText(view)}</strong></div>
              <Edit3 size={12} />
            </button>
          ))}
        </div>
      )}

      <footer className="pc71-foot">
        <span><BadgeDollarSign size={12} /> Custo calculado no servidor a partir da ficha e dos custos cadastrados.</span>
        <span><Package size={12} /> Estoque lido da operação atual; nenhum valor é salvo por este mapa.</span>
      </footer>
    </section>
  );
}

export function ProductCompositionPortal() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [businessId, setBusinessId] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [revision, setRevision] = useState(0);
  const dataRef = useRef({ products: [] as Product[], businessId: 0 });

  useEffect(() => {
    let cancelled = false;
    let ownedHost: HTMLElement | null = null;
    let panelObserver: MutationObserver | null = null;
    let observedPanel: HTMLElement | null = null;
    let refreshTimer = 0;

    async function loadTenant() {
      const token = localStorage.getItem("c360_token") || "";
      if (!token || dataRef.current.businessId) return;
      try {
        const me = await request("/me", {}, token);
        const bid = Number((me.businesses || [])[0]?.id || 0);
        if (!bid || cancelled) return;
        const [nextProducts, nextIngredients] = await Promise.all([
          request(`/businesses/${bid}/products`, {}, token),
          request(`/businesses/${bid}/ingredients`, {}, token),
        ]);
        if (cancelled) return;
        const productRows = Array.isArray(nextProducts) ? nextProducts as Product[] : [];
        const ingredientRows = Array.isArray(nextIngredients) ? nextIngredients as Ingredient[] : [];
        dataRef.current = { products: productRows, businessId: bid };
        setBusinessId(bid);
        setProducts(productRows);
        setIngredients(ingredientRows);
        sync();
      } catch {
        // The primary Products editor remains usable if the visual map cannot resolve data.
      }
    }

    function resolveProduct(panel: HTMLElement) {
      const rows = dataRef.current.products;
      if (!rows.length) return null;
      const heading = panel.querySelector<HTMLElement>(".panel-head h3")?.textContent?.trim() || "";
      const matches = rows.filter((item) => item.name.trim() === heading);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".row-button"));
        const selectedIndex = buttons.findIndex((button) => button.textContent?.includes(heading));
        if (selectedIndex >= 0 && rows[selectedIndex]) return rows[selectedIndex];
        return matches[0];
      }
      return null;
    }

    function observePanel(panel: HTMLElement) {
      if (observedPanel === panel) return;
      panelObserver?.disconnect();
      observedPanel = panel;
      panelObserver = new MutationObserver(() => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
          const next = resolveProduct(panel);
          if (next) setProduct(next);
          setRevision((value) => value + 1);
        }, 120);
      });
      panelObserver.observe(panel, { childList: true, subtree: true, characterData: true });
    }

    function sync() {
      const panel = document.querySelector<HTMLElement>(".recipe-panel");
      if (!panel) {
        panelObserver?.disconnect();
        observedPanel = null;
        if (ownedHost?.isConnected) ownedHost.remove();
        ownedHost = null;
        if (!cancelled) {
          setHost(null);
          setProduct(null);
        }
        return;
      }
      let target = document.querySelector<HTMLElement>("[data-product-composition-v71-host]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-product-composition-v71-host", "true");
        panel.insertAdjacentElement("afterend", target);
        ownedHost = target;
      }
      observePanel(panel);
      const next = resolveProduct(panel);
      if (!cancelled) {
        setHost(target);
        if (next) setProduct(next);
      }
      void loadTenant();
    }

    const bodyObserver = new MutationObserver(() => sync());
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    const click = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".row-button")) return;
      window.setTimeout(sync, 0);
    };
    document.addEventListener("click", click, true);
    sync();
    void loadTenant();

    return () => {
      cancelled = true;
      bodyObserver.disconnect();
      panelObserver?.disconnect();
      window.clearTimeout(refreshTimer);
      document.removeEventListener("click", click, true);
      if (ownedHost?.isConnected) ownedHost.remove();
    };
  }, []);

  useEffect(() => {
    dataRef.current = { products, businessId };
  }, [products, businessId]);

  if (!host || !businessId || !product) return null;
  return createPortal(<ProductCompositionMap businessId={businessId} product={product} ingredients={ingredients} revision={revision} />, host);
}
