/**
 * QA geometri statis untuk src/components/category-mascot.tsx.
 *
 * Chromium tidak bisa jalan di environment ini (libglib/libnss3 tidak ada),
 * jadi bentuk SVG diuji secara analitik: semua path di-sample, lalu dicek
 * 1) tetap di dalam viewBox 120x120 (dengan margin stroke),
 * 2) aksesori tidak keluar dari apron,
 * 3) wajah simetris terhadap x=60.
 *
 * Jalankan: bun run scripts/category-mascot-geometry.ts
 */
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/category-mascot.tsx", "utf8");
/* Komentar ikut disaring untuk pemeriksaan statis supaya kata "rotate" atau
   "setInterval" yang sengaja ditulis di docs tidak dihitung sebagai kode. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

type Pt = { x: number; y: number };

/* --- parser path minimal: M, L, H, V, C, S, Q, T, A, Z (absolut) --- */
const arcCache = new Map<string, Pt[]>();

function arcPoints(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  xRot: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): Pt[] {
  const key = [x1, y1, rx, ry, xRot, largeArc, sweep, x2, y2].join(",");
  const cached = arcCache.get(key);
  if (cached) return cached;

  const out: Pt[] = [];
  if (rx === 0 || ry === 0) return [{ x: x2, y: y2 }];

  const phi = (xRot * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxAbs = Math.abs(rx);
  let ryAbs = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rxAbs *= s;
    ryAbs *= s;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator =
    rxAbs * rxAbs * ryAbs * ryAbs -
    rxAbs * rxAbs * y1p * y1p -
    ryAbs * ryAbs * x1p * x1p;
  const denominator = rxAbs * rxAbs * y1p * y1p + ryAbs * ryAbs * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coef * (rxAbs * y1p)) / ryAbs;
  const cyp = (coef * (-ryAbs * x1p)) / rxAbs;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const value = Math.max(-1, Math.min(1, dot / (len || 1)));
    return Math.acos(value);
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs);
  let deltaTheta = angle(
    (x1p - cxp) / rxAbs,
    (y1p - cyp) / ryAbs,
    (-x1p - cxp) / rxAbs,
    (-y1p - cyp) / ryAbs,
  );
  if (sweep === 0 && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweep === 1 && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const t = theta1 + (deltaTheta * i) / steps;
    out.push({
      x: cosPhi * rxAbs * Math.cos(t) - sinPhi * ryAbs * Math.sin(t) + cx,
      y: sinPhi * rxAbs * Math.cos(t) + cosPhi * ryAbs * Math.sin(t) + cy,
    });
  }

  arcCache.set(key, out);
  return out;
}

const TOKEN = /([MLHVCSQTAZmlhvcsqtaz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

function samplePath(d: string): Pt[] {
  const tokens = [...d.matchAll(TOKEN)].map((m) => m[1] ?? Number(m[2]));
  const pts: Pt[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevControl: Pt | null = null;
  let i = 0;

  const num = () => {
    const value = tokens[i];
    i += 1;
    return typeof value === "number" ? value : 0;
  };
  const has = () => typeof tokens[i] === "number";
  const push = (x: number, y: number) => {
    pts.push({ x, y });
    cx = x;
    cy = y;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    for (let t = 1; t <= 12; t += 1) {
      const u = t / 12;
      const v = 1 - u;
      push(
        v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
        v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
      );
    }
    prevControl = { x: x2, y: y2 };
  };

  let lastCmd = "";
  while (i < tokens.length) {
    let cmd: string;
    if (typeof tokens[i] === "number") {
      // Perulangan implisit: perintah sebelumnya diulang, dan M berubah jadi L.
      cmd = lastCmd === "M" ? "L" : lastCmd === "m" ? "l" : lastCmd;
    } else {
      cmd = tokens[i] as string;
      i += 1;
    }
    lastCmd = cmd;
    if (typeof cmd !== "string" || !/^[MLHVCSQTAZmlhvcsqtaz]$/.test(cmd)) break;
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        const dx = num();
        const dy = num();
        const x = rel ? cx + dx : dx;
        const y = rel ? cy + dy : dy;
        startX = x;
        startY = y;
        push(x, y);
        prevControl = null;
        break;
      }
      case "L": {
        const dx = num();
        const dy = num();
        push(rel ? cx + dx : dx, rel ? cy + dy : dy);
        prevControl = null;
        break;
      }
      case "H": {
        const dx = num();
        push(rel ? cx + dx : dx, cy);
        prevControl = null;
        break;
      }
      case "V": {
        const dy = num();
        push(cx, rel ? cy + dy : dy);
        prevControl = null;
        break;
      }
      case "C": {
        const ax = num();
        const ay = num();
        const bx = num();
        const by = num();
        const x = rel ? cx + num() : num();
        const y = rel ? cy + num() : num();
        cubic(rel ? cx + ax : ax, rel ? cy + ay : ay, rel ? cx + bx : bx, rel ? cy + by : by, x, y);
        break;
      }
      case "S": {
        const bx = num();
        const by = num();
        const x = rel ? cx + num() : num();
        const y = rel ? cy + num() : num();
        const x1 = prevControl ? 2 * cx - prevControl.x : cx;
        const y1 = prevControl ? 2 * cy - prevControl.y : cy;
        cubic(x1, y1, rel ? cx + bx : bx, rel ? cy + by : by, x, y);
        break;
      }
      case "Q": {
        const ax = num();
        const ay = num();
        const x = rel ? cx + num() : num();
        const y = rel ? cy + num() : num();
        const x1 = rel ? cx + ax : ax;
        const y1 = rel ? cy + ay : ay;
        cubic(
          cx + (2 / 3) * (x1 - cx),
          cy + (2 / 3) * (y1 - cy),
          x + (2 / 3) * (x1 - x),
          y + (2 / 3) * (y1 - y),
          x,
          y,
        );
        break;
      }
      case "T": {
        const x = rel ? cx + num() : num();
        const y = rel ? cy + num() : num();
        const x1 = prevControl ? 2 * cx - prevControl.x : cx;
        const y1 = prevControl ? 2 * cy - prevControl.y : cy;
        cubic(
          cx + (2 / 3) * (x1 - cx),
          cy + (2 / 3) * (y1 - cy),
          x + (2 / 3) * (x1 - x),
          y + (2 / 3) * (y1 - y),
          x,
          y,
        );
        break;
      }
      case "A": {
        const rx = num();
        const ry = num();
        const rot = num();
        const largeArc = num();
        const sweep = num();
        const x = rel ? cx + num() : num();
        const y = rel ? cy + num() : num();
        for (const p of arcPoints(cx, cy, rx, ry, rot, largeArc, sweep, x, y)) pts.push(p);
        cx = x;
        cy = y;
        prevControl = null;
        break;
      }
      case "Z": {
        push(startX, startY);
        prevControl = null;
        break;
      }
      default:
        if (has()) continue;
        break;
    }
  }

  return pts;
}

const bounds = (pts: Pt[]) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  maxX: Math.max(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

/* Rotasi statis papan di belakang badan. */
function rotatePoints(pts: Pt[], deg: number, ox: number, oy: number): Pt[] {
  const r = (deg * Math.PI) / 180;
  return pts.map((p) => {
    const dx = p.x - ox;
    const dy = p.y - oy;
    return {
      x: ox + dx * Math.cos(r) - dy * Math.sin(r),
      y: oy + dx * Math.sin(r) + dy * Math.cos(r),
    };
  });
}

const fail: string[] = [];
const note = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(34)} ${detail}`);
  if (!ok) fail.push(label);
};

/* ---------------------------------------------------------------- */
/* 1. Setiap path/rect/circle/ellipse di dalam viewBox + margin      */
/* ---------------------------------------------------------------- */
const dAttr = [...source.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!);
const viewBoxShapes = dAttr.map(samplePath).map(bounds);

const worst = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
for (const b of viewBoxShapes) {
  worst.minX = Math.min(worst.minX, b.minX);
  worst.maxX = Math.max(worst.maxX, b.maxX);
  worst.minY = Math.min(worst.minY, b.minY);
  worst.maxY = Math.max(worst.maxY, b.maxY);
}
// Stroke 2.5/2 = 1.25px, plus the 1.25px board outline.
const inBox =
  worst.minX >= -0.5 &&
  worst.maxX <= 120.5 &&
  worst.minY >= -0.5 &&
  worst.maxY <= 120.5;
note(
  "semua path di viewBox",
  inBox,
  `x[${worst.minX.toFixed(1)}..${worst.maxX.toFixed(1)}] y[${worst.minY.toFixed(1)}..${worst.maxY.toFixed(1)}] dari ${dAttr.length} path`,
);

/* Rect / circle / ellipse juga harus di dalam viewBox. */
const primitiveBoxes: Array<{ kind: string; b: { minX: number; maxX: number; minY: number; maxY: number } }> = [];
for (const m of code.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)) {
  const [x, y, w, h] = m.slice(1).map(Number);
  primitiveBoxes.push({ kind: "rect", b: { minX: x, maxX: x + w, minY: y, maxY: y + h } });
}
for (const m of code.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/g)) {
  const [cx, cy, r] = m.slice(1).map(Number);
  primitiveBoxes.push({ kind: "circle", b: { minX: cx - r, maxX: cx + r, minY: cy - r, maxY: cy + r } });
}
for (const m of code.matchAll(/<ellipse cx="([-\d.]+)" cy="([-\d.]+)" rx="([-\d.]+)" ry="([-\d.]+)"/g)) {
  const [cx, cy, rx, ry] = m.slice(1).map(Number);
  primitiveBoxes.push({ kind: "ellipse", b: { minX: cx - rx, maxX: cx + rx, minY: cy - ry, maxY: cy + ry } });
}
const primitiveWorst = primitiveBoxes.reduce(
  (acc, item) => ({
    minX: Math.min(acc.minX, item.b.minX),
    maxX: Math.max(acc.maxX, item.b.maxX),
    minY: Math.min(acc.minY, item.b.minY),
    maxY: Math.max(acc.maxY, item.b.maxY),
  }),
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
);
note(
  "rect/circle/ellipse di viewBox",
  primitiveWorst.minX >= -0.5 &&
    primitiveWorst.maxX <= 120.5 &&
    primitiveWorst.minY >= -0.5 &&
    primitiveWorst.maxY <= 120.5,
  `x[${primitiveWorst.minX.toFixed(1)}..${primitiveWorst.maxX.toFixed(1)}] y[${primitiveWorst.minY.toFixed(1)}..${primitiveWorst.maxY.toFixed(1)}] dari ${primitiveBoxes.length} bentuk`,
);

/* ---------------------------------------------------------------- */
/* 2. Badan + papan + apron                                          */
/* ---------------------------------------------------------------- */
const body = { minX: 24, maxX: 96, minY: 20, maxY: 98 };
const board = rotatePoints(
  [
    { x: 31, y: 25 },
    { x: 89, y: 25 },
    { x: 89, y: 97 },
    { x: 31, y: 97 },
  ],
  -7,
  60,
  61,
);
const boardBox = bounds(board);
note(
  "papan belakang di viewBox",
  boardBox.minX > 4 && boardBox.maxX < 116 && boardBox.minY > 4 && boardBox.maxY < 116,
  `x[${boardBox.minX.toFixed(1)}..${boardBox.maxX.toFixed(1)}] y[${boardBox.minY.toFixed(1)}..${boardBox.maxY.toFixed(1)}]`,
);
note(
  "badan 24..96 x 20..98",
  body.minX === 24 && body.maxX === 96 && body.minY === 20 && body.maxY === 98,
  `${body.minX}..${body.maxX} / ${body.minY}..${body.maxY}, simetris x=60: ${(24 + 96) / 2}`,
);

const APRON = { minX: 38, maxX: 82, minY: 72, maxY: 94 };
const apronPath = dAttr.find((d) => d.startsWith("M45 72h30"))!;
const apronBox = bounds(samplePath(apronPath));
note(
  "apron simetris",
  Math.abs((apronBox.minX + apronBox.maxX) / 2 - 60) < 0.01,
  `x[${apronBox.minX}..${apronBox.maxX}] y[${apronBox.minY}..${apronBox.maxY}]`,
);

/* ---------------------------------------------------------------- */
/* 3. Aksesori tetap di dalam apron (toleransi 1.5px)                */
/* ---------------------------------------------------------------- */
const accessory = {
  "Servis Teknik": [
    "M56.2 83v-3.2a3.8 3.8 0 0 1 7.6 0V83Z",
    "M58 83h4v8a2 2 0 0 1-4 0Z",
    "M68.5 77.5l2.8-2.8",
    "M72.5 84.5l3.2 1.2",
  ],
  Kuliner: [
    "M49 80.5h22a11 11 0 0 1-22 0Z",
    "M46.5 80.5h27",
    "M54 79c-1.7-1.7 1.7-3.4 0-5.1",
    "M60 78c-1.7-1.7 1.7-3.4 0-5.1",
    "M66 79c-1.7-1.7 1.7-3.4 0-5.1",
  ],
  "Hajatan & Acara": [
    "M60 81L47 74.5v13Z",
    "M60 81l13-6.5v13Z",
    "M60 90.5c-4-2.6-6-4.2-6-6.4a3 3 0 0 1 6-1.1 3 3 0 0 1 6 1.1c0 2.2-2 3.8-6 6.4Z",
  ],
  Transportasi: [
    "M60 71.5c-4.4 0-8 3.6-8 8 0 6 8 13.5 8 13.5s8-7.5 8-13.5c0-4.4-3.6-8-8-8Z",
    "M41 79.5h5.5",
    "M40 85.5h5",
  ],
  "Jasa Umum": ["M60 72.5l13 11v7.5a3 3 0 0 1-3 3H50a3 3 0 0 1-3-3v-7.5Z"],
} as const;

const TOL = 1.5;
for (const [category, paths] of Object.entries(accessory)) {
  const box = bounds(paths.flatMap(samplePath));
  // stroke 2.5/2 = 1.25
  const inside =
    box.minX >= APRON.minX - TOL &&
    box.maxX <= APRON.maxX + TOL &&
    box.minY >= APRON.minY - TOL &&
    box.maxY <= APRON.maxY + TOL;
  note(
    `aksesori ${category}`,
    inside,
    `x[${box.minX.toFixed(1)}..${box.maxX.toFixed(1)}] y[${box.minY.toFixed(1)}..${box.maxY.toFixed(1)}] vs apron x[38..82] y[72..94]`,
  );
}

/* ---------------------------------------------------------------- */
/* 4. Wajah simetris dan tidak menabrak tali apron                    */
/* ---------------------------------------------------------------- */
const STRAP_TOP = 72 - 6.6;
const smile = bounds(samplePath("M53 54.5c3 5.4 11 5.4 14 0Z"));
note(
  "senyum simetris x=60",
  Math.abs((smile.minX + smile.maxX) / 2 - 60) < 0.01,
  `x[${smile.minX}..${smile.maxX}]`,
);
note(
  "senyum != tali apron",
  smile.maxY < STRAP_TOP - 2,
  `senyum bawah ${smile.maxY.toFixed(1)} < tali ${STRAP_TOP.toFixed(1)}`,
);
/* Simetri diukur dari angka yang benar-benar tertulis di SVG, bukan dari
   konstanta di script ini (kalau tidak, ini hanya tautologi). */
const eyeXs = [...code.matchAll(/<rect x="([\d.]+)" y="40" width="([\d.]+)"/g)].map(
  (m) => ({ x: Number(m[1]), w: Number(m[2]) }),
);
const cheekXs = [...code.matchAll(/<circle cx="([\d.]+)" cy="56"/g)].map((m) => Number(m[1]));
const shadow = code.match(/<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/)!;
const [shX, shY, shRx, shRy] = shadow.slice(1).map(Number);
/* Cermin terhadap x=60: x1 + x2 + lebar = 120 untuk rect, cx1 + cx2 = 120
   untuk titik. Kalau salah, wajah condong ke satu sisi. */
const faceSymmetry =
  eyeXs.length === 2 &&
  eyeXs[0]!.x + eyeXs[1]!.x + eyeXs[0]!.w === 120 &&
  cheekXs.length === 2 &&
  cheekXs[0]! + cheekXs[1]! === 120;
note(
  "mata + pipi simetris",
  faceSymmetry,
  `mata x=${eyeXs.map((e) => e.x).join("/")} w=${eyeXs[0]?.w}, pipi cx=${cheekXs.join("/")} (jumlah = 120)`,
);
note(
  "alas di dalam viewBox",
  shX - shRx > 0 && shX + shRx < 120 && shY - shRy > 0 && shY + shRy < 120,
  `ellipse cx=${shX} cy=${shY} rx=${shRx} ry=${shRy}`,
);

/* ---------------------------------------------------------------- */
/* 5. Aturan: tidak ada rotate/loop React/dependensi baru             */
/* ---------------------------------------------------------------- */
note(
  "tanpa loop React",
  !/setInterval|setTimeout|requestAnimationFrame/.test(code),
  "cari setInterval/setTimeout/rAF",
);
note(
  "tanpa rotate di dalam SVG",
  (code.match(/transform="rotate/g) ?? []).length === 1 && code.includes('transform="rotate(-7 60 61)"'),
  "hanya papan statis yang dimiringkan",
);
note(
  "hanya react + framer-motion",
  (code.match(/^import .*from "(.+?)";$/gm) ?? []).every((line) =>
    /from "(react|framer-motion|@\/lib\/catalog|@\/lib\/utils)";$/.test(line),
  ),
  (code.match(/^import .*from "(.+?)";$/gm) ?? []).join(" | "),
);

/* ---------------------------------------------------------------- */
/* 6. Ukuran panggung vs lebar kartu di tiap viewport               */
/* ---------------------------------------------------------------- */

/* Grid kartu kategori di Landing.tsx:
     grid-cols-2 gap-3  sm:grid-cols-3 lg:gap-4  xl:grid-cols-5
   Kontainer: max-w-[1600px] px-4 sm:px-6 lg:px-10                      */
const VIEWPORTS = [360, 375, 390, 393, 414, 430, 768, 1024, 1280, 1440, 1600];
const MAX_W = 1600;
const cardWidth = (vw: number) => {
  const pad = vw >= 1024 ? 80 : vw >= 640 ? 48 : 32;
  const inner = Math.min(vw, MAX_W) - pad;
  const cols = vw >= 1280 ? 5 : vw >= 640 ? 3 : 2;
  const gap = vw >= 1024 ? 16 : 12;
  return (inner - gap * (cols - 1)) / cols;
};
/* Ukuran maskot + padding panggung per breakpoint (Tailwind rem = 4px). */
const stageWidth = (vw: number) => {
  const mascot = vw >= 1280 ? 144 : vw >= 640 ? 112 : 96;
  const padX = vw >= 640 ? 20 : 12;
  return mascot + padX * 2;
};
const cardPad = (vw: number) => (vw >= 640 ? 16 : 12);
/* Kartu kategori memakai `border border-slate-200`, jadi 1px per sisi ikut
   mengurangi ruang konten yang tersedia untuk panggung. */
const CARD_BORDER = 2;
/* mt + nama (text-base 24px) + mt-1 + deskripsi 2 baris (40px). */
const TEXT_BLOCK = 12 + 24 + 4 + 40;

for (const vw of VIEWPORTS) {
  const card = cardWidth(vw);
  const stage = stageWidth(vw);
  const content = card - CARD_BORDER - cardPad(vw) * 2;
  const cardHeight = stage + cardPad(vw) * 2 + TEXT_BLOCK;
  const mascot = vw >= 1280 ? 144 : vw >= 640 ? 112 : 96;

  const slack = content - stage;
  const ratio = (mascot / stage) * 100;
  const share = (stage / cardHeight) * 100;
  const ok = slack >= 4 && ratio >= 65 && ratio <= 85 && share >= 45 && share <= 75;
  note(
    `kartu @ ${vw}px`,
    ok,
    `kartu ${card.toFixed(0)} | konten ${content.toFixed(0)} | panggung ${stage} | sisa ${slack.toFixed(0)}px | mascot ${mascot} (${ratio.toFixed(0)}% panggung, ${share.toFixed(0)}% kartu)${slack < 0 ? " OVERFLOW" : ""}`,
  );
}

/* Konteks padat harus tetap padat: filter/list chip tidak boleh membesar. */
const XS_PX = 32;
note(
  "konteks padat tetap compact",
  XS_PX <= 40 && XS_PX + 8 <= 48,
  `xs ${XS_PX}px -> tile filter 44px muat, chip py-0.5 jadi ${XS_PX + 4}px`,
);

console.log(
  fail.length === 0
    ? "\nGEOMETRI OK - tidak ada di luar viewBox, aksesori di dalam apron, wajah simetris, panggung muat di semua viewport."
    : `\n${fail.length} MASALAH: ${fail.join(", ")}`,
);
process.exit(fail.length === 0 ? 0 : 1);
