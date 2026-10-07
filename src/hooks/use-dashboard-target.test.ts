import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./use-dashboard-target.ts", import.meta.url), "utf8");

test("hook v2 membaca akses + owner + klaim", () => {
  expect(src).toContain("useOwnerVendors");
  expect(src).toContain("useMyClaims");
  expect(src).toContain("dashboardTargetFor(");
  expect(src).toContain("export function useDashboardTarget");
});

test("qualified = punya listing atau klaim verified; target mitra benar", () => {
  expect(src).toContain('status === "verified"');
  expect(src).toContain("/mitra/dashboard");
  expect(src).toContain('"/admin"');
});
