import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./mitra-reports.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/catalog-store.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/MitraDashboard.tsx", import.meta.url), "utf8");

test("hook useVendorReports membaca query milik pemilik", () => {
  expect(store).toContain("export function useVendorReports");
  expect(store).toContain("api.community.listMyVendorReports");
  expect(src).toContain("useVendorReports");
});

test("daftar berlabel aksesibel dan memuat nama, alasan, rincian, tanggal", () => {
  expect(src).toContain('aria-label="Laporan terhadap listing"');
  expect(src).toContain("vendorName");
  expect(src).toContain("reason");
  expect(src).toContain("details");
  expect(src).toContain('"id-ID"');
});

test("badge keempat status dengan label Indonesia", () => {
  for (const label of ["Terbuka", "Ditinjau", "Selesai", "Ditutup"]) {
    expect(src, `badge ${label}`).toContain(label);
  }
  expect(src).toContain("open");
  expect(src).toContain("reviewing");
  expect(src).toContain("resolved");
  expect(src).toContain("dismissed");
});

test("identitas pelapor tak disebut di komponen", () => {
  // Aturan keras: pengenal `reporterId` tidak boleh muncul di komponen dalam
  // bentuk apa pun — server sudah membuangnya dari proyeksi query.
  expect(src.toLowerCase()).not.toContain("reporterid");
});

test("kosong memakai EmptyStateCard dengan aksi katalog", () => {
  expect(src).toContain("<EmptyStateCard");
  expect(src).toContain("Belum ada laporan");
  expect(src).toContain("Lihat katalog");
  expect(src).toContain("useNavigate");
});

test("tanpa maskot literal, tanpa kelas admin; read-only tanpa mutation", () => {
  expect(src).not.toContain("<BrandMascot");
  expect(src).not.toContain("border-[#121212]");
  for (const marker of ["admin-btn", "admin-card", "admin-input", "admin-dialog", "admin-workspace", "admin-status", "admin-menu", "admin-check"]) {
    expect(src, `tanpa kelas tema ${marker}`).not.toContain(marker);
  }
  // Read-only: satu-satunya kontrol adalah aksi EmptyStateCard (tema publik milik kartu itu).
  expect(src).not.toContain("useMutation");
});

test("posisi di halaman: setelah tracker klaim, sebelum gerbang mitra", () => {
  expect(page).toContain("<MitraReports");
  expect(page.indexOf("<MitraReports")).toBeGreaterThan(page.indexOf("<MitraClaimTracker"));
  expect(page.indexOf("<MitraReports")).toBeLessThan(page.indexOf("<RequireMitraGate"));
});
