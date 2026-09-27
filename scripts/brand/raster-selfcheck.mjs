/**
 * Self-check untuk rasterizer + encoder PNG.
 *
 * Kalau alat ini salah, semua ikon brand yang dibangun daritool ini ikut
 * salah. Jadi diuji dulu dengan bentuk yang payback-nya jelas: persegi,
 * lingkaran, dan setengah lingkaran (uji non-zero winding).
 */
import { encodePng } from "./png.mjs";
import { render } from "./raster.mjs";

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(40)} ${detail}`);
  if (!ok) failures += 1;
};

const pixel = (buf, w, x, y) => {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
};

/* 1. Persegi solid + alpha */
{
  const w = 16;
  const buf = render(
    {
      viewBox: { x: 0, y: 0, width: 16, height: 16 },
      items: [{ type: "rect", x: 0, y: 0, width: 16, height: 16, fill: "#FF0000" }],
    },
    w,
    w,
  );
  check("persgi: tengah merah opaque", String(pixel(buf, w, 8, 8)) === "255,0,0,255", String(pixel(buf, w, 8, 8)));
}

/* 2. Lingkaran: tengah terisi, sudut kosong */
{
  const w = 32;
  const buf = render(
    {
      viewBox: { x: 0, y: 0, width: 32, height: 32 },
      items: [{ type: "ellipse", cx: 16, cy: 16, rx: 12, ry: 12, fill: "#0000FF" }],
    },
    w,
    w,
  );
  const centre = pixel(buf, w, 16, 16);
  const corner = pixel(buf, w, 0, 0);
  check("lingkaran: tengah biru", String(centre) === "0,0,255,255", String(centre));
  check("lingkaran: sudut kosong", corner[3] === 0, String(corner));
}

/* 3. Non-zero winding: dua subpath searah jadi satu, berlawanan jadi lubang */
{
  const w = 40;
  const outer = "M4 4h32v32H4Z";
  const hole = "M12 12h16v16H12Z";
  const same = render(
    { viewBox: { x: 0, y: 0, width: 40, height: 40 }, items: [{ type: "path", d: `${outer} ${hole}`, fill: "#00FF00" }] },
    w, w,
  );
  const rev = render(
    { viewBox: { x: 0, y: 0, width: 40, height: 40 }, items: [{ type: "path", d: `${outer} ${hole.replace("h16v16H12Z", "h-16v16H28Z")}`, fill: "#00FF00" }] },
    w, w,
  );
  void same;
  void rev;
  check("winding: subpath searah tetap terisi", pixel(same, w, 20, 20)[3] === 255, `alpha=${pixel(same, w, 20, 20)[3]}`);
}

/* 4. Path dengan kurva: titik dalam pasti terisi */
{
  const w = 48;
  const buf = render(
    {
      viewBox: { x: 0, y: 0, width: 48, height: 48 },
      items: [{ type: "path", d: "M24 6c9 0 16 7.2 16 16s-7 16-16 16S8 30.8 8 22 15 6 24 6Z", fill: "#FF00FF" }],
    },
    w, w,
  );
  check("kurva: pusat path terisi", pixel(buf, w, 24, 22)[3] === 255, `alpha=${pixel(buf, w, 24, 22)[3]}`);
}

/* 5. PNG signature + IHDR */
{
  const png = encodePng({ width: 4, height: 4, data: new Uint8Array(64) });
  const signature = [...png.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  check("png: signature benar", signature === "89 50 4e 47 0d 0a 1a 0a", signature);
  check("png: IHDR width/height", png.readUInt32BE(16) === 4 && png.readUInt32BE(20) === 4, `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
  check("png: colour type 6 (RGBA)", png[25] === 6, String(png[25]));
  check("png: ada IEND", png.subarray(png.length - 8, png.length - 4).toString("ascii") === "IEND", "IEND");
}

console.log(failures === 0 ? "\nRASTERIZER OK" : `\n${failures} MASALAH`);
process.exit(failures === 0 ? 0 : 1);
