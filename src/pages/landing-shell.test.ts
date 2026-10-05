import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regresi: halaman landing pernah merender isinya DUA KALI.
 *
 * `DirectoryContent` dibungkus dua shell - satu `lg:hidden` (mobile) dan satu
 * `hidden lg:block` (desktop) - padahal isinya identik dan bedanya cuma satu
 * aturan padding. Akibatnya setiap `id` jadi ganda di DOM, dan navigasi
 * fragment (`#katalog`, `#permintaan`, `#cara-pakai`) selalu mendarat di
 * salinan PERTAMA, yaitu shell mobile yang `display:none` di lebar desktop.
 * Akibat konkretnya: semua anchor dalam halaman dan tombol hero "Mulai cari
 * jasa" tidak melakukan apa-apa di desktop.
 *
 * Perbaikan: satu shell, dan perbedaan padding dipindah ke `pb-safe-nav`
 * (lihat src/index.css).
 *
 * Test ini mengunci sumbernya, bukan hanya hasil render, supaya pola dua-shell
 * tidak bisa diam-diam kembali.
 */
const landingSource = readFileSync(
  fileURLToPath(new URL("./Landing.tsx", import.meta.url)),
  "utf8",
);

describe("landing hanya merender satu kali", () => {
  test("DirectoryContent dimuat tepat satu kali", () => {
    const mounts = landingSource.match(/<DirectoryContent/g) ?? [];
    expect(mounts).toHaveLength(1);
  });

  test("pola shell ganda tidak kembali", () => {
    // Dua wrapper yang hanya berbeda di breakpoint adalah penyebab duplikasi.
    expect(landingSource).not.toMatch(/\blg:hidden\b[^\n]*\bhidden\b[^\n]*lg:block/);
    // Nama shell lama tidak boleh muncul lagi sebagai komponen.
    expect(landingSource).not.toMatch(/function\s+(AppShell|WebShell)\b/);
  });

  test("anchor jangkar tetap punya tepat satu sumber di file", () => {
    // Satu(section) dengan id katalog; sisanya hanya href anchor.
    const definitions = landingSource.match(/<section[^>]*id="katalog"/g) ?? [];
    expect(definitions).toHaveLength(1);
  });
});

test("header login memakai AccountMenu, anonim tetap CTA", () => {
  const landing = readFileSync(new URL("./Landing.tsx", import.meta.url), "utf8");
  expect(landing).toContain("<AccountMenu");
  expect(landing).toContain("useAuth()");
  expect(landing).toContain("Cari jasa");
});
