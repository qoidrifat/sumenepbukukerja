import type { Category } from "@/lib/catalog";
import { MASCOT_TOKENS, type MascotDetail } from "@/lib/mascot-geometry";

/**
 * Konfigurasi Brand Mascot — data murni, tanpa JSX.
 *
 * Semua keputusan "seperti apa karakter ini pada state tertentu" ada di sini
 * supaya `brand-mascot.tsx` tetap jadi renderer tipis dan tidak berubah jadi
 * rantai conditional. Menambah state = menambah satu baris di `STATES`.
 */

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/** Delapan state inti. Nama semantik, bukan namaPose. */
export type MascotState =
  | "neutral"
  | "hello"
  | "search"
  | "found"
  | "connect"
  | "success"
  | "empty"
  | "working";

export type MascotEyes = "open" | "closed-happy" | "narrowed" | "wide";
export type MascotMouth = "calm" | "smile" | "uncertain" | "round" | "flat";

export type MascotStateConfig = {
  /** Ringkasan singkat untuk dokumentasi dan preview. */
  readonly summary: string;
  readonly eyes: MascotEyes;
  readonly mouth: MascotMouth;
  readonly brows: boolean;
  readonly gesture: MascotBehaviour;
  /**
   * Tanda tanya halus untuk state yang butuh"Is it me?" — bahasa yang sama
   * dengan badge `?` PublicRequestMascot, tapi digambar ulang di zona aksesori
   * supaya tidak menabrak buku dan tidak menyalin geometrinya.
   */
  readonly queryMark: boolean;
  /** Bola mermaid dekoratif (untuk `found`/`success`). */
  readonly sparkle: boolean;
};

export const MASCOT_STATES: Record<MascotState, MascotStateConfig> = {
  neutral: {
    summary: "Default. Tenang, approachable, yakin.",
    eyes: "open",
    mouth: "calm",
    brows: false,
    gesture: "idle-bob",
    queryMark: false,
    sparkle: false,
  },
  hello: {
    summary: "Sapaan. Halaman kiri melambai pelan.",
    eyes: "open",
    mouth: "smile",
    brows: false,
    gesture: "hello-wave",
    queryMark: false,
    sparkle: false,
  },
  search: {
    summary: "Pencarian. Mata menelusuri halaman.",
    eyes: "open",
    mouth: "uncertain",
    brows: false,
    gesture: "search-peek",
    queryMark: false,
    sparkle: false,
  },
  found: {
    summary: "Jasa ketemu. Halaman sedikit terbuka.",
    eyes: "wide",
    mouth: "smile",
    brows: true,
    gesture: "open-reveal",
    queryMark: false,
    sparkle: true,
  },
  connect: {
    summary: "Menuju percakapan. Arahkan ke tujuan, tanpa logo WhatsApp.",
    eyes: "wide",
    mouth: "calm",
    brows: false,
    gesture: "directional-point",
    queryMark: false,
    sparkle: false,
  },
  success: {
    summary: "Aksi selesai. Syukur kecil, tanpa checkmark besar.",
    eyes: "closed-happy",
    mouth: "smile",
    brows: false,
    gesture: "celebration",
    queryMark: false,
    sparkle: true,
  },
  empty: {
    summary: "Kosong / tidak ada hasil. Penasar, tanda tanya halus.",
    eyes: "open",
    mouth: "round",
    brows: false,
    gesture: "idle-bob",
    queryMark: true,
    sparkle: false,
  },
  working: {
    summary: "Admin. Fokus, tenang, restrained.",
    eyes: "narrowed",
    mouth: "flat",
    brows: true,
    gesture: "focus-work",
    queryMark: false,
    sparkle: false,
  },
};

export const MASCOT_STATE_LIST = Object.keys(MASCOT_STATES) as MascotState[];

/* ------------------------------------------------------------------ */
/* Kategori                                                            */
/* ------------------------------------------------------------------ */

/**
 * Varian kategori. Tubuh karakter TIDAK berubah - hanya aksesori kecil di
 * `ACCESSORY_ZONE` dan warna aksennya. Warna diambil dari tabel trait yang
 * sudah dipakai `CategoryMascot`, jadi kedua maskot itu satu keluarga.
 */
export type MascotCategoryKey = "technical" | "events" | "culinary" | "transport" | "general";

export type MascotAccessory = "wrench" | "bow" | "bowl" | "route" | "house";

export type MascotCategoryConfig = {
  /** Literal `Category` dari katalog - supaya tidak ada kategori karangan. */
  readonly category: Category;
  readonly accessory: MascotAccessory;
  /**
   * Gerak yang menempel pada aksesori. Berbeda dari `MASCOT_STATES.gesture`
   * yang menggerakkan badan: yang ini menggerakkan bit kecil di sekitar
   * aksesori, jadi dua-duanya bisa jalan bersamaan tanpa saling menimpa.
   */
  readonly float: MascotFloat;
  readonly accent: string;
  readonly accentInk: string;
  readonly personality: string;
};

export type MascotFloat = "steam" | "confetti" | "clank" | "lines" | "none";

export const MASCOT_CATEGORIES: Record<MascotCategoryKey, MascotCategoryConfig> = {
  technical: {
    category: "Servis Teknik",
    accessory: "wrench",
    float: "clank",
    accent: "#2563EB",
    accentInk: "#1E3A8A",
    personality: "fokus, mumpuni",
  },
  events: {
    category: "Hajatan & Acara",
    accessory: "bow",
    float: "confetti",
    accent: "#EC4899",
    accentInk: "#9D174D",
    personality: "ceria",
  },
  culinary: {
    category: "Kuliner",
    accessory: "bowl",
    float: "steam",
    accent: "#F59E0B",
    accentInk: "#B45309",
    personality: "hangat, mengajak",
  },
  transport: {
    category: "Transportasi",
    accessory: "route",
    float: "lines",
    accent: "#0EA5E9",
    accentInk: "#0369A1",
    personality: "siap, tapi tetap tenang",
  },
  general: {
    category: "Jasa Umum",
    accessory: "house",
    float: "none",
    accent: "#10B981",
    accentInk: "#047857",
    personality: "membantu, hangat",
  },
};

export const MASCOT_CATEGORY_KEYS = Object.keys(MASCOT_CATEGORIES) as MascotCategoryKey[];

/* ------------------------------------------------------------------ */
/* Gerak                                                               */
/* ------------------------------------------------------------------ */

export type MascotBehaviour =
  | "idle-bob"
  | "hello-wave"
  | "search-peek"
  | "open-reveal"
  | "focus-work"
  | "directional-point"
  | "celebration"
  | "steam-drift"
  | "motion-lines"
  | "welcome-nod"
  | "none";

export type MascotBehaviourConfig = {
  /** Loop terus-menerus saat diam, atau sekali lalu kembali. */
  readonly loops: boolean;
  /** Deskripsi amplitude supaya mudah diaudit tidak terlalu berlebihan. */
  readonly amplitude: string;
  readonly summary: string;
};

export const MASCOT_BEHAVIOURS: Record<MascotBehaviour, MascotBehaviourConfig> = {
  "idle-bob": { loops: true, amplitude: "y 1.2 unit", summary: "Napas vertikal sangat halus." },
  "hello-wave": { loops: true, amplitude: "x 2 unit, page kiri", summary: "Halaman kiri melambai." },
  "search-peek": { loops: true, amplitude: "x 1.6 unit, mata", summary: "Mata menelusuri halaman." },
  "open-reveal": { loops: true, amplitude: "scaleY 1.03", summary: "Buku membuka sedikit." },
  "focus-work": { loops: true, amplitude: "y 0.8 unit, kontinyu", summary: "Langkah kecil terkontrol." },
  "directional-point": { loops: true, amplitude: "x 1.8 unit, halaman kanan", summary: "Halaman kanan mengarahkan." },
  celebration: { loops: true, amplitude: "y 2 unit + scale 1.04", summary: "Bounce kecil + kilau." },
  "steam-drift": { loops: true, amplitude: "y 2 unit, opacity", summary: "Uap naik dari aksesori." },
  "motion-lines": { loops: true, amplitude: "x 1.4 unit, opacity", summary: "Garis jalan bergerak." },
  "welcome-nod": { loops: true, amplitude: "y 1.2 unit, 2 siklus", summary: "Anggukan kecil, dua siklus." },
  none: { loops: false, amplitude: "0", summary: "Diam total (konteks admin rapat)." },
};

export const MASCOT_BEHAVIOUR_LIST = Object.keys(MASCOT_BEHAVIOURS) as MascotBehaviour[];

/* ------------------------------------------------------------------ */
/* Personalitas public vs admin                                        */
/* ------------------------------------------------------------------ */

export type MascotTone = "public" | "admin";

export type MascotToneConfig = {
  /** Warna garis + isi. Admin tetap satu warna di atas parchment. */
  readonly line: string;
  readonly page: string;
  readonly pageSoft: string;
  readonly fold: string;
  /** Aksesori kategori ditampilkan mulai tingkat detail ini. */
  readonly accessoryFrom: "large" | "hero";
  /** Gestur bawaan untuk konteks ini. */
  readonly defaultBehaviour: MascotBehaviour;
  readonly summary: string;
};

export const MASCOT_TONES: Record<MascotTone, MascotToneConfig> = {
  public: {
    line: MASCOT_TOKENS.ink,
    page: MASCOT_TOKENS.page,
    pageSoft: MASCOT_TOKENS.pageSoft,
    fold: MASCOT_TOKENS.fold,
    accessoryFrom: "large",
    defaultBehaviour: "idle-bob",
    summary: "Friendly, curious, warm. Aksesori dan gestur penuh.",
  },
  admin: {
    // Parchment `#FAF7EE` di atas `#FDFBF7` memberi pemisahan tipis tanpa
    // melanggar bahasa Warm Brutalism; warna_family tetap sama.
    line: "#1A1A1A",
    page: "#F5F0E5",
    pageSoft: "#EAE4D4",
    fold: "#FF5A26",
    accessoryFrom: "hero",
    defaultBehaviour: "focus-work",
    summary: "Focused, structured, calm. Aksesori hanya di hero, gerak minimal.",
  },
};

/* ------------------------------------------------------------------ */
/* Ukuran                                                              */
/* ------------------------------------------------------------------ */

export type MascotSize = "micro" | "sm" | "md" | "lg" | "hero";

/**
 * Kelas Tailwind per ukuran. `sm`/`lg` sengaja responsif supaya pemanggil
 * di list padat tidak perlu bikin varian baru.
 */
export const MASCOT_SIZES: Record<MascotSize, string> = {
  micro: "size-6",
  sm: "size-12 xl:size-14",
  md: "size-24 sm:size-28 xl:size-36",
  lg: "size-40 xl:size-52",
  hero: "size-64 xl:size-80",
};

export const MASCOT_SIZE_LIST = Object.keys(MASCOT_SIZES) as MascotSize[];

/**
 * Ukuran pemanggil -> tingkat detail. Nama keduanya sengaja berbeda:
 * `sm/md/lg` adalah bahasa Tailwind yang sudah dipakai komponen lain di
 * project, sementara `small/medium/large` adalah bahasa anatomi (seberapa
 * banyak yang boleh digambar). Tanpa peta ini, `DETAIL_RULES[size]` jadi
 * `undefined` dan komponen crash.
 */
export const MASCOT_SIZE_DETAIL: Record<MascotSize, MascotDetail> = {
  micro: "micro",
  sm: "small",
  md: "medium",
  lg: "large",
  hero: "hero",
};
