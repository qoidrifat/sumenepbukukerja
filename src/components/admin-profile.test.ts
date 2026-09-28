import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Tombol profil di header ruang pengelola dan audit field tanggal/waktu.
 *
 * Dua hal di sini yang tidak bisa dibuktikan dari sisi server:
 *  1. Ikon orang benar-benar ada di sebelah label peran, dan dialognya
 *     memakai scope admin yang sama dengan form passcode. Tanpa scope itu,
 *     seluruh kelas admin di dalam dialog tidak akan cocok sama sekali.
 *  2. Field tanggal/waktu di tiap permukaan memakai kelas yang sesuai dengan
 *     tema halaman itu — dan TIDAK memakai kelas milik tema yang lain. Ikon
 *     kalender digambar sistem operasi, jadi satu-satunya kendali kita adalah
 *     selector yang tepat sasaran.
 */

const workspace = readFileSync(
  new URL("./admin-workspace.tsx", import.meta.url),
  "utf8",
);
const profile = readFileSync(new URL("./admin-profile.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../pages/Admin.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
const community = readFileSync(
  new URL("./community-widgets.tsx", import.meta.url),
  "utf8",
);

test("ikon orang ada di sebelah label peran di header", () => {
  const roleIndex = workspace.indexOf("admin-status admin-status-confirmed shrink-0");
  const profileIndex = workspace.indexOf("<AdminProfile />");
  expect(roleIndex).toBeGreaterThan(-1);
  expect(profileIndex).toBeGreaterThan(-1);
  // Aksesibel lewat nama, bukan hanya ikon.
  expect(profile).toContain('aria-label="Atur profil"');
  expect(profile).toContain("<UserRound");
});

test("tombol profil memakai token admin, bukan gaya tombol generik", () => {
  expect(profile).toContain("border-2 border-[#121212]");
  expect(profile).toContain("rounded-[2px]");
  expect(profile).toContain("shadow-[2px_2px_0_0_#121212]");
  expect(profile).toContain("hover:bg-[#FFE662]");
  // `shrink-0` wajib: header memakai justify-between, tanpa itu target
  // sentuhnya ikut gepeng.
  expect(profile).toMatch(/className="flex shrink-0 items-center/);
});

test("dialog profil memakai scope admin-dialog yang sama dengan form passcode", () => {
  expect(profile).toContain('className="admin-dialog-content"');
  expect(profile).toContain('overlayClassName="admin-dialog-overlay"');
  expect(profile).toContain("admin-input");
  expect(profile).toContain("admin-btn admin-btn-primary");
  // Warnanya memakai token admin, bukan palet baru.
  expect(profile).not.toMatch(/from "@\/components\/ui\/button"/);
});

test("email sengaja tidak bisa diedit di panel profil", () => {
  // Email ditampilkan, tapi tidak pernah jadi isian yang bisa diubah.
  expect(profile).toContain("{profile?.email}");
  expect(profile).not.toMatch(/value=\{profile\?\.email\}/);
  expect(profile).toContain("Email tidak bisa diubah di sini.");
});

test("field tanggal publik memakai varian publik, bukan varian admin", () => {
  expect(community).toContain("field-date field-date--public");
  expect(community).not.toContain("field-date--admin");
  expect(dashboard).toContain("field-datetime field-datetime--public");
  expect(dashboard).not.toContain("field-datetime--admin");
});

test("field tanggal admin memakai scope admin, bukan varian publik", () => {
  expect(adminPage).toContain('className="field-datetime"');
  expect(adminPage).not.toContain("field-datetime--public");
  // Scope admin di CSS yang membuat ikon kalender ikut tema Warm Brutalism.
  expect(css).toContain(".admin-workspace .field-datetime");
  expect(css).toContain(".admin-dialog-content .field-datetime");
});

test("indicators kalender diberi gaya untuk kedua tema", () => {
  // Tanpa ini, ikon bawaan sistem operasi tetap abu-abu di dalam form admin
  // yang semuanya bergaris 2px dan ber-shadow offset.
  expect(css).toContain("::-webkit-calendar-picker-indicator");
  expect(css).toContain("filter: invert(1)");
  expect(css).toContain("color-scheme: light");
  // Varian publik tidak membalikkan ikon, karena surface publik sudah terang
  // dan ikon system-nya juga gelap.
  expect(css).toContain(".field-date--public::-webkit-calendar-picker-indicator");
});

test("semua field tanggal punya batas bawah dan balikan bahasa Indonesia", () => {
  // Tanpa batas bawah, "dibutuhkan kapan" dan "perkiraan tersedia lagi" bisa
  // diisi masa lalu — yang tidak pernah masuk akal untuk keduanya.
  expect(community).toContain("min={todayISODate()}");
  expect(dashboard).toContain("min={minAvailableAtLocal()}");
  expect(adminPage).toContain("min={minNextAvailableAtLocal()}");
  // Kontrol native memakai lokalitas perangkat; baris balikan menutup celah
  // salah baca 09/10/2026.
  expect(community).toContain("formatNeededAt(neededAt)");
  expect(dashboard).toContain("formatDraftAvailability(draft.nextAvailableAt)");
  expect(adminPage).toContain("Tersimpan:");
});

test("batas bawah dihitung dari waktu lokal, bukan UTC", () => {
  // `toISOString()` selalu UTC: di WIB sebelum pukul 07.00 itu menghasilkan
  // tanggal KEMARIN, dan batas bawahnya ikut bergeser.
  for (const file of [community, dashboard, adminPage]) {
    expect(file).toContain("getTimezoneOffset()");
  }
});
