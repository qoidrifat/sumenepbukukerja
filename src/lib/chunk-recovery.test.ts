import { expect, test } from "vitest";
import {
  STALE_CHUNK_RELOAD_KEY,
  STALE_CHUNK_RELOAD_WINDOW_MS,
  isStaleChunkError,
  recoverFromStaleChunk,
  type ReloadGuardStorage,
} from "@/lib/chunk-recovery";

/**
 * Pemulihan dari chunk basi.
 *
 * Dua hal yang diuji di sini tidak bisa dilihat dari layar: bahwa muat ulang
 * benar-benar TERJADI untuk error chunk basi, dan bahwa ia TIDAK terjadi dua
 * kali berturut-turut. Yang kedua itu penting — tanpa penjaga, halaman yang
 * asetnya benar-benar hilang akan memuat ulang dirinya sendiri tanpa henti.
 */

const memoryStorage = () => {
  const map = new Map<string, string>();
  const storage: ReloadGuardStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
  return { storage, map };
};

/** Pesan persis seperti yang tercatat di laporan produksi. */
const REAL_MESSAGE =
  "Failed to fetch dynamically imported module: https://sumenepbukukerja.freebuff.app/assets/Admin-ZfOF0elJ.js";

test("mengenali pesan chunk basi dari empat mesin yang berbeda", () => {
  expect(isStaleChunkError(REAL_MESSAGE)).toBe(true);
  expect(isStaleChunkError("Importing a module script failed.")).toBe(true);
  expect(isStaleChunkError("error loading dynamically imported module")).toBe(true);
  expect(isStaleChunkError("ChunkLoadError: Loading chunk 12 failed")).toBe(true);
});

test("tidak menyentuh error yang bukan soal aset", () => {
  expect(isStaleChunkError("ConvexError: [CONVEX Q(vendors:listForAdmin)] Server Error")).toBe(false);
  expect(isStaleChunkError("Cannot read properties of undefined")).toBe(false);
  expect(isStaleChunkError("")).toBe(false);
});

test("error chunk basi memicu satu muat ulang", () => {
  const { storage, map } = memoryStorage();
  let reloads = 0;

  const outcome = recoverFromStaleChunk(REAL_MESSAGE, {
    storage,
    reload: () => {
      reloads += 1;
    },
    now: 1_000_000,
  });

  expect(outcome).toBe("reloaded");
  expect(reloads).toBe(1);
  expect(map.get(STALE_CHUNK_RELOAD_KEY)).toBe("1000000");
});

test("error lain tidak pernah memuat ulang halaman", () => {
  const { storage } = memoryStorage();
  let reloads = 0;

  const outcome = recoverFromStaleChunk("ConvexError: Server Error", {
    storage,
    reload: () => {
      reloads += 1;
    },
    now: 1_000_000,
  });

  expect(outcome).toBe("skipped");
  expect(reloads).toBe(0);
});

test("tidak memuat ulang dua kali dalam jendela penjaga", () => {
  const { storage } = memoryStorage();
  let reloads = 0;

  const pertama = recoverFromStaleChunk(REAL_MESSAGE, { storage, reload: () => (reloads += 1), now: 1_000_000 });
  const kedua = recoverFromStaleChunk(REAL_MESSAGE, {
    storage,
    reload: () => (reloads += 1),
    now: 1_000_000 + STALE_CHUNK_RELOAD_WINDOW_MS - 1,
  });

  expect(pertama).toBe("reloaded");
  // Inilah yang mencegah halaman berputar selamanya ketika asetnya benar-benar
  // gagal diunggah: percobaan kedua menyerah dan layar gangguan ditampilkan.
  expect(kedua).toBe("already-tried");
  expect(reloads).toBe(1);
});

test("deploy berikutnya tetap bisa dipulihkan setelah jendela lewat", () => {
  const { storage } = memoryStorage();
  let reloads = 0;

  recoverFromStaleChunk(REAL_MESSAGE, { storage, reload: () => (reloads += 1), now: 1_000_000 });
  const setelahJendela = recoverFromStaleChunk(REAL_MESSAGE, {
    storage,
    reload: () => (reloads += 1),
    now: 1_000_000 + STALE_CHUNK_RELOAD_WINDOW_MS + 1,
  });

  expect(setelahJendela).toBe("reloaded");
  expect(reloads).toBe(2);
});

test("tanpa sessionStorage, lebih baik tidak memuat ulang sama sekali", () => {
  let reloads = 0;
  const outcome = recoverFromStaleChunk(REAL_MESSAGE, {
    storage: null,
    reload: () => (reloads += 1),
    now: 1_000_000,
  });

  expect(outcome).toBe("skipped");
  expect(reloads).toBe(0);
});

test("sessionStorage yang melempar tidak membuat halaman berputar", () => {
  const hostile: ReloadGuardStorage = {
    getItem: () => {
      throw new Error("storage diblokir");
    },
    setItem: () => {
      throw new Error("storage diblokir");
    },
  };
  let reloads = 0;

  const outcome = recoverFromStaleChunk(REAL_MESSAGE, {
    storage: hostile,
    reload: () => (reloads += 1),
    now: 1_000_000,
  });

  expect(outcome).toBe("skipped");
  expect(reloads).toBe(0);
});

test("cap waktu yang rusak diperlakukan sebagai belum pernah mencoba", () => {
  const { storage } = memoryStorage();
  storage.setItem(STALE_CHUNK_RELOAD_KEY, "bukan-angka");
  let reloads = 0;

  const outcome = recoverFromStaleChunk(REAL_MESSAGE, {
    storage,
    reload: () => (reloads += 1),
    now: 1_000_000,
  });

  expect(outcome).toBe("reloaded");
  expect(reloads).toBe(1);
});
