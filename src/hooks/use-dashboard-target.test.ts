import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./use-dashboard-target.ts", import.meta.url), "utf8");

test("hook mendelegasikan ke fungsi murni + useCurrentAccess", () => {
  expect(src).toContain('from "@/lib/dashboard-target"');
  expect(src).toContain("dashboardTargetFor(");
  expect(src).toContain("useCurrentAccess");
  expect(src).toContain("export function useDashboardTarget");
});

test("loading diteruskan sebagai undefined, bukan ditebak", () => {
  expect(src).toContain("access === undefined ? undefined");
});
