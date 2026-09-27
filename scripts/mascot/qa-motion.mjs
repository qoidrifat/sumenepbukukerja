/**
 * Phase 5 — pengukuran GERAK di browser sungguhan.
 *
 * Yang tidak bisa dijawab unit test, dan karena itu diukur di sini:
 *
 *  - apakah gestur `burst` benar-benar berhenti, atau diam-diam masih loop
 *    (maskot yang melambai terus ke pengguna),
 *  - apakah pose diam benar-benar tidak ikut bergeser oleh animasi,
 *  - apakah mata benar-benar mengikuti pointer dan berhenti di clamp-nya,
 *  - apakah `prefers-reduced-motion` juga mematikan lapisan mata dan tekan,
 *  - apakah tangga amplitudo ukuran benar-benar terasa di render,
 *  - apakah mount/unmount berulang meninggalkan timer yang masih menggerakkan
 *    piksel.
 *
 * Semuanya dibaca dari DOM nyata: gaya `transform` yang benar-benar ditulis
 * framer pada grup SVG, bukan dari source code.
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync, readFileSync } from "node:fs";
import { decodePng } from "../brand/png.mjs";

const PORT = 5199;
const TMP = "tmp/qa/motion-phase5";
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
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${detail}`);
};

const SOLO = "div.bg-blue-50 span.inline-flex.shrink-0";

async function openPage({ reducedMotion = "no-preference", width = 1400, height = 1000 } = {}) {
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

async function setConfig(page, { state = "neutral", category = "", size = "lg" } = {}) {
  await page.selectOption("select >> nth=0", state);
  await page.selectOption("select >> nth=1", category);
  await page.selectOption("select >> nth=2", size);
  await page.waitForTimeout(120);
}

/**
 * Probe DOM. Grup ditemukan LEWAT GEOMETRI, bukan lewat urutan: halaman kiri
 * dikenali dari awalan path-nya, mata dari rect `x="32.5"`. Jadi kalau struktur
 * grup berubah, probe ini gagal - bukan diam-diam mengukur elemen lain.
 */
const PROBE = `(() => {
  const root = document.querySelector(${JSON.stringify(SOLO)})?.querySelector("svg");
  if (!root) return null;
  const style = (el) => el?.style?.transform ?? "";
  const tx = (t) => { const m = /translateX\\((-?[\\d.eE+]+)px\\)/.exec(t); return m ? Number(m[1]) : 0; };
  const ty = (t) => { const m = /translateY\\((-?[\\d.eE+]+)px\\)/.exec(t); return m ? Number(m[1]) : 0; };
  const find = (prefix) => [...root.querySelectorAll("path")].find((p) => (p.getAttribute("d") ?? "").startsWith(prefix));
  const svg = root.parentElement;

  const leftWave = find("M44 30.6")?.parentElement;
  const rightWave = find("M52 30.6")?.parentElement;
  const eye = root.querySelector('rect[x="32.5"]');
  const gaze = eye?.parentElement;

  const hosts = [...document.querySelectorAll('svg[viewBox="0 0 96 96"]')].map((s) => s.parentElement);
  return {
    blinkOpacity: Number(gaze?.lastElementChild?.style?.opacity ?? "0"),
    leftWaveX: tx(style(leftWave)),
    rightWaveX: tx(style(rightWave)),
    leftPoseX: tx(style(leftWave?.parentElement)),
    gazeX: tx(style(gaze)),
    bodyY: ty(style(svg)),
    tabindexOnHost: hosts.filter((h) => h?.hasAttribute("tabindex")).length,
    mascots: hosts.length,
  };
})()`;

const probe = (page) => page.evaluate(PROBE);

/** Contoh gaya `transform` berulang kali, supaya gerak lambat tidak terlewat. */
async function sample(page, { times = 12, gap = 140 } = {}) {
  const out = [];
  for (let i = 0; i < times; i++) {
    out.push(await probe(page));
    if (i < times - 1) await page.waitForTimeout(gap);
  }
  return out;
}

const spread = (values) => Math.max(...values) - Math.min(...values);
const peak = (values) => Math.max(...values.map((v) => Math.abs(v)));
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

/* ------------------------------------------------------------------ */
/* 1. Gestur burst benar-benar berhenti                                */
/* ------------------------------------------------------------------ */

{
  const { context, page, errors } = await openPage();
  await setConfig(page, { state: "hello", size: "lg" });
  await page.waitForTimeout(2400); /* jauh lebih lama dari satu burst (620ms) */

  const after = await sample(page, { times: 12, gap: 140 });
  const wave = after.map((s) => s.leftWaveX);
  record(
    "hello berhenti melambai setelah gestur masuk selesai",
    peak(wave) < 0.06,
    `simpangan halaman kiri ${peak(wave).toFixed(3)} unit selama 1.7s setelah burst`,
  );

  /* Pose diam TIDAK boleh ikut bergeser oleh animasi apa pun. */
  const pose = after.map((s) => s.leftPoseX);
  record(
    "pose diam hello tetap -2.2 selama animasi berjalan",
    spread(pose) < 0.02 && approx(pose[0], -2.2, 0.01),
    `pose ${pose[0]} unit, simpangan ${spread(pose).toFixed(3)} unit`,
  );

  /* Badan tetap bernapas: berhenti melambai bukan berarti mati. */
  const body = after.map((s) => s.bodyY);
  record(
    "hello tetap bernapas setelah burst: hidup tanpa mengulang gestur",
    spread(body) > 0.05,
    `napas badan ${spread(body).toFixed(3)} unit`,
  );

  await setConfig(page, { state: "search", size: "lg" });
  await page.waitForTimeout(2400);
  const searching = await sample(page, { times: 14, gap: 150 });
  const sweep = searching.map((s) => s.leftWaveX);
  record(
    "search tetap menyapu: state-nya memang hidup dari loop",
    spread(sweep) > 0.2,
    `simpangan ${spread(sweep).toFixed(3)} unit selama 2s`,
  );

  record("tidak ada error console di studio", errors.length === 0, `${errors.length} error`);
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 2. Burst terlihat saat state masuk                                  */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage();
  await setConfig(page, { state: "neutral", size: "lg" });
  await page.waitForTimeout(2000);
  const before = await probe(page);

  await page.selectOption("select >> nth=0", "hello");
  let peakWave = 0;
  for (let i = 0; i < 12; i++) {
    const s = await probe(page);
    peakWave = Math.max(peakWave, Math.abs(s.leftWaveX));
    await page.waitForTimeout(60);
  }
  record(
    "masuk state memutar gesturnya sekali",
    peakWave > 1 && Math.abs(before.leftWaveX) < 0.06,
    `puncak lambaian ${peakWave.toFixed(2)} unit (sebelumnya ${before.leftWaveX})`,
  );
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 3. Mata: mengikuti pointer, berhenti di clamp                       */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage();
  await setConfig(page, { state: "neutral", size: "lg" });
  const box = await page.locator(SOLO).first().boundingBox();
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width * 0.99, y);
  await page.waitForTimeout(600);
  const right = await probe(page);

  await page.mouse.move(box.x + box.width * 0.01, y);
  await page.waitForTimeout(600);
  const left = await probe(page);

  await page.mouse.move(box.x + box.width / 2, y);
  await page.waitForTimeout(600);
  const centre = await probe(page);

  record(
    "mata mengikuti pointer ke kanan, lalu berhenti di clamp",
    approx(right.gazeX, 1.5, 0.06),
    `pointer di tepi kanan -> mata +${right.gazeX} unit (maks 1.5)`,
  );
  record(
    "mata mengikuti pointer ke kiri, lalu berhenti di clamp",
    approx(left.gazeX, -1.5, 0.06),
    `pointer di tepi kiri -> mata ${left.gazeX} unit (min -1.5)`,
  );
  record(
    "mata kembali ke tengah saat pointer di pusat",
    Math.abs(centre.gazeX) < 0.1,
    `mata ${centre.gazeX} unit`,
  );
  record(
    "gerak mata tidak pernah menyentuh spine (3 unit dari tepi mata)",
    Math.abs(right.gazeX) <= 1.51 && Math.abs(left.gazeX) <= 1.51,
    `batas 1.5 unit, terukur ${Math.max(Math.abs(right.gazeX), Math.abs(left.gazeX)).toFixed(2)}`,
  );
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 4. Tekan memicu gestur, tanpa meninggalkan transform kedua          */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage();
  await setConfig(page, { state: "hello", size: "lg" });
  const box = await page.locator(SOLO).first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  /* Tunggu sampai burst dari hover selesai, baru tekan. */
  await page.waitForTimeout(2400);
  const idle = await probe(page);

  await page.mouse.down();
  let peakWave = 0;
  for (let i = 0; i < 10; i++) {
    const s = await probe(page);
    peakWave = Math.max(peakWave, Math.abs(s.leftWaveX));
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  record(
    "tekan memicu gestur yang sama, bukan lapisan transform baru",
    peakWave > 1 && Math.abs(idle.leftWaveX) < 0.06,
    `puncak ${peakWave.toFixed(2)} unit setelah pointerdown`,
  );
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 5. Reduced motion mematikan mata dan tekan                          */
/* ------------------------------------------------------------------ */

{
  const { context, page, errors } = await openPage({ reducedMotion: "reduce" });
  await setConfig(page, { state: "neutral", size: "lg" });
  const box = await page.locator(SOLO).first().boundingBox();

  await page.mouse.move(box.x + box.width * 0.99, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const hovered = await probe(page);

  await page.mouse.down();
  await page.waitForTimeout(400);
  const pressed = await probe(page);
  await page.mouse.up();

  record(
    "reduced motion: mata tidak bergerak walau pointer masuk",
    Math.abs(hovered.gazeX) < 0.01,
    `mata ${hovered.gazeX} unit`,
  );
  record(
    "reduced motion: tekan tidak menggerakkan halaman",
    Math.abs(pressed.leftWaveX) < 0.06 && Math.abs(pressed.bodyY) < 0.01,
    `halaman ${pressed.leftWaveX} unit, badan ${pressed.bodyY} unit`,
  );
  record("reduced motion: tidak ada error console", errors.length === 0, `${errors.length} error`);
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 6. Tangga amplitudo: ukuran benar-benar mengubah gerak              */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage();
  const amplitude = async (size) => {
    await setConfig(page, { state: "neutral", size });
    await page.waitForTimeout(400);
    const samples = await sample(page, { times: 84, gap: 50 });
    return peak(samples.map((s) => s.bodyY));
  };

  const md = await amplitude("md");
  const lg = await amplitude("lg");
  const sm = await amplitude("sm");

  record(
    "sm tidak bergerak sama sekali (lantai ukuran beku)",
    sm < 0.01,
    `napas sm ${sm.toFixed(3)} unit`,
  );
  record(
    "md bergerak, tapi lebih kecil dari lg",
    md > 0.2 && md < lg,
    `md ${md.toFixed(2)} unit vs lg ${lg.toFixed(2)} unit`,
  );
  record(
    "hero lebih ekspresif dari lg",
    (await amplitude("hero")) > lg,
    `hero ${(await amplitude("hero")).toFixed(2)} unit vs lg ${lg.toFixed(2)} unit`,
  );
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 6b. Mematikan gerak di TENGAH gerakan                               */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage();
  await setConfig(page, { state: "neutral", size: "lg" });

  /* Tunggu sampai benar-benar tertangkap sedang bergerak. */
  let moving = 0;
  for (let i = 0; i < 20; i++) {
    const s = await probe(page);
    moving = Math.max(moving, Math.abs(s.bodyY));
    await page.waitForTimeout(45);
  }

  await page.uncheck('input[type="checkbox"]');
  await page.waitForTimeout(400);
  const frozen = await probe(page);

  /* Variant yang tidak menyebut nilai diam akan membuat framer sekadar
     BERHENTI, dan motion value-nya tertinggal di angka terakhir. Ini
     regresi yang benar-benar terjadi sebelum `REST_*` menulis nilainya. */
  record(
    "mematikan gerak di tengah napas menegakkan karakter ke posisi diam",
    moving > 0.2 && Math.abs(frozen.bodyY) < 0.01,
    `sempat bergerak ${moving.toFixed(2)} unit, lalu berhenti di ${frozen.bodyY.toFixed(3)} unit`,
  );
  record(
    "membekukan gerak tidak membuat mata tertutup",
    frozen.blinkOpacity < 0.01,
    `opacity kelopak ${frozen.blinkOpacity}`,
  );
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 7. Tidak ada maskot yang bisa difokuskan                            */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage();
  const info = await probe(page);
  const focused = await page.evaluate(`(() => {
    const hosts = [...document.querySelectorAll('svg[viewBox="0 0 96 96"]')].map((s) => s.parentElement);
    return {
      total: hosts.length,
      withTabindex: hosts.filter((h) => h?.hasAttribute("tabindex")).length,
      tabbable: hosts.filter((h) => h?.tabIndex >= 0).length,
    };
  })()`);

  record(
    "tidak ada maskot dengan tabindex (dekoratif tidak boleh jadi perhentian Tab)",
    info.tabindexOnHost === 0 && focused.withTabindex === 0 && focused.tabbable === 0,
    `${focused.total} maskot di halaman, ${focused.tabbable} bisa difokus`,
  );
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 8. Ukuran beku benar-benar beku (piksel)                            */
/* ------------------------------------------------------------------ */

{
  const { context, page } = await openPage();
  await setConfig(page, { state: "search", category: "culinary", size: "sm" });
  await page.waitForTimeout(400);
  const el = page.locator(SOLO).first();
  const a = `${TMP}/frozen-sm-a.png`;
  const b = `${TMP}/frozen-sm-b.png`;
  await el.screenshot({ path: a });
  await page.waitForTimeout(700);
  await el.screenshot({ path: b });

  const d1 = decodePng(readFileSync(a));
  const d2 = decodePng(readFileSync(b));
  let diff = 0;
  for (let i = 0; i < d1.data.length; i += 4) {
    if (Math.abs(d1.data[i] - d2.data[i]) > 3) diff += 1;
  }
  record("sm 48px tidak mengubah satu piksel pun dalam 700ms", diff === 0, `${diff} piksel berubah`);
  await context.close();
}

/* ------------------------------------------------------------------ */
/* 9. Perpindahan state cepat, dan mount/unmount berulang              */
/* ------------------------------------------------------------------ */

{
  const { context, page, errors } = await openPage();
  const states = ["neutral", "hello", "search", "found", "connect", "success", "empty", "working"];
  for (let round = 0; round < 2; round++) {
    for (const state of states) {
      await page.selectOption("select >> nth=0", state);
      await page.waitForTimeout(140);
    }
  }
  await page.waitForTimeout(1200);
  const after = await probe(page);
  record(
    "delapan state berturut-turut tidak meninggalkan error",
    errors.length === 0,
    `${errors.length} error`,
  );
  record(
    "setelah perpindahan cepat, maskot masih hidup dan masih dekoratif",
    after.mascots > 50 && after.tabindexOnHost === 0,
    `${after.mascots} maskot, ${after.tabindexOnHost} tabindex`,
  );

  /* Navigasi pergi dan kembali: remount penuh, berulang. */
  const nodeCounts = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(700);
    await page.goto(`${base}/__mascot`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(700);
    nodeCounts.push(await page.evaluate(() => document.querySelectorAll("*").length));
  }
  record(
    "navigasi pergi-kembali tiga kali tidak menumbuhkan DOM",
    new Set(nodeCounts).size === 1,
    `jumlah node: ${nodeCounts.join(", ")}`,
  );
  record(
    "navigasi berulang tidak meninggalkan error console",
    errors.length === 0,
    `${errors.length} error`,
  );
  await context.close();
}

await browser.close();
await server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pemeriksaan gerak lulus.`);
if (failed.length) process.exit(1);
