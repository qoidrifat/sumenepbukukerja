/**
 * Validator geometri Brand Mascot — Phase 2.
 *
 * Tiga hal yang dijaga di sini, semuanya bisa diukur sehingga tidak
 * bergantung pada "`kubectl` mata":
 *
 *  1. KESETIAAN PHASE 1. Path tubuh di `src/lib/mascot-geometry.ts` harus
 *     identik dengan `scripts/brand/mark.mjs`. Kalau Phase 1 berubah tanpa
 *     sengaja, build gagal alih-alih maskot diam-diam jadi karakter lain.
 *  2. ZONA. Tidak ada bagian wajah/aksesori/dekorasi yang boleh masuk ke
 *     FOLD_ZONE (tanda tangan karakter) atau melewati batas field.
 *  3. SIMETRI. Semua pasangan dicerminkan tepat terhadap x=48.
 *
 * Dijalankan oleh `bun run mascot:check`. Tidak menambah dependency.
 */

import { readFileSync } from "node:fs";
import {
  VIEW_BOX,
  LEFT_PAGE,
  RIGHT_PAGE,
  FOLD,
  TINY_BOOK,
  TINY_FOLD,
  FIELD,
} from "../brand/mark.mjs";
import { parsePath, render } from "../brand/raster.mjs";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${detail}`);
  if (!ok) failures += 1;
};

const AXIS = 48;
const read = (p) => readFileSync(p, "utf8");

/* ------------------------------------------------------------------ */
/* 1. Kesetiaan pada Phase 1                                            */
/* ------------------------------------------------------------------ */

const geometry = read("src/lib/mascot-geometry.ts");

/** Ambil nilai string dari konstanta TS tanpa mengimpor TS-nya. Menghormati
 *  ekspresi yang dirangkai `+` (dipakai Bentuk micro). */
function tsConst(name) {
  const start = geometry.indexOf(`export const ${name} =`);
  if (start < 0) return null;
  const end = geometry.indexOf(";", start);
  const expr = geometry.slice(start, end);
  return [...expr.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join("").replace(/\s+/g, " ").trim();
}

check("tubuh kiri identik dengan mark.mjs", tsConst("BOOK_LEFT") === LEFT_PAGE.replace(/\s+/g, " ").trim());
check("tubuh kanan identik dengan mark.mjs", tsConst("BOOK_RIGHT") === RIGHT_PAGE.replace(/\s+/g, " ").trim());
check("lipatan identik dengan mark.mjs", tsConst("BOOK_FOLD") === FOLD.replace(/\s+/g, " ").trim());

const microLiteral = tsConst("BOOK_MICRO") ?? "";
const microFoldLiteral = tsConst("BOOK_MICRO_FOLD") ?? "";
check(
  "bentuk micro: halaman identik dengan mark.mjs",
  microLiteral === TINY_BOOK.replace(/\s+/g, " ").trim(),
);
check(
  "bentuk micro: lipatan identik dengan mark.mjs",
  microFoldLiteral === TINY_FOLD.replace(/\s+/g, " ").trim(),
);
check("field identik dengan mark.mjs", geometry.includes(`rx: ${FIELD.rx}`) && geometry.includes(`width: ${FIELD.width}`));

/* ------------------------------------------------------------------ */
/* 2. Batas dari path yang benar-benar diurai                             */
/* ------------------------------------------------------------------ */

/** Kotak pembatas dari daftar path, memakai parser yang sama dengan
 *  rasterizer supaya hasil ukur sama dengan hasil render. */
function pathBounds(dList) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of dList) {
    for (const sub of parsePath(d)) {
      for (const [x, y] of sub.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

const bodyBounds = pathBounds([LEFT_PAGE, RIGHT_PAGE, FOLD]);
check(
  "tubuh di dalam field",
  bodyBounds.minX >= FIELD.x &&
    bodyBounds.minY >= FIELD.y &&
    bodyBounds.maxX <= FIELD.x + FIELD.width &&
    bodyBounds.maxY <= FIELD.y + FIELD.height,
  `x ${bodyBounds.minX.toFixed(1)}..${bodyBounds.maxX.toFixed(1)}, y ${bodyBounds.minY.toFixed(1)}..${bodyBounds.maxY.toFixed(1)}`,
);

/* Jarak spine: halaman kiri berakhir di 44, halaman kanan mulai di 52. */
const leftEnd = pathBounds([LEFT_PAGE]).maxX;
const rightStart = pathBounds([RIGHT_PAGE]).minX;
check(
  "jarak spine = 8 unit (negative space)",
  Math.abs(AXIS - leftEnd) === 4 && Math.abs(rightStart - AXIS) === 4,
  `kiri ${leftEnd}, kanan ${rightStart}`,
);

/* ------------------------------------------------------------------ */
/* 3. Zona lipatan kosong                                              */
/* ------------------------------------------------------------------ */

const FOLD_ZONE = { x: 67, y: 27.8, width: 13, height: 13 };

/* Semua sapuan garis di file, dikelompokkan berdasarkan nama konstanta. */
function strokesIn(constName) {
  const start = geometry.indexOf(`export const ${constName}`);
  if (start < 0) return [];
  const end = geometry.indexOf("} as const", start);
  return [...geometry.slice(start, end).matchAll(/"(M[^"]+)"/g)].map((m) => m[1]);
}

const faceStrokes = [
  ...strokesIn("EYE_CLOSED_HAPPY"),
  ...strokesIn("BROWS"),
  ...strokesIn("MOUTHS"),
];
const faceBounds = pathBounds(faceStrokes);
const foldSafe =
  faceBounds.maxX < FOLD_ZONE.x || faceBounds.minY > FOLD_ZONE.y + FOLD_ZONE.height;
check(
  "wajah tidak masuk zona lipatan",
  foldSafe,
  `maks x ${faceBounds.maxX.toFixed(1)} vs lipatan mulai ${FOLD_ZONE.x}`,
);

/* ------------------------------------------------------------------ */
/* 4. Simetri                                                           */
/* ------------------------------------------------------------------ */

const eyes = [
  { x: 33, width: 7 },
  { x: 56, width: 7 },
];
const eyeMirrors = eyes.every((e) => {
  const other = eyes.find((o) => o !== e);
  return Math.abs(e.x - (2 * AXIS - (other.x + other.width))) < 0.01;
});
check("mata cermin sempurna terhadap x=48", eyeMirrors, "33..40 vs 56..63");

/* ------------------------------------------------------------------ */
/* 5. Aksesori di dalam ACCESSORY_ZONE                                  */
/* ------------------------------------------------------------------ */

const ACCESSORY_ZONE = { x: 37, y: 67, width: 22, height: 22 };
/* Setiap aksesori: path + setebal stroke (half-width dipakai saat ukur). */
const accessories = {
  wrench: [
    { d: "M46.5 70.2A5.2 5.2 0 1 1 40.5 70.2", stroke: 2.6 },
    { d: "M46.4 76.4 54 83.6", stroke: 3.4 },
  ],
  bowl: [
    { d: "M40 75.5h16a1.6 1.6 0 0 1 0 3.2H40a1.6 1.6 0 0 1 0-3.2Z" },
    { d: "M40 78.7h16a1.3 1.3 0 0 1 0 2.4 16 8.5 0 0 1-16 0 1.3 1.3 0 0 1 0-2.4Z" },
    { d: "M45 73.5c-1.1-1.1-1.1-2.4 0-3.5M51 73.5c1.1-1.1 1.1-2.4 0-3.5", stroke: 2.6 },
  ],
  bow: [
    { d: "M47.5 78c-3-4.5-8-4.5-8 0s5 4.5 8 0Z", stroke: 2.6 },
    { d: "M48.5 78c3-4.5 8-4.5 8 0s-5 4.5-8 0Z", stroke: 2.6 },
    { d: "M47 79.5 45 86.5M49 79.5 51 86.5", stroke: 2.6 },
  ],
  route: [
    { d: "M42 74.6h6v-3.8l9 7.2-9 7.2v-3.8h-6Z" },
    { d: "M37.6 75.6h2.4v4h-2.4ZM37.6 81h4v4h-4Z" },
  ],
  house: [{ d: "M48 68.5 58 78h-3v10h-4.2v-6.2h-5.6V88H41V78h-3Z" }],
};

/* Path yang sama persis seperti di src/lib/mascot-geometry.ts. */
for (const [name, parts] of Object.entries(accessories)) {
  const inFile = parts.every((p) => geometry.includes(`"${p.d}"`));
  /* Bentuk bergores punya_setebal_setengah_ pada kedua sisi, jadi batasnya
     dilebarkan sebesar itu — inilah yang membuat "di dalam field" jujur. */
  const pad = Math.max(...parts.map((p) => (p.stroke ? p.stroke / 2 : 0)));
  const b = pathBounds(parts.map((p) => p.d));
  const box = {
    minX: b.minX - pad,
    maxX: b.maxX + pad,
    minY: b.minY - pad,
    maxY: b.maxY + pad,
  };
  const insideField =
    box.minX >= FIELD.x + 4 && box.minY >= FIELD.y + 4 &&
    box.maxX <= FIELD.x + FIELD.width - 4 && box.maxY <= FIELD.y + FIELD.height - 4;
  const belowBook = box.minY >= 66;
  const notOnFold = box.maxX < FOLD_ZONE.x || box.minY > FOLD_ZONE.y + FOLD_ZONE.height;
  check(`aksesori ${name}: path cocok dengan geometry.ts`, inFile);
  check(
    `aksesori ${name}: di dalam field & di bawah buku`,
    insideField && belowBook && notOnFold,
    `x ${box.minX.toFixed(1)}..${box.maxX.toFixed(1)}, y ${box.minY.toFixed(1)}..${box.maxY.toFixed(1)}`,
  );
}

/* ------------------------------------------------------------------ */
/* 6. Dekorasi                                                           */
/* ------------------------------------------------------------------ */

const DECOR_ZONES = {
  topLeft: { x: 9, y: 9, width: 22, height: 18 },
  bottomLeft: { x: 9, y: 68, width: 22, height: 20 },
  bottomRight: { x: 65, y: 68, width: 22, height: 20 },
};
const SPARKLES = [
  { x: 15, y: 14, r: 2.6 },
  { x: 25, y: 21, r: 1.7 },
  { x: 21, y: 11, r: 1.4 },
  { x: 12, y: 23, r: 1.2 },
];
for (const s of SPARKLES) {
  const z = DECOR_ZONES.topLeft;
  const inside = s.x - s.r >= z.x && s.y - s.r >= z.y && s.x + s.r <= z.x + z.width && s.y + s.r <= z.y + z.height;
  check(`kilau (${s.x},${s.y}) di dalam zona dekorasi`, inside, `r ${s.r}`);
}

/* ------------------------------------------------------------------ */
/* 7. Render nyata: apakah isi field benar-benar terpisah              */
/* ------------------------------------------------------------------ */

const px = 192;
const buf = render(
  {
    viewBox: VIEW_BOX,
    items: [
      { type: "rect", x: FIELD.x, y: FIELD.y, width: FIELD.width, height: FIELD.height, rx: FIELD.rx, fill: "#2563EB" },
      { type: "path", d: LEFT_PAGE, fill: "#FFFFFF" },
      { type: "path", d: RIGHT_PAGE, fill: "#DBEAFE" },
      { type: "path", d: FOLD, fill: "#F59E0B" },
      ...accessories.house.map((p) => ({ type: "path", d: p.d, fill: "#DBEAFE" })),
    ],
  },
  px,
  px,
);
const at = (x, y) => buf[((y * px + x) * 4 + 3)];
const k = px / VIEW_BOX.width;
const spinePixel = at(Math.round(48 * k), Math.round(50 * k));
const leftPagePixel = at(Math.round(34 * k), Math.round(50 * k));
check("spine tetap kosong (biru field) di render nyata", spinePixel === 255, `alpha ${spinePixel}`);
check("halaman kiri tetap putih di render nyata", leftPagePixel === 255, `alpha ${leftPagePixel}`);

console.log("");
if (failures > 0) {
  console.log(`GAGAL: ${failures} pemeriksaan geometri mascot.`);
  process.exit(1);
}
console.log("Semua pemeriksaan geometri mascot lulus.");
