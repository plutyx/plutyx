import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  Compass,
  CookingPot,
  Flame,
  Lock,
  LogIn,
  PackageSearch,
  Rocket,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  TimerReset,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  CapabilityMarquee,
  ImmersiveBrandMark,
  KitchenOrb,
  ScrollRevealText,
  SystemStatusPill,
} from "./experience-layer";

type StepId = "moment" | "signal" | "win";
type Answers = Partial<Record<StepId, string>>;

type JourneyOption = {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
};

type JourneyStep = {
  id: StepId;
  marker: string;
  question: string;
  hint: string;
  options: JourneyOption[];
};

export type DiscoveryProfile = {
  id: string;
  name: string;
  focus: string;
  mission: string;
  outcome: string;
  route: string;
  icon: LucideIcon;
};

const journeySteps: JourneyStep[] = [
  {
    id: "moment",
    marker: "AGORA",
    question: "Qual cena mais parece com a sua cozinha hoje?",
    hint: "Escolha a que você reconhece em poucos segundos.",
    options: [
      {
        id: "fire",
        label: "Apagando incêndios",
        detail: "O urgente vence o importante.",
        icon: Flame,
      },
      {
        id: "instinct",
        label: "Decidindo no feeling",
        detail: "Os dados chegam tarde ou incompletos.",
        icon: Compass,
      },
      {
        id: "centralized",
        label: "Tudo depende de mim",
        detail: "A operação para quando você para.",
        icon: TimerReset,
      },
      {
        id: "growth",
        label: "Crescendo com atrito",
        detail: "A demanda sobe; o ruído também.",
        icon: Rocket,
      },
    ],
  },
  {
    id: "signal",
    marker: "SINAL",
    question: "Onde a clareza costuma desaparecer primeiro?",
    hint: "Esse ponto define a primeira missão do seu mapa.",
    options: [
      {
        id: "orders",
        label: "Pedidos",
        detail: "Canais, prazos e clientes disputam atenção.",
        icon: ShoppingBag,
      },
      {
        id: "production",
        label: "Produção",
        detail: "Prioridade e ritmo mudam durante o dia.",
        icon: CookingPot,
      },
      {
        id: "stock",
        label: "Estoque",
        detail: "A falta aparece quando já virou urgência.",
        icon: PackageSearch,
      },
      {
        id: "margin",
        label: "Margem",
        detail: "Vender mais nem sempre deixa mais resultado.",
        icon: CircleDollarSign,
      },
    ],
  },
  {
    id: "win",
    marker: "DESEJO",
    question: "Qual conquista mudaria o seu próximo ciclo?",
    hint: "Não é uma promessa. É o norte da experiência.",
    options: [
      {
        id: "time",
        label: "Recuperar tempo",
        detail: "Menos conferência; mais decisão.",
        icon: Clock3,
      },
      {
        id: "profit",
        label: "Proteger o lucro",
        detail: "Enxergar custo, taxa e sobra real.",
        icon: ShieldCheck,
      },
      {
        id: "flow",
        label: "Trabalhar em fluxo",
        detail: "Cada pessoa sabe o próximo movimento.",
        icon: Workflow,
      },
      {
        id: "scale",
        label: "Crescer sem caos",
        detail: "Evoluir com uma operação que acompanha.",
        icon: Target,
      },
    ],
  },
];

const profiles: Record<string, DiscoveryProfile> = {
  orders: {
    id: "orders",
    name: "Fluxo sem ruído",
    focus: "Entrada organizada",
    mission: "Fazer cada pedido nascer no lugar certo.",
    outcome: "Canais convergem, prazos ficam visíveis e ninguém caça contexto.",
    route: "Pedidos 360 + CRM",
    icon: ShoppingBag,
  },
  production: {
    id: "production",
    name: "Cozinha no compasso",
    focus: "Ritmo compartilhado",
    mission: "Transformar prioridade em uma fila viva.",
    outcome: "A equipe enxerga o agora, o próximo lote e qualquer desvio.",
    route: "KDS + Produção",
    icon: CookingPot,
  },
  stock: {
    id: "stock",
    name: "Estoque que antecipa",
    focus: "Reposição consciente",
    mission: "Perceber a falta antes que ela vire urgência.",
    outcome: "Consumo, mínimo e compras passam a responder ao mesmo sinal.",
    route: "Estoque + Compras",
    icon: Boxes,
  },
  margin: {
    id: "margin",
    name: "Margem consciente",
    focus: "Resultado visível",
    mission: "Descobrir o que realmente sobra em cada venda.",
    outcome: "Preço, custo e taxa deixam de viver em contas separadas.",
    route: "CMV + Caixa 360",
    icon: CircleDollarSign,
  },
  clarity: {
    id: "clarity",
    name: "Mapa em formação",
    focus: "Leitura da operação",
    mission: "Encontrar o primeiro ponto que merece clareza.",
    outcome: "Três escolhas revelam uma rota inicial sem exigir cadastro.",
    route: "Diagnóstico 360",
    icon: Compass,
  },
};

const winOutcomes: Record<string, string> = {
  time: "Sua rota começa devolvendo atenção para o que realmente pede decisão.",
  profit: "Sua rota prioriza decisões que protegem contribuição e caixa.",
  flow: "Sua rota organiza sinais para que a equipe avance no mesmo ritmo.",
  scale: "Sua rota cria base operacional para crescer sem multiplicar o caos.",
};

const solutionCards = [
  {
    id: "orders",
    label: "Pedidos",
    icon: ShoppingBag,
    signal: "Tudo entra em uma fila",
    color: "gold",
  },
  {
    id: "production",
    label: "Produção",
    icon: CookingPot,
    signal: "O próximo movimento aparece",
    color: "mint",
  },
  {
    id: "stock",
    label: "Estoque",
    icon: Boxes,
    signal: "A falta deixa pistas",
    color: "violet",
  },
  {
    id: "margin",
    label: "Margem",
    icon: CircleDollarSign,
    signal: "A sobra fica visível",
    color: "coral",
  },
];

function getProfile(answers: Answers) {
  return profiles[answers.signal || "clarity"] || profiles.clarity;
}

export function getStoredDiscoveryProfile(): DiscoveryProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(
      localStorage.getItem("c360_discovery_profile") || "null",
    ) as { profile?: string } | null;
    return saved?.profile && profiles[saved.profile]
      ? profiles[saved.profile]
      : null;
  } catch {
    return null;
  }
}

function scrollToJourney() {
  document
    .getElementById("mapa-da-operacao")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function JourneyMap({
  current,
  complete,
}: {
  current: number;
  complete: boolean;
}) {
  const active = complete ? journeySteps.length : current;
  return (
    <div className="journey-map" aria-label="Progresso do mapa da operação">
      {journeySteps.map((step, index) => {
        const reached = index <= active;
        const done = complete || index < current;
        return (
          <React.Fragment key={step.id}>
            <div
              className={`journey-map__node ${reached ? "is-reached" : ""} ${done ? "is-done" : ""}`}
            >
              <span>{done ? <Check size={14} /> : index + 1}</span>
              <small>{step.marker}</small>
            </div>
            {index < journeySteps.length - 1 && (
              <div
                className={`journey-map__line ${index < active ? "is-filled" : ""}`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SignalPreview({ answers }: { answers: Answers }) {
  const profile = getProfile(answers);
  const ProfileIcon = profile.icon;
  const selectedCount = Object.keys(answers).length;
  return (
    <motion.aside
      layout
      className={`signal-preview signal-preview--${profile.id}`}
      transition={{ type: "spring", stiffness: 150, damping: 24 }}
    >
      <div className="signal-preview__halo" />
      <div className="signal-preview__head">
        <span>LEITURA AO VIVO</span>
        <i>{selectedCount}/3</i>
      </div>
      <div className="signal-preview__core">
        <KitchenOrb compact className="min-h-[20rem]" />
        <motion.div
          key={profile.id}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
          className="signal-preview__badge"
        >
          <ProfileIcon size={18} />
          <span>
            <small>FOCO EM FORMAÇÃO</small>
            <b>{profile.focus}</b>
          </span>
        </motion.div>
      </div>
      <div className="signal-preview__signals">
        <span className={answers.moment ? "is-lit" : ""}>CENA</span>
        <span className={answers.signal ? "is-lit" : ""}>SINAL</span>
        <span className={answers.win ? "is-lit" : ""}>NORTE</span>
      </div>
    </motion.aside>
  );
}

function ResultView({
  answers,
  onCreate,
  onReset,
}: {
  answers: Answers;
  onCreate: (profile: DiscoveryProfile) => void;
  onReset: () => void;
}) {
  const profile = getProfile(answers);
  const ProfileIcon = profile.icon;
  const aspiration = winOutcomes[answers.win || ""] || profile.outcome;
  return (
    <motion.div
      className="journey-result"
      initial={{ opacity: 0, y: 34 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 130, damping: 23 }}
      aria-live="polite"
    >
      <div className="journey-result__hero">
        <motion.div
          className="journey-result__icon"
          initial={{ scale: 0.6, rotate: -18 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 16 }}
        >
          <ProfileIcon size={30} />
        </motion.div>
        <span>ROTA DESBLOQUEADA</span>
        <h3>{profile.name}</h3>
        <p>{aspiration}</p>
      </div>
      <div className="journey-result__bento">
        <article className="journey-result__mission">
          <small>PRIMEIRA MISSÃO</small>
          <strong>{profile.mission}</strong>
          <span>{profile.route}</span>
        </article>
        <article>
          <Check size={18} />
          <small>SINAL 01</small>
          <b>Prioridade visível</b>
        </article>
        <article>
          <Check size={18} />
          <small>SINAL 02</small>
          <b>Próxima ação clara</b>
        </article>
        <article>
          <Sparkles size={18} />
          <small>RESULTADO</small>
          <b>{profile.focus}</b>
        </article>
      </div>
      <div className="journey-result__actions">
        <motion.button
          type="button"
          className="discovery-primary"
          onClick={() => onCreate(profile)}
          whileHover={{ y: -2, scale: 1.012 }}
          whileTap={{ y: 1, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 280, damping: 18 }}
        >
          Levar esta rota comigo <ArrowRight size={17} />
        </motion.button>
        <button type="button" className="discovery-quiet" onClick={onReset}>
          <RotateCcw size={15} /> Refazer leitura
        </button>
      </div>
      <p className="journey-result__note">
        O diagnóstico fica neste navegador e serve apenas para personalizar seu
        começo.
      </p>
    </motion.div>
  );
}

function Journey({
  onCreate,
  onReveal,
}: {
  onCreate: (profile: DiscoveryProfile) => void;
  onReveal: (profile: DiscoveryProfile) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [complete, setComplete] = useState(false);
  const step = journeySteps[stepIndex];
  const selected = answers[step.id];

  function choose(optionId: string) {
    setAnswers((current) => ({ ...current, [step.id]: optionId }));
  }

  function advance() {
    if (!selected) return;
    if (stepIndex === journeySteps.length - 1) {
      const profile = getProfile(answers);
      try {
        localStorage.setItem(
          "c360_discovery_profile",
          JSON.stringify({
            profile: profile.id,
            answers,
            completed_at: new Date().toISOString(),
          }),
        );
      } catch {
        // Personalization remains available for the current session.
      }
      onReveal(profile);
      setComplete(true);
      return;
    }
    setStepIndex((current) => current + 1);
  }

  function reset() {
    setAnswers({});
    setStepIndex(0);
    setComplete(false);
  }

  return (
    <section id="mapa-da-operacao" className="journey-section">
      <div className="journey-section__heading">
        <span className="eyebrow">MAPA DA OPERAÇÃO</span>
        <h2>Três escolhas. Uma primeira rota.</h2>
        <JourneyMap current={stepIndex} complete={complete} />
      </div>
      <div className="journey-layout">
        <div className="journey-stage">
          <AnimatePresence mode="wait">
            {complete ? (
              <ResultView
                key="result"
                answers={answers}
                onCreate={onCreate}
                onReset={reset}
              />
            ) : (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 150, damping: 23 }}
              >
                <div className="journey-question">
                  <span>
                    {step.marker} · {stepIndex + 1}/3
                  </span>
                  <h3>{step.question}</h3>
                  <p>{step.hint}</p>
                </div>
                <div className="journey-options">
                  {step.options.map((option, index) => {
                    const Icon = option.icon;
                    const active = selected === option.id;
                    return (
                      <motion.button
                        type="button"
                        key={option.id}
                        className={`journey-option ${active ? "is-active" : ""}`}
                        onClick={() => choose(option.id)}
                        aria-pressed={active}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.045 }}
                        whileHover={{ y: -4, scale: 1.012 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <i>
                          <Icon size={22} />
                        </i>
                        <span>
                          <b>{option.label}</b>
                          <small>{option.detail}</small>
                        </span>
                        <em>{active ? <Check size={16} /> : index + 1}</em>
                      </motion.button>
                    );
                  })}
                </div>
                <div className="journey-controls">
                  <button
                    type="button"
                    className="discovery-quiet"
                    onClick={() =>
                      setStepIndex((current) => Math.max(0, current - 1))
                    }
                    disabled={stepIndex === 0}
                  >
                    <ChevronLeft size={16} /> Voltar
                  </button>
                  <motion.button
                    type="button"
                    className="discovery-primary"
                    onClick={advance}
                    disabled={!selected}
                    whileTap={selected ? { scale: 0.98 } : undefined}
                  >
                    {stepIndex === journeySteps.length - 1
                      ? "Revelar minha rota"
                      : "Continuar"}
                    <ArrowRight size={17} />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <SignalPreview answers={answers} />
      </div>
    </section>
  );
}

function SolutionConstellation({ activeId }: { activeId: string }) {
  const [focused, setFocused] = useState(activeId || "orders");
  useEffect(() => {
    if (activeId) setFocused(activeId);
  }, [activeId]);
  const active =
    solutionCards.find((card) => card.id === focused) || solutionCards[0];
  const ActiveIcon = active.icon;
  return (
    <section className="solution-section">
      <div className="solution-section__intro">
        <span className="eyebrow">CONSTELAÇÃO 360</span>
        <ScrollRevealText>
          Cada sinal acende uma solução. Juntas, elas formam uma operação que
          aprende.
        </ScrollRevealText>
      </div>
      <div className="solution-constellation">
        <div className="solution-constellation__orb">
          <KitchenOrb compact className="min-h-[23rem]" />
          <div className="solution-constellation__message" aria-live="polite">
            <ActiveIcon size={19} />
            <span>
              <small>{active.label.toUpperCase()}</small>
              <b>{active.signal}</b>
            </span>
          </div>
        </div>
        <div className="solution-constellation__grid">
          {solutionCards.map((card) => {
            const Icon = card.icon;
            const selected = focused === card.id;
            return (
              <motion.button
                type="button"
                key={card.id}
                className={`solution-node solution-node--${card.color} ${selected ? "is-active" : ""}`}
                onMouseEnter={() => setFocused(card.id)}
                onFocus={() => setFocused(card.id)}
                onClick={() => setFocused(card.id)}
                aria-pressed={selected}
                whileHover={{ y: -4, scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
              >
                <i>
                  <Icon size={22} />
                </i>
                <span>
                  <b>{card.label}</b>
                  <small>{card.signal}</small>
                </span>
                {card.id === activeId && <em>SUA ROTA</em>}
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function VisualStoryStack() {
  const stories = [
    {
      marker: "ENTRADA",
      title: "O ruído vira uma fila.",
      icon: ShoppingBag,
      tone: "gold",
      visual: (
        <div className="mini-kanban">
          {["Novo", "Produção", "Entrega"].map((label, index) => (
            <div key={label}>
              <span>
                {label}
                <i>{[4, 2, 1][index]}</i>
              </span>
              {Array.from({ length: [3, 2, 1][index] }).map((_, item) => (
                <b key={item} style={{ opacity: 1 - item * 0.18 }} />
              ))}
            </div>
          ))}
        </div>
      ),
    },
    {
      marker: "RITMO",
      title: "O próximo movimento aparece.",
      icon: CookingPot,
      tone: "mint",
      visual: (
        <div className="mini-production">
          {[78, 46, 22].map((value, index) => (
            <div key={value}>
              <span>
                <i /> Lote {index + 1}
              </span>
              <b>
                <em style={{ width: `${value}%` }} />
              </b>
              <small>{value}%</small>
            </div>
          ))}
        </div>
      ),
    },
    {
      marker: "DECISÃO",
      title: "A margem deixa de surpreender.",
      icon: BarChart3,
      tone: "violet",
      visual: (
        <div className="mini-margin">
          <div>
            <span>Receita</span>
            <b>100%</b>
          </div>
          <div>
            <span>Custos</span>
            <b>63%</b>
          </div>
          <div className="is-positive">
            <span>Contribuição</span>
            <b>37%</b>
          </div>
          <em>EXEMPLO VISUAL · PRÓXIMA DECISÃO: PREÇO DO DELIVERY</em>
        </div>
      ),
    },
  ];
  return (
    <section className="story-section">
      <div className="story-section__heading">
        <span className="eyebrow">A EXPERIÊNCIA MUDA DE CAMADA</span>
        <h2>Role. Observe. Conecte.</h2>
      </div>
      <div className="story-stack">
        {stories.map((story, index) => {
          const Icon = story.icon;
          return (
            <motion.article
              key={story.marker}
              className={`story-card story-card--${story.tone}`}
              style={{ top: `${2 + index * 1.4}rem` }}
              initial={{ opacity: 0.4, y: 42, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ amount: 0.32 }}
              transition={{ type: "spring", stiffness: 140, damping: 24 }}
            >
              <div className="story-card__copy">
                <i>
                  <Icon size={24} />
                </i>
                <span>
                  {story.marker} · 0{index + 1}
                </span>
                <h3>{story.title}</h3>
              </div>
              <div className="story-card__visual">{story.visual}</div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

function FutureSlider({ onCreate }: { onCreate: () => void }) {
  const [clarity, setClarity] = useState(58);
  const future = clarity > 56;
  const visualStyle = { "--clarity": `${clarity}%` } as CSSProperties;
  return (
    <section className="future-section">
      <div className="future-panel" style={visualStyle}>
        <div className="future-panel__copy">
          <span className="eyebrow">MOVA O HORIZONTE</span>
          <h2>
            {future
              ? "A operação começa a respirar."
              : "O dia ainda pede você em tudo."}
          </h2>
          <p>
            Deslize para ver o que muda quando os sinais passam a conversar.
          </p>
          <label>
            <span>AGORA</span>
            <input
              type="range"
              min="0"
              max="100"
              value={clarity}
              onChange={(event) => setClarity(Number(event.target.value))}
              aria-label="Comparar operação reativa e operação orquestrada"
            />
            <span>ORQUESTRADA</span>
          </label>
        </div>
        <div className="future-panel__state">
          <div>
            <small>DECISÕES</small>
            <strong>{future ? "Visíveis" : "Espalhadas"}</strong>
          </div>
          <div>
            <small>EQUIPE</small>
            <strong>{future ? "Em fluxo" : "Interrompida"}</strong>
          </div>
          <div>
            <small>GESTÃO</small>
            <strong>{future ? "Antecipada" : "Reativa"}</strong>
          </div>
          <motion.span
            animate={{ x: `${Math.max(-35, Math.min(35, clarity - 50))}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          >
            <Sparkles size={22} />
          </motion.span>
        </div>
      </div>
      <div className="future-cta">
        <div>
          <Lock size={16} />
          <span>Diagnóstico sem cadastro · rota salva neste navegador</span>
        </div>
        <motion.button
          type="button"
          className="discovery-primary"
          onClick={onCreate}
          whileHover={{ y: -2, scale: 1.012 }}
          whileTap={{ scale: 0.98 }}
        >
          Continuar minha jornada <ArrowRight size={17} />
        </motion.button>
      </div>
    </section>
  );
}

export function DiscoveryHome({
  onAccess,
}: {
  onAccess: (mode: "login" | "signup", profile?: DiscoveryProfile) => void;
}) {
  const [profile, setProfile] = useState<DiscoveryProfile>(
    () => getStoredDiscoveryProfile() || profiles.clarity,
  );
  const activeId = profile.id === "clarity" ? "" : profile.id;
  const statusLabel = useMemo(
    () =>
      activeId
        ? `ROTA ${profile.focus.toUpperCase()}`
        : "EXPERIÊNCIA DISPONÍVEL",
    [activeId, profile.focus],
  );

  function createWithProfile(nextProfile?: DiscoveryProfile) {
    onAccess("signup", nextProfile || (activeId ? profile : undefined));
  }

  return (
    <div className="discovery-home">
      <header className="discovery-nav">
        <ImmersiveBrandMark />
        <div>
          <SystemStatusPill label={statusLabel} />
          <button
            type="button"
            className="discovery-login"
            onClick={() => onAccess("login")}
          >
            <LogIn size={16} /> Entrar
          </button>
        </div>
      </header>

      <section className="discovery-hero">
        <motion.div
          className="discovery-hero__copy"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 110, damping: 24 }}
        >
          <span className="eyebrow">UMA EXPERIÊNCIA PARA QUEM OPERA</span>
          <h1>
            Sua cozinha já está <em>contando uma história.</em>
          </h1>
          <p>Vamos enxergar o próximo movimento — juntos.</p>
          <div className="discovery-hero__actions">
            <motion.button
              type="button"
              className="discovery-primary"
              onClick={scrollToJourney}
              whileHover={{ y: -3, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
            >
              Começar a leitura <ArrowRight size={17} />
            </motion.button>
            <span>3 escolhas · menos de 1 minuto · sem cadastro</span>
          </div>
        </motion.div>

        <motion.div
          className="discovery-hero__visual"
          initial={{ opacity: 0, scale: 0.92, y: 26 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 24,
            delay: 0.12,
          }}
        >
          <KitchenOrb className="min-h-[39rem]" />
          <div className="hero-signal hero-signal--one">
            <ShoppingBag size={17} />
            <span>
              <small>ENTRADA</small>
              <b>Canais reunidos</b>
            </span>
          </div>
          <div className="hero-signal hero-signal--two">
            <CookingPot size={17} />
            <span>
              <small>RITMO</small>
              <b>Em movimento</b>
            </span>
          </div>
          <div className="hero-signal hero-signal--three">
            <CircleDollarSign size={17} />
            <span>
              <small>DECISÃO</small>
              <b>Uma prioridade</b>
            </span>
          </div>
          <span className="hero-pointer-note">MOVA O CURSOR</span>
        </motion.div>

        <div className="discovery-hero__bento discovery-hero__bento--problem">
          <Flame size={20} />
          <span>
            <small>SEM LEITURA</small>
            <b>Tudo parece urgente</b>
          </span>
        </div>
        <div className="discovery-hero__bento discovery-hero__bento--dream">
          <Sparkles size={20} />
          <span>
            <small>COM CLAREZA</small>
            <b>Uma decisão por vez</b>
          </span>
        </div>
      </section>

      <div className="discovery-marquee">
        <CapabilityMarquee />
      </div>
      <Journey
        onReveal={setProfile}
        onCreate={(nextProfile) => {
          setProfile(nextProfile);
          createWithProfile(nextProfile);
        }}
      />
      <SolutionConstellation activeId={activeId} />
      <VisualStoryStack />
      <FutureSlider
        onCreate={() => {
          if (!activeId) {
            scrollToJourney();
            return;
          }
          createWithProfile();
        }}
      />
      <footer className="discovery-footer">
        <ImmersiveBrandMark />
        <span>Uma operação viva começa por um sinal claro.</span>
        <button type="button" onClick={() => onAccess("login")}>
          Já tenho uma operação <ArrowRight size={15} />
        </button>
      </footer>
    </div>
  );
}
