/**
 * Anatomi Brand Mascot — Phase 2.
 *
 * Mascot ini bukan gambar baru: tubuhnya adalah path yang PERSIS sama dengan
 * brand mark Phase 1 (`scripts/brand/mark.mjs`), ditambah lapisan wajah,
 * gestur, dan aksesori. `scripts/mascot/validate-mascot.mjs` membandingkan
 * string di file ini dengan `mark.mjs` dan gagal bila berbeda — jadi
 * "turunkan DNA logo" bukan klaim, tapi kondisi yang dijaga.
 *
 * Coordinate system: `viewBox 0 0 96 96`, sama persis dengan logo. Semua
 * angka di bawah dibaca dari geometri Phase 1, bukan dipilih sembarangan.
 *
 * Bentuk tubuh TIDAK pernah berubah antar state, kategori, atau ukuran.
 * Yang berubah hanya lapisan di atasnya. Itu yang membuat satu karakter
 * tetap terbaca sebagai satu karakter di mana pun.
 *
 * ── Tiga aturan geometri yang mengikat semua angka di bawah ──────────
 *
 * 1. BIDANG (field) wajib. Jarak 8 unit di tengah spine adalah negative
 *    space. Tanpa field, jarak itu berwarna sama dengan halaman putih dan
 *    buku menyatu jadi satu gumpalan. Field juga yang membuat maskot
 *    terbaca di atas permukaan gelap.
 *
 * 2. SIMETRI. Semua pasangan mata, senyum, dan alis dicerminkan tepat
 *    terhadap x=48. Sisi kiri berakhir di x<=44, sisi kanan mulai di x>=52,
 *    jadi tidak ada sapuan yang menyeberang spine.
 *
 * 3. ZONA LIPAT KOSONG. Tidak ada bagian wajah, gestur, atau dekorasi
 *    boleh masuk ke FOLD_ZONE. Lipatan adalah tanda tangan karakter.
 */

/* ------------------------------------------------------------------ */
/* Wadah & warna                                                       */
/* ------------------------------------------------------------------ */

export const MASCOT_VIEW_BOX = { x: 0, y: 0, width: 96, height: 96 } as const;

/** Palet. Semuanya token yang sudah dipakai brand dan halaman publik. */
export const MASCOT_TOKENS = {
  /** Garis siluet dan mata. Sama dengan INK PublicRequestMascot. */
  ink: "#0F172A",
  /** Halaman kiri, sama seperti logo. */
  page: "#FFFFFF",
  /** Halaman kanan, sama seperti logo. */
  pageSoft: "#DBEAFE",
  /** Sudut terlipat — satu-satunya aksen hangat. */
  fold: "#F59E0B",
  /** Varian admin: garis dan isi satu warna. */
  charcoal: "#121212",
  /** Permukaan admin. */
  adminSurface: "#FDFBF7",
} as const;

/* ------------------------------------------------------------------ */
/* Geometri Phase 1 — jangan diubah                                    */
/* ------------------------------------------------------------------ */

/** Persegi bundar pembawa. Identik dengan FIELD di mark.mjs. */
export const MASCOT_FIELD = { x: 4, y: 4, width: 88, height: 88, rx: 22 } as const;

/** Halaman kiri. String ini harus identik dengan mark.mjs. */
export const BOOK_LEFT =
  "M44 30.6C37.6 26.9 30.4 25.9 23.6 28.1L19.4 29.8C17.3 30.6 16 32.5 16 34.8V61.5C16 64 17.8 66 20.2 65.2L44 59.4Z";

/** Halaman kanan, dengan sudut kanan-atas dipotong garis lipatan. */
export const BOOK_RIGHT =
  "M52 30.6C57 27.6 62 26.6 67 27.8L80 40.8V61.5C80 64 78.2 66 75.8 65.2L52 59.4Z";

/** Sudut terlipat. Signature feature, tidak boleh hilang di state hero. */
export const BOOK_FOLD = "M67 27.8L80 40.8L67 40.8Z";

/** Bentuk MICRO: buku menyatu tanpa jarak tengah, lipatan berbentuk blok. */
export const BOOK_MICRO =
  "M13 33C21 26.8 31 25.4 40 28.8V67.4C31 63 21 63.2 13 67.6Z" +
  "M48 29C50 27.2 52 26.6 53 27.2L73 47.2V67.4C66 64.6 57 63.4 48 63.4Z";

export const BOOK_MICRO_FOLD = "M53 27.2L73 47.2L53 47.2Z";

/** Lebar stroke: 2.5 dari 96 = 2.6%, konsisten dengan tiga maskot lama. */
export const MASCOT_STROKE = 2.5;

/* ------------------------------------------------------------------ */
/* Zona — batas yang dijaga validator                                  */
/* ------------------------------------------------------------------ */

/** Batas luar tubuh (book penuh, bukan field). */
export const BODY_BOUNDS = { x: 16, y: 25.9, width: 64, height: 39.3 } as const;

/**
 * Batas sudut terlipat. Aturan keras: tidak ada bagian wajah, gestur, atau
 * dekorasi yang boleh masuk ke sini. Lipatan adalah tanda tangan karakter.
 */
export const FOLD_ZONE = { x: 67, y: 27.8, width: 13, height: 13 } as const;

/**
 * Batas isi field. Semua dekorasi harus di dalam sini, kalau tidak ia akan
 * bocor keluar dari sudut bundar dan terlihat seperti bug render.
 */
export const FIELD_INSET = 8;

/**
 * Zona aksesori: pita di bawah buku, di dalam field. Dipilih supaya
 * aksesori tidak pernah menutupi buku maupun lipatan, dan bisa dilepas
 * tanpa merusak karakter.
 */
export const ACCESSORY_ZONE = { x: 37, y: 67, width: 22, height: 22 } as const;

/** Pojok dekorasi: sisa field yang tidak dipakai buku maupun aksesori. */
export const DECOR_ZONES = {
  topLeft: { x: 9, y: 9, width: 22, height: 18 },
  bottomLeft: { x: 9, y: 68, width: 22, height: 20 },
  bottomRight: { x: 65, y: 68, width: 22, height: 20 },
} as const;

/** Sumbu simetri seluruh karakter. */
export const AXIS_X = 48;

/* ------------------------------------------------------------------ */
/* Wajah                                                               */
/* ------------------------------------------------------------------ */

/**
 * Mata. Lebar 7 dengan offset simetris terhadap x=48: mata kiri 33..40,
 * mata kanan 56..63. Jarak ke spine 4 unit, jarak ke lipatan 4 unit —
 * keduanya dihitung, bukan dikira-kira (lihat validate-mascot.mjs).
 */
export const EYE = {
  width: 7,
  height: 9,
  radius: 3,
  leftX: 33,
  rightX: 56,
  y: 40,
} as const;

/**
 * Mata terfokus untuk state `working`.
 *
 * Dulu 6 x 3 - hanya 3 unit tinggi, jadi yang terlihat hanyalah celah
 * datar dan terbaca sebagai "menyipit". Sekarang 6.5 x 4.5 dengan radius
 * lebih bulat: tetap jelas lebih fokus dari mata biasa, tapi bukan celah tajam.
 */
export const EYE_NARROW = {
  width: 6.5,
  height: 4.5,
  radius: 2,
  leftX: 33.25,
  rightX: 56.25,
  y: 41.5,
} as const;

/**
 * Mata terlebar untuk state `found` dan `connect`.
 *
 * Dulu 7.5 x 10 - hanya 0.5 unit lebih besar dari mata biasa, dan itu
 * berarti 0.5 PIKEL di layar 96px: secara visual `found` dan `neutral`
 * hampir identik. Sekarang 9 x 11, jadi "+2 unit" terbaca sebagai mata
 * yang benar-benar terbuka lebar.
 */
export const EYE_WIDE = {
  width: 9,
  height: 11,
  radius: 4,
  leftX: 31.75,
  rightX: 55.25,
  y: 39,
} as const;

/** Mata tertutup untuk state `success`. Busur turun, cermin sempurna. */
export const EYE_CLOSED_HAPPY = {
  left: "M33 46C35.5 49 38.5 49 41 46",
  right: "M55 46C57.5 49 60.5 49 63 46",
  strokeWidth: 2.2,
} as const;

/** Alis. Dua bentuk: naik (found) dan mencondong (working). */
export const BROWS = {
  raised: {
    left: "M32.5 36.8C35 35.4 38 35.4 40.5 36.8",
    right: "M63.5 36.8C61 35.4 58 35.4 55.5 36.8",
    strokeWidth: 2.2,
  },
  /**
   * Alis fokus untuk `working`. Kemiringannya diturunkan dari turunan
   * `C35 37.4 38 38.6 41 39.2` (turun 2.7 unit ke arah dalam = keras)
   * menjadi `C35 37.3 38 37.9 41 38.4` (turun 1.6 unit). Arahnya tetap sama
   * sehingga tetap "fokus", tapi tidak lagi terlihat tegang.
   */
  focused: {
    left: "M32.5 36.8C35 37.3 38 37.9 41 38.4",
    right: "M63.5 36.8C61 37.3 58 37.9 55 38.4",
    strokeWidth: 2.2,
  },
} as const;

/**
 * Mulut. Empat bentuk, semuanya terpecah di spine supaya tidak pernah
 * menggambar garis melayang di atas negative space.
 */
export const MOUTHS = {
  /** Tenang: busur sangat dangkal. */
  calm: {
    left: "M34 53.5C36.5 55.4 40.5 55.4 43 53.5",
    right: "M62 53.5C59.5 55.4 55.5 55.4 53 53.5",
    strokeWidth: 2.2,
  },
  /** Senyum: busur lebih dalam. */
  smile: {
    left: "M33.5 52.5C37 56 40.5 57 43.5 57",
    right: "M62.5 52.5C59 56 55.5 57 52.5 57",
    strokeWidth: 2.2,
  },
  /** Bingung: busur terbalik kecil, terbaca sebagai "hmm" tanpa bikin "o". */
  uncertain: {
    left: "M34 55.5C37.5 53.4 40.5 53.4 43.5 55.5",
    right: "M62 55.5C58.5 53.4 55.5 53.4 52.5 55.5",
    strokeWidth: 2.2,
  },
  /**
   * `working`. Dulu garis lurus `M35 54.5h7.5` - bersama alis yang menuram
   * membuat state ini terbaca "santai" dan sedikit galak. Sekarang busur
   * sangat dangkal: tetap datar dan tetap berbeda dari senyum, tapi longgar
   * ("santai, saya handle").
   */
  flat: {
    left: "M35 54.2C36.8 55 39 55 40.5 54.2",
    right: "M60.5 54.2C59 55 56.8 55 55.5 54.2",
    strokeWidth: 2.2,
  },
  /**
   * Kecil bundar untuk state `empty` — "o" yang terpecah di spine. Versi
   * utuh (satu oval tegak di x=48) akan menggambar garis tepat di atas
   * negative space, jadi bentuknya dipisah kiri-kanan dan tetap terbaca
   * sebagai satu mulut kecil.
   */
  round: {
    left: "M43 51.5c-1.6 0-2.6 1.2-2.6 2.6s1 2.6 2.6 2.6",
    right: "M53 51.5c1.6 0 2.6 1.2 2.6 2.6s-1 2.6-2.6 2.6",
    strokeWidth: 2.2,
  },
} as const;

/* ------------------------------------------------------------------ */
/* Aksesori                                                            */
/* ------------------------------------------------------------------ */

/**
 * Aksesori kategori, semua di dalam kotak 22x22 di ACCESSORY_ZONE.
 *
 * Tiap bentuk memakai teknik yang paling cocok untuknya, bukan satu gaya
 * untuk semuanya: bentuk yang punya "bodi" (mangkuk, panah, rumah) diisi
 * solid, bentuk yang punya "rinbowan" (kunci pas, pita) digores dengan
 * ujung bulat. Aksesori baru muncul di tingkat `large` ke atas, jadi pada
 * 160px stroke 2.6 unit tampil 4.3px - jauh dari hairline.
 *
 * `stroke: true` berarti path digores; `width` opsional untuk menebalkan
 * gagang kunci pas. Semua path sudah diukur oleh validate-mascot.mjs.
 */
export type MascotAccessoryPart = {
  d: string;
  /** `true` = digores dengan ujung bulat; tidak diisi -> bidang padat. */
  stroke?: boolean;
  /** Setebal khusus, dipakai pada gagang kunci pas. */
  width?: number;
};

export type MascotAccessoryKey = "wrench" | "bowl" | "bow" | "route" | "house";

export const ACCESSORIES: Record<MascotAccessoryKey, readonly MascotAccessoryPart[]> = {
  /** Kunci pas: kepala terbuka + gagang, untuk Servis Teknik. */
  wrench: [
    { d: "M46.5 70.2A5.2 5.2 0 1 1 40.5 70.2", stroke: true },
    { d: "M46.4 76.4 54 83.6", stroke: true, width: 3.4 },
  ],
  /** Mangkuk + asap. */
  bowl: [
    { d: "M40 75.5h16a1.6 1.6 0 0 1 0 3.2H40a1.6 1.6 0 0 1 0-3.2Z" },
    { d: "M40 78.7h16a1.3 1.3 0 0 1 0 2.4 16 8.5 0 0 1-16 0 1.3 1.3 0 0 1 0-2.4Z" },
    { d: "M45 73.5c-1.1-1.1-1.1-2.4 0-3.5M51 73.5c1.1-1.1 1.1-2.4 0-3.5", stroke: true },
  ],
  /** Pita: dua simpul + dua pita yang menjuntai. */
  bow: [
    { d: "M47.5 78c-3-4.5-8-4.5-8 0s5 4.5 8 0Z", stroke: true },
    { d: "M48.5 78c3-4.5 8-4.5 8 0s-5 4.5-8 0Z", stroke: true },
    { d: "M47 79.5 45 86.5M49 79.5 51 86.5", stroke: true },
  ],
  /**
   * Panah blok + dua garis jalan: untuk Transportasi.
   *
   * Diperkecil dari lebar 20.7 unit (terlebar di antara semua aksesori) jadi
   * 19.4, sejajar dengan yang lain. Ujung panah ditarik masuk supaya tidak
   * menyentuh sisi field.
   */
  route: [
    { d: "M42 74.6h6v-3.8l9 7.2-9 7.2v-3.8h-6Z" },
    { d: "M37.6 75.6h2.4v4h-2.4ZM37.6 81h4v4h-4Z" },
  ],
  /** Rumah + pintu: untuk Jasa Umum. */
  house: [{ d: "M48 68.5 58 78h-3v10h-4.2v-6.2h-5.6V88H41V78h-3Z" }],
};

/* ------------------------------------------------------------------ */
/* Dekorasi                                                            */
/* ------------------------------------------------------------------ */

/**
 * Kilau empat bidder. Untuk `found`/`success`. Bentuk tetap membulat sama
 * dengan bahasa logo, supaya tidak terbaca sebagai bintang emoji.
 */
export const SPARKLES = [
  { x: 15, y: 14, r: 2.6 },
  { x: 25, y: 21, r: 1.7 },
  { x: 21, y: 11, r: 1.4 },
  { x: 12, y: 23, r: 1.2 },
] as const;

/**
 * Tanda tanya untuk state `empty`. Digambar ulang di pojok kiri-bawah
 * field — bentuk yang sama dengan badge `?` PublicRequestMascot, tapi
 * tidak menyalin geometrinya dan tidak menutupi buku.
 */
export const QUERY_MARK = {
  arc: "M41.4 72.2a3.6 3.6 0 1 1 4.6 3.4v2.6",
  dot: { cx: 46, cy: 83.4, r: 1.5 },
  strokeWidth: 2.4,
} as const;

/* ------------------------------------------------------------------ */
/* Gestur                                                              */
/* ------------------------------------------------------------------ */

/**
 * Titik jangkar gestur. Semua gestur memakai `x`/`y`/`opacity` saja, TIDAK
 * `rotate` atau `scale` di dalam SVG: transform-origin CSS pada elemen SVG
 * selalu 0,0 sehingga transform kedua berputar di titik yang salah. Scaling
 * dan rotasi hanya terjadi di `motion.div` HTML — disiplin yang sama dengan
 * ketiga maskot yang sudah ada.
 */
export const GESTURE_ANCHORS = {
  leftPage: { x: 30, y: 46 },
  rightPage: { x: 66, y: 50 },
  centre: { x: 48, y: 46 },
} as const;

/* ------------------------------------------------------------------ */
/* Tingkat detail                                                     */
/* ------------------------------------------------------------------ */

export type MascotDetail = "micro" | "small" | "medium" | "large" | "hero";

export type MascotDetailRules = {
  /** Bentuk buku menyatu (bukan mark penuh) untuk survive di <=32px. */
  microBody: boolean;
  face: boolean;
  brows: boolean;
  accessory: boolean;
  gesture: boolean;
  decor: boolean;
};

/**
 * Tingkat detail dipilih dari prop `size`, bukan dari piksel terukur. Ukuran
 * responsif lewat CSS tidak diketahui saat render, jadi yang dipakai adalah
 * intent pemanggil.
 *
 * micro  : silhouette saja, buku menyatu, tanpa wajah/aksesori (24px)
 * small  : mark penuh + lipatan, tanpa wajah/aksesori (48-56px)
 * medium : + wajah penuh (96-144px)
 * large  : + aksesori kategori (160-208px)
 * hero   : + alis, gestur penuh, dan bits dekoratif (256px+)
 */
export const DETAIL_RULES: Record<MascotDetail, MascotDetailRules> = {
  micro: { microBody: true, face: false, brows: false, accessory: false, gesture: false, decor: false },
  small: { microBody: false, face: false, brows: false, accessory: false, gesture: false, decor: false },
  medium: { microBody: false, face: true, brows: false, accessory: false, gesture: false, decor: false },
  large: { microBody: false, face: true, brows: false, accessory: true, gesture: true, decor: false },
  hero: { microBody: false, face: true, brows: true, accessory: true, gesture: true, decor: true },
};
