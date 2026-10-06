import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./RequireMitraGate.tsx", import.meta.url), "utf8");

test("tiga keadaan: loading, onboarding, lolos", () => {
  expect(src).toContain("export function RequireMitraGate");
  expect(src).toContain('role="status"');
  expect(src).toContain("isQualified");
  expect(src).toContain("usaha-saya");
});

test("onboarding INLINE (bukan full-page) berisi dua CTA + penjelasan klaim", () => {
  expect(src).toContain("Tambah listing");
  expect(src).toContain("Klaim listing");
  expect(src).toContain("terverifikasi");
  expect(src).toContain("useMyClaims");
  expect(src).toContain("useOwnerVendors");
  expect(src).not.toContain("<main");
});

test("murni UX baca + tema publik", () => {
  expect(src).not.toContain("useMutation");
  expect(src).not.toContain("admin-");
});
