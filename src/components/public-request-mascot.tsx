import { useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * Maskot empty state untuk papan warga publik.
 *
 * Satu keluarga dengan `AdminEmptyMascot`, bukan salinannya: viewBox, proporsi
 * wajah, lebar stroke, dan cara animasinya sama, tapi siluet, warna, dan
 * ekspresinya mengikuti tema publik (slate + blue + amber) dan konteksnya
 * "menunggu warga pertama" - ramah dan penasaran, bukan tampilan kosong yang
 * terlihat seperti error.
 *
 * Gerak hanya `transform` + `opacity` yang dikerjakan loop Framer, tanpa
 * setInterval dan tanpa re-render halaman. `prefers-reduced-motion`
 * (`useReducedMotion`) menyisakan satu pose statis; transisi masuk (fade + y)
 * sudah ditangani `AnimatedContent` yang membungkus section ini.
 */
export type PublicRequestMascotProps = {
  className?: string;
};

/**
 * Ukuran mascot. Dipakai juga sebagai spacer saat loading supaya perpindahan
 * 0 → 1 tidak menyebabkan layout shift di dalam kartu.
 */
export const PUBLIC_REQUEST_MASCOT_SIZE =
  "size-[88px] shrink-0 sm:size-[104px] lg:size-[120px]";

type MascotPose = "idle" | "react" | "rest";

/* Warna diambil dari token halaman publik, bukan dari tema admin:
   slate-900/700/200/100, blue-700/100, amber-200. */
const INK = "#0F172A"; // slate-900
const LINE = "#334155"; // slate-700
const SHEET = "#E2E8F0"; // slate-200
const CARD = "#FFFFFF";
const BADGE = "#DBEAFE"; // blue-100
const BADGE_INK = "#1D4ED8"; // blue-700
const CHEEK = "#FDE68A"; // amber-200

/* Keyframe kedip: hanya ~0.3s dari siklus 7.4s, jadi tidak menarik perhatian. */
const BLINK_TIMES = [0, 0.86, 0.88, 0.9, 1];

/* Napas 4.8s + goyang 7.6s: durasi beda membuat keduanya tidak sinkron. */
const BODY: Variants = {
  idle: {
    scaleY: [1, 1.018, 1],
    y: [0, -1.2, 0],
    rotate: [0, 0.8, 0],
    transition: {
      scaleY: { duration: 4.8, repeat: Infinity, ease: "easeInOut" },
      y: { duration: 4.8, repeat: Infinity, ease: "easeInOut" },
      rotate: { duration: 7.6, repeat: Infinity, ease: "easeInOut" },
    },
  },
  react: {
    scaleY: [1, 1.045, 1],
    y: [0, -4, 0],
    rotate: [0, -2, 0],
    transition: { duration: 0.9, ease: "easeInOut" },
  },
  rest: { scaleY: 1, y: 0, rotate: 0 },
};

/* "Mengintip": wajah menoleh kiri-kanan pelan, jauh lebih lambat dari napas. */
const LOOK: Variants = {
  idle: {
    x: [0, 1.8, 0, -1.8, 0],
    transition: { duration: 9.6, repeat: Infinity, ease: "easeInOut" },
  },
  react: {
    x: [0, 2.4, 0, 0],
    transition: { duration: 0.9, ease: "easeInOut" },
  },
  rest: { x: 0 },
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

/* Badge "?" punya loop sendiri supaya tidak ikut gestur hover. */
const ACCENT: Variants = {
  float: {
    y: [0, -2.6, 0],
    opacity: [0.75, 1, 0.75],
    transition: {
      y: { duration: 5.4, repeat: Infinity, ease: "easeInOut" },
      opacity: { duration: 5.4, repeat: Infinity, ease: "easeInOut" },
    },
  },
  still: { y: 0, opacity: 1 },
};

export function PublicRequestMascot({ className }: PublicRequestMascotProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [reacting, setReacting] = useState(false);
  const pose: MascotPose = reduceMotion ? "rest" : reacting ? "react" : "idle";

  return (
    <motion.div
      className={cn(PUBLIC_REQUEST_MASCOT_SIZE, className)}
      variants={BODY}
      initial={false}
      animate={pose}
      onMouseEnter={() => setReacting(true)}
      onMouseLeave={() => setReacting(false)}
    >
      <svg viewBox="0 0 120 120" className="size-full" aria-hidden="true" focusable="false">
        <ellipse cx="60" cy="104" rx="34" ry="5" fill={INK} opacity="0.08" />

        <motion.g variants={ACCENT} initial={false} animate={reduceMotion ? "still" : "float"}>
          <circle cx="100" cy="26" r="12.5" fill={BADGE} stroke={LINE} strokeWidth="2.5" />
          <path
            d="M96.4 22.4c0-2.1 1.6-3.6 3.6-3.6 2 0 3.6 1.4 3.6 3.5 0 2.2-2.1 2.6-3 4-.4.6-.5 1.2-.5 1.9"
            fill="none"
            stroke={BADGE_INK}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="100" cy="31.4" r="1.5" fill={BADGE_INK} />
        </motion.g>

        <g transform="rotate(-6 62 58)">
          <rect x="30" y="22" width="52" height="66" rx="8" fill={SHEET} stroke={LINE} strokeWidth="2.5" />
          <path
            d="M40 30h22M46 37h20"
            stroke={LINE}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.35"
          />
        </g>

        <path
          d="M24 34h16l8 9h48a8 8 0 0 1 8 8v41a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8V42a8 8 0 0 1 8-8Z"
          fill={CARD}
          stroke={LINE}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        <circle cx="39" cy="79" r="3.4" fill={CHEEK} />
        <circle cx="81" cy="79" r="3.4" fill={CHEEK} />

        <motion.g variants={LOOK}>
          <motion.g variants={EYES_OPEN}>
            <rect x="43.5" y="62" width="9.5" height="10.5" rx="3.5" fill={INK} />
            <rect x="67" y="62" width="9.5" height="10.5" rx="3.5" fill={INK} />
          </motion.g>

          <motion.g variants={EYES_CLOSED}>
            <path d="M43.5 69c2.4-4.6 6.6-4.6 9 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M67 69c2.4-4.6 6.6-4.6 9 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          </motion.g>

          <motion.path
            d="M55 79c3 2.4 7 2.4 10 0"
            fill="none"
            stroke={INK}
            strokeWidth="2.5"
            strokeLinecap="round"
            variants={MOUTH_CALM}
          />
          <motion.path d="M53 77.5c3 5.4 11 5.4 14 0Z" fill={INK} variants={MOUTH_SMILE} />
        </motion.g>
      </svg>
    </motion.div>
  );
}
