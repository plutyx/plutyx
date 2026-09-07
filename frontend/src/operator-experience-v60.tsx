import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { Activity, Orbit, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type RouteMeta = { key: string; label: string; accent: string };

const routes: Array<[string, RouteMeta]> = [
  ["today", { key: "today", label: "HOJE", accent: "emerald" }],
  ["delivery", { key: "delivery", label: "DELIVERY OS", accent: "cyan" }],
  ["quick", { key: "quick", label: "PEDIDO RÁPIDO", accent: "amber" }],
  ["kitchen", { key: "kitchen", label: "COZINHA", accent: "orange" }],
  ["cash", { key: "cash", label: "CAIXA", accent: "emerald" }],
  ["cmv", { key: "cmv", label: "SMART CMV", accent: "violet" }],
  ["purchases", { key: "purchases", label: "COMPRAS", accent: "cyan" }],
  ["suppliers", { key: "suppliers", label: "FORNECEDORES", accent: "amber" }],
  ["margin", { key: "margin", label: "MARGENS", accent: "rose" }],
  ["crm", { key: "crm", label: "CRM", accent: "violet" }],
  ["growth", { key: "growth", label: "GROWTH LAB", accent: "cyan" }],
  ["connections", { key: "connections", label: "CONEXÕES", accent: "cyan" }],
  ["autopilot", { key: "autopilot", label: "AUTOPILOT", accent: "violet" }],
  ["network", { key: "network", label: "NETWORK 360", accent: "emerald" }],
  ["system360", { key: "system360", label: "SISTEMA 360", accent: "amber" }],
  ["control", { key: "control", label: "TORRE DE CONTROLE", accent: "rose" }],
  ["execution", { key: "execution", label: "EXECUÇÃO", accent: "orange" }],
  ["playbook", { key: "playbook", label: "PLAYBOOK", accent: "amber" }],
  ["vitrine", { key: "vitrine", label: "VITRINE", accent: "violet" }],
  ["direct", { key: "direct", label: "VENDA DIRETA", accent: "emerald" }],
  ["setup", { key: "setup", label: "SETUP 360", accent: "cyan" }],
  ["plan", { key: "plan", label: "PLANO", accent: "violet" }],
];

const accentClass: Record<string, string> = {
  emerald: "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,.55)]",
  cyan: "bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,.55)]",
  amber: "bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,.5)]",
  orange: "bg-orange-300 shadow-[0_0_18px_rgba(253,186,116,.5)]",
  violet: "bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,.52)]",
  rose: "bg-rose-300 shadow-[0_0_18px_rgba(253,164,175,.5)]",
};

function routeMeta(): RouteMeta {
  const params = new URLSearchParams(window.location.search);
  for (const [param, meta] of routes) if (params.get(param) === "1") return meta;
  return { key: "operation", label: "OPERAÇÃO 360", accent: "emerald" };
}

function looksOperational() {
  if (localStorage.getItem("c360_token")) return true;
  const params = new URLSearchParams(window.location.search);
  if (routes.some(([param]) => params.get(param) === "1")) return true;
  return Boolean(document.querySelector(".app-shell, main[class*='-shell']"));
}

export function OperatorExperienceLayer() {
  const reduceMotion = Boolean(useReducedMotion());
  const meta = useMemo(routeMeta, []);
  const [active, setActive] = useState(() => looksOperational());
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 28,
    mass: 0.22,
  });
  const auraAY = useTransform(scrollYProgress, [0, 1], ["-6vh", "26vh"]);
  const auraAX = useTransform(scrollYProgress, [0, 1], ["-4vw", "8vw"]);
  const auraBY = useTransform(scrollYProgress, [0, 1], ["18vh", "-12vh"]);
  const auraBX = useTransform(scrollYProgress, [0, 1], ["7vw", "-5vw"]);
  const auraScale = useTransform(scrollYProgress, [0, 0.55, 1], [0.92, 1.08, 0.98]);

  useEffect(() => {
    const sync = () => setActive(looksOperational());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("storage", sync);
    window.addEventListener("c360:auth", sync as EventListener);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", sync);
      window.removeEventListener("c360:auth", sync as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!active) {
      delete document.documentElement.dataset.c360Operator;
      return;
    }
    document.documentElement.dataset.c360Operator = "1";
    document.documentElement.dataset.c360OperatorRoute = meta.key;
    return () => {
      delete document.documentElement.dataset.c360Operator;
      delete document.documentElement.dataset.c360OperatorRoute;
    };
  }, [active, meta.key]);

  if (!active) return null;

  return (
    <div data-operator-experience="v6.0" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      <motion.div
        className="fixed left-0 top-0 z-[90] h-[2px] w-full origin-left bg-[linear-gradient(90deg,rgba(110,231,183,.9),rgba(103,232,249,.82),rgba(196,181,253,.78))] shadow-[0_0_18px_rgba(103,232,249,.22)]"
        style={{ scaleX: reduceMotion ? scrollYProgress : progress }}
      />

      <motion.div
        className="absolute -left-[16rem] top-[2vh] size-[38rem] rounded-full bg-emerald-300/[0.045] blur-[130px]"
        style={reduceMotion ? undefined : { x: auraAX, y: auraAY, scale: auraScale }}
      />
      <motion.div
        className="absolute -right-[17rem] top-[24vh] size-[42rem] rounded-full bg-cyan-300/[0.045] blur-[145px]"
        style={reduceMotion ? undefined : { x: auraBX, y: auraBY }}
      />
      <div className="absolute bottom-[-18rem] left-[30%] size-[36rem] rounded-full bg-violet-300/[0.035] blur-[150px]" />

      <div className="fixed right-4 top-4 z-[92] hidden items-center gap-2 rounded-full border border-white/[0.08] bg-[#090d13]/70 px-3 py-2 text-[0.52rem] font-black tracking-[0.12em] text-white/45 shadow-[inset_0_1px_rgba(255,255,255,.06),0_18px_55px_rgba(0,0,0,.2)] backdrop-blur-2xl lg:flex">
        <Orbit size={12} className="text-white/35" />
        <span>{meta.label}</span>
        <i className={`size-1.5 rounded-full ${accentClass[meta.accent] || accentClass.emerald}`} />
      </div>

      <motion.div
        className="fixed left-[244px] top-[13px] z-[91] hidden items-center gap-2 text-[0.46rem] font-black tracking-[0.14em] text-white/20 xl:flex"
        initial={reduceMotion ? false : { opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <Activity size={11} />
        SISTEMA VIVO
        <Sparkles size={10} className="text-cyan-100/25" />
      </motion.div>
    </div>
  );
}
