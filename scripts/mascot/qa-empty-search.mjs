/**
 * Memicu keadaan "tidak ada hasil" di Beranda dan memastikan maskot brand
 * benar-benar muncul di sana.
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const PORT = 5199;
const OUT = "tmp/qa/empty";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);

  /* Ada DUA input dengan placeholder yang sama: yang pertama berukuran 0x0
     (toggle mobile/desktop), jadi ambil yang benar-benar terlihat. */
  const input = page
    .getByPlaceholder("Cari usaha atau jasa...")
    .filter({ visible: true })
    .first();
  const hasInput = (await input.count()) > 0;
  let found = false;
  if (hasInput) {
    await input.scrollIntoViewIfNeeded();
    await input.fill("zzzzqqqxyzzyangtidakadadidalamsumenep");
    await page.waitForTimeout(2200);
    const res = await page.evaluate(() => {
      const svgs = [...document.querySelectorAll("svg")];
      const brand = svgs.find((s) =>
        [...s.querySelectorAll("path")].some((p) => (p.getAttribute("d") ?? "").includes("M67 27.8L80 40.8L67 40.8Z")),
      );
      if (!brand) return { brand: false };
      const r = brand.getBoundingClientRect();
      return { brand: true, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    });
    found = res.brand;
    console.log(`${w}px  input=${hasInput}  maskotBrand=${JSON.stringify(res)}  error=${errors.length}`);
    /* Tangkap area keadaan kosong. */
    if (found) {
      const el = page.locator("svg").filter({ has: page.locator('path[d*="M67 27.8L80 40.8L67 40.8Z"]') }).first();
      await el.screenshot({ path: `${OUT}/empty-search-mascot-${w}.png` }).catch(() => {});
    }
    await page.screenshot({ path: `${OUT}/empty-search-${w}.png`, fullPage: false });
  } else {
    console.log(`${w}px  input pencarian tidak ditemukan`);
  }
  if (!found) console.log(`  -> WARNING: maskot brand tidak muncul di keadaan kosong (${w}px)`);
  await context.close();
}

await browser.close();
await server.close();
