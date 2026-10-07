import { describe, expect, test } from "vitest";
import {
  areaLabel,
  jsonLdScript,
  listingDescription,
  listingStructuredData,
  listingTitle,
} from "@/lib/listing-metadata";
import { buildSitemapXml } from "@/lib/sitemap";

/**
 * Metadata publik listing.
 *
 * Dua hal yang diuji di sini tidak bisa dikembalikan ke belakang: data yang
 * bocor ke halaman publik, dan markup JSON-LD yang rusak oleh karakter khusus
 * di nama listing. Keduanya terlihat benar di layar — yang bocor justru yang
 * tidak terlihat, dan yang rusak muncul enam bulan kemudian di hasil pencarian.
 */

const LISTING = {
  slug: "karya-jaya",
  name: "Karya Jaya",
  category: "Servis Teknik",
  description: "Servis pompa air dan genset untuk rumah tangga.",
  hours: "08.00-17.00",
  address: "Jl. Raya No 1",
  landmark: "Banda",
  phone: "081234567890",
  rating: "4.5",
  reviewsCount: 12,
};

describe("judul dan deskripsi listing", () => {
  test("judul menyebut nama, kategori, dan area", () => {
    expect(listingTitle(LISTING)).toContain("Karya Jaya");
    expect(listingTitle(LISTING)).toContain("Servis Teknik");
    expect(listingTitle(LISTING).length).toBeLessThanOrEqual(70);
  });

  test("area 'all' ditulis sebagai Kabupaten Sumenep, bukan 'all'", () => {
    expect(areaLabel("all")).toBe("Kabupaten Sumenep");
    expect(areaLabel(undefined)).toBe("Kabupaten Sumenep");
    // Area yang tidak dikenal tetap tampil apa adanya, bukan jadi string kosong.
    expect(areaLabel("Desa")).toBe("Desa");
  });

  test("deskripsi tidak pernah kosong walau listing tanpa deskripsi", () => {
    const description = listingDescription({ ...LISTING, description: "" });
    expect(description.length).toBeGreaterThan(0);
    expect(description).toContain("Karya Jaya");
  });

  test("deskripsi dipotong pada batas mesin pencari", () => {
    const long = listingDescription({ ...LISTING, description: "x".repeat(1000) });
    expect(long.length).toBeLessThanOrEqual(300);
  });
});

describe("JSON-LD LocalBusiness", () => {
  test("hanya memuat field listing yang memang publik", () => {
    const data = listingStructuredData(LISTING, "https://contoh.test");
    expect(data["@type"]).toBe("LocalBusiness");
    expect(data.name).toBe("Karya Jaya");
    expect(data.areaServed).toBe("Banda");
    // FASE 10 - regresi: `telephone` dihapus dari JSON-LD dengan sengaja.
    // Structured data dibaca crawler, bukan orang; memuat nomor di sini
    // berarti setiap URL listing jadi titik panen tanpa membuka halaman.
    expect(data.telephone).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("081234567890");
    // Yang TIDAK boleh muncul: identitas pemilik, akun, atau alamat email.
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("ownerId");
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  test("tanpa rating, tidak mengarang aggregateRating", () => {
    const data = listingStructuredData(
      { ...LISTING, rating: undefined, reviewsCount: undefined },
      "https://contoh.test",
    );
    expect(data.aggregateRating).toBeUndefined();
  });

  test("URL kanonik memakai origin dan slug ter-encode", () => {
    const data = listingStructuredData(
      { ...LISTING, slug: "toko&snack" },
      "https://contoh.test/",
    );
    expect(data.url).toBe("https://contoh.test/v/toko%26snack");
  });

  test("karakter khusus di nama tidak dapat memutus markup", () => {
    // Ini kasus yang nyata: nama listing adalah input pengguna. `</script>` di
    // dalam nama akan menutup tag lebih awal kalau tidak di-escape.
    const hostile = listingStructuredData(
      { ...LISTING, name: 'Toko "</script><script>alert(1)</script>' },
      "https://contoh.test",
    );
    const script = jsonLdScript(hostile);
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c");
    expect(JSON.parse(script).name).toBe('Toko "</script><script>alert(1)</script>');
  });
});

describe("sitemap", () => {
  test("berisi beranda dan listing aktif saja", () => {
    const xml = buildSitemapXml({
      origin: "https://contoh.test",
      vendors: [{ slug: "karya-jaya", updatedAt: 1_700_000_000_000 }],
    });
    expect(xml).toContain("<loc>https://contoh.test/</loc>");
    expect(xml).toContain("<loc>https://contoh.test/v/karya-jaya</loc>");
    expect(xml).toContain("<lastmod>");
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  test("rute privat tidak pernah ikut terindeks", () => {
    const xml = buildSitemapXml({ origin: "https://contoh.test", vendors: [] });
    for (const forbidden of ["/admin", "/dashboard", "/auth", "/invite"]) {
      expect(xml).not.toContain(forbidden);
    }
  });

  test("dokumen hukum publik ikut terindeks (syarat dialog login)", () => {
    const xml = buildSitemapXml({ origin: "https://contoh.test", vendors: [] });
    expect(xml).toContain("<loc>https://contoh.test/kebijakan-privasi</loc>");
    expect(xml).toContain("<loc>https://contoh.test/syarat-ketentuan</loc>");
  });

  test("slug berisi karakter khusus di-escape, tidak dipotong diam-diam", () => {
    const xml = buildSitemapXml({
      origin: "https://contoh.test",
      vendors: [{ slug: "a&b", updatedAt: 1 }],
    });
    expect(xml).toContain("/v/a%26b");
  });
});
