import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./mitra-listing-manager.tsx", import.meta.url), "utf8");

test("tombol tutup sementara semua tersedia", () => {
  expect(src).toContain("Tutup sementara semua");
});

test("tombol buka kembali semua tersedia", () => {
  expect(src).toContain("Buka kembali semua");
});

test("tombol libur memakai ikon Power standar", () => {
  expect(src).toContain("Power");
});
