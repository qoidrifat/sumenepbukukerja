import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Maskot completion empty state untuk antrean admin.
 *
 * Satu visual language (Warm Brutalism) dipakai ulang di dua antrean; hanya
 * aksen melayang yang berbeda. Maskot purely dekoratif: dia hanya dirender saat
 * queue sudah terkonfirmasi kosong, jadi informasinya tetap dibawa oleh copy.
 *
 * Gerak hanya `transform` + `opacity` yang diserahkah ke loop animasi Framer,
 * tanpa setInterval/re-render dashboard. `prefers-reduced-motion` mematikan semua
 * gerakan lewat `useReducedMotion` (pose `rest`) dan diperkuat override global
 * `.admin-workspace *` di src/index.css.
 */
export type AdminEmptyMascotVariant = "claims" | "photos";

type MascotPose = "idle" | "react" | "rest";

export interface AdminEmptyMascotProps {
  variant: AdminEmptyMascotVariant;
  className?: string;
}

/**
 * Ukuran mascot. Dipakai juga sebagai spacer saat loading supaya perpindahan
 * 1 → 0 tidak menyebabkan layout shift di dalam kartu.
 */
export const ADMIN_EMPTY_MASCOT_SIZE = "size-[84px] shrink-0 sm:size-[100px] lg:size-[112px]";

/* Token warna admin (src/index.css) supaya ilustrasi tidak keluar dari design system. */
const INK = "#121212";
const CANVAS = "#F5F0E5";
const YELLOW = "#FFE662";
const TERRACOTTA = "#E9B4A7";

/* Keyframe kedip: hanya ~0.3s dari siklus 7.4s, jadi tidak menarik perhatian. */
const BLINK_TIMES = [0, 0.86, 0.88, 0.9, 1];

/* Napas 4.6s + goyang 7.2s: durasi beda membuat keduanya tidak sinkron. */
const BODY: Variants = {
  idle: {
    scaleY: [1, 1.022, 1],
    y: [0, -1.6, 0],
    rotate: [0, 0.9, 0],
    transition: {
      scaleY: { duration: 4.6, repeat: Infinity, ease: "easeInOut" },
      y: { duration: 4.6, repeat: Infinity, ease: "easeInOut" },
      rotate: { duration: 7.2, repeat: Infinity, ease: "easeInOut" },
    },
  },
  react: {
    scaleY: [1, 1.05, 1],
    y: [0, -4.5, 0],
    rotate: [0, -2.2, 0],
    transition: { duration: 0.9, ease: "easeInOut" },
  },
  rest: { scaleY: 1, y: 0, rotate: 0 },
};

const EYES_OPEN: Variants = {
  idle: {
    opacity: [1, 1, 0, 1, 1],
    transition: { duration: 7.4, repeat: Infinity, ease: "linear", times: BLINK_TIMES },
  },
  react: { opacity: [1, 0, 0, 1], transition: { duration: 0.9, ease: "easeInOut" } },
  rest: { opacity: 1 },
};

const EYES_CLOSED: Variants = {
  idle: {
    opacity: [0, 0, 1, 0, 0],
    transition: { duration: 7.4, repeat: Infinity, ease: "linear", times: BLINK_TIMES },
  },
  react: { opacity: [0, 1, 1, 0], transition: { duration: 0.9, ease: "easeInOut" } },
  rest: { opacity: 0 },
};

const MOUTH_CALM: Variants = {
  idle: { opacity: 1 },
  react: { opacity: [1, 0, 0, 1], transition: { duration: 0.9, ease: "easeInOut" } },
  rest: { opacity: 1 },
};

const MOUTH_SMILE: Variants = {
  idle: { opacity: 0 },
  react: { opacity: [0, 1, 1, 0], transition: { duration: 0.9, ease: "easeInOut" } },
  rest: { opacity: 0 },
};

/* Aksen punya loop sendiri supaya tidak ikut gesture hover dan tetap hidup saat diam. */
const ACCENT: Variants = {
  float: {
    y: [0, -3, 0],
    opacity: [0.55, 0.95, 0.55],
    transition: {
      y: { duration: 5.6, repeat: Infinity, ease: "easeInOut" },
      opacity: { duration: 5.6, repeat: Infinity, ease: "easeInOut" },
    },
  },
  still: { y: 0, opacity: 0.8 },
};

function SleepMarks() {
  return (
    <>
      <path
        d="M92 32h12l-12 12h12"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M104 18h7l-7 7h7"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function Sparkles() {
  return (
    <>
      <path
        d="M100 26c1.4 5.4 3 7 8.4 8.4-5.4 1.4-7 3-8.4 8.4-1.4-5.4-3-7-8.4-8.4 5.4-1.4 7-3 8.4-8.4Z"
        fill={YELLOW}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M90 13c.7 2.7 1.5 3.5 4.2 4.2-2.7.7-3.5 1.5-4.2 4.2-.7-2.7-1.5-3.5-4.2-4.2 2.7-.7 3.5-1.5 4.2-4.2Z"
        fill={TERRACOTTA}
        stroke={INK}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </>
  );
}

export function AdminEmptyMascot({ variant, className }: AdminEmptyMascotProps) {
  const reduceMotion = useReducedMotion();
  const [reacting, setReacting] = useState(false);
  const pose: MascotPose = reduceMotion ? "rest" : reacting ? "react" : "idle";

  return (
    <motion.div
      className={cn(ADMIN_EMPTY_MASCOT_SIZE, className)}
      variants={BODY}
      initial={false}
      animate={pose}
      onMouseEnter={() => setReacting(true)}
      onMouseLeave={() => setReacting(false)}
    >
      <svg viewBox="0 0 120 120" className="size-full" aria-hidden="true" focusable="false">
        <ellipse cx="60" cy="103" rx="34" ry="5" fill={INK} opacity="0.1" />

        <motion.g variants={ACCENT} initial={false} animate={reduceMotion ? "still" : "float"}>
          {variant === "claims" ? <SleepMarks /> : <Sparkles />}
        </motion.g>

        <g transform="rotate(-6 62 58)">
          <rect x="36" y="24" width="54" height="68" rx="3" fill={CANVAS} stroke={INK} strokeWidth="2.5" />
          <path
            d="M46 34h24M46 42h32"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.3"
          />
        </g>

        <path
          d="M20 48h20l8 10h52a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V52a4 4 0 0 1 4-4Z"
          fill={YELLOW}
          stroke={INK}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        <circle cx="35" cy="84" r="3.2" fill={TERRACOTTA} />
        <circle cx="85" cy="84" r="3.2" fill={TERRACOTTA} />

        <motion.g variants={EYES_OPEN}>
          <rect x="44" y="72" width="8" height="9" rx="2" fill={INK} />
          <rect x="68" y="72" width="8" height="9" rx="2" fill={INK} />
        </motion.g>

        <motion.g variants={EYES_CLOSED}>
          <path d="M44 78c2-4 6-4 8 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M68 78c2-4 6-4 8 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        </motion.g>

        <motion.path
          d="M54 86c3 2.6 9 2.6 12 0"
          fill="none"
          stroke={INK}
          strokeWidth="2.5"
          strokeLinecap="round"
          variants={MOUTH_CALM}
        />
        <motion.path d="M52 85c3 6 13 6 16 0Z" fill={INK} variants={MOUTH_SMILE} />
      </svg>
    </motion.div>
  );
}
