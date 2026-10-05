import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./account-menu.tsx", import.meta.url), "utf8");

test("tepat tiga item: Dashboard, Profil, Keluar", () => {
  expect(src).toContain("<span>Dashboard</span>");
  expect(src).toContain("<span>Profil</span>");
  expect(src).toContain("<span>Keluar</span>");
  expect(src).toContain("<DropdownMenuItem");
});

test("Dashboard role-aware; loading menonaktifkan", () => {
  expect(src).toContain("useDashboardTarget()");
  expect(src).toContain("aria-label={`Menu akun");
  expect(src).toContain("disabled");
});

test("Profil membuka dialog; Keluar signOut lalu ke beranda", () => {
  expect(src).toContain("setProfileOpen(true)");
  expect(src).toContain("await signOut()");
  expect(src).toContain('navigate("/")');
});

test("dialog hidup DI LUAR DropdownMenu (pelajaran admin-profile)", () => {
  const menuEnd = src.indexOf("</DropdownMenu>");
  const dialogIndex = src.indexOf("<ProfileDialog");
  expect(menuEnd).toBeGreaterThan(-1);
  expect(dialogIndex).toBeGreaterThan(menuEnd);
});

test("tema publik + target sentuh + tanpa kelas admin", () => {
  expect(src).toContain("focusRing");
  expect(src).toContain("min-h-12");
  expect(src).not.toContain("admin-");
  expect(src).not.toContain("border-[#121212]");
});
