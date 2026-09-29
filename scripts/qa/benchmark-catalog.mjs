/**
 * Benchmark "catalog-ready" untuk build produksi.
 *
 * Yang diukur (hanya yang benar-benar bisa diukur, tidak ada tahap karangan):
 *
 *   responseEnd                     : respons HTML selesai
 *   first paint / first contentful paint (PerformancePaintTiming)
 *   domContentLoaded               : HTML + CSS + JS terparse
 *   load                           : semua sumber daya awal selesai
 *   T_js  = DCL - responseEnd      : unduh + eksekusi JavaScript
 *   tKatalog                       : #katalog terpasang di DOM
 *   tKartu                         : kartu listing pertama terlihat
 *   tCari                          : kolom cari terisi
 *   CATALOG-READY = max(tKartu,tCari) : direktori sudah bisa dipakai
 *
 * CATALOG-READY sengaja TIDAK menunggu gambar selesai atau seluruh halaman
 * ter-hidrasi: yang diukur adalah waktu sampai direktori bisa dipakai.
 *
 * Jalankan:  node scripts/qa/benchmark-catalog.mjs [jumlahSampel]
 * Env:       SKIP_BUILD=1 memakai dist yang sudah ada.
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const SAMPLES = Number(process.argv[2] ?? 5);
const PORT = 4183;
const BASE = `http://127.0.0.1:${PORT}`;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const round = (n) => Math.round(n);
const stats = (xs) => ({
  median: round(median(xs)),
  min: round(Math.min(...xs)),
  max: round(Math.max(...xs)),
});

if (existsSync("dist/index.html") && process.env.SKIP_BUILD !== "1") {
  await new Promise((resolve, reject) => {
    const p = spawn("bun", ["run", "build"], { stdio: "inherit", shell: true });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
  });
}

const server = spawn("bunx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  stdio: "ignore",
});
const stop = () => {
  try {
    server.kill("SIGTERM");
  } catch {
    /* proses sudah selesai */
  }
};
process.on("exit", stop);

for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch(BASE, { method: "HEAD" });
    if (res.ok) break;
  } catch {
    /* server belum siap */
  }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const samples = [];

for (let run_ = 0; run_ < SAMPLES; run_ += 1) {
  // Konteks baru = cache kosong: inilah yang membuat ini "cold load".
  const context = await browser.newContext();
  const page = await context.newPage();

  // Pengukuran HARUS di dalam halaman. Versi pertama memakai page.exposeFunction
  // lalu performance.now() di sisi Node - itu mengukur umur proses Node, bukan
  // halaman (hasilnya 43 detik, tidak masuk akal). addInitScript berjalan
  // sebelum skrip aplikasi, jadi pengamat bisa merekam tahap demi tahap.
  await page.addInitScript(() => {
    const marks = { tKatalog: null, tKartu: null, tCari: null };
    window.__marks = marks;
    const stamp = (key, value) => {
      if (marks[key] === null) marks[key] = value;
    };
    const scan = () => {
      const katalog = document.getElementById("katalog");
      if (katalog) {
        stamp("tKatalog", performance.now());
        const kartu = katalog.querySelector("article");
        if (kartu && kartu.getClientRects().length) stamp("tKartu", performance.now());
        const cari = katalog.querySelector('input[placeholder*="Cari"]');
        if (cari && cari.getClientRects().length) stamp("tCari", performance.now());
      }
      if (marks.tKartu === null || marks.tCari === null) requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  });

  await page.goto(BASE, { waitUntil: "commit" });

  await page.locator("#katalog").waitFor({ state: "attached", timeout: 60_000 });
  await page.locator("#katalog article").first().waitFor({ state: "visible", timeout: 60_000 });
  const search = page.getByPlaceholder("Cari usaha atau jasa...");
  await search.waitFor({ state: "visible", timeout: 60_000 });
  // Pastikan kolom benar-benar menerima ketikan, bukan sekadar terlihat.
  await search.click();
  await search.type("a", { delay: 1 });
  await search.fill("");

  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((p) => [p.name, p.startTime]),
    );
    const resources = performance.getEntriesByType("resource");
    const js = resources.filter((r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name));
    return {
      marks: window.__marks,
      responseEnd: nav.responseEnd,
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      fp: paints["first-paint"] ?? 0,
      fcp: paints["first-contentful-paint"] ?? 0,
      jsCount: js.length,
      jsBytes: js.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      imgCount: resources.filter((r) => r.initiatorType === "img").length,
    };
  });

  const cardCount = await page.locator("#katalog article").count();
  const m = data.marks;
  const tKatalog = m.tKatalog ?? 0;
  const tKartu = m.tKartu ?? tKatalog;
  const tCari = m.tCari ?? tKatalog;
  const catalogReady = Math.max(tKartu, tCari);
  const fcp = data.fcp || data.dcl;

  samples.push({
    html: data.responseEnd,
    fp: data.fp,
    fcp,
    dcl: data.dcl,
    load: data.load,
    tJs: data.dcl - data.responseEnd,
    tShellToFirstCard: tKartu - fcp,
    tFirstCardToUsable: catalogReady - tKartu,
    tKatalog: round(tKatalog),
    tKartu: round(tKartu),
    tCari: round(tCari),
    tCatalogReady: round(catalogReady),
    jsBytes: data.jsBytes,
    jsCount: data.jsCount,
    cards: cardCount,
    images: data.imgCount,
  });

  await context.close();
  process.stdout.write(`  sampel ${run_ + 1}/${SAMPLES}: catalog-ready ${round(catalogReady)}ms\n`);
}

await browser.close();
stop();
await new Promise((r) => setTimeout(r, 300));

const report = {
  environment: {
    node: process.version,
    browser: "chromium (playwright)",
    buildMode: "vite build + vite preview (produksi)",
    samples: SAMPLES,
  },
  metrics: {
    "responseEnd (HTML)": stats(samples.map((s) => s.html)),
    "first paint": stats(samples.map((s) => s.fp)),
    "first contentful paint": stats(samples.map((s) => s.fcp)),
    domContentLoaded: stats(samples.map((s) => s.dcl)),
    load: stats(samples.map((s) => s.load)),
    "T_js (responseEnd->DCL)": stats(samples.map((s) => s.tJs)),
    "FCP -> kartu pertama": stats(samples.map((s) => s.tShellToFirstCard)),
    "kartu pertama -> siap pakai": stats(samples.map((s) => s.tFirstCardToUsable)),
    "#katalog terpasang": stats(samples.map((s) => s.tKatalog)),
    "CATALOG-READY": stats(samples.map((s) => s.tCatalogReady)),
    "js transfer bytes": stats(samples.map((s) => s.jsBytes)),
    "js requests": stats(samples.map((s) => s.jsCount)),
    "image requests": stats(samples.map((s) => s.images)),
    "kartu katalog": stats(samples.map((s) => s.cards)),
  },
};

console.log("\n=== CATALOG READY BENCHMARK ===");
console.log(JSON.stringify(report, null, 2));
