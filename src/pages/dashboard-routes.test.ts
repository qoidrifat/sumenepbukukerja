import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("rute mitra terdaftar; gate hidup di dalam halaman", () => {
  expect(main).toContain('path="/mitra/dashboard"');
  expect(main).toContain("<MitraDashboard />");
  expect(main).toContain('path="/dashboard"');
  expect(main).toContain('path="/warga/dashboard"');
  expect(main).not.toContain("RequireMitraGate");
});

test("jejak staff hilang total", () => {
  expect(main).not.toContain("/staff/dashboard");
  expect(main).not.toContain("StaffDashboard");
  expect(main).not.toContain("RequireStaffGate");
});

test("redirect preservasi-hash tetap", () => {
  expect(main).toContain("hash: location.hash");
});
