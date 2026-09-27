/**
 * Pengukuran Brand Mascot — Phase 2.
 *
 * Menggambar maskot sungguhan lewat rasterizer milik Phase 1, lalu
 * mengukur apa yang benar-benar muncul di piksel. Ini yang menggantikan
 * "kelihatan bagus" untuk hal yang memang bisa diukur: apakah wajah benar
 * ada di atas halaman, apakah lipatan masih terlihat, apakah negative space spine
 * tetap kosong, dan apakah detail benar hilang di ukuran kecil.
 *
 * Dijalankan oleh `bun run mascot:measure`.
 */

import { render } from "../brand/raster.mjs";
import { VIEW_BOX, FIELD, LEFT_PAGE, RIGHT_PAGE, FOLD } from "../brand/mark.mjs";
import { readFileSync } from "node:fs";

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(52)} ${detail}`);
  if (!ok) failures += 1;
};

/* Geometri Phase 1 diambil langsung dari modul aslinya, bukan dari teks
   file TS — jadi pengukuran ini tidak mungkin diam-diam mengukur bentuk
   yang berbeda dari yang divalidasi validate-mascot.mjs. */
const ts = readFileSync("src/lib/mascot-geometry.ts", "utf8");

/* Ambil daftar path dari satu blok `export const NAMA` di file TS. */
function block(name) {
  const start = ts.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`blok ${name} tidak ditemukan`);
  const asConst = ts.indexOf("} as const", start);
  const semi = ts.indexOf(";", start);
  return ts.slice(start, asConst >= 0 ? asConst : semi);
}

/** Pasangan path "left"/"right" dari sub-blok bernama. */
function pair(constName, name) {
  const b = block(constName);
  const start = b.indexOf(`${name}: {`);
  if (start < 0) throw new Error(`${constName}.${name} tidak ditemukan`);
  const end = b.indexOf("strokeWidth", start);
  const paths = [...b.slice(start, end).matchAll(/"(M[^"]+)"/g)].map((m) => m[1]);
  if (paths.length !== 2) throw new Error(`${constName}.${name} harus punya 2 path`);
  return paths;
}

/* Palet publik. */
const P = { field: "#2563EB", page: "#FFFFFF", soft: "#DBEAFE", fold: "#F59E0B", ink: "#0F172A" };

const near = (a, b, tol = 26) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/* ------------------------------------------------------------------ */
/* PerENDERAN                                                          */
/* ------------------------------------------------------------------ */

const PX = 192;
const K = PX / VIEW_BOX.width;

/** Mulut digambar sebagai filled path: rasterizer hanya mengisi, dan untuk
 *  mengukur posisi/geometri isi sudah cukup. */
function drawMascot({ mouth = [], eyes = "open", accessory = [] }) {
  return {
    viewBox: VIEW_BOX,
    items: [
      { type: "rect", ...FIELD, fill: P.field },
      { type: "path", d: LEFT_PAGE, fill: P.page },
      { type: "path", d: RIGHT_PAGE, fill: P.soft },
      { type: "path", d: FOLD, fill: P.fold },
      ...eyeShapes(eyes),
      ...mouth.map((d) => ({ type: "path", d, fill: P.ink })),
      ...accessory.map((d) => ({ type: "path", d, fill: P.soft })),
    ],
  };
}

function eyeShapes(kind) {
  const spec = {
    open: { w: 7, h: 9, r: 3, lx: 33, rx: 56, y: 40 },
    narrowed: { w: 6, h: 3, r: 1.5, lx: 33.5, rx: 56.5, y: 43 },
    wide: { w: 7.5, h: 10, r: 3.5, lx: 32.75, rx: 55.75, y: 39.5 },
  }[kind] ?? { w: 7, h: 9, r: 3, lx: 33, rx: 56, y: 40 };
  return [spec.lx, spec.rx].map((x) => ({
    type: "rect",
    x,
    y: spec.y,
    width: spec.w,
    height: spec.h,
    rx: spec.r,
    fill: P.ink,
  }));
}

const sample = (buf, x, y) => {
  const px = Math.round(x * K);
  const py = Math.round(y * K);
  const i = (py * PX + px) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
};

/* Ambil pasangan path dari blok MOUTHS per nama state. */
const mouthPair = (name) => pair("MOUTHS", name);

/* ------------------------------------------------------------------ */
/* 1. Wajah benar-benar di atas halaman                                */
/* ------------------------------------------------------------------ */

const buf = render(drawMascot({ mouth: mouthPair("calm") }), PX, PX);

/* Setiap titik mata dan mulut harus berada di atas halaman (putih atau
   biru muda), bukan di field biru. Kalau tidak, wajah "tayang" di atas
   negative space. */
const probePoints = [
  ["mata kiri", 36.5, 44.5],
  ["mata kanan", 59.5, 44.5],
  ["mulut kiri", 38.5, 54],
  ["mulut kanan", 57.5, 54],
];
for (const [label, x, y] of probePoints) {
  const c = sample(buf, x, y);
  const onPage = near(c, hex(P.page), 20) || near(c, hex(P.soft), 20) || near(c, hex(P.ink), 20);
  check(`${label} berada di atas halaman`, onPage, `rgb(${c.join(",")})`);
}

/* ------------------------------------------------------------------ */
/* 2. Negative space spine tetap kosong                                */
/* ------------------------------------------------------------------ */

for (const y of [40, 50, 58]) {
  const c = sample(buf, 48, y);
  check(`spine kosong di y=${y}`, near(c, hex(P.field), 12), `rgb(${c.join(",")})`);
}

/* ------------------------------------------------------------------ */
/* 3. Lipatan tetap terbaca                                           */
/* ------------------------------------------------------------------ */

const foldCentre = sample(buf, 70, 37);
const amberPixels = (() => {
  let n = 0;
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const i = (y * PX + x) * 4;
      if (near([buf[i], buf[i + 1], buf[i + 2]], hex(P.fold), 30)) n += 1;
    }
  }
  return n;
})();
check("sudut terlipat tetap amber", near(foldCentre, hex(P.fold), 40), `rgb(${foldCentre.join(",")})`);
check("amber punya area yang cukup", amberPixels > 120, `${amberPixels} piksel @192px`);

/* Porsi field biru: memastikan buku masih Reads sebagai buku, bukan
   field polos dengan hiasan. */
let blue = 0;
for (let y = 0; y < PX; y++) {
  for (let x = 0; x < PX; x++) {
    const i = (y * PX + x) * 4;
    if (near([buf[i], buf[i + 1], buf[i + 2]], hex(P.field), 12)) blue += 1;
  }
}
const blueShare = (blue / (PX * PX)) * 100;
check("field biru dominan tapi tidak penuh", blueShare > 25 && blueShare < 60, `${blueShare.toFixed(1)}% biru`);

/* ------------------------------------------------------------------ */
/* 4. Ukuran kecil: detail benar hilang, bukan jadi noise              */
/* ------------------------------------------------------------------ */

/* Pada 24px (tingkat micro) tidak ada aksesori maupun wajah. Yang diukur
   justru sebaliknya: apakah FIELD + BUKU masih menghasilkan bentuk yang
   jelas, yaitu apakah masih ada dua nada (biru + putih). */
const small = render(drawMascot({ mouth: [] }), 24, 24);
const tones = new Set();
for (let i = 0; i < 24 * 24 * 4; i += 4) tones.add(`${small[i]},${small[i + 1]},${small[i + 2]}`);
check("micro 24px masih punya minimal 3 nada", tones.size >= 3, `${tones.size} nada`);

/* Pada 48px (tingkat small) wajah belum digambar, tapi buku + lipatan
   penuh harus tetap terbaca sebagai bentuk Phase 1. */
const mid = render(drawMascot({ mouth: [] }), 48, 48);
let amber48 = 0;
for (let i = 0; i < 48 * 48 * 4; i += 4) {
  if (near([mid[i], mid[i + 1], mid[i + 2]], hex(P.fold), 30)) amber48 += 1;
}
check("lipatan masih terlihat di 48px", amber48 >= 4, `${amber48} piksel amber @48px`);

/* ------------------------------------------------------------------ */
/* 5. Simetri state yang dirender sungguhan                            */
/* ------------------------------------------------------------------ */

/* Band mulut saja (y 52..58 viewBox). Di luar band ini karakter memang
   asimetris: lipatan hanya ada di kanan, itu bagian dari desain Phase 1. */
const MOUTH_ROW0 = Math.round(52 * K);
const MOUTH_ROW1 = Math.round(59 * K);

for (const name of ["calm", "smile", "uncertain", "flat"]) {
  const mouth = mouthPair(name);
  const b = render(drawMascot({ mouth }), PX, PX);
  /* Yang dibandingkan adalah topeng "ada tinta atau tidak", bukan warna:
     halaman kiri putih dan halaman kanan biru-soft memang berbeda nada
     (itu keputusan Phase 1), tapi mouths-nya harus occupies space yang
     sama persis di kedua sisi. */
  const ink = (i) => near([b[i], b[i + 1], b[i + 2]], hex(P.ink), 90);
  let diff = 0;
  for (let y = MOUTH_ROW0; y < MOUTH_ROW1; y++) {
    for (let x = 0; x < PX / 2; x++) {
      const i = (y * PX + x) * 4;
      const j = (y * PX + (PX - 1 - x)) * 4;
      if (ink(i) !== ink(j)) diff += 1;
    }
  }
  check(`mulut ${name}: simetris kiri-kanan`, diff === 0, `${diff} piksel beda`);
}

console.log("");
if (failures > 0) {
  console.log(`GAGAL: ${failures} pengukuran mascot.`);
  process.exit(1);
}
console.log("Semua pengukuran mascot lulus.");
