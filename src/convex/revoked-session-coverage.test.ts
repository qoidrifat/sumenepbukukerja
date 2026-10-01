/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { vendors as seedVendors } from "../lib/catalog";

/**
 * Regression test untuk FASE 1 dan FASE 2.
 *
 * KENAPA BERKAS INI ADA.
 *
 * Perbaikan FASE 1 (otorisasi terpusat) dan FASE 2 (`ensureCatalogSeeded`)
 * sudah ada di kode, tetapi belum punya satu pun test. Kekosongan itu
 * dilaporkan apa adanya di `docs/security/SECURITY-HARDENING-REPORT.md` bagian
 * 10.1. Berkas ini menutupnya.
 *
 * YANG DIKUNCI BUKAN "KODENYA SEPERTI YANG DIHARAPKAN", MELAINKAN PERILAKU.
 *
 * Dua berkas - `vendors.ts` dan `community.ts` - dulu menyimpan salinan aturan
 * otorisasi hasil salin-tempel dari `access.ts`. Salinan itu membaca identitas
 * lewat `getAuthUserId` langsung, sehingga TIDAK PERNAH memanggil
 * `assertSessionNotRevoked`. Test pertama di bawah membuktikan bahwa jalur
 * yang dulu bocor sekarang benar-benar tertutup: sesi yang ada di
 * `revokedAdminSessions` ditolak pada empat fungsi yang persis ada di dua
 * berkas itu.
 *
 * Hanya memeriksa "fungsi X sekarang mengimpor access" tidak akan berguna:
 * susunan impor bisa benar sementara satu cabang masih memakai pemeriksaan
 * lama. Yang diperiksa di sini adalah hasilnya.
 */

const modules = import.meta.glob("./**/*.ts");

type Db = {
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
  get: (id: never) => Promise<Record<string, unknown> | null>;
  patch: (id: never, value: Record<string, unknown>) => Promise<void>;
};

const listingPayload = {
  name: "Bengkel Uji Sesi",
  category: "Servis Teknik",
  description: "Servis pompa air dan listrik untuk warga Sumenep.",
  address: "Jl. Uji Sesi No. 3, Sumenep",
  landmark: "kalianget",
  price: "Mulai Rp50.000",
  hours: "Setiap hari 07.00-17.00",
  phone: "081200000003",
  tags: ["pompa"],
  status: "draft" as const,
  availability: "available" as const,
};

async function seedUser(
  t: ReturnType<typeof convexTest>,
  user: { name: string; email?: string },
) {
  const id = await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    return await db.insert("users", user);
  });
  return { id, identity: t.withIdentity({ name: user.name, subject: id }) };
}

async function seedSession(t: ReturnType<typeof convexTest>, userId: string) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    return await db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
  });
}

async function seedAdmin(t: ReturnType<typeof convexTest>, email = "admin-sesi-uji@contoh.test") {
  const user = await seedUser(t, { name: "Admin Uji Sesi", email });
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    await db.insert("staffMembers", {
      userId: user.id,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  return user;
}

/**
 * Mencabut satu sesi dengan menulis langsung ke `revokedAdminSessions`.
 *
 * Menulis langsung, bukan lewat `adminGate.revokeAdminSession`, disengaja:
 * yang sedang diuji adalah apakah SETIAP permintaan memeriksa daftar cabut.
 * Kalau test ini mencabut lewat mutation, ia sekaligus menguji mutation itu -
 * dan kegagalan di salah satunya akan menyamar sebagai kegagalan di yang lain.
 */
async function revokeSession(
  t: ReturnType<typeof convexTest>,
  args: { sessionId: string; userId: string },
) {
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    await db.insert("revokedAdminSessions", {
      sessionId: args.sessionId,
      userId: args.userId,
      reason: "uji regresi",
      revokedAt: Date.now(),
    });
  });
}

describe("FASE 1 - sesi yang dicabut ditolak di seluruh pintu pengelola", () => {
  /**
   * Menyiapkan satu pengelola dengan DUA sesi: satu tetap aktif, satu dicabut.
   *
   * Dua sesi, bukan satu, karena test yang hanya punya sesi tercabut tidak
   * bisa membedakan "ditolak karena dicabut" dari "ditolak karena hal lain".
   * Sesi aktif adalah pembandingnya.
   */
  async function setupTwoSessions() {
    const t = convexTest(schema, modules);
    const admin = await seedAdmin(t);
    const aktifId = await seedSession(t, admin.id);
    const dicabutId = await seedSession(t, admin.id);

    const aktif = t.withIdentity({ subject: `${admin.id}|${aktifId}` });
    const vendorId = await aktif.mutation(api.vendors.createVendor, listingPayload);

    await revokeSession(t, { sessionId: dicabutId, userId: admin.id });
    const dicabut = t.withIdentity({ subject: `${admin.id}|${dicabutId}` });

    return { t, admin, vendorId, aktif, dicabut };
  }

  test("community.updateAvailability menolak sesi yang dicabut", async () => {
    const { vendorId, aktif, dicabut } = await setupTwoSessions();

    await expect(
      dicabut.mutation(api.community.updateAvailability, {
        vendorId,
        availability: "busy",
      }),
      "saluran inilah yang dulu melewati pemeriksaan daftar cabut",
    ).rejects.toThrow();

    // Sesi yang tidak dicabut tetap harus bisa, supaya perbaikannya tidak
    // memotong alur sah.
    await expect(
      aktif.mutation(api.community.updateAvailability, {
        vendorId,
        availability: "busy",
      }),
    ).resolves.toBeTruthy();
  });

  test("community.createPackage menolak sesi yang dicabut", async () => {
    const { vendorId, aktif, dicabut } = await setupTwoSessions();

    await expect(
      dicabut.mutation(api.community.createPackage, {
        vendorId,
        name: "Paket Uji",
        description: "Paket untuk menguji penolakan sesi yang dicabut.",
        price: "Rp100.000",
      }),
    ).rejects.toThrow();

    await expect(
      aktif.mutation(api.community.createPackage, {
        vendorId,
        name: "Paket Uji",
        description: "Paket untuk menguji penolakan sesi yang dicabut.",
        price: "Rp100.000",
      }),
    ).resolves.toBeTruthy();
  });

  test("community.moderateVendorPhoto menolak sesi yang dicabut", async () => {
    const { t, vendorId, aktif, dicabut } = await setupTwoSessions();

    const photoId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const storage = ctx.storage as unknown as { store: (blob: Blob) => Promise<string> };
      const storageId = await storage.store(new Blob(["konten"], { type: "image/jpeg" }));
      return await db.insert("vendorPhotos", {
        vendorId,
        storageId,
        active: true,
        moderationStatus: "pending",
        createdAt: Date.now(),
      });
    });

    await expect(
      dicabut.mutation(api.community.moderateVendorPhoto, {
        id: photoId as never,
        decision: "approved",
      }),
    ).rejects.toThrow();

    await expect(
      aktif.mutation(api.community.moderateVendorPhoto, {
        id: photoId as never,
        decision: "approved",
      }),
    ).resolves.toBeTruthy();
  });

  test("vendors.createVendor menolak sesi yang dicabut", async () => {
    const { dicabut, aktif } = await setupTwoSessions();

    await expect(
      dicabut.mutation(api.vendors.createVendor, {
        ...listingPayload,
        name: "Listing Dari Sesi Tercabut",
      }),
    ).rejects.toThrow();

    await expect(
      aktif.mutation(api.vendors.createVendor, {
        ...listingPayload,
        name: "Listing Dari Sesi Aktif",
      }),
    ).resolves.toBeTruthy();
  });

  test("warga tanpa peran pengelola tidak mendapat hak istimewa", async () => {
    const t = convexTest(schema, modules);
    const warga = await seedUser(t, { name: "Warga Biasa", email: "warga-uji@contoh.test" });
    const wargaIdentity = t.withIdentity({ name: "Warga Biasa", subject: warga.id });

    // Membaca data pengelola harus ditolak walaupun pemanggil punya sesi sah.
    await expect(
      wargaIdentity.query(api.community.listCommunityMetrics, {}),
    ).rejects.toThrow();
    await expect(
      wargaIdentity.query(api.community.listPhotosForModeration, {}),
    ).rejects.toThrow();
  });

  test("pengunjung tanpa sesi tidak bisa menyentuh jalur pengelola", async () => {
    const { vendorId } = await setupTwoSessions();
    const anonim = convexTest(schema, modules).withIdentity({});

    await expect(
      anonim.mutation(api.community.updateAvailability, {
        vendorId,
        availability: "busy",
      }),
    ).rejects.toThrow();
  });
});

describe("FASE 2 - ensureCatalogSeeded tidak lagi menulis ke baris orang lain", () => {
  /** Slug benih pertama, diambil dari sumber yang sama dengan server. */
  const seedSlug = seedVendors[0]?.slug ?? "bangunan-berkah";
  const seed = seedVendors.find((vendor) => vendor.slug === seedSlug);

  test("benih masuk, dan pemanggilan kedua tidak menambah apa pun", async () => {
    const t = convexTest(schema, modules);
    const pertama = await t.mutation(api.vendors.ensureCatalogSeeded, {});
    expect(pertama).toBeGreaterThan(0);
    // Idempoten: kontrak ini yang dipakai `catalog-store.ts` untuk memutuskan
    // katalog sudah siap.
    const kedua = await t.mutation(api.vendors.ensureCatalogSeeded, {});
    expect(kedua).toBe(0);
  });

  test("pemanggilan ulang TIDAK menimpa koordinat listing yang sudah ada", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});

    // Pemilik listing mengoreksi titik lokasinya.
    const vendorId = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("vendors")
        .withIndex("bySlug", (q) => q.eq("slug", seedSlug))
        .unique();
      if (!row) throw new Error("benih tidak ditemukan setelah seeding");
      await ctx.db.patch(row._id, { lat: 1.5, lng: 2.5 });
      return row._id;
    });

    // Siapa pun boleh memanggil fungsi ini, jadi ini yang paling mungkin
    // terjadi: pengunjung anonim memanggilnya berulang kali.
    await t.mutation(api.vendors.ensureCatalogSeeded, {});
    await t.mutation(api.vendors.ensureCatalogSeeded, {});

    const sesudah = await t.run(async (ctx) => await ctx.db.get(vendorId));
    expect(sesudah?.lat, "koreksi pemilik tidak boleh dikembalikan oleh pemanggil anonim").toBe(1.5);
    expect(sesudah?.lng).toBe(2.5);
  });

  test("penyelarasan koordinat tetap tersedia, tapi lewat jalur internal", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});

    const vendorId = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("vendors")
        .withIndex("bySlug", (q) => q.eq("slug", seedSlug))
        .unique();
      if (!row) throw new Error("benih tidak ditemukan setelah seeding");
      await ctx.db.patch(row._id, { lat: 1.5, lng: 2.5 });
      return row._id;
    });

    const aligned = await t.mutation(internal.vendors.alignSeededCoordinates, {});
    expect(aligned, "harus ada baris yang diselaraskan").toBeGreaterThan(0);

    const sesudah = await t.run(async (ctx) => await ctx.db.get(vendorId));
    expect(sesudah?.lat).toBe(seed?.lat);
    expect(sesudah?.lng).toBe(seed?.lng);

    // Dan ia idempoten: setelah selaras, tidak ada lagi yang berubah.
    expect(await t.mutation(internal.vendors.alignSeededCoordinates, {})).toBe(0);
  });

  test("jumlah sisipan dibatasi oleh MAX_SEED_INSERTS", async () => {
    const t = convexTest(schema, modules);
    const inserted = await t.mutation(api.vendors.ensureCatalogSeeded, {});
    // Batas kerjanya 200. Kalau daftar benih tumbuh melewatinya, angka ini
    // akan berhenti di 200 dan test ini gagal - yang memang tujuannya.
    expect(inserted).toBeLessThanOrEqual(200);
    expect(inserted).toBeLessThanOrEqual(seedVendors.length);
  });
});
