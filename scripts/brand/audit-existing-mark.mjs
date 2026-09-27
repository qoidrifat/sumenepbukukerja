/**
 * Audit numerik mark yang sudah ada (public/brand/logo-mark.svg, viewBox 96)
 * terhadap kriteria small-size / monochrome / collision.
 *
 * Bukan ASSERTIONS tentang CSS Tailwind, tapi pengukuran geometri murni
 * supaya keputusan "detail apa yang harus dibuang" bisa diambil dari angka,
 * bukan dari perkiraan mata.
 */
const S = 96;
const at = (units, px) => (units * px) / S;

const elements = [
  ["spine stroke width 5", 5, "stroke"],
  ["pin dot diameter 6", 6, "detail"],
  ["pin body width ~16", 16, "shape"],
  ["left page min width 25.5", 25.5, "shape"],
  ["dog-ear / fold", 0, "detail"],
];

console.log("== keterbacaan pada ukuran kecil ==");
console.log("elemen".padEnd(28), "unit".padStart(6), "16px".padStart(8), "32px".padStart(8), "48px".padStart(8));
for (const [name, units] of elements) {
  if (units === 0) continue;
  const c16 = at(units, 16);
  console.log(
    name.padEnd(28),
    String(units).padStart(6),
    c16.toFixed(2).padStart(8),
    at(units, 32).toFixed(2).padStart(8),
    at(units, 48).toFixed(2).padStart(8),
  );
}

console.log("");
console.log("== ambang ==");
console.log("spine stroke @16px        :", at(5, 16).toFixed(2), "px  -> < 1px, HILANG");
console.log("pin dot diameter @16px     :", at(6, 16).toFixed(2), "px  -> < 1px, TIDAK TERBACA");
console.log("pin body width @16px       :", at(16, 16).toFixed(2), "px  -> innerspace pin hilang");

console.log("");
console.log("== tabrakan geometri: pin vs halaman kanan ==");
const pin = { x0: 62, x1: 78, y0: 15.5, y1: 37 };
const rightPage = { x0: 52, x1: 77.5, y0: 28.5, y1: 66.8 };
const ow = Math.min(pin.x1, rightPage.x1) - Math.max(pin.x0, rightPage.x0);
const oh = Math.min(pin.y1, rightPage.y1) - Math.max(pin.y0, rightPage.y0);
console.log("overlap x                 :", ow.toFixed(1), "unit");
console.log("overlap y                 :", oh.toFixed(1), "unit");
console.log("luas tumpang tindih       :", (ow * oh).toFixed(0), "unit^2  -> TABRAKAN NYATA");

console.log("");
console.log("== monochrome ==");
console.log("leftPage  #FFFFFF");
console.log("rightPage #FFFFFF");
console.log("spine     #FFFFFF");
console.log("-> seluruh buku jadi satu blob solid, dua halaman tidak lagi");
console.log("   bisa dibedakan dan struktur 'buku' hilang di varian mono.");
