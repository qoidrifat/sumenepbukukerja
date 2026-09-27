/**
 * Validasi asset brand tanpa dependensi.
 *
 * Semua yang bisa diukur dari file-nya sendiri diukur di sini: keberadaan
 * file, dimensi PNG dari header IHDR, isi direktori .ico, hygiene SVG
 * (viewBox, tanpa bitmap, tanpa base64, tanpa URL eksternal, tanpa sisa
 * ruang kosong berlebih), integritas manifest, dan referensi index.html.
 *
 * Jalankan: node scripts/brand/validate-brand.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { decodePng } from "./png.mjs";
import { MASKABLE, COLORS, MONO_VIEW_BOX, VIEW_BOX } from "./mark.mjs";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${detail}`);
  if (!ok) failures += 1;
};

const read = (path) => readFileSync(path);
const text = (path) => readFileSync(path, "utf8");

/* ------------------------------------------------------------------ */
/* 1. File wajib ada                                                   */
/* ------------------------------------------------------------------ */

const REQUIRED = [
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
  "public/brand/icon-32.svg",
  "public/brand/icon-48.svg",
  "public/brand/icon-180.svg",
  "public/brand/icon-192.svg",
  "public/brand/icon-512.svg",
  "public/brand/icon-maskable-512.svg",
  "public/brand/icon-16.png",
  "public/brand/icon-32.png",
  "public/brand/icon-48.png",
  "public/brand/icon-64.png",
  "public/brand/apple-touch-icon.png",
  "public/brand/icon-192.png",
  "public/brand/icon-512.png",
  "public/brand/icon-maskable-512.png",
];

const missing = REQUIRED.filter((path) => !existsSync(path));
check("semua asset wajib ada", missing.length === 0, missing.length ? missing.join(", ") : `${REQUIRED.length} file`);

/* ------------------------------------------------------------------ */
/* 2. PNG: signature + dimensi dari IHDR                               */
/* ------------------------------------------------------------------ */

const PNG_SIZES = {
  "public/brand/icon-16.png": 16,
  "public/brand/icon-32.png": 32,
  "public/brand/icon-48.png": 48,
  "public/brand/icon-64.png": 64,
  "public/brand/apple-touch-icon.png": 180,
  "public/brand/icon-192.png": 192,
  "public/brand/icon-512.png": 512,
  "public/brand/icon-maskable-512.png": 512,
};

for (const [path, expected] of Object.entries(PNG_SIZES)) {
  if (!existsSync(path)) {
    check(`png ${path}`, false, "file hilang");
    continue;
  }
  const buffer = read(path);
  const signature = [...buffer.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const depth = buffer[24];
  const colour = buffer[25];
  const ok =
    signature === "89 50 4e 47 0d 0a 1a 0a" && width === expected && height === expected && depth === 8 && colour === 6;
  check(`png ${path.split("/").pop()}`, ok, `${width}x${height} depth${depth} type${colour}`);
}

/* ------------------------------------------------------------------ */
/* 3. ICO: signature + isi direktori                                   */
/* ------------------------------------------------------------------ */

{
  const buffer = read("public/favicon.ico");
  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);
  const sizes = [];
  let valid = reserved === 0 && type === 1;
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const w = buffer[at] === 0 ? 256 : buffer[at];
    const h = buffer[at + 1] === 0 ? 256 : buffer[at + 1];
    const bytes = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    sizes.push(`${w}x${h}`);
    if (offset + bytes > buffer.length) valid = false;
  }
  check("ico: signature + isi", valid && count >= 3, `${count} entri: ${sizes.join(", ")}`);
}

/* ------------------------------------------------------------------ */
/* 4. Hygiene SVG                                                      */
/* ------------------------------------------------------------------ */

const SVG_FILES = REQUIRED.filter((path) => path.endsWith(".svg"));

for (const path of SVG_FILES) {
  const source = text(path);
  const hasViewBox = /viewBox="[-\d. ]+"/.test(source);
  const noBitmap = !source.includes("<image") && !source.includes("data:image") && !source.includes("base64");
  const noExternal = !/https?:\/\/(?!www\.w3\.org)/.test(source);
  const noUse = !source.includes("<use");
  const noScript = !source.includes("<script") && !source.includes("onload");
  const noEditorMeta = !source.includes("<metadata") && !source.includes("inkscape:") && !source.includes("sodipodi:");
  const clean = hasViewBox && noBitmap && noExternal && noUse && noScript && noEditorMeta;
  const why = [
    hasViewBox ? "" : "no-viewBox",
    noBitmap ? "" : "bitmap",
    noExternal ? "" : "external-url",
    noUse ? "" : "use",
    noScript ? "" : "script",
    noEditorMeta ? "" : "editor-meta",
  ].filter(Boolean);
  check(`svg ${path.split("/").pop()}`, clean, clean ? `${source.length}B` : why.join("+"));
}

/* Varian mono tidak boleh punya ruang kosong berlebih. */
for (const name of ["logo-mono-black", "logo-mono-white", "logo-mono-navy"]) {
  const source = text(`public/brand/${name}.svg`);
  const match = /viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)"/.exec(source);
  const tight = match && Math.abs(Number(match[3]) - MONO_VIEW_BOX.width) < 0.01;
  check(`mono viewBox padat (${name})`, Boolean(tight), match ? `${match[3]}x${match[4]}` : "tidak ada viewBox");
}

/* ------------------------------------------------------------------ */
/* 5. Maskable: background opaque + safe zone dari piksel nyata        */
/* ------------------------------------------------------------------ */

{
  const { width: size, data } = decodePng(read("public/brand/icon-maskable-512.png"));
  const pixel = (x, y) => {
    const i = (y * size + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const field = [0x25, 0x63, 0xeb];
  const nearField = ([r, g, b, a]) =>
    a > 200 && Math.abs(r - field[0]) < 12 && Math.abs(g - field[1]) < 12 && Math.abs(b - field[2]) < 12;

  const corners = [pixel(1, 1), pixel(size - 2, 1), pixel(1, size - 2), pixel(size - 2, size - 2)];
  check("maskable: background full-bleed", corners.every(nearField), `4 sudut = #2563EB`);

  /* Cari bounding box piksel yang BUKAN warna field. Karena warna field mark
     sama dengan background maskable, yang dideteksi justru buku putih dan
     lipatan amber - persis artwork yang harus berada di dalam safe zone. */
  let minX = size;
  let maxX = -1;
  let minY = size;
  let maxY = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (nearField(pixel(x, y))) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const artW = maxX - minX + 1;
  const artH = maxY - minY + 1;
  check("maskable: artwork terukur dari piksel", artW > 60, `artwork ${artW}x${artH} di (${minX},${minY})`);

  const insetPct = (Math.min(minX, minY) / size) * 100;
  check("maskable: inset >= 20%", insetPct >= 20, `${insetPct.toFixed(1)}% per sisi`);

  const halfDiagonal = (Math.hypot(artW, artH) / 2) | 0;
  const safeRadius = size * 0.4;
  check("maskable: sudut dalam safe circle", halfDiagonal <= safeRadius, `setengah diagonal ${halfDiagonal} <= ${safeRadius}`);

  /* Yang terdeteksi adalah buku, bukan field: field berwarna sama dengan
     background maskable jadi tidak terlihat. Buku memang duduk sedikit
     di bawah tengah secara sadar, jadi toleransinya 8px (1.6% kanvas). */
  const centred = Math.abs((minX + maxX) / 2 - size / 2) <= 8 && Math.abs((minY + maxY) / 2 - size / 2) <= 8;
  check("maskable: artwork dipusatkan", centred, `pusat (${((minX + maxX) / 2).toFixed(0)}, ${((minY + maxY) / 2).toFixed(0)}) dari 256`);

  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparent += 1;
  check("maskable: tidak ada piksel transparan", transparent === 0, `${transparent} piksel alpha < 250`);
}

/* Ikon "any" memakai rounded square dengan margin 4 unit pada viewBox 96,
   jadi tepi kanvas memang transparan - itu bentuk yang benar untuk
   Android/iOS, bukan bug. Yang dicek siluetnya: sudut jauh kosong, tapi
   sisi field di tengah tiap sisi kanvas terisi. */
{
  const { width: size, data } = decodePng(read("public/brand/icon-192.png"));
  const alphaAt = (x, y) => data[(y * size + x) * 4 + 3];
  const margin = Math.round((4 / VIEW_BOX.width) * size);
  const mid = Math.floor(size / 2);
  const cornersClear = [alphaAt(0, 0), alphaAt(size - 1, 0), alphaAt(0, size - 1), alphaAt(size - 1, size - 1)]
    .every((a) => a < 40);
  const edgesFilled = [
    alphaAt(mid, margin),
    alphaAt(mid, size - 1 - margin),
    alphaAt(margin, mid),
    alphaAt(size - 1 - margin, mid),
  ].every((a) => a > 200);
  check("icon-192: siluet rounded square", cornersClear && edgesFilled, `margin ${margin}px: sudut kosong, sisi field opaque`);
}

/* ------------------------------------------------------------------ */
/* 6. Manifest: icon yang dirujuk harus benar-benar ada                 */
/* ------------------------------------------------------------------ */

{
  const manifest = JSON.parse(text("public/manifest.webmanifest"));
  const bad = manifest.icons.filter((icon) => !existsSync(`public${icon.src}`));
  check("manifest: semua icon ada", bad.length === 0, bad.length ? bad.map((i) => i.src).join(",") : `${manifest.icons.length} icon`);

  const has192 = manifest.icons.some((i) => i.sizes === "192x192" && i.type === "image/png");
  const has512 = manifest.icons.some((i) => i.sizes === "512x512" && i.type === "image/png");
  const hasMaskable = manifest.icons.some((i) => i.purpose === "maskable" && i.type === "image/png");
  check("manifest: 192 png ada", has192);
  check("manifest: 512 png ada", has512);
  check("manifest: maskable png ada", hasMaskable);
  check("manifest: metadata tidak berubah", manifest.name === "Sumenep Buku Kerja" && manifest.theme_color === "#2563EB", `name=${manifest.name} theme=${manifest.theme_color}`);
}

/* ------------------------------------------------------------------ */
/* 7. index.html: referensi tidak boleh menggantung                    */
/* ------------------------------------------------------------------ */

{
  const html = text("index.html");
  const refs = [...html.matchAll(/(?:href|src)="\/([^"]+)"/g)].map((m) => m[1]);
  const dangling = refs.filter((ref) => !existsSync(`public/${ref}`) && !ref.startsWith("src/"));
  check("index.html: referensi ada", dangling.length === 0, dangling.length ? dangling.join(",") : `${refs.length} referensi`);

  const applePng = /rel="apple-touch-icon"[^>]*href="\/brand\/apple-touch-icon\.png"/.test(html);
  check("index.html: apple-touch-icon = PNG", applePng, "iOS mengabaikan SVG");
  check("index.html: ada favicon.ico", html.includes("/favicon.ico"));
}

/* ------------------------------------------------------------------ */
/* 8. Warna: hanya token brand yang boleh dipakai di mark              */
/* ------------------------------------------------------------------ */

{
  const allowed = new Set(
    Object.values(COLORS).map((c) => c.toUpperCase()),
  );
  const used = new Set();
  for (const path of SVG_FILES) {
    for (const m of text(path).matchAll(/#[0-9A-Fa-f]{6}/g)) used.add(m[0].toUpperCase());
  }
  const offPalette = [...used].filter((c) => !allowed.has(c));
  check("warna: hanya token brand", offPalette.length === 0, offPalette.length ? offPalette.join(",") : `${used.size} warna: ${[...used].join(" ")}`);
}

/* ------------------------------------------------------------------ */
/* 9. Tidak ada logo duplikat                                          */
/* ------------------------------------------------------------------ */

{
  const mark = text("public/brand/logo-mark.svg");
  const alias = text("public/logo.svg");
  const favicon = text("public/favicon.svg");
  check("logo.svg = logo-mark.svg (alias sengaja)", mark === alias);
  check("favicon.svg = logo-mark.svg", mark === favicon);
  check("tidak ada src/assets/logo.svg", !existsSync("src/assets/logo.svg"), "satu sumber logo");
}

console.log("");
console.log(
  failures === 0
    ? "BRAND OK - semua asset ada, valid, dan konsisten"
    : `${failures} MASALAH`,
);
process.exit(failures === 0 ? 0 : 1);
