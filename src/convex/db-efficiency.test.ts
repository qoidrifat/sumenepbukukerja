/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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
