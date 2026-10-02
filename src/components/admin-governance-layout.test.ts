import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak lebar grid di panel "Governance & monitoring".
 *
 * Seluruh kartu di section ini pernah terpotong di ponsel, dan penyebabnya satu
 * baris: grid-nya hanya mendeklarasikan `xl:grid-cols-2`. Di bawah `xl` tidak
 * ada `grid-template-columns` sama sekali, sehingga kolom implisit memakai
 * `auto` dan lebarnya ikut min-content anak terlebar — tabel IP di panel
 * security log (`min-w-[34rem]`) menaikkannya sampai ~787px. Track selebar itu
 * lalu dipotong `overflow-hidden` di `<section>` induknya, jadi separuh kanan
 * setiap kartu hilang di Android maupun iOS.
 *
 * Kenapa diuji lewat source, bukan render: yang menentukan bukan markup yang
 * terlihat, melainkan dua kelas yang harus ADA BERSAMAAN. `grid-cols-1`
 * mengubah track menjadi `minmax(0, 1fr)` supaya boleh menyusut, tetapi grid
 * item masih membawa `min-width: auto`; tanpa `[&>*]:min-w-0` isinya tetap
 * meluber keluar kartu. Mengganti salah satu saja hanya memindahkan
 * pemotongan dari kartu ke isinya, dan tidak ada satu pun yang akan memberi
 * tahu.
 */

const SOURCE = readFileSync("src/components/admin-governance.tsx", "utf8");

const governanceGridClass = () => {
  const match = SOURCE.match(/className="(grid[^"]*xl:grid-cols-2[^"]*)"/);
  if (!match)
    throw new Error("grid governance tidak ditemukan di admin-governance.tsx");
  return match[1]!;
};

test("kolom tunggal di bawah xl boleh menyusut, bukan auto", () => {
  expect(governanceGridClass()).toContain("grid-cols-1");
});

test("anak grid ikut boleh menyusut di bawah min-content", () => {
  expect(governanceGridClass()).toContain("[&>*]:min-w-0");
});

test("dua kolom di xl tidak ikut hilang", () => {
  expect(governanceGridClass()).toContain("xl:grid-cols-2");
});
