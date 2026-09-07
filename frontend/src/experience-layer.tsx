import React, { useEffect, useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Activity,
  ChefHat,
  CircleDollarSign,
  RadioTower,
  ShoppingBag,
} from "lucide-react";

const capabilityItems = [
  "PEDIDOS OMNICANAL",
  "CMV EM TEMPO REAL",
  "KDS COM SLA",
  "ESTOQUE PREDITIVO",
  "DELIVERY PRÓPRIO",
  "CRM DE RECOMPRA",
];

export function ExperienceLayer() {
  const reduceMotion = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.32,
  });
  const auraOneY = useTransform(
    scrollYProgress,
    [0, 1],
    ["0vh", reduceMotion ? "0vh" : "24vh"],
  );
  const auraTwoY = useTransform(
    scrollYProgress,
    [0, 1],
    ["0vh", reduceMotion ? "0vh" : "-18vh"],
  );

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="experience-progress fixed inset-x-0 top-0 z-[100] h-[2px] origin-left"
        style={{ scaleX: progress }}
      />
      <div
        aria-hidden="true"
        className="experience-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <motion.div
          className="experience-aura experience-aura--gold"
          style={{ y: auraOneY }}
        />
        <motion.div
          className="experience-aura experience-aura--violet"
          style={{ y: auraTwoY }}
        />
        <div className="experience-grid-lines" />
      </div>
    </>
  );
}

export function CapabilityMarquee() {
  const items = capabilityItems.concat(capabilityItems);
  return (
    <div
      className="capability-marquee relative overflow-hidden rounded-full border border-white/8 bg-white/[0.035] py-2.5 backdrop-blur-xl"
      aria-label="Recursos do sistema"
      role="group"
    >
      <span className="sr-only">{capabilityItems.join(", ")}</span>
      <div
        className="capability-marquee__track flex w-max items-center gap-3 whitespace-nowrap"
        aria-hidden="true"
      >
        {items.map((item, index) => (
          <React.Fragment key={item + "-" + index}>
            <span className="text-[0.7rem] font-extrabold tracking-[0.16em] text-white/55">
              {item}
            </span>
            <i className="size-1 rounded-full bg-c360-gold shadow-[0_0_14px_rgba(255,189,89,.9)]" />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

type KitchenOrbProps = { compact?: boolean; className?: string };

export function KitchenOrb({
  compact = false,
  className = "",
}: KitchenOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let disposed = false;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    let cleanupScene = () => {};
    let sceneStarted = false;
    let nearViewport = !("IntersectionObserver" in window);
    let syncSceneVisibility: (() => void) | undefined;

    const startScene = () => {
      if (sceneStarted || disposed) return;
      sceneStarted = true;
      void import("three")
        .then((THREE) => {
          if (disposed) return;

          const smallViewport = window.matchMedia("(max-width: 760px)").matches;
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
          camera.position.set(0, 0, compact ? 5.5 : 5);
          const renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: !smallViewport,
            powerPreference: "high-performance",
          });
          renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, smallViewport ? 1.2 : 1.6),
          );
          renderer.outputColorSpace = THREE.SRGBColorSpace;

          const group = new THREE.Group();
          scene.add(group);
          const core = new THREE.Mesh(
            new THREE.IcosahedronGeometry(
              compact ? 1.03 : 1.15,
              smallViewport ? 3 : 5,
            ),
            new THREE.MeshPhysicalMaterial({
              color: 0x151d2b,
              emissive: 0x2b173d,
              emissiveIntensity: 0.55,
              metalness: 0.82,
              roughness: 0.18,
              clearcoat: 1,
              clearcoatRoughness: 0.14,
            }),
          );
          group.add(core);
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(
              compact ? 1.5 : 1.68,
              0.018,
              12,
              smallViewport ? 90 : 150,
            ),
            new THREE.MeshBasicMaterial({
              color: 0xffbd59,
              transparent: true,
              opacity: 0.9,
            }),
          );
          ring.rotation.set(1.1, 0.15, 0.3);
          group.add(ring);
          const ringTwo = new THREE.Mesh(
            new THREE.TorusGeometry(
              compact ? 1.28 : 1.43,
              0.01,
              10,
              smallViewport ? 72 : 120,
            ),
            new THREE.MeshBasicMaterial({
              color: 0x6ee7c7,
              transparent: true,
              opacity: 0.58,
            }),
          );
          ringTwo.rotation.set(0.4, 1.1, -0.4);
          group.add(ringTwo);

          const pointsGeometry = new THREE.BufferGeometry();
          const pointCount = smallViewport ? 64 : compact ? 90 : 150;
          const positions = new Float32Array(pointCount * 3);
          for (let i = 0; i < pointCount; i += 1) {
            const radius = 1.85 + Math.random() * 0.72;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);
          }
          pointsGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3),
          );
          const points = new THREE.Points(
            pointsGeometry,
            new THREE.PointsMaterial({
              color: 0xffffff,
              size: compact ? 0.018 : 0.022,
              transparent: true,
              opacity: 0.46,
            }),
          );
          group.add(points);
          scene.add(new THREE.AmbientLight(0x9f7aea, 1.25));
          const key = new THREE.PointLight(0xffbd59, 18, 12);
          key.position.set(3, 2, 4);
          scene.add(key);
          const fill = new THREE.PointLight(0x6ee7c7, 10, 10);
          fill.position.set(-3, -2, 3);
          scene.add(fill);

          const pointer = { x: 0, y: 0 };
          const onPointerMove = (event: PointerEvent) => {
            const rect = host.getBoundingClientRect();
            pointer.x =
              ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) *
              0.7;
            pointer.y =
              ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) *
              0.55;
          };
          if (!reduceMotion)
            host.addEventListener("pointermove", onPointerMove, { passive: true });

          const resize = () => {
            const width = Math.max(host.clientWidth, 1);
            const height = Math.max(host.clientHeight, 1);
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            if (reduceMotion) renderer.render(scene, camera);
          };
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(host);
          resize();

          const startedAt = performance.now();
          let running = false;
          const render = (now: number) => {
            if (disposed || !running) return;
            const elapsed = (now - startedAt) / 1000;
            group.rotation.y += (pointer.x - group.rotation.y) * 0.025;
            group.rotation.x += (-pointer.y - group.rotation.x) * 0.025;
            core.rotation.y = elapsed * 0.16;
            core.rotation.z = elapsed * 0.08;
            ring.rotation.z = 0.3 + elapsed * 0.13;
            ringTwo.rotation.x = 0.4 - elapsed * 0.1;
            points.rotation.y = -elapsed * 0.045;
            renderer.render(scene, camera);
            animationFrame = window.requestAnimationFrame(render);
          };
          const syncAnimation = () => {
            if (reduceMotion) {
              running = false;
              window.cancelAnimationFrame(animationFrame);
              renderer.render(scene, camera);
              return;
            }
            const shouldRun =
              nearViewport && document.visibilityState === "visible";
            if (shouldRun && !running) {
              running = true;
              animationFrame = window.requestAnimationFrame(render);
            } else if (!shouldRun && running) {
              running = false;
              window.cancelAnimationFrame(animationFrame);
            }
          };
          const onVisibilityChange = () => syncAnimation();
          document.addEventListener("visibilitychange", onVisibilityChange);
          syncSceneVisibility = syncAnimation;
          syncAnimation();

          cleanupScene = () => {
            running = false;
            document.removeEventListener("visibilitychange", onVisibilityChange);
            host.removeEventListener("pointermove", onPointerMove);
            resizeObserver?.disconnect();
            window.cancelAnimationFrame(animationFrame);
            core.geometry.dispose();
            core.material.dispose();
            ring.geometry.dispose();
            ring.material.dispose();
            ringTwo.geometry.dispose();
            ringTwo.material.dispose();
            pointsGeometry.dispose();
            points.material.dispose();
            renderer.dispose();
          };
        })
        .catch(() => {
          if (!disposed) host.classList.add("kitchen-orb--fallback");
        });
    };

    if ("IntersectionObserver" in window) {
      intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          nearViewport = entry.isIntersecting;
          if (nearViewport) startScene();
          syncSceneVisibility?.();
        },
        { rootMargin: "180px 0px" },
      );
      intersectionObserver.observe(host);
    } else {
      startScene();
    }

    return () => {
      disposed = true;
      intersectionObserver?.disconnect();
      host.classList.remove("kitchen-orb--fallback");
      cleanupScene();
    };
  }, [compact, reduceMotion]);

  return (
    <div
      ref={hostRef}
      className={
        "kitchen-orb relative isolate min-h-[250px] overflow-hidden " +
        className
      }
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-[0.68rem] font-bold tracking-[0.14em] text-white/65 backdrop-blur-xl">
        <span className="flex items-center gap-2">
          <i
            className={
              "size-1.5 rounded-full bg-c360-mint shadow-[0_0_12px_rgba(110,231,199,.95)] " +
              (reduceMotion ? "" : "animate-pulse")
            }
          />
          NÚCLEO 360
        </span>
        <span>{reduceMotion ? "ESTÁTICO" : "INTERATIVO"}</span>
      </div>
    </div>
  );
}

function RevealWord({
  progress,
  index,
  total,
  word,
}: {
  progress: MotionValue<number>;
  index: number;
  total: number;
  word: string;
}) {
  const start = Math.max(0, index / total - 0.08);
  const end = Math.min(1, start + 0.28);
  const opacity = useTransform(progress, [start, end], [0.2, 1]);
  const y = useTransform(progress, [start, end], [8, 0]);
  return (
    <motion.span style={{ opacity, y }} className="inline-block">
      {word}&nbsp;
    </motion.span>
  );
}

export function ScrollRevealText({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 92%", "end 44%"],
  });
  const words = children.split(" ");

  if (reduceMotion) {
    return <p className={"scroll-reveal-text " + className}>{children}</p>;
  }

  return (
    <p ref={ref} className={"scroll-reveal-text " + className}>
      {words.map((word, index) => (
        <RevealWord
          key={word + "-" + index}
          progress={scrollYProgress}
          index={index}
          total={words.length}
          word={word}
        />
      ))}
    </p>
  );
}

export function StickyCapabilityStack() {
  const reduceMotion = Boolean(useReducedMotion());
  const cards = [
    {
      icon: <ShoppingBag />,
      step: "01",
      title: "Venda entra organizada",
      text: "WhatsApp, loja própria e balcão convergem no mesmo fluxo operacional.",
      tone: "gold",
    },
    {
      icon: <Activity />,
      step: "02",
      title: "A cozinha reage",
      text: "SLA, lote e estoque deixam claro o que produzir e o que precisa de atenção.",
      tone: "mint",
    },
    {
      icon: <CircleDollarSign />,
      step: "03",
      title: "A margem decide",
      text: "Cada canal revela receita, custo variável, taxa e contribuição real.",
      tone: "violet",
    },
  ];
  return (
    <div className="sticky-stack mt-8 grid gap-4">
      {cards.map((card, index) => (
        <motion.article
          key={card.step}
          className={
            "sticky-stack__card sticky-stack__card--" +
            card.tone +
            " sticky overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl"
          }
          style={{ top: 1.5 + index + "rem" }}
          initial={
            reduceMotion ? false : { opacity: 0.45, y: 44, scale: 0.94 }
          }
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          viewport={{ amount: 0.35, once: true }}
          transition={{ type: "spring", stiffness: 160, damping: 24 }}
        >
          <div className="flex items-start justify-between gap-5">
            <div className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-black/25">
              {card.icon}
            </div>
            <span className="text-xs font-black tracking-[0.2em] text-white/35">
              {card.step}
            </span>
          </div>
          <h3 className="mt-12 max-w-[13ch] text-2xl font-black tracking-[-0.04em] text-white">
            {card.title}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/55">
            {card.text}
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs font-extrabold tracking-[0.12em] text-white/65">
            CAMADA INTEGRADA <Activity size={14} />
          </div>
        </motion.article>
      ))}
    </div>
  );
}

export function SystemStatusPill({
  label = "OPERAÇÃO CONECTADA",
}: {
  label?: string;
}) {
  return (
    <span className="system-status-pill inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-1.5 text-[0.66rem] font-black tracking-[0.14em] text-emerald-200/80 backdrop-blur-xl">
      <RadioTower size={13} /> {label}
    </span>
  );
}

export function ImmersiveBrandMark() {
  return (
    <div className="brand brand-immersive flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-c360-gold shadow-[0_0_40px_rgba(255,189,89,.16)] backdrop-blur-xl">
        <ChefHat size={23} />
      </span>
      <span className="grid leading-none">
        <strong className="text-sm font-black tracking-[0.14em] text-white">
          COZINHA 360
        </strong>
        <small className="mt-1 text-[0.57rem] font-bold tracking-[0.22em] text-white/35">
          GBD APPLIED
        </small>
      </span>
    </div>
  );
}