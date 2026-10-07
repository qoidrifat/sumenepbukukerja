import { describe, expect, test } from "vitest";
import { dashboardTargetFor } from "./dashboard-target";

describe("dashboardTargetFor v2", () => {
  test("internal ke /admin apa pun status mitranya", () => {
    expect(dashboardTargetFor({ canViewAdmin: true }, { qualified: true })).toBe("/admin");
    expect(dashboardTargetFor({ canViewAdmin: true }, { qualified: false })).toBe("/admin");
    expect(dashboardTargetFor({ canViewAdmin: true }, null)).toBe("/admin");
  });
  test("mitra qualified ke /mitra/dashboard", () => {
    expect(dashboardTargetFor({ canViewAdmin: false }, { qualified: true })).toBe("/mitra/dashboard");
    expect(dashboardTargetFor(null, { qualified: true })).toBe("/mitra/dashboard");
  });
  test("warga biasa ke /warga/dashboard", () => {
    expect(dashboardTargetFor({ canViewAdmin: false }, { qualified: false })).toBe("/warga/dashboard");
    expect(dashboardTargetFor(null, null)).toBe("/warga/dashboard");
  });
  test("loading di sisi mana pun → null", () => {
    expect(dashboardTargetFor(undefined, { qualified: true })).toBeNull();
    expect(dashboardTargetFor({ canViewAdmin: false }, undefined)).toBeNull();
  });
});
