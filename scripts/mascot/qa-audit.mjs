/**
 * Phase 5.1 — audit RASA gerak: yang bisa diukur dari luar diukur di sini,
 * sisanya disiapkan sebagai paket tangkapan untuk review mata manusia.
 *
 * Dua mode:
 *   node scripts/mascot/qa-audit.mjs pre     -> ukur puncak lompatan success
 *                                               SEBELUM tune (bukti before)
 *   node scripts/mascot/qa-audit.mjs audit   -> paket lengkap: grids A-D,
 *                                               pengukuran after, fatigue 60s
 *
 * Semua tangkapan masuk `tmp/qa/audit-phase51/` (gitignored).
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const MODE = process.argv[2] ?? "audit";
const PORT = 5199;
const OUT = "tmp/qa/audit-phase51";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const SOLO = "div.bg-blue-50 span.inline-flex.shrink-0";
const results = [];
const record = (label, ok, detail) => {
  results.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(56)} ${detail}`);
};

/* Probe DOM yang sama dengan qa-motion: grup ditemukan lewat geometri path,
   bukan urutan, jadi probe tidak mungkin diam-diam mengukur elemen lain. */
const PROBE = `(() => {
  const root = document.querySelector(${JSON.stringify(SOLO)})?.querySelector("svg");
  if (!root) return null;
  const style = (el) => el?.style?.transform ?? "";
  const tx = (t) => { const m = /translateX\\((-?[\\d.eE+]+)px\\)/.exec(t); return m ? Number(m[1]) : 0; };
  const ty = (t) => { const m = /translateY\\((-?[\\d.eE+]+)px\\)/.exec(t); return m ? Number(m[1]) : 0; };
  const find = (prefix) => [...root.querySelectorAll("path")].find((p) => (p.getAttribute("d") ?? "").startsWith(prefix));
  const eye = root.querySelector('rect[x="32.5"]');
  return {
    bodyY: ty(style(root.parentElement)),
    leftWaveX: tx(style(find("M44 30.6")?.parentElement)),
    gazeX: tx(style(eye?.parentElement)),
    blinkOpacity: Number(eye?.parentElement?.lastElementChild?.style?.opacity ?? "0"),
  };
})()`;
const probe = (page) => page.evaluate(PROBE);

async function openPage({ width = 1400, height = 1000, dsf = 2 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}/__mascot`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(600);
  return { context, page, errors };
}

async function setConfig(page, { state = "neutral", size = "lg" } = {}) {
  await page.selectOption("select >> nth=0", state);
  await page.selectOption("select >> nth=2", size);
  await page.waitForTimeout(150);
}

/** Puncak perpindahan badan selama satu burst, plus tangkapan di puncak. */
async function measureBurst(page, { state, file }) {
  await setConfig(page, { state });
  await page.waitForTimeout(2400); // burst masuk state selesai
  await page.getByRole("button", { name: "Replay state" }).click();
  const ys = [];
  for (let i = 0; i < 22; i++) {
    ys.push(Math.abs((await probe(page)).bodyY));
    await page.waitForTimeout(55);
  }
  const peak = Math.max(...ys);
  if (file) {
    await page.waitForTimeout(Math.max(0, 240 - ys.indexOf(peak) * 55));
    await page.locator(SOLO).first().screenshot({ path: `${OUT}/${file}` });
  }
  return peak;
}

/* ------------------------------------------------------------------ */
/* MODE pre: bukti before untuk tune celebration                        */
/* ------------------------------------------------------------------ */

if (MODE === "pre") {
  const { context, page } = await openPage();
  const peak = await measureBurst(page, { state: "success", file: "pre-tune-success-burst.png" });
  console.log(`pre-tune success burst peak: ${peak.toFixed(2)} unit`);
  await context.close();
  await browser.close();
  await server.close();
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* MODE audit: paket visual lengkap + pengukuran after + fatigue        */
/* ------------------------------------------------------------------ */

/* Grid A + B: grid "Delapan state inti" pada 96/112/144 px, normal & expressive. */
if (MODE === "visual" || MODE === "audit") {
  const { context, page, errors } = await openPage({ width: 600, height: 950 });
  const grid = page.locator("section", { hasText: "Delapan state inti" }).first();

  const sizes = {};
  for (const [tag, width] of [
    ["96", 600],
    ["112", 800],
    ["144", 1280],
  ]) {
    await page.setViewportSize({ width, height: width < 900 ? 950 : 1100 });
    await page.waitForTimeout(350);
    sizes[tag] = Math.round(
      await grid.locator("span.inline-flex.shrink-0").first().boundingBox().then((b) => b.width),
    );
    await grid.screenshot({ path: `${OUT}/phase5.1-normal-${tag}.png` });

    await page.getByRole("button", { name: "expressive" }).click();
    await page.waitForTimeout(350);
    await grid.screenshot({ path: `${OUT}/phase5.1-expressive-${tag}.png` });
    await page.getByRole("button", { name: "normal", exact: true }).click();
  }

  for (const tag of ["96", "112", "144"]) {
    record(`grid A/B dirender pada ${tag}px sejati`, sizes[tag] === Number(tag), `md = ${sizes[tag]}px`);
  }
  record("grid A/B tanpa error console", errors.length === 0, `${errors.length} error`);

  /* Expressive = pengali, bukan karakter lain. */
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.waitForTimeout(300);
  const normalPeak = await measureBurst(page, { state: "neutral" });
  await page.getByRole("button", { name: "expressive" }).click();
  await page.waitForTimeout(300);
  const exprPeak = await measureBurst(page, { state: "neutral" });
  await page.getByRole("button", { name: "normal", exact: true }).click();
  const ratio = exprPeak / normalPeak;
  record(
    "expressive hanya menguatkan, tidak mengubah karakter",
    ratio > 1.2 && ratio < 1.5,
    `puncak tanggapan normal ${normalPeak.toFixed(2)} vs expressive ${exprPeak.toFixed(2)} (rasio ${ratio.toFixed(2)})`,
  );
  await context.close();
}

/* Grid C: interaksi per state yang representatif. */
if (MODE === "visual" || MODE === "audit") {
  const { context, page, errors } = await openPage({ width: 1400, height: 1000 });
  const solo = page.locator(SOLO).first();

  /* Tanggapan burst per state, tepat setelah Replay. */
  for (const state of ["hello", "found", "success", "working", "empty", "connect"]) {
    await setConfig(page, { state });
    await page.getByRole("button", { name: "Replay state" }).click();
    await page.waitForTimeout(330);
    await solo.screenshot({ path: `${OUT}/phase5.1-int-${state}-burst.png` });
    await page.waitForTimeout(2200);
    if (state === "hello" || state === "success") {
      await solo.screenshot({ path: `${OUT}/phase5.1-int-${state}-settle.png` });
    }
  }

  /* Hover: hello memberi tanggapan, search menoleh ke pointer. Tombolnya
     toggle (Simulate/End hover), jadi posisinya dibaca dari aria-pressed,
     bukan dari nama tombol. */
  const hoverBtn = page.getByRole("button", { name: /hover/ });
  const ensureHover = async (on) => {
    const pressed = (await hoverBtn.getAttribute("aria-pressed")) === "true";
    if (pressed !== on) await hoverBtn.click();
  };
  await setConfig(page, { state: "hello" });
  await ensureHover(true);
  await page.waitForTimeout(320);
  await solo.screenshot({ path: `${OUT}/phase5.1-int-hello-hover.png` });

  await setConfig(page, { state: "search" });
  await ensureHover(true);
  await page.waitForTimeout(700);
  const gazed = await probe(page);
  await solo.screenshot({ path: `${OUT}/phase5.1-int-search-gaze.png` });
  record(
    "search menoleh ke arah pointer saat hover",
    Math.abs(gazed.gazeX) > 0.3,
    `mata ${gazed.gazeX.toFixed(2)} unit (pointer di 78% lebar)`,
  );

  /* Tap: setelah settle, satu tanggapan. Hover dimatikan dulu supaya yang
     terukur murni tanggapan tekan. */
  await ensureHover(false);
  await setConfig(page, { state: "hello" });
  await page.waitForTimeout(2400);
  await page.getByRole("button", { name: "Simulate tap" }).click();
  await page.waitForTimeout(260);
  await solo.screenshot({ path: `${OUT}/phase5.1-int-hello-tap.png` });

  /* Settle hello: sekali melambai lalu tenang. */
  await setConfig(page, { state: "hello" });
  await page.waitForTimeout(2400);
  const settle = await probe(page);
  record("hello benar-benar tenang setelah sapa", Math.abs(settle.leftWaveX) < 0.06, `halaman ${settle.leftWaveX.toFixed(3)} unit`);

  record("grid C tanpa error console", errors.length === 0, `${errors.length} error`);
  await context.close();
}

/* Pengukuran after-tune celebration. */
if (MODE === "visual" || MODE === "audit") {
  const { context, page } = await openPage({ dsf: 2 });
  const peak = await measureBurst(page, { state: "success", file: "post-tune-success-burst.png" });
  record(
    "success: lompatan kini di bawah tanggapan neutral (2.4)",
    peak < 2.4,
    `puncak ${peak.toFixed(2)} unit`,
  );
  await context.close();
}

/* Grid D: konteks produksi. */
if (MODE === "prod" || MODE === "audit") {
  const contexts = [
    ["/", "home"],
    ["/auth", "auth"],
    ["/nonexistent-route-for-qa", "404"],
  ];
  for (const [w, h, tag] of [
    [1280, 900, "1280"],
    [390, 844, "390"],
  ]) {
    const { context, page, errors } = await openPage({ width: w, height: h, dsf: 1 });
    for (const [route, name] of contexts) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/phase5.1-prod-${name}-${tag}.png`, fullPage: true });
    }
    record(`grid D (${tag}) tanpa error console`, errors.length === 0, `${errors.length} error`);
    await context.close();
  }
}

/* §9 Fatigue: 60 detik state `working` — amplitudo tidak boleh menumbuhkan
   diri (tanda animasi menumpuk), DOM tidak boleh tumbuh, mata tetap sehat. */
if (MODE === "fatigue" || MODE === "audit") {
  const { context, page, errors } = await openPage({ dsf: 1 });
  await setConfig(page, { state: "working" });
  await page.waitForTimeout(1000);
  const nodesStart = await page.evaluate(() => document.querySelectorAll("*").length);

  const samples = [];
  for (let i = 0; i < 20; i++) {
    samples.push(await probe(page));
    await page.waitForTimeout(3000);
  }
  const third = (from, to) => Math.max(...samples.slice(from, to).map((s) => Math.abs(s.bodyY)));
  const t1 = third(0, 7);
  const t2 = third(7, 14);
  const t3 = third(14, 20);
  const peak = Math.max(...samples.map((s) => Math.abs(s.bodyY)));
  const blinkShare = samples.filter((s) => s.blinkOpacity > 0.5).length / samples.length;
  const nodesEnd = await page.evaluate(() => document.querySelectorAll("*").length);

  record(
    "fatigue 60s: napas working tidak menumbuhkan diri",
    peak < 0.95 && t3 < t1 * 1.15,
    `puncak ${peak.toFixed(2)} unit (batas napas 0.8); t1 ${t1.toFixed(2)} / t3 ${t3.toFixed(2)}`,
  );
  record(
    "fatigue 60s: kedip tetap kejadian singkat, bukan mata terpejam",
    blinkShare < 0.25,
    `${Math.round(blinkShare * 100)}% sampel mata tertutup`,
  );
  record(
    "fatigue 60s: DOM stabil, tidak ada animasi menumpuk",
    Math.abs(nodesEnd - nodesStart) < 40,
    `node ${nodesStart} -> ${nodesEnd}`,
  );
  record("fatigue 60s: tanpa error console", errors.length === 0, `${errors.length} error`);
  await context.close();
}

await browser.close();
await server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan audit lulus.`);
if (failed.length) process.exit(1);
