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

const adminPage = readFileSync(new URL("../pages/Admin.tsx", import.meta.url), "utf8");
// Blok Ringkasan cepat dipindah ke komponennya sendiri saat `Admin.tsx`
// dipecah. Kontraknya tidak berubah, hanya tempatnya — jadi kedua berkas
// sama-sama diperiksa, bukan hanya yang baru.
const hero = readFileSync(new URL("./admin-workspace-hero.tsx", import.meta.url), "utf8");
const source = adminPage + hero;

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

test("shortcut menuju meja triage dan sekaligus menyaring antrean", () => {
  // `href` saja tidak cukup: ia akan melompat ke tabel yang masih menampilkan
  // semua listing, jadi antrean yang diklik tidak terlihat.
  expect(source).toContain('href="#admin-triage"');
  expect(source).toContain("onClick={() => onSelectQueue(shortcut.queue)}");
  // Dan halaman harus benar-benar meneruskan setter-nya ke komponen hero.
  expect(adminPage).toContain("onSelectQueue={setQueueFilter}");
  expect(source).toContain("aria-label=\"Shortcut antrean kerja\"");
});

test("angka shortcut dan isi tabel memakai predikat yang sama", () => {
  expect(adminPage).toContain("function matchesQueueFilter(");
  expect(adminPage).toContain("const matchesQueue = matchesQueueFilter(item, queueFilter);");
  // Ringkasan cepat tidak boleh menghitung ulang sendiri; itu cara paling
  // mudah untuk membuat keduanya berbeda tanpa disadari.
  expect(adminPage).toContain("queue: \"draft\" as const");
  expect(adminPage).toContain("count: draftItems.length");
  expect(adminPage).toContain("count: archivedItems.length");
  expect(adminPage).toContain("count: incompleteItems.length");
});

test("antrean kosong disembunyikan, tapi tabelnya tidak pernah error", () => {
  expect(adminPage).toContain("if (queue === \"all\") return true;");
  expect(adminPage).toContain(").filter((shortcut) => shortcut.count > 0);");
});

test("filter antrean ikut ter-reset bersama filter lain", () => {
  // Kalau tidak, "Reset" akan meninggalkan antrean aktif dan tabelnya tetap
  // tersaring — tombol yang terlihat mengembalikan keadaan tapi tidak
  // powerless mengembalikan.
  expect(adminPage).toMatch(/setSearch\(""\);\s*setStatusFilter\("all"\);\s*setQueueFilter\("all"\);/);
  expect(adminPage).toContain('id="admin-queue-filter"');
});

test("tipe antrean yang dipakai komponen selalu dikenal filter", () => {
  const known = new Set<QueueFilter>(queueFilters.map((option) => option.value as QueueFilter));
  for (const queue of ["all", "draft", "archived", "incomplete"] as QueueFilter[]) {
    expect(known.has(queue)).toBe(true);
  }
});
