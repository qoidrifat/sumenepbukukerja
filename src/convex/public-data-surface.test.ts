/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { gzipSync } from "node:zlib";
import schema from "./schema";
import { api, internal } from "./_generated/api";

/**
 * Batas respons publik.
 *
 * Prinsip yang diuji: skema database BUKAN skema API publik. Query publik
 * harus punya permukaan field yang disengaja, dan tidak boleh ikut
 *_precision_ data internal hanya karena dokumen database-nya lengkap.
 *
 * Field yang tidak boleh keluar dari katalog publik:
 *   ownerId, businessId, subscriptionTier, whatsappClicks, shareClicks,
 *   searchImpressions, photoId, status, createdAt, updatedAt, _creationTime
 */

const modules = import.meta.glob("./**/*.ts");

const now = () => Date.now();

/** Nilai yang harus TIDAK PERNAH muncul di respons publik mana pun. */
const RAHASIA = {
  ownerEmail: "pemilik-rahasia@sumenep.co.id",
  businessId: "RAHASIA-BISNIS-999",
  storageId: "storage_internal_abc123",
  // Nomor usaha. FASE 10: ini tidak boleh muncul di respons publik mana pun -
  // hanya bentuk tersamarnya. Uji ini yang menjaganya tetap begitu.
  phone: "628123456789",
  // Hanya huruf, sengaja: nilai sentinel di bawah ini ("1234", "8901", dan
  // digit terakhir nomor) harus tidak muncul di respons publik. Kalau ref ini
  // memakai angka, ia akan menabrak sentinel dan test jadi salah positives.
  contactRef: "cr1_abcdefabcdefabcdefabcdefabcdefab",
};

async function seedVendor(t: ReturnType<typeof convexTest>, overrides: Record<string, unknown> = {}) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    const userId = await db.insert("users", {
      email: RAHASIA.ownerEmail,
      emailVerificationTime: now(),
      name: "Pemilik Rahasia",
      image: undefined,
      createdAt: now(),
      updatedAt: now(),
    });
    const vendorId = await db.insert("vendors", {
      slug: "usaha-rahasia",
      name: "Usaha Uji",
      category: "Servis Teknik",
      description: "Deskripsi usaha.",
      address: "Jl. Uji",
      landmark: "kota",
      lat: -7.01,
      lng: 113.86,
      price: "Mulai Rp50.000",
      hours: "Setiap hari",
      phone: RAHASIA.phone,
      contactRef: RAHASIA.contactRef,
      rating: "4.8",
      reviewsCount: 3,
      accent: "from-blue-500 to-blue-700",
      mark: "UU",
      tags: ["Tag Satu"],
      status: "active",
      featured: false,
      verified: true,
      photoId: RAHASIA.storageId,
      ownerId: userId,
      businessId: RAHASIA.businessId,
      subscriptionTier: "premium",
      whatsappClicks: 1234,
      shareClicks: 567,
      searchImpressions: 8901,
      availability: "open",
      responseMinutes: 12,
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    });
    return { vendorId, ownerId: userId };
  });
}

const FIELD_TIDAK_BOLEH = [
  "ownerId",
  "businessId",
  "subscriptionTier",
  "whatsappClicks",
  "shareClicks",
  "searchImpressions",
  "photoId",
  "status",
  "createdAt",
  "updatedAt",
  "_creationTime",
];

describe("permukaan data publik", () => {
  // Test A - field internal tidak boleh keluar dari katalog publik.
  test("A: katalog publik tidak membocorkan field internal", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);
    const rows = await t.query(api.vendors.listActive, {});
    const keys = Object.keys(rows[0] ?? {});

    for (const field of FIELD_TIDAK_BOLEH) {
      expect(keys, `field ${field} bocor ke katalog publik`).not.toContain(field);
    }

    // Dan bukan sekadar "kunci hilang": nilainya benar-benar tidak ada di mana pun.
    const json = JSON.stringify(rows);
    expect(json).not.toContain(RAHASIA.businessId);
    expect(json).not.toContain(RAHASIA.storageId);
    expect(json).not.toContain(RAHASIA.ownerEmail);
    expect(json).not.toContain("1234"); // whatsappClicks
    expect(json).not.toContain("8901"); // searchImpressions
  });

  // Test A' - halaman profil punya permukaan sendiri.
  test("A2: profil publik juga tidak membocorkan field internal", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);
    const vendor = await t.query(api.vendors.getBySlug, { slug: "usaha-rahasia" });
    expect(vendor).not.toBeNull();
    const keys = Object.keys(vendor ?? {});

    for (const field of ["ownerId", "businessId", "subscriptionTier", "whatsappClicks", "shareClicks", "searchImpressions", "status", "createdAt", "updatedAt", "_creationTime"]) {
      expect(keys, `field ${field} bocor ke profil publik`).not.toContain(field);
    }

    const json = JSON.stringify(vendor);
    expect(json).not.toContain(RAHASIA.businessId);
    expect(json).not.toContain(RAHASIA.ownerEmail);
    // photoId tetap ada di profil: gambar listing memang ditampilkan publik,
    // jadi pengenalnya bukan rahasia - hanya berarti untuk Listing.
    expect(keys).toContain("photoId");
  });

  // Test B - field publik yang wajib tetap ada.
  test("B: field publik yang dibutuhkan UI tetap tersedia", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);
    const [row] = await t.query(api.vendors.listActive, {});

    for (const field of [
      "_id",
      "slug",
      "name",
      "category",
      "description",
      "address",
      "landmark",
      "lat",
      "lng",
      "price",
      "hours",
      "rating",
      "accent",
      "mark",
      "tags",
    ]) {
      expect(row, `field publik ${field} hilang`).toHaveProperty(field);
    }
    // FASE 10: yang wajib ada bukan `phone`, melainkan pegangan kontak opaque
    // dan bentuk tersamarnya. Keduanya menggantikan nomor mentah.
    expect(row).toHaveProperty("contactRef");
    expect(row).toHaveProperty("phoneMasked");
    // Turunan server, bukan field database.
    expect(row).toHaveProperty("openNow");
    expect(row).toHaveProperty("reviews");
    expect(row?.slug).toBe("usaha-rahasia");
  });

  // Test B2 - regresi FASE 10: nomor mentah tidak boleh kembali ke katalog.
  test("B2: nomor mentah tidak pernah keluar di katalog publik mana pun", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);

    const anonymous = t.withIdentity({});
    const catalog = await anonymous.query(api.vendors.listActive, {});
    const profile = await anonymous.query(api.vendors.getBySlug, {
      slug: "usaha-rahasia",
    });

    for (const [label, row] of [
      ["listActive", catalog[0]],
      ["getBySlug", profile],
    ] as const) {
      expect(row, label).toBeTruthy();
      const keys = Object.keys(row ?? {});
      // Field phone TIDAK BOLEH ada. Inilah kebocoran yang dihapus: satu
      // permintaan anonim cukup untuk memanen seluruh direktori.
      expect(keys, `${label} masih mengirim field phone`).not.toContain("phone");
      // Dan tidak boleh menyamarkannya di bawah nama lain.
      const json = JSON.stringify(row);
      expect(json, `${label} membocorkan digit nomor`).not.toContain(
        RAHASIA.phone.slice(-6),
      );
    }

    // Pegangan kontak harus opaque: bukan nomor, bukan id listing.
    const contactRef = catalog[0]?.contactRef;
    expect(contactRef).toBe(RAHASIA.contactRef);
    expect(contactRef).not.toContain(RAHASIA.phone);
  });

  // Test C - katalog memang harus bisa dibaca tanpa akun.
  test("C: katalog publik tetap bisa dibaca tanpa autentikasi", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);
    const anonymous = t.withIdentity({});
    const rows = await anonymous.query(api.vendors.listActive, {});
    expect(rows.length).toBe(1);
    expect(rows[0]?.name).toBe("Usaha Uji");
  });

  // Test D - bonus data karena sudah masuk tidak boleh membuka field privat.
  test("D: pengguna terautentikasi tidak mendapat field tambahan", async () => {
    const t = convexTest(schema, modules);
    const { ownerId } = await seedVendor(t);

    const anon = t.withIdentity({});
    const owner = t.withIdentity({ subject: ownerId });

    const anonRows = await anon.query(api.vendors.listActive, {});
    const ownerRows = await owner.query(api.vendors.listActive, {});

    // Membaca katalog publik adalah hak yang sama untuk semua.
    expect(Object.keys(ownerRows[0] ?? {}).sort()).toEqual(Object.keys(anonRows[0] ?? {}).sort());
    expect(JSON.stringify(ownerRows)).not.toContain(RAHASIA.businessId);
  });

  // Test E - sumber sitemap juga tidak boleh lebar.
  test("E: sumber sitemap hanya mengembalikan slug dan waktu", async () => {
    const t = convexTest(schema, modules);
    await seedVendor(t);
    const rows = await t.query(internal.vendors.publicSitemapVendors, {});
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["slug", "updatedAt"]);
  });
});

describe("regresi muatan katalog publik", () => {
  async function seedMany(t: ReturnType<typeof convexTest>, count: number) {
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      for (let i = 0; i < count; i += 1) {
        await db.insert("vendors", {
          slug: `usaha-${i}`,
          name: `Usaha Nomor ${i}`,
          category: "Servis Teknik",
          description: "Deskripsi usaha yang cukup panjang untuk menguji beban.",
          address: "Jl. Uji",
          landmark: "kota",
          lat: -7.01,
          lng: 113.86,
          price: "Mulai Rp50.000",
          hours: "Setiap hari",
          phone: "628000000000",
          rating: "4.8",
          reviewsCount: 3,
          accent: "from-blue-500 to-blue-700",
          mark: "UU",
          tags: ["Tag Satu", "Tag Dua"],
          status: "active",
          featured: false,
          verified: false,
          photoId: RAHASIA.storageId,
          ownerId: "user1234567890abcdefghijkl",
          businessId: RAHASIA.businessId,
          subscriptionTier: "premium",
          whatsappClicks: 1234,
          shareClicks: 567,
          searchImpressions: 8901,
          createdAt: now(),
          updatedAt: now(),
        });
      }
    });
  }

  test("muatan turun dan tidak memuat data internal", async () => {
    for (const size of [6, 500]) {
      const t = convexTest(schema, modules);
      await seedMany(t, size);
      const rows = await t.query(api.vendors.listActive, {});
      const json = JSON.stringify(rows);
      const gzip = gzipSync(Buffer.from(json)).length;

      console.log(
        `MUATAN n=${size} bytes=${json.length} gzip=${gzip} fields=${Object.keys(rows[0] ?? {}).length}`,
      );

      // Muatan harus tetap wajar, dan data internal tidak boleh
      // muncul, baik pada ukuran kecil maupun di ambang 500 vendor.
      expect(json).not.toContain(RAHASIA.businessId);
      expect(json).not.toContain(RAHASIA.storageId);
      expect(Object.keys(rows[0] ?? {}).length).toBeLessThanOrEqual(25);
      expect(json.length).toBeLessThan(size * 600);
    }
  });
});
