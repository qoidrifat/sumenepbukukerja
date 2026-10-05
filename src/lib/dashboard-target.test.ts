import { describe, expect, test } from "vitest";
import { dashboardTargetFor } from "./dashboard-target";

describe("dashboardTargetFor", () => {
  test("staff (canViewAdmin) ke dashboard staff", () => {
    expect(dashboardTargetFor({ canViewAdmin: true })).toBe("/staff/dashboard");
  });
  test("warga dan tamu ke dashboard warga", () => {
    expect(dashboardTargetFor({ canViewAdmin: false })).toBe("/warga/dashboard");
    expect(dashboardTargetFor(null)).toBe("/warga/dashboard");
  });
  test("loading (undefined) belum punya tujuan", () => {
    expect(dashboardTargetFor(undefined)).toBeNull();
  });
});
