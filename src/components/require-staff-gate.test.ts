import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./RequireStaffGate.tsx", import.meta.url), "utf8");

test("tiga keadaan: loading, ditolak, lolos", () => {
  expect(src).toContain("access === undefined");
  expect(src).toContain('role="status"');
  expect(src).toContain("!access.canViewAdmin");
  expect(src).toContain("export function RequireStaffGate");
});

test("layar ditolak menjelaskan + menautkan ke dashboard warga", () => {
  expect(src).toContain('to="/warga/dashboard"');
  expect(src).toContain("Halaman ini untuk staff");
  expect(src).toContain("Peran & Audit");
  expect(src).toContain('to="/"');
});

test("tidak ada mutasi — gate ini murni UX baca", () => {
  expect(src).not.toContain("useMutation");
});
