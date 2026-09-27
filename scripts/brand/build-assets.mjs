/**
 * Build seluruh asset brand: SVG lockup + favicon + ikon PWA (PNG).
 *
 * Semua geometry berasal dari scripts/brand/mark.mjs, semua pixel PNG berasal
 * dari rasterizer lokal, jadi:
 *  - tidak ada geometry yang bisa berbeda antar file,
 *  - tidak ada dependensi baru (tidak ada ImageMagick / sharp / resvg),
 *  - output deterministik: build dua kali menghasilkan file yang sama.
 *
 * Jalankan: node scripts/brand/build-assets.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { encodePng, encodeIco } from "./png.mjs";
import { render } from "./raster.mjs";
import {
  COLORS,
  FIELD,
  LEFT_PAGE,
  RIGHT_PAGE,
  FOLD,
  MASKABLE,
  MONO_VIEW_BOX,
  TONE_COLOUR,
  VIEW_BOX,
  WORDMARK_FONT,
  markShapes,
  maskableTransform,
  tinyMarkShapes,
} from "./mark.mjs";

const BRAND_DIR = "public/brand";
mkdirSync(BRAND_DIR, { recursive: true });

const written = [];
const write = (path, contents) => {
  writeFileSync(path, contents);
  written.push(path);
};

/* ------------------------------------------------------------------ */
/* SVG helpers                                                         */
/* ------------------------------------------------------------------ */

const esc = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const pathEl = (d, fill, extra = "") =>
  fill === "none" ? `<path d="${d}" fill="none"${extra}/>` : `<path d="${d}" fill="${fill}"${extra}/>`;

const rectEl = (r, fill) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}" fill="${fill}"/>`;

/**
 * Hanya title/desc yang boleh memakai role=img. Lockup yang dipakai sebagai
 * <img> dekoratif di dalam aplikasi tidak boleh punya accessible name
 * ganda, jadi file yang di-inline sebagai dekoratif tidak diberi role.
 */
const svgDoc = ({ width, height, viewBox, title, desc, body, labelled = true }) => {
  const attrs = labelled
    ? ` role="img" aria-labelledby="brand-title brand-desc"`
    : ` aria-hidden="true" focusable="false"`;
  const a11y = labelled
    ? `<title id="brand-title">${esc(title)}</title><desc id="brand-desc">${esc(desc)}</desc>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}"${attrs}>${a11y}${body}</svg>\n`;
};

const markBody = (tone) =>
  rectEl(FIELD, tone.blue) + pathEl(LEFT_PAGE, tone.left) + pathEl(RIGHT_PAGE, tone.right) + pathEl(FOLD, tone.accent);

const monoBody = (colour) => pathEl(LEFT_PAGE, colour) + pathEl(RIGHT_PAGE, colour);

/* Wordmark memakai <text> dengan font stack yang PERSIS sama dengan Tailwind
   default di project ini. index.html tidak memuat font eksternal, jadi
   lockup lama yang menaruh "Inter" di depan selalu jatuh ke system-ui -
   hasilnya wordmark yang tidak pernah sama dengan situs. */
const wordmark = ({ x, y, size, base, accent, anchor = "start" }) =>
  `<text x="${x}" y="${y}" fill="${base}" font-family="${esc(WORDMARK_FONT)}" font-size="${size}" font-weight="800" letter-spacing="-1.1" text-anchor="${anchor}">Sumenep <tspan fill="${accent}">Buku</tspan> Kerja</text>`;

/* ------------------------------------------------------------------ */
/* 1. Lockup                                                           */
/* ------------------------------------------------------------------ */

const CLEAR_SPACE = 12;

write(
  "public/favicon.svg",
  svgDoc({
    width: 96,
    height: 96,
    viewBox: "0 0 96 96",
    title: "Sumenep Buku Kerja",
    desc: "Buku terbuka dengan satu sudut halaman terlipat.",
    body: markBody(TONE_COLOUR),
  }),
);

// Alias yang dipakai service worker dan fallback <img> di halaman lama.
write("public/logo.svg", svgDoc({
  width: 96,
  height: 96,
  viewBox: "0 0 96 96",
  title: "Sumenep Buku Kerja",
  desc: "Buku terbuka dengan satu sudut halaman terlipat.",
  body: markBody(TONE_COLOUR),
}));

write(`${BRAND_DIR}/logo-mark.svg`, svgDoc({
  width: 96,
  height: 96,
  viewBox: "0 0 96 96",
  title: "Sumenep Buku Kerja",
  desc: "Buku terbuka dengan satu sudut halaman terlipat.",
  body: markBody(TONE_COLOUR),
}));

write(`${BRAND_DIR}/logo-primary.svg`, svgDoc({
  width: 600,
  height: 120,
  viewBox: `0 0 600 120`,
  title: "Sumenep Buku Kerja",
  desc: "Simbol buku terbuka dengan wordmark Sumenep Buku Kerja.",
  body:
    markBody(TONE_COLOUR) +
    wordmark({ x: 96 + CLEAR_SPACE + 8, y: 72, size: 34, base: COLORS.ink, accent: COLORS.blue }),
}));

write(`${BRAND_DIR}/logo-primary-dark.svg`, svgDoc({
  width: 600,
  height: 120,
  viewBox: "0 0 600 120",
  title: "Sumenep Buku Kerja",
  desc: "Simbol buku terbuka dengan wordmark Sumenep Buku Kerja, untuk background gelap.",
  body:
    markBody(TONE_COLOUR) +
    wordmark({ x: 96 + CLEAR_SPACE + 8, y: 72, size: 34, base: COLORS.white, accent: COLORS.blueLight }),
}));

write(`${BRAND_DIR}/logo-stacked.svg`, svgDoc({
  width: 300,
  height: 232,
  viewBox: "0 0 300 232",
  title: "Sumenep Buku Kerja",
  desc: "Simbol buku terbuka dengan wordmark Sumenep Buku Kerja di bawahnya.",
  body:
    `<g transform="translate(102 0)">${markBody(TONE_COLOUR)}</g>` +
    wordmark({ x: 150, y: 150, size: 32, base: COLORS.ink, accent: COLORS.blue, anchor: "middle" }) +
    `<text x="150" y="192" fill="${COLORS.blue}" font-family="${esc(WORDMARK_FONT)}" font-size="19" font-weight="700" letter-spacing="-0.3" text-anchor="middle">Jasa dekat, tanpa ribet.</text>`,
}));

write(`${BRAND_DIR}/logo-wordmark.svg`, svgDoc({
  width: 420,
  height: 72,
  viewBox: "0 0 420 72",
  title: "Sumenep Buku Kerja",
  desc: "Wordmark Sumenep Buku Kerja.",
  body: wordmark({ x: 0, y: 50, size: 34, base: COLORS.ink, accent: COLORS.blue }),
}));

/* Monokrom: viewBox dipadatkan ke batas buku supaya tidak ada ruang kosong
   yang terbuang (lihat BOOK_BOUNDS di mark.mjs). */
const monoWidth = MONO_VIEW_BOX.width;
const monoHeight = MONO_VIEW_BOX.height;
const monoDoc = (colour, name, purpose) =>
  svgDoc({
    width: monoWidth,
    height: monoHeight,
    viewBox: `${MONO_VIEW_BOX.x} ${MONO_VIEW_BOX.y} ${monoWidth} ${monoHeight}`,
    title: `Sumenep Buku Kerja symbol - ${name}`,
    desc: `Buku terbuka satu warna untuk ${purpose}.`,
    body: monoBody(colour),
  });

write(`${BRAND_DIR}/logo-mono-black.svg`, monoDoc(COLORS.charcoal, "hitam", "background terang"));
write(`${BRAND_DIR}/logo-mono-white.svg`, monoDoc(COLORS.white, "putih", "background gelap"));
write(`${BRAND_DIR}/logo-mono-navy.svg`, monoDoc(COLORS.blueDark, "navy", "satu warna brand"));

/* ------------------------------------------------------------------ */
/* 2. Ikon SVG                                                         */
/* ------------------------------------------------------------------ */

for (const size of [16, 32, 48, 64, 180, 192, 512]) {
  const shapes = size <= 16 ? tinyMarkShapes(TONE_COLOUR) : markShapes("colour", TONE_COLOUR);
  const body = shapes
    .map((shape) => (shape.type === "rect" ? rectEl(shape, shape.fill) : pathEl(shape.d, shape.fill)))
    .join("");
  write(`${BRAND_DIR}/icon-${size}.svg`, svgDoc({
    width: size,
    height: size,
    viewBox: "0 0 96 96",
    title: "Sumenep Buku Kerja",
    desc: "Ikon aplikasi.",
    body,
  }));
}

write(`${BRAND_DIR}/icon-maskable-512.svg`, svgDoc({
  width: MASKABLE.canvas,
  height: MASKABLE.canvas,
  viewBox: "0 0 512 512",
  title: "Sumenep Buku Kerja maskable app icon",
  desc: "Ikon aplikasi dengan safe zone Android.",
  body: `<rect width="512" height="512" fill="${MASKABLE.background}"/><g transform="${maskableTransform()}">${markBody(TONE_COLOUR)}</g>`,
}));

/* ------------------------------------------------------------------ */
/* 3. Ikon PNG                                                         */
/* ------------------------------------------------------------------ */

const png = (size, items, viewBox = VIEW_BOX) =>
  encodePng({ width: size, height: size, data: render({ viewBox, items }, size, size) });

/* Maskable: background full-bleed, artwork 284px dipusatkan.
   Penskalaan lewat viewBox, bukan regex pada string path - regex itu rusak
   begitu ada koordinat negatif atau nilai seperti "16 34.8V61.5". */
const maskableViewBox = (() => {
  const unit = VIEW_BOX.width / MASKABLE.markSize;
  const pad = MASKABLE.inset * unit;
  return {
    x: -pad,
    y: -pad,
    width: MASKABLE.canvas * unit,
    height: MASKABLE.canvas * unit,
  };
})();

const maskableRender = {
  viewBox: maskableViewBox,
  background: MASKABLE.background,
  items: markShapes("colour", TONE_COLOUR),
};

for (const size of [16, 32, 48, 64, 192, 512]) {
  const shapes = size <= 16 ? tinyMarkShapes(TONE_COLOUR) : markShapes("colour", TONE_COLOUR);
  write(`${BRAND_DIR}/icon-${size}.png`, png(size, shapes));
}

// apple-touch-icon wajib PNG: iOS mengabaikan SVG untuk ikon ini.
write(`${BRAND_DIR}/apple-touch-icon.png`, png(180, markShapes("colour", TONE_COLOUR)));

write(`${BRAND_DIR}/icon-maskable-512.png`, encodePng({
  width: MASKABLE.canvas,
  height: MASKABLE.canvas,
  data: render(maskableRender, MASKABLE.canvas, MASKABLE.canvas),
}));

// .ico berisi 16/32/48 dalam satu file supaya browser lama tetap punya favicon.
const icoSizes = [16, 32, 48];
write("public/favicon.ico", encodeIco(icoSizes.map((size) => ({
  size,
  buffer: png(size, size <= 16 ? tinyMarkShapes(TONE_COLOUR) : markShapes("colour", TONE_COLOUR)),
}))));

console.log(`${written.length} file ditulis:`);
for (const path of written) console.log("  " + path);
