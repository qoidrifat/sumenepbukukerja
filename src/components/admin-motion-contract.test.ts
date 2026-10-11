import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak gerak ruang pengelola (transisi opsi A + header sticky + drawer menu).
 *
 * Semua asersi = string pada sumber, pola yang sama dengan
 * `admin-routes.test.ts` dan `admin-theme-contract.test.ts`: kontrak
 * dipatahkan oleh penghapusan kalimat kunci, bukan oleh perubahan gaya
 * bebas. Opsi A dipilih pengguna di layar companion: zoom kontinuitas
 * 1.100ms (sadar melampaui HIG ≤350ms) + kilau Liquid Glass.
 *
 * Sidebar diganti menu tarik-turun di AdminHeader (permintaan modernisasi):
 * sticky top-0 di shell, jarak ~50px ke bingkai konten, item fitur di menu.
 */

const read = (path: string) => readFileSync(path, "utf8");

test("header sticky menempel di puncak viewport dengan jarak ke konten", () => {
  const workspace = read("src/components/admin-workspace.tsx");
  // Sticky top-0 = mentok tepi atas halaman.
  expect(workspace).toContain("sticky top-0");
  const shell = read("src/pages/admin/AdminShell.tsx");
  // Jarak ~50px antara header dan bingkai konten utama.
  expect(shell).toContain("pt-[50px]");
  // Header dirender di shell, bukan per halaman.
  expect(shell).toContain("<AdminHeader");
});

test("drawer menu memakai framer-motion dan hormati reduced motion", () => {
  const workspace = read("src/components/admin-workspace.tsx");
  expect(workspace).toContain("AnimatePresence");
  expect(workspace).toContain("useReducedMotion");
  // Panel menu menempel di wrapper relative header; max-height agar baris
  // terakhir tetap terjangkau di layar pendek.
  const css = read("src/index.css");
  expect(css).toContain(".admin-menu");
  expect(css).toContain("max-height: min(28rem");
});

test("transisi opsi A: zoom 1100ms dua arah + kurva yang disepakati", () => {
  const css = read("src/index.css");
  expect(css).toContain("::view-transition-old(root)");
  expect(css).toContain("::view-transition-new(root)");
  expect(css).toContain("@keyframes admin-vt-out");
  expect(css).toContain("@keyframes admin-vt-in");
  expect(css).toContain("1.1s");
  expect(css).toContain("cubic-bezier(0.22, 1, 0.36, 1)");
  expect(css).toContain("cubic-bezier(0.4, 0, 0.2, 1)");
});

test("kilau Liquid Glass menyusul zoom, mati saat reduced motion", () => {
  const css = read("src/index.css");
  expect(css).toContain("@keyframes admin-sweep");
  expect(css).toContain(".admin-page-sweep.is-on");
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  expect(reduce).toContain("::view-transition-old(root)");
  expect(reduce).toContain(".admin-page-sweep");
  expect(css).toContain("html.admin-vt-active");
});

test("AdminShell memicu VT manual karena BrowserRouter tak meneruskan opsi", () => {
  // Mode deklaratif `BrowserRouter` + `<Routes>` membuang prop
  // `viewTransition` pada Link (navigator.push tak punya kanal opsi), jadi
  // intersepsi klik tautan `/admin` dilakukan manual di shell.
  const shell = read("src/pages/admin/AdminShell.tsx");
  expect(shell).toContain("document.startViewTransition");
  expect(shell).toContain("flushSync");
  expect(shell).toContain('startsWith("/admin/")');
  expect(shell).toContain("prefers-reduced-motion: reduce");
  expect(shell).toContain("admin-vt-active");
  expect(shell).toContain("admin-page-sweep");
});

test("tautan pembawa state router lolos dari intersepsi", () => {
  // `navigate(href)` hasil intersepsi tidak membawa `state` Link — tanpa
  // opt-out, shortcut antrean di hero kehilangan filter awal katalognya.
  const hero = read("src/components/admin-workspace-hero.tsx");
  expect(hero).toContain("data-no-view-transition");
  expect(hero).toContain("state={{ queueFilter:");
});

test("menu header memuat lima fitur navigasi sebagai NavLink", () => {
  const workspace = read("src/components/admin-workspace.tsx");
  // Fitur pindah dari sidebar ke menu SuperAdmin.
  expect(workspace).toContain("featureNav");
  expect(workspace).toContain("NavLink");
  for (const label of ["Ringkasan", "Katalog", "Moderasi", "Keamanan", "Sistem"]) {
    expect(workspace).toContain(label);
  }
  // NavLink rute aktif disorot lewat aria-current.
  const css = read("src/index.css");
  expect(css).toContain('.admin-menu-item[aria-current="page"]');
});
