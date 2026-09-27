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
  /**
   * Latar panggung di belakang maskot: tint 100-level dari aksen yang sama.
   *
   * Level 50 (`bg-blue-50` dll) ternyata hampir tidak terlihat di atas kartu
   * putih - kontrasnya cuma ~1.04 sehingga panggung ikut lenyap dan body putih
   * maskot tidak punya permukaan. Level 100 memberi ~1.10-1.22 sehingga
   * panggung terbaca sebagai bidang, sekaligus tetap pale: silhouette
   * ditentukan garis slate-700 2.5px yang kontrasnya >7:1 di semua stage.
   */
  stage: string;
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
 * Ukuran dalam px, sudah responsif lewat breakpoint Tailwind:
 * `xs` 32 untuk tile filter dan chip list, `sm` 48/56 untuk kartu ringkas dan
 * konteks admin, `md` 96/112/144 untuk kartu kategori publik, `lg` 160/208
 * untuk kategori unggulan. Semua `shrink-0` supaya tidak pernah mendorong
 * layout chip.
 */
export const CATEGORY_MASCOT_SIZES: Record<CategoryMascotSize, string> = {
  /* Filter (tile 44px) dan chip list/dashboard. */
  xs: "size-8",
  /* Kartu ringkas / konteks admin. */
  sm: "size-12 xl:size-14",
  /* Kartu kategori publik: 96 mobile, 112 tablet, 144 desktop. */
  md: "size-24 sm:size-28 xl:size-36",
  /* Kategori unggulan: 160 mobile, 208 desktop. */
  lg: "size-40 xl:size-52",
};

export const CATEGORY_MASCOT_TRAITS: Record<Category, CategoryMascotTrait> = {
  "Servis Teknik": {
    accessory: "wrench",
    expression: "focused",
    accent: "#2563EB",
    accentInk: "#1E3A8A",
    stage: "#DBEAFE", // blue-100
    motion: "clank",
    look: false,
  },
  "Hajatan & Acara": {
    accessory: "bow",
    expression: "cheerful",
    accent: "#EC4899",
    accentInk: "#9D174D",
    stage: "#FCE7F3", // pink-100
    motion: "sparkle",
    look: false,
  },
  Kuliner: {
    accessory: "bowl",
    expression: "warm",
    accent: "#F59E0B",
    accentInk: "#B45309",
    stage: "#FEF3C7", // amber-100
    motion: "steam",
    look: false,
  },
  Transportasi: {
    accessory: "route",
    expression: "ready",
    accent: "#0EA5E9",
    accentInk: "#0369A1",
    stage: "#E0F2FE", // sky-100
    motion: "drive",
    look: true,
  },
  "Jasa Umum": {
    accessory: "house",
    expression: "welcoming",
    accent: "#10B981",
    accentInk: "#047857",
    stage: "#D1FAE5", // emerald-100
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
  stage: "#F1F5F9", // slate-100
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
