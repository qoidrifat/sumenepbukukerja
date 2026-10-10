import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak gerak ruang pengelola (transisi opsi A + sticky + pin + drawer).
 *
 * Semua asersi = string pada sumber, pola yang sama dengan
 * `admin-routes.test.ts` dan `admin-theme-contract.test.ts`: kontrak
 * dipatahkan oleh penghapusan kalimat kunci, bukan oleh perubahan gaya
 * bebas. Opsi A dipilih pengguna di layar companion: zoom kontinuitas
 * 1.100ms (sadar melampaui HIG ≤350ms) + kilau Liquid Glass.
 */

const read = (path: string) => readFileSync(path, "utf8");

test("sidebar desktop menempel mengikuti padding kontainer sejak 768px", () => {
  const sidebar = read("src/components/admin-sidebar.tsx");
  expect(sidebar).toContain("min-[768px]:sticky");
  // Offset meniru `sm:py-7 lg:py-10` pada bingkai shell: tepi sidebar dan
  // tepi bingkai berhenti di garis yang sama, bukan menempel di viewport.
  expect(sidebar).toContain("sm:top-7 lg:top-10");
  const shell = read("src/pages/admin/AdminShell.tsx");
  expect(shell).toContain("sm:py-7");
  expect(shell).toContain("lg:py-10");
});

test("tombol hamburger mobile ikut menempel tepat di bawah header", () => {
  const sidebar = read("src/components/admin-sidebar.tsx");
  // Tinggi header = safe-area + baris min-h-16 (64px) + bar gradien h-2
  // dengan border-t-2 (8+2px) + border-b-2 (2px) = 76px = 4.75rem.
  expect(sidebar).toContain("top-[calc(env(safe-area-inset-top)+4.75rem)]");
  expect(sidebar).toContain("z-30");
});

test("efek pin: sentinel di AdminShell, kelas admin-stuck, bayangan di CSS", () => {
  const shell = read("src/pages/admin/AdminShell.tsx");
  expect(shell).toContain("IntersectionObserver");
  expect(shell).toContain("pinRef");
  expect(shell).toContain("pinned={pinned}");
  const sidebar = read("src/components/admin-sidebar.tsx");
  expect(sidebar).toContain("admin-stuck");
  const css = read("src/index.css");
  expect(css).toContain(".admin-workspace .admin-stuck");
  // Bayangan hanya muncul setelah menempel; transisinya hormati gerak minimal.
  expect(css).toContain(".admin-workspace .admin-stuck > .admin-btn");
});

test("drawer mobile teranimasi ala Apple lewat framer-motion", () => {
  const sidebar = read("src/components/admin-sidebar.tsx");
  expect(sidebar).toContain("AnimatePresence");
  expect(sidebar).toContain("motion.aside");
  expect(sidebar).toContain("useReducedMotion");
  // Panel yang menempel di wrapper sticky harus bisa di-scroll pada layar
  // pendek (mis. lanskap), kalau tidak baris terakhir tak terjangkau.
  expect(sidebar).toContain("max-h-[calc(100dvh-");
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
