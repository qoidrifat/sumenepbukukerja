/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Fase 2, sisi baca: metrik komunitas, metrik analitik, dan daftar permintaan
 * pemilik listing.
 *
 * Yang dikunci di sini adalah bahwa pembacaan yang dipersempit mengembalikan
 * HIMPUNAN YANG SAMA, bukan sekadar angka yang mirip. Untuk itu setiap kasus
 * uji menaruh data yang seharusnya ikut, data yang seharusnya tidak ikut, dan
 * data yang mudah tertukar (mis. pengguna anonim, foto yang belum dimoderasi,
 * listing arsip) — lalu memeriksa keduanya sekaligus.
 */

const insert = (t: ReturnType<typeof convexTest>, table: string, doc: Record<string, unknown>) =>
  t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert(table, doc);
  });

const now = () => Date.now();

async function seedVendor(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
): Promise<Id<"vendors">> {
  return (await insert(t, "vendors", {
    slug: `usaha-${Math.random().toString(36).slice(2, 10)}`,
    name: "Usaha Uji",
    category: "Servis Teknik",
    description: "Deskripsi",
    address: "Jl. Uji",
    landmark: "kota",
    price: "Mulai Rp50.000",
    hours: "07.00–17.00",
    phone: "628123456789",
    rating: "4.8",
    accent: "from-blue-500 to-blue-700",
    mark: "UU",
    tags: [],
    status: "active",
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  })) as Id<"vendors">;
}

async function seedRequest(
  t: ReturnType<typeof convexTest>,
  requesterId: Id<"users">,
  overrides: Record<string, unknown> = {},
): Promise<Id<"serviceRequests">> {
  return (await insert(t, "serviceRequests", {
    requesterId,
    title: "Butuh bantuan",
    description: "Deskripsi",
    category: "Servis Teknik",
    landmark: "kota",
    status: "open",
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  })) as Id<"serviceRequests">;
}

async function seedRegisteredUser(
  t: ReturnType<typeof convexTest>,
  name: string,
  email: string,
): Promise<Id<"users">> {
  return (await insert(t, "users", { name, email })) as Id<"users">;
}

async function seedAnonymousUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return (await insert(t, "users", { isAnonymous: true })) as Id<"users">;
}

async function seedStaff(t: ReturnType<typeof convexTest>, name = "Pengelola") {
  const userId = await seedRegisteredUser(t, name, "pengelola@sumenep.co.id");
  await insert(t, "staffMembers", {
    userId,
    role: "admin",
    createdAt: now(),
    updatedAt: now(),
  });
  return { userId, staff: t.withIdentity({ subject: userId }) };
}

describe("metrik komunitas setelah pembacaan dipersempit", () => {
  test("penyebut returningSaverRate tidak lagi menghitung akun anonim", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await seedStaff(t);
    const resident = await seedRegisteredUser(t, "Warga", "warga@sumenep.co.id");
    const vendorId = await seedVendor(t);
    // Tiga residu anonim yang dulu ikut menjadi penyebut.
    await seedAnonymousUser(t);
    await seedAnonymousUser(t);
    await seedAnonymousUser(t);
    await insert(t, "favorites", { userId: resident, vendorId, createdAt: now() });

    const metrics = await staff.query(api.community.listCommunityMetrics, {});

    // Dua akun ber-email (pengelola + warga), satu di antaranya menyimpan
    // listing ⇒ 50%. Kalau penyebutnya masih semua baris `users`, angkanya
    // akan menjadi 1/5 = 20% — dan itulah bedanya: tiga residu anonim tidak
    // lagi bisa menekan angka ini.
    expect(metrics.returningSaverRate).toBe(50);
    expect(metrics.activeListings).toBe(1);
  });

  test("penyebut kosong tidak menghasilkan pembagian nol", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await seedStaff(t);
    await seedAnonymousUser(t);
    await seedAnonymousUser(t);

    const metrics = await staff.query(api.community.listCommunityMetrics, {});
    expect(metrics.returningSaverRate).toBe(0);
  });

  test("listing aktif, permintaan selesai, dan permintaan kedaluwarsa terhitung tepat", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await seedStaff(t);
    const resident = await seedRegisteredUser(t, "Warga", "warga@sumenep.co.id");

    await seedVendor(t, { status: "active" });
    await seedVendor(t, { status: "active" });
    await seedVendor(t, { status: "draft" });
    await seedVendor(t, { status: "archived" });
    await seedRequest(t, resident, { status: "completed" });
    await seedRequest(t, resident, { status: "expired" });
    await seedRequest(t, resident, { status: "open" });
    await seedRequest(t, resident, { status: "cancelled" });

    const metrics = await staff.query(api.community.listCommunityMetrics, {});
    expect(metrics.activeListings).toBe(2);
    expect(metrics.completedRequests).toBe(1);
    expect(metrics.expiredRequests).toBe(1);
  });

  test("jumlah per kategori dan per area tetap dihitung dari listing aktif saja", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await seedStaff(t);
    await seedVendor(t, { category: "Kuliner", landmark: "kota" });
    await seedVendor(t, { category: "Kuliner", landmark: "kalianget" });
    await seedVendor(t, { category: "Transportasi", landmark: "kota" });
    // Arsip tidak boleh ikut menambah angka mana pun.
    await seedVendor(t, { category: "Transportasi", landmark: "kota", status: "archived" });

    const metrics = await staff.query(api.community.listCommunityMetrics, {});
    expect(metrics.byCategory.Kuliner).toBe(2);
    expect(metrics.byCategory.Transportasi).toBe(1);
    expect(metrics.byArea.kota).toBe(2);
    expect(metrics.byArea.kalianget).toBe(1);
  });
});

describe("metrik analitik setelah pembacaan dipersempit", () => {
  async function metricsSetup(t: ReturnType<typeof convexTest>) {
    const { staff } = await seedStaff(t);
    const ownerId = await seedRegisteredUser(t, "Pemilik", "pemilik@sumenep.co.id");
    const fast = await seedVendor(t, { name: "Cepat", ownerId, responseMinutes: 5 });
    const slow = await seedVendor(t, { name: "Lambat", ownerId, responseMinutes: 90 });
    // Draft, jadi tidak boleh ikut menjadi "paling responsif".
    const draft = await seedVendor(t, {
      name: "Draft",
      ownerId,
      responseMinutes: 1,
      status: "draft",
    });
    return { staff, ownerId, fast, slow, draft };
  }

  test("paling responsif hanya melihat listing yang benar-benar tayang", async () => {
    const t = convexTest(schema, modules);
    const { staff, fast, draft } = await metricsSetup(t);

    const metrics = await staff.query(api.analytics.adminMetrics, {});
    expect(metrics.topProviders[0]?.id).toBe(fast);
    expect(metrics.topProviders.map((provider) => provider.id)).not.toContain(draft);
    expect(metrics.activeListings).toBe(2);
  });

  test("jumlah permintaan per provider dihitung lewat indeks miliknya sendiri", async () => {
    const t = convexTest(schema, modules);
    const { staff, fast, slow } = await metricsSetup(t);
    const resident = await seedRegisteredUser(t, "Warga", "warga@sumenep.co.id");
    await seedRequest(t, resident, { vendorId: fast, status: "claimed" });
    await seedRequest(t, resident, { vendorId: fast, status: "completed" });
    await seedRequest(t, resident, { vendorId: slow, status: "claimed" });
    // Permintaan tanpa vendor tidak boleh ikut menghitung siapa pun.
    await seedRequest(t, resident, { status: "open" });

    const metrics = await staff.query(api.analytics.adminMetrics, {});
    const byName = Object.fromEntries(metrics.topProviders.map((p) => [p.name, p.requests]));
    expect(byName.Cepat).toBe(2);
    expect(byName.Lambat).toBe(1);
    expect(metrics.completedRequests).toBe(1);
  });

  test("foto yang belum disetujui tidak dianggap sebagai foto listing", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await metricsSetup(t);
    const [withApproved, withPending] = await t.run(async (ctx) =>
      await ctx.db.query("vendors").collect(),
    ).then((rows) => rows.map((row) => row._id));

    await insert(t, "vendorPhotos", {
      vendorId: withApproved,
      storageId: "storage-a",
      active: true,
      moderationStatus: "approved",
      createdAt: now(),
    });
    await insert(t, "vendorPhotos", {
      vendorId: withPending,
      storageId: "storage-b",
      active: true,
      moderationStatus: "pending",
      createdAt: now(),
    });
    // Foto lama yang ditolak juga tidak boleh menutupi kekurangan foto.
    await insert(t, "vendorPhotos", {
      vendorId: withPending,
      storageId: "storage-c",
      active: true,
      moderationStatus: "rejected",
      createdAt: now(),
    });

    const metrics = await staff.query(api.analytics.adminMetrics, {});
    expect(metrics.listingsWithoutPhotos).toBe(1);
  });

  test("foto yang dinonaktifkan tidak dihitung", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await metricsSetup(t);
    const vendorId = await seedVendor(t, { name: "Tanpa Foto" });
    await insert(t, "vendorPhotos", {
      vendorId,
      storageId: "storage-d",
      active: false,
      moderationStatus: "approved",
      createdAt: now(),
    });

    const metrics = await staff.query(api.analytics.adminMetrics, {});
    expect(metrics.listingsWithoutPhotos).toBe(3);
  });
});

describe("laporan warga setelah pembacaan dipersempit", () => {
  test("laporan kembar masih ditolak, dan hanya untuk target yang sama", async () => {
    const t = convexTest(schema, modules);
    const vendorA = await seedVendor(t, { name: "Usaha A" });
    const vendorB = await seedVendor(t, { name: "Usaha B" });
    const reporter = t.withIdentity({ subject: await seedRegisteredUser(t, "Pelapor", "p1@sumenep.co.id") });

    await reporter.mutation(api.community.createReport, {
      vendorId: vendorA,
      reason: "Nomor tidak aktif",
      details: "Sudah dicoba tiga kali dan tidak ada balasan.",
    });
    await expect(
      reporter.mutation(api.community.createReport, {
        vendorId: vendorA,
        reason: "Nomor tidak aktif",
        details: "Sudah dicoba tiga kali dan tidak ada balasan.",
      }),
    ).rejects.toThrow("Laporan serupa sudah dikirim baru saja");

    // Teks yang sama untuk target BERBEDA bukan duplikat.
    await reporter.mutation(api.community.createReport, {
      vendorId: vendorB,
      reason: "Nomor tidak aktif",
      details: "Sudah dicoba tiga kali dan tidak ada balasan.",
    });

    const reports = await t.run(async (ctx) => await ctx.db.query("reports").collect());
    expect(reports).toHaveLength(2);
  });

  test("aturan duplikat berlaku per TARGET, bukan per pelapor", async () => {
    const t = convexTest(schema, modules);
    const vendor = await seedVendor(t);
    const first = t.withIdentity({ subject: await seedRegisteredUser(t, "Pelapor 1", "p1@sumenep.co.id") });
    const second = t.withIdentity({ subject: await seedRegisteredUser(t, "Pelapor 2", "p2@sumenep.co.id") });

    await first.mutation(api.community.createReport, {
      vendorId: vendor,
      reason: "Alamat salah",
      details: "Alamat yang tertera menunjuk rumah kosong.",
    });
    // Perilaku lama dipertahankan apa adanya: teks identik untuk target yang
    // sama ditolak walau pelapornya berbeda. Itu memang maksudnya — kalau
    // tidak, satu orang cukup mengganti akun untuk membanjiri antrean moderasi
    // dengan laporan kembar.
    await expect(
      second.mutation(api.community.createReport, {
        vendorId: vendor,
        reason: "Alamat salah",
        details: "Alamat yang tertera menunjuk rumah kosong.",
      }),
    ).rejects.toThrow("Laporan serupa sudah dikirim baru saja");

    const reports = await t.run(async (ctx) => await ctx.db.query("reports").collect());
    expect(reports).toHaveLength(1);
  });

  test("teks yang sama boleh dikirim lagi setelah jendela 6 jam lewat", async () => {
    const t = convexTest(schema, modules);
    const vendor = await seedVendor(t);
    const reporter = t.withIdentity({ subject: await seedRegisteredUser(t, "Pelapor", "p5@sumenep.co.id") });
    await insert(t, "reports", {
      vendorId: vendor,
      reason: "Alamat salah",
      details: "Alamat yang tertera menunjuk rumah kosong.",
      status: "resolved",
      createdAt: now() - 7 * 60 * 60 * 1000,
      updatedAt: now() - 7 * 60 * 60 * 1000,
    });

    await reporter.mutation(api.community.createReport, {
      vendorId: vendor,
      reason: "Alamat salah",
      details: "Alamat yang tertera menunjuk rumah kosong.",
    });

    const reports = await t.run(async (ctx) => await ctx.db.query("reports").collect());
    expect(reports).toHaveLength(2);
  });

  test("pembatasan laporan per pelapor masih berlaku", async () => {
    const t = convexTest(schema, modules);
    const reporter = t.withIdentity({ subject: await seedRegisteredUser(t, "Pelapor Rajin", "p3@sumenep.co.id") });
    const targets: Id<"vendors">[] = [];
    for (let index = 0; index < 11; index += 1) {
      targets.push(await seedVendor(t, { name: `Usaha ${index}` }));
    }

    for (let index = 0; index < 10; index += 1) {
      await reporter.mutation(api.community.createReport, {
        vendorId: targets[index],
        reason: `Alasan nomor ${index}`,
        details: `Rincian untuk laporan nomor ${index} yang cukup panjang.`,
      });
    }
    await expect(
      reporter.mutation(api.community.createReport, {
        vendorId: targets[10],
        reason: "Alasan nomor 10",
        details: "Rincian untuk laporan nomor 10 yang cukup panjang.",
      }),
    ).rejects.toThrow("Terlalu banyak laporan");
  });

  test("laporan ke permintaan memakai indeks permintaan, bukan indeks vendor", async () => {
    const t = convexTest(schema, modules);
    const resident = await seedRegisteredUser(t, "Warga", "warga@sumenep.co.id");
    const request = await seedRequest(t, resident);
    const reporter = t.withIdentity({ subject: await seedRegisteredUser(t, "Pelapor", "p4@sumenep.co.id") });

    await reporter.mutation(api.community.createReport, {
      requestId: request,
      reason: "Permintaan tidak jelas",
      details: "Tidak ada keterangan lokasi maupun anggaran.",
    });
    await expect(
      reporter.mutation(api.community.createReport, {
        requestId: request,
        reason: "Permintaan tidak jelas",
        details: "Tidak ada keterangan lokasi maupun anggaran.",
      }),
    ).rejects.toThrow("Laporan serupa sudah dikirim baru saja");
  });
});

describe("daftar permintaan milik pemilik listing", () => {
  test("himpunannya sama dengan cara lama: milik saya semua status, plus yang cocok dan masih terbuka", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedRegisteredUser(t, "Pemilik", "pemilik@sumenep.co.id");
    const owner = t.withIdentity({ subject: ownerId });
    const mine = await seedVendor(t, { ownerId, name: "Punya Saya" });
    const otherVendor = await seedVendor(t, { name: "Punya Orang Lain" });
    const resident = await seedRegisteredUser(t, "Warga", "warga@sumenep.co.id");

    // (a) ditugaskan ke listing saya, status apa pun ⇒ ikut
    const assignedClaimed = await seedRequest(t, resident, { vendorId: mine, status: "claimed" });
    const assignedDone = await seedRequest(t, resident, { vendorId: mine, status: "completed" });
    // (b) masih terbuka dan cocok dengan listing saya ⇒ ikut
    const openMatch = await seedRequest(t, resident, { status: "open" });
    // ditugaskan ke listing ORANG LAIN ⇒ tidak ikut
    await seedRequest(t, resident, { vendorId: otherVendor, status: "claimed" });
    // terbuka tapi kategori berbeda ⇒ tidak cocok
    await seedRequest(t, resident, { status: "open", category: "Kuliner" });

    const visible = await owner.query(api.offers.listOwnerRequests, {});
    expect(visible.map((request) => request._id).sort()).toEqual(
      [assignedClaimed, assignedDone, openMatch].sort(),
    );
  });

  test("penawaran hanya diambil untuk permintaan yang tampil, dan hanya milik listing saya", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await seedRegisteredUser(t, "Pemilik", "pemilik@sumenep.co.id");
    const owner = t.withIdentity({ subject: ownerId });
    const mine = await seedVendor(t, { ownerId });
    const otherVendor = await seedVendor(t, { name: "Vendor Lain" });
    const resident = await seedRegisteredUser(t, "Warga", "warga@sumenep.co.id");
    const request = await seedRequest(t, resident, { vendorId: mine, status: "claimed" });

    await insert(t, "requestOffers", {
      requestId: request,
      vendorId: mine,
      offeredBy: ownerId,
      status: "offered",
      createdAt: now(),
      updatedAt: now(),
    });
    // Penawaran vendor lain atas permintaan yang sama tidak boleh muncul.
    await insert(t, "requestOffers", {
      requestId: request,
      vendorId: otherVendor,
      offeredBy: resident,
      status: "offered",
      createdAt: now(),
      updatedAt: now(),
    });

    const visible = await owner.query(api.offers.listOwnerRequests, {});
    expect(visible).toHaveLength(1);
    expect(visible[0].offers.map((offer) => offer.vendorId)).toEqual([mine]);
  });

  test("pemilik tanpa listing tidak menerima apa pun", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: await seedRegisteredUser(t, "Tanpa Listing", "x@sumenep.co.id") });
    const resident = await seedRegisteredUser(t, "Warga", "warga@sumenep.co.id");
    await seedRequest(t, resident, { status: "open" });

    expect(await owner.query(api.offers.listOwnerRequests, {})).toEqual([]);
  });
});

describe("pemeriksaan gerbang admin", () => {
  test("hitungan kegagalan global hanya membaca percobaan di dalam jendelanya", async () => {
    const t = convexTest(schema, modules);
    // Lama: jauh di luar jendela lockout.
    await insert(t, "adminPasscodeAttempts", {
      key: "lama",
      outcome: "failed",
      createdAt: now() - 90 * 24 * 60 * 60 * 1000,
    });
    for (let index = 0; index < 3; index += 1) {
      await insert(t, "adminPasscodeAttempts", {
        key: `baru-${index}`,
        outcome: "failed",
        createdAt: now(),
      });
    }
    await insert(t, "adminPasscodeAttempts", {
      key: "sukses",
      outcome: "success",
      createdAt: now(),
    });

    const count = await t.mutation(internal.adminGate.globalFailureCount, {});
    expect(count).toBe(3);
  });

  test("jendela per kunci hanya membaca kunci itu", async () => {
    const t = convexTest(schema, modules);
    await insert(t, "adminPasscodeAttempts", { key: "target", outcome: "failed", createdAt: now() });
    await insert(t, "adminPasscodeAttempts", { key: "target", outcome: "failed", createdAt: now() });
    await insert(t, "adminPasscodeAttempts", { key: "lain", outcome: "failed", createdAt: now() });

    const window = await t.mutation(internal.adminGate.attemptWindow, { key: "target" });
    expect(window.count).toBe(2);
  });
});
