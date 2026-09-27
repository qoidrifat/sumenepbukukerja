import type { Category } from "@/lib/catalog";

/**
 * Trait maskot per kategori - data murni, bukan UI.
 *
 * Dipisah dari komponen supaya `category-mascot.tsx` tetap hanya exporting
 * komponen + konstanta (aturan `react-refresh/only-export-components`), dan
 * supaya tabel ini bisa dibaca/diuji tanpa render.
 *
 * Kunci = literal `Category`, bukan slug, jadi `tsc` langsung gagal begitu
 * ada kategori baru di `src/lib/catalog.ts` tanpa trait. Warna diambil dari
 * gradient `vendor.accent` yang sudah dipakai katalog, jadi tidak ada warna
 * baru yang masuk ke tema publik.
 */

/** Benda kecil yang menempel di apron - tubuh tetap sama untuk semua kategori. */
export type CategoryMascotAccessory =
  | "wrench"
  | "bowl"
  | "bow"
  | "route"
  | "house"
  | "list";

/** Ekspresi hanya mengubah mulut diam, ukuran pipi, dan alis. */
export type CategoryMascotExpression =
  | "focused"
  | "warm"
  | "cheerful"
  | "ready"
  | "welcoming"
  | "neutral";

/** Gestur kecil khas kategori; semua tetap `transform` + `opacity`. */
export type CategoryMascotMotion =
  | "clank"
  | "steam"
  | "sparkle"
  | "drive"
  | "wave"
  | "bob";

export type CategoryMascotTrait = {
  accessory: CategoryMascotAccessory;
  expression: CategoryMascotExpression;
  /** Warna utama apron. */
  accent: string;
  /** Versi gelap dari warna yang sama, untuk garis aksesori. */
  accentInk: string;
  motion: CategoryMascotMotion;
  /** Kategori yang "siap jalan" mendapat tatapan pelan ke arah jalan. */
  look: boolean;
};

/* ------------------------------------------------------------------ */
/* Ukuran & konteks                                                    */
/* ------------------------------------------------------------------ */

export type CategoryMascotSize = "xs" | "sm" | "md" | "lg";
export type CategoryMascotContext = "public" | "admin";

/**
 * Ukuran dalam px: `xs` untuk tile filter/orbit, `sm` untuk baris vendor dan
 * daftar padat, `md` untuk kartu kategori, `lg` untuk kategori sorotan.
 * Semua `shrink-0` supaya tidak pernah mendorong layout chip.
 */
export const CATEGORY_MASCOT_SIZES: Record<CategoryMascotSize, string> = {
  xs: "size-6",
  sm: "size-8",
  md: "size-14",
  lg: "size-24",
};

export const CATEGORY_MASCOT_TRAITS: Record<Category, CategoryMascotTrait> = {
  "Servis Teknik": {
    accessory: "wrench",
    expression: "focused",
    accent: "#2563EB",
    accentInk: "#1E3A8A",
    motion: "clank",
    look: false,
  },
  "Hajatan & Acara": {
    accessory: "bow",
    expression: "cheerful",
    accent: "#EC4899",
    accentInk: "#9D174D",
    motion: "sparkle",
    look: false,
  },
  Kuliner: {
    accessory: "bowl",
    expression: "warm",
    accent: "#F59E0B",
    accentInk: "#B45309",
    motion: "steam",
    look: false,
  },
  Transportasi: {
    accessory: "route",
    expression: "ready",
    accent: "#0EA5E9",
    accentInk: "#0369A1",
    motion: "drive",
    look: true,
  },
  "Jasa Umum": {
    accessory: "house",
    expression: "welcoming",
    accent: "#10B981",
    accentInk: "#047857",
    motion: "wave",
    look: false,
  },
};

/** Pose netral untuk nilai di luar taxonomi (data lama, kategori baru, `null`). */
export const NEUTRAL_CATEGORY_MASCOT_TRAIT: CategoryMascotTrait = {
  accessory: "list",
  expression: "neutral",
  accent: "#94A3B8",
  accentInk: "#334155",
  motion: "bob",
  look: false,
};

/** "Servis Teknik" / "servis-teknik" / "SERVIS TEKNIK" -> satu kunci yang sama. */
const normalizeCategoryKey = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const TRAIT_LOOKUP: Record<string, CategoryMascotTrait> = Object.fromEntries(
  (Object.keys(CATEGORY_MASCOT_TRAITS) as Category[]).map((category) => [
    normalizeCategoryKey(category),
    CATEGORY_MASCOT_TRAITS[category],
  ]),
);

/** Trait untuk nilai kategori apa pun; selalu mengembalikan sesuatu. */
export function categoryMascotTrait(
  category: string | null | undefined,
): CategoryMascotTrait {
  if (typeof category !== "string") return NEUTRAL_CATEGORY_MASCOT_TRAIT;
  return TRAIT_LOOKUP[normalizeCategoryKey(category)] ?? NEUTRAL_CATEGORY_MASCOT_TRAIT;
}
