import { afterEach, beforeEach, expect, test } from "vitest";
import { consumeAdminAuthIntent, rememberAdminAuthIntent } from "./admin-auth-intent";

/**
 * Kontrak niat "alur ini menuju ruang admin".
 *
 * Modul ini sangat kecil, dan itu justru alasan ia perlu dijaga: ia menyentuh
 * `sessionStorage`, yang tidak selalu ada (mode privat, storage yang diblokir,
 * lingkungan uji tanpa DOM), dan niatnya boleh salah dibaca kalau tidak
 * dibersihkan.
 *
 * Yang paling penting dari semua test di sini adalah dua hal yang tidak boleh
 * terjadi: niat dari satu alur tidak boleh bocor ke kunjungan berikutnya, dan
 * storage yang melempar tidak boleh membuat halaman auth ikut gagal.
 */

/** `sessionStorage` tiruan yang bisa dibuat gagal di tengah jalan. */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const state = { failOnWrite: false };
  return {
    state,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (state.failOnWrite) throw new Error("storage diblokir");
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

const originalWindow = (globalThis as { window?: unknown }).window;

// Disimpan sebagai variabel modul, bukan di `globalThis`: test yang perlu
// menyalakan storage harus memegang objek yang sama, dan `globalThis` tidak
// punya tempat yang aman untuk menaruh data uji.
/** @type {ReturnType<typeof fakeStorage> | null} */
let storage: ReturnType<typeof fakeStorage> | null = null;

beforeEach(() => {
  storage = fakeStorage();
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  storage = null;
});

test("niat hanya dibaca satu kali lalu dibuang", () => {
  rememberAdminAuthIntent("/admin");
  expect(consumeAdminAuthIntent()).toBe("/admin");
  // Kunjungan berikutnya ke /auth tidak boleh ikut memakai tema admin.
  expect(consumeAdminAuthIntent()).toBeNull();
});

test("hanya tujuan di dalam ruang admin yang diingat", () => {
  // URL luar dan jalur yang mencoba keluar dari aplikasi.
  rememberAdminAuthIntent("https://contoh.example/admin");
  expect(consumeAdminAuthIntent()).toBeNull();
  // Jalur yang mencoba keluar dari aplikasi juga ditolak.
  rememberAdminAuthIntent("//contoh.example/admin");
  expect(consumeAdminAuthIntent()).toBeNull();
  // Jalur turunan ruang admin tetap sah.
  rememberAdminAuthIntent("/admin/perangkat");
  expect(consumeAdminAuthIntent()).toBe("/admin/perangkat");
});

test("niat yang basi ditolak, bukan dipakai untuk tema", () => {
  if (!storage) throw new Error("storage uji belum disiapkan");
  // Tiga jam lalu, sedangkan umur tautan Firebase sendiri satu jam.
  storage.setItem(
    "sbk:admin-auth-intent",
    JSON.stringify({ path: "/admin", at: Date.now() - 3 * 60 * 60 * 1000 }),
  );
  expect(consumeAdminAuthIntent()).toBeNull();
});

test("isi storage yang rusak diperlakukan sebagai tidak ada", () => {
  if (!storage) throw new Error("storage uji belum disiapkan");
  storage.setItem("sbk:admin-auth-intent", "bukan json");
  expect(consumeAdminAuthIntent()).toBeNull();
  storage.setItem("sbk:admin-auth-intent", JSON.stringify({ path: 42 }));
  expect(consumeAdminAuthIntent()).toBeNull();
});

test("storage yang diblokir tidak membuat alur ini gagal", () => {
  if (!storage) throw new Error("storage uji belum disiapkan");
  storage.state.failOnWrite = true;
  // Melempar di sini berarti ada bug di pemanggil kalau tidak tertangani.
  rememberAdminAuthIntent("/admin");
  expect(consumeAdminAuthIntent()).toBeNull();
});

test("lingkungan tanpa window sama sekali tidak melempar", () => {
  // Di server, pratinjau, dan beberapa lingkungan uji, `window` memang tidak
  // ada. `ReferenceError` harus tertangkap di dalam modul, bukan naik ke layar.
  (globalThis as { window?: unknown }).window = undefined;
  expect(() => rememberAdminAuthIntent("/admin")).not.toThrow();
  expect(consumeAdminAuthIntent()).toBeNull();
});
