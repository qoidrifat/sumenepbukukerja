/**
 * Tangkapan "before/after" pada ukuran yang benar-benar 96 CSS px.
 *
 * `size="md"` adalah `size-24 sm:size-28 xl:size-36`, jadi di viewport
 * 1280+ ia merender 144px, bukan 96. Untuk memperoleh 96px sejati, viewport
 * sengaja dikecilkan ke lebar < 1280.
 *
 * Pakai: node scripts/mascot/qa-studio.mjs <label>
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const label = process.argv[2] ?? "shot";
const PORT = 5199;
const OUT = `tmp/qa/studio/${label}`;
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const STATES = ["neutral", "hello", "search", "found", "connect", "success", "empty", "working"];
const CATS = ["technical", "events", "culinary", "transport", "general"];

/* Viewport 600 -> di bawah breakpoint `sm` (640), jadi size="md" jatuh ke
   size-24 = 96px. Viewport 1100 akan memberi 112px (sm:size-28). */
const context = await browser.newContext({
  viewport: { width: 600, height: 900 },
  deviceScaleFactor: 4,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/__mascot`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(800);

const solo = () => page.locator("div.bg-blue-50 span.inline-flex.shrink-0").first();

async function shoot(name, { state = "neutral", category = "" } = {}) {
  await page.selectOption("select >> nth=0", state);
  await page.selectOption("select >> nth=1", category);
  await page.selectOption("select >> nth=2", "md");
  await page.waitForTimeout(240);
  const el = solo();
  const box = await el.boundingBox();
  await el.screenshot({ path: `${OUT}/${name}.png` });
  return Math.round(box.width);
}

const sizes = {};
for (const s of STATES) sizes[s] = await shoot(`state-${s}-96`, { state: s });
for (const c of CATS) sizes[`cat-${c}`] = await shoot(`cat-${c}-96`, { category: c });

/* Grid perbandingan satu gambar: semua state berdampingan supaya
   perbedaannya bisa dinilai tanpa membuka delapan file. */
await page.selectOption("select >> nth=1", "");
await page.selectOption("select >> nth=2", "md");
await page.waitForTimeout(200);
const grid = page.locator("section", { hasText: "Delapan state inti" }).first();
await grid.screenshot({ path: `${OUT}/grid-states-96.png` });

await context.close();
await browser.close();
await server.close();

console.log(`${label}: ukuran render (CSS px)`);
for (const [k, v] of Object.entries(sizes)) console.log(`  ${k.padEnd(16)} ${v}px`);
console.log(errors.length ? `pageerror: ${errors.slice(0, 3).join(" | ")}` : "no page errors");
