import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./StaffDashboard.tsx", import.meta.url), "utf8");

test("empat kartu ringkas seragam + tautan workspace", () => {
  expect(src).toContain("export default function StaffDashboard");
  expect(src).toContain('to="/admin"');
  expect(src).toContain("useAdminVendors");
  expect(src).toContain("useReviewQueue");
  expect(src).toContain("useOpenReports");
  expect(src).toContain("staffRoleLongLabel");
});

test("read-only: tanpa mutasi", () => {
  expect(src).not.toContain("useMutation");
  expect(src).not.toContain("useCatalogActions");
});

test("kartu h-full + tanpa kelas admin", () => {
  expect(src).toContain("h-full");
  expect(src).toContain("#admin-triage");
  for (const marker of [
    "admin-btn",
    "admin-card",
    "admin-input",
    "admin-dialog",
    "admin-workspace",
    "admin-status",
    "admin-menu",
    "admin-check",
  ]) {
    expect(src, `tanpa kelas tema ${marker}`).not.toContain(marker);
  }
  expect(src).not.toContain("border-[#121212]");
});
