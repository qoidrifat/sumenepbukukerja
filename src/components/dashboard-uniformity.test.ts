import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const warga = readFileSync(new URL("../pages/WargaDashboard.tsx", import.meta.url), "utf8");
const staff = readFileSync(new URL("../pages/StaffDashboard.tsx", import.meta.url), "utf8");
const empty = readFileSync(new URL("./empty-state-card.tsx", import.meta.url), "utf8");

test("grid statistik 4 kolom di xl pada kedua dashboard", () => {
  expect(warga).toContain("sm:grid-cols-2 xl:grid-cols-4");
  expect(staff).toContain("sm:grid-cols-2 xl:grid-cols-4");
});

test("empty state memakai bingkai seragam, bukan dashed raksasa", () => {
  expect(empty).toContain("export function EmptyStateCard");
  expect(empty).toContain("h-full");
  expect(warga).toContain("<EmptyStateCard");
  expect(staff).toContain("<EmptyStateCard");
  // Dua dashed box yang diganti (string persis dari berkas saat ini):
  // favorit kosong `border-dashed border-slate-300 bg-white shadow-none`,
  // listing kosong `border border-dashed border-slate-300 bg-slate-50`.
  // Input foto owner (`border border-dashed border-slate-300 bg-white`, tanpa
  // `bg-slate-50`/`shadow-none`) SENGAJA dipertahankan — bukan empty state.
  expect(warga).not.toContain("border-dashed border-slate-300 bg-white shadow-none");
  expect(warga).not.toContain("border border-dashed border-slate-300 bg-slate-50");
});

test("quick access minimal 4 item", () => {
  const wargaItems = (warga.match(/label: "/g) ?? []).length;
  expect(wargaItems).toBeGreaterThanOrEqual(4);
});
