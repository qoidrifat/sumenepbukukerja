import { useState, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import {
  CATEGORY_MASCOT_SIZES,
  categoryMascotTrait,
  type CategoryMascotContext,
  type CategoryMascotMotion,
  type CategoryMascotSize,
  type CategoryMascotTrait,
} from "@/lib/category-mascot-traits";
import { cn } from "@/lib/utils";

/**
 * Sistem maskot kategori.
 *
 * Bukan lima file terpisah: satu karakter dasar (badan + papan + wajah +
 * apron), satu set primitif gerak, lalu tabel trait di
 * `@/lib/category-mascot-traits` yang hanya memilih aksesori, ekspresi,
 * aksen, dan gestur per kategori. Menambah atau mengganti kategori cukup
 * menyentuh satu `record` di sana.
 *
 * DNA-nya sama dengan `PublicRequestMascot` dan `AdminEmptyMascot`:
 * viewBox 120x120, stroke 2.5, mata rounded-rect + busur mata tertutup, dua
 * mulut (tenang/tersenyum) yang cross-fade lewat `opacity`, pipi bulat, dan
 * satu papan miring di belakang badan. Yang membedakan hanya siluet apron,
 * warna, dan ekspresi - jadi ketiganya terbaca sebagai satu keluarga.
 *
 * Gerak hanya `transform` + `opacity` yang diserahkan ke loop Framer Motion:
 * tanpa setInterval, tanpa re-render halaman, tanpa dependensi baru. Tidak ada
 * `rotate` di dalam SVG (origin CSS pada elemen SVG selalu di 0,0 sehingga
 * hasilnya meleset); rotasi hanya di `motion.div` HTML seperti dua maskot
 * sebelumnya. `prefers-reduced-motion` menyisakan satu pose statis, dan
 * `animated={false}` melompati seluruh motion controller untuk daftar padat.
 *
 * Murni dekoratif: nama kategori selalu dibawa teks di sebelahnya, jadi SVG
 * disembunyikan dari screen reader dan tidak pernah jadi target fokus.
 */

/* ------------------------------------------------------------------ */
/* Palet                                                               */
/* ------------------------------------------------------------------ */

type MascotPalette = {
  /** Badan kartu. */
  body: string;
  /** Papan miring di belakang. */
  board: string;
  /** Garis siluet. */
  line: string;
  /** Mata, alis, dan strap apron. */
  ink: string;
  cheek: string;
  /** Sudut badan: publik membulat, admin ikut Warm Brutalism. */
  radius: number;
};

const PUBLIC_PALETTE: MascotPalette = {
  body: "#FFFFFF",
  board: "#E2E8F0", // slate-200
  line: "#334155", // slate-700
  ink: "#0F172A", // slate-900
  cheek: "#FDE68A", // amber-200
  radius: 18,
};

const ADMIN_PALETTE: MascotPalette = {
  body: "#FDFBF7", // --admin-surface
  board: "#E7E5E4", // --admin-stone
  line: "#121212", // --admin-line
  ink: "#121212",
  cheek: "#E9B4A7", // --admin-terracotta
  radius: 2.5,
};

const PALETTES: Record<CategoryMascotContext, MascotPalette> = {
  public: PUBLIC_PALETTE,
  admin: ADMIN_PALETTE,
};

/* ------------------------------------------------------------------ */
/* Gerak                                                               */
/* ------------------------------------------------------------------ */

type MascotPose = "idle" | "react" | "rest";

/* Keyframe kedip identik dengan dua maskot sebelumnya: hanya ~0.3s dari siklus 7.4s. */
const BLINK_TIMES = [0, 0.86, 0.88, 0.9, 1];

const BODY: Variants = {
  idle: {
    scaleY: [1, 1.02, 1],
    y: [0, -1.4, 0],
    transition: {
      scaleY: { duration: 4.4, repeat: Infinity, ease: "easeInOut" },
      y: { duration: 4.4, repeat: Infinity, ease: "easeInOut" },
    },
  },
  react: {
    scaleY: [1, 1.05, 1],
    y: [0, -4, 0],
    transition: { duration: 0.9, ease: "easeInOut" },
  },
  rest: { scaleY: 1, y: 0 },
};

const LOOK: Variants = {
  idle: {
    x: [0, 2, 0, -2, 0],
    transition: { duration: 8.8, repeat: Infinity, ease: "easeInOut" },
  },
  react: { x: [0, 2.6, 0, 0], transition: { duration: 0.9, ease: "easeInOut" } },
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

/**
 * Ekspresi yang sudah tersenyum di keadaan diam (Kuliner, Hajatan & Acara)
 * tidak melakukan cross-fade saat hover - kalau tidak, senyumnya akan
 * berkedip hilang lalu muncul lagi setiap kali kursor masuk.
 */
const CALM_HIDDEN: Variants = {
  idle: { opacity: 0 },
  react: { opacity: 0 },
  rest: { opacity: 0 },
};

const SMILE_ALWAYS: Variants = {
  idle: { opacity: 1 },
  react: { opacity: 1 },
  rest: { opacity: 1 },
};

/* Bit kecil yang melayang sendiri (uap, konfeti, garis jalan, hati). */
const FLOAT: Variants = {
  float: {
    y: [0, -2.4, 0],
    opacity: [0.35, 1, 0.35],
    transition: {
      y: { duration: 3.4, repeat: Infinity, ease: "easeInOut" },
      opacity: { duration: 3.4, repeat: Infinity, ease: "easeInOut" },
    },
  },
  still: { y: 0, opacity: 1 },
};

/** Gestur aksesori per kategori; semuanya `x`/`y`/`scale` saja. */
const PROP: Record<CategoryMascotMotion, Variants> = {
  // Satu ketukan kecil, seperti alat yang baru dipakai.
  clank: {
    idle: {
      x: [0, -0.8, 0, 0],
      y: [0, 1.4, 0, 0],
      transition: { duration: 5.2, repeat: Infinity, ease: "easeInOut" },
    },
    react: {
      x: [0, 1.6, 0, 0],
      y: [0, 2.4, 0, 0],
      transition: { duration: 0.9, ease: "easeInOut" },
    },
    rest: { x: 0, y: 0 },
  },
  // Uap naik pelan.
  steam: {
    idle: { y: [0, -1.4, 0], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
    react: { y: [0, -2.6, 0], transition: { duration: 0.9, ease: "easeInOut" } },
    rest: { y: 0 },
  },
  // Pita mengembang sedikit.
  sparkle: {
    idle: { scale: [1, 1.06, 1], transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } },
    react: { scale: [1, 1.12, 1], transition: { duration: 0.9, ease: "easeInOut" } },
    rest: { scale: 1 },
  },
  // Badan melaju maju-mundur tipis.
  drive: {
    idle: {
      x: [0, 1.2, 0, -0.6, 0],
      transition: { duration: 4.6, repeat: Infinity, ease: "easeInOut" },
    },
    react: { x: [0, 2.4, 0, 0], transition: { duration: 0.9, ease: "easeInOut" } },
    rest: { x: 0 },
  },
  // Anggukan pelan.
  wave: {
    idle: { y: [0, -1.2, 0], transition: { duration: 3.8, repeat: Infinity, ease: "easeInOut" } },
    react: { y: [0, -2.4, 0], transition: { duration: 0.9, ease: "easeInOut" } },
    rest: { y: 0 },
  },
  // Fallback: napas sederhana.
  bob: {
    idle: { y: [0, -1.2, 0], transition: { duration: 4.2, repeat: Infinity, ease: "easeInOut" } },
    react: { y: [0, -2.2, 0], transition: { duration: 0.9, ease: "easeInOut" } },
    rest: { y: 0 },
  },
};

/* ------------------------------------------------------------------ */
/* Lapisan motion                                                      */
/* ------------------------------------------------------------------ */

function Layer({
  still,
  variants,
  children,
}: {
  still: boolean;
  variants: Variants;
  children: ReactNode;
}) {
  if (still) return <g>{children}</g>;
  return (
    <motion.g variants={variants} initial={false}>
      {children}
    </motion.g>
  );
}

function FloatLayer({ still, children }: { still: boolean; children: ReactNode }) {
  if (still) return <g>{children}</g>;
  return (
    <motion.g variants={FLOAT} initial={false} animate="float">
      {children}
    </motion.g>
  );
}

/* ------------------------------------------------------------------ */
/* Aksesori                                                            */
/* ------------------------------------------------------------------ */

function Accessory({
  trait,
  palette,
}: {
  trait: CategoryMascotTrait;
  palette: MascotPalette;
}) {
  /* Benda dicetak putih dengan garis versi gelap aksennya, di atas apron
     berwarna - kontrasnya tetap terbaca di tile gelap maupun kartu putih. */
  const solid = {
    fill: palette.body,
    stroke: trait.accentInk,
    strokeWidth: 2.5,
    strokeLinejoin: "round" as const,
  };
  const tick = {
    fill: "none" as const,
    stroke: trait.accentInk,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
  };

  return (
    <>
      {trait.accessory === "wrench" ? (
        <>
          <path d="M56.2 83v-3.2a3.8 3.8 0 0 1 7.6 0V83Z" {...solid} />
          <path d="M58 83h4v8a2 2 0 0 1-4 0Z" {...solid} />
        </>
      ) : null}

      {trait.accessory === "bowl" ? (
        <>
          <path d="M49 80.5h22a11 11 0 0 1-22 0Z" {...solid} />
          <path d="M46.5 80.5h27" {...tick} strokeWidth={2.5} />
        </>
      ) : null}

      {trait.accessory === "bow" ? (
        <>
          <path d="M60 81L47 74.5v13Z" {...solid} />
          <path d="M60 81l13-6.5v13Z" {...solid} />
          <circle cx="60" cy="81" r="3.2" {...solid} />
        </>
      ) : null}

      {trait.accessory === "route" ? (
        <>
          <path
            d="M60 71.5c-4.4 0-8 3.6-8 8 0 6 8 13.5 8 13.5s8-7.5 8-13.5c0-4.4-3.6-8-8-8Z"
            {...solid}
          />
          <circle cx="60" cy="79.5" r="2.6" fill={trait.accentInk} />
        </>
      ) : null}

      {trait.accessory === "house" ? (
        <path
          d="M60 72.5l13 11v7.5a3 3 0 0 1-3 3H50a3 3 0 0 1-3-3v-7.5Z"
          {...solid}
        />
      ) : null}

      {trait.accessory === "list" ? (
        <path
          d="M50 78.5h20M50 84.5h20M50 90.5h12"
          fill="none"
          stroke={palette.body}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      ) : null}
    </>
  );
}

/** Bit yang bergerak sendiri: uap, konfeti, garis jalan, atau hati. */
function AccessoryFloat({ trait }: { trait: CategoryMascotTrait }) {
  const tick = {
    fill: "none" as const,
    stroke: trait.accentInk,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
  };

  return (
    <>
      {trait.accessory === "wrench" ? (
        <>
          <path d="M68.5 77.5l2.8-2.8" {...tick} />
          <path d="M72.5 84.5l3.2 1.2" {...tick} />
        </>
      ) : null}

      {trait.accessory === "bowl" ? (
        <>
          <path d="M54 79c-1.7-1.7 1.7-3.4 0-5.1" {...tick} />
          <path d="M60 78c-1.7-1.7 1.7-3.4 0-5.1" {...tick} />
          <path d="M66 79c-1.7-1.7 1.7-3.4 0-5.1" {...tick} />
        </>
      ) : null}

      {trait.accessory === "bow" ? (
        <>
          <circle cx="47" cy="90.5" r="1.8" fill={trait.accentInk} />
          <circle cx="60" cy="91.5" r="1.8" fill={trait.accentInk} />
          <circle cx="73" cy="90.5" r="1.8" fill={trait.accentInk} />
        </>
      ) : null}

      {trait.accessory === "route" ? (
        <>
          <path d="M41 79.5h5.5" {...tick} strokeWidth={2.5} />
          <path d="M40 85.5h5" {...tick} strokeWidth={2.5} />
        </>
      ) : null}

      {trait.accessory === "house" ? (
        <path
          d="M60 90.5c-4-2.6-6-4.2-6-6.4a3 3 0 0 1 6-1.1 3 3 0 0 1 6 1.1c0 2.2-2 3.8-6 6.4Z"
          fill={trait.accentInk}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen                                                            */
/* ------------------------------------------------------------------ */

export interface CategoryMascotProps {
  /** Nama kategori apa pun; nilai di luar taxonomi jatuh ke maskot netral. */
  category: string;
  size?: CategoryMascotSize;
  context?: CategoryMascotContext;
  /** `false` melompati semua motion controller (daftar padat / orbit). */
  animated?: boolean;
  className?: string;
}

export function CategoryMascot({
  category,
  size = "sm",
  context = "public",
  animated = true,
  className,
}: CategoryMascotProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [reacting, setReacting] = useState(false);
  const still = reduceMotion || !animated;
  const pose: MascotPose = still ? "rest" : reacting ? "react" : "idle";

  const trait = categoryMascotTrait(category);
  const palette = PALETTES[context];
  const cheek = trait.expression === "cheerful" ? 4.6 : trait.expression === "warm" ? 4 : 3.4;
  const smiling = trait.expression === "cheerful" || trait.expression === "warm";

  /* Saat statis tidak ada motion controller yang menulis opacity, jadi nilainya
     ditulis langsung di atribut path. Saat animasi, atribut ini HARUS kosong -
     kalau tidak, atribut dan opacity group saling perkalian dan senyum hover
     tidak pernah terlihat. */
  const mouthCalm = smiling ? CALM_HIDDEN : MOUTH_CALM;
  const mouthSmile = smiling ? SMILE_ALWAYS : MOUTH_SMILE;
  const calmOpacity = still ? (smiling ? 0 : 1) : undefined;
  const smileOpacity = still ? (smiling ? 1 : 0) : undefined;

  const face = (
    <>
      <Layer still={still} variants={EYES_OPEN}>
        <rect x="44" y="40" width="9.5" height="10.5" rx="3.5" fill={palette.ink} />
        <rect x="66.5" y="40" width="9.5" height="10.5" rx="3.5" fill={palette.ink} />
      </Layer>

      <Layer still={still} variants={EYES_CLOSED}>
        <path d="M44 47c2.4-4.6 6.6-4.6 9 0" fill="none" stroke={palette.ink} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M66.5 47c2.4-4.6 6.6-4.6 9 0" fill="none" stroke={palette.ink} strokeWidth="2.5" strokeLinecap="round" />
      </Layer>

      <Layer still={still} variants={mouthCalm}>
        <path d="M55 57c3 2.4 7 2.4 10 0" fill="none" stroke={palette.ink} strokeWidth="2.5" strokeLinecap="round" opacity={calmOpacity} />
      </Layer>

      <Layer still={still} variants={mouthSmile}>
        <path d="M53 54.5c3 5.4 11 5.4 14 0Z" fill={palette.ink} opacity={smileOpacity} />
      </Layer>
    </>
  );

  const art = (
    <>
      <ellipse cx="60" cy="105" rx="30" ry="4.5" fill={palette.ink} opacity="0.08" />

      <g transform="rotate(-7 60 61)">
        <rect x="31" y="25" width="58" height="72" rx={palette.radius} fill={palette.board} stroke={palette.line} strokeWidth="2.5" />
      </g>

      <rect x="24" y="20" width="72" height="78" rx={palette.radius} fill={palette.body} stroke={palette.line} strokeWidth="2.5" />

      {trait.expression === "focused" ? (
        <>
          <path d="M44 35.5c3 1.4 5.5 2.4 8.5 4" fill="none" stroke={palette.ink} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M76 35.5c-3 1.4-5.5 2.4-8.5 4" fill="none" stroke={palette.ink} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : null}

      <circle cx="38.5" cy="56" r={cheek} fill={palette.cheek} />
      <circle cx="81.5" cy="56" r={cheek} fill={palette.cheek} />

      {trait.look ? (
        <Layer still={still} variants={LOOK}>
          {face}
        </Layer>
      ) : (
        face
      )}

      {/* Apron: satu-satunya bentuk yang membedakan antar kategori, dan hanya lewat warna. */}
      <path
        d="M45 72h30a7 7 0 0 1 7 7v7a8 8 0 0 1-8 8H46a8 8 0 0 1-8-8v-7a7 7 0 0 1 7-7Z"
        fill={trait.accent}
        stroke={palette.line}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M52 72c2.4-4.4 5.4-6.6 8-6.6s5.6 2.2 8 6.6"
        fill="none"
        stroke={trait.accentInk}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      <Layer still={still} variants={PROP[trait.motion]}>
        <Accessory trait={trait} palette={palette} />
      </Layer>

      <FloatLayer still={still}>
        <AccessoryFloat trait={trait} />
      </FloatLayer>
    </>
  );

  const svg = (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden="true" focusable="false">
      {art}
    </svg>
  );

  return (
    <span
      className={cn("inline-flex shrink-0", CATEGORY_MASCOT_SIZES[size], className)}
      aria-hidden="true"
    >
      {still ? (
        svg
      ) : (
        <motion.div
          className="size-full"
          variants={BODY}
          initial={false}
          animate={pose}
          onMouseEnter={() => setReacting(true)}
          onMouseLeave={() => setReacting(false)}
        >
          {svg}
        </motion.div>
      )}
    </span>
  );
}
