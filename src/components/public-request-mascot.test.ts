import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { PublicRequestMascot, PUBLIC_REQUEST_MASCOT_SIZE } from "./public-request-mascot";

/**
 * Maskot papan warga adalah hiasan: tidak boleh menjadi target fokus, tidak
 * boleh membawa teks, dan tidak boleh menambah interaksi yang mengubah data.
 * Uji render statis mengunci kontrak itu tanpa perlu DOM.
 */

const render = () => renderToStaticMarkup(createElement(PublicRequestMascot));

test("murni dekoratif: disembunyikan dari screen reader dan bukan target fokus", () => {
  const html = render();

  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('focusable="false"');
  // Tidak ada elemen interaktif di dalam ilustrasi.
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("tabindex");
  // Tidak ada teks di dalam SVG; semua informasi dibawa oleh copy empty state.
  expect(html).not.toContain("<text");
});

test("SVG inline satu viewBox, tanpa aset eksternal", () => {
  const html = render();
  const svgCount = (html.match(/<svg/g) ?? []).length;

  expect(svgCount).toBe(1);
  expect(html).toContain('viewBox="0 0 120 120"');
  // Tidak ada <image>/<use> yang menarik file dari jaringan.
  expect(html).not.toContain("<image");
  expect(html).not.toContain("<use");
  expect(html).not.toContain("http");
});

test("wajah dan badge '?' ikut ter-render sebagai satu karakter", () => {
  const html = render();
  const eyes = (html.match(/rx="3.5"/g) ?? []).length;
  const cheeks = (html.match(/r="3.4"/g) ?? []).length;

  // Dua mata + dua pipi.
  expect(eyes).toBe(2);
  expect(cheeks).toBe(2);
  // Dua busur mata tertutup + mulut (tenang dan senyum).
  expect(html).toContain("M43.5 69");
  expect(html).toContain("M67 69");
  expect(html).toContain("M55 79");
  expect(html).toContain("M53 77.5");
  // Badge tanda tanya = "menunggu warga pertama".
  expect(html).toContain("M96.4 22.4");
});

test("ukuran mengikuti breakpoint publik (mobile 88 / tablet 104 / desktop 120)", () => {
  expect(PUBLIC_REQUEST_MASCOT_SIZE).toContain("size-[88px]");
  expect(PUBLIC_REQUEST_MASCOT_SIZE).toContain("sm:size-[104px]");
  expect(PUBLIC_REQUEST_MASCOT_SIZE).toContain("lg:size-[120px]");
  expect(render()).toContain("size-[88px]");
});

test("palette mengikuti tema publik, bukan tema admin", () => {
  const html = render();

  expect(html).toContain("#FFFFFF"); // kartu putih
  expect(html).toContain("#E2E8F0"); // slate-200 berkas
  expect(html).toContain("#334155"); // slate-700 garis
  expect(html).toContain("#0F172A"); // slate-900 mata
  expect(html).toContain("#DBEAFE"); // blue-100 badge
  expect(html).toContain("#1D4ED8"); // blue-700 glyph
  expect(html).toContain("#FDE68A"); // amber-200 pipi

  // Token admin tidak boleh bocor ke halaman publik.
  for (const adminToken of ["#121212", "#F5F0E5", "#FFE662", "#E9B4A7"]) {
    expect(html).not.toContain(adminToken);
  }
});
