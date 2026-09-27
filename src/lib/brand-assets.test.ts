import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Regression test untuk asset brand.
 *
 * Script `scripts/brand/validate-brand.mjs` melakukan pengukuran jauh lebih
 * dalam (piksel PNG, isi .ico, maskable safe zone). Test ini hanya mengunci
 * hal yang harus tetap benar tanpa perlu build ulang: file ada, manifest
 * menunjuk file yang benar, SVG bersih, dan tidak ada asset brand yang
 * keluar dari palet.
 *
 * File ini berada di src/ supaya ikut typecheck/lint; tidak ada yang
 * mengimpornya di runtime.
 */

const read = (path: string) => readFileSync(path, "utf8");

const REQUIRED_ASSETS = [
  "public/favicon.svg",
  "public/favicon.ico",
  "public/logo.svg",
  "public/manifest.webmanifest",
  "public/brand/logo-mark.svg",
  "public/brand/logo-primary.svg",
  "public/brand/logo-primary-dark.svg",
  "public/brand/logo-stacked.svg",
  "public/brand/logo-wordmark.svg",
  "public/brand/logo-mono-black.svg",
  "public/brand/logo-mono-white.svg",
  "public/brand/logo-mono-navy.svg",
  "public/brand/icon-16.svg",
  "public/brand/icon-180.svg",
  "public/brand/icon-192.svg",
  "public/brand/icon-512.svg",
  "public/brand/icon-maskable-512.svg",
  "public/brand/icon-16.png",
  "public/brand/icon-32.png",
  "public/brand/icon-48.png",
  "public/brand/apple-touch-icon.png",
  "public/brand/icon-192.png",
  "public/brand/icon-512.png",
  "public/brand/icon-maskable-512.png",
];

const BRAND_TOKENS = new Set([
  "#2563EB",
  "#1D4ED8",
  "#93C5FD",
  "#DBEAFE",
  "#121212",
  "#0F172A",
  "#F59E0B",
  "#FFFFFF",
  "#FAF7EE",
]);

test("semua asset brand wajib ada", () => {
  const missing = REQUIRED_ASSETS.filter((path) => !existsSync(path));
  expect(missing).toEqual([]);
});

test("PNG punya signature dan ukuran yang benar", () => {
  const expected: Record<string, number> = {
    "public/brand/icon-16.png": 16,
    "public/brand/icon-32.png": 32,
    "public/brand/icon-48.png": 48,
    "public/brand/apple-touch-icon.png": 180,
    "public/brand/icon-192.png": 192,
    "public/brand/icon-512.png": 512,
    "public/brand/icon-maskable-512.png": 512,
  };
  for (const [path, size] of Object.entries(expected)) {
    const buffer = readFileSync(path);
    expect([...buffer.subarray(0, 4)], path).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(buffer.readUInt32BE(16), `${path} lebar`).toBe(size);
    expect(buffer.readUInt32BE(20), `${path} tinggi`).toBe(size);
  }
});

test("manifest hanya menunjuk asset yang ada, dan punya PNG lengkap", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  for (const icon of manifest.icons) {
    expect(existsSync(`public${icon.src}`), `${icon.src} hilang`).toBe(true);
  }
  const png = manifest.icons.filter((i: { type: string }) => i.type === "image/png");
  expect(png.some((i: { sizes: string }) => i.sizes === "192x192")).toBe(true);
  expect(png.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
  expect(
    png.some((i: { purpose?: string }) => i.purpose === "maskable"),
    "maskable PNG wajib ada untuk adaptive icon Android",
  ).toBe(true);
});

test("SVG brand bersih: ada viewBox, tanpa bitmap/base64/URL eksternal", () => {
  for (const path of REQUIRED_ASSETS.filter((p) => p.endsWith(".svg"))) {
    const source = read(path);
    expect(source, `${path} tanpa viewBox`).toMatch(/viewBox="[-\d. ]+"/);
    expect(source, `${path} memuat bitmap`).not.toContain("<image");
    expect(source, `${path} memuat base64`).not.toContain("base64");
    expect(source, `${path} memakai <use>`).not.toContain("<use");
    expect(source, `${path} punya metadata editor`).not.toMatch(/<metadata|inkscape:|sodipodi:/);
    expect(source, `${path} punya URL eksternal`).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  }
});

test("favicon memakai symbol saja, tanpa wordmark maupun tagline", () => {
  const favicon = read("public/favicon.svg");
  // <title>/<desc> itu metadata untuk bookmark, bukan teks yang dirender.
  // Yang dilarang adalah elemen teks yang benar-benar tampil.
  expect(favicon).not.toContain("<text");
  expect(favicon).not.toContain("<tspan");
  // Bentuk visualnya hanya field + buku + lipatan.
  const shapes = [...favicon.matchAll(/<(rect|path|circle|ellipse)\b/g)].length;
  expect(shapes).toBe(4);
});

test("varian monokrom benar-benar satu warna dengan viewBox rapat", () => {
  for (const name of ["logo-mono-black", "logo-mono-white", "logo-mono-navy"]) {
    const source = read(`public/brand/${name}.svg`);
    const fills = [...source.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!.toUpperCase());
    expect(fills.length, `${name} tidak boleh kosong`).toBeGreaterThan(0);
    expect(new Set(fills).size, `${name} punya lebih dari satu warna`).toBe(1);

    // Tanpa field biru, viewBox boleh rapat ke batas buku supaya tidak ada
    // ruang kosong yang terbuang.
    const box = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(source)!;
    const width = Number(box[1]);
    const height = Number(box[2]);
    expect(width, `${name} viewBox terlalu lebar`).toBeLessThanOrEqual(70);
    expect(height, `${name} viewBox terlalu tinggi`).toBeLessThanOrEqual(50);
    expect(width / height, `${name} terlalu persegi`).toBeGreaterThan(1.2);
  }
});

test("warna SVG brand hanya memakai token yang disetujui", () => {
  for (const path of REQUIRED_ASSETS.filter((p) => p.endsWith(".svg"))) {
    for (const match of read(path).matchAll(/#[0-9A-Fa-f]{6}/g)) {
      const colour = match[0].toUpperCase();
      expect(BRAND_TOKENS.has(colour), `${path} memakai ${colour}`).toBe(true);
    }
  }
});

test("index.html merujuk favicon dan apple-touch-icon yang benar", () => {
  const html = read("index.html");
  // apple-touch-icon wajib PNG: iOS mengabaikan SVG untuk peran ini.
  expect(html).toContain('rel="icon" href="/favicon.ico"');
  expect(html).toContain('rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon.png"');
  for (const match of html.matchAll(/(?:href|src)="\/([^"]+)"/g)) {
    const ref = match[1]!;
    if (ref.startsWith("src/")) continue;
    expect(existsSync(`public/${ref}`), `${ref} tidak ada`).toBe(true);
  }
});

test("hanya ada satu sumber logo di dalam aplikasi", () => {
  // src/assets/logo.svg pernah jadi duplikat byte-per-byte dari
  // public/brand/logo-mark.svg. Semua pemakai sekarang ke /brand/.
  expect(existsSync("src/assets/logo.svg")).toBe(false);
  expect(read("public/logo.svg")).toBe(read("public/brand/logo-mark.svg"));
});
