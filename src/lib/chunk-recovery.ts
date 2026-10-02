/**
 * Pemulihan dari chunk yang sudah hilang setelah deploy.
 *
 * Setiap build Vite memberi nama berkas ber-hash (`Admin-ZfOF0elJ.js`). Tab yang
 * masih terbuka memegang `index.html` lama, dan begitu ada deploy baru, berkas
 * yang disebut `index.html` lama itu sudah tidak ada di server. Navigasi ke rute
 * yang di-`lazy()` akan gagal dengan
 *
 *   TypeError: Failed to fetch dynamically imported module: .../assets/Admin-XXXX.js
 *
 * Error itu dilempar saat render, jadi tanpa penanganan khusus ia naik ke
 * RootErrorBoundary dan menampilkan "gangguan total" — padahal yang rusak cuma
 * versi aset di tab yang sudah basi, dan satu muat ulang menyelesaikannya.
 *
 * Muat ulang itu sendiri berbahaya kalau tanpa penjaga: kalau chunk-nya memang
 * benar-benar tidak ada (jaringan mati, atau `index.html` baru masih menyebut
 * berkas yang gagal terunggah), setiap muat ulang memicu error yang sama dan
 * halaman berputar selamanya. Karena itu penjaganya disimpan di `sessionStorage`
 * bersama cap waktu: paling banyak satu muat ulang otomatis per jendela waktu.
 * Setelah jendela itu lewat, deploy berikutnya tetap bisa dipulihkan sendiri.
 */

export const STALE_CHUNK_RELOAD_KEY = "sbk:stale-chunk-reload-at";

/** Jendela anti-putar-selamanya. Satu muat ulang otomatis per rentang ini. */
export const STALE_CHUNK_RELOAD_WINDOW_MS = 30_000;

/**
 * Pesan yang dikeluarkan mesin saat modul dinamis gagal diambil.
 *
 * Empat varian ini datang dari mesin yang berbeda: Chromium, Safari, dan pola
 * `ChunkLoadError` yang dipakai banyak bundler lain. Semuanya berarti hal yang
 * sama bagi pengguna: aset versi lama sudah tidak ada.
 */
const STALE_CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
];

export const isStaleChunkError = (message: string): boolean =>
  STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));

/** Bagian `sessionStorage` yang dipakai; dibuat sempit supaya bisa disuntik uji. */
export type ReloadGuardStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/** `sessionStorage` bisa melempar (mode privat, storage diblokir). */
const defaultStorage = (): ReloadGuardStorage | null => {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
};

export type StaleChunkRecovery = "skipped" | "already-tried" | "reloaded";

/**
 * Coba pulihkan diri dari error chunk basi.
 *
 * `skipped`       - bukan error chunk basi, atau penyimpanan tidak tersedia.
 * `already-tried` - sudah pernah dimuat ulang dalam jendela penjaga; jangan
 *                   ulangi, tampilkan saja layar gangguan.
 * `reloaded`      - muat ulang sudah dipicu.
 */
export const recoverFromStaleChunk = (
  message: string,
  options: {
    storage?: ReloadGuardStorage | null;
    reload?: () => void;
    now?: number;
    windowMs?: number;
  } = {},
): StaleChunkRecovery => {
  if (!isStaleChunkError(message)) return "skipped";

  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return "skipped";

  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? STALE_CHUNK_RELOAD_WINDOW_MS;

  try {
    const previous = Number(storage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
    if (Number.isFinite(previous) && previous > 0 && now - previous < windowMs) {
      return "already-tried";
    }
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  } catch {
    // Kalau penjaganya tidak bisa ditulis, lebih baik tidak memuat ulang sama
    // sekali daripada berisiko berputar tanpa henti.
    return "skipped";
  }

  options.reload?.();
  return "reloaded";
};
