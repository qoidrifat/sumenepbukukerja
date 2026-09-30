/**
 * QA permukaan produk Phase 4.
 *
 * `qa-behaviour.mjs` menguji satu maskot di halaman studio. File ini
 * menguji hal yang berbeda: apakah maskot yang sudah menyatu ke produk
 * benar-benar berdiri di atas permukaan yang §8b izinkan, pada lebar
 * layar yang dipakai pengguna, tanpa membuat overflow atau error.
 *
 * Yang diukur langsung dari DOM, bukan dari source:
 *  - background-color efektif di belakang field `#2563EB`,
 *  - ukuran render mascot di tiap lebar (harus ikut peta responsif),
 *  - overflow horizontal dan clipping,
 *  - error console/pageerror,
 *  - atribut aksesibilitas di permukaan yang sudah jadi.
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const PORT = 5199;
const TMP = "tmp/qa/surfaces";
mkdirSync(TMP, { recursive: true });

/** Lebar yang diminta Phase 4 + satu lebar besar untuk menguji 2xl. */
const WIDTHS = [360, 390, 430, 600, 768, 1024, 1100, 1280, 1440];

/**
 * Permukaan §8b sebagai hex sRGB. Browser sering meng-serialize warna
 * Tailwind v4 sebagai `oklch()`, jadi nilainya dinormalkan lewat canvas
 * dulu supaya yang dibandingkan benar-benar piksel yang benar-benar
 * dirender, bukan bentuk serialisasi dari browser.
 */
const APPROVED = ["#FFFFFF", "#F7F8FC", "#DBEAFE", "#FAF7EE", "#F8FAFC", "#E0F2FE", "#F1F5F9", "#121212"];

const results = [];
const record = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${detail}`);
};

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

/**
 * Selektor maskot. `viewBox="0 0 96 96"` hanya dimiliki BrandMascot;
 * ikon lucide semuanya 24x24, jadi tidak ada yang tertukar.
 */
const MASCOT_SVG = 'svg[viewBox="0 0 96 96"]';

const CANVAS_NORMALISE = `
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  window.__mascotToHex = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  };
`;

/** Latar efektif: leluhur terdekat yang warnanya tidak transparan. */
const readBackdrop = (page, index) =>
  page.evaluate(
    (i) => {
      const el = document.querySelectorAll('svg[viewBox="0 0 96 96"]')[i];
      if (!el) return null;
      let node = el.parentElement;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          return { css: bg, hex: window.__mascotToHex(bg) };
        }
        node = node.parentElement;
      }
      return null;
    },
    index,
  );

const readBox = (page, index) =>
  page.evaluate((i) => {
    const el = document.querySelectorAll('svg[viewBox="0 0 96 96"]')[i];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const host = el.closest("span");
    return {
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      hidden: host?.getAttribute("aria-hidden"),
      focusable: el.getAttribute("focusable"),
      label: host?.getAttribute("aria-label"),
      role: host?.getAttribute("role"),
      title: el.querySelector("title") ? true : false,
    };
  }, index);

/**
 * Ukuran render yang diharapkan dari `MASCOT_SIZES.md`
 * (`size-24 sm:size-28 xl:size-36`). sm=640, xl=1280.
 */
const expectedMd = (width) => (width < 640 ? 96 : width < 1280 ? 112 : 144);

/**
 * Sesi tamu untuk QA, TANPA memakai tombol "Masuk sebagai tamu".
 *
 * Tombol itu sengaja dihapus dari UI: akun anonim tidak punya email, jadi
 * begitu peran pengelola diberikan padanya akun itu tidak bisa dibuka lagi --
 * persis akun yang membuat seluruh deployment terkunci. Jadi harness ini membuat
 * sesi lewat endpoint auth Convex (`auth:signIn` adalah action) lalu menanam
 * token-nya ke localStorage sebelum aplikasi dimuat. Cakupannya tetap sama,
 * hanya cara masuknya yang tidak bergantung pada UI.
 */
const CONVEX_URL = process.env.CONVEX_URL ?? "https://rare-scorpion-625.convex.cloud";

/**
 * Sesi tamu tanpa tombol "Masuk sebagai tamu" di `/auth`.
 *
 * `ConvexAuthProvider` menyimpan token di `localStorage` dengan key
 * `__convexAuthJWT_<alamat deployment tanpa tanda baca>` — namespace-nya
 * default ke `client.address`. Kalau hanya key polos yang diisi, provider
 * membaca `undefined`, menganggap belum masuk, dan semua halaman
 * terkunci bisa lulus sebagai tamu. Jadi keduanya ditulis di sini.
 */
const STORAGE_NAMESPACE = CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "");

async function anonymousTokens() {
  const response = await fetch(`${CONVEX_URL}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "auth:signIn", args: { provider: "anonymous", params: {} } }),
  });
  const payload = await response.json();
  const tokens = payload?.value?.tokens;
  if (!tokens?.token) throw new Error(`Gagal membuat sesi tamu: ${JSON.stringify(payload)}`);
  return tokens;
}

async function guestSession(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const tokens = await anonymousTokens();
  await context.addInitScript((seed) => {
    const entries = [
      ["__convexAuthJWT", seed.token],
      ["__convexAuthRefreshToken", seed.refreshToken],
    ];
    for (const [key, value] of entries) {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem(`${key}_${seed.namespace}`, value);
    }
  }, { ...tokens, namespace: STORAGE_NAMESPACE });
  const page = await context.newPage();
  await page.addInitScript(CANVAS_NORMALISE);
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  await page.goto(`${base}/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
  return { context, page, errors };
}

/* ------------------------------------------------------------------ */
/* 1. Dua empty state Dashboard                                         */
/* ------------------------------------------------------------------ */

for (const width of WIDTHS) {
  const { context, page, errors } = await guestSession(width);

  const counts = await page.locator(MASCOT_SVG).count();
  record(`dashboard @${width} dua empty state punya maskot`, counts === 2, `ditemukan ${counts}`);

  for (const [i, id] of [[0, "owner-listings-empty"], [1, "saved-listings-empty"]]) {
    const backdrop = await readBackdrop(page, i);
    record(
      `@${width} ${id} di atas permukaan §8b`,
      backdrop !== null && APPROVED.includes(backdrop.hex),
      `latar=${backdrop?.hex ?? "tidak ketemu"} (${backdrop?.css ?? "-"})`,
    );

    const box = await readBox(page, i);
    if (!box) {
      record(`@${width} ${id} punya bounding box`, false, "tidak ketemu");
      continue;
    }
    record(
      `@${width} ${id} ukuran responsif ${expectedMd(width)}px`,
      box.w === expectedMd(width) && box.h === expectedMd(width),
      `${box.w}x${box.h}`,
    );
    record(
      `@${width} ${id} tidak terpotong`,
      box.left >= 0 && box.right <= width,
      `x ${box.left}..${box.right} dari ${width}`,
    );
    record(
      `@${width} ${id} dekoratif (aria-hidden, no role/label/title, focusable=false)`,
      box.hidden === "true" && box.focusable === "false" && !box.role && !box.label && !box.title,
      `hidden=${box.hidden} focusable=${box.focusable} role=${box.role} label=${box.label} title=${box.title}`,
    );
  }

  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  record(
    `/dashboard tidak overflow @${width}`,
    overflow.scrollW <= overflow.clientW,
    `scrollW=${overflow.scrollW} clientW=${overflow.clientW}`,
  );
  record(`/dashboard tanpa error @${width}`, errors.length === 0, errors.slice(0, 2).join(" | ") || "0 error");

  await page.screenshot({ path: `${TMP}/dashboard-${width}.png`, fullPage: false });
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 2. RouteLoading (Suspense fallback)                                 */
/* ------------------------------------------------------------------ */

/**
 * Fallback Suspense hanya hidup selama modul rute belum selesai dimuat.
 * Di dev Vite melayani `/src/pages/Dashboard.tsx` (bukan nama chunk
 * hasil build), jadi_itulah yang perlu ditahan. Sesi tamu dibuat lebih
 * dulu supaya `/dashboard` tidak dialihkan ke `/auth`.
 */
for (const width of [360, 390, 600, 768, 1280]) {
  const { context, page, errors } = await guestSession(width);

  await page.unroute("**/src/pages/Dashboard.tsx*");
  await page.route("**/src/pages/Dashboard.tsx*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });

  /* `commit` cukup: dokumen baru sudah ada tapi modul rute masih
     tertahan, jadi Suspense fallback sedang tampil dan aman diukur. */
  await page.goto(`${base}/dashboard`, { waitUntil: "commit", timeout: 30000 });

  let box = null;
  for (let attempt = 0; attempt < 70; attempt += 1) {
    box = await readBox(page, 0).catch(() => null);
    if (box) break;
    await page.waitForTimeout(40);
  }
  await page.screenshot({ path: `${TMP}/route-loading-${width}.png` }).catch(() => undefined);

  const backdrop = await readBackdrop(page, 0).catch(() => null);
  const expect = expectedMd(width);
  record(
    `RouteLoading @${width} di atas canvas #f7f8fc`,
    backdrop !== null && backdrop.hex === "#F7F8FC",
    `latar=${backdrop?.hex ?? "tidak ketemu"} (${backdrop?.css ?? "-"})`,
  );
  record(
    `RouteLoading @${width} ukuran ${expect}px dan tidak terpotong`,
    box !== null && box.w === expect && box.left >= 0 && box.right <= width,
    box ? `${box.w}x${box.h} x ${box.left}..${box.right} dari ${width}` : "tidak ketemu",
  );
  record(`RouteLoading @${width} tanpa error`, errors.length === 0, errors.slice(0, 2).join(" | ") || "0 error");

  await context.close();
}

await browser.close();
await server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan permukaan lulus.`);
if (failed.length) {
  console.log("GAGAL:");
  for (const item of failed) console.log(`  - ${item.label} :: ${item.detail}`);
  process.exitCode = 1;
}
