import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { categoryOptions } from "@/lib/catalog";
import {
  CATEGORY_MASCOT_SIZES,
  categoryMascotTrait,
  CATEGORY_MASCOT_TRAITS,
  NEUTRAL_CATEGORY_MASCOT_TRAIT,
} from "@/lib/category-mascot-traits";
import { CategoryMascot } from "./category-mascot";

/**
 * Maskot kategori adalah hiasan: nama kategori selalu dibawa teks di
 * sebelahnya, jadi ilustrasi tidak boleh jadi target fokus, tidak boleh
 * membawa teks sendiri, dan tidak boleh menambah interaksi. Uji render statis
 * mengunci kontrak itu tanpa perlu DOM.
 */

const render = (props: Parameters<typeof CategoryMascot>[0]) =>
  renderToStaticMarkup(createElement(CategoryMascot, props));

const labels = categoryOptions.map((item) => item.label);

test("murni dekoratif: disembunyikan dari screen reader dan bukan target fokus", () => {
  const html = render({ category: "Kuliner" });

  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('focusable="false"');
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("tabindex");
  expect(html).not.toContain("<text");
  // Nama kategori tidak pernah ikut di dalam SVG: teks di sebelahnya tetap
  // satu-satunya sumber kebenaran yang diumumkan screen reader.
  for (const label of labels) {
    expect(html).not.toContain(label);
  }
});

test("SVG inline satu viewBox, tanpa aset eksternal dan tanpa SMIL", () => {
  const html = render({ category: "Transportasi" });

  expect((html.match(/<svg/g) ?? []).length).toBe(1);
  expect(html).toContain('viewBox="0 0 120 120"');
  expect(html).not.toContain("<image");
  expect(html).not.toContain("<use");
  expect(html).not.toContain("http");
  // Tidak ada animasi SMIL/loop React, semua gerak diserahkan ke Framer.
  expect(html).not.toContain("<animate");
  expect(html).not.toContain("repeat:");
  expect(html).not.toContain("setInterval");
});

test("taxonomi nyata: trait ada untuk tiap kategori katalog dan tidak lebih", () => {
  expect(Object.keys(CATEGORY_MASCOT_TRAITS).sort()).toEqual([...labels].sort());

  // Tidak ada aksesori yang dipakai dua kategori (ikon duplikat = identitas
  // kategori hilang) dan tidak ada kategori yang memakai aksesori netral.
  const accessories = Object.values(CATEGORY_MASCOT_TRAITS).map((t) => t.accessory);
  expect(new Set(accessories).size).toBe(accessories.length);
  expect(accessories).not.toContain(NEUTRAL_CATEGORY_MASCOT_TRAIT.accessory);

  // Aksen harus berbeda antar kategori dan tidak sama dengan warna netral.
  const accents = Object.values(CATEGORY_MASCOT_TRAITS).map((t) => t.accent);
  expect(new Set(accents).size).toBe(accents.length);
  expect(accents).not.toContain(NEUTRAL_CATEGORY_MASCOT_TRAIT.accent);
});

test("setiap kategori menghasilkan SVG berbeda dengan warna aksennya sendiri", () => {
  const htmls = labels.map((label) => ({ label, html: render({ category: label }) }));
  expect(new Set(htmls.map((item) => item.html)).size).toBe(labels.length);

  for (const { label, html } of htmls) {
    const trait = categoryMascotTrait(label);
    expect(html).toContain(trait.accent);
    expect(html).toContain(trait.accentInk);
  }
});

test("kategori di luar taxonomi jatuh ke maskot netral, tidak crash", () => {
  for (const value of ["Jasa Listrik", "", "   ", "kulinerExtra"]) {
    const trait = categoryMascotTrait(value);
    expect(trait).toBe(NEUTRAL_CATEGORY_MASCOT_TRAIT);

    const html = render({ category: value });
    expect((html.match(/<svg/g) ?? []).length).toBe(1);
    expect(html).toContain(NEUTRAL_CATEGORY_MASCOT_TRAIT.accent);
  }

  // Nilai non-string (data lama / `undefined`) juga harus aman.
  expect(categoryMascotTrait(undefined)).toBe(NEUTRAL_CATEGORY_MASCOT_TRAIT);
  expect(categoryMascotTrait(null)).toBe(NEUTRAL_CATEGORY_MASCOT_TRAIT);
});

test("label, slug, dan huruf besar memetakan ke trait yang sama", () => {
  const canonical = categoryMascotTrait("Servis Teknik");

  expect(categoryMascotTrait("servis-teknik")).toBe(canonical);
  expect(categoryMascotTrait("SERVIS TEKNIK")).toBe(canonical);
  expect(categoryMascotTrait("  Servis Teknik  ")).toBe(canonical);
  expect(categoryMascotTrait("Hajatan & Acara")).toBe(
    categoryMascotTrait("hajatan-acara"),
  );
  expect(categoryMascotTrait("Hajatan & Acara")).toBe(
    categoryMascotTrait("hajatan_&_acara"),
  );
});

test("context='public' memakai palet publik, tanpa token admin bocor", () => {
  const html = render({ category: "Kuliner" });

  expect(html).toContain("#FFFFFF"); // badan kartu
  expect(html).toContain("#E2E8F0"); // slate-200 papan
  expect(html).toContain("#334155"); // slate-700 garis
  expect(html).toContain("#0F172A"); // slate-900 mata
  expect(html).toContain("#FDE68A"); // amber-200 pipi

  for (const adminToken of ["#121212", "#FDFBF7", "#E7E5E4", "#E9B4A7"]) {
    expect(html).not.toContain(adminToken);
  }
});

test("context='admin' memakai token Warm Brutalism dan sudut nyaris siku", () => {
  const html = render({ category: "Kuliner", context: "admin" });

  expect(html).toContain("#121212"); // --admin-line
  expect(html).toContain("#FDFBF7"); // --admin-surface
  expect(html).toContain("#E7E5E4"); // --admin-stone
  expect(html).toContain("#E9B4A7"); // --admin-terracotta pipi
  expect(html).toContain('rx="2.5"');

  // Aksen kategori tetap sama supaya identitasnya terbaca di admin, tapi
  // palet dasar publik tidak ikut.
  expect(html).toContain(categoryMascotTrait("Kuliner").accent);
  expect(html).not.toContain("#FFFFFF");
  expect(html).not.toContain("#FDE68A");
});

test("wajah terbangun sama untuk semua kategori (DNA satu keluarga)", () => {
  for (const label of [...labels, "Tidak Dikenal"]) {
    const html = render({ category: label, animated: false });

    // Dua mata rounded-rect + dua pipi, simetris terhadap x=60.
    expect((html.match(/rx="3.5"/g) ?? []).length).toBe(2);
    expect(html).toContain('cx="38.5"');
    expect(html).toContain('cx="81.5"');
    // Dua busur mata tertutup, mulut tenang, dan senyum.
    expect(html).toContain("M44 47");
    expect(html).toContain("M66.5 47");
    expect(html).toContain("M55 57");
    expect(html).toContain("M53 54.5");
    // Badan + papan miring yang sama seperti dua maskot sebelumnya.
    expect(html).toContain('x="24" y="20" width="72" height="78"');
    expect(html).toContain('transform="rotate(-7 60 61)"');
  }
});

test("ekspresi 'focused' menambah alis, kategori lain tidak", () => {
  expect(render({ category: "Servis Teknik", animated: false })).toContain("M44 35.5");
  expect(render({ category: "Kuliner", animated: false })).not.toContain("M44 35.5");
});

test("mulut diam hanya untuk ekspresi netral; senyum tidak dihapus saat hover", () => {
  // Kategori ekspresif sudah tersenyum saat diam, jadi attribute opacity-nya
  // di-hardcode di path; kalau tidak, smile hover tidak akan terlihat.
  const warm = render({ category: "Kuliner", animated: false });
  expect(warm).toContain('d="M53 54.5c3 5.4 11 5.4 14 0Z" fill="#0F172A" opacity="1"');
  expect(warm).toContain('d="M55 57c3 2.4 7 2.4 10 0"');

  // Kategori netral menyimpan keduanya supaya cross-fade saat hover jalan.
  const neutral = render({ category: "Jasa Umum", animated: false });
  expect(neutral).toContain('d="M53 54.5c3 5.4 11 5.4 14 0Z" fill="#0F172A" opacity="0"');
  expect(neutral).toContain('d="M55 57c3 2.4 7 2.4 10 0"');

  // Saat animasi, atribut opacity harus dikosongkan agar group yang
  // mengaturnya yang memegang kendali.
  const animated = render({ category: "Jasa Umum" });
  expect(animated).toContain('<path d="M53 54.5c3 5.4 11 5.4 14 0Z" fill="#0F172A">');
});

test("ukuran xs dipakai untuk chip/filter dan tidak pernah membesar layout", () => {
  expect(CATEGORY_MASCOT_SIZES).toEqual({
    xs: "size-6",
    sm: "size-8",
    md: "size-14",
    lg: "size-24",
  });

  for (const [size, className] of Object.entries(CATEGORY_MASCOT_SIZES)) {
    const html = render({ category: "Jasa Umum", size: size as keyof typeof CATEGORY_MASCOT_SIZES });
    expect(html).toContain(className);
    expect(html).toContain("shrink-0");
  }
});

test("animated={false} melompati motion controller untuk daftar padat", () => {
  const still = render({ category: "Hajatan & Acara", animated: false });
  const animated = render({ category: "Hajatan & Acara", animated: true });

  expect((still.match(/<svg/g) ?? []).length).toBe(1);
  // Path statis tidak punya wrapper motion HTML, jadi tidak ada controller
  // Framer yang perlu allocating di kartu padat.
  expect(still).not.toContain("<div");
  expect(animated).toContain('<div class="size-full"');
  expect(still).not.toContain("style=\"transform");

  // Isi ilustrasinya tetap sama persis; yang berbeda hanya plumbing animasi.
  const svgOf = (html: string) => html.slice(html.indexOf("<svg"), html.lastIndexOf("</svg>") + 6);
  const normalize = (html: string) =>
    svgOf(html)
      .replace(/<g [^>]*>/g, "<g>")
      .replace(/ opacity="[^"]*"/g, "")
      .replace(/<g >/g, "<g>");
  expect(normalize(still)).toBe(normalize(animated));
});
