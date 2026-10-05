import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("tiga rute dashboard terdaftar dengan guard yang benar", () => {
  expect(main).toContain('path="/warga/dashboard"');
  expect(main).toContain("<WargaDashboard />");
  expect(main).toContain('path="/staff/dashboard"');
  expect(main).toContain("<RequireStaffGate>");
  expect(main).toContain("<StaffDashboard />");
  expect(main).toContain('path="/dashboard"');
});

test("redirect /dashboard mempertahankan hash tujuan", () => {
  expect(main).toContain("hash: location.hash");
  expect(main).toContain('pathname: "/warga/dashboard"');
  expect(main).toContain("replace");
});

test("rute lama tidak lagi me-render Dashboard langsung", () => {
  expect(main).not.toContain('import("./pages/Dashboard.tsx")');
  expect(main).toContain('import("./pages/WargaDashboard.tsx")');
});

test("auth tetap mengarah ke /dashboard (ikut redirect otomatis)", () => {
  expect(main).toContain('redirectAfterAuth="/dashboard"');
});
