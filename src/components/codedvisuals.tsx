/*
 * Adapted from the five free visuals in:
 * https://github.com/pixelcave/codedvisuals-free
 *
 * CodedVisuals Free License
 * Copyright (c) pixelcave (https://codedvisuals.com)
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * the Covered Files (defined below) to use, copy, modify, and merge them, and to
 * distribute them as part of a larger work, in personal and commercial projects,
 * subject to the following conditions.
 * 1. Covered Files
 * This license covers 5 files in this repository, and nothing else:
 * src/components/codedvisuals/browser/simple.tsx
 * src/components/codedvisuals/charts/sparkline.tsx
 * src/components/codedvisuals/files/stacked.tsx
 * src/components/codedvisuals/integrations/logo-orbit.tsx
 * src/components/codedvisuals/notifications/bell.tsx
 * Every other file in this repository is outside this license. See section 4.
 * 2. Restriction
 * You may not sell, sublicense, or redistribute the Covered Files, in original
 * or modified form, as a visual, component, template, icon, or UI library of
 * your own, or as part of any product whose primary value is the Covered Files
 * themselves. Using them inside your own site, app, or product is exactly what
 * they are for; repackaging them for others to obtain as components is not.
 * 3. Notice
 * This notice shall be included in all copies or substantial portions of the
 * Covered Files that are distributed on their own or as part of a component
 * collection. You do not need to reproduce it in a compiled site or
 * application that merely uses them.
 * 4. Not covered
 * The demo site in this repository is not covered. Its design, layout, copy,
 * and supporting source, including everything under src/ other than the 5
 * Covered Files, are published so that you can run the previews and read how the
 * visuals are used. All rights to it are reserved. You may not copy, reuse, or
 * adapt the demo site or its design for your own site or product.
 *
 * THE COVERED FILES ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 */

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell as BellIcon,
  Minus,
} from "lucide-react";
import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import {
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";

export type CodedVisualTrigger = "mount" | "inView" | "inViewRepeat";

function useVisualState(
  ref: RefObject<HTMLElement | null>,
  trigger: CodedVisualTrigger,
  reduceMotion: boolean,
) {
  const inViewOnce = useInView(ref, { once: true, amount: 0.35 });
  const inViewRepeat = useInView(ref, { once: false, amount: 0.35 });

  if (reduceMotion) return true;
  if (trigger === "mount") return true;
  return trigger === "inViewRepeat" ? inViewRepeat : inViewOnce;
}

/* Browser / Simple ------------------------------------------------------- */

export interface CodedBrowserProps {
  url?: string;
  animated?: boolean;
  trigger?: CodedVisualTrigger;
  variant?: "landing" | "dashboard";
  fadeOut?: boolean;
  isometric?: boolean;
  gradient?: boolean;
  className?: string;
}

const browserFrameVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const browserContentVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, delay: 0.12 } },
};

export function CodedBrowser({
  url = "codedvisuals.com",
  animated = false,
  trigger = "inView",
  variant = "landing",
  fadeOut = false,
  isometric = false,
  gradient = false,
  className,
}: CodedBrowserProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const active = useVisualState(ref, trigger, reduceMotion);
  const shouldAnimate = animated && !reduceMotion;
  const motionProps = shouldAnimate
    ? { initial: "hidden" as const, animate: active ? "visible" as const : "hidden" as const }
    : {};

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "relative isolate flex size-full items-center justify-center overflow-hidden p-1",
        className,
      )}
    >
      <motion.div
        className={cn(
          "relative w-full max-w-90 rounded-2xl border border-border/60 bg-muted/80 p-1.5 shadow-sm",
          fadeOut &&
            "[mask-image:linear-gradient(to_bottom,black_62%,transparent_100%)]",
        )}
        style={
          !shouldAnimate && isometric
            ? { transform: "rotateX(45deg) rotateZ(-45deg)" }
            : undefined
        }
        variants={shouldAnimate ? browserFrameVariants : undefined}
        {...motionProps}
      >
        {gradient && !fadeOut ? (
          <div className="absolute inset-x-2 bottom-0 h-20 rounded-t-full bg-gradient-to-r from-sky-500/30 via-blue-500/25 to-emerald-500/25 opacity-80 blur-md" />
        ) : null}

        <div className="relative flex flex-col">
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <div className="flex gap-1.5">
              <span className="size-2 rounded-full bg-rose-400" />
              <span className="size-2 rounded-full bg-amber-400" />
              <span className="size-2 rounded-full bg-emerald-400" />
            </div>
            <div className="flex h-6 min-w-40 flex-1 items-center rounded-lg bg-background/90 px-2 ring-1 ring-border/50">
              <span className="truncate text-[10px] font-semibold text-muted-foreground">{url}</span>
            </div>
            <span className="flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border/50">
              <ArrowRight className="size-3" />
            </span>
          </div>

          <motion.div
            className="h-60 rounded-xl border bg-background p-3"
            variants={shouldAnimate ? browserContentVariants : undefined}
            {...motionProps}
          >
            {variant === "landing" ? (
              <div className="mx-auto flex h-full w-full max-w-64 flex-col gap-3">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="size-7 rounded-lg bg-primary" />
                    <span className="h-1.5 w-14 rounded-full bg-muted-foreground/25" />
                  </div>
                  <span className="h-7 w-16 rounded-lg bg-primary" />
                </div>
                <div className="flex flex-col items-center gap-2 pt-2 text-center">
                  <span className="h-2 w-3/5 rounded-full bg-muted-foreground/30" />
                  <span className="h-1.5 w-2/5 rounded-full bg-muted-foreground/15" />
                  <span className="h-1.5 w-1/3 rounded-full bg-muted-foreground/15" />
                  <div className="mt-2 flex gap-2">
                    <span className="flex h-8 w-20 items-center justify-center rounded-lg bg-primary text-[9px] font-bold text-primary-foreground">Cari jasa</span>
                    <span className="h-8 w-20 rounded-lg border border-border bg-card" />
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="flex min-h-14 flex-col gap-1.5 rounded-lg border border-border/50 bg-muted/60 p-2">
                      <span className="size-2 rounded-full bg-primary/60" />
                      <span className="h-1 w-4/5 rounded-full bg-muted-foreground/25" />
                      <span className="h-1 w-3/5 rounded-full bg-muted-foreground/15" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full gap-2">
                <div className="flex w-10 flex-col gap-2 border-r border-border/70 pr-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <span key={index} className={cn("h-1.5 rounded-full", index === 0 ? "bg-primary" : "bg-muted-foreground/15")} />
                  ))}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="rounded-lg border border-border/50 bg-muted/50 p-2">
                        <span className="block h-1 w-3/5 rounded-full bg-muted-foreground/20" />
                        <span className="mt-1.5 block h-2 w-4/5 rounded-full bg-muted-foreground/30" />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-1 items-end gap-1 rounded-lg bg-muted/50 p-2">
                    {[35, 58, 42, 75, 54, 68, 47, 82, 61, 38].map((height, index) => (
                      <span key={index} className="flex-1 rounded-sm bg-chart-3" style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

/* Files / Stacked -------------------------------------------------------- */

const fileCategories = {
  default: "border-primary bg-primary text-primary-foreground",
  documents: "border-blue-800/20 bg-blue-600 text-white",
  spreadsheets: "border-emerald-800/20 bg-emerald-600 text-white",
  images: "border-violet-800/20 bg-violet-600 text-white",
  design: "border-cyan-800/20 bg-cyan-700 text-white",
  code: "border-amber-800/20 bg-amber-600 text-white",
  fonts: "border-indigo-800/20 bg-indigo-600 text-white",
  media: "border-rose-800/20 bg-rose-600 text-white",
  video: "border-red-800/20 bg-red-700 text-white",
  audio: "border-pink-800/20 bg-pink-600 text-white",
  archives: "border-amber-900/20 bg-amber-700 text-white",
  mixed: "border-slate-800/20 bg-slate-700 text-white",
} as const;

export type CodedFileCategory = keyof typeof fileCategories;

export interface CodedStackedProps {
  category?: CodedFileCategory;
  label?: string;
  count?: 3 | 5 | 7 | 9;
  animated?: boolean;
  trigger?: CodedVisualTrigger;
  className?: string;
}

const stackedContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const stackedFanVariants: Variants = {
  hidden: { rotate: 0, opacity: 0 },
  visible: (angle: number) => ({
    rotate: angle,
    opacity: 1,
    transition: { type: "spring", stiffness: 260, damping: 20 },
  }),
};

const stackedBadgeVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 420, damping: 16 } },
};

const fanSpreads: Record<number, number> = { 3: 36, 5: 46, 7: 60, 9: 76 };

function buildFan(count: number) {
  const spread = fanSpreads[count] ?? 46;
  const half = (count - 1) / 2;
  const step = count > 1 ? spread / (count - 1) : 0;
  const angles = Array.from({ length: count }, (_, index) => (index - half) * step);
  const frontIndex = Math.floor(count / 2);
  const zIndices = angles.map((_, index) => frontIndex - Math.abs(index - frontIndex) + 1);
  return { angles, zIndices, frontIndex };
}

function FileLine({ width }: { width: number }) {
  return <span className="block h-1 rounded-full bg-muted-foreground/20" style={{ width: `${width}%` }} />;
}

function DocumentIllustration() {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="h-2 w-2/3 rounded-full bg-primary/30" />
      <FileLine width={90} />
      <FileLine width={72} />
      <FileLine width={88} />
      <FileLine width={64} />
      <FileLine width={80} />
    </div>
  );
}

function SpreadsheetIllustration() {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: 15 }).map((_, index) => (
        <span key={index} className={cn("h-2.5 rounded-sm", index < 3 ? "bg-emerald-500/40" : "bg-muted-foreground/15")} />
      ))}
    </div>
  );
}

function MixedIllustration() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <span className="size-3 rounded-sm bg-sky-500/60" />
        <span className="size-3 rounded-full bg-emerald-500/60" />
        <span className="size-3 rounded-sm bg-amber-500/60" />
      </div>
      <FileLine width={92} />
      <FileLine width={72} />
      <FileLine width={84} />
    </div>
  );
}

const fileIllustrations: Record<CodedFileCategory, () => ReactNode> = {
  default: DocumentIllustration,
  documents: DocumentIllustration,
  spreadsheets: SpreadsheetIllustration,
  images: MixedIllustration,
  design: MixedIllustration,
  code: DocumentIllustration,
  fonts: MixedIllustration,
  media: MixedIllustration,
  video: MixedIllustration,
  audio: MixedIllustration,
  archives: SpreadsheetIllustration,
  mixed: MixedIllustration,
};

export function CodedStacked({
  category = "mixed",
  label,
  count = 5,
  animated = false,
  trigger = "inView",
  className,
}: CodedStackedProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const active = useVisualState(ref, trigger, reduceMotion);
  const shouldAnimate = animated && !reduceMotion;
  const { angles, zIndices, frontIndex } = buildFan(count);
  const Illustration = fileIllustrations[category];
  const motionProps = shouldAnimate
    ? { initial: "hidden" as const, animate: active ? "visible" as const : "hidden" as const }
    : {};

  return (
    <div ref={ref} aria-hidden="true" className={cn("relative isolate flex size-full items-center justify-center overflow-hidden p-1", className)}>
      <motion.div className="relative" variants={shouldAnimate ? stackedContainerVariants : undefined} {...motionProps}>
        {angles.map((angle, index) => (
          <motion.div
            key={index}
            className={index > 0 ? "absolute left-0 top-0" : "relative"}
            style={{
              transformOrigin: "bottom center",
              zIndex: zIndices[index],
              ...(!shouldAnimate ? { transform: `rotate(${angle}deg)` } : {}),
            }}
            custom={angle}
            variants={shouldAnimate ? stackedFanVariants : undefined}
            {...motionProps}
          >
            <div className={cn("flex flex-col rounded-lg rounded-tr-xl border p-1 shadow-xs", index === frontIndex ? "border-border bg-muted" : "border-border/60 bg-muted/60")}>
              <div className={cn("flex h-20 w-14 flex-col rounded-md rounded-tr-lg p-2 shadow-sm ring-1 ring-border/50", index === frontIndex ? "bg-card" : "bg-card/80")}>
                {index === frontIndex ? <Illustration /> : null}
              </div>
            </div>
          </motion.div>
        ))}
        <motion.div className={cn("absolute -bottom-3 left-1/2 z-10 max-w-36 -translate-x-1/2 truncate rounded-lg border px-2 py-1 text-xs font-semibold shadow-sm", fileCategories[category])} variants={shouldAnimate ? stackedBadgeVariants : undefined} {...motionProps}>
          {label ?? `${count} listing`}
        </motion.div>
      </motion.div>
    </div>
  );
}

/* Charts / Sparkline ----------------------------------------------------- */

const chartWidth = 96;
const chartHeight = 36;
const defaultPoints = [0.3, 0.42, 0.28, 0.5, 0.45, 0.62, 0.55, 0.78];

function getCoordinates(points: number[]): Array<[number, number]> {
  const step = chartWidth / Math.max(1, points.length - 1);
  return points.map((value, index) => [index * step, 3 + (1 - value) * (chartHeight - 6)] as [number, number]);
}

function buildSmoothPath(coordinates: Array<[number, number]>) {
  if (coordinates.length < 2) return "";
  let path = `M ${coordinates[0][0]},${coordinates[0][1]}`;
  for (let index = 1; index < coordinates.length; index += 1) {
    const [x, y] = coordinates[index];
    const [previousX, previousY] = coordinates[index - 1];
    const controlX = (previousX + x) / 2;
    path += ` C ${controlX},${previousY} ${controlX},${y} ${x},${y}`;
  }
  return path;
}

export interface CodedSparklineProps {
  title?: string;
  value?: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  points?: number[];
  animated?: boolean;
  trigger?: CodedVisualTrigger;
  gradient?: boolean;
  className?: string;
}

const sparkCardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const sparkLineVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1, transition: { pathLength: { duration: 0.8 }, opacity: { duration: 0.15 } } },
};

export function CodedSparkline({
  title = "Katalog aktif",
  value = "0",
  change,
  trend = "neutral",
  points = defaultPoints,
  animated = false,
  trigger = "inView",
  gradient = true,
  className,
}: CodedSparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const active = useVisualState(ref, trigger, reduceMotion);
  const shouldAnimate = animated && !reduceMotion;
  const fillId = useId().replace(/:/g, "");
  const safePoints = points.length > 1
    ? points.map((point) => Number.isFinite(point) ? Math.min(1, Math.max(0, point)) : 0)
    : defaultPoints;
  const coordinates = getCoordinates(safePoints);
  const linePath = buildSmoothPath(coordinates);
  const areaPath = `${linePath} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`;
  const lastPoint = coordinates[coordinates.length - 1];
  const TrendIcon = trend === "down" ? ArrowDownRight : trend === "up" ? ArrowUpRight : Minus;
  const motionProps = shouldAnimate
    ? { initial: "hidden" as const, animate: active ? "visible" as const : "hidden" as const }
    : {};

  return (
    <div ref={ref} role="img" aria-label={`${title}: ${value}${change ? `, ${change}` : ""}`} className={cn("relative isolate flex size-full items-center justify-center overflow-hidden p-1", className)}>
      <motion.div className="relative w-full max-w-80" variants={shouldAnimate ? sparkCardVariants : undefined} {...motionProps}>
        {gradient ? <div className="absolute inset-x-3 -bottom-1 h-16 rounded-full bg-gradient-to-r from-sky-500/25 via-blue-500/20 to-emerald-500/20 blur-md" /> : null}
        <div className="relative flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-xs font-semibold text-muted-foreground">{title}</span>
            <span className="text-xl font-black tracking-tight text-foreground tabular-nums">{value}</span>
            {change ? (
              <span className={cn(
                "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset",
                trend === "down"
                  ? "bg-red-500/10 text-red-700 ring-red-500/20"
                  : trend === "up"
                    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                    : "bg-blue-500/10 text-blue-700 ring-blue-500/20",
              )}>
                <TrendIcon className="size-3" />{change}
              </span>
            ) : null}
          </div>
          <div className="relative shrink-0">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="block h-12 w-24" aria-hidden="true">
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill={`url(#${fillId})`} />
              <motion.path d={linePath} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" variants={shouldAnimate ? sparkLineVariants : undefined} {...motionProps} />
            </svg>
            <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-chart-1 shadow-sm" style={{ left: `${(lastPoint[0] / chartWidth) * 100}%`, top: `${(lastPoint[1] / chartHeight) * 100}%` }} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* Integrations / Logo Orbit --------------------------------------------- */

export interface CodedLogoOrbitProps {
  outerLogos?: ReactNode[];
  innerLogos?: ReactNode[];
  outerRadius?: number;
  innerRadius?: number;
  logo?: ReactNode | null;
  animated?: boolean;
  trigger?: CodedVisualTrigger;
  hover?: boolean;
  orbit?: boolean;
  className?: string;
}

function polar(angle: number, radius: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
}

const logoFrameVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
};

const logoItemVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (delay: number) => ({ scale: 1, opacity: 1, transition: { type: "spring", stiffness: 380, damping: 18, delay } }),
};

const defaultOrbitNode = <span className="size-3 rounded-full bg-primary/50" />;

export function CodedLogoOrbit({
  outerLogos = [defaultOrbitNode, defaultOrbitNode, defaultOrbitNode],
  innerLogos = [],
  outerRadius = 122,
  innerRadius = 62,
  logo = <span className="text-lg font-black text-primary">SB</span>,
  animated = false,
  trigger = "inView",
  hover = false,
  orbit = false,
  className,
}: CodedLogoOrbitProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const active = useVisualState(ref, trigger, reduceMotion);
  const shouldAnimate = animated && !reduceMotion;
  const loopActive = orbit && !reduceMotion && (hover ? hovered : active);
  const motionProps = shouldAnimate
    ? { initial: "hidden" as const, animate: active ? "visible" as const : "hidden" as const }
    : {};
  const orbitTransition = { duration: 120, repeat: Infinity, ease: "linear" as const };

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("relative isolate flex size-full items-center justify-center overflow-hidden p-1", className)}
      onMouseEnter={hover ? () => setHovered(true) : undefined}
      onMouseLeave={hover ? () => setHovered(false) : undefined}
    >
      <motion.div className="relative flex size-72 items-center justify-center" variants={shouldAnimate ? logoFrameVariants : undefined} {...motionProps}>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_35%_35%_at_50%_50%,black_60%,transparent_100%)]" />
        <div className="absolute size-28 rounded-full border border-border/70" />
        <div className="absolute size-56 rounded-full border border-border/50" />
        <div className="absolute size-64 rounded-full border border-border/35" />

        <motion.div className="absolute inset-0" animate={loopActive ? { rotate: 360 } : { rotate: 0 }} transition={orbitTransition}>
          {outerLogos.map((node, index) => {
            const { x, y } = polar((360 / Math.max(1, outerLogos.length)) * index, outerRadius);
            return (
              <div key={index} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}>
                <motion.div className="flex size-12 items-center justify-center rounded-full border bg-card text-xl shadow-sm ring-2 ring-background" variants={shouldAnimate ? logoItemVariants : undefined} custom={index * 0.08 + 0.2} {...motionProps}>{node}</motion.div>
              </div>
            );
          })}
        </motion.div>

        {innerLogos.length > 0 ? (
          <motion.div className="absolute inset-0" animate={loopActive ? { rotate: -360 } : { rotate: 0 }} transition={{ ...orbitTransition, duration: 80 }}>
            {innerLogos.map((node, index) => {
              const { x, y } = polar((360 / Math.max(1, innerLogos.length)) * index, innerRadius);
              return (
                <div key={index} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}>
                  <motion.div className="flex size-11 items-center justify-center rounded-full border bg-card text-lg shadow-sm ring-2 ring-background" variants={shouldAnimate ? logoItemVariants : undefined} custom={index * 0.08 + 0.1} {...motionProps}>{node}</motion.div>
                </div>
              );
            })}
          </motion.div>
        ) : null}

        {logo ? <motion.div className="relative z-10 flex size-16 items-center justify-center rounded-2xl border bg-card shadow-[0_12px_40px_var(--color-primary)]" variants={shouldAnimate ? logoItemVariants : undefined} {...motionProps}>{logo}</motion.div> : null}
      </motion.div>
    </div>
  );
}

/* Notifications / Bell -------------------------------------------------- */

export interface CodedBellProps {
  count?: number;
  animated?: boolean;
  trigger?: CodedVisualTrigger;
  hover?: boolean;
  className?: string;
}

const bellDiscVariants: Variants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.3, delay: 0.1 } },
};

const bellSwingVariants: Variants = {
  hidden: { rotate: 0 },
  visible: { rotate: [0, -12, 10, -8, 6, -4, 0], transition: { duration: 1.2, delay: 0.35, repeat: Infinity, repeatDelay: 1.8 } },
};

export function CodedBell({
  count = 0,
  animated = false,
  trigger = "inView",
  hover = false,
  className,
}: CodedBellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const active = useVisualState(ref, trigger, reduceMotion);
  const shouldAnimate = animated && !reduceMotion;
  const loopActive = !reduceMotion && (hover ? hovered : active);
  const motionProps = shouldAnimate
    ? { initial: "hidden" as const, animate: active ? "visible" as const : "hidden" as const }
    : {};
  const display = count > 99 ? "99+" : String(Math.max(0, count));

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("relative isolate flex size-full items-center justify-center overflow-hidden p-1", className)}
      onMouseEnter={hover ? () => setHovered(true) : undefined}
      onMouseLeave={hover ? () => setHovered(false) : undefined}
    >
      <motion.div className="relative flex size-44 items-center justify-center" variants={shouldAnimate ? bellDiscVariants : undefined} {...motionProps}>
        <motion.div className="absolute inset-0 flex items-center justify-center" animate={{ opacity: loopActive ? 0 : 1 }} transition={{ duration: 0.4 }}>
          <span className="absolute size-24 rounded-full border-2 border-primary/20" />
          <span className="absolute size-28 rounded-full border-2 border-primary/15" />
          <span className="absolute size-32 rounded-full border-2 border-primary/10" />
        </motion.div>
        <motion.div className="absolute size-32 rounded-full border-2 border-primary/30" animate={loopActive ? { scale: [1, 1.35], opacity: [0.65, 0] } : { scale: 1, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
        <div className="relative flex size-16 items-center justify-center rounded-3xl border bg-card shadow-sm ring-2 ring-muted">
          <motion.div className="origin-top text-foreground" style={{ transformOrigin: "50% 15%" }} variants={shouldAnimate ? bellSwingVariants : undefined} animate={shouldAnimate && loopActive ? "visible" : "hidden"}>
            <BellIcon className="size-7" strokeWidth={1.6} />
          </motion.div>
          {count > 0 ? <motion.div className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground shadow-md ring-2 ring-background" variants={shouldAnimate ? bellDiscVariants : undefined} {...motionProps}>{display}</motion.div> : null}
        </div>
      </motion.div>
    </div>
  );
}
