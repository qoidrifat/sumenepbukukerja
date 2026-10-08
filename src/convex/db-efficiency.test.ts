/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Fase 2: menghapus enam pembacaan tabel penuh.
 *
 * Yang diuji di sini bukan "query mengembalikan angka" — itu sudah dipakai
 * dashboard. Yang diuji adalah dua hal yang bisa rusak diam-diam:
 *
 *  1. Ringkasan yang disimpan (penghitung) harus SAMA dengan isi tabelnya.
 *     Begitu keduanya berbeda, dashboard menampilkan angka yang tidak ada
 *     hubungannya dengan kenyataan dan tidak ada yang tahu.
 *  2. Pembacaan yang dipersempit tidak boleh membuang baris yang seharusnya
 *     ikut. Untuk itu setiap penggantian indeks dibandingkan dengan hasil cara
 *     lama pada data yang sama.
 */

async function seedUser(
  t: ReturnType<typeof convexTest>,
  name: string,
  email?: string,
) {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", { name, ...(email ? { email } : {}) });
  });
  return { userId, user: t.withIdentity({ subject: userId }) };
}

/** Kelompokkan `whatsappDeliveries` menurut statusnya, langsung dari tabel. */
async function actualDeliveryCounts(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("whatsappDeliveries").collect();
    return {
      queued: rows.filter((row) => row.status === "queued").length,
      sent: rows.filter((row) => row.status === "sent").length,
      delivered: rows.filter((row) => row.status === "delivered").length,
      failed: rows.filter((row) => row.status === "failed").length,
      total: rows.length,
    };
  });
}

async function statsDoc(t: ReturnType<typeof convexTest>) {
  return await t.run(
    async (ctx) => (await ctx.db.query("whatsappDeliveryStats").collect())[0] ?? null,
  );
}

async function queue(
  t: ReturnType<typeof convexTest>,
  userId: string,
  key: string,
) {
  return await t.mutation(internal.whatsapp.queueWhatsappDelivery, {
    userId,
    deliveryKey: key,
    title: "Judul",
    body: "Isi",
  });
}

describe("ringkasan status pengiriman WhatsApp", () => {
  test("setiap perpindahan status menjaga ringkasan tetap sama dengan tabel", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga");

    // queued → sent → delivered
    const first = await queue(t, userId, "whatsapp:test:a");
    await t.mutation(internal.whatsapp.markWhatsappSent, {
      id: first.id,
      providerMessageId: "SM-a",
    });
    expect(await statsDoc(t)).toMatchObject({ queued: 0, sent: 1, delivered: 0, failed: 0 });
    await t.mutation(internal.whatsapp.applyDeliveryStatus, {
      providerMessageId: "SM-a",
      status: "delivered",
    });

    // queued → failed → queued lagi (dibuka ulang) → sent
    const second = await queue(t, userId, "whatsapp:test:b");
    await t.mutation(internal.whatsapp.markWhatsappFailed, { id: second.id, errorCode: "131026" });
    expect(await statsDoc(t)).toMatchObject({ queued: 0, sent: 0, delivered: 1, failed: 1 });
    await t.mutation(internal.whatsapp.reopenFailedDelivery, { id: second.id });
    await t.mutation(internal.whatsapp.markWhatsappSent, {
      id: second.id,
      providerMessageId: "SM-b",
    });

    // satu lagi yang gagal dan dibiarkan
    const third = await queue(t, userId, "whatsapp:test:c");
    await t.mutation(internal.whatsapp.markWhatsappFailed, { id: third.id, errorCode: "131047" });

    // satu lagi yang masih menunggu
    await queue(t, userId, "whatsapp:test:d");

    const actual = await actualDeliveryCounts(t);
    expect(await statsDoc(t)).toMatchObject({
      queued: actual.queued,
      sent: actual.sent,
      delivered: actual.delivered,
      failed: actual.failed,
    });
    expect(actual).toMatchObject({ queued: 1, sent: 1, delivered: 1, failed: 1, total: 4 });
  });

  test("antrean yang sama dua kali tidak dihitung dua kali", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga");
    await queue(t, userId, "whatsapp:test:dobel");
    const again = await queue(t, userId, "whatsapp:test:dobel");
    expect(again.shouldSend).toBe(false);
    expect(await statsDoc(t)).toMatchObject({ queued: 1, sent: 0, delivered: 0, failed: 0 });
  });

  test("panggilan balik provider yang datang terlambat tidak merusak ringkasan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga");
    const delivery = await queue(t, userId, "whatsapp:test:balik");
    await t.mutation(internal.whatsapp.markWhatsappSent, {
      id: delivery.id,
      providerMessageId: "SM-balik",
    });
    await t.mutation(internal.whatsapp.applyDeliveryStatus, {
      providerMessageId: "SM-balik",
      status: "delivered",
    });
    // Callback lama: `delivered` tidak boleh mundur ke `queued`.
    await t.mutation(internal.whatsapp.applyDeliveryStatus, {
      providerMessageId: "SM-balik",
      status: "queued",
    });

    expect(await statsDoc(t)).toMatchObject({ queued: 0, sent: 0, delivered: 1, failed: 0 });
    expect(await actualDeliveryCounts(t)).toMatchObject({ delivered: 1, total: 1 });
  });

  test("getWhatsappStatus membaca ringkasan, bukan menghitung ulang tabelnya", async () => {
    const t = convexTest(schema, modules);
    const { userId, user } = await seedUser(t, "Warga");
    await queue(t, userId, "whatsapp:test:ringkas");

    // Nilai penanda yang SENGAJA tidak cocok dengan isi tabel. Kalau query ini
    // masih mengagregasi tabel, angkanya akan kembali 1/0/0/0 dan tes gagal.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("whatsappDeliveryStats").collect())[0]!;
      await ctx.db.patch(row._id, { queued: 41, sent: 42, delivered: 43, failed: 44 });
    });

    const status = await user.query(api.whatsapp.getWhatsappStatus, {});
    expect(status.deliveryCounts).toEqual({ queued: 41, sent: 42, delivered: 43, failed: 44 });
  });

  test("daftar pengiriman terakhir milik sendiri tetap benar setelah pembacaan dipersempit", async () => {
    const t = convexTest(schema, modules);
    const { userId, user } = await seedUser(t, "Warga");
    const other = await seedUser(t, "Warga Lain");
    await queue(t, userId, "whatsapp:test:milikku-1");
    await queue(t, userId, "whatsapp:test:milikku-2");
    await queue(t, other.userId, "whatsapp:test:miliknya");
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("whatsappDeliveries").collect();
      const target = rows.find((row) => row.deliveryKey === "whatsapp:test:milikku-2")!;
      await ctx.db.patch(target._id, {
        createdAt: Date.now() + 60_000,
        updatedAt: Date.now() + 60_000,
      });
    });

    const status = await user.query(api.whatsapp.getWhatsappStatus, {});
    expect(status.recent.map((row) => row.deliveryKey)).toEqual([
      "whatsapp:test:milikku-2",
      "whatsapp:test:milikku-1",
    ]);
  });

  test("backfill menghitung ulang persis dari tabel, dan idempoten", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga");
    const one = await queue(t, userId, "whatsapp:test:bf-1");
    await queue(t, userId, "whatsapp:test:bf-2");
    await t.mutation(internal.whatsapp.markWhatsappFailed, { id: one.id, errorCode: "131026" });

    // Rusak dulu: seolah-olah ada jalur tulis lama yang belum ikut menghitung.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("whatsappDeliveryStats").collect())[0]!;
      await ctx.db.patch(row._id, { queued: 999, sent: 999, delivered: 999, failed: 999 });
    });

    const first = await t.mutation(internal.whatsapp.backfillWhatsappStats, {});
    expect(first).toMatchObject({ scanned: 2, queued: 1, failed: 1 });
    const second = await t.mutation(internal.whatsapp.backfillWhatsappStats, {});
    expect(second).toMatchObject({ queued: 1, failed: 1 });

    const actual = await actualDeliveryCounts(t);
    expect(await statsDoc(t)).toMatchObject({
      queued: actual.queued,
      sent: actual.sent,
      delivered: actual.delivered,
      failed: actual.failed,
    });
  });

  test("retensi yang menghapus baris lama ikut menurunkan ringkasannya", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga");
    const delivery = await queue(t, userId, "whatsapp:test:tua");
    await t.mutation(internal.whatsapp.markWhatsappSent, {
      id: delivery.id,
      providerMessageId: "SM-tua",
    });
    await t.mutation(internal.whatsapp.applyDeliveryStatus, {
      providerMessageId: "SM-tua",
      status: "delivered",
    });
    // Baris dibuat seolah-olah sudah tua, karena `createdAt` diisi oleh kode.
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("whatsappDeliveries").collect();
      await ctx.db.patch(rows[0]!._id, { createdAt: Date.now() - 90 * 24 * 60 * 60 * 1000 });
    });
    await t.mutation(internal.dataRetention.pruneApplicationHistory, {});

    const actual = await actualDeliveryCounts(t);
    expect(actual.total).toBe(0);
    // Kalau ringkasan tidak ikut turun, dashboard akan terus melaporkan satu
    // pengiriman yang sudah tidak ada di tabelnya.
    expect(await statsDoc(t)).toMatchObject({ queued: 0, sent: 0, delivered: 0, failed: 0 });
  });
});

describe("notifikasi WhatsApp tidak lagi tergandakan", () => {
  test("satu pengiriman menghasilkan tepat satu notifikasi", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga");
    const delivery = await queue(t, userId, "whatsapp:test:notif");
    await t.mutation(internal.whatsapp.markWhatsappSent, {
      id: delivery.id,
      providerMessageId: "SM-notif",
    });

    const notifications = await t.run(async (ctx) => await ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId, kind: "whatsapp:test:notif" });
  });

  test("pengiriman kedua untuk kunci yang sama tidak menambah notifikasi", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga");
    const delivery = await queue(t, userId, "whatsapp:test:sekali");
    await t.mutation(internal.whatsapp.markWhatsappSent, { id: delivery.id });
    await t.mutation(internal.whatsapp.reopenFailedDelivery, { id: delivery.id });
    await t.mutation(internal.whatsapp.markWhatsappSent, { id: delivery.id });

    const notifications = await t.run(async (ctx) => await ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(1);
  });

  test("handoff admin tidak membuat notifikasi milik siapa pun", async () => {
    const t = convexTest(schema, modules);
    const handoff = await t.mutation(internal.whatsapp.queueAdminHandoff, {
      deliveryKey: "alert:test:1",
      title: "Kesalahan server",
      body: "Ada laporan error baru",
      handoffUrl: "https://wa.me/6280000000000?text=uji",
    });
    // Baris handoff sudah berstatus `handoff` sejak dibuat. Menandainya
    // `sent` di kemudian hari berarti ada yang mengarang bukti pengiriman.
    await t.mutation(internal.whatsapp.markWhatsappSent, {
      id: handoff.id,
      providerMessageId: "SM-alert",
    });
    const row = await t.query(internal.whatsapp.deliveryForRetry, { deliveryId: handoff.id });
    expect(row?.status).toBe("handoff");

    const notifications = await t.run(async (ctx) => await ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(0);
  });
});

describe("daftar di-batch + URL foto pindah ke detail (aturan 4, 12)", () => {
  const communitySource = () =>
    readFileSync(new URL("./community.ts", import.meta.url), "utf8");
  const analyticsSource = () =>
    readFileSync(new URL("./analytics.ts", import.meta.url), "utf8");

  /** Pembantu baris database langsung, mengikuti pola `metrics-index.test.ts`. */
  const insert = (t: ReturnType<typeof convexTest>, table: string, doc: Record<string, unknown>) =>
    t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert(table, doc);
    });

  /** Simpan blob gambar di storage pengujian, sama seperti `security-surface.test.ts`. */
  const storeImage = (t: ReturnType<typeof convexTest>) =>
    t.run(async (ctx) => {
      const storage = ctx.storage as unknown as { store: (blob: Blob) => Promise<unknown> };
      const id = await storage.store(new Blob(["konten-foto"], { type: "image/jpeg" }));
      const system = ctx.db as unknown as { patch: (id: never, value: { contentType: string }) => Promise<void> };
      await system.patch(id as never, { contentType: "image/jpeg" });
      return id as string;
    });

  const seedVendor = (t: ReturnType<typeof convexTest>, overrides: Record<string, unknown> = {}) =>
    insert(t, "vendors", {
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    });

  test("query daftar tidak memanggil getUrl per baris", () => {
    const community = communitySource();
    const listBlock = community.slice(
      community.indexOf("export const listVendorPhotos"),
      community.indexOf("export const createVendorPhoto"),
    );
    expect(listBlock).not.toContain("ctx.storage.getUrl");
  });

  test("antrean moderasi tidak memanggil getUrl per baris", () => {
    const community = communitySource();
    const moderationBlock = community.slice(
      community.indexOf("export const listPhotosForModeration"),
      community.indexOf("export const listCommunityMetrics"),
    );
    expect(moderationBlock).not.toContain("ctx.storage.getUrl");
  });

  test("papan permintaan mengambil vendor lewat batch, bukan per tawaran", () => {
    const community = communitySource();
    const boardBlock = community.slice(
      community.indexOf("export const listRequests"),
      community.indexOf("export const createRequest"),
    );
    // Satu `get` per tawaran berarti vendor yang sama diambil berulang kali
    // setiap kali ia menawar di permintaan yang berbeda.
    expect(boardBlock).not.toContain("ctx.db.get(offer.vendorId)");
    // Peta nama hasil batch dipakai saat pemetaan tawaran.
    expect(boardBlock).toContain("vendorNameById");
  });

  test("topProviders menghitung permintaan hanya untuk finalis", () => {
    const analytics = analyticsSource();
    const block = analytics.slice(analytics.indexOf("export const adminMetrics"));
    // Finalis (8 nama paling responsif) HARUS dipilih dulu, baru permintaannya
    // dihitung: pemindaian `byVendor` untuk listing di luar 8 besar tidak
    // pernah tampil di dashboard.
    const finalisDipilih = block.indexOf(".slice(0, 8)");
    const hitungPermintaan = block.indexOf('withIndex("byVendor"');
    expect(finalisDipilih).toBeGreaterThanOrEqual(0);
    expect(hitungPermintaan).toBeGreaterThanOrEqual(0);
    expect(finalisDipilih).toBeLessThan(hitungPermintaan);
  });

  test("daftar galeri mengembalikan storageId; URL di-resolve di detail", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Pemilik Galeri");
    const vendorId = (await seedVendor(t, { ownerId: userId })) as Id<"vendors">;
    const storageId = await storeImage(t);
    await insert(t, "vendorPhotos", {
      vendorId,
      storageId,
      caption: "Etalase",
      active: true,
      moderationStatus: "approved",
      createdAt: Date.now(),
    });

    // Pembaca publik menerima pengenal blob, bukan URL yang sudah jadi.
    const rows = await t.query(api.community.listVendorPhotos, { vendorId: vendorId as never });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.storageId).toBe(storageId);
    expect(rows[0], "URL harus di-resolve di pemuatan detail, bukan di daftar").not.toHaveProperty("url");

    // Resolver detail yang sama melayani foto publik yang sudah disetujui.
    const anonymous = t.withIdentity({});
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId })).toBeTruthy();
  });

  test("foto pending hanya di-resolve untuk pemilik dan pengelola", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Pemilik Pending");
    const vendorId = (await seedVendor(t, { ownerId: userId })) as Id<"vendors">;
    const storageId = await storeImage(t);
    await insert(t, "vendorPhotos", {
      vendorId,
      storageId,
      active: true,
      moderationStatus: "pending",
      createdAt: Date.now(),
    });

    const owner = t.withIdentity({ subject: userId });
    const stranger = await seedUser(t, "Warga Asing");
    const anonymous = t.withIdentity({});
    // Galeri pemilik dan antrean moderasi memakai resolver yang SAMA dengan
    // publik — tanpa ini kedua tampilan itu kosong setelah `url` keluar dari
    // daftar.
    expect(await owner.query(api.vendors.getImageUrl, { storageId })).toBeTruthy();
    expect(await stranger.user.query(api.vendors.getImageUrl, { storageId })).toBeNull();
    expect(await anonymous.query(api.vendors.getImageUrl, { storageId })).toBeNull();
  });

  test("papan tetap membawa nama vendor dan nama penawar setelah batching", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUser(t, "Warga Papan");
    const claimedId = (await seedVendor(t, { name: "Diklaim Bengkel", ownerId: userId })) as Id<"vendors">;
    const bidderId = (await seedVendor(t, { name: "Penawar Cepat", ownerId: userId })) as Id<"vendors">;
    const requestId = await insert(t, "serviceRequests", {
      requesterId: userId,
      title: "Pompa mati",
      description: "Pompa air mati sejak kemarin dan perlu diperbaiki.",
      category: "Servis Teknik",
      landmark: "kota",
      status: "open",
      vendorId: claimedId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await insert(t, "requestOffers", {
      requestId,
      vendorId: bidderId,
      offeredBy: userId,
      status: "offered",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const rows = await t.query(api.community.listRequests, { limit: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.vendorName).toBe("Diklaim Bengkel");
    expect(rows[0]?.offers).toHaveLength(1);
    expect(rows[0]?.offers[0]?.vendorName).toBe("Penawar Cepat");
  });
});

describe("aturan 7: angka dasbor yang tetap membaca tabel (temuan beraudit)", () => {
  /**
   * Audit Task 7 memeriksa setiap `.collect()` di query user-facing untuk
   * dipindah ke pembacaan counter (preseden: `analyticsCounters`,
   * `whatsappDeliveryStats`). Hasilnya: tidak satu pun angka yang tersisa
   * punya penulis counter yang menutupi SEMUA jalur tulisnya (rincinya di
   * laporan Task 7), jadi tidak ada pembacaan yang dimigrasi — mengarang
   * counter tanpa penulis dilarang oleh brief task ini sendiri.
   *
   * Dua tes ini mengunci MAKNA yang wajib dipertahankan kalau suatu hari
   * counter-nya benar-benar dibuat: penghitung jumlah baris yang naif akan
   * menjawab SALAH untuk keduanya, jadi keduanya adalah spesifikasi
   * kebenaran counter masa depan, bukan sekadar dokumentasi.
   */

  /** Pembantu baris database langsung, mengikuti pola describe di atas. */
  const insert = (t: ReturnType<typeof convexTest>, table: string, doc: Record<string, unknown>) =>
    t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert(table, doc);
    });

  const seedVendor = (t: ReturnType<typeof convexTest>, overrides: Record<string, unknown> = {}) =>
    insert(t, "vendors", {
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    });

  const seedRegistered = (t: ReturnType<typeof convexTest>, name: string, email: string) =>
    insert(t, "users", { name, email });

  const seedStaff = async (t: ReturnType<typeof convexTest>, name: string, email: string) => {
    const userId = await seedRegistered(t, name, email);
    await insert(t, "staffMembers", {
      userId,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { userId, staff: t.withIdentity({ subject: userId }) };
  };

  test("penyimpan yang sama di dua listing tetap dihitung satu di returningSaverRate", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await seedStaff(t, "Pengelola Tujuh", "tujuh@sumenep.co.id");
    const residentA = await seedRegistered(t, "Warga A", "warga-a@sumenep.co.id");
    await seedRegistered(t, "Warga B", "warga-b@sumenep.co.id");
    const vendorA = (await seedVendor(t)) as Id<"vendors">;
    const vendorB = (await seedVendor(t)) as Id<"vendors">;
    // Dua baris favorites milik SATU warga, lewat mutasi aslinya.
    const saver = t.withIdentity({ subject: residentA });
    await saver.mutation(api.vendors.toggleFavorite, { vendorId: vendorA });
    await saver.mutation(api.vendors.toggleFavorite, { vendorId: vendorB });

    const metrics = await staff.query(api.community.listCommunityMetrics, {});
    // Pembilangnya pengguna UNIK (1 dari 3 warga = 33). Penghitung jumlah
    // baris favorites yang naif akan menjawab 2/3 = 67 — salah.
    expect(metrics.returningSaverRate).toBe(33);
  });

  test("foto lawas tanpa status moderasi tetap dihitung sebagai kelengkapan", async () => {
    const t = convexTest(schema, modules);
    const { staff } = await seedStaff(t, "Pengelola Foto", "foto@sumenep.co.id");
    const vendorId = (await seedVendor(t, { name: "Tanpa PhotoId" })) as Id<"vendors">;
    // Baris lawas: dibuat sebelum `moderationStatus` ada, jadi field-nya
    // tidak ada sama sekali. Penyempitan "hanya yang approved" ala indeks
    // `byModeration` tidak melihat baris ini dan akan menuduh listing
    // kekurangan foto.
    await insert(t, "vendorPhotos", {
      vendorId,
      storageId: "storage-lawas",
      active: true,
      createdAt: Date.now(),
    });

    const metrics = await staff.query(api.community.listCommunityMetrics, {});
    expect(metrics.listingsWithoutPhotos).toBe(0);
    expect(metrics.listingsWithPhotos).toBe(1);
  });
});
