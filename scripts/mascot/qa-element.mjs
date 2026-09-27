/**
 * Tangkapan per-elemen untuk inspeksi visual.
 *
 * Versi ini hanya memotret SATU maskot per konfigurasi (bukan seluruh
 * halaman), jadi hasilnya kecil dan bisa langsung dibaca sebagai karakter
 * di terminal.
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const PORT = 5199;
const OUT = "tmp/qa/element";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const SHOTS = [
  ["neutral-96", { state: "neutral", size: "md", idx: 0 }],
  ["neutral-96-admin", { state: "neutral", size: "md", idx: 1 }],
  ["hello-144", { state: "hello", size: "lg" }],
  ["search-144", { state: "search", size: "lg" }],
  ["found-144", { state: "found", size: "lg" }],
  ["connect-144", { state: "connect", size: "lg" }],
  ["success-144", { state: "success", size: "lg" }],
  ["empty-144", { state: "empty", size: "lg" }],
  ["working-144", { state: "working", size: "lg" }],
  ["working-144-admin", { state: "working", size: "lg", idx: 1 }],
  ["technical-320", { state: "neutral", category: "technical", size: "hero" }],
  ["events-320", { state: "neutral", category: "events", size: "hero" }],
  ["culinary-320", { state: "neutral", category: "culinary", size: "hero" }],
  ["transport-320", { state: "neutral", category: "transport", size: "hero" }],
  ["general-320", { state: "neutral", category: "general", size: "hero" }],
  ["found-culinary-256", { state: "found", category: "culinary", size: "hero" }],
  ["success-events-256", { state: "success", category: "events", size: "hero" }],
  ["scale-24", { state: "neutral", size: "micro" }],
  ["scale-48", { state: "neutral", size: "sm" }],
  ["scale-96", { state: "neutral", size: "md" }],
  ["scale-144", { state: "neutral", size: "lg" }],
  ["scale-256", { state: "neutral", size: "hero" }],
];

const context = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 3,
  /* Freeze semua gerak: tanpa ini aksesori bisa tertangkap pada tengah
     animasi opacity-nya dan assessments warna jadi salah. */
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/__mascot`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(700);

for (const [name, cfg] of SHOTS) {
  try {
    await page.selectOption("select >> nth=0", cfg.state ?? "neutral");
    await page.selectOption("select >> nth=1", cfg.category ?? "");
    await page.selectOption("select >> nth=2", cfg.size ?? "md");
    await page.selectOption("select >> nth=3", "public");
    await page.waitForTimeout(260);
    /* Panel solo punya DUA maskot: idx 0 public, idx 1 admin. */
    const target = page.locator("div.bg-blue-50 span.inline-flex.shrink-0").nth(cfg.idx ?? 0);
    await target.screenshot({ path: `${OUT}/${name}.png` });
    const box = await target.boundingBox();
    console.log(
      `${name.padEnd(24)} rendered ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "?"}`,
    );
  } catch (e) {
    console.log(`${name.padEnd(24)} FAILED ${e.message.split("\n")[0]}`);
  }
}

await context.close();
await browser.close();
await server.close();
console.log(errors.length ? `pageerror: ${errors.slice(0, 3).join(" | ")}` : "no page errors");
