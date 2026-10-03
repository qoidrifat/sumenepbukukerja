import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak `vercel.json`.
 *
 * Aplikasi ini adalah SPA: rutenya dibentuk oleh React Router
 * (`/auth`, `/admin`, `/v/:slug`, `/invite/:token`), bukan oleh server. Tanpa
 * rewrite, `https://-domain/auth?returnTo=%2Fadmin` dijawab dengan 404 dari
 * server dan orang tidak pernah sampai ke layar masuk - persis URL yang
 * dipakai pengelola untuk masuk ke ruang admin.
 *
 * Dua hal yang dijaga di sini, dan keduanya bisa rusak tanpa build gagal:
 *
 *  1. Rewrite-nya masih ada. Menghapus `vercel.json` tidak membuat build
 *     merah; ia hanya membuat setiap deep link mati diam-diam.
 *  2. Rewrite selapis `/(.*)` aman untuk aplikasi ini. Aman karena tidak ada
 *     permintaan same-origin ke `/api/` atau `/convex/` - semua panggilan ke
 *     Convex memakai URL absolut dari `VITE_CONVEX_URL`. Kalau suatu saat ada
 *     route backend di origin yang sama, rewrite ini akan menelan
 *     jawabannya jadi `index.html`, dan respons JSON berubah jadi HTML tanpa
 *     satu pun error di log.
 */

type VercelConfig = {
  rewrites?: { source: string; destination: string }[];
};

const config: VercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));

test("setiap route client-side punya jawaban server yang benar", () => {
  const rewrite = config.rewrites?.find((item) => item.source === "/(.*)");
  expect(rewrite, "rewrite SPA harus ada di vercel.json").toBeDefined();
  expect(rewrite?.destination).toBe("/index.html");
});

test("aplikasi memang butuh rewrite: rutenya milik React Router", () => {
  // Kalau rutenya nanti pindah ke file lain, test ini yang ikut menunjuk file
  // itu, bukan diam-diam menjaga rewrite yang tidak terpakai lagi.
  const main = readFileSync("src/main.tsx", "utf8");
  for (const rute of ["/auth", "/dashboard", "/admin", "/v/:slug", "/invite/:token"]) {
    expect(main, `rute ${rute}`).toContain(`path="${rute}"`);
  }
});

test("tidak ada permintaan same-origin yang bisa ditelan rewrite", () => {
  const berkas = [
    "src/lib/admin-gate-client.ts",
    "src/lib/error-reporting.ts",
    "src/lib/chunk-recovery.ts",
    "src/main.tsx",
  ];
  const pola = /fetch\(\s*["'`](\/(?:api|convex)[^"'`]*)/;
  for (const file of berkas) {
    const sumber = readFileSync(file, "utf8");
    const cocok = sumber.match(pola);
    expect(cocok?.[0] ?? null, `${file} memanggil ${pola}`).toBeNull();
  }
});

test("service worker tetap disajikan sebagai berkas, bukan sebagai index.html", () => {
  // Rewrite Vercel baru berlaku kalau tidak ada berkas yang cocok, jadi
  // `/sw.js` tetap diambil dari `public/`. Kalau ini berubah, satu-satunya
  // jalur pembaruan aplikasi yang ada ikut mati.
  const sw = readFileSync("public/sw.js", "utf8");
  expect(sw).toContain("self.addEventListener(\"fetch\"");
  expect(config.rewrites?.every((item) => item.destination === "/index.html")).toBe(true);
});
