import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { Activity, ChefHat, CircleDollarSign, PackageCheck, PlugZap, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";

const routeNames: Array<[string, string]> = [
  ["connections", "Conexões vivas"],
  ["delivery", "Delivery em movimento"],
  ["today", "Pulso de hoje"],
  ["cash", "Dinheiro em fluxo"],
  ["crm", "Relacionamentos"],
  ["kitchen", "Cozinha em tempo real"],
  ["cmv", "CMV inteligente"],
  ["purchases", "Compras 360"],
  ["suppliers", "Rede de fornecedores"],
  ["autopilot", "Autopilot 360"],
];

function currentSurface() {
  const params = new URLSearchParams(window.location.search);
  const found = routeNames.find(([key]) => params.get(key) === "1");
  return found?.[1] || "Operação viva";
}

/**
 * Pure experience layer: no business writes, no provider calls, no app state ownership.
 * It adds depth, light and motion around the existing operational surfaces without
 * changing their semantic DOM or interaction contracts.
 */
export function ExperienceOrchestratorV74() {
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, mass: 0.18 });
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const auraX = useTransform(pointerX, [0, 1], reduced ? [0, 0] : [-28, 28]);
  const auraY = useTransform(pointerY, [0, 1], reduced ? [0, 0] : [-22, 22]);
  const surface = useMemo(currentSurface, []);

  useEffect(() => {
    document.documentElement.dataset.c360Experience = "v74";
    if (reduced) return () => delete document.documentElement.dataset.c360Experience;
    const move = (event: PointerEvent) => {
      pointerX.set(Math.min(1, Math.max(0, event.clientX / Math.max(window.innerWidth, 1))));
      pointerY.set(Math.min(1, Math.max(0, event.clientY / Math.max(window.innerHeight, 1))));
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      delete document.documentElement.dataset.c360Experience;
    };
  }, [pointerX, pointerY, reduced]);

  return (
    <div className="x74-atmosphere" aria-hidden="true" data-experience-v74>
      <motion.div className="x74-aura x74-aura--mint" style={{ x: auraX, y: auraY }} />
      <motion.div className="x74-aura x74-aura--violet" style={{ x: auraY, y: auraX }} />
      <div className="x74-grid" />
      <motion.div className="x74-scroll-progress" style={{ scaleX: progress }} />
      <div className="x74-pulse-rail">
        <div className="x74-pulse-dot"><Activity size={13} /></div>
        <strong>{surface}</strong>
        <div className="x74-marquee-clip">
          <motion.div
            className="x74-marquee"
            animate={reduced ? undefined : { x: ["0%", "-50%"] }}
            transition={reduced ? undefined : { duration: 24, repeat: Infinity, ease: "linear" }}
          >
            {[0, 1].map((copy) => (
              <div className="x74-marquee-set" key={copy}>
                <span><PlugZap size={11} /> CONECTAR</span>
                <span><PackageCheck size={11} /> PRODUZIR</span>
                <span><ChefHat size={11} /> ENTREGAR</span>
                <span><CircleDollarSign size={11} /> MARGEM</span>
                <span><Sparkles size={11} /> APRENDER</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
