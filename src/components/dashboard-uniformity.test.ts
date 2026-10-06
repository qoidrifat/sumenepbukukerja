import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const warga = readFileSync(new URL("../pages/WargaDashboard.tsx", import.meta.url), "utf8");
const mitra = readFileSync(new URL("../pages/MitraDashboard.tsx", import.meta.url), "utf8");
// DEVIASI TERDOKUMENTASI dari brief verbatim (bukti di task-r6-report.md):
// - Grid 4-up mitra hidup di `mitra-stats.tsx` (const statGrid), bukan inline
//   di MitraDashboard.tsx — asersi grid mitra dibaca dari pemilik stringnya,
//   plus rantai komposisi <MitraStats di halaman.
// - <EmptyStateCard mitra hidup di komponen anak (claim-tracker/reviews),
//   bukan inline di MitraDashboard.tsx — dibaca dari pemiliknya.
// - Cross-link quick-access memakai onClick navigate("/mitra/dashboard")
//   (GlassIcons tak punya prop `to`), jadi asersi mencocokkan string path,
//   bukan literal `to="..."`.
const mitraStats = readFileSync(new URL("./mitra-stats.tsx", import.meta.url), "utf8");
const mitraClaimTracker = readFileSync(new URL("./mitra-claim-tracker.tsx", import.meta.url), "utf8");

test("grid 4 kolom di xl pada warga + mitra", () => {
  expect(warga).toContain("sm:grid-cols-2 xl:grid-cols-4");
  expect(mitra).toContain("<MitraStats");
  expect(mitraStats).toContain("sm:grid-cols-2 xl:grid-cols-4");
});

test("warga bebas sisa owner; mitra memakai bingkai seragam", () => {
  expect(warga).not.toContain("MitraListingManager");
  expect(warga).not.toContain("OwnerListingManager");
  expect(warga).not.toContain("OwnerRequestWorkspace");
  expect(mitra).toContain("<MitraClaimTracker");
  expect(mitraClaimTracker).toContain("<EmptyStateCard");
  expect(warga).toContain("<EmptyStateCard");
  expect(warga).not.toContain("border-dashed border-slate-300 bg-white shadow-none");
});

test("warga: kartu konsumen + quick-access 4 dengan cross-link mitra", () => {
  expect(warga).toContain("Permintaan saya");
  expect(warga).toContain('"Interaksi"');
  expect(warga).toContain('"/mitra/dashboard"');
  const wargaItems = (warga.match(/label: "/g) ?? []).length;
  expect(wargaItems).toBeGreaterThanOrEqual(4);
});
