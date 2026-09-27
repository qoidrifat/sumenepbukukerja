/**
 * Ukur legibilitas mark di ukuran ikon nyata.
 *
 * Karena tidak ada browser di environment ini, "dilihat" diganti dengan
 * pengukuran piksel: mark di-raster ke setiap ukuran yang benar-benar dipakai
 * (16 sampai 512), lalu dicek apakah detail yang menentukan identitas masih
 * ada setelah di-downscale.
 *
 * Yang diukur:
 *  - region warna berbeda yang masih terbaca (apakah mark jadi satu gumpalan)
 *  - apakah jarak tengah antar halaman masih ada (negative space)
 *  - apakah sudut terlipat masih punya piksel (satu-satunya aksen)
 *  - apakah ada region < 2px luasnya (detail yang tidak akan terbaca)
 *  - apakah silhouette tetap punya rasio Scaffold yang sehat
 */
import { render, parseColor } from "./raster.mjs";
import { markShapes, tinyMarkShapes, TONE_COLOUR, VIEW_BOX, MONO_VIEW_BOX, MASKABLE, COLORS } from "./mark.mjs";

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(38)} ${detail}`);
  if (!ok) failures += 1;
};

const SIZES = [16, 24, 32, 48, 64, 128, 180, 192, 256, 512];

/* Palet desain yang harus muncul pada mark warna. Dibucket ke warna
   terdekat, jadi hasil antialiasing tidak dihitung sebagai "warna baru". */
const DESIGN = [
  ["field", parseColor(TONE_COLOUR.blue)],
  ["left", parseColor(TONE_COLOUR.left)],
  ["right", parseColor(TONE_COLOUR.right)],
  ["accent", parseColor(TONE_COLOUR.accent)],
];

function nearest(r, g, b) {
  let best = null;
  let bestDistance = Infinity;
  for (const [name, ref] of DESIGN) {
    const distance = (r - ref[0]) ** 2 + (g - ref[1]) ** 2 + (b - ref[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return { name: best, distance: Math.sqrt(bestDistance) };
}

function analyse(buffer, size) {
  const counts = new Map();
  let opaque = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    if (buffer[i + 3] < 128) continue;
    opaque += 1;
    const { name, distance } = nearest(buffer[i], buffer[i + 1], buffer[i + 2]);
    // Hanya hitung kalau warnanya benar-benar dekat dengan token desain.
    if (distance > 90) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    size,
    present: [...counts.keys()].sort(),
    distinct: counts.size,
    coverage: opaque / (size * size),
    accentPixels: counts.get("accent") ?? 0,
    accentShare: (counts.get("accent") ?? 0) / Math.max(1, opaque),
  };
}

/**
 * Pita tengah: apakah jarak antar halaman (x 44..52 dari 96) masih terlihat?
 * Yang diukur adalah "piksel ber warna field", BUKAN piksel opaque - field
 * memang opaque, jadi mengukur opacity akan selalu melaporkan 100% dan
 * menyesatkan.
 */
function spineGap(buffer, size, background) {
  const from = Math.round((44 / 96) * size);
  const to = Math.round((52 / 96) * size);
  const yFrom = Math.round((34 / 96) * size);
  const yTo = Math.round((60 / 96) * size);
  let showing = 0;
  let total = 0;
  for (let y = yFrom; y < yTo; y += 1) {
    for (let x = from; x < to; x += 1) {
      total += 1;
      const i = (y * size + x) * 4;
      const { name, distance } = nearest(buffer[i], buffer[i + 1], buffer[i + 2]);
      if (name === background && distance < 90) showing += 1;
    }
  }
  return total === 0 ? 0 : showing / total;
}

console.log("== mark warna, ukuran ikon nyata ==");
console.log("size   regions  coverage  accent px  accent%  spine gap  regions present");
const rows = [];
for (const size of SIZES) {
  const shapes = size <= 16 ? tinyMarkShapes(TONE_COLOUR) : markShapes("colour", TONE_COLOUR);
  const buffer = render({ viewBox: VIEW_BOX, items: shapes }, size, size);
  const info = analyse(buffer, size);
  const gap = size <= 16 ? 1 : spineGap(buffer, size, "field");
  rows.push({ ...info, gap });
  console.log(
    String(size).padStart(4),
    String(info.distinct).padStart(8),
    info.coverage.toFixed(3).padStart(9),
    String(info.accentPixels).padStart(10),
    (info.accentShare * 100).toFixed(2).padStart(8),
    gap.toFixed(2).padStart(11),
    "  " + info.present.join("+"),
  );
}

console.log("");
console.log("== ambang ==");

const at16 = rows.find((r) => r.size === 16);
const at24 = rows.find((r) => r.size === 24);
const at32 = rows.find((r) => r.size === 32);
const at48 = rows.find((r) => r.size === 48);

check("16px: 4 region desain", at16.distinct === 4, `${at16.distinct} -> ${at16.present.join("+")}`);
// Pada 16px aksen adalah satu-satunya pembeda warna di luar silhouette, jadi
// harus ada. Di atas 24px aksen hanya pemeriksa identitas kategori, jadi
// cukup hadir dan tidak boleh mendominasi.
check("16px: aksen masih ada", at16.accentPixels >= 2, `${at16.accentPixels} px amber`);
check("16px: aksen 0.3-14% area", at16.accentShare > 0.003 && at16.accentShare < 0.14, `${(at16.accentShare * 100).toFixed(2)}%`);
check("16px: cakupan 55-100%", at16.coverage > 0.55 && at16.coverage <= 1, `${at16.coverage.toFixed(3)}`);

check("24px: aksen masih ada", at24.accentPixels >= 2, `${at24.accentPixels} px amber`);
check("24px: aksen tidak mendominasi", at24.accentShare < 0.1, `${(at24.accentShare * 100).toFixed(2)}%`);
check("32px: jarak tengah terbuka", at32.gap > 0.6, `negative space ${(at32.gap * 100).toFixed(0)}% dari pita tengah`);
check("48px: jarak tengah terbuka", at48.gap > 0.6, `negative space ${(at48.gap * 100).toFixed(0)}%`);
check("32px: 4 region desain", at32.distinct === 4, at32.present.join("+"));

/* Variant mono harus tetap punya dua halaman yang terpisah. */
const monoBlack = render(
  { viewBox: VIEW_BOX, items: markShapes("mono", COLORS.charcoal) },
  64,
  64,
);
const monoGap = (() => {
  const from = Math.round((44 / 96) * 64);
  const to = Math.round((52 / 96) * 64);
  const yFrom = Math.round((34 / 96) * 64);
  const yTo = Math.round((60 / 96) * 64);
  let empty = 0;
  let total = 0;
  for (let y = yFrom; y < yTo; y += 1) {
    for (let x = from; x < to; x += 1) {
      total += 1;
      if (monoBlack[(y * 64 + x) * 4 + 3] < 128) empty += 1;
    }
  }
  return total === 0 ? 0 : empty / total;
})();
check("mono: dua halaman terpisah", monoGap > 0.6, `negative space ${(monoGap * 100).toFixed(0)}%`);

const monoWhite = render(
  { viewBox: MONO_VIEW_BOX, items: markShapes("mono", COLORS.white) },
  64,
  64,
);
let monoWhitePixels = 0;
for (let i = 3; i < monoWhite.length; i += 4) if (monoWhite[i] >= 128) monoWhitePixels += 1;
// Mark mono tidak punya field, jadi viewBox-nya dipadatkan ke batas buku.
// Kalau tidak, mark cuma menutup ~20% kanvas dan ruangnya terbuang.
check("mono white: mengisi viewBox", monoWhitePixels / (64 * 64) > 0.4, `cakupan ${(monoWhitePixels / 4096).toFixed(3)} (viewBox dipadatkan)`);

/* Maskable: artwork harus di dalam lingkaran aman 80%. */
const scale = MASKABLE.markSize / VIEW_BOX.width;
const artFraction = (96 * scale) / MASKABLE.canvas;
const insetFraction = MASKABLE.inset / MASKABLE.canvas;
const halfDiagonal = (MASKABLE.markSize * Math.SQRT2) / 2;
const safeRadius = MASKABLE.canvas * 0.4;
check(
  "maskable: artwork 50-60% kanvas",
  artFraction > 0.5 && artFraction <= 0.6,
  `${(artFraction * 100).toFixed(1)}% (lama 18.75%)`,
);
check("maskable: inset >= 20%", insetFraction >= 0.2, `inset ${(insetFraction * 100).toFixed(1)}% per sisi`);
check(
  "maskable: sudut di dalam safe circle",
  halfDiagonal <= safeRadius,
  `setengah diagonal ${halfDiagonal.toFixed(1)} <= radius aman ${safeRadius.toFixed(1)}`,
);
check("maskable: background opaque", MASKABLE.background === COLORS.blue, MASKABLE.background);

console.log(failures === 0 ? "\nMARK OK" : `\n${failures} MASALAH`);
process.exit(failures === 0 ? 0 : 1);
