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
