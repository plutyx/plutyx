import { motion, useReducedMotion } from "motion/react";
import { Compass, Eye, Map, Radar, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";

type Step = {
  id: string;
  label: string;
  selector: string;
  icon: ComponentType<{ size?: number }>;
};

const steps: Step[] = [
  { id: "perceber", label: "Perceber", selector: ".discovery-hero", icon: Eye },
  {
    id: "explorar",
    label: "Explorar",
    selector: "[data-operational-playground-host] section",
    icon: Radar,
  },
  { id: "mapear", label: "Mapear", selector: "#mapa-da-operacao", icon: Map },
  {
    id: "visualizar",
    label: "Visualizar",
    selector: ".solution-section",
    icon: Sparkles,
  },
  { id: "decidir", label: "Decidir", selector: ".future-section", icon: Compass },
];

export function DiscoveryProgressRail() {
  const reduceMotion = Boolean(useReducedMotion());
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nodes = steps.map((step) => document.querySelector<HTMLElement>(step.selector));
      const viewportLine = window.innerHeight * 0.46;
      let current = 0;
      nodes.forEach((node, index) => {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        if (rect.top <= viewportLine) current = index;
      });
      setActive(current);
      const hero = nodes[0];
      const future = nodes[nodes.length - 1];
      if (!hero) return setVisible(false);
      const heroRect = hero.getBoundingClientRect();
      const futureRect = future?.getBoundingClientRect();
      setVisible(
        heroRect.bottom < window.innerHeight * 0.92 &&
          (!futureRect || futureRect.bottom > window.innerHeight * 0.1),
      );
    };

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  const progress = useMemo(
    () => (active / Math.max(steps.length - 1, 1)) * 100,
    [active],
  );

  function goTo(step: Step) {
    document.querySelector<HTMLElement>(step.selector)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <motion.nav
      aria-label="Progresso da experiência"
      className="pointer-events-none fixed bottom-5 left-1/2 z-[80] w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 md:bottom-auto md:left-5 md:top-1/2 md:w-auto md:translate-x-0 md:-translate-y-1/2"
      initial={false}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 12 }}
      transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 24 }}
      style={{ visibility: visible ? "visible" : "hidden" }}
    >
      <div className="pointer-events-auto relative flex items-center justify-between gap-1 rounded-[1.25rem] border border-white/10 bg-slate-950/65 p-1.5 shadow-[0_24px_70px_rgba(0,0,0,.28)] backdrop-blur-2xl md:flex-col md:rounded-[1.4rem] md:p-2">
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 left-1.5 right-1.5 h-px bg-white/[0.06] md:bottom-2 md:left-1/2 md:right-auto md:top-2 md:h-auto md:w-px md:-translate-x-1/2"
        />
        <motion.span
          aria-hidden="true"
          className="absolute bottom-1.5 left-1.5 h-px bg-gradient-to-r from-amber-200 via-emerald-200 to-violet-300 md:bottom-auto md:left-1/2 md:top-2 md:w-px md:-translate-x-1/2 md:bg-gradient-to-b"
          animate={
            typeof window !== "undefined" && window.innerWidth >= 768
              ? { height: `calc(${progress}% - 1rem)`, width: 1 }
              : { width: `calc(${progress}% - .75rem)`, height: 1 }
          }
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 22 }}
        />
        {steps.map((step, index) => {
          const Icon = step.icon;
          const done = index < active;
          const isActive = index === active;
          return (
            <motion.button
              key={step.id}
              type="button"
              onClick={() => goTo(step)}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Ir para ${step.label}`}
              className={`group relative z-10 grid size-10 place-items-center rounded-[.9rem] border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 md:size-11 ${
                isActive
                  ? "border-emerald-100/25 bg-emerald-100 text-slate-950 shadow-[0_0_34px_rgba(110,231,199,.16)]"
                  : done
                    ? "border-white/10 bg-white/[0.07] text-white/75"
                    : "border-white/[0.07] bg-slate-950/75 text-white/30 hover:text-white/65"
              }`}
              whileHover={reduceMotion ? undefined : { scale: 1.08 }}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Icon size={16} />
              <span className="pointer-events-none absolute bottom-[calc(100%+.5rem)] left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950/90 px-2 py-1 text-[.58rem] font-black tracking-[.08em] text-white/75 shadow-xl backdrop-blur-xl group-hover:block md:bottom-auto md:left-[calc(100%+.65rem)] md:top-1/2 md:translate-x-0 md:-translate-y-1/2">
                {step.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.nav>
  );
}