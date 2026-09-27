/**
 * Rasterizer SVG minimal (tanpa dependensi) untuk build ikon brand.
 *
 * Cakupannya sengaja sempit - hanya primitif yang dipakai mark ini:
 *   <rect> dengan rx, <path> dengan M/m L/l H/h V/v C/c S/s A/a Z/z,
 *   <circle>, dan <ellipse>. Stroke hanya_round cap dan lebar tetap.
 *
 * Rendering: flatten kurva jadi polyline, lalu scanline fill dengan aturan
 * non-zero winding dan 4x4 supersampling per piksel supaya tepi halus tanpa
 * perlu library antialiasing.
 */

const SAMPLES = 4; // 4x4 = 16 sample per piksel
const CURVE_STEPS = 24;
const ARC_STEPS = 32;

/* ------------------------------------------------------------------ */
/* Path parsing                                                        */
/* ------------------------------------------------------------------ */

const TOKEN = /([MLHVCSQTAZmlhvcsqtaz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

export function parsePath(d) {
  const tokens = [...d.matchAll(TOKEN)].map((m) => m[1] ?? Number(m[2]));
  const subpaths = [];
  let current = null;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevCubic = null;
  let prevQuad = null;
  let i = 0;
  let lastCmd = "";

  const moveTo = (x, y) => {
    current = { points: [[x, y]], closed: false };
    subpaths.push(current);
    cx = x;
    cy = y;
    startX = x;
    startY = y;
  };
  const lineTo = (x, y) => {
    if (!current) moveTo(x, y);
    else current.points.push([x, y]);
    cx = x;
    cy = y;
  };
  const num = () => {
    const value = tokens[i];
    i += 1;
    return typeof value === "number" ? value : 0;
  };

  while (i < tokens.length) {
    let cmd;
    if (typeof tokens[i] === "number") {
      cmd = lastCmd === "M" ? "L" : lastCmd === "m" ? "l" : lastCmd;
    } else {
      cmd = tokens[i];
      i += 1;
    }
    if (typeof cmd !== "string" || !/^[MLHVCSQTAZmlhvcsqtaz]$/.test(cmd)) break;
    lastCmd = cmd;
    const rel = cmd === cmd.toLowerCase();
    const U = cmd.toUpperCase();

    if (U === "Z") {
      if (current) current.closed = true;
      cx = startX;
      cy = startY;
      prevCubic = null;
      prevQuad = null;
      continue;
    }

    if (U === "M") {
      const dx = num();
      const dy = num();
      moveTo(rel ? cx + dx : dx, rel ? cy + dy : dy);
    } else if (U === "L") {
      const dx = num();
      const dy = num();
      lineTo(rel ? cx + dx : dx, rel ? cy + dy : dy);
    } else if (U === "H") {
      const dx = num();
      lineTo(rel ? cx + dx : dx, cy);
    } else if (U === "V") {
      const dy = num();
      lineTo(cx, rel ? cy + dy : dy);
    } else if (U === "C") {
      const ax = num();
      const ay = num();
      const bx = num();
      const by = num();
      const x = num();
      const y = num();
      const x1 = rel ? cx + ax : ax;
      const y1 = rel ? cy + ay : ay;
      const x2 = rel ? cx + bx : bx;
      const y2 = rel ? cy + by : by;
      const ex = rel ? cx + x : x;
      const ey = rel ? cy + y : y;
      cubic(current, cx, cy, x1, y1, x2, y2, ex, ey);
      prevCubic = [x2, y2];
      cx = ex;
      cy = ey;
    } else if (U === "S") {
      const bx = num();
      const by = num();
      const x = num();
      const y = num();
      const x1 = prevCubic ? 2 * cx - prevCubic[0] : cx;
      const y1 = prevCubic ? 2 * cy - prevCubic[1] : cy;
      const x2 = rel ? cx + bx : bx;
      const y2 = rel ? cy + by : by;
      const ex = rel ? cx + x : x;
      const ey = rel ? cy + y : y;
      cubic(current, cx, cy, x1, y1, x2, y2, ex, ey);
      prevCubic = [x2, y2];
      cx = ex;
      cy = ey;
    } else if (U === "Q") {
      const ax = num();
      const ay = num();
      const x = num();
      const y = num();
      const x1 = rel ? cx + ax : ax;
      const y1 = rel ? cy + ay : ay;
      const ex = rel ? cx + x : x;
      const ey = rel ? cy + y : y;
      quad(current, cx, cy, x1, y1, ex, ey);
      prevQuad = [x1, y1];
      cx = ex;
      cy = ey;
    } else if (U === "T") {
      const x = num();
      const y = num();
      const x1 = prevQuad ? 2 * cx - prevQuad[0] : cx;
      const y1 = prevQuad ? 2 * cy - prevQuad[1] : cy;
      const ex = rel ? cx + x : x;
      const ey = rel ? cy + y : y;
      quad(current, cx, cy, x1, y1, ex, ey);
      prevQuad = [x1, y1];
      cx = ex;
      cy = ey;
    } else if (U === "A") {
      const rx = num();
      const ry = num();
      const rot = num();
      const large = num();
      const sweep = num();
      const x = num();
      const y = num();
      const ex = rel ? cx + x : x;
      const ey = rel ? cy + y : y;
      ellipseArc(current, cx, cy, rx, ry, rot, large, sweep, ex, ey);
      cx = ex;
      cy = ey;
    }

    if (U !== "C" && U !== "S") prevCubic = null;
    if (U !== "Q" && U !== "T") prevQuad = null;
  }

  return subpaths;
}

function cubic(target, x0, y0, x1, y1, x2, y2, x3, y3) {
  for (let s = 1; s <= CURVE_STEPS; s += 1) {
    const t = s / CURVE_STEPS;
    const u = 1 - t;
    target.points.push([
      u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    ]);
  }
}

function quad(target, x0, y0, x1, y1, x2, y2) {
  for (let s = 1; s <= CURVE_STEPS; s += 1) {
    const t = s / CURVE_STEPS;
    const u = 1 - t;
    target.points.push([
      u * u * x0 + 2 * u * t * x1 + t * t * x2,
      u * u * y0 + 2 * u * t * y1 + t * t * y2,
    ]);
  }
}

/* Arc dari SVG spec (F.6.5) - jalur elliptical penuh, cukup untuk rounded
   corner yang dipakai mark. */
function ellipseArc(target, x0, y0, rx, ry, xRot, large, sweep, x, y) {
  if (rx === 0 || ry === 0) {
    target.points.push([x, y]);
    return;
  }
  let rxA = Math.abs(rx);
  let ryA = Math.abs(ry);
  const phi = (xRot * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rxA * rxA) + (y1p * y1p) / (ryA * ryA);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rxA *= s;
    ryA *= s;
  }
  const num = rxA * rxA * ryA * ryA - rxA * rxA * y1p * y1p - ryA * ryA * x1p * x1p;
  const den = rxA * rxA * y1p * y1p + ryA * ryA * x1p * x1p;
  const sign = large === sweep ? -1 : 1;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * (rxA * y1p)) / ryA;
  const cyp = (coef * (-ryA * x1p)) / rxA;
  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;
  const angle = (ux, uy, vx, vy) => {
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / len)));
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rxA, (y1p - cyp) / ryA);
  let delta = angle(
    (x1p - cxp) / rxA,
    (y1p - cyp) / ryA,
    (-x1p - cxp) / rxA,
    (-y1p - cyp) / ryA,
  );
  if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
  if (sweep === 1 && delta < 0) delta += 2 * Math.PI;
  for (let s = 1; s <= ARC_STEPS; s += 1) {
    const t = theta1 + (delta * s) / ARC_STEPS;
    target.points.push([
      cosPhi * rxA * Math.cos(t) - sinPhi * ryA * Math.sin(t) + cx,
      sinPhi * rxA * Math.cos(t) + cosPhi * ryA * Math.sin(t) + cy,
    ]);
  }
}

/* ------------------------------------------------------------------ */
/* Path -> polygon (rounded rect & circle as polylines)                */
/* ------------------------------------------------------------------ */

export function rectPolygon(x, y, width, height, rx = 0) {
  const radius = Math.min(rx, width / 2, height / 2);
  if (radius <= 0) {
    return [[
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ]];
  }
  const points = [];
  const corner = (cx, cy, start) => {
    for (let s = 0; s <= 8; s += 1) {
      const a = start + (s / 8) * (Math.PI / 2);
      points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
    }
  };
  corner(x + width - radius, y + radius, -Math.PI / 2);
  corner(x + width - radius, y + height - radius, 0);
  corner(x + radius, y + height - radius, Math.PI / 2);
  corner(x + radius, y + radius, Math.PI);
  return [points];
}

export function ellipsePolygon(cx, cy, rx, ry) {
  const points = [];
  for (let s = 0; s <= 64; s += 1) {
    const a = (s / 64) * Math.PI * 2;
    points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return [points];
}

/* ------------------------------------------------------------------ */
/* Scanline fill (non-zero winding) + supersampling                    */
/* ------------------------------------------------------------------ */

function fillPolygons(contours, width, height, [r, g, b, a], buffer) {
  if (a <= 0) return;
  const step = 1 / SAMPLES;
  const perSample = a / (SAMPLES * SAMPLES);
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      let covered = 0;
      /* Supersampling 4x4: 4 baris sample di Y, dan tiap rentang diuji
         pada 4 posisi sub-piksel di X. */
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        const y = py + (sy + 0.5) * step;
        const xs = [];
        for (const contour of contours) {
          for (let i = 0; i < contour.length; i += 1) {
            const [x0, y0] = contour[i];
            const [x1, y1] = contour[(i + 1) % contour.length];
            if (y0 === y1) continue;
            if (y >= Math.min(y0, y1) && y < Math.max(y0, y1)) {
              xs.push({ x: x0 + ((y - y0) / (y1 - y0)) * (x1 - x0), dir: y1 > y0 ? 1 : -1 });
            }
          }
        }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a.x - b.x);
        /* Non-zero winding: rentang antar-interseksi dihitung hanya saat
           winding tidak nol, jadi subpath searah tetap menyatu. */
        let wind = 0;
        for (let i = 0; i < xs.length - 1; i += 1) {
          wind += xs[i].dir;
          if (wind === 0) continue;
          const from = xs[i].x;
          const to = xs[i + 1].x;
          for (let sx = 0; sx < SAMPLES; sx += 1) {
            const x = px + (sx + 0.5) * step;
            if (x > from && x < to) covered += 1;
          }
        }
      }
      if (covered === 0) continue;
      const index = (py * width + px) * 4;
      const dstA = perSample * covered;
      const keep = 1 - dstA;
      buffer[index] = Math.round(r * dstA + buffer[index] * keep);
      buffer[index + 1] = Math.round(g * dstA + buffer[index + 1] * keep);
      buffer[index + 2] = Math.round(b * dstA + buffer[index + 2] * keep);
      buffer[index + 3] = Math.round(255 * dstA + buffer[index + 3] * keep);
    }
  }
}

export function parseColor(hex) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value.split("").map((c) => c + c).join("")
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
    full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  ];
}

/**
 * Render daftar bentuk ke RGBA.
 * Bentuk: { type:'rect'|'path'|'ellipse', ... } dengan fill opsional.
 */
export function render(shapes, width, height) {
  const buffer = new Uint8Array(width * height * 4);
  const scaleX = width / shapes.viewBox.width;
  const scaleY = height / shapes.viewBox.height;
  const vb = shapes.viewBox;

  /* Background opaque fills the whole canvas in device pixels, before the
     artwork. Dipakai untuk ikon maskable yang wajib full-bleed. */
  if (shapes.background) {
    const [r, g, b] = parseColor(shapes.background);
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = r;
      buffer[i + 1] = g;
      buffer[i + 2] = b;
      buffer[i + 3] = 255;
    }
  }

  for (const shape of shapes.items) {
    if (!shape.fill) continue;
    let contours;
    if (shape.type === "rect") {
      contours = rectPolygon(
        (shape.x - vb.x) * scaleX,
        (shape.y - vb.y) * scaleY,
        shape.width * scaleX,
        shape.height * scaleY,
        (shape.rx ?? 0) * scaleX,
      );
    } else if (shape.type === "ellipse") {
      contours = ellipsePolygon(
        (shape.cx - vb.x) * scaleX,
        (shape.cy - vb.y) * scaleY,
        shape.rx * scaleX,
        shape.ry * scaleY,
      );
    } else if (shape.type === "path") {
      contours = parsePath(shape.d).map((sub) =>
        sub.points.map(([x, y]) => [(x - vb.x) * scaleX, (y - vb.y) * scaleY]),
      );
    } else {
      continue;
    }
    fillPolygons(contours, width, height, parseColor(shape.fill), buffer);
  }

  return buffer;
}
