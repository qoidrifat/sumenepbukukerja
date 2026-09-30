/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { SEARCH_EVENT_HOURLY_LIMIT } from "./vendors";

/**
 * Fase 9 - regression test untuk permukaan data dan gerbang otorisasi.
 *
 * Setiap test di sini mengunci SATU perbaikan yang dibuat di Fase 9, dan
 * biasanya dua-duanya: kasus yang harus DITOLAK, dan kasus sah yang harus
 * tetap berjalan supaya perbaikannya tidak memotong produk.
 *
 * Daftar perbaikannya ada di `docs/security/PHASE-9-SECURITY-AUDIT.md`.
 */

const modules = import.meta.glob("./**/*.ts");

const listingPayload = {
  name: "Bengkel Uji Keamanan",
  category: "Servis Teknik",
  description: "Servis pompa air dan listrik untuk warga Sumenep.",
  address: "Jl. Uji Keamanan No. 1, Sumenep",
  landmark: "kalianget",
  price: "Mulai Rp50.000",
  hours: "Setiap hari 07.00-17.00",
  phone: "081200000001",
  tags: ["pompa"],
  status: "active" as const,
  availability: "available" as const,
};

type TestContext = Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0];
type Db = {
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
  get: (id: never) => Promise<Record<string, unknown> | null>;
  patch: (id: never, value: Record<string, unknown>) => Promise<void>;
};

/** Simpan blob dan tandai jenis berkasnya, sama seperti `realtime.test.ts`. */
async function storeImage(ctx: TestContext, contentType = "image/jpeg") {
  const storage = ctx.storage as unknown as { store: (blob: Blob) => Promise<unknown> };
  const id = await storage.store(new Blob(["konten-foto"], { type: contentType }));
  const system = ctx.db as unknown as { patch: (id: never, value: { contentType: string }) => Promise<void> };
  await system.patch(id as never, { contentType });
  return id as string;
}

async function seedUser(t: ReturnType<typeof convexTest>, user: { name: string; email?: string }) {
  const id = await t.run(async (ctx) => {
    const db = ctx.db as unknown as Db;
    return await db.insert("users", user);
  });
  return { id, identity: t.withIdentity({ name: user.name, subject: id }) };
}

async function createDraftListing(t: ReturnType<typeof convexTest>, ownerName: string, ownerEmail?: string) {
  const owner = await seedUser(t, { name: ownerName, email: ownerEmail });
  const identity = owner.identity;
  const vendorId = await identity.mutation(api.vendors.createVendor, {
    ...listingPayload,
    status: "draft",
  });
  return { owner, identity, vendorId };
}

describe("Fase 9: foto publik hanya dilayani bila memang publik", () => {
  test("foto sampul listing aktif tetap punya URL untuk anonim", async () => {
    const t = convexTest(schema, modules);
    const { identity, vendorId } = await createDraftListing(t, "Pemilik Foto", "pemilik-foto@contoh.test");
    // Hanya pengelola boleh menerbitkan listing dan memasang foto sampul,
    // jadi peran pengelola harus lebih dulu.
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const vendor = await db.get(vendorId as never);
      await db.insert("staffMembers", {
        userId: vendor?.ownerId,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const storageId = await t.run(async (ctx) => await storeImage(ctx));
    await identity.mutation(api.vendors.updateVendor, {
      id: vendorId as never,
      ...listingPayload,
      status: "active",
      photoId: storageId,
    });

    const anonymous = t.withIdentity({});
    const url = await anonymous.query(api.vendors.getImageUrl, { storageId });
    expect(url, "foto listing aktif harus tetap tampil di profil publik").toBeTruthy();
  });

  test("storage id bukti klaim tidak dilayani tanpa autentikasi", async () => {
    // Skenario E pada audit Fase 9: bukti usaha warga adalah dokumen pribadi.
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createDraftListing(t, "Warga Klaim", "warga-klaim@contoh.test");
    const evidence = await t.run(async (ctx) => await storeImage(ctx));
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      await db.insert("listingClaims", {
        vendorId,
        requesterId: owner.id,
        whatsappPhone: "628120000001",
        email: "warga-klaim@contoh.test",
        businessAddress: "Jl. Bukti No. 2, Sumenep",
        evidenceStorageId: evidence,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const anonymous = t.withIdentity({});
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId: evidence })).toBeNull();
  });

  test("storage id cadangan mingguan tidak dilayani tanpa autentikasi", async () => {
    const t = convexTest(schema, modules);
    const storageId = await t.run(async (ctx) => await storeImage(ctx, "application/json"));
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      await db.insert("backupRuns", {
        weekKey: "2026-W01",
        storageId,
        tableCounts: {},
        bytes: 10,
        startedAt: Date.now(),
        status: "ok",
      });
    });

    const anonymous = t.withIdentity({});
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId })).toBeNull();
  });

  test("foto listing draft tidak dilayani ke anonim", async () => {
    const t = convexTest(schema, modules);
    const { vendorId } = await createDraftListing(t, "Pemilik Draft", "pemilik-draft@contoh.test");
    const storageId = await t.run(async (ctx) => await storeImage(ctx));
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const vendor = await db.get(vendorId as never);
      await db.patch(vendorId as never, { photoId: storageId, status: "draft" });
      expect(vendor?.status).toBe("draft");
    });

    const anonymous = t.withIdentity({});
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId })).toBeNull();
  });

  test("foto galeri hanya dilayani kalau aktif dan sudah disetujui", async () => {
    const t = convexTest(schema, modules);
    const { identity, vendorId } = await createDraftListing(t, "Pemilik Galeri", "pemilik-galeri@contoh.test");
    void identity;
    const { approved, pending, rejected } = await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      const approved = await storeImage(ctx);
      const pending = await storeImage(ctx);
      const rejected = await storeImage(ctx);
      for (const [storageId, moderationStatus] of [
        [approved, "approved"],
        [pending, "pending"],
        [rejected, "rejected"],
      ] as const) {
        await db.insert("vendorPhotos", {
          vendorId,
          storageId,
          active: true,
          moderationStatus,
          createdAt: Date.now(),
        });
      }
      return { approved, pending, rejected };
    });

    const anonymous = t.withIdentity({});
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId: approved })).toBeTruthy();
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId: pending })).toBeNull();
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId: rejected })).toBeNull();
  });

  test("storage id tak dikenal dijawab kosong, bukan error server", async () => {
    // Audit Fase 9: pemanggil tanpa sesi pernah menerima
    // "../src/convex/vendors.ts:312:34" di dalam badan error.
    const t = convexTest(schema, modules);
    const anonymous = t.withIdentity({});
    await expect(
      anonymous.query(api.vendors.getImageUrl, { storageId: "storage_yang_tidak_ada_fase9" }),
    ).resolves.toBeNull();
  });
});

describe("Fase 9: paket listing draft tidak bocor", () => {
  test("anonim dan warga lain tidak membaca paket listing draft", async () => {
    const t = convexTest(schema, modules);
    const { vendorId } = await createDraftListing(t, "Pemilik Paket", "pemilik-paket@contoh.test");
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      await db.insert("vendorPackages", {
        vendorId,
        name: "Paket Uji",
        description: "Deskripsi paket yang belum ditinjau.",
        price: "Rp150.000",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const stranger = await seedUser(t, { name: "Warga Lain", email: "warga-lain@contoh.test" });
    expect(await t.query(api.community.listPackages, { vendorId: vendorId as never })).toEqual([]);
    expect(
      await stranger.identity.query(api.community.listPackages, { vendorId: vendorId as never }),
    ).toEqual([]);
  });

  test("pemilik listing draft tetap membaca paketnya sendiri", async () => {
    const t = convexTest(schema, modules);
    const { identity, vendorId } = await createDraftListing(t, "Pemilik Paket", "pemilik-paket2@contoh.test");
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      await db.insert("vendorPackages", {
        vendorId,
        name: "Paket Uji",
        description: "Deskripsi paket milik sendiri.",
        price: "Rp150.000",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const rows = await identity.query(api.community.listPackages, { vendorId: vendorId as never });
    expect(rows).toHaveLength(1);
  });

  test("paket listing aktif tetap terbaca tanpa sesi", async () => {
    const t = convexTest(schema, modules);
    const { vendorId } = await createDraftListing(t, "Pemilik Publik", "pemilik-publik@contoh.test");
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      await db.insert("vendorPackages", {
        vendorId,
        name: "Paket Publik",
        description: "Deskripsi paket yang tayang.",
        price: "Rp150.000",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await db.patch(vendorId as never, { status: "active" });
    });

    const rows = await t.query(api.community.listPackages, { vendorId: vendorId as never });
    expect(rows).toHaveLength(1);
  });
});

describe("Fase 9: metadata moderasi tidak keluar ke pembaca publik", () => {
  test("anonim tidak menerima catatan moderasi, id pengelola, atau storage id", async () => {
    const t = convexTest(schema, modules);
    const { vendorId } = await createDraftListing(t, "Pemilik Foto", "pemilik-moderasi@contoh.test");
    const storageId = await t.run(async (ctx) => await storeImage(ctx));
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      await db.insert("vendorPhotos", {
        vendorId,
        storageId,
        caption: "Dapur usaha",
        active: true,
        moderationStatus: "approved",
        moderationNote: "Catatan internal pengelola",
        createdAt: Date.now(),
      });
      await db.patch(vendorId as never, { status: "active" });
    });

    const rows = await t.query(api.community.listVendorPhotos, { vendorId: vendorId as never });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.caption).toBe("Dapur usaha");
    expect(row?.url).toBeTruthy();
    for (const field of ["moderatedBy", "moderationNote", "moderationStatus", "storageId"]) {
      expect(row, `field ${field} bocor ke pembaca publik`).not.toHaveProperty(field);
    }
    expect(JSON.stringify(rows)).not.toContain("Catatan internal pengelola");
  });

  test("pemilik listing tetap melihat status moderasi fotonya sendiri", async () => {
    const t = convexTest(schema, modules);
    const { identity, vendorId } = await createDraftListing(t, "Pemilik Mod", "pemilik-mod@contoh.test");
    const storageId = await t.run(async (ctx) => await storeImage(ctx));
    await identity.mutation(api.community.createVendorPhoto, {
      vendorId: vendorId as never,
      storageId,
      caption: "Etalase",
    });

    const rows = await identity.query(api.community.listVendorPhotos, { vendorId: vendorId as never });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.moderationStatus).toBe("pending");
  });
});

describe("Fase 9: papan permintaan publik tidak membawa id akun warga", () => {
  async function seedRequest(t: ReturnType<typeof convexTest>) {
    const warga = await seedUser(t, { name: "Warga Postingan", email: "warga-posting@contoh.test" });
    const requestId = await warga.identity.mutation(api.community.createRequest, {
      title: "Perbaikan pompa air",
      description: "Pompa di rumah saya mati sejak kemarin dan perlu diperbaiki.",
      category: "Servis Teknik",
      landmark: "kalianget",
    });
    return { owner: warga, requestId };
  }

  test("pembaca tanpa sesi tidak menerima requesterId maupun offeredBy", async () => {
    const t = convexTest(schema, modules);
    const { owner, requestId } = await seedRequest(t);
    const mitra = await createDraftListing(t, "Mitra", "mitra@contoh.test");
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      await db.patch(requestId as never, { status: "open" });
      await db.insert("requestOffers", {
        requestId,
        vendorId: mitra.vendorId,
        offeredBy: owner.id,
        status: "offered",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const rows = await t.query(api.community.listRequests, { limit: 5 });
    expect(rows.length).toBeGreaterThan(0);
    const [row] = rows;
    expect(row, "id akun warga bocor ke papan publik").not.toHaveProperty("requesterId");
    const json = JSON.stringify(rows);
    expect(json).not.toContain(owner.id);
    for (const offer of row?.offers ?? []) {
      expect(offer, "id akun penawar bocor ke papan publik").not.toHaveProperty("offeredBy");
    }
  });

  test("pemilik permintaan tetap menerima requesterId untuk UI", async () => {
    const t = convexTest(schema, modules);
    const { owner, requestId } = await seedRequest(t);
    const rows = await owner.identity.query(api.community.listRequests, { mine: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?._id).toBe(requestId);
    expect(rows[0]?.requesterId).toBe(owner.id);
  });
});

describe("Fase 9: penolakan otorisasi tidak membuka detail server", () => {
  test("gerbang pengelola melempar ConvexError, bukan error server telanjang", async () => {
    const t = convexTest(schema, modules);
    const resident = t.withIdentity({ name: "Warga Biasa" });

    let caught: unknown = null;
    try {
      await resident.query(api.whatsapp.adminHandoffPreview, {});
    } catch (error) {
      caught = error;
    }
    expect(caught, "gerbang pengelola harus menolak, bukan mengembalikan data").not.toBeNull();
    const failure = caught as { name?: string; data?: unknown; message?: string };
    expect(failure.name).toBe("ConvexError");
    // Pesan yang dilihat warga tetap sama seperti sebelumnya.
    expect(String(failure.data)).toMatch(/pengelola/i);
    // Bentuk `value` inilah yang tidak membawa stack trace ke pemanggil.
    expect(failure.data).not.toBeUndefined();
  });
});

describe("Fase 9: penghitung publik punya plafon per jam", () => {
  test("recordSearch berhenti menghitung setelah plafon global tercapai", async () => {
    // Bukti masalah: sebelum plafon ini, `recordSearch` bisa dipanggil tanpa
    // batas apa pun dan menaikkan `searchImpressions` sekaligus menulis satu
    // baris `analyticsEvents` per pemanggilan.
    const t = convexTest(schema, modules);
    const vendorId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      return await db.insert("vendors", {
        slug: "usaha-plafon",
        name: "Usaha Plafon",
        category: "Servis Teknik",
        description: "Listing untuk menguji plafon penghitung.",
        address: "Jl. Plafon No. 1",
        landmark: "kalianget",
        price: "Rp10.000",
        hours: "Setiap hari",
        phone: "081200000009",
        rating: "Baru",
        accent: "from-blue-500 to-blue-700",
        mark: "UP",
        tags: [],
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Satu panggilan normal harus tetap dihitung.
    expect(
      await t.mutation(api.vendors.recordSearch, { vendorIds: [vendorId as never], query: "pompa" }),
    ).toBe(1);

    await t.run(async (ctx) => {
      const db = ctx.db as unknown as Db;
      for (let index = 0; index <= SEARCH_EVENT_HOURLY_LIMIT; index += 1) {
        await db.insert("analyticsEvents", {
          event: "search_impression",
          createdAt: Date.now(),
        });
      }
    });

    expect(
      await t.mutation(api.vendors.recordSearch, { vendorIds: [vendorId as never], query: "pompa" }),
      "pemanggilan setelah plafon tidak boleh menambah hitungan").toBe(0);
    const vendor = await t.run(async (ctx) => await (ctx.db as unknown as Db).get(vendorId as never));
    expect(vendor?.searchImpressions).toBe(1);
  });
});
