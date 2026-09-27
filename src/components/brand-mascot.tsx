import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion, type Transition, type Variants } from "framer-motion";

import {
  ACCESSORIES,
  BOOK_FOLD,
  BOOK_LEFT,
  BOOK_MICRO,
  BOOK_MICRO_FOLD,
  BOOK_RIGHT,
  BROWS,
  DETAIL_RULES,
  EYE,
  EYE_CLOSED_HAPPY,
  EYE_NARROW,
  EYE_WIDE,
  MASCOT_FIELD,
  MASCOT_STROKE,
  MASCOT_TOKENS,
  MASCOT_VIEW_BOX,
  MOUTHS,
  QUERY_MARK,
  SPARKLES,
  type MascotAccessoryKey,
  type MascotDetail,
} from "@/lib/mascot-geometry";
import {
  MASCOT_BEHAVIOURS,
  MASCOT_BLINK,
  MASCOT_BODY_AMPLITUDE,
  MASCOT_CATEGORIES,
  MASCOT_CATEGORY_MOTION,
  MASCOT_GAZE,
  MASCOT_GAZE_DRIFT,
  MASCOT_INTENSITY_SCALE,
  MASCOT_TIMING,
  mascotBlinkJitter,
  mascotBurstMs,
  mascotGazeFromPoint,
  MASCOT_SIZE_AMPLITUDE,
  MASCOT_SIZE_DETAIL,
  MASCOT_SIZES,
  MASCOT_STATES,
  MASCOT_TONE_MOTION,
  MASCOT_TONES,
  type MascotBodySpec,
  type MascotCategoryKey,
  type MascotEyes,
  type MascotFloat,
  type MascotIntensity,
  type MascotMouth,
  type MascotSize,
  type MascotState,
  type MascotTone,
} from "@/lib/mascot-config";
import { cn } from "@/lib/utils";

/**
 * Brand Mascot — Phase 2 (bentuk) + Phase 5 (hidup).
 *
 * Satu karakter yang berasal langsung dari brand mark Phase 1. Badannya
 * bukan gambar baru: path-nya identik dengan `scripts/brand/mark.mjs` dan
 * dijaga oleh `bun run mascot:validate`. Yang ditambahkan di sini hanya
 * lapisan: wajah, gestur, aksesori, dan gerak.
 *
 * Arsitekturnya datadriven, bukan rantai conditional:
 *
 *     BrandMascot -> state    -> face      (mata, mulut, alis)
 *                 -> category -> accessory (piktogram kecil)
 *                 -> size    -> detail    (apa yang digambar)
 *                 -> tone    -> palette   (public / admin)
 *                 -> gesture -> motion    (framer-motion variants)
 *
 * Semua keputusan ada di `@/lib/mascot-config` dan
 * `@/lib/mascot-geometry`; file ini hanya merakitnya.
 *
 * ── Tiga batasan yang tidak boleh dilanggar ────────────────────────
 *
 * 1. Tidak ada `rotate`/`scale` di dalam SVG. `transform-origin` CSS pada
 *    elemen SVG selalu (0,0), sehingga transform kedua berputar di titik
 *    yang salah. Scaling dan rotasi hanya di `motion.div` HTML — disiplin
 *    yang sama dengan `PublicRequestMascot` dan `AdminEmptyMascot`.
 * 2. `repeat: Infinity` hanya jalan kalau `useReducedMotion()` false dan
 *    `animated` true.
 * 3. Field (persegi bundar) selalu ada di variant selain micro. Jarak
 *    spine 8 unit adalah negative space; tanpa field, buku menyatu jadi
 *    satu gumpalan dan kehilangan identitas Phase 1.
 *
 * ══════════════════════════════════════════════════════════════════
 * Phase 5 — kepemilikan gerak: SATU lapisan, SATU tanggung jawab
 * ══════════════════════════════════════════════════════════════════
 *
 * Sebelum Phase 5 pose diam dan osilasi dihitung oleh fungsi yang sama
 * (`pageMotion(amp, base)`), sehingga begitu `base` berubah saat state
 * berganti, keyframe array ikut restart dari nol dan pose melompat. Sekarang
 * keduanya dipisah jadi dua grup bersarang, dan tiap grup hanya boleh
 * mengubah satu hal:
 *
 *   L0  structural   motion.div (HTML)  -> y, rotate
 *                                          napas + lompatan kecil. Tidak
 *                                          pernah menyentuh SVG; origin 50% 50%.
 *   L1  pose         motion.g           -> x = poseShift | poseLeft | poseRight
 *                                          HANYA nilai pose diam, tidak pernah
 *                                          berosilasi. Karena cuma satu nilai,
 *                                          framer bisa MEN-TWEEN antar state
 *                                          (transition 500ms) — inilah yang
 *                                          menghapus lompatan pose.
 *   L2  oscillation  motion.g (anak L1) -> x = 0-based keyframes
 *                                          Napas halaman di sekitar pose. Selalu
 *                                          berpusat di 0, jadi pose tidak bisa
 *                                          ikut tergeser oleh animasi.
 *   L3  gaze         motion.g           -> x, y  MAKSIMAL MASCOT_GAZE
 *                                          Hanya membungkus mata + kedip;
 *                                          mulut dan alis tidak pernah ikut.
 *   L4  accessory    motion.g           -> y, x, opacity (FLOAT_TRAVEL)
 *       decor        motion.path        -> sama, per kilau
 *   L5  blink        motion.g (anak L3) -> opacity saja
 *
 * Yang TIDAK bergerak: geometri wajah (rect mata, path mulut, path alis)
 * tidak pernah ditransformasi. Hanya grup pembungkusnya yang bergeser, dan
 * hanya sebesar `MASCOT_GAZE` — nilainya dihitung ulang dari jarak mata ke
 * spine di `mascot-animation.test.ts`, jadi tidak bisa melenceng tanpa
 * membuat test gagal.
 *
 * Lipatan (BOOK_FOLD) tetap berada DI DALAM grup halaman kanan (L2), jadi
 * ia tidak bisa terlepas dari sudut halaman walau halaman digeser dua kali
 * (pose dan osilasi).
 *
 * ── Kosakata waktu                                             ──
 *
 * Satu tabel `MASCOT_TIMING`, bukan angka-angka yang tersebar. Rentangnya mengikuti
 * bahasa gerak Phase 5: micro 120-180ms, gesture 280-500ms (di sini 620ms
 * untuk gestur yang punya fase settle), transisi state 350-700ms, idle
 * 2200-4200ms. Tidak ada `repeat: Infinity` untuk gestur sekali-jadi — itu
 * ada di `MASCOT_BEHAVIOURS[].role`.
 */

export type BrandMascotProps = {
  /** Delapan state inti. Default `neutral`. */
  state?: MascotState;
  /** Varian kategori. Tanpa ini karakter tetap tampil, tanpa aksesori. */
  category?: MascotCategoryKey;
  /** Tingkat ukuran sekaligus tingkat detail. Default `md`. */
  size?: MascotSize;
  /** `public` (biru) atau `admin` (charcoal/parchment). Default `public`. */
  tone?: MascotTone;
  /** `false` membekukan semua gerak tanpa mengubah prop lain. */
  animated?: boolean;
  /**
   * Intensitas gerak editorial — bukan reduced-motion (itu media query).
   * Permukaan yang ramai boleh meminta `reduced` supaya tetap hidup tanpa
   * menarik mata. Default `normal`.
   */
  intensity?: MascotIntensity;
  /**
   * Label aksesibel. Tanpa label (default) maskot di-`aria-hidden` karena
   * teks di sebelahnya sudah menyebut nama kategorinya — dua pengumuman
   * untuk hal yang sama hanya membingungkan screen reader.
   */
  label?: string;
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Palet                                                               */
/* ------------------------------------------------------------------ */

type Palette = {
  field: string;
  page: string;
  pageSoft: string;
  fold: string;
  ink: string;
  accessory: string;
  decor: string;
};

const PALETTES: Record<MascotTone, Palette> = {
  public: {
    field: "#2563EB",
    page: MASCOT_TOKENS.page,
    pageSoft: MASCOT_TOKENS.pageSoft,
    fold: MASCOT_TOKENS.fold,
    ink: MASCOT_TOKENS.ink,
    /* Aksesori memakai nada halaman yang sama supaya terbaca sebagai satu
       keluarga bentuk, dan kontrasnya ke field biru cukup (3.7:1). */
    accessory: MASCOT_TOKENS.pageSoft,
    decor: MASCOT_TOKENS.pageSoft,
  },
  admin: {
    field: "#1A1A1A",
    page: "#F5F0E5",
    pageSoft: "#EAE4D4",
    fold: "#FF5A26",
    ink: MASCOT_TOKENS.charcoal,
    accessory: "#F5F0E5",
    decor: "#EAE4D4",
  },
};

/* ------------------------------------------------------------------ */
/* Waktu                                                               */
/* ------------------------------------------------------------------ */

/**
 * Kosakata waktu, amplitudo gerak, sapuan mata, dan jitter kedip tinggal di
 * `@/lib/mascot-config` (`MASCOT_TIMING`, `MASCOT_BODY_AMPLITUDE`,
 * `MASCOT_GAZE_DRIFT`, `mascotBlinkJitter`). File ini hanya merakit variant
 * dari data itu, dan data itu diuji sebagai data di
 * `mascot-animation.test.ts`.
 *
 * Alasannya bukan kerapian: berkas komponen yang mengekspor konstanta selain
 * komponen kehilangan Fast Refresh untuk komponennya sendiri, dan itu muncul
 * sebagai `react-refresh/only-export-components` di `bun run lint`. Memindah
 * datanya menghapus akar peringatannya, bukan menyenyapkannya.
 */
/** Ease-out lembut untuk reaksi. Tidak ada bouncy/elastic di karakter ini. */
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ------------------------------------------------------------------ */
/* Gerak                                                               */
/* ------------------------------------------------------------------ */

/**
 * Tiga pose animasi. Sama seperti Phase 3.1: tekan, hover, dan masuk-state
 * semuanya bermuara ke `react` yang sama, jadi tidak ada dua sumber yang bisa
 * menggerakkan satu grup secara bersamaan (§15).
 */
type Pose = "idle" | "react" | "rest";

/**
 * Gerak diam total: dipakai saat `animated={false}`, reduced motion, atau
 * scale 0.
 *
 * ── Kenapa nilainya ditulis EKSPLISIT, bukan `{}` ──
 *
 * Variant yang hanya berisi `transition` tidak menargetkan nilai apa pun,
 * sehingga framer tidak mengembalikan apa pun ke posisi diam - ia hanya
 * BERHENTI, dan motion value-nya tertinggal di angka terakhir. Akibatnya,
 * mematikan animasi di tengah napas akan membekukan maskot pada offset
 * `y = -1.19` alih-alih menegakkannya. Terukur di
 * `scripts/mascot/qa-motion.mjs` (lantai ukuran `sm` pernah tertangkap
 * membeku di 1.19 unit, bukan 0).
 *
 * Jadi setiap variant beku menyebut nilai diamnya sendiri. `opacity` hanya
 * ada di dua konstanta di bawah: badan/halaman tidak pernah menganimasikan
 * opacity, dan menambahkannya hanya menambah atribut style tanpa manfaat.
 */
const REST_MOVE = {
  x: 0,
  y: 0,
  rotate: 0,
  transition: { duration: 0 },
} as const;

/** Badan dan halaman: posisi saja. */
const REST_BODY: Variants = { idle: REST_MOVE, react: REST_MOVE, rest: REST_MOVE };

/** Aksesori dan kilau: posisi + opacity (opacity-nya memang dianimasikan). */
const REST_TRAVEL: Variants = {
  idle: { x: 0, y: 0, opacity: 1, transition: { duration: 0 } },
  react: { x: 0, y: 0, opacity: 1, transition: { duration: 0 } },
  rest: { x: 0, y: 0, opacity: 1, transition: { duration: 0 } },
};

/**
 * Kedip: diam berarti mata TERBUKA, jadi `opacity: 0` - kebalikan dari
 * lapisan lain. Kalau diwarisi dari `REST_BODY`, mata akan membeku tertutup.
 */
const REST_BLINK: Variants = {
  idle: { opacity: 0, transition: { duration: 0 } },
  react: { opacity: 0, transition: { duration: 0 } },
  rest: { opacity: 0, transition: { duration: 0 } },
};

/** Pengali gerak yang sudah dikumpulkan dari semua sumber. */
type MotionContext = {
  /** Amplitudo. 0 = beku total. */
  scale: number;
  /** Durasi. >1 = lebih pelan. */
  tempo: number;
};

/* -- L0: badan ------------------------------------------------------ */

function bodyMotion(amp: MascotBodySpec, ctx: MotionContext): Variants {
  const idleDy = amp.idleDy * ctx.scale;
  const idleTilt = amp.idleTilt * ctx.scale;
  const burstDy = amp.burstDy * ctx.scale;
  const burstTilt = amp.burstTilt * ctx.scale;

  if (idleDy === 0 && idleTilt === 0 && burstDy === 0 && burstTilt === 0) return REST_BODY;

  /* Keyframe dengan `times` yang tidak rata: napas yang metronomis terbaca
     mekanis. Semua keyframe kembali ke 0, jadi pose tidak pernah tergeser. */
  const idle =
    idleDy === 0 && idleTilt === 0
      ? REST_MOVE
      : {
          y: [0, -idleDy, -idleDy * 0.25, 0],
          rotate: idleTilt === 0 ? 0 : [0, idleTilt, -idleTilt * 0.5, 0],
          transition: {
            duration: MASCOT_TIMING.idle * ctx.tempo,
            repeat: Infinity,
            ease: "easeInOut" as const,
            times: [0, 0.4, 0.7, 1],
          },
        };

  const react =
    burstDy === 0 && burstTilt === 0
      ? REST_MOVE
      : {
          y: [0, -burstDy, burstDy * 0.12, 0],
          rotate: burstTilt === 0 ? 0 : [0, burstTilt, -burstTilt * 0.4, 0],
          transition: { duration: MASCOT_TIMING.gesture * ctx.tempo, ease: EASE_OUT },
        };

  return { idle, react, rest: REST_MOVE };
}

/* -- L1: pose diam -------------------------------------------------- */

/**
 * Grup pose. Hanya satu nilai `x`, tidak pernah berosilasi - karena itu
 * framer men-tween nilainya saat state berganti, dan pose baru tidak
 * melompat masuk.
 */
function poseMotion(base: number, ctx: MotionContext): Variants {
  const hold = { x: base, transition: { duration: 0 } };
  if (base === 0) return { idle: { x: 0 }, react: { x: 0 }, rest: hold };
  return {
    idle: { x: base, transition: { duration: MASCOT_TIMING.transition * ctx.tempo, ease: EASE_OUT } },
    react: { x: base, transition: { duration: MASCOT_TIMING.transition * ctx.tempo, ease: EASE_OUT } },
    rest: hold,
  };
}

/* -- L2: osilasi halaman -------------------------------------------- */

/**
 * Osilasi halaman, selalu berpusat di 0 dan selalu dinamisasi ke 0 juga.
 * Bertanda: `a` negatif = halaman keluar, positif = masuk ke dalam.
 */
function pageWave(amp: MascotBodySpec, side: "left" | "right", ctx: MotionContext): Variants {
  const idleAmp = (side === "left" ? amp.idlePageLeft : amp.idlePageRight) * ctx.scale;
  const burstAmp = (side === "left" ? amp.burstPageLeft : amp.burstPageRight) * ctx.scale;

  const idle =
    idleAmp === 0
      ? REST_MOVE
      : {
          x: [0, idleAmp, idleAmp * 0.3, -idleAmp * 0.5, 0],
          transition: {
            duration: MASCOT_TIMING.idle * ctx.tempo,
            repeat: Infinity,
            ease: "easeInOut" as const,
            times: [0, 0.3, 0.5, 0.76, 1],
          },
        };

  /* Satu lambaian utama, lalu satu lambaian mikro. §7 `hello`: satu primer,
     opsional satu mikro dengan amplitudo lebih kecil - bukan gelombang tanpa
     akhir. */
  const react =
    burstAmp === 0
      ? REST_MOVE
      : {
          x: [0, burstAmp, 0, burstAmp * 0.55, 0],
          transition: {
            duration: MASCOT_TIMING.gesture * ctx.tempo,
            ease: EASE_OUT,
            times: [0, 0.22, 0.44, 0.68, 1],
          },
        };

  return { idle, react, rest: REST_MOVE };
}

/* -- L3: gaze ------------------------------------------------------- */

/**
 * Gerak mata. `animate` di sini memakai objek (bukan nama variant), karena
 * targetnya berubah mengikuti pointer dan tidak punya nama state.
 */
type GazeTarget = { x: number };

const NO_GAZE: GazeTarget = { x: 0 };

/* -- L4: float ------------------------------------------------------ */

/** Urutan tingkat detail, supaya ambang minimum bisa dibandingkan. */
const DETAIL_RANK: Record<MascotDetail, number> = {
  micro: 0,
  small: 1,
  medium: 2,
  large: 3,
  hero: 4,
};

/**
 * Rangsangan dekoratif yang menempel pada aksesori kategori.
 *
 * `opacity` adalah titik redup TERENDAH. Nilai lama 0.45 membuat aksesori
 * menghabiskan separuh siklus animasinya di opacity ~50% - hasil pengujian
 * browser: piktogram pernah tertangkap menjadi biru `#78a1f3` (campuran
 * 50/50 dengan field) dan jauh lebih sulit dibaca. 0.78 menjaga kesan
 * berkedip tanpa mengorbankan keterbacaan.
 */
const FLOAT_TRAVEL: Record<MascotFloat, { y: number; x: number; opacity: number }> = {
  steam: { y: 2, x: 0, opacity: 0.78 },
  confetti: { y: 1.4, x: 1.2, opacity: 0.8 },
  clank: { y: 0.8, x: 1.4, opacity: 0.82 },
  lines: { y: 0, x: 1.4, opacity: 0.78 },
  none: { y: 0, x: 0, opacity: 1 },
};

/* ------------------------------------------------------------------ */
/* Sub-primitif                                                        */
/* ------------------------------------------------------------------ */

/** Bintang empat bidder untuk state `found`/`success`. */
function sparklePath(x: number, y: number, r: number) {
  const a = r * 0.36;
  const b = r * 0.28;
  return [
    `M${x} ${y - r}`,
    `C${x + a} ${y - r + a} ${x + r - b} ${y} ${x + r} ${y}`,
    `C${x + r - b} ${y} ${x + a} ${y + r - a} ${x} ${y + r}`,
    `C${x - a} ${y + r - a} ${x - r + b} ${y} ${x - r} ${y}`,
    `C${x - r + b} ${y} ${x - a} ${y - r + a} ${x} ${y - r}Z`,
  ].join(" ");
}

/** Bidik: buku dan lipatan. Identik dengan logo Phase 1. */
function BookBody({ micro, palette }: { micro: boolean; palette: Palette }) {
  if (micro) {
    return (
      <>
        <path d={BOOK_MICRO} fill={palette.page} />
        <path d={BOOK_MICRO_FOLD} fill={palette.fold} />
      </>
    );
  }
  return (
    <>
      <path d={BOOK_LEFT} fill={palette.page} />
      <path d={BOOK_RIGHT} fill={palette.pageSoft} />
      {/* Sudut terlipat: tanda tangan karakter, selalu digambar solid. */}
      <path d={BOOK_FOLD} fill={palette.fold} />
    </>
  );
}

function EyeShape({ eyes, palette }: { eyes: MascotEyes; palette: Palette }) {
  if (eyes === "narrowed") {
    return (
      <>
        <rect x={EYE_NARROW.leftX} y={EYE_NARROW.y} width={EYE_NARROW.width} height={EYE_NARROW.height} rx={EYE_NARROW.radius} fill={palette.ink} />
        <rect x={EYE_NARROW.rightX} y={EYE_NARROW.y} width={EYE_NARROW.width} height={EYE_NARROW.height} rx={EYE_NARROW.radius} fill={palette.ink} />
      </>
    );
  }
  if (eyes === "wide") {
    return (
      <>
        <rect x={EYE_WIDE.leftX} y={EYE_WIDE.y} width={EYE_WIDE.width} height={EYE_WIDE.height} rx={EYE_WIDE.radius} fill={palette.ink} />
        <rect x={EYE_WIDE.rightX} y={EYE_WIDE.y} width={EYE_WIDE.width} height={EYE_WIDE.height} rx={EYE_WIDE.radius} fill={palette.ink} />
      </>
    );
  }
  return (
    <>
      <rect x={EYE.leftX} y={EYE.y} width={EYE.width} height={EYE.height} rx={EYE.radius} fill={palette.ink} />
      <rect x={EYE.rightX} y={EYE.y} width={EYE.width} height={EYE.height} rx={EYE.radius} fill={palette.ink} />
    </>
  );
}

type BrowShape = "none" | "raised" | "focused";

/**
 * Wajah. Mata punya dua lapis (buka + kedip) yang saling silih lewat
 * `opacity`, bukan `transform`, jadi tidak butuh `transform-box: fill-box`.
 *
 * Phase 5: kedua lapis mata itu dibungkus satu `motion.g` — L3. Yang boleh
 * bergeser hanya mata. Mulut dan alis digambar di luar grup itu, jadi ekspresi
 * tidak pernah ikut bergeser saat mata melirik.
 */
function Face({
  detail,
  eyes,
  mouth,
  brows,
  palette,
  blink,
  blinkPose,
  gaze,
  gazeTransition,
}: {
  detail: MascotDetail;
  eyes: MascotEyes;
  mouth: MascotMouth;
  brows: BrowShape;
  palette: Palette;
  blink: Variants;
  blinkPose: Pose;
  gaze: { x: number | number[] };
  gazeTransition: Transition;
}) {
  if (!DETAIL_RULES[detail].face) return null;

  /* Mata yang sudah tertutup tidak perlu lapisan kedip — kalau ditambah,
     blink akan menggambar busur yang sama dua kali. */
  const blinks = eyes !== "closed-happy";
  const brow = brows === "raised" ? BROWS.raised : brows === "focused" ? BROWS.focused : null;

  return (
    <g>
      {brow && (
        <g fill="none" stroke={palette.ink} strokeWidth={brow.strokeWidth} strokeLinecap="round">
          <path d={brow.left} />
          <path d={brow.right} />
        </g>
      )}

      <motion.g animate={gaze} transition={gazeTransition}>
        <EyeShape eyes={eyes} palette={palette} />

        {blinks && (
          <motion.g
            style={{ opacity: 0 }}
            variants={blink}
            initial={blinkPose}
            animate={blinkPose}
          >
            <g
              fill="none"
              stroke={palette.ink}
              strokeWidth={EYE_CLOSED_HAPPY.strokeWidth}
              strokeLinecap="round"
            >
              <path d={EYE_CLOSED_HAPPY.left} />
              <path d={EYE_CLOSED_HAPPY.right} />
            </g>
          </motion.g>
        )}
      </motion.g>

      <g fill="none" stroke={palette.ink} strokeWidth={MOUTHS[mouth].strokeWidth} strokeLinecap="round">
        <path d={MOUTHS[mouth].left} />
        <path d={MOUTHS[mouth].right} />
      </g>
    </g>
  );
}

/**
 * Aksesori kategori. Selalu berada di pita di bawah buku (ACCESSORY_ZONE):
 * tidak pernah menutupi buku, tidak pernah menutupi lipatan, dan bisa
 * dihapus tanpa merusak karakter.
 */
function Accessory({ shape, palette }: { shape: MascotAccessoryKey; palette: Palette }) {
  const parts = ACCESSORIES[shape];
  if (!parts) return null;
  return (
    <g>
      {parts.map((part, i) =>
        part.stroke ? (
          <path
            key={i}
            d={part.d}
            fill="none"
            stroke={palette.accessory}
            strokeWidth={"width" in part ? part.width : MASCOT_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path key={i} d={part.d} fill={palette.accessory} />
        ),
      )}
    </g>
  );
}

/** Kilau dan tanda tanya untuk state `found`/`success`/`empty`. */
function Decor({
  sparkle,
  queryMark,
  palette,
  travel,
  pose,
}: {
  sparkle: boolean;
  queryMark: boolean;
  palette: Palette;
  travel: Variants;
  pose: Pose;
}) {
  if (!sparkle && !queryMark) return null;
  return (
    <g>
      {sparkle &&
        SPARKLES.map((s, i) => (
          <motion.path
            key={i}
            d={sparklePath(s.x, s.y, s.r)}
            fill={palette.decor}
            variants={travel}
            initial={pose}
            animate={pose}
          />
        ))}
      {queryMark && (
        <g fill="none" stroke={palette.decor} strokeWidth={QUERY_MARK.strokeWidth} strokeLinecap="round">
          <path d={QUERY_MARK.arc} />
          <circle
            cx={QUERY_MARK.dot.cx}
            cy={QUERY_MARK.dot.cy}
            r={QUERY_MARK.dot.r}
            fill={palette.decor}
            stroke="none"
          />
        </g>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen                                                            */
/* ------------------------------------------------------------------ */

export function BrandMascot({
  state = "neutral",
  category,
  size = "md",
  tone = "public",
  animated = true,
  intensity = "normal",
  label,
  className,
}: BrandMascotProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [reacting, setReacting] = useState(false);
  const [pointerGaze, setPointerGaze] = useState<GazeTarget | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const stateConfig = MASCOT_STATES[state] ?? MASCOT_STATES.neutral;
  const categoryConfig = category ? MASCOT_CATEGORIES[category] : undefined;
  const toneConfig = MASCOT_TONES[tone] ?? MASCOT_TONES.public;
  const detail = MASCOT_SIZE_DETAIL[size] ?? "medium";
  const rules = DETAIL_RULES[detail];
  const palette = PALETTES[tone] ?? PALETTES.public;

  /* Aksesori punya ambang minimum per konteks: publik sudah dari `large`,
     admin baru di `hero` supaya density workspace tidak berubah. */
  const showAccessory =
    Boolean(categoryConfig) && DETAIL_RANK[detail] >= DETAIL_RANK[toneConfig.accessoryFrom];

  const behaviour =
    MASCOT_BEHAVIOURS[stateConfig.gesture] ??
    /* Fallback memakai perilaku bawaan tone, bukan konstanta tersembunyi:
       tone `admin` memang menginginkan gerak yang berbeda saat state-nya
       tidak dikenal. */
    MASCOT_BEHAVIOURS[toneConfig.defaultBehaviour] ??
    MASCOT_BEHAVIOURS["idle-bob"];

  /* Tiga tingkat, dari yang paling spesifik: gestur state, lalu perilaku
     bawaan tone, lalu gerak nol. Setelah ini `amp` selalu ada - state baru
     yang lupa didaftarkan tidak akan membuat komponen crash. */
  const amp =
    MASCOT_BODY_AMPLITUDE[stateConfig.gesture] ??
    MASCOT_BODY_AMPLITUDE[toneConfig.defaultBehaviour] ??
    MASCOT_BODY_AMPLITUDE.none;
  const travelSpec = FLOAT_TRAVEL[categoryConfig?.float ?? "none"];

  const intensityScale = MASCOT_INTENSITY_SCALE[intensity] ?? 1;
  const sizeScale = MASCOT_SIZE_AMPLITUDE[size] ?? 1;
  const categoryMotion = category ? MASCOT_CATEGORY_MOTION[category] : undefined;
  const toneMotion = MASCOT_TONE_MOTION[tone] ?? MASCOT_TONE_MOTION.public;

  const ctx = useMemo<MotionContext>(
    () => ({
      scale:
        sizeScale *
        intensityScale *
        (categoryMotion?.energy ?? 1) *
        (toneMotion?.energy ?? 1),
      tempo: (categoryMotion?.tempo ?? 1) * (toneMotion?.tempo ?? 1),
    }),
    [sizeScale, intensityScale, categoryMotion, toneMotion],
  );

  const still = !animated || reduceMotion || ctx.scale === 0;
  const pose: Pose = still ? "rest" : reacting ? "react" : "idle";

  /* ---- Gestur sekali-jadi ---------------------------------------- */

  const burstMs = mascotBurstMs(ctx.tempo);
  const ackTimer = useRef<number | null>(null);
  const fireRef = useRef<() => void>(() => {});

  const fire = useCallback(() => {
    setReacting(true);
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = window.setTimeout(() => {
      ackTimer.current = null;
      setReacting(false);
    }, burstMs);
  }, [burstMs]);

  /* `fire` berubah identitas saat tempo berubah. Disimpan di ref supaya efek
     "masuk state" tidak ikut jalan ulang hanya karena tempo bergeser. */
  useEffect(() => {
    fireRef.current = fire;
  }, [fire]);

  /* Timer harus ikut mati saat unmount, kalau tidak ada setState ke komponen
     yang sudah tidak ada. */
  useEffect(
    () => () => {
      if (ackTimer.current !== null) {
        window.clearTimeout(ackTimer.current);
        ackTimer.current = null;
      }
    },
    [],
  );

  /**
   * Masuk state. Hanya gestur `role: "burst"` yang diputar di sini: untuk
   * state yang memang hidup dari loop (`search`, `working`), loop itu sudah
   * membawa artinya dan gestur tambahan hanya jadi kebisingan.
   */
  useEffect(() => {
    if (still || behaviour.role !== "burst") return;
    fireRef.current();
  }, [state, still, behaviour.role]);

  /* ---- Interaksi pointer ---------------------------------------- */

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ clientX: number } | null>(null);

  const flushGaze = useCallback(() => {
    rafRef.current = null;
    const host = hostRef.current;
    const point = pendingRef.current;
    if (!host || !point) return;
    const next = mascotGazeFromPoint(point, host.getBoundingClientRect());
    /* Ambang 0.12 unit: di bawah itu pergeseran tidak terlihat, dan tidak
       sepadan dengan satu render ulang. */
    setPointerGaze((prev) => (prev && Math.abs(prev.x - next.x) < 0.12 ? prev : next));
  }, []);

  const handlePointerMove = useCallback(
    (event: { clientX: number }) => {
      if (still) return;
      pendingRef.current = { clientX: event.clientX };
      /* Satu pembacaan layout per frame, bukan per event: pointermove bisa
         datang jauh lebih sering daripada refresh layar. */
      if (rafRef.current === null) rafRef.current = window.requestAnimationFrame(flushGaze);
    },
    [still, flushGaze],
  );

  const handlePointerEnter = useCallback(() => {
    if (still) return;
    fireRef.current();
  }, [still]);

  const handlePointerLeave = useCallback(() => {
    pendingRef.current = null;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPointerGaze(null);
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    [],
  );

  /* ---- Kedip ----------------------------------------------------- */

  /**
   * Tiap instance menggeser jeda dan panjang siklusnya sendiri. Tanpa ini
   * semua maskot di satu halaman berkedip serentak — dan itu langsung terbaca
   * sebagai animasi, bukan sebagai karakter.
   *
   * Jitter-nya dari `useId()`, bukan `Math.random()`: memanggil fungsi tidak
   * murni saat render melanggar aturan purity React dan `react-hooks/purity`
   * menangkapnya sebagai error. `useId()` stabil per instance, unik per posisi
   * di pohon, dan deterministik antara server dan klien - tiga hal yang justru
   * dibutuhkan untuk "tidak berkedip serentak".
   */
  const blinkId = useId();
  const blinkSeed = useMemo(
    () => ({
      delay: mascotBlinkJitter(blinkId, 1) * MASCOT_BLINK.delayMax,
      cycle:
        MASCOT_BLINK.cycleMin +
        mascotBlinkJitter(blinkId, 2) * (MASCOT_BLINK.cycleMax - MASCOT_BLINK.cycleMin),
    }),
    [blinkId],
  );

  const blink = useMemo<Variants>(() => {
    if (still) return REST_BLINK;
    return {
      idle: {
        opacity: [...MASCOT_BLINK.opacity],
        transition: {
          duration: blinkSeed.cycle * ctx.tempo,
          delay: blinkSeed.delay,
          repeat: Infinity,
          times: [...MASCOT_BLINK.times],
          ease: "linear" as const,
        },
      },
      /* Kedip sengaja sekali saat gestur diputar: mata ikut bereaksi pada
         peristiwa yang sama dengan badan, bukan pada jamnya sendiri. */
      react: {
        opacity: [0, 1, 0, 0],
        transition: {
          duration: MASCOT_BLINK.burstDuration * ctx.tempo,
          times: [0, 0.35, 0.7, 1],
          ease: "linear" as const,
        },
      },
      rest: { opacity: 0, transition: { duration: 0 } },
    };
  }, [still, blinkSeed, ctx.tempo]);

  /* ---- Variant turunan ------------------------------------------- */

  const body = useMemo(() => bodyMotion(amp, ctx), [amp, ctx]);
  const bookPose = useMemo(() => poseMotion(amp.poseShift, ctx), [amp.poseShift, ctx]);
  const leftPose = useMemo(() => poseMotion(amp.poseLeft, ctx), [amp.poseLeft, ctx]);
  const rightPose = useMemo(() => poseMotion(amp.poseRight, ctx), [amp.poseRight, ctx]);
  /* Buku tidak punya amplitudo sendiri: gesturnya selalu di halaman. Grup osilasi
     tetap ada supaya lapisan L2 tidak hilang dari struktur saat pose buku nol. */
  const bookWave = useMemo(() => pageWave(MASCOT_BODY_AMPLITUDE.none, "left", ctx), [ctx]);
  const leftWave = useMemo(() => pageWave(amp, "left", ctx), [amp, ctx]);
  const rightWave = useMemo(() => pageWave(amp, "right", ctx), [amp, ctx]);

  const travel = useMemo<Variants>(() => {
    const y = travelSpec.y * ctx.scale;
    const x = travelSpec.x * ctx.scale;
    if (still || (y === 0 && x === 0)) return REST_TRAVEL;
    return {
      idle: {
        y: [0, -y, 0],
        x: [0, x, 0],
        opacity: [1, travelSpec.opacity, 1],
        transition: { duration: MASCOT_TIMING.float * ctx.tempo, repeat: Infinity, ease: "easeInOut" as const },
      },
      react: {
        y: [0, -y, 0],
        x: [0, x, 0],
        opacity: [1, travelSpec.opacity, 1],
        transition: { duration: MASCOT_TIMING.gesture * ctx.tempo, ease: EASE_OUT },
      },
      rest: { y: 0, x: 0, opacity: 1, transition: { duration: 0 } },
    };
  }, [still, travelSpec, ctx]);

  /* ---- Gaze: pointer lebih dulu, lalu sapuan mandiri -------------- */

  const drift = MASCOT_GAZE_DRIFT[stateConfig.gesture];
  const gaze = useMemo(() => {
    if (still) return NO_GAZE;
    if (pointerGaze) return pointerGaze;
    if (!drift) return NO_GAZE;
    return { x: drift.x.map((v) => v * ctx.scale) };
  }, [still, pointerGaze, drift, ctx.scale]);

  const gazeTransition = useMemo<Transition>(() => {
    if (still) return { duration: 0 };
    /* Pointer masuk: mata mengejar dengan pegas lembut, bukan lompat. */
    if (pointerGaze) {
      return { type: "spring" as const, stiffness: 170, damping: 22, mass: 0.5 };
    }
    if (!drift) return { duration: MASCOT_TIMING.transition * ctx.tempo, ease: EASE_OUT };
    return {
      duration: drift.duration * ctx.tempo,
      repeat: Infinity,
      ease: "easeInOut" as const,
      times: drift.times,
    };
  }, [still, pointerGaze, drift, ctx.tempo]);

  /* ---- Interaksi tekan ------------------------------------------- */

  /**
   * Tekan = acknowledgement. Ia MEMICU gestur, bukan menumpuk transform kedua
   * di atas pose: satu state machine (`react`) tetap satu-satunya yang boleh
   * menggerakkan karakter.
   *
   * `whileTap` framer sengaja TIDAK dipakai. Framer menambahkan
   * `tabIndex="0"` pada elemen yang punya gesture tap supaya bisa dipicu
   * keyboard, dan itu membuat maskot dekoratif ini jadi perhentian Tab tanpa
   * nama yang bisa dibaca screen reader - persis yang dilarang §11.
   * Terukur: `renderToStaticMarkup` sempat memuat `tabindex="0"` di
   * pembungkusnya, dan `mascot-animation.test.ts` sekarang melarangnya.
   */
  const handlePointerDown = useCallback(() => {
    if (still) return;
    fireRef.current();
  }, [still]);

  const brows: BrowShape = state === "found" ? "raised" : state === "working" ? "focused" : "none";

  const art: ReactNode = (
    <motion.div
      ref={hostRef}
      className={cn("relative", MASCOT_SIZES[size] ?? MASCOT_SIZES.md)}
      variants={body}
      initial={pose}
      animate={pose}
      onPointerEnter={handlePointerEnter}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ transformOrigin: "50% 50%" }}
    >
      <svg
        viewBox={`${MASCOT_VIEW_BOX.x} ${MASCOT_VIEW_BOX.y} ${MASCOT_VIEW_BOX.width} ${MASCOT_VIEW_BOX.height}`}
        className="size-full"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        xmlns="http://www.w3.org/2000/svg"
      >
        {label && <title>{label}</title>}

        {/* Field dulu, selalu: negative space spine bergantung padanya. */}
        <rect
          x={MASCOT_FIELD.x}
          y={MASCOT_FIELD.y}
          width={MASCOT_FIELD.width}
          height={MASCOT_FIELD.height}
          rx={MASCOT_FIELD.rx}
          fill={palette.field}
        />

        {rules.microBody ? (
          <BookBody micro palette={palette} />
        ) : (
          <motion.g variants={bookPose} initial={pose} animate={pose}>
            <motion.g variants={bookWave} initial={pose} animate={pose}>
              <motion.g variants={leftPose} initial={pose} animate={pose}>
                {amp.idlePageLeft === 0 && amp.burstPageLeft === 0 ? (
                  <path d={BOOK_LEFT} fill={palette.page} />
                ) : (
                  <motion.g variants={leftWave} initial={pose} animate={pose}>
                    <path d={BOOK_LEFT} fill={palette.page} />
                  </motion.g>
                )}
              </motion.g>
              {/* Lipatan ikut halaman kanan, kalau tidak sudut terlipat akan
                  terlepas dari sudut halaman saat halaman digeser. Pembungkus
                  pose dan pembungkus osilasi dua-duanya membungkus grup ini,
                  jadi lipatan tidak pernah menerima transform sendiri dan
                  tidak bisa tertinggal di belakang halamannya. */}
              <motion.g variants={rightPose} initial={pose} animate={pose}>
                {amp.idlePageRight === 0 && amp.burstPageRight === 0 ? (
                  <>
                    <path d={BOOK_RIGHT} fill={palette.pageSoft} />
                    <path d={BOOK_FOLD} fill={palette.fold} />
                  </>
                ) : (
                  <motion.g variants={rightWave} initial={pose} animate={pose}>
                    <path d={BOOK_RIGHT} fill={palette.pageSoft} />
                    <path d={BOOK_FOLD} fill={palette.fold} />
                  </motion.g>
                )}
              </motion.g>
            </motion.g>
          </motion.g>
        )}

        {/* Wajah TIDAK ikut pergeseran buku: mata tetap di tempat, badan
            yang bergerak. Untuk state seperti `search` ini justru memperkuat
            bacaan "matanya mencari, badannya diam". */}
        <Face
          detail={detail}
          eyes={stateConfig.eyes}
          mouth={stateConfig.mouth}
          brows={brows}
          palette={palette}
          blink={blink}
          blinkPose={pose}
          gaze={gaze}
          gazeTransition={gazeTransition}
        />

        {showAccessory && categoryConfig && (
          <motion.g variants={travel} initial={pose} animate={pose}>
            <Accessory shape={categoryConfig.accessory as MascotAccessoryKey} palette={palette} />
          </motion.g>
        )}

        {rules.decor && (
          <Decor
            sparkle={stateConfig.sparkle}
            queryMark={stateConfig.queryMark}
            palette={palette}
            travel={travel}
            pose={pose}
          />
        )}
      </svg>
    </motion.div>
  );

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none",
        className,
      )}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {art}
    </span>
  );
}

export default BrandMascot;
