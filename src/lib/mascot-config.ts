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
    summary: "Default. Tenang, approachable, yakin. Badan bernapas pelan.",
    eyes: "open",
    mouth: "calm",
    brows: false,
    gesture: "idle-bob",
    queryMark: false,
    sparkle: false,
  },
  hello: {
    summary: "Sapaan. Halaman kiri melambai SEKALI saat muncul, lalu badan tenang.",
    eyes: "open",
    mouth: "smile",
    brows: false,
    gesture: "hello-wave",
    queryMark: false,
    sparkle: false,
  },
  search: {
    summary: "Pencarian. Mata menelusuri halaman bolak-balik, badan condong diam.",
    eyes: "open",
    mouth: "uncertain",
    brows: false,
    gesture: "search-peek",
    queryMark: false,
    sparkle: false,
  },
  found: {
    summary: "Jasa ketemu. Halaman membuka SEKALI saat muncul, kilau ikut mereda.",
    eyes: "wide",
    mouth: "smile",
    brows: true,
    gesture: "open-reveal",
    queryMark: false,
    sparkle: true,
  },
  connect: {
    summary: "Menuju percakapan. Halaman kanan menjangkau dan menahan arah, tanpa logo WhatsApp.",
    eyes: "wide",
    mouth: "calm",
    brows: false,
    gesture: "directional-point",
    queryMark: false,
    sparkle: false,
  },
  success: {
    summary: "Aksi selesai. Satu lompatan kecil saat muncul, lalu diam; tanpa checkmark besar.",
    eyes: "closed-happy",
    mouth: "smile",
    brows: false,
    gesture: "celebration",
    queryMark: false,
    sparkle: true,
  },
  empty: {
    summary: "Kosong / tidak ada hasil. Badan mengendap, mata melihat sekeliling, tanda tanya halus.",
    eyes: "open",
    mouth: "round",
    brows: false,
    gesture: "empty-wait",
    queryMark: true,
    sparkle: false,
  },
  working: {
    summary: "Admin / memproses. Fokus, tenang, langkah ritmis kecil yang tidak berhenti.",
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
  | "empty-wait"
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

/**
 * Kapan gestur ini hidup.
 *
 * `idle` — gestur adalah napas tetap state ini. Selama state dipakai, gerak
 *          ini terus berjalan; itu memang artinya (mata mencari, ritme kerja).
 * `burst` — gestur adalah SATU peristiwa: diputar sekali saat state masuk,
 *          saat pointer masuk, dan saat diketuk, lalu karakter tenang. Ini
 *          yang mencegah maskot melambai terus-menerus ke pengguna.
 */
export type MascotBehaviourRole = "idle" | "burst";

export type MascotBehaviourConfig = {
  readonly role: MascotBehaviourRole;
  /**
   * Loop terus-menerus saat diam, atau sekali lalu kembali.
   * Turunan dari `role`; disimpan eksplisit supaya tidak perlu menebak
   * ekuivalensinya di setiap pembaca.
   */
  readonly loops: boolean;
  /**
   * Deskripsi amplitude yang benar-benar dipakai `brand-mascot.tsx`
   * (`BODY_AMPLITUDE`), dalam unit viewBox 96. Kalau salah satu berubah,
   * barisnya harus ikut berubah - halaman `/__mascot` menampilkan string ini
   * apa adanya, jadi kalau basi, deskripsinya berbohong kepada reviewer.
   */
  readonly amplitude: string;
  readonly summary: string;
};

export const MASCOT_BEHAVIOURS: Record<MascotBehaviour, MascotBehaviourConfig> = {
  "idle-bob": {
    role: "idle",
    loops: true,
    amplitude: "idle y 1.2 | burst y 2.4",
    summary: "Napas vertikal sangat halus, tanpa henti.",
  },
  "empty-wait": {
    role: "idle",
    loops: true,
    amplitude: "idle y 0.7 + mata menoleh | burst y 1.2",
    summary: "Mengendap pelan sambil mata melihat sekeliling.",
  },
  "hello-wave": {
    role: "burst",
    loops: false,
    amplitude: "idle y 0.8 | burst x 2 halaman kiri + rotate 1.5deg",
    summary: "Halaman kiri melambai sekali saat state masuk; sesudah itu hanya napas.",
  },
  "search-peek": {
    role: "idle",
    loops: true,
    amplitude: "idle x 0.9 dua halaman + mata menyapu | burst x 1.35",
    summary: "Mata menyapu kiri-kanan, badan condong ke dalam dan menahan.",
  },
  "open-reveal": {
    role: "burst",
    loops: false,
    amplitude: "idle y 0.8 | burst x 2.4 dua halaman membuka",
    summary: "Antisipasi lalu halaman membuka sekali, kilau ikut mereda.",
  },
  "focus-work": {
    role: "idle",
    loops: true,
    amplitude: "idle y 0.8 + x 0.35 | burst y 1.2",
    summary: "Langkah ritmis kecil yang terkontrol, tidak pernah berhenti.",
  },
  "directional-point": {
    role: "idle",
    loops: true,
    amplitude: "idle x 0.5 halaman kanan | burst x 1.8",
    summary: "Halaman kanan menjangkau arah tujuan lalu menahan dengan pulsa tipis.",
  },
  celebration: {
    role: "burst",
    loops: false,
    amplitude: "idle y 0.7 | burst y 2 + rotate 1.5deg",
    summary: "Satu lompatan kecil plus kilau, lalu tenang. Tidak diulang.",
  },
  "steam-drift": {
    role: "idle",
    loops: true,
    amplitude: "aksesori y 2, opacity 0.78",
    summary: "Uap naik dari aksesori kategori.",
  },
  "motion-lines": {
    role: "idle",
    loops: true,
    amplitude: "aksesori x 1.4, opacity 0.78",
    summary: "Garis jalan bergerak pada aksesori.",
  },
  "welcome-nod": {
    role: "burst",
    loops: false,
    amplitude: "burst y 1.2 satu kali",
    summary: "Anggukan kecil satu kali.",
  },
  none: { role: "burst", loops: false, amplitude: "0", summary: "Diam total (konteks admin rapat)." },
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

/* ------------------------------------------------------------------ */
/* Phase 5 — gerak: tangga intensitas                                    */
/* ------------------------------------------------------------------ */

/**
 * Intensitas gerak yang bisa diminta pemanggil.
 *
 * Ini BUKAN reduced-motion (itu `prefers-reduced-motion`, ditangani
 * `useReducedMotion()`). Ini pilihan editorial: permukaan yang ramai
 * (tabel admin, splash rute) boleh meminta gerak yang lebih tenang tanpa
 * mematikan animasinya sama sekali.
 */
export type MascotIntensity = "reduced" | "normal" | "expressive";

export const MASCOT_INTENSITY_LIST: MascotIntensity[] = ["reduced", "normal", "expressive"];

/**
 * Pengali amplitudo per tingkat intensitas.
 *
 * 0.55 masih terbaca sebagai "hidup" tanpa menarik mata; 1.35 dipakai
 * hanya kalau reviewer memang ingin melihat gestur sepenuhnya.
 */
export const MASCOT_INTENSITY_SCALE: Record<MascotIntensity, number> = {
  reduced: 0.55,
  normal: 1,
  expressive: 1.35,
};

/**
 * Amplitudo gerak berdasarkan ukuran yang benar-benar dirender.
 *
 * Unit viewBox sudah menskalakan gerak secara proporsional, tapi itu justru
 * masalahnya: pada 96px gerak sekecil 1 unit hanya ~1 piksel dan terbaca
 * sebagai gemetar, bukan gestur. Karena itu lantai (`micro`, `sm`) dibekukan
 * total, `md` — ukuran yang dipakai semua integrasi produk dan sudah
 * diverifikasi di Phase 3/4 — ditahan di 0.8, dan `hero` boleh sedikit lebih
 * ekspresif.
 *
 * Amplitudo pose diam TIDAK ikut dikalikan: pose adalah identitas state dan
 * sudah dikunci pada nilainya (lihat `brand-mascot.test.ts` §8). Yang
 * diskalakan hanya osilasi.
 *
 * ── Satu ketidaksepakatan yang sengaja dibiarkan ──
 *
 * `DETAIL_RULES[*].gesture` di `mascot-geometry.ts` (modul beku) masih
 * `false` untuk `medium`, dan selama Phase 2-4 tidak ada satu pun pembaca
 * yang membaca flag itu. Phase 5 memilih mengikuti §17 — 96px harus tetap
 * bisa membedakan state lewat gerak, dengan amplitudo dikurangi — jadi `md`
 * di sini 0.8, bukan 0. Divergensi itu disematkan di
 * `mascot-animation.test.ts` supaya tidak bisa terlupakan; menyelaraskan
 * flag-nya berarti menyentuh modul beku, dan itu keputusan owner, bukan
 * keputusan fase animasi.
 */
export const MASCOT_SIZE_AMPLITUDE: Record<MascotSize, number> = {
  micro: 0,
  sm: 0,
  md: 0.8,
  lg: 1,
  hero: 1.15,
};

/**
 * Kepribadian kategori sebagai pengubah gerak — BUKAN pengganti state.
 *
 * `personality` di `MASCOT_CATEGORIES` adalah sumber teksnya; angka di sini
 * hanya menerjemahkan kata-kata itu menjadi tempo. Amplitudo tetap milik
 * state: `hello` + kategori apa pun tetap harus terbaca sebagai hello.
 *
 * `energy` mengali amplitudo, `tempo` mengali durasi (lebih besar = lebih
 * pelan).
 */
export type MascotCategoryMotion = { readonly energy: number; readonly tempo: number };

export const MASCOT_CATEGORY_MOTION: Record<MascotCategoryKey, MascotCategoryMotion> = {
  /* "fokus, mumpuni" */ technical: { energy: 0.9, tempo: 1.1 },
  /* "ceria" */ events: { energy: 1.2, tempo: 0.9 },
  /* "hangat, mengajak" */ culinary: { energy: 1.05, tempo: 1 },
  /* "siap, tapi tetap tenang" */ transport: { energy: 1, tempo: 0.92 },
  /* "membantu, hangat" */ general: { energy: 1, tempo: 1.05 },
};

/**
 * Karakter gerak per tone.
 *
 * Tone tetap tidak boleh mengubah arti state — `admin` hanya mengecilkan
 * amplitudo dan memperlambat tempo supaya workspace tidak terasa ramai.
 */
export type MascotToneMotion = { readonly energy: number; readonly tempo: number };

export const MASCOT_TONE_MOTION: Record<MascotTone, MascotToneMotion> = {
  public: { energy: 1, tempo: 1 },
  /* "Focused, structured, calm. Aksesori hanya di hero, gerak minimal." */
  admin: { energy: 0.7, tempo: 1.25 },
};

/**
 * Batas gerak mata ("gaze") dalam unit viewBox.
 *
 * ── Kenapa hanya satu sumbu ──
 *
 * Angka ini bukan selera, dan sumbunya bukan pilihan gaya:
 *
 *  - Horizontal: jarak mata ke spine adalah 3 unit untuk bentuk mata
 *    terlebar, dan `brand-mascot.test.ts` sudah mengunci minimum itu. Jadi
 *    total (maxX + clearance) tidak boleh lebih dari 3. 1.5 + 1.5 = 3.
 *  - Vertikal: TIDAK ADA. Celah antara mata terlebar dan tepi atas goresan
 *    mulut adalah 0.6 unit, dan pada pasangan yang benar-benar dipakai
 *    state `empty` (mata `open` + mulut `round`) hanya 0.1 unit. Gerak
 *    vertikal sekecil apa pun akan membuat mata menyentuh mulut. Karena itu
 *    lapisan gaze sengaja tidak punya `maxY` sama sekali: "hidup" vertikal
 *    dibawa badan (L0), bukan mata.
 *
 * `mascot-animation.test.ts` menghitung ULANG kedua anggaran itu dari
 * `mascot-geometry` dan gagal kalau angka di sini melenceng.
 */
export const MASCOT_GAZE = {
  maxX: 1.5,
  /** Cadangan jarak ke spine yang harus tetap tersisa saat mata bergeser. */
  clearance: 1.5,
} as const;

/**
 * Pola kedip.
 *
 * Kedip tetap bukan loop berhenti-berhenti tiap beberapa detik: satu siklus
 * panjang berisi dua kedip yang jaraknya TIDAK rata, lalu tiap instance
 * menggeser `delay` dan `duration`-nya sendiri supaya dua maskot di satu
 * halaman tidak pernah berkedip serentak.
 *
 * `times` adalah posisi tiap kedip di dalam siklus (0..1).
 */
export const MASCOT_BLINK = {
  /** Posisi kedip dalam satu siklus, sengaja tidak rata. */
  times: [0, 0.14, 0.155, 0.17, 0.52, 0.545, 0.565, 1] as const,
  /** Opacity tutup mata di tiap titik. Indeks sejajar dengan `times`. */
  opacity: [0, 0, 1, 0, 0, 1, 0, 0] as const,
  /** Rentang siklus (detik). Instance memilih nilainya sendiri. */
  cycleMin: 8.5,
  cycleMax: 13.5,
  /** Rentang jeda awal (detik), supaya tidak semua mulai bersamaan. */
  delayMax: 3.2,
  /** Kedip sengaja saat gestur diputar (burst): satu kali, cepat. */
  burstDuration: 0.26,
} as const;

/* ------------------------------------------------------------------ */
/* Phase 5 — data gerak                                                */
/* ------------------------------------------------------------------ */

/**
 * Kosakata waktu. Semua nilai dalam detik, sebelum dikali `tempo` (kategori
 * + tone). Tidak ada durasi yang ditulis langsung di badan komponen.
 *
 * Rentangnya mengikuti §6 bahasa gerak: micro 120-180ms, gesture 280-500ms
 * (di sini 620ms karena gesturnya punya fase settle), transisi state
 * 350-700ms, idle 2200-4200ms.
 */
export const MASCOT_TIMING = {
  /** micro reaction: kedip pada gestur, jeda sebelum berhenti. */
  micro: 0.14,
  /** gesture: satu burst (masuk state, hover, ketuk). */
  gesture: 0.62,
  /** state transition: tween pose antar state. */
  transition: 0.5,
  /** idle loop: napas + osilasi halaman. */
  idle: 3.9,
  /** float loop aksesori/kilau. */
  float: 2.4,
} as const;

/** Berapa lama `react` ditahan sebelum kembali ke `idle`, dalam milidetik. */
export function mascotBurstMs(tempo: number) {
  return Math.round(MASCOT_TIMING.gesture * tempo * 1000);
}

/**
 * Amplitude per gestur, dalam unit viewBox.
 *
 * ── Kenapa pose dan osilasi dipisah ──
 *
 * `poseLeft/poseRight/poseShift` adalah identitas state pada frame diam. Ia
 * TIDAK pernah dikalikan `scale`: pose sudah dikunci nilainya (dan diuji di
 * `brand-mascot.test.ts` §8), sementara `scale` berubah menurut ukuran,
 * kategori, tone, dan intensitas. Kalau pose ikut diskalakan, `hello` di 96px
 * dan di 208px akan punya pose yang berbeda - dan state berhenti bisa
 * dibedakan tanpa animasi.
 *
 * `idle*` adalah osilasi yang berjalan terus; `burst*` adalah gestur sekali
 * jadi. Untuk `role: "burst"` nilainya besar (itu satu-satunya cara state itu
 * bicara); untuk `role: "idle"` nilainya kecil (napas, bukan gestur).
 *
 * `burstPageLeft`/`burstPageRight` bertanda: negatif = halaman keluar,
 * positif = halaman masuk ke dalam. Dua halaman dengan tanda berlawanan =
 * buku membuka (found), tanda sama = buku menggeser (napas).
 */
export type MascotBodySpec = {
  poseLeft: number;
  poseRight: number;
  poseShift: number;
  idleDy: number;
  idlePageLeft: number;
  idlePageRight: number;
  idleTilt: number;
  burstDy: number;
  burstPageLeft: number;
  burstPageRight: number;
  burstTilt: number;
};

const P = (spec: Partial<MascotBodySpec>): MascotBodySpec => ({
  poseLeft: 0,
  poseRight: 0,
  poseShift: 0,
  idleDy: 0,
  idlePageLeft: 0,
  idlePageRight: 0,
  idleTilt: 0,
  burstDy: 0,
  burstPageLeft: 0,
  burstPageRight: 0,
  burstTilt: 0,
  ...spec,
});

export const MASCOT_BODY_AMPLITUDE: Record<string, MascotBodySpec> = {
  /* Tenang, approachable: napas, tanpa gestur yang perlu diperhatikan. */
  "idle-bob": P({ idleDy: 1.2, burstDy: 2.4 }),
  /* Mengendap sedikit lalu mata melihat sekeliling (drift ada di GAZE_DRIFT). */
  "empty-wait": P({ idleDy: 0.7, burstDy: 1.2 }),
  /* Halaman kiri terbuka ke luar = menyapa. Burst, bukan loop: kalau
     di-loop, maskot melambai terus ke pengguna sepanjang halaman hidup. */
  "hello-wave": P({
    poseLeft: -2.2,
    idleDy: 0.8,
    burstDy: 1.4,
    burstPageLeft: -2,
    burstTilt: 1.5,
  }),
  /* Kedua halaman masuk ke dalam = condong untuk melihat. Ini memang loop:
     arti state `search` baru lengkap kalau matanya terus menyapu. */
  "search-peek": P({
    poseLeft: 1.2,
    poseRight: -1.2,
    idleDy: 0.6,
    idlePageLeft: 0.9,
    idlePageRight: 0.9,
    burstDy: 1,
    burstPageLeft: -0.6,
    burstPageRight: 0.6,
  }),
  /* Antisipasi lalu halaman membuka ke dua sisi. Burst. */
  "open-reveal": P({
    poseLeft: -0.8,
    poseRight: 0.8,
    idleDy: 0.8,
    burstDy: 1.2,
    burstPageLeft: -1.2,
    burstPageRight: 1.2,
  }),
  /* Langkah ritmis kecil: halaman menutup-membuka sedikit, terus-menerus. */
  "focus-work": P({
    idleDy: 0.8,
    idlePageLeft: -0.3,
    idlePageRight: 0.3,
    burstDy: 1.2,
  }),
  /* Halaman kanan menjangkau arah tujuan, lalu menahan dengan pulsa tipis. */
  "directional-point": P({
    poseRight: 2.4,
    idleDy: 0.6,
    idlePageRight: 0.5,
    burstDy: 1,
    burstPageRight: 1.8,
  }),
  /* Satu lompatan. Burst: "One small bounce is enough." Phase 5.1: amplitudo
     diturunkan dari 3 unit / 2° ke 2.0 / 1.5° — rasio lompatan terhadap napas
     dulu 4.3x, satu-satunya outlier di keluarga gestur (yang lain 1.5-1.75x),
     dan §7 menandai success sebagai state paling berisiko terbaca kekanak-
     kanakan. Kini di bawah tanggapan hover/ketuk neutral (2.4). */
  celebration: P({ idleDy: 0.7, burstDy: 2, burstTilt: 1.5 }),
  "steam-drift": P({ idleDy: 0.8, burstDy: 1.2 }),
  "motion-lines": P({ idleDy: 0.6, burstDy: 1 }),
  "welcome-nod": P({ idleDy: 1.2, burstDy: 2, burstTilt: 1 }),
  none: P({}),
};

/**
 * Sapuan mata mandiri, dalam unit viewBox. Hanya untuk state yang artinya
 * memang "mata mencari" atau "melihat sekeliling" - state lain matanya
 * menetap, karena mata yang bergerak tanpa alasan adalah bahasa kartun.
 *
 * Satu sumbu saja, sama seperti gaze pointer: tidak ada ruang vertikal
 * (lihat `MASCOT_GAZE`). Nilai terbesarnya tetap di bawah `maxX`, dan
 * `mascot-animation.test.ts` yang menjaganya.
 */
export type MascotGazeDrift = { x: number[]; times: number[]; duration: number };

export const MASCOT_GAZE_DRIFT: Record<string, MascotGazeDrift> = {
  "search-peek": {
    x: [0, 1.1, 0.25, -1.1, 0.1, 0],
    times: [0, 0.2, 0.36, 0.56, 0.72, 1],
    duration: 5.2,
  },
  "empty-wait": {
    x: [0, 0.85, 0.15, -0.7, 0],
    times: [0, 0.26, 0.5, 0.78, 1],
    duration: 6.4,
  },
};

/**
 * Titik pointer -> pergeseran mata, dibatasi `MASCOT_GAZE.maxX`.
 *
 * Fungsi murni supaya batasnya bisa diuji tanpa browser: kasus paling
 * ekstrem (pointer jauh di luar elemen, elemen selebar 0) tetap harus
 * menghasilkan nilai di dalam clamp, bukan `NaN` atau nilai tak terbatas.
 */
export function mascotGazeFromPoint(
  point: { clientX: number },
  rect: { left: number; width: number },
): { x: number } {
  if (!(rect.width > 0)) return { x: 0 };
  const offset = (point.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
  if (!Number.isFinite(offset)) return { x: 0 };
  return { x: Math.max(-1, Math.min(1, offset)) * MASCOT_GAZE.maxX };
}

/**
 * Jitter kedip per instance, dari `useId()` — bukan `Math.random()`.
 *
 * `Math.random()` saat render melanggar aturan purity React (nilainya bisa
 * berbeda di render berikutnya), dan `react-hooks/purity` menangkapnya
 * sebagai error. `useId()` stabil per instance, unik per posisi di pohon, dan
 * deterministik antara server dan klien. Hash FNV-1a menyebarkannya rata:
 * 200 id berurutan mengisi kesepuluh desil tanpa bias.
 */
export function mascotBlinkJitter(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
