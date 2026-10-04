import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * Katalog harus bersumber dari server, tidak dari karangan.
 *
 * Latar: `lib/catalog.ts` memuat enam listing CONTOH - satu per kategori,
 * alamat generik, tidak ada yang terverifikasi. Sempat ada dua jalannya data
 * itu sampai ke pengunjung:
 *
 *   1. `useCatalogRemote` memanggil `vendors:ensureCatalogSeeded` sendiri begitu
 *      tab pertama dibuka, jadi pengunjung pertama mengisi tabel produksi.
 *   2. `useCatalogVendors` dan `useVendor` jatuh ke data ter-bundle kalau
 *      server menjawab kosong atau belum menjawab.
 *
 * Keduanya dicabut. Menulis tidak merusak apa pun karena mutasinya idempoten,
 * tapi hasil akhirnya situs publik yang menayangkan usaha yang tidak pernah ada,
 * lengkap dengan tombol WhatsApp-nya. Pengisian katalog kini keputusan
 * eksplisit operator lewat Convex CLI.
 *
 * Test ini mengunci keputusan itu pada level sumber supaya tidak bisa kembali
 * diam-diam. Isi database produksi sendiri tidak bisa diuji dari sini.
 */

const read = (path: string) => readFileSync(path, "utf8");

const store = read("src/lib/catalog-store.ts");
const vendors = read("src/convex/vendors.ts");

describe("katalog publik tidak lagi memakai data contoh", () => {
  test("peramban tidak pernah memanggil ensureCatalogSeeded", () => {
    expect(store, "peramban masih memanggil mutasi seed").not.toContain(
      "api.vendors.ensureCatalogSeeded",
    );
  });

  test("peramban tidak mengimpor data contoh dari lib/catalog", () => {
    expect(store, "seedVendors masih diimpor").not.toContain("seedVendors");
    expect(store, "vendorBySlug masih diimpor").not.toContain("vendorBySlug");
    expect(store, "tipe Vendor harus tetap diimpor").toContain("type Vendor");
  });

  test("katalog memakai jawaban server apa adanya, termasuk saat kosong", () => {
    expect(store, "katalog masih jatuh ke data contoh").toContain(
      "if (remote) return remote as Vendor[];",
    );
    expect(store, "sisa fallback ke seed example").not.toMatch(/:\s*seedVendors/);
  });

  test("halaman detail tidak menebak listing dari data contoh", () => {
    const useVendor = store.slice(store.indexOf("export function useVendor("));
    expect(useVendor, "halaman detail masih menebak dari data contoh").not.toContain(
      "vendorBySlug",
    );
    // Cache lokal tetap boleh: isinya data yang benar-benar pernah diambil
    // dari server, bukan karangan.
    expect(useVendor, "halaman detail harus tetap memakai cache luring").toContain(
      "readCatalogSnapshot()",
    );
  });
});

describe("operator masih bisa mengisi katalog secara sadar", () => {
  test("mutasi seed masih ada dan tetap idempoten", () => {
    expect(vendors, "mutasi seed dihapus; operator tak punya jalan mengisi katalog").toContain(
      "export const ensureCatalogSeeded = mutation(",
    );
    // Idempotensi lewat index slug: baris yang sudah ada dilewati, bukan ditulis ulang.
    expect(vendors, "penulisan seed harus melewati baris yang sudah ada").toContain(
      'withIndex("bySlug"',
    );
    expect(vendors, "penulisan seed harus dilewati bila slug sudah ada").toContain(
      "if (existing) continue;",
    );
  });

  test("penyelarasan koordinat tetap internal, bukan bisa dipanggil publik", () => {
    expect(vendors).toContain("export const alignSeededCoordinates = internalMutation(");
  });
});