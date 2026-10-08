import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { queueFilters, type QueueFilter } from "@/lib/admin-workspace-helpers";

/**
 * Shortcut "Butuh tindakan" di Ringkasan cepat.
 *
 * Yang mengikat angka besar dengan tabel di bawahnya adalah satu predikat:
 * `matchesQueueFilter`. Kalau shortcut dan filter memakai hitungan berbeda,
 * keduanya akan menyimpang — dan yang lebih sering dibuka adalah yang salah,
 * karena itu yang dipakai untuk memutuskan pekerjaan hari ini.
 *
 * Tes di bawah tidak bisa merender halaman admin (butuh sesi pengelola), jadi
 * kontrak diikat di sumber: nama antrean, filter yang tersedia, dan wiring
 * state-nya.
 */

const katalogPage = readFileSync(new URL("../pages/admin/KatalogPage.tsx", import.meta.url), "utf8");
// Ringkasan cepat (angka "Butuh tindakan" + shortcut) pindah ke `OverviewPage`
// saat `Admin.tsx` dipecah; meja triage (filter + tabel) pindah ke
// `KatalogPage`. Kontraknya tidak berubah, hanya tempatnya — jadi ketiga
// berkas sama-sama diperiksa, bukan hanya yang baru.
const overviewPage = readFileSync(new URL("../pages/admin/OverviewPage.tsx", import.meta.url), "utf8");
const hero = readFileSync(new URL("./admin-workspace-hero.tsx", import.meta.url), "utf8");
const source = katalogPage + overviewPage + hero;

test("setiap antrean punya pilihan filter di meja triage", () => {
  // Tanpa ini, shortcut akan_filter yang tidak ada di mana pun.
  const values = queueFilters.map((option) => option.value);
  expect(values).toContain("draft");
  expect(values).toContain("archived");
  expect(values).toContain("incomplete");
  expect(values).toContain("all");
});

test("nama antrean bukan kode mesin", () => {
  for (const option of queueFilters) {
    expect(option.label).toBeTruthy();
    expect(option.label).not.toBe(option.value);
  }
});

test("shortcut menuju meja triase di /admin/katalog", () => {
  // Meja triage pindah halaman: shortcut mengantar ke `/admin/katalog`,
  // tempat antrean itu dikerjakan. Anchor `#admin-triage` peninggalan
  // monolit tidak boleh tersisa — di halaman Ringkasan tidak ada lagi
  // elemen ber-id itu, jadi tautannya akan mati.
  expect(hero).toContain('to="/admin/katalog"');
  expect(source).not.toContain('href="#admin-triage"');
  // Dan halaman overview harus benar-benar meneruskan datanya ke komponen hero.
  expect(overviewPage).toContain("shortcuts={actionShortcuts}");
  expect(source).toContain("aria-label=\"Shortcut antrean kerja\"");
});

test("angka shortcut dan isi tabel memakai predikat yang sama", () => {
  expect(katalogPage).toContain("function matchesQueueFilter(");
  expect(katalogPage).toContain("const matchesQueue = matchesQueueFilter(item, queueFilter);");
  // Ringkasan cepat tidak boleh menghitung ulang sendiri; itu cara paling
  // mudah untuk membuat keduanya berbeda tanpa disadari.
  expect(overviewPage).toContain("queue: \"draft\" as const");
  expect(overviewPage).toContain("count: draftItems.length");
  expect(overviewPage).toContain("count: archivedItems.length");
  expect(overviewPage).toContain("count: incompleteItems.length");
});

test("antrean kosong disembunyikan, tapi tabelnya tidak pernah error", () => {
  expect(katalogPage).toContain("if (queue === \"all\") return true;");
  expect(overviewPage).toContain(").filter((shortcut) => shortcut.count > 0);");
});

test("filter antrean ikut ter-reset bersama filter lain", () => {
  // Kalau tidak, "Reset" akan meninggalkan antrean aktif dan tabelnya tetap
  // tersaring — tombol yang terlihat mengembalikan keadaan tapi tidak
  // powerless mengembalikan.
  expect(katalogPage).toMatch(/setSearch\(""\);\s*setStatusFilter\("all"\);\s*setQueueFilter\("all"\);/);
  expect(katalogPage).toContain('id="admin-queue-filter"');
});

test("tipe antrean yang dipakai komponen selalu dikenal filter", () => {
  const known = new Set<QueueFilter>(queueFilters.map((option) => option.value as QueueFilter));
  for (const queue of ["all", "draft", "archived", "incomplete"] as QueueFilter[]) {
    expect(known.has(queue)).toBe(true);
  }
});
