import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { GET, OPTIONS, POST } from "../../api/admin-context";

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
  const rewrite = config.rewrites?.find((item) => item.source === "/((?!api/).*)");
  expect(rewrite, "rewrite SPA harus ada di vercel.json").toBeDefined();
  expect(rewrite?.destination).toBe("/index.html");
  // Pengecualiannya harus benar-benar menolak awalan `/api`. Pola yang keliru
  // tidak membuat build merah - ia hanya membuat relay tertelan diam-diam,
  // dan gejalanya cuma IP yang hilang lagi.
  const pola = new RegExp("^" + "/((?!api/).*)" + "$");
  expect(pola.test("/api/admin-context")).toBe(false);
  expect(pola.test("/admin")).toBe(true);
  expect(pola.test("/v/daftar")).toBe(true);
});

test("aplikasi memang butuh rewrite: rutenya milik React Router", () => {
  // Kalau rutenya nanti pindah ke file lain, test ini yang ikut menunjuk file
  // itu, bukan diam-diam menjaga rewrite yang tidak terpakai lagi.
  const main = readFileSync("src/main.tsx", "utf8");
  for (const rute of ["/auth", "/dashboard", "/warga/dashboard", "/mitra/dashboard", "/admin", "/v/:slug", "/invite/:token"]) {
    expect(main, `rute ${rute}`).toContain(`path="${rute}"`);
  }
  // Rute bertingkat ditulis relatif terhadap induknya (`path="sistem"` di
  // bawah `path="/admin"`), jadi URL penuhnya diasertikan di sini.
  expect(main, "rute /admin/sistem").toContain('path="/admin"');
  expect(main, "rute /admin/sistem").toContain('path="sistem"');
  expect(main, "rute /admin/keamanan").toContain('path="keamanan"');
  expect(main, "rute /admin/moderasi").toContain('path="moderasi"');
});

test("permintaan same-origin ke backend dibatasi pada relay IP saja", () => {
  const berkas = [
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

  // Beacon gerbang boleh memanggil `/api`, tapi HANYA relay IP. Panggilan
  // same-origin berikutnya harus ikut ditambah ke daftar berkas di atas,
  // supaya route-nya ditinjau sebelum ikut tertelan rewrite.
  const beacon = readFileSync("src/lib/admin-gate-client.ts", "utf8");
  expect(beacon).toContain("const RELAY_URL = RELAY_PATH;");
  expect(beacon).toContain("await askContext(RELAY_URL);");
  // Hanya dua pemanggilan: relay dulu, route langsung sebagai cadangan.
  expect(beacon.match(/askContext\(/g) ?? []).toHaveLength(3);
  expect(beacon).not.toMatch(/fetch\(\s*["'`]\/convex/);
});

test("service worker tetap disajikan sebagai berkas, bukan sebagai index.html", () => {
  // Rewrite Vercel baru berlaku kalau tidak ada berkas yang cocok, jadi
  // `/sw.js` tetap diambil dari `public/`. Kalau ini berubah, satu-satunya
  // jalur pembaruan aplikasi yang ada ikut mati.
  const sw = readFileSync("public/sw.js", "utf8");
  expect(sw).toContain("self.addEventListener(\"fetch\"");
  expect(config.rewrites?.every((item) => item.destination === "/index.html")).toBe(true);
});

/*
 * Kontrak: hasil codegen Convex ikut ter-commit.
 *
 * Build di Vercel berjalan di mesin tanpa kredensial Convex, jadi
 * `convex codegen` di sana gagal dengan `401 MissingAccessToken` sebelum
 * `vite build` sempat jalan - itulah yang menggagalkan deployment pertama.
 * Satu-satunya jalan tanpa menyimpan token pribadi di dashboard pihak ketiga
 * adalah ikut meng-commit `src/convex/_generated`, sesuai anjuran resmi
 * Convex di `convex codegen --help`.
 *
 * Jadi dua hal dijaga: `.gitignore` TIDAK boleh mengabaikan folder itu lagi,
 * dan berkas hasil codegennya harus benar-benar ada. Mengembalikan aturan
 * ignore tidak membuat build lokal merah sedikit pun - ia hanya mematikan
 * build produksi dengan pesan yang sama sekali tidak menyebut penyebabnya.
 */
const DIHALANG = ["src/convex/_generated", "_generated/"];

test("hasil codegen Convex tidak diabaikan Git", () => {
  const ignore = readFileSync(".gitignore", "utf8")
    .split(/\r?\n/)
    .map((baris) => baris.trim())
    .filter((baris) => baris && !baris.startsWith("#"));
  const salah = ignore.filter((aturan) => DIHALANG.includes(aturan));
  expect(salah, "aturan .gitignore yang membuat folder codegen tak terlacak").toEqual([]);
});

test("berkas hasil codegen ada semua di working tree", () => {
  for (const nama of ["api.d.ts", "api.js", "dataModel.d.ts", "server.d.ts", "server.js"]) {
    expect(
      () => readFileSync(`src/convex/_generated/${nama}`, "utf8"),
      `src/convex/_generated/${nama} tidak ada`,
    ).not.toThrow();
  }
});

/*
 * Kontrak: setiap impor relatif yang dicapai fungsi Vercel memakai ekstensi.
 *
 * Fungsi di `api/admin-context.ts` TIDAK digabungkan Vercel. Ia dikompilasi
 * per-berkas menjadi ESM, lalu dijalankan Node yang mensyaratkan ekstensi
 * eksplisit pada resolusi ESM. Spesifier tanpa ekstensi membuat modul gagal
 * dimuat, dan gejalanya menyesatkan: 500 pada SEMUA metode, bukan 405 pada
 * GET, karena kegagalannya terjadi sebelum handler sempat memeriksa apa pun.
 *
 * Bukti produksi sebelum perbaikan (log runtime deployment `dpl_9JTQFH`):
 *
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module
 *   '/var/task/src/lib/admin-context-cors' imported from
 *   '/var/task/api/admin-context.js'
 *
 * Build, lint, dan seluruh test lain tetap hijau saat ini rusak, jadi satu-
 * satunya penjaganya adalah pemeriksaan rantai impor di bawah.
 */
const SPESIFIER_RELATIF = /from\s+"(\.[^"]*)"/g;

/** Jalur dinormalkan ke garis miring supaya sama di Windows dan POSIX. */
const rapikan = (jalur: string) => jalur.split(path.sep).join("/");

/**
 * Calon berkas sumber untuk satu spesifier relatif. Spesifier `.js` menunjuk
 * berkas sumber `.ts`/`.tsx` di repo ini, dan resolusinya relatif terhadap
 * direktori berkas yang mengimpor.
 */
function calonSumber(dari: string, spesifier: string): string[] {
  const tanpaEkstensi = path.join(path.dirname(dari), spesifier.replace(/\.js$/, ""));
  return [`${tanpaEkstensi}.ts`, `${tanpaEkstensi}.tsx`].map(rapikan);
}

test("setiap impor relatif yang dicapai fungsi Vercel memakai ekstensi .js", () => {
  const dikunjungi = new Set<string>();
  const tanpaEkstensi: string[] = [];
  const hilang: string[] = [];
  const antre: string[] = ["api/admin-context.ts"];

  while (antre.length > 0) {
    const berkas = antre.pop() as string;
    if (dikunjungi.has(berkas)) continue;
    dikunjungi.add(berkas);

    const sumber = readFileSync(berkas, "utf8");
    for (const cocok of sumber.matchAll(SPESIFIER_RELATIF)) {
      const spesifier = cocok[1];
      if (!spesifier.endsWith(".js")) tanpaEkstensi.push(`${berkas} -> ${spesifier}`);
      const tujuan = calonSumber(berkas, spesifier).find((calon) => existsSync(calon));
      if (!tujuan) {
        hilang.push(`${berkas} -> ${spesifier}`);
        continue;
      }
      antre.push(tujuan);
    }
  }

  // Rantai ini harus benar-benar ditelusuri; kalau tidak, test-nya hampa.
  expect(dikunjungi.size, "berkas yang ditelusuri").toBeGreaterThanOrEqual(5);
  expect(tanpaEkstensi, "impor relatif tanpa ekstensi .js").toEqual([]);
  expect(hilang, "impor yang menunjuk berkas yang tidak ada").toEqual([]);
});

/*
 * Kontrak: fungsi Vercel memakai "Web Handler" bernama metode.
 *
 * Runtime Node Vercel hanya menyerahkan `Request` Web standar kepada ekspor
 * bernama per metode (`POST`, `GET`, `OPTIONS`). `export default function`
 * justru diperlakukan sebagai handler gaya lama `(request, response)` dan
 * disodori `IncomingMessage`, sehingga `request.headers.get(...)` bukan fungsi
 * dan setiap permintaan dijawab 500 sebelum satu byte pun diproses:
 *
 *   TypeError: request.headers.get is not a function
 *   at handler (/vercel/path0/api/admin-context.ts:111:51)
 *
 * Build, lint, dan seluruh test lain tetap hijau saat itu terjadi, jadi
 * kontraknya diuji langsung di sini: modul wajib mengekspor nama metode, TIDAK
 * boleh punya ekspor default, dan perilakunya harus lewat `Request` Web.
 */
test("fungsi Vercel memakai Web Handler bernama metode, bukan ekspor default", async () => {
  expect(typeof POST, "ekspor POST").toBe("function");
  expect(typeof GET, "ekspor GET").toBe("function");
  expect(typeof OPTIONS, "ekspor OPTIONS").toBe("function");

  const modul = (await import("../../api/admin-context")) as { default?: unknown };
  expect(modul.default, "ekspor default gaya Node lama").toBeUndefined();

  const get = await GET(new Request("https://contoh.test/api/admin-context", { method: "GET" }));
  expect(get.status).toBe(405);
  expect(await get.json()).toEqual({ error: "method_not_allowed" });

  const options = await OPTIONS(new Request("https://contoh.test/api/admin-context", { method: "OPTIONS" }));
  expect(options.status).toBe(204);

  // Tanpa secret, relay harus MATI: 200 dengan status telemetri gagal, bukan
  // panggilan ke backend. Ini sekaligus membuktikan handler menerima `Request`
  // Web dan mengembalikan `Response`, bukan gaya Node lama.
  const simpanRahasia = process.env.ADMIN_CONTEXT_RELAY_SECRET;
  const simpanOrigin = process.env.ADMIN_CONTEXT_ALLOWED_ORIGINS;
  delete process.env.ADMIN_CONTEXT_RELAY_SECRET;
  process.env.ADMIN_CONTEXT_ALLOWED_ORIGINS = "https://contoh.test";
  try {
    const post = await POST(new Request("https://contoh.test/api/admin-context", { method: "POST" }));
    expect(post.status).toBe(200);
    const badan = (await post.json()) as {
      relay?: string;
      telemetryStatus?: string;
      ipMasked?: string | null;
    };
    expect(badan.relay).toBe("unavailable");
    expect(badan.telemetryStatus).toBe("failed");
    expect(badan.ipMasked).toBeNull();
  } finally {
    if (simpanRahasia === undefined) delete process.env.ADMIN_CONTEXT_RELAY_SECRET;
    else process.env.ADMIN_CONTEXT_RELAY_SECRET = simpanRahasia;
    if (simpanOrigin === undefined) delete process.env.ADMIN_CONTEXT_ALLOWED_ORIGINS;
    else process.env.ADMIN_CONTEXT_ALLOWED_ORIGINS = simpanOrigin;
  }
});

test("penjaga pretest masih menjaga folder itu", () => {
  const penjaga = readFileSync("scripts/qa/ensure-convex-codegen.mjs", "utf8");
  expect(penjaga).toContain("_generated");
  // Penjaga harus memberi jalan pemulihan yang mengarah ke folder yang dik-commit,
  // bukan ke `convex dev` yang butuh kredensial.
  expect(penjaga).toContain("convex codegen");
});
