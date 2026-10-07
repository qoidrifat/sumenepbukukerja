import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./MitraDashboard.tsx", import.meta.url), "utf8");

test("komposisi mitra: manager selalu, gate di dalam, notifikasi di luar", () => {
  expect(src).toContain("export default function MitraDashboard");
  expect(src).toContain("<MitraListingManager");
  expect(src).toContain("<RequireMitraGate");
  expect(src).toContain("<OwnerRequestWorkspace");
  expect(src).toContain("<NotificationCenter");
  expect(src).toContain("Ruang mitra");
});

test("urutan: manager di atas gate, notifikasi di bawah gate", () => {
  const manager = src.indexOf("<MitraListingManager");
  const gate = src.indexOf("<RequireMitraGate");
  const gateEnd = src.indexOf("</RequireMitraGate>");
  const notif = src.indexOf("<NotificationCenter");
  expect(manager).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(manager);
  expect(gateEnd).toBeGreaterThan(gate);
  expect(notif).toBeGreaterThan(gateEnd);
});

test("read-only guard halaman: tanpa mutation langsung", () => {
  expect(src).not.toContain("useMutation");
});

test("tanpa kelas admin, tanpa maskot literal baru", () => {
  expect(src).not.toContain("border-[#121212]");
  expect(src).not.toContain("<BrandMascot");
  for (const marker of ["admin-btn", "admin-card", "admin-input", "admin-dialog", "admin-workspace", "admin-status", "admin-menu", "admin-check"]) {
    expect(src, `tanpa kelas tema ${marker}`).not.toContain(marker);
  }
});

test("pelacak klaim + ulasan terpasang", () => {
  expect(src).toContain("<MitraClaimTracker");
  expect(src).toContain("<MitraReviews");
});

test("posisi: tracker setelah manager sebelum gate; reviews di dalam gate", () => {
  expect(src.indexOf("<MitraClaimTracker")).toBeGreaterThan(src.indexOf("<MitraListingManager"));
  expect(src.indexOf("<MitraClaimTracker")).toBeLessThan(src.indexOf("<RequireMitraGate"));
  expect(src.indexOf("<MitraReviews")).toBeGreaterThan(src.indexOf("<RequireMitraGate"));
});

test("laporan listing tampil setelah tracker klaim, sebelum gerbang mitra", () => {
  expect(src).toContain("<MitraReports");
  expect(src.indexOf("<MitraReports")).toBeGreaterThan(src.indexOf("<MitraClaimTracker"));
  expect(src.indexOf("<MitraReports")).toBeLessThan(src.indexOf("<RequireMitraGate"));
});
