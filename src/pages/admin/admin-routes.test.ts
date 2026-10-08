import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("route /admin/sistem terdaftar dan sidebar memuat 5 item", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="sistem"');
  const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");
  for (const label of ["Ringkasan", "Katalog", "Moderasi", "Keamanan", "Sistem"]) {
    expect(shell).toContain(label);
  }
});

test("route /admin/keamanan me-render panel sesi, security log, error, dan audit", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="keamanan"');
  const page = readFileSync("src/pages/admin/KeamananPage.tsx", "utf8");
  for (const name of ["AdminSessionActions", "AdminSecurityLog", "AdminErrorReports", "AdminAuditLog"]) {
    expect(page).toContain(name);
  }
});

test("route /admin/moderasi me-render antrean review dan review laporan", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="moderasi"');
  const page = readFileSync("src/pages/admin/ModerasiPage.tsx", "utf8");
  expect(page).toContain("AdminReportReview");
  expect(page).toContain("useReviewQueue");
});
