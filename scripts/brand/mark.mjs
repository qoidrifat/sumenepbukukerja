/**
 * Brand mark "Buku Terbuka + Sudut Halaman" - satu sumber kebenaran.
 *
 * File SVG dan PNG dibangun dari sini, jadi geometry favicon, ikon PWA, dan
 * lockup tidak mungkin berbeda satu piksel.
 *
 * Konsep: buku terbuka (produk) dengan satu sudut halaman terlipat (halaman
 * yang dicari). Pin lokasi yang lama dibuang - pin adalah penanda "peta" yang
 * paling generik, dan produk ini memang bukan aplikasi peta. Sudut terlipat
 * juga duduk di sudut kanan atas, posisi yang sama dengan badge "?" di
 * PublicRequestMascot dan kilau/z di AdminEmptyMascot, jadi symbol ini
 * jelas berasal dari keluarga maskot yang sama.
 *
 * Dua perbaikan struktural yang sengaja masuk ke geometri ini:
 *  1. Jarak 8 unit di tengah memisahkan halaman kiri dan kanan sebagai
 *     negative space. Versi mono sebelumnya menimpanya dengan garis spine
 *     putih sehingga seluruh buku jadi satu blob.
 *  2. Sudut terlipat memotong silhouette halaman (bukan hanya menimpanya),
 *     jadi lipatan tetap terbaca bahkan di varian monokrom.
 *
 * ViewBox sengaja 0 0 96 96 dengan isi 4..92: rasio 1:1 untuk app icon dan
 * tidak ada whitespace yang bisa terbuang sia-sia.
 */

export const VIEW_BOX = { x: 0, y: 0, width: 96, height: 96 };

/* Palet disalin dari token brand yang sudah dipakai project. */
export const COLORS = {
  blue: "#2563EB", // Brand Blue
  blueDark: "#1D4ED8",
  blueLight: "#93C5FD", // aksen wordmark di background gelap
  blueSoft: "#DBEAFE",
  charcoal: "#121212",
  ink: "#0F172A",
  amber: "#F59E0B",
  white: "#FFFFFF",
  parchment: "#FAF7EE",
};

/* Latar app icon: rounded square biru, sama seperti mark lama sehingga
   bentuk lencana di home screen tidak berubah. */
export const FIELD = { type: "rect", x: 4, y: 4, width: 88, height: 88, rx: 22 };

/* Halaman kiri: tepi luar kiri, tepi atas naik ke arah buku, tepi bawah
   turun ke arah buku, tepi spine vertikal di x=44. */
export const LEFT_PAGE =
  "M44 30.6C37.6 26.9 30.4 25.9 23.6 28.1L19.4 29.8C17.3 30.6 16 32.5 16 34.8V61.5C16 64 17.8 66 20.2 65.2L44 59.4Z";

/* Halaman kanan: cermin kiri terhadap x=48, dengan sudut kanan-atas
   dipotong oleh garis lipatan T(67 27.8) -> E(80 40.8). Titik T adalah
   ujung kurva tepi atas, jadi kurva tidak pernah menunjuk balik. */
export const RIGHT_PAGE =
  "M52 30.6C57 27.6 62 26.6 67 27.8L80 40.8V61.5C80 64 78.2 66 75.8 65.2L52 59.4Z";

/* Sudut terlipat: segitiga T(67 27.8) - E(80 40.8) - C'(67 40.8).
   Sisi 13 unit dipilih setelah pengukuran: 10 unit menghasilkan hanya 1
   piksel amber di 24px, 13 unit menghasilkan 5. */
export const FOLD = "M67 27.8L80 40.8L67 40.8Z";

/* Batas visual buku untuk viewBox varian mono. Tanpa ini mark mono hanya
   menutup ~20% kanvas 96x96 - ruang yang terbuang sia-sia. */
export const BOOK_BOUNDS = { x: 14, y: 23, width: 68, height: 45 };

/* Varian monokrom: field dihilangkan supaya logo bisa duduk di background
   apa pun; buku dan lipatan jadi satu warna, negative space tetap ada. */
export const MONO_BOOK = [LEFT_PAGE, RIGHT_PAGE];
export const MONO_VIEW_BOX = BOOK_BOUNDS;

/**
 * Bentuk mark untuk mode warna.
 * @param {"colour"|"mono"} mode
 * @param {string} tone warna field/halaman/lipatan
 */
export function markShapes(mode, tone) {
  if (mode === "mono") {
    return MONO_BOOK.map((d) => ({ type: "path", d, fill: tone }));
  }
  return [
    { ...FIELD, fill: tone.blue },
    { type: "path", d: LEFT_PAGE, fill: tone.left },
    { type: "path", d: RIGHT_PAGE, fill: tone.right },
    { type: "path", d: FOLD, fill: tone.accent },
  ];
}

export const TONE_COLOUR = {
  blue: COLORS.blue,
  left: COLORS.white,
  right: COLORS.blueSoft,
  accent: COLORS.amber,
};

/**
 * Varian 16px: field + satu silhouette buku menyatu tanpa jarak tengah,
 * karena celah 8 unit hanya jadi 1.33px di 16px dan hanya mengencerkan
 * bentuk.
 *
 * Sudut terlipat di varian ini sengaja dibuat blok dan sebesar 20 unit
 * (3.3px di 16px). Itu hasil sweep, bukan tebakan: kaki 10 dan 12 unit
 * menghasilkan 0 dan 1 piksel amber di 16px, kaki 20 menghasilkan 3. Pada
 * 16px aksen ini satu-satunya pembeda warna, jadi blok kecil yang solid lebih
 * berguna daripada lipatan yang proporsional tapi hilang.
 */
export const TINY_BOOK =
  "M13 33C21 26.8 31 25.4 40 28.8V67.4C31 63 21 63.2 13 67.6Z" +
  "M48 29C50 27.2 52 26.6 53 27.2L73 47.2V67.4C66 64.6 57 63.4 48 63.4Z";

/** Mark khusus 16px: satu bentuk, satu warna, tanpa detail < 2px. */
export const TINY_FOLD = "M53 27.2L73 47.2L53 47.2Z";

export function tinyMarkShapes(tone) {
  return [
    { ...FIELD, fill: tone.blue },
    { type: "path", d: TINY_BOOK, fill: tone.left },
    { type: "path", d: TINY_FOLD, fill: tone.accent },
  ];
}

/* ------------------------------------------------------------------ */
/* Bentuk untuk maskable icon                                         */
/* ------------------------------------------------------------------ */

/**
 * Android memotong maskable dengan lingkaran aman berdiameter 80% (409.6px
 * dari 512), jadi sudut artwork tidak boleh keluar lingkaran itu. Untuk
 * artwork persegi sisi s, sudutnya berjarak s*sqrt(2)/2 dari pusat, maka
 * s*0.707 <= 204.8 -> s <= 289. Dipakai 284 (inset 114 = 22.3% per sisi)
 * supaya masih ada margin 4px setelah dipotong.
 *
 * Versi lama hanya memakai 96 dari 512 (18.75%), jadi logo nyaris tak
 * terlihat setelah OS memotong.
 */
export const MASKABLE = {
  canvas: 512,
  markSize: 284,
  inset: (512 - 284) / 2,
  background: COLORS.blue,
};

/** Peta ke viewBox 96 untuk menggambar mark pada kanvas maskable. */
export function maskableTransform() {
  const k = MASKABLE.markSize / VIEW_BOX.width;
  return `translate(${MASKABLE.inset} ${MASKABLE.inset}) scale(${k})`;
}

/* ------------------------------------------------------------------ */
/* Lockup                                                             */
/* ------------------------------------------------------------------ */

/**
 * Font stack yang sama persis dengan Tailwind default di project ini.
 * index.html tidak memuat font eksternal, jadi menaruh "Inter" di depan
 * hanya membuat lockup SVG jatuh ke system-ui di semua mesin - hasilanya
 * wordmark yang tidak pernah sama dengan situs. Lockup memakai stack ini
 * apa adanya, dan di dalam aplikasi wordmark tetap HTML live.
 */
export const WORDMARK_FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const LOCKUP = {
  primary: { width: 720, height: 168 },
  stacked: { width: 420, height: 420 },
  wordmark: { width: 560, height: 96 },
};
