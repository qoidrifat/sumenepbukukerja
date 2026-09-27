/**
 * Pengukuran perilaku di browser sungguhan.
 *
 * Hal-hal yang tidak bisa dijawab dari source code:
 *  - apakah animasi benar-benar mengubah piksel,
 *  - apakah prefers-reduced-motion benar-benar menghentikannya,
 *  - apakah ada layout shift,
 *  - apakah ada overflow horizontal di mobile,
 *  - apakah atribut aksesibilitas benar-benar ada di DOM.
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { decodePng } from "../brand/png.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const PORT = 5199;
const TMP = "tmp/qa/motion";
mkdirSync(TMP, { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const results = [];
const record = (label, ok, detail) => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(56)} ${detail}`);
};

async function openPage({ reducedMotion, width = 1400, height = 1000 }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion,
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

/** Solo public = span pertama di panel biru. */
const solo = (page) => page.locator("div.bg-blue-50 span.inline-flex.shrink-0").first();

async function setConfig(page, { state = "neutral", category = "", size = "md" } = {}) {
  await page.selectOption("select >> nth=0", state);
  await page.selectOption("select >> nth=1", category);
  await page.selectOption("select >> nth=2", size);
  await page.waitForTimeout(250);
}

/* ------------------------------------------------------------------ */
/* 1. Gerak benar-benar berjalan                                       */
/* ------------------------------------------------------------------ */

async function animationMoves(reducedMotion, tag) {
  const { context, page } = await openPage({ reducedMotion });
  await setConfig(page, { state: "hello", size: "lg" });
  const el = solo(page);

  const boxA = await el.boundingBox();
  const a = `${TMP}/${tag}-a.png`;
  const b = `${TMP}/${tag}-b.png`;
  await el.screenshot({ path: a });
  await page.waitForTimeout(700);
  await el.screenshot({ path: b });
  const boxB = await el.boundingBox();

  const d1 = decodePng(readFileSync(a));
  const d2 = decodePng(readFileSync(b));
  let diff = 0;
  for (let i = 0; i < d1.data.length; i += 4) {
    if (
      Math.abs(d1.data[i] - d2.data[i]) > 3 ||
      Math.abs(d1.data[i + 1] - d2.data[i + 1]) > 3 ||
      Math.abs(d1.data[i + 2] - d2.data[i + 2]) > 3
    ) {
      diff += 1;
    }
  }
  const shift =
    Math.abs(boxA.x - boxB.x) + Math.abs(boxA.y - boxB.y) + Math.abs(boxA.width - boxB.width);
  await context.close();
  return { diff, total: d1.data.length / 4, shift, boxA, boxB };
}

const moving = await animationMoves("no-preference", "motion-on");
record(
  "animasi idle mengubah piksel (tidak freeze)",
  moving.diff > moving.total * 0.001,
  `${moving.diff} piksel berubah dari ${moving.total} (${((moving.diff / moving.total) * 100).toFixed(2)}%)`,
);
record(
  "tidak ada layout shift selama animasi",
  moving.shift === 0,
  `perubahan bounding box ${moving.shift}px`,
);

const reduced = await animationMoves("reduce", "motion-reduced");
record(
  "prefers-reduced-motion benar-benar membekukan render",
  reduced.diff === 0,
  `${reduced.diff} piksel berubah dari ${reduced.total}`,
);
record(
  "reduced motion tidak menggeser posisi",
  reduced.shift === 0,
  `perubahan bounding box ${reduced.shift}px`,
);

/* ------------------------------------------------------------------ */
/* 2. animated={false} membekukan tanpa mengubah bentuk                 */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage({ reducedMotion: "no-preference" });
  await setConfig(page, { state: "found", category: "culinary", size: "hero" });
  await page.uncheck('input[type="checkbox"]');
  await page.waitForTimeout(300);
  const el = solo(page);
  const a = `${TMP}/static-a.png`;
  const b = `${TMP}/static-b.png`;
  await el.screenshot({ path: a });
  await page.waitForTimeout(700);
  await el.screenshot({ path: b });
  const d1 = decodePng(readFileSync(a));
  const d2 = decodePng(readFileSync(b));
  let diff = 0;
  for (let i = 0; i < d1.data.length; i += 4) {
    if (Math.abs(d1.data[i] - d2.data[i]) > 3) diff += 1;
  }
  await context.close();
  record("animated={false} membekukan piksel", diff === 0, `${diff} piksel berubah`);
}

/* ------------------------------------------------------------------ */
/* 3. Aksesibilitas di DOM nyata                                       */
/* ------------------------------------------------------------------ */

{
  const { context, page, errors } = await openPage({ reducedMotion: "no-preference" });
  const info = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("span[aria-hidden='true'], span[role='img']")];
    const m = spans.filter((s) => s.querySelector("svg"));
    const first = m[0];
    return {
      total: spans.length,
      withSvg: m.length,
      hidden: first?.getAttribute("aria-hidden"),
      role: first?.getAttribute("role"),
      hasTitle: !!first?.querySelector("title"),
      svgFocusable: first?.querySelector("svg")?.getAttribute("focusable"),
      textNodes: first?.querySelectorAll("text").length ?? -1,
      images: first?.querySelectorAll("image").length ?? -1,
      uses: first?.querySelectorAll("use").length ?? -1,
    };
  });
  record("maskot dekoratif disembunyikan dari a11y tree", info.hidden === "true", `aria-hidden=${info.hidden}`);
  record("tidak ada role/label yang menggandakan", info.role === null && !info.hasTitle, `role=${info.role} title=${info.hasTitle}`);
  record("svg tidak bisa jadi target fokus", info.svgFocusable === "false", `focusable=${info.svgFocusable}`);
  record("tidak ada <text>/<image>/<use> di dalam svg", info.textNodes === 0 && info.images === 0 && info.uses === 0, `text=${info.textNodes} image=${info.images} use=${info.uses}`);
  record("tidak ada pageerror di preview", errors.length === 0, `${errors.length} error`);
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 4. Overflow horizontal di viewport sempit                            */
/* ------------------------------------------------------------------ */

for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
  const { context, page } = await openPage({ reducedMotion: "reduce", width: w, height: h });
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  record(
    `/__mascot tidak overflow di ${w}px`,
    m.scrollW <= m.clientW + 1,
    `scrollW=${m.scrollW} clientW=${m.clientW}`,
  );
  await context.close();
}

for (const [w, h, path] of [[360, 780, "/"], [390, 844, "/"], [360, 780, "/nonexistent-route-for-qa"]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  record(
    `${path} tidak overflow di ${w}px`,
    m.scrollW <= m.clientW + 1,
    `scrollW=${m.scrollW} clientW=${m.clientW}`,
  );
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 5. Hover bereaksi                                                    */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage({ reducedMotion: "reduce" });
  await setConfig(page, { state: "neutral", size: "lg" });
  const el = solo(page);
  await el.hover();
  await page.waitForTimeout(250);
  const hovered = await el.boundingBox();
  record(
    "hover tidak mengubah ukuran elemen",
    Math.abs(hovered.width - 208) < 2,
    `lebar saat hover ${Math.round(hovered.width)}px`,
  );
  await context.close();
}

await browser.close();
await server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan browser lulus.`);
if (failed.length) process.exit(1);
