/**
 * Sweep ukuran sudut terlipat pada ukuran ikon kecil.
 *
 * Dua kali menebak ("10 unit" dan "12 unit") sama-sama menghasilkan 1 piksel
 * amber di 16px, jadi ukuran ini dipilih dari data, bukan dari perkiraan.
 */
import { render, parseColor } from "./raster.mjs";
import { FIELD, VIEW_BOX, TONE_COLOUR } from "./mark.mjs";

const accent = parseColor(TONE_COLOUR.accent).slice(0, 3);
const near = (r, g, b) =>
  Math.abs(r - accent[0]) < 40 && Math.abs(g - accent[1]) < 40 && Math.abs(b - accent[2]) < 40;

function countAccent(size, leg) {
  /* Sudut terlipat sebagai blok persegi di kanan-atas buku. */
  const book = `M13 33C21 26.8 31 25.4 40 28.8V67.4C31 63 21 63.2 13 67.6Z` +
    `M48 29C52 26.8 55 26.4 57 27.4L${57 + leg} ${27.4 + leg}V67.4C66 64.6 57 63.4 48 63.4Z`;
  const shapes = [
    { ...FIELD, fill: TONE_COLOUR.blue },
    { type: "path", d: book, fill: TONE_COLOUR.left },
    { type: "path", d: `M${57 + leg} 27.4L${57 + leg} ${27.4 + leg}L57 ${27.4 + leg}Z`, fill: TONE_COLOUR.accent },
  ];
  const buffer = render({ viewBox: VIEW_BOX, items: shapes }, size, size);
  let count = 0;
  for (let i = 0; i < buffer.length; i += 4) {
    if (buffer[i + 3] >= 96 && near(buffer[i], buffer[i + 1], buffer[i + 2])) count += 1;
  }
  return count;
}

console.log("leg  px@16  px@24  px@32  px@48");
for (let leg = 10; leg <= 24; leg += 2) {
  console.log(
    String(leg).padStart(3),
    String(countAccent(16, leg)).padStart(6),
    String(countAccent(24, leg)).padStart(6),
    String(countAccent(32, leg)).padStart(6),
    String(countAccent(48, leg)).padStart(6),
  );
}
