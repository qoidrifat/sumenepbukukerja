import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/**
 * Kontrak "kolom ikon" pada isian yang ikonnya ditempel di dalam input.
 *
 * Gejala yang dilaporkan pengguna: di `/auth?returnTo=/admin` ikon gembok
 * menimpa placeholder passcode sehingga placeholder tidak terbaca. Terukur di
 * produksi: `padding-left` isian terbaca 12.8px, sementara ikon 20px di
 * `left-3` berakhir di 32px - jadi teks benar-benar digambar di bawah ikon.
 *
 * Dua sebabnya, dan keduanya perlu dijaga supaya tidak balik lagi:
 *
 *  1. `.admin-workspace .admin-input` menulis `padding` dengan selektor dua
 *     kelas dan TIDAK berlayer, sedangkan `pl-11` hidup di `@layer utilities`.
 *     CSS tidak berlayer selalu mengalahkan utility berlayer, apa pun
 *     spesifisitasnya. Jadi `pl-11` tidak pernah berlaku di ruang pengelola:
 *     padding balik ke 0.8rem penimpaannya. Ruang ikon karena itu ditulis
 *     sebagai kelas sendiri (`.admin-input--slot-left`), bukan utility.
 *  2. Ruang ikon harus dihitung dari geometri ikon yang benar-benar dipakai
 *     (jarak + ukuran), bukan dari angka yang terlihat benar di satu layar.
 *
 * Uji ini membaca seluruh berkas .tsx di dalam src dan menghitung ulang jaraknya,
 * jadi input baru yang punya ikon tapi lupa memberi ruang akan gagal dengan
 * menyebut nama filenya - bukan bergantung pada daftar situs yang dicatat
 * manual di dalam test ini.
 */

const ROOT = "src";
const CSS = readFileSync("src/index.css", "utf8");

const files: string[] = [];
(function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".tsx")) files.push(full);
  }
})(ROOT);

/** Tag komponen yang isiannya menerima ikon di dalamnya. */
const CONTROL_TAGS = new Set([
  "input",
  "textarea",
  "Input",
  "Textarea",
  "SearchInput",
  "NativeSelect",
  "SelectTrigger",
]);

/** Tag ikon yang memang ditempel absolut di dalam isian. */
const ICON_TAGS = new Set([
  "svg",
  "Search",
  "Lock",
  "Mail",
  "User",
  "Phone",
  "Globe",
  "Eye",
  "EyeOff",
  "Upload",
  "ShieldCheck",
  "Filter",
  "Calendar",
  "ChevronDown",
  "ChevronDownIcon",
  "KeyRound",
  "AtSign",
  "Hash",
  "Home",
  "Building2",
  "Info",
  "AlertTriangle",
]);

/**
 * Baca satu tag utuh mulai dari indeks `<`.
 *
 * Regex biasa tidak bisa dipakai di sini: `onChange={(e) => setX(e.target.value)}`
 * memuat karakter `>` di dalam kurung kurawal, sehingga tag terpotong dan
 * `className` ikut hilang - persis yang membuat audit pertama melaporkan
 * isian tanpa slot padahal punya.
 */
function readTag(src: string, start: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      continue;
    }
    if (ch === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

function classOf(tag: string): string {
  const quoted = tag.match(/className="([^"]*)"/);
  if (quoted) return quoted[1]!;
  const template = tag.match(/className=\{`([^`]*)`\}/);
  if (template) return template[1]!;
  const inBraces = tag.match(/className=\{[^}]*?"([^"]*)"/s);
  return inBraces ? inBraces[1]! : "";
}

type Pair = {
  file: string;
  line: number;
  control: string;
  controlClass: string;
  iconTag: string;
  iconClass: string;
  side: "left" | "right";
  /** Jarak ikon dari tepi isian, dalam px. */
  offset: number;
  /** Ukuran ikon atau tombolnya, dalam px. */
  size: number;
};

/** Skala Tailwind: 1 rem = 0.25rem per langkah. */
function remToPx(step: string): number {
  return Number(step) * 4;
}

const ICON_OFFSET = /(left|right)-(\d+(?:\.\d+)?)/;
const ICON_SIZE = /size-(\d+(?:\.\d+)?)/;

function collectPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const icons: { tag: string; cls: string; index: number }[] = [];
    const controls: { tag: string; cls: string; index: number; line: number }[] = [];
    const tagRe = /<([A-Za-z][A-Za-z0-9.]*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(src))) {
      const tag = readTag(src, m.index);
      if (!tag) continue;
      const name = m[1]!;
      const cls = classOf(tag);
      if (ICON_TAGS.has(name) && /\babsolute\b/.test(cls)) {
        icons.push({ tag: name, cls, index: m.index });
      }
      if (CONTROL_TAGS.has(name)) {
        controls.push({
          tag: name,
          cls,
          index: m.index,
          line: src.slice(0, m.index).split(/\r?\n/).length,
        });
      }
      tagRe.lastIndex = m.index + tag.length;
    }
    if (icons.length === 0 || controls.length === 0) continue;

    for (const control of controls) {
      let nearest: { icon: (typeof icons)[number]; distance: number } | null = null;
      for (const icon of icons) {
        const distance = Math.abs(icon.index - control.index);
        if (distance < 700 && (!nearest || distance < nearest.distance)) {
          nearest = { icon, distance };
        }
      }
      if (!nearest) continue;
      const cls = nearest.icon.cls;
      const offsetMatch = cls.match(ICON_OFFSET);
      if (!offsetMatch) continue;
      const sizeMatch = cls.match(ICON_SIZE);
      pairs.push({
        file,
        line: control.line,
        control: control.tag,
        controlClass: control.cls,
        iconTag: nearest.icon.tag,
        iconClass: cls,
        side: offsetMatch[1] === "left" ? "left" : "right",
        offset: remToPx(offsetMatch[2]!),
        size: sizeMatch ? remToPx(sizeMatch[1]!) : 0,
      });
    }
  }
  return pairs;
}

const pairs = collectPairs();

/** Ruang teks minimum: jarak ikon + lebar ikon + 8px ruang bernapas. */
const ruangMinimum = (pair: Pair) => pair.offset + pair.size + 8;

/** Nilai padding yang benar-benar berlaku untuk slot ikon, dibaca dari CSS. */
function slotRem(side: "left" | "right"): number | null {
  const pola =
    "admin-input--slot-" +
    side +
    "\\s*\\{[^}]*padding-" +
    side +
    ":\\s*([\\d.]+)rem";
  const found = new RegExp(pola).exec(CSS);
  return found ? Number(found[1]) * 16 : null;
}

function paddingTerpakai(cls: string, side: "left" | "right"): number | null {
  // Kelas slot ikon dibaca dari CSS, bukan dari utilitas yang selalu kalah
  // spesifisitas - itu justru bagian yang tidak terlihat dari kode isian.
  if (cls.includes(`admin-input--slot-${side}`)) return slotRem(side);
  const sided = cls.match(new RegExp(`\\bp${side}-(\\d+(?:\\.\\d+)?)`));
  if (sided) return remToPx(sided[1]!);
  const both = cls.match(/\bpx-(\d+(?:\.\d+)?)/);
  return both ? remToPx(both[1]!) : null;
}

const label = (pair: Pair) =>
  `${pair.file}:${pair.line} <${pair.control}> + ikon ${pair.iconTag} ${pair.iconClass.match(ICON_OFFSET)?.[0] ?? ""}`;

test("halaman auth memang punya isian berikon yang perlu kolom ikon", () => {
  // Tanpa test ini, inventory bisa kosong karena salah parse dan semua
  // pengujian di bawahnya lulus tanpa memeriksa apa pun.
  const targets = pairs.filter((pair) =>
    ["auth-admin-panel.tsx", "Auth.tsx", "Admin.tsx"].some((name) =>
      pair.file.endsWith(name),
    ),
  );
  expect(targets.length).toBeGreaterThanOrEqual(7);
  expect(pairs.every((pair) => pair.size > 0)).toBe(true);
});

test("setiap isian berikon punya ruang teks yang cukup", () => {
  const kurang: string[] = [];
  for (const pair of pairs) {
    const ruang = paddingTerpakai(pair.controlClass, pair.side);
    if (ruang === null || ruang < ruangMinimum(pair)) {
      kurang.push(
        `${label(pair)} butuh ${ruangMinimum(pair)}px, terpakai ${ruang ?? "tidak ada"}`,
      );
    }
  }
  expect(kurang).toEqual([]);
});

test("kelas slot ikon dipakai di ruang pengelola dan di halaman publik", () => {
  const denganSlot = pairs.filter((pair) => pair.controlClass.includes("admin-input--slot"));
  expect(denganSlot.length).toBe(pairs.length);
  // Ikon passcode punya dua slot sekaligus: gembok di kiri, tombol mata di kanan.
  const duaSlot = pairs.filter(
    (pair) =>
      pair.controlClass.includes("admin-input--slot-left") &&
      pair.controlClass.includes("admin-input--slot-right"),
  );
  expect(duaSlot.length).toBeGreaterThanOrEqual(2);
});

test("ruang ikon di CSS ditulis sesudah padding shorthand yang mengalahkannya", () => {
  const deklarasi = CSS.indexOf(".admin-input--slot-left");
  const Shorthand = CSS.indexOf(".admin-confirm-content .admin-input {");
  expect(deklarasi).toBeGreaterThan(-1);
  // `.admin-input` di tiga scope ditulis dengan `padding` shorthand. Kalau slot
  // ikon muncul sebelum salah satunya, shorthand itu menimpanya lagi.
  expect(deklarasi).toBeGreaterThan(Shorthand);
});

test("ukuran slot ikon mengikuti geometri ikon yang dipakai repo", () => {
  const kiri = /admin-input--slot-left\s*\{[^}]*padding-left:\s*([\d.]+)rem/.exec(CSS);
  const kanan = /admin-input--slot-right\s*\{[^}]*padding-right:\s*([\d.]+)rem/.exec(CSS);
  expect(kiri?.[1]).toBeDefined();
  expect(kanan?.[1]).toBeDefined();

  const kiriPx = Number(kiri![1]) * 16;
  const kananPx = Number(kanan![1]) * 16;
  for (const pair of pairs) {
    const ruang = pair.side === "left" ? kiriPx : kananPx;
    expect(ruang, label(pair)).toBeGreaterThanOrEqual(ruangMinimum(pair));
  }
});

test("slot ikon punya selektor polos dan selektor ruang kerja", () => {
  // Tanpa selektor polos, isian halaman publik (yang memakai primitive
  // `Input`, bukan `.admin-input`) akan kehilangan ruang ikon dan kembali
  // menimpa placeholder-nya.
  for (const slot of ["admin-input--slot-left", "admin-input--slot-right"]) {
    expect(CSS).toMatch(new RegExp(`\\n\\.${slot},`));
    for (const scope of [
      "admin-workspace",
      "admin-dialog-content",
      "admin-confirm-content",
    ]) {
      expect(CSS).toContain(`.${scope} .${slot}`);
    }
  }
});

test("ikon di dalam isian tidak menahan klik", () => {
  // Ikon menumpuk di atas isian. Kalau tidak `pointer-events-none`, klik di
  // bagian paling kiri isian hilang - termasuk ketukan untuk menempatkan
  // kursor di awal baris.
  const penahan = pairs
    .filter((pair) => /left-|right-/.test(pair.iconClass))
    .filter(
      (pair) =>
        !pair.iconClass.includes("pointer-events-none") &&
        // Tombol mata memang harus bisa diklik; ia tombol, bukan ikon dekoratif.
        !["Eye", "EyeOff", "X"].includes(pair.iconTag),
    )
    .map((pair) => label(pair));
  expect(penahan).toEqual([]);
});

test("tombol lihat sandi tetap target sentuh 44px dan tidak menimpa teks", () => {
  const authAdmin = readFileSync("src/components/auth-admin-panel.tsx", "utf8");
  const authPublic = readFileSync("src/pages/Auth.tsx", "utf8");
  for (const source of [authAdmin, authPublic]) {
    const tombol = source.match(
      /className="absolute right-1 top-1\/2 flex size-(\d+)[^"]*"/,
    );
    expect(tombol?.[1], "tombol mata harus tetap size-11 (44px)").toBe("11");
    expect(source).toContain("admin-input--slot-right");
  }
});

test("utilitas padding yang pernah ditimpa tidak boleh kembali ke isian admin", () => {
  // `pl-11` di `.admin-input` terlihat benar di kode dan diam-diam tidak
  // berlaku. Kalau muncul lagi, isian admin kembali menimpa placeholder-nya.
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const pola = /(admin-input|\$\{inputClass\})[^"]*\b[pr][lx]-\d+[^"]*/g;
    const salah = [...src.matchAll(pola)].map((m) => `${file}: ${m[0].trim()}`);
    expect(salah).toEqual([]);
  }
});
