/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { ANALYTICS_COUNTER_KEYS } from "./analytics";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Penghitung peristiwa analitik.
 *
 * Alasan tabel penghitung ini ada: `analyticsEvents` adalah log mentah yang
 * tumbuh sendiri, sedangkan dashboard admin cuma butuh JUMLAHNYA per jenis.
 * Menghitung dari log berarti membaca seluruh tabel setiap kali dashboard
 * dibuka. Yang diuji di sini adalah kontraknya: angka tetap benar walau log
 * mentahnya sudah dipangkas, dan `adminMetrics` benar-benar membaca penghitung,
 * bukan menghitung ulang dari log.
 */

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", { name: "Pengelola", email: "admin@sumenep.co.id" });
    await ctx.db.insert("staffMembers", {
      userId: id,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  });
  return { userId, admin: t.withIdentity({ subject: userId }) };
}

describe("penghitung peristiwa analitik", () => {
  test("setiap peristiwa menambah satu, dan pengulangan menambah terus", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.analytics.track, { event: "listing_opened" });
    await t.mutation(api.analytics.track, { event: "listing_opened" });
    await t.mutation(api.analytics.track, { event: "whatsapp_clicked" });

    const counters = await t.run(
      async (ctx) => await ctx.db.query("analyticsCounters").collect(),
    );
    const byKey = Object.fromEntries(counters.map((row) => [row.key, row.count]));
    expect(byKey.listing_opened).toBe(2);
    expect(byKey.whatsapp_clicked).toBe(1);

    // Satu baris penanda per jenis peristiwa — bukan satu baris per kejadian.
    expect(counters).toHaveLength(2);
  });

  test("adminMetrics membaca penghitung, bukan menghitung ulang dari log", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);

    await t.mutation(api.analytics.track, { event: "listing_opened" });
    await t.mutation(api.analytics.track, { event: "search_impression" });

    const before = await admin.query(api.analytics.adminMetrics, {});
    expect(before.events.listingOpened).toBe(1);
    expect(before.events.searchImpression).toBe(1);

    // Hapus seluruh log mentahnya. Kalau `adminMetrics` masih membaca log,
    // angkanya jadi nol dan tes ini gagal.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("analyticsEvents").collect()) {
        await ctx.db.delete(row._id);
      }
    });

    const after = await admin.query(api.analytics.adminMetrics, {});
    expect(after.events.listingOpened).toBe(1);
    expect(after.events.searchImpression).toBe(1);
  });

  test("jenis peristiwa yang belum pernah terjadi tampil sebagai nol, bukan hilang", async () => {
    const t = convexTest(schema, modules);
    const { admin } = await seedAdmin(t);

    const metrics = await admin.query(api.analytics.adminMetrics, {});

    // Dashboard membaca daftar tetap, jadi kolomnya tidak berpindah-pindah
    // posisi hanya karena satu jenis peristiwa belum pernah terjadi.
    for (const key of ANALYTICS_COUNTER_KEYS) {
      expect(metrics.events).toHaveProperty(
        key.replace(/_(.)/g, (_, letter: string) => letter.toUpperCase()),
      );
    }
    expect(metrics.events.callClicked).toBe(0);
  });

  test("backfill mengisi penghitung dari log yang sudah ada dan idempoten", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 3; index += 1) {
        await ctx.db.insert("analyticsEvents", {
          event: "listing_opened",
          createdAt: Date.now(),
        });
      }
      await ctx.db.insert("analyticsEvents", { event: "share_clicked", createdAt: Date.now() });
    });

    const first = await t.mutation(internal.analytics.backfillAnalyticsCounters, {});
    expect(first.scanned).toBe(4);
    expect(first.counters).toBe(2);

    // Dijalankan dua kali harus memberi angka yang sama, bukan dua kali lipat.
    await t.mutation(internal.analytics.backfillAnalyticsCounters, {});
    const counters = await t.run(
      async (ctx) => await ctx.db.query("analyticsCounters").collect(),
    );
    const byKey = Object.fromEntries(counters.map((row) => [row.key, row.count]));
    expect(byKey.listing_opened).toBe(3);
    expect(byKey.share_clicked).toBe(1);
  });

  test("penghitung tetap utuh setelah log mentahnya dipangkas retensi", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.analytics.track, { event: "listing_opened" });
    await t.run(async (ctx) => {
      // Baris lama yang jauh di luar jendela retensi.
      await ctx.db.insert("analyticsEvents", {
        event: "listing_opened",
        createdAt: Date.now() - 200 * 24 * 60 * 60 * 1000,
      });
    });
    await t.mutation(internal.analytics.backfillAnalyticsCounters, {});

    await t.mutation(internal.dataRetention.pruneApplicationHistory, {});

    const events = await t.run(async (ctx) => await ctx.db.query("analyticsEvents").collect());
    expect(events).toHaveLength(1);

    const counters = await t.run(
      async (ctx) => await ctx.db.query("analyticsCounters").collect(),
    );
    expect(counters.find((row) => row.key === "listing_opened")?.count).toBe(2);
  });
});
