import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { BrandMascot } from "@/components/brand-mascot";
import { MASCOT_SIZES, type MascotSize } from "@/lib/mascot-config";

/**
 * Kontrak integrasi Phase 4 — tempat BrandMascot hidup di produk.
 *
 * `brand-mascot.test.ts` mengunci anatomi karakter (field, halaman, mata,
 * lipatan, state). File ini mengunci hal yang lain dan justru lebih
 * mudah rusak diam-diam: penempatan di permukaan yang salah, maskot yang
 * diumumkan dua kali, dua karakter bertumpuk di satu kartu, atau
 * integrasi yang diam-diam memakai ukuran di bawah lantai 96px yang
 * sudah diverifikasi di Phase 3.
 *
 * Aturan§8b (`public/brand/mascot-spec.md`) adalah HARD CONSTRAINT dan
 * di sini jadi allowlist, bukan perkiraan: setiap permukaan integrasi
 * harus punya latar yang persis ada di tabel "Diperbolehkan" §8b, atau
 * token yang terbukti ekuivalen secara numerik dengannya.
 */

const read = (path: string) => readFileSync(path, "utf8");

/* ------------------------------------------------------------------ */
/* 1. Allowlist §8b                                                    */
/* ------------------------------------------------------------------ */

/** Tabel "Diperbolehkan" di§8b, verbatim. */
const APPROVED_BACKDROPS = new Set([
  "bg-white", // White    #FFFFFF
  "bg-[#f7f8fc]", // Canvas  #F7F8FC
  "bg-[#DBEAFE]", // Blue Soft#DBEAFE
  "bg-[#FAF7EE]", // Parchment (admin)
  "bg-[#121212]", // Charcoal (admin)
  "bg-[#E0F2FE]",
  "bg-[#F1F5F9]",
]);

/**
 * Token yang TIDAK ada di tabel §8b, tetapi.hex-nya terukur identik
 * dengan satu yang ada. `bg-slate-50` dipakai EMPTY slot ("belum ada
 * listing milik Anda") yang sudah ada di produk sebelum Phase 4;
 * mengganti warnanya demi maskot berarti mengubah desain yang bukan
 * urusan Phase 4. Jaraknya ke Canvas diuji di bawah, jadi kalau palet
 * pernah berubah selisihnya akan ketahuan di sini, bukan di mata.
 */
const MEASURED_EQUIVALENTS: Record<string, { approved: string; hex: string }> = {
  "bg-slate-50": { approved: "bg-[#f7f8fc]", hex: "#F8FAFC" },
};

/**
 * Varian opacity dinormalkan dulu oleh `normalizeToken`, jadi
 * `bg-white/95` (kartu 404 di atas `notebook-paper` `#F7F8FC`) dibaca
 * sebagai White. Kompositnya memang putih: 0.95*255 + 0.05*247 = 255
 * di semua kanal.
 */

/** Biru-ke-biru. Field `#2563EB` di atas semua ini adalah near-miss §8b. */
const FORBIDDEN_BACKDROPS = [
  "bg-blue-50",
  "bg-blue-100",
  "bg-blue-200",
  "bg-blue-500",
  "bg-blue-600",
  "bg-blue-700",
  "bg-[#2563EB]",
];

/* ------------------------------------------------------------------ */
/* 2. Registry permukaan yang terintegrasi                              */
/* ------------------------------------------------------------------ */

type Surface = {
  /** Nama stabil supaya pesan kegagalan enak dibaca. */
  id: string;
  file: string;
  /** State yang dipakai di permukaan ini — tidak boleh berubah diam-diam. */
  state: string;
  /** Kenapa state itu, singkat. */
  why: string;
};

/**
 * Permukaan yang benar-benar memakai BrandMascot di produk. Satu
 * entri = satu alasan. Surface yang sengaja TIDAK memakai maskot ada
 * di registry `EXCLUDED` di bawah supaya keputusan itu ikut terkunci.
 */
const INTEGRATED: Surface[] = [
  {
    id: "not-found-404",
    file: "src/pages/NotFound.tsx",
    state: "empty",
    why: "Halaman hilang. Karakter, bukan ikon pustaka generik.",
  },
  {
    id: "empty-search",
    file: "src/pages/Landing.tsx",
    state: "empty",
    why: "Filter katalog tidak menghasilkan apa pun.",
  },
  {
    id: "owner-listings-empty",
    file: "src/pages/Dashboard.tsx",
    state: "empty",
    why: "Pemilik belum punya listing.",
  },
  {
    id: "saved-listings-empty",
    file: "src/pages/Dashboard.tsx",
    state: "hello",
    why: "Belum ada yang disimpan: sifatnya ajakan, bukan kekosongan.",
  },
  {
    id: "route-loading",
    file: "src/main.tsx",
    state: "working",
    why: "Suspense fallback saat pindah rute.",
  },
];

/**
 * Permukaan yang diaudit dan sengaja dibiarkan tanpa BrandMascot.
 * Test di bawah mengunci bahwa keputusan ini belum dibatalkan diam-diam.
 */
const EXCLUDED: { file: string; reason: string }[] = [
  { file: "src/components/community-widgets.tsx", reason: "Sudah pakai PublicRequestMascot" },
  {
    file: "src/components/community-notification-center.tsx",
    reason: "Panel operasional padat, bukan state kosong: maskot hanya menambah tinggi baris",
  },
  { file: "src/components/admin-governance.tsx", reason: "Sudah punya AdminEmptyMascot sendiri" },
  { file: "src/components/admin-empty-mascot.tsx", reason: "Karakter admin yang terpisah" },
  { file: "src/components/category-mascot.tsx", reason: "Sistem maskot Phase 1, tidak disentuh" },
  { file: "src/pages/Auth.tsx", reason: "Sudah pakai logo brand" },
];

/* ------------------------------------------------------------------ */
/* 3. Parser call-site yang cukup untuk audit statis                   */
/* ------------------------------------------------------------------ */

const MASCOT_CALL = /<BrandMascot\b([^>]*?)\/>/g;
const CLASS_ATTR = /className="([^"]*)"/g;
const BACKDROP_TOKEN = /bg-\[[^\]]+\]|bg-[a-z]+(?:-\d{2,3})?(?:\/\d{1,3})?/;

/** `bg-white/95` -> `bg-white`; varian opacity tetap surface yang sama. */
const normalizeToken = (token: string) => token.replace(/\/\d{1,3}$/, "");

type CallSite = {
  file: string;
  line: number;
  /** Baris sumber call-site-nya, untuk pesan kegagalan. */
  source: string;
  props: string;
  /** Offset karakter di file penuh, dipakai parser latar. */
  index: number;
};

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

const callSites = (file: string): CallSite[] => {
  const source = read(file);
  const lines = source.split("\n");

  return [...source.matchAll(MASCOT_CALL)].map((match) => ({
    file,
    line: lineOf(source, match.index ?? 0),
    source: lines[lineOf(source, match.index ?? 0) - 1].trim(),
    props: match[1],
    index: match.index ?? 0,
  }));
};

/**
 * Latar efektif sebuah call-site: elemen terakhir sebelum call-site itu
 * yang punya token `bg-*`. Dicari di atas seluruh teks file, bukan per
 * baris, karena tag pembuka sering warned multi-line (`motion.section`)
 * dan `className`-nya bisa jauh di baris berikutnya.
 *
 * Setiap elemen yang punya latar dihitung, tanpa kecuali tag container:
 * kalau suatu saat ada `<span className="bg-blue-50">` membungkus maskot,
 * audit ini harus menangkapnya, bukan memandikannya lewat.
 */
const effectiveBackdrop = (file: string, mascotIndex: number): string => {
  const source = read(file);

  let nearest = "";
  for (const match of source.matchAll(CLASS_ATTR)) {
    if ((match.index ?? 0) >= mascotIndex) break;
    const token = match[1].match(BACKDROP_TOKEN)?.[0];
    if (token) nearest = normalizeToken(token);
  }
  return nearest;
};

/* ------------------------------------------------------------------ */
/* 4. Utilitas warna                                                    */
/* ------------------------------------------------------------------ */

const parseHex = (hex: string) => {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
};

const channelDelta = (a: string, b: string) => {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
};

const relativeLuminance = (hex: string) => {
  const [r, g, b] = parseHex(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Rasio kontras WCAG field mascot terhadap latar permukaannya. */
const contrastRatio = (a: string, b: string) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const APPROVED_HEX: Record<string, string> = {
  "bg-white": "#FFFFFF",
  "bg-[#f7f8fc]": "#F7F8FC",
  "bg-[#DBEAFE]": "#DBEAFE",
  "bg-[#FAF7EE]": "#FAF7EE",
  "bg-[#121212]": "#121212",
  "bg-[#E0F2FE]": "#E0F2FE",
  "bg-[#F1F5F9]": "#F1F5F9",
};

/* ------------------------------------------------------------------ */
/* 5. Aturan §8b                                                        */
/* ------------------------------------------------------------------ */

test("setiap permukaan integrasi berdiri di atas permukaan yang §8b izinkan", () => {
  for (const surface of INTEGRATED) {
    const sites = callSites(surface.file).filter((site) => site.props.includes(`state="${surface.state}"`));
    expect(sites.length, `${surface.id}: call-site tidak ditemukan`).toBeGreaterThan(0);

    for (const site of sites) {
      const backdrop = effectiveBackdrop(site.file, site.index);

      expect(backdrop, `${surface.id} (${surface.file}:${site.line}) tidak punya latar yang bisa dibaca`).not.toBe("");
      expect(
        APPROVED_BACKDROPS.has(backdrop) || backdrop in MEASURED_EQUIVALENTS,
        `${surface.id} (${surface.file}:${site.line}) berada di atas "${backdrop}", yang tidak ada di allowlist §8b`,
      ).toBe(true);
    }
  }
});

test("tidak ada permukaan integrasi yang duduk di biru-ke-biru", () => {
  for (const surface of INTEGRATED) {
    for (const site of callSites(surface.file)) {
      const backdrop = effectiveBackdrop(site.file, site.index);
      expect(
        FORBIDDEN_BACKDROPS.includes(backdrop),
        `${surface.file}:${site.line} memakai maskot di atas "${backdrop}" — ruled out oleh §8b`,
      ).toBe(false);
    }
  }
});

test("setiap call-site maskot di produk terdaftar sebagai keputusan sadar", () => {
  const audited = new Set(INTEGRATED.map((surface) => `${surface.file}#${surface.state}`));
  const excluded = new Set(EXCLUDED.map((item) => item.file));

  for (const file of new Set([...INTEGRATED.map((s) => s.file), ...EXCLUDED.map((e) => e.file)])) {
    for (const site of callSites(file)) {
      const state = (site.props.match(/state="([^"]+)"/) ?? [])[1] ?? "netral";
      expect(
        audited.has(`${file}#${state}`),
        `${file}:${site.line} memakai state "${state}" yang tidak ada di registry integrasi`,
      ).toBe(true);
    }
  }

  expect(excluded.size, "registry surface yang dikecualikan tidak boleh kosong").toBe(EXCLUDED.length);
});

test("token ekuivalen tetap ekuivalen kalau palet berubah", () => {
  for (const [token, expected] of Object.entries(MEASURED_EQUIVALENTS)) {
    const delta = channelDelta(expected.hex, APPROVED_HEX[expected.approved]);
    expect(
      delta,
      `${token} (${expected.hex}) sudah melenceng ${delta}/255 dari ${expected.approved} (${APPROVED_HEX[expected.approved]}) — allowlist §8b tidak boleh diperluas`,
    ).toBeLessThanOrEqual(2);
  }
});

test("field maskot tetap biru pekat, jadi kontrasnya ke setiap permukaan minimal 3:1", () => {
  /* 1.4.11 Non-text Contrast. Ini yang membuat §8b terukur: field opaque
     `#2563EB` harus tetap terbaca sebagai bentuk, bukan menyatu. */
  const html = renderToStaticMarkup(createElement(BrandMascot, { size: "md" }));
  expect(html, "field public tone harus tetap #2563EB").toContain("#2563EB");

  for (const surface of INTEGRATED) {
    for (const site of callSites(surface.file)) {
      const backdrop = effectiveBackdrop(site.file, site.index);
      const hex = APPROVED_HEX[backdrop] ?? MEASURED_EQUIVALENTS[backdrop]?.hex;
      if (!hex) continue;

      const ratio = contrastRatio("#2563EB", hex);
      expect(
        ratio,
        `${surface.id} (${surface.file}:${site.line}) kontras field/latar hanya ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 6. Kontrak aksesibilitas per permukaan                              */
/* ------------------------------------------------------------------ */

test("semua integrasi produk bersifat dekoratif, pesan tetap dibawa teks", () => {
  for (const surface of INTEGRATED) {
    const lines = read(surface.file).split("\n");

    for (const site of callSites(surface.file)) {
      expect(
        site.props.includes("label="),
        `${surface.id} (${surface.file}:${site.line}) diberi label — teks di sekitarnya sudah menyebut pesan yang sama`,
      ).toBe(false);

      const html = renderToStaticMarkup(
        createElement(BrandMascot, {
          state: (site.props.match(/state="([^"]+)"/) ?? [])[1] as never,
          size: ((site.props.match(/size="([^"]+)"/) ?? [])[1] ?? "md") as MascotSize,
        }),
      );
      expect(html, `${surface.id} harus aria-hidden`).toContain('aria-hidden="true"');
      expect(html, `${surface.id} tidak boleh punya <title> tanpa label`).not.toContain("<title>");

      /* Kalau tidak ada teks setelah maskot, pesan state-nya jadi tidak
         tersampaikan dan maskot berubah jadi dekorasi. Baris yang sama
         ikut dihitung karena beberapa call-site digabung satu baris. */
      const after = lines.slice(site.line - 1, site.line + 5).join(" ");
      expect(
        after.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length,
        `${surface.id} tidak punya pesan teks di sekitar maskot`,
      ).toBeGreaterThan(20);
    }
  }
});

test("tidak ada dua maskot bertumpuk di satu permukaan", () => {
  for (const file of new Set([...INTEGRATED.map((surface) => surface.file), ...EXCLUDED.map((item) => item.file)])) {
    const lines = callSites(file);
    for (const [index, site] of lines.entries()) {
      for (const other of lines.slice(index + 1)) {
        expect(
          Math.abs(other.line - site.line),
          `${file}: maskot di baris ${site.line} dan ${other.line} bertumpuk`,
        ).toBeGreaterThan(3);
      }
    }
  }
});

test("permukaan yang dikecualikan tidak diam-diam memunculkan maskot brand", () => {
  for (const item of EXCLUDED) {
    expect(
      callSites(item.file).length,
      `${item.file} dikecualikan dengan alasan "${item.reason}", tapi memuat BrandMascot`,
    ).toBe(0);
  }
});

/* ------------------------------------------------------------------ */
/* 7. Lantai responsif                                                 */
/* ------------------------------------------------------------------ */

test("setiap integrasi produk tidak pernah di bawah 96px yang sudah diverifikasi", () => {
  /* Verdict Phase 3 "A — MASCOT" diukur pada 96px. Di bawah itu detail
     wajah tidak dijamin terbaca, jadi produk tidak boleh memilih
     `sm`/`micro` untuk state yang sedang dibaca pengguna. */
  const belowFloor: MascotSize[] = ["micro", "sm"];

  for (const surface of INTEGRATED) {
    for (const site of callSites(surface.file)) {
      const size = ((site.props.match(/size="([^"]+)"/) ?? [])[1] ?? "md") as MascotSize;
      expect(
        belowFloor.includes(size),
        `${surface.id} (${surface.file}:${site.line}) memakai size="${size}", di bawah lantai 96px`,
      ).toBe(false);
    }
  }
});

test("peta ukuran responsif Phase 3 tidak bergeser", () => {
  expect(MASCOT_SIZES.md, "md harus 96px di bawah 640px").toBe("size-24 sm:size-28 xl:size-36");
  expect(MASCOT_SIZES.md).toContain("sm:size-28");
  expect(MASCOT_SIZES.md).toContain("xl:size-36");
});

test("loading rute dibekukan: splash singkat tidak perlu animasi", () => {
  const site = callSites("src/main.tsx").find((item) => item.props.includes('state="working"'));
  expect(site, "RouteLoading harus memakai state working").toBeDefined();
  expect(site?.props, "RouteLoading tidak boleh beranimasi").toContain("animated={false}");
});

/* ------------------------------------------------------------------ */
/* 8. Aturan tidak boleh hilang diam-diam                               */
/* ------------------------------------------------------------------ */

test("§8b masih tertulis sebagai HARD CONSTRAINT di spec", () => {
  const spec = read("public/brand/mascot-spec.md");
  expect(spec).toContain("Placement rule");
  expect(spec).toContain("#2563EB");
  expect(spec).toContain("#F7F8FC");
});
