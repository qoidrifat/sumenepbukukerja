import { useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

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
  MASCOT_CATEGORIES,
  MASCOT_SIZE_DETAIL,
  MASCOT_SIZES,
  MASCOT_STATES,
  MASCOT_TONES,
  type MascotCategoryKey,
  type MascotEyes,
  type MascotFloat,
  type MascotMouth,
  type MascotSize,
  type MascotState,
  type MascotTone,
} from "@/lib/mascot-config";
import { cn } from "@/lib/utils";

/**
 * Brand Mascot — Phase 2.
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
/* Gerak                                                               */
/* ------------------------------------------------------------------ */

type Pose = "idle" | "react" | "rest";

/**
 * Amplitude per gestur dalam unit viewBox. Semua kecil: tujuan gestur ini
 * "bernapas", bukan menyutradarai. Nilainya dalam unit viewBox (bukan
 * piksel) supaya proporsi terhadap tubuh tetap sama di semua ukuran.
 */
type BodySpec = {
  dy: number;
  reactDy: number;
  tilt: number;
  reactTilt: number;
  page: "none" | "left" | "right" | "both";
  pageX: number;
};

const BODY_AMPLITUDE: Record<string, BodySpec> = {
  "idle-bob": { dy: 1.2, reactDy: 2.4, tilt: 0, reactTilt: 0, page: "none", pageX: 0 },
  "hello-wave": { dy: 0.8, reactDy: 1.4, tilt: 0, reactTilt: 1.5, page: "left", pageX: 2 },
  "search-peek": { dy: 0.6, reactDy: 1, tilt: 0, reactTilt: 0, page: "none", pageX: 0 },
  "open-reveal": { dy: 0.8, reactDy: 1.2, tilt: 0, reactTilt: 0, page: "both", pageX: 1.6 },
  "focus-work": { dy: 0.8, reactDy: 1.2, tilt: 0, reactTilt: 0, page: "none", pageX: 0 },
  "directional-point": { dy: 0.6, reactDy: 1, tilt: 0, reactTilt: 0, page: "right", pageX: 1.8 },
  celebration: { dy: 2, reactDy: 3, tilt: 0, reactTilt: 2, page: "none", pageX: 0 },
  "steam-drift": { dy: 0.8, reactDy: 1.2, tilt: 0, reactTilt: 0, page: "none", pageX: 0 },
  "motion-lines": { dy: 0.6, reactDy: 1, tilt: 0, reactTilt: 0, page: "none", pageX: 0 },
  "welcome-nod": { dy: 1.2, reactDy: 2, tilt: 0, reactTilt: 1, page: "none", pageX: 0 },
  none: { dy: 0, reactDy: 0, tilt: 0, reactTilt: 0, page: "none", pageX: 0 },
};

const REST_BODY: Variants = { idle: {}, react: {}, rest: {} };

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

const BLINK_TIMES = [0, 0.88, 0.9, 0.92, 1];

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
 */
function Face({
  detail,
  eyes,
  mouth,
  brows,
  palette,
  blink,
  blinkPose,
}: {
  detail: MascotDetail;
  eyes: MascotEyes;
  mouth: MascotMouth;
  brows: BrowShape;
  palette: Palette;
  blink: Variants;
  blinkPose: Pose;
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
  label,
  className,
}: BrandMascotProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [reacting, setReacting] = useState(false);

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

  const amp = BODY_AMPLITUDE[stateConfig.gesture] ?? BODY_AMPLITUDE["idle-bob"];
  const travelSpec = FLOAT_TRAVEL[categoryConfig?.float ?? "none"];

  const pose: Pose = !animated || reduceMotion ? "rest" : reacting ? "react" : "idle";
  const still = pose === "rest";

  const body = useMemo<Variants>(() => {
    if (amp.dy === 0 && amp.tilt === 0) return REST_BODY;
    return {
      idle: {
        y: [0, -amp.dy, 0],
        rotate: [0, amp.tilt / 2, 0, -amp.tilt / 2, 0],
        transition: { duration: 3.6, repeat: Infinity, ease: "easeInOut" },
      },
      react: {
        y: [0, -amp.reactDy, 0],
        rotate: [0, amp.reactTilt, 0, -amp.reactTilt, 0],
        transition: { duration: 0.8, repeat: 2, ease: "easeInOut" },
      },
      rest: { y: 0, rotate: 0, transition: { duration: 0 } },
    };
  }, [amp]);

  const page = useMemo<Variants>(() => {
    if (amp.page === "none" || amp.pageX === 0) return REST_BODY;
    const idle = {
      x: [0, -amp.pageX, 0, amp.pageX, 0],
      transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" as const },
    };
    return {
      idle,
      react: {
        x: [0, -amp.pageX * 1.5, 0, amp.pageX * 1.5, 0],
        transition: { duration: 0.7, repeat: 2, ease: "easeInOut" as const },
      },
      rest: { x: 0, transition: { duration: 0 } },
    };
  }, [amp]);

  const blink = useMemo<Variants>(
    () => ({
      idle: {
        opacity: [0, 0, 1, 0, 0],
        transition: { duration: 4.4, repeat: Infinity, times: BLINK_TIMES, ease: "linear" as const },
      },
      react: {
        opacity: [0, 1, 0, 0],
        transition: { duration: 1.2, repeat: 1, times: [0, 0.2, 0.4, 1], ease: "linear" as const },
      },
      rest: { opacity: 0, transition: { duration: 0 } },
    }),
    [],
  );

  const travel = useMemo<Variants>(
    () => ({
      idle: {
        y: [0, -travelSpec.y, 0],
        x: [0, travelSpec.x, 0],
        opacity: [1, travelSpec.opacity, 1],
        transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" as const },
      },
      react: {
        y: [0, -travelSpec.y, 0],
        x: [0, travelSpec.x, 0],
        opacity: [1, travelSpec.opacity, 1],
        transition: { duration: 1.2, repeat: 1, ease: "easeInOut" as const },
      },
      rest: { y: 0, x: 0, opacity: 1, transition: { duration: 0 } },
    }),
    [travelSpec],
  );

  const leftMoves = !still && (amp.page === "left" || amp.page === "both");
  const rightMoves = !still && (amp.page === "right" || amp.page === "both");
  const brows: BrowShape = state === "found" ? "raised" : state === "working" ? "focused" : "none";

  const art: ReactNode = (
    <motion.div
      className={cn("relative", MASCOT_SIZES[size] ?? MASCOT_SIZES.md)}
      variants={body}
      initial={pose}
      animate={pose}
      onMouseEnter={() => !still && setReacting(true)}
      onMouseLeave={() => !still && setReacting(false)}
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
          <g>
            {leftMoves ? (
              <motion.g variants={page} initial={pose} animate={pose}>
                <path d={BOOK_LEFT} fill={palette.page} />
              </motion.g>
            ) : (
              <path d={BOOK_LEFT} fill={palette.page} />
            )}
            {rightMoves ? (
              <motion.g variants={page} initial={pose} animate={pose}>
                <path d={BOOK_RIGHT} fill={palette.pageSoft} />
              </motion.g>
            ) : (
              <path d={BOOK_RIGHT} fill={palette.pageSoft} />
            )}
            <path d={BOOK_FOLD} fill={palette.fold} />
          </g>
        )}

        <Face
          detail={detail}
          eyes={stateConfig.eyes}
          mouth={stateConfig.mouth}
          brows={brows}
          palette={palette}
          blink={blink}
          blinkPose={pose}
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
