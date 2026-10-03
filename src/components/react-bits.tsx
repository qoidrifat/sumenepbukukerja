/*
 * React Bits adaptations for Sumenep Buku Kerja.
 *
 * Upstream: https://reactbits.dev
 * Source: https://github.com/DavidHDev/react-bits
 * Adapted components: BlurText, ShinyText, AnimatedList, AnimatedContent,
 * GlassSurface, BorderGlow, Counter, ScrollReveal, ScrollProgress,
 * GlareHover, and GlassIcons.
 *
 * MIT + Commons Clause License Condition v1.0
 * Copyright (c) 2026 David Haz
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, and distribute the Software as part of
 * an application, website, or product, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * Commons Clause Restriction: Components may be used in a product, but may not
 * be sold, sublicensed, or redistributed as a standalone component library.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 */

import {
  animate as motionAnimate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* BlurText --------------------------------------------------------------- */

export interface BlurTextProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  onAnimationComplete?: () => void;
}

/**
 * A reduced-motion-safe adaptation of React Bits BlurText. Words remain real
 * text in the accessibility tree while the visual spans animate independently.
 */
export function BlurText({
  text,
  as = "p",
  delay = 45,
  className,
  animateBy = "words",
  direction = "top",
  threshold = 0.15,
  onAnimationComplete,
}: BlurTextProps) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: threshold });
  const reduceMotion = useReducedMotion() ?? false;
  const Tag = as;
  const elements = animateBy === "words" ? text.split(" ") : Array.from(text);
  const from = {
    opacity: 0,
    filter: "blur(10px)",
    y: direction === "top" ? -28 : 28,
  };
  const to = { opacity: 1, filter: "blur(0px)", y: 0 };
  const visible = reduceMotion || inView;

  return (
    <Tag
      ref={ref as never}
      aria-label={text}
      className={cn("flex flex-wrap", className)}
    >
      {elements.map((segment, index) => (
        <motion.span
          key={`${segment}-${index}`}
          aria-hidden="true"
          initial={from}
          animate={visible ? to : from}
          transition={{
            duration: reduceMotion ? 0 : 0.48,
            delay: reduceMotion ? 0 : (index * delay) / 1000,
            ease: [0.22, 1, 0.36, 1],
          }}
          onAnimationComplete={
            index === elements.length - 1 ? onAnimationComplete : undefined
          }
          className="inline-block will-change-transform"
        >
          {segment === " " ? "\u00a0" : segment}
          {animateBy === "words" && index < elements.length - 1 ? "\u00a0" : ""}
        </motion.span>
      ))}
    </Tag>
  );
}

/* ShinyText -------------------------------------------------------------- */

export interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: "left" | "right";
  delay?: number;
}

/** A small, CSS-token-friendly adaptation of React Bits ShinyText. */
export function ShinyText({
  text,
  disabled = false,
  speed = 3.2,
  className,
  color = "#1d4ed8",
  shineColor = "#93c5fd",
  spread = 110,
  yoyo = true,
  pauseOnHover = false,
  direction = "left",
  delay = 0,
}: ShinyTextProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [paused, setPaused] = useState(false);
  const progress = useMotionValue(direction === "left" ? 0 : 100);
  const backgroundPosition = useTransform(
    progress,
    (value) => `${150 - value * 2}% center`,
  );

  useEffect(() => {
    if (disabled || reduceMotion || paused) return;
    const controls = motionAnimate(
      progress,
      direction === "left" ? [0, 100] : [100, 0],
      {
        duration: speed,
        delay,
        repeat: Infinity,
        repeatType: yoyo ? "reverse" : "loop",
        ease: "linear",
      },
    );
    return () => controls.stop();
  }, [delay, direction, disabled, paused, progress, reduceMotion, speed, yoyo]);

  const style = reduceMotion
    ? { color, WebkitTextFillColor: color }
    : {
        backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
        backgroundSize: "200% auto",
        backgroundPosition: disabled ? "50% center" : backgroundPosition,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
      };

  return (
    <motion.span
      className={cn("inline-block", className)}
      style={style}
      onMouseEnter={pauseOnHover ? () => setPaused(true) : undefined}
      onMouseLeave={pauseOnHover ? () => setPaused(false) : undefined}
    >
      {text}
    </motion.span>
  );
}

/* AnimatedList ----------------------------------------------------------- */

export interface AnimatedListProps {
  items: ReactNode[];
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
  itemDelay?: number;
  showGradients?: boolean;
}

/** A data-friendly adaptation that does not steal global keyboard focus. */
export function AnimatedList({
  items,
  className,
  itemClassName,
  ariaLabel,
  itemDelay = 35,
  showGradients = false,
}: AnimatedListProps) {
  return (
    <div className={cn("relative", className)} aria-label={ariaLabel}>
      {items.map((item, index) => (
        <AnimatedListItem key={index} index={index} delay={itemDelay} className={itemClassName}>
          {item}
        </AnimatedListItem>
      ))}
      {showGradients ? (
        <>
          <span className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/90 to-transparent" aria-hidden="true" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/90 to-transparent" aria-hidden="true" />
        </>
      ) : null}
    </div>
  );
}

function AnimatedListItem({
  children,
  index,
  delay,
  className,
}: {
  children: ReactNode;
  index: number;
  delay: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.12 });
  const reduceMotion = useReducedMotion() ?? false;
  const variants: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 14, scale: reduceMotion ? 1 : 0.985 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: reduceMotion ? 0 : 0.28, delay: reduceMotion ? 0 : (index * delay) / 1000 },
    },
  };

  return (
    <motion.div ref={ref} className={className} variants={variants} initial="hidden" animate={inView || reduceMotion ? "visible" : "hidden"}>
      {children}
    </motion.div>
  );
}

/* GlassSurface ----------------------------------------------------------- */

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  borderRadius?: number;
  blur?: number;
  opacity?: number;
  saturation?: number;
  tint?: "light" | "blue" | "dark";
}

/**
 * CSS-only adaptation of React Bits GlassSurface. It keeps the glass treatment
 * fast and works in browsers without SVG displacement filters.
 */
export function GlassSurface({
  children,
  className,
  style,
  borderRadius = 24,
  blur = 18,
  opacity = 0.76,
  saturation = 1.15,
  tint = "light",
  ...props
}: GlassSurfaceProps) {
  const backgroundOpacity = Math.max(0, Math.min(opacity, 1));
  const backgrounds = {
    light: `rgba(255,255,255,${backgroundOpacity})`,
    blue: `rgba(239,246,255,${Math.min(1, backgroundOpacity + 0.06)})`,
    dark: `rgba(15,23,42,${Math.min(1, backgroundOpacity + 0.02)})`,
  };
  const borders = {
    light: "rgba(255,255,255,.82)",
    blue: "rgba(147,197,253,.72)",
    dark: "rgba(148,163,184,.28)",
  };

  return (
    <div
      {...props}
      className={cn("relative isolate overflow-hidden", className)}
      style={{
        borderRadius,
        background: backgrounds[tint],
        border: `1px solid ${borders[tint]}`,
        boxShadow:
          tint === "dark"
            ? "inset 0 1px 0 rgba(255,255,255,.12), 0 18px 50px rgba(15,23,42,.16)"
            : "inset 0 1px 0 rgba(255,255,255,.9), 0 18px 50px rgba(30,64,175,.08)",
        backdropFilter: `blur(${blur}px) saturate(${saturation})`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(${saturation})`,
        ...style,
      }}
    >
      <span
        className="pointer-events-none absolute -inset-16 opacity-60"
        style={{ background: "radial-gradient(circle at 20% 10%, rgba(96,165,250,.28), transparent 38%), radial-gradient(circle at 90% 80%, rgba(251,191,36,.16), transparent 34%)" }}
        aria-hidden="true"
      />
      <div className="relative z-10 min-h-full">{children}</div>
    </div>
  );
}

/* BorderGlow -------------------------------------------------------------- */

export interface BorderGlowProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  animated?: boolean;
  intensity?: number;
}

/** Pointer-following border glow inspired by React Bits BorderGlow. */
export function BorderGlow({
  children,
  className,
  glowColor = "37,99,235",
  animated = false,
  intensity = 0.22,
}: BorderGlowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || !ref.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    ref.current.style.setProperty("--glow-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    ref.current.style.setProperty("--glow-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };

  return (
    <div
      ref={ref}
      className={cn("group relative isolate overflow-visible rounded-2xl", className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerMove={handlePointerMove}
      style={{
        "--glow-x": "50%",
        "--glow-y": "50%",
        "--glow-opacity": hovered && !reduceMotion ? 1 : 0,
        background: `radial-gradient(circle at var(--glow-x) var(--glow-y), rgba(${glowColor},${intensity}), transparent 34%), rgba(255,255,255,.92)`,
      } as CSSProperties}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] border border-blue-200/70 transition-opacity duration-300",
          animated && "motion-safe:animate-pulse",
        )}
        style={{ opacity: hovered && !reduceMotion ? 1 : 0 }}
        aria-hidden="true"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* Counter ----------------------------------------------------------------- */

export interface CounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
  fontSize?: number;
}

/** Compact count-up adaptation for real catalog/admin metrics. */
export function Counter({
  value,
  prefix = "",
  suffix = "",
  className,
  duration = 0.9,
  fontSize,
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduceMotion = useReducedMotion() ?? false;
  const motionValue = useMotionValue(reduceMotion ? value : 0);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 24, mass: 0.7 });
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useMotionValueEvent(spring, "change", (latest) => {
    setDisplay(Math.round(latest));
  });

  useEffect(() => {
    if (reduceMotion) {
      motionValue.set(value);
      spring.jump(value);
      return;
    }
    if (!inView) return;
    const controls = motionAnimate(motionValue, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [duration, inView, motionValue, reduceMotion, spring, value]);

  return (
    <span
      ref={ref}
      className={cn("inline-flex tabular-nums", className)}
      style={fontSize ? { fontSize, lineHeight: 1 } : undefined}
      aria-label={`${prefix}${value.toLocaleString("id-ID")}${suffix}`}
    >
      <span aria-hidden="true">{prefix}{display.toLocaleString("id-ID")}{suffix}</span>
    </span>
  );
}

/* ScrollReveal ------------------------------------------------------------ */

export interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
}

/** Framer Motion adaptation of ScrollReveal without the GSAP dependency. */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  distance = 20,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.12 });
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: reduceMotion ? 0 : distance }}
      animate={inView || reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: reduceMotion ? 0 : distance }}
      transition={{ duration: reduceMotion ? 0 : 0.55, delay: reduceMotion ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* AnimatedContent -------------------------------------------------------- */

export interface AnimatedContentProps {
  children: ReactNode;
  className?: string;
  animationKey?: string | number;
  distance?: number;
}

/** Lightweight content transition for search, auth, and saved-state changes. */
export function AnimatedContent({
  children,
  className,
  animationKey,
  distance = 12,
}: AnimatedContentProps) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <motion.div
      key={animationKey}
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: distance, filter: "blur(5px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ScrollProgress --------------------------------------------------------- */

/** A quiet reading-progress cue for the long public directory. */
export function ScrollProgress() {
  const reduceMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.25 });

  if (reduceMotion) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[60] h-1 origin-left bg-blue-600"
      style={{ scaleX }}
    />
  );
}

/* GlareHover ------------------------------------------------------------- */

export interface GlareHoverProps {
  children: ReactNode;
  className?: string;
  glareColor?: string;
  radius?: string;
}

/** Pointer-following sheen for listing surfaces; no canvas or WebGL required. */
export function GlareHover({
  children,
  className,
  glareColor = "37,99,235",
  radius = "22rem",
}: GlareHoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || !ref.current || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    ref.current.style.setProperty("--glare-x", `${event.clientX - rect.left}px`);
    ref.current.style.setProperty("--glare-y", `${event.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={cn("group relative isolate overflow-hidden", className)}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(${radius} circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(${glareColor},.14), transparent 62%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/* GlassIcons ------------------------------------------------------------- */

export interface GlassIconItem {
  icon: ReactNode;
  label: string;
  color?: string;
  onClick?: () => void;
  selected?: boolean;
}

export interface GlassIconsProps {
  items: GlassIconItem[];
  className?: string;
  ariaLabel?: string;
}

const glassIconColors: Record<string, string> = {
  blue: "linear-gradient(135deg, #2563eb, #0ea5e9)",
  emerald: "linear-gradient(135deg, #047857, #10b981)",
  amber: "linear-gradient(135deg, #b45309, #f59e0b)",
  violet: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
  rose: "linear-gradient(135deg, #be123c, #fb7185)",
  slate: "linear-gradient(135deg, #334155, #64748b)",
};

/** Glass icon button adaptation with real labels and 48px touch targets. */
export function GlassIcons({ items, className, ariaLabel }: GlassIconsProps) {
  const reduceMotion = useReducedMotion() ?? false;
  return (
    <div className={cn("flex flex-wrap items-start gap-4", className)} aria-label={ariaLabel}>
      {items.map((item) => (
        <motion.button
          key={item.label}
          type="button"
          onClick={item.onClick}
          aria-label={item.label}
          aria-pressed={item.selected}
          whileHover={reduceMotion ? undefined : { y: -4, rotate: -2 }}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          className={cn(
            "group flex min-h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
            item.selected ? "border-blue-500 bg-blue-50 shadow-md" : "border-slate-200 bg-white shadow-sm hover:border-blue-200",
          )}
        >
          <span
            className="flex size-11 items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-200 group-hover:rotate-3"
            style={{ background: glassIconColors[item.color ?? "blue"] ?? item.color }}
            aria-hidden="true"
          >
            {item.icon}
          </span>
          <span className="line-clamp-2 text-xs font-extrabold leading-4 text-slate-700">{item.label}</span>
        </motion.button>
      ))}
    </div>
  );
}
