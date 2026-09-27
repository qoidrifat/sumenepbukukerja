/**
 * Survei maskot di permukaan produk nyata.
 *
 * Menjawab: maskot mana yang benar-benar muncul di setiap rute, apakah ada
 * yang tidak seharusnya, dan apakah tidak ada duplikasi (dua ilustrasi di
 * tempat yang sama).
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const PORT = 5199;
const OUT = "tmp/qa/context";
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });

/** Klasifikasikan tiap svg di halaman berdasarkan atribut/path-nya. */
async function survey(page) {
  return page.evaluate(() => {
    const out = { brand: 0, category: 0, request: 0, adminEmpty: 0, other: 0, brandBoxes: [] };
    for (const svg of document.querySelectorAll("svg")) {
      const d = [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "").join("|");
      let kind = "other";
      if (d.includes("M67 27.8L80 40.8L67 40.8Z") || d.includes("M53 27.2L73 47.2L53 47.2Z")) {
        kind = "brand";
      } else if (svg.getAttribute("viewBox") === "0 0 120 120" && d.length > 0) {
        kind = "legacy120";
      }
      if (kind === "brand") {
        out.brand += 1;
        const r = svg.getBoundingClientRect();
        if (r.width > 0) {
          out.brandBoxes.push({ w: Math.round(r.width), h: Math.round(r.height) });
        }
        continue;
      }
      if (kind === "legacy120") {
        /* Pisahkan tiga maskot lama lewat signature path masing-masing. */
        if (d.includes("M55 79c3 2.4 7 2.4 10 0") || d.includes("c3 2.4 7 2.4 10 0")) {
          out.request += 1;
        } else if (d.includes("Z") && d.match(/M/g)?.length > 6) {
          out.adminEmpty += 1;
        } else {
          out.other += 1;
        }
        continue;
      }
      out.other += 1;
    }
    return out;
  });
}

const ROUTES = [
  ["/", 1440, 900],
  ["/", 390, 844],
  ["/nonexistent-route-for-qa", 1280, 900],
  ["/nonexistent-route-for-qa", 390, 844],
  ["/admin", 1440, 900],
  ["/auth", 1280, 900],
  ["/dashboard", 1280, 900],
];

for (const [path, w, h] of ROUTES) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1400);
    const s = await survey(page);
    const name = path.replace(/\//g, "_") || "_root";
    await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: false });
    const sizes = [...new Set(s.brandBoxes.map((b) => `${b.w}px`))].join(",") || "-";
    console.log(
      `${path.padEnd(30)} ${String(w).padEnd(5)} brand=${s.brand} legacy120=${s.other} ` +
        `error=${errors.length} ukuranBrand=${sizes}`,
    );
  } catch (e) {
    console.log(`${path.padEnd(30)} ${String(w).padEnd(5)} GAGAL: ${e.message.split("\n")[0]}`);
  }
  await context.close();
}

await browser.close();
await server.close();
