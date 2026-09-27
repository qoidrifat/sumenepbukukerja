/**
 * Lihat PNG sebagai teks.
 *
 * Environment ini tidak punya channel gambar, jadi screenshot browser
 * diubah jadi karakter supaya piksel render sungguhan bisa benar-benar
 * dilihat dan bukan hanya diasumsikan.
 *
 * Pakai: node scripts/mascot/see.mjs <file.png> [cols] [cropX,cropY,w,h]
 */
import { readFileSync } from "node:fs";
import { decodePng } from "../brand/png.mjs";

const [, , file, colsArg, cropArg] = process.argv;
if (!file) {
  console.error("pemakaian: node scripts/mascot/see.mjs <file.png> [cols] [x,y,w,h]");
  process.exit(1);
}

const cols = Number(colsArg ?? 76);
const { width, height, data } = decodePng(readFileSync(file));

let cx = 0;
let cy = 0;
let cw = width;
let ch = height;
if (cropArg) {
  [cx, cy, cw, ch] = cropArg.split(",").map(Number);
}

const rows = Math.max(1, Math.round((ch / cw) * cols * 0.5));
const px = (x, y) => {
  const sx = cx + Math.min(cw - 1, Math.max(0, Math.round((x / cols) * cw)));
  const sy = cy + Math.min(ch - 1, Math.max(0, Math.round((y / rows) * ch)));
  const i = (sy * width + sx) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/* Peta karakter naik dari gelap ke terang. Lebar terminal ~2x tinggi
   baris, jadi rasio 0.5 di atas sudah membetulkan bentuk. */
const RAMP = " .:-=+*#%@";

const hex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

let out = "";
for (let y = 0; y < rows; y++) {
  let line = "";
  for (let x = 0; x < cols; x++) {
    line += RAMP[Math.min(RAMP.length - 1, Math.round(lum(px(x, y)) * (RAMP.length - 1)))];
  }
  out += `${String(y).padStart(3)}|${line}\n`;
}

/* Peta warna: sampel titik menarik sebagai hex, supaya warna tidak hanya
   "terlihat abu" tapi bisa dibaca. */
const probes = [];
for (const fy of [0.2, 0.35, 0.5, 0.65, 0.8]) {
  for (const fx of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    probes.push(`${hex(px(fx * (cols - 1), fy * (rows - 1)))}`);
  }
}

process.stdout.write(out);
console.log(`\nsrc ${file}  full=${width}x${height}  crop=${cw}x${ch} @(${cx},${cy})  cols=${cols} rows=${rows}`);
console.log("warna (baris = 20/35/50/65/80% tinggi, kolom = 20..80% lebar):");
for (let i = 0; i < probes.length; i += 5) {
  console.log("  " + probes.slice(i, i + 5).join(" "));
}
