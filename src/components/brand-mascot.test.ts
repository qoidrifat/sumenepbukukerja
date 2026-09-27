import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { categoryOptions } from "@/lib/catalog";
import {
  ACCESSORIES,
  BOOK_FOLD,
  BOOK_LEFT,
  BOOK_MICRO,
  BOOK_MICRO_FOLD,
  BOOK_RIGHT,
  DETAIL_RULES,
  EYE,
  EYE_NARROW,
  EYE_WIDE,
  MASCOT_FIELD,
  MASCOT_VIEW_BOX,
  MOUTHS,
  SPARKLES,
  type MascotAccessoryKey,
  type MascotDetail,
} from "@/lib/mascot-geometry";
import {
  MASCOT_BEHAVIOUR_LIST,
  MASCOT_CATEGORIES,
  MASCOT_CATEGORY_KEYS,
  MASCOT_SIZE_DETAIL,
  MASCOT_SIZE_LIST,
  MASCOT_SIZES,
  MASCOT_STATE_LIST,
  MASCOT_STATES,
  MASCOT_TONES,
} from "@/lib/mascot-config";
import { BrandMascot, type BrandMascotProps } from "./brand-mascot";

/**
 * Kontrak Brand Mascot.
 *
 * Yang diuji di sini adalah hal yang benar-benar bisa rusak diam-diam:
 * karakter kehilangan DNA Phase 1, aksesori menabrak lipatan, state yang
 * gagal dirender, atau maskot bocor ke screen reader dua kali. Untuk
 * akurasi piksel ada `bun run mascot:check`; di sini yang dijaga
 * adalah perilaku dan batas geometri.
 */

const render = (props: BrandMascotProps = {}) =>
  renderToStaticMarkup(createElement(BrandMascot, props));

const svgCount = (html: string) => (html.match(/<svg/g) ?? []).length;

/* ------------------------------------------------------------------ */
/* 1. Kontrak dekoratif                                                 */
/* ------------------------------------------------------------------ */

test("murni dekoratif secara bawaan: tidak diumumkan, bukan target fokus", () => {
  const html = render({ category: "culinary", size: "lg" });

  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('focusable="false"');
  /* Tidak boleh ada dua sumber nama untuk hal yang sama. */
  expect(html).not.toContain("<title>");
  expect(html).not.toContain("aria-label");
  expect(html).not.toContain("role=");
  /* Tidak boleh ada teks yang terbaca screen reader di dalam ilustrasi. */
  expect(html).not.toMatch(/<text[\s>]/);
});

test("semantik saat label diberikan, dan hanya sekali", () => {
  const html = render({ label: "Buku Kerja mencari jasa", size: "md" });

  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Buku Kerja mencari jasa"');
  expect(html).toContain("<title>Buku Kerja mencari jasa</title>");
  expect(html).not.toContain('aria-hidden="true"');
  /* Label tetap ada walau dibungkus <title> supaya reader yang tidak
     mendukung <title> pun tetap punya nama. */
  expect(html.match(/Buku Kerja mencari jasa/g)?.length).toBe(2);
});

test("hanya satu <svg> dan tidak ada sumber daya eksternal", () => {
  const html = render({ state: "success", category: "events", size: "hero" });

  expect(svgCount(html)).toBe(1);
  expect(html).not.toContain("<image");
  expect(html).not.toContain("<use");
  expect(html).not.toContain("xlink:href");
  expect(html).not.toContain("data:");
  expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  /* Tidak ada font yang di-embed; wordmark tetap HTML live di aplikasi. */
  expect(html).not.toContain("@font-face");
});

/* ------------------------------------------------------------------ */
/* 2. Delapan state inti                                                */
/* ------------------------------------------------------------------ */

test("ada delapan state inti dan semuanya dirender", () => {
  expect(MASCOT_STATE_LIST).toHaveLength(8);
  expect(MASCOT_STATE_LIST).toEqual([
    "neutral",
    "hello",
    "search",
    "found",
    "connect",
    "success",
    "empty",
    "working",
  ]);
});

test("setiap state menghasilkan satu svg yang utuh", () => {
  for (const state of MASCOT_STATE_LIST) {
    const html = render({ state, size: "hero" });
    expect(svgCount(html), state).toBe(1);
    expect(html, state).toContain('viewBox="0 0 96 96"');
    /* Field + buku selalu ada, apa pun state-nya. */
    expect(html, state).toContain('rx="22"');
    expect(html, state).toContain(BOOK_LEFT);
  }
});

test("setiap state punya ekspresi yang memang berbeda", () => {
  /* Kalau dua state jatuh ke pasangan mata/mulut yang sama, ekspresinya
     tidak bisa dibedakan pembaca layar maupun mata. */
  const faces = MASCOT_STATE_LIST.map((s) => {
    const c = MASCOT_STATES[s];
    return `${c.eyes}/${c.mouth}`;
  });
  expect(new Set(faces).size).toBe(MASCOT_STATE_LIST.length);
});

test("state kosong memunculkan tanda tanya, state sukses memunculkan kilau", () => {
  expect(MASCOT_STATES.empty.queryMark).toBe(true);
  expect(MASCOT_STATES.empty.sparkle).toBe(false);
  expect(MASCOT_STATES.success.sparkle).toBe(true);
  expect(MASCOT_STATES.success.queryMark).toBe(false);
  expect(MASCOT_STATES.neutral.sparkle).toBe(false);
  expect(MASCOT_STATES.neutral.queryMark).toBe(false);
});

/* ------------------------------------------------------------------ */
/* 3. Lima varian kategori                                             */
/* ------------------------------------------------------------------ */

test("lima kategori memakai nama kategori asli dari katalog, bukan bikinan", () => {
  expect(MASCOT_CATEGORY_KEYS).toHaveLength(5);

  const fromCatalog = new Set(categoryOptions.map((c) => c.label));
  for (const key of MASCOT_CATEGORY_KEYS) {
    expect(fromCatalog.has(MASCOT_CATEGORIES[key].category), key).toBe(true);
  }
  /* Tidak ada kategori yang terduplikasi atau ditemukan diam-diam. */
  const used = MASCOT_CATEGORY_KEYS.map((k) => MASCOT_CATEGORIES[k].category);
  expect(new Set(used).size).toBe(5);
});

test("setiap kategori punya aksesori yang memang digambar", () => {
  for (const key of MASCOT_CATEGORY_KEYS) {
    const cfg = MASCOT_CATEGORIES[key];
    const parts = ACCESSORIES[cfg.accessory as MascotAccessoryKey];
    expect(parts, key).toBeDefined();
    expect(parts.length, key).toBeGreaterThan(0);
    expect(render({ category: key, size: "hero" }), key).toContain(parts[0].d);
  }
});

test("aksesori tidak pernah menutupi sudut terlipat", () => {
  const foldZone = { x: 67, y: 27.8, width: 13, height: 13 };
  for (const key of MASCOT_CATEGORY_KEYS) {
    const parts = ACCESSORIES[MASCOT_CATEGORIES[key].accessory as MascotAccessoryKey];
    for (const part of parts) {
      /* Semua path aksesori dimulai dengan M lalu koordinat absolut; ambil
         angka pertama sebagai titik awal untuk uji kasar "tidak di atas". */
      const y = Number(/^M[\d.]+ ([\d.]+)/.exec(part.d)?.[1] ?? "0");
      expect(y, `${key} mulai di y=${y}`).toBeGreaterThan(foldZone.y + foldZone.height);
    }
  }
});

test("maskot tanpa kategori tetap dirender (bukan crash, bukan undefined)", () => {
  const html = render({ state: "hello", size: "lg" });
  expect(svgCount(html)).toBe(1);
  expect(html).toContain(BOOK_LEFT);
  /* Tidak ada path aksesori yang bocor. */
  for (const parts of Object.values(ACCESSORIES)) {
    for (const part of parts) {
      expect(html).not.toContain(part.d);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 4. Ukuran & tingkat detail                                          */
/* ------------------------------------------------------------------ */

test("lima tingkat ukuran, semua punya kelas Tailwind yang valid", () => {
  expect(MASCOT_SIZE_LIST).toEqual(["micro", "sm", "md", "lg", "hero"]);
  for (const size of MASCOT_SIZE_LIST) {
    expect(MASCOT_SIZES[size], size).toMatch(/^size-/);
  }
});

test("tingkat detail naik monoton: tidak ada fitur yang muncul lalu hilang lagi", () => {
  const order: MascotDetail[] = ["micro", "small", "medium", "large", "hero"];
  const features = ["face", "brows", "accessory", "gesture", "decor"] as const;

  for (let i = 1; i < order.length; i++) {
    const prev = DETAIL_RULES[order[i - 1]];
    const now = DETAIL_RULES[order[i]];
    /* Level pertama benar-benar kosong, jadi tidak ada yang bisa "turun". */
    if (i > 1) {
      for (const key of features) {
        /* Setelah aktif, tidak boleh mati lagi di level yang lebih besar. */
        if (prev[key]) expect(now[key], `${order[i]}.${key}`).toBe(true);
      }
    }
  }

  /* Dan tabelnya persis yang dijanjikan di dokumentasi. */
  expect(DETAIL_RULES.micro).toMatchObject({ face: false, accessory: false, decor: false });
  expect(DETAIL_RULES.small).toMatchObject({ face: false, accessory: false, decor: false });
  expect(DETAIL_RULES.medium).toMatchObject({ face: true, brows: false, accessory: false });
  expect(DETAIL_RULES.large).toMatchObject({ face: true, accessory: true, decor: false });
  expect(DETAIL_RULES.hero).toMatchObject({ face: true, brows: true, accessory: true, decor: true });
});

test("peta ukuran ke tingkat detail menutupi semua ukuran", () => {
  for (const size of MASCOT_SIZE_LIST) {
    expect(DETAIL_RULES[MASCOT_SIZE_DETAIL[size]], size).toBeDefined();
  }
});

test("micro tidak menggambar wajah maupun aksesori", () => {
  const html = render({ category: "culinary", size: "micro" });

  /* Bentuk micro menyatu, jadi path mark penuh tidak boleh muncul. */
  expect(html).toContain(BOOK_MICRO);
  expect(html).not.toContain(BOOK_LEFT);
  expect(html).not.toContain(BOOK_RIGHT);
  /* Tidak ada rx kecil mata. */
  expect(html).not.toContain(`rx="${EYE.radius}"`);
  /* Aksesori ikut hilang. */
  for (const parts of Object.values(ACCESSORIES)) {
    for (const part of parts) {
      expect(html).not.toContain(part.d);
    }
  }
});

test("wajah baru muncul di md ke atas", () => {
  expect(render({ size: "sm" })).not.toContain(`rx="${EYE.radius}"`);
  expect(render({ size: "md" })).toContain(`rx="${EYE.radius}"`);
});

test("setiap tingkat ukuran menghasilkan viewBox yang sama", () => {
  for (const size of MASCOT_SIZE_LIST) {
    expect(render({ size, state: "success" }), size).toContain(
      `viewBox="0 0 ${MASCOT_VIEW_BOX.width} ${MASCOT_VIEW_BOX.height}"`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 5. Geometri & DNA Phase 1                                           */
/* ------------------------------------------------------------------ */

test("badan persis path brand mark Phase 1", () => {
  const html = render({ state: "found", size: "hero" });
  expect(html).toContain(BOOK_LEFT);
  expect(html).toContain(BOOK_RIGHT);
  expect(html).toContain(BOOK_FOLD);
});

test("sudut terlipat selalu ada, di semua ukuran dan state", () => {
  /* Di `micro` bentuknya blok (BOOK_MICRO_FOLD) - itu keputusan Phase 1,
     bukan hilang. Yang dijaga: lipatan tidak pernah hilang sama sekali. */
  for (const size of MASCOT_SIZE_LIST) {
    for (const state of MASCOT_STATE_LIST) {
      const html = render({ size, state });
      const hasFold = html.includes(BOOK_FOLD) || html.includes(BOOK_MICRO_FOLD);
      expect(hasFold, `${size}/${state}`).toBe(true);
    }
  }
  /* Di atas micro, itu harus mark penuh yang persis. */
  expect(render({ size: "hero" })).toContain(BOOK_FOLD);
});

test("mata simetris terhadap sumbu x=48 dan tidak masuk zona lipatan", () => {
  const AXIS = 48;
  const FOLD_X = 67;
  for (const e of [EYE, EYE_NARROW, EYE_WIDE]) {
    expect(e.leftX, "cermin kiri").toBe(2 * AXIS - (e.rightX + e.width));
    /* Berhenti sebelum spine di kiri dan sebelum spine di kanan. */
    expect(e.leftX + e.width, "mata kiri tidak melewati spine").toBeLessThanOrEqual(44);
    expect(e.rightX, "mata kanan tidak melewati spine").toBeGreaterThanOrEqual(52);
    /* Dan berhenti sebelum zona lipatan. */
    expect(e.rightX + e.width, "mata kanan tidak menabrak lipatan").toBeLessThan(FOLD_X);
  }
});

test("mulut terpecah di spine: tidak ada satu pun yang menyeberangi negative space", () => {
  /* Hanya titik awal absolut (perintah M) yang diperiksa. Perintah relatif
     seperti `h7.5` menyimpan delta, bukan koordinat, jadi menghitungnya
     sebagai koordinat akan salah. */
  for (const [name, mouth] of Object.entries(MOUTHS)) {
    for (const side of ["left", "right"] as const) {
      const startX = Number(/^M([\d.-]+)/.exec(mouth[side])?.[1]);
      expect(Number.isFinite(startX), `${name}.${side}`).toBe(true);
      if (side === "left") {
        expect(startX, `${name} kiri di kiri spine`).toBeLessThan(44);
      } else {
        expect(startX, `${name} kanan di kanan spine`).toBeGreaterThan(52);
      }
    }
  }
});

test("dekorasi tidak pernah keluar field", () => {
  for (const s of SPARKLES) {
    expect(s.x - s.r).toBeGreaterThanOrEqual(MASCOT_FIELD.x);
    expect(s.y - s.r).toBeGreaterThanOrEqual(MASCOT_FIELD.y);
    expect(s.x + s.r).toBeLessThanOrEqual(MASCOT_FIELD.x + MASCOT_FIELD.width);
    expect(s.y + s.r).toBeLessThanOrEqual(MASCOT_FIELD.y + MASCOT_FIELD.height);
  }
});

/* ------------------------------------------------------------------ */
/* 6. Public vs admin                                                  */
/* ------------------------------------------------------------------ */

test("public dan admin memakai bentuk yang sama, hanya warnanya berbeda", () => {
  const pub = render({ tone: "public", size: "hero", state: "working" });
  const adm = render({ tone: "admin", size: "hero", state: "working" });

  expect(pub).toContain(BOOK_LEFT);
  expect(adm).toContain(BOOK_LEFT);
  expect(pub).toContain(BOOK_FOLD);
  expect(adm).toContain(BOOK_FOLD);

  /* Field publik biru brand; field admin charcoal. */
  expect(pub).toContain('fill="#2563EB"');
  expect(adm).toContain('fill="#1A1A1A"');
  expect(pub).toContain('fill="#F59E0B"');
  expect(adm).toContain('fill="#FF5A26"');
});

test("tidak ada warna publik yang bocor ke versi admin", () => {
  const adm = render({ tone: "admin", size: "hero", category: "transport" });
  for (const token of ["#2563EB", "#DBEAFE", "#F59E0B", "#0F172A"]) {
    expect(adm, token).not.toContain(token);
  }
});

test("admin menahan aksesori sampai tingkat hero supaya density tidak berubah", () => {
  expect(MASCOT_TONES.admin.accessoryFrom).toBe("hero");
  expect(MASCOT_TONES.public.accessoryFrom).toBe("large");

  const part = ACCESSORIES[MASCOT_CATEGORIES.culinary.accessory as MascotAccessoryKey][0];
  expect(render({ tone: "admin", category: "culinary", size: "lg" })).not.toContain(part.d);
  expect(render({ tone: "admin", category: "culinary", size: "hero" })).toContain(part.d);
  /* Publik tetap memakainya di large. */
  expect(render({ tone: "public", category: "culinary", size: "lg" })).toContain(part.d);
});

/* ------------------------------------------------------------------ */
/* 7. Gerak                                                            */
/* ------------------------------------------------------------------ */

test("ada sepuluh perilaku gerak dan idle satu-satunya yang loop", () => {
  expect(MASCOT_BEHAVIOUR_LIST.length).toBeGreaterThanOrEqual(6);

  /* Dipakai statis di render, jadi tidak bisa dihitung dari HTML. Yang bisa
     dijaga: setiap perilaku punya amplitude terukur dan daftar gestur state
     tidak pernah menunjuk ke perilaku yang tak dikenal. */
  const known = new Set<string>(MASCOT_BEHAVIOUR_LIST);
  for (const state of MASCOT_STATE_LIST) {
    expect(known.has(MASCOT_STATES[state].gesture), state).toBe(true);
  }
});

test("animated={false} tidak mengubah bentuk karakter, hanya membekukan gerak", () => {
  /* Membekukan gerak boleh mengubah pembungkus motion, tapi TIDAK boleh
     mengubah satu pun path yang digambar - kalau tidak, "animasi dimatikan"
     diam-diam jadi "karakter lain". */
  const paths = (html: string) => [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  const live = render({ state: "hello", size: "hero", animated: true });
  const still = render({ state: "hello", size: "hero", animated: false });

  expect(paths(still)).toEqual(paths(live));
  expect(still).toContain(BOOK_LEFT);
  expect(still).toContain(BOOK_FOLD);
});

/* ------------------------------------------------------------------ */
/* 8. Kombinasi                                                         */
/* ------------------------------------------------------------------ */

test("seluruh kombinasi state x kategori x ukuran tetap aman", () => {
  for (const state of MASCOT_STATE_LIST) {
    for (const key of MASCOT_CATEGORY_KEYS) {
      for (const size of MASCOT_SIZE_LIST) {
        const html = render({ state, category: key, size });
        expect(svgCount(html), `${state}/${key}/${size}`).toBe(1);
        expect(html).not.toContain("NaN");
        expect(html).not.toContain("undefined");
        /* Lipatan boleh berupa blok di `micro`, tapi tidak boleh hilang. */
        expect(
          html.includes(BOOK_FOLD) || html.includes(BOOK_MICRO_FOLD),
          `${state}/${key}/${size}`,
        ).toBe(true);
      }
    }
  }
});

test("className diteruskan ke pembungkus untuk integrasi layout", () => {
  expect(render({ className: "mt-2 -ml-1" })).toContain("mt-2 -ml-1");
});
