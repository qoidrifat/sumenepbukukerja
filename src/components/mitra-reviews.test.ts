import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./mitra-reviews.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../pages/VendorProfile.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/catalog-store.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../lib/catalog.ts", import.meta.url), "utf8");

test("form memakai mutation replyReview, bukan mutation lain", () => {
  expect(src).toContain("api.vendors.replyReview");
  expect(src).toContain("useMutation");
  // Balasan bukan ulasan baru, bukan moderasi laporan.
  expect(src).not.toContain("addReview");
  expect(src).not.toContain("updateReport");
});

test("tiap baris tanpa reply: textarea berlabel + tombol Balas yang mati saat kosong", () => {
  expect(src).toContain("Balas ulasan dari");
  expect(src).toContain("aria-label");
  expect(src).toContain("<textarea");
  expect(src).toContain("Balas");
  expect(src).toContain('type="submit"');
  expect(src, "tombol mati saat draf kosong").toContain("trim()");
  expect(src).toContain("disabled");
});

test("baris yang sudah dibalas: tampil + tombol Ubah untuk edit", () => {
  expect(src).toContain("Ubah");
  expect(src).toContain('type="button"');
  expect(src).toContain("item.reply");
});

test("error inline untuk baca layar, sukses lewat query reaktif", () => {
  expect(src).toContain('role="alert"');
  // Query `useVendor` reaktif: tidak ada pemanggilan refetch manual.
  expect(src).not.toContain("refetch(");
});

test("tema publik: focusRing, min-h, tanpa maskot/kelas admin", () => {
  expect(src).toContain("focusRing");
  expect(src).toContain("min-h-12");
  expect(src).not.toContain("<BrandMascot");
  expect(src).not.toContain("border-[#121212]");
  for (const marker of ["admin-btn", "admin-card", "admin-input", "admin-dialog", "admin-workspace", "admin-status", "admin-menu", "admin-check"]) {
    expect(src, `tanpa kelas tema ${marker}`).not.toContain(marker);
  }
});

test("profil publik menampilkan balasan di bawah ulasannya", () => {
  expect(profile).toContain("Tanggapan pemilik usaha");
  expect(profile).toContain("border-emerald-200");
  expect(profile).toContain("bg-emerald-50");
  expect(profile).toContain("item.reply");
  expect(profile).toContain('"id-ID"');
  // Tanpa reply → tak render apa-apa, bukan placeholder.
  expect(profile).not.toContain("Belum ada tanggapan");
});

test("profil publik tanpa maskot/kelas admin pada blok balasan", () => {
  expect(profile).not.toContain("border-[#121212]");
  for (const marker of ["admin-btn", "admin-card", "admin-input", "admin-dialog", "admin-workspace", "admin-status", "admin-menu", "admin-check"]) {
    expect(profile, `tanpa kelas tema ${marker}`).not.toContain(marker);
  }
});

test("tipe review membawa reply opsional", () => {
  expect(store).toContain("reply?");
  expect(catalog).toContain("reply?");
});
