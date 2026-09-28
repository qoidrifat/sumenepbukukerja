/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Cadangan yang hanya "berhasil ditulis" belum tentu berguna.
 *
 * Kegunaan cadangan baru terbukti kalau isinya bisa dipakai mengembalikan
 * data: jumlahnya cocok dengan tabel asalnya, barisnya masih punya medan yang
 * dibutuhkan untuk prioritisecca pulih, dan cadangan terbaru bisa ditemukan
 * tanpa menebak nama berkas.
 */

type BackupPayload = {
  weekKey: string;
  generatedAt: string;
  vendors?: unknown[];
  reports?: unknown[];
  auditLogs?: unknown[];
};

async function readBackup(
  t: ReturnType<typeof convexTest>,
  storageId: string,
): Promise<BackupPayload | null> {
  return await t.run(async (ctx) => {
    const blob = await ctx.storage.get(storageId as never);
    return blob ? (JSON.parse(await blob.text()) as BackupPayload) : null;
  });
}

async function seedRecoverableData(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", { name: "Pemilik Cadangan", email: "cadangan@sumenep.co.id" });
  });
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    await db.insert("vendors", {
      name: "Toko Merah",
      slug: "toko-merah",
      category: "Kuliner",
      landmark: "Banda",
      status: "active",
      ownerId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert("reports", {
      vendorId: null,
      requestId: null,
      reporterId: userId,
      reason: "Spam",
      details: "Listing muncul dua kali.",
      status: "open",
      severity: "low",
      kind: "other",
      fingerprint: "fp-cadangan-uji",
      occurrences: 1,
      reportId: "ERR-20260101-ABCDE",
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("auditLogs", {
      action: "listing.created",
      entityId: "entitas-uji",
      createdAt: Date.now(),
    });
  });
  return { userId };
}

describe("cadangan bisa dipakai sebagai sumber pemulihan", () => {
  test("jumlah baris di cadangan persis sama dengan tabel asalnya", async () => {
  // Kalau satu tabel diam-diam tidak ikut, operator baru akan menemukan
  // hal itu saat benar-benar butuh memulihkan.
    const t = convexTest(schema, modules);
    await seedRecoverableData(t);

    const run = await t.action(internal.storage.writeWeeklyBackup, {});
    expect(run.skipped).toBe(false);

    const [row] = await t.run(async (ctx) => await ctx.db.query("backupRuns").collect());
    const payload = await readBackup(t, row!.storageId as string);
    const live = await t.run(async (ctx) => ({
      vendors: await ctx.db.query("vendors").collect(),
      reports: await ctx.db.query("reports").collect(),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(payload?.vendors).toHaveLength(live.vendors.length);
    expect(payload?.reports).toHaveLength(live.reports.length);
    expect(payload?.auditLogs).toHaveLength(live.auditLogs.length);
    // Dan angkanya di baris metadata ikut jujur, bukan hanya isi filenya.
    // `tableCounts` adalah `v.record`, yang tidak punya bentuk baris di tipos
    // generated, jadi dibaca lewat bentuk yang memang dikembalikan server.
    const counts: Record<string, number> =
      (row as unknown as { tableCounts?: Record<string, number> })?.tableCounts ?? {};
    expect(counts.vendors).toBe(live.vendors.length);
    expect(counts.reports).toBe(live.reports.length);
  });

  test("setiap baris membawa medan yang dibutuhkan untuk memulihkan", async () => {
    // Pemulihan butuh medan yang bisa dicari ulang, bukan hanya nama tampilan.
    // Kolom `_id` sengaja tidak diandalkan: id berubah antar deployment.
    const t = convexTest(schema, modules);
    await seedRecoverableData(t);
    const run = await t.action(internal.storage.writeWeeklyBackup, {});
    const [row] = await t.run(async (ctx) => await ctx.db.query("backupRuns").collect());
    const payload = await readBackup(t, row!.storageId as string);

    const vendor = (payload?.vendors ?? [])[0] as Record<string, unknown>;
    expect(vendor).toMatchObject({ slug: "toko-merah", name: "Toko Merah", status: "active" });
    expect(vendor.ownerId).toBeTruthy();

    const report = (payload?.reports ?? [])[0] as Record<string, unknown>;
    expect(report).toMatchObject({ reportId: "ERR-20260101-ABCDE", fingerprint: "fp-cadangan-uji" });

    const audit = (payload?.auditLogs ?? [])[0] as Record<string, unknown>;
    expect(audit).toMatchObject({ action: "listing.created", entityId: "entitas-uji" });
    expect(run.weekKey).toBeTruthy();
  });

  test("cadangan terbaru bisa ditemukan tanpa menebak nama berkas", async () => {
    // Pemulihan dimulai dari "mana cadangan terbaru?" — kalau itu butuh
    // pengetahuan lokal, runbook-nya tidak berguna saat darurat.
    const t = convexTest(schema, modules);
    await seedRecoverableData(t);
    const run = await t.action(internal.storage.writeWeeklyBackup, {});

    const latest = await t.query(internal.storage.latestBackupRuns, {});
    expect(latest[0]?.weekKey).toBe(run.weekKey);
    expect(latest[0]?.status).toBe("ok");
    expect(latest[0]?.storageId).toBeTruthy();
    expect(latest[0]?.finishedAt).toBeGreaterThan(0);

    // Dan isinya benar-benar bisa dibaca dari storageId yang ditemukan itu.
    const payload = await readBackup(t, latest[0]!.storageId as string);
    expect(payload?.weekKey).toBe(run.weekKey);
    expect(payload?.vendors).toHaveLength(1);
    expect(payload?.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("tabel kecil tidak ditandai terpotong", async () => {
    // Penanda `<tabel>_truncated` ada supaya pembaca tahu isinya tidak penuh.
    // Kalau muncul di tabel kecil, pembaca akan saling menyalahkan tanpa alasan.
    const t = convexTest(schema, modules);
    await seedRecoverableData(t);
    const run = await t.action(internal.storage.writeWeeklyBackup, {});
    const [row] = await t.run(async (ctx) => await ctx.db.query("backupRuns").collect());
    const payload = (await readBackup(t, row!.storageId as string)) as Record<string, unknown>;
    const truncated = Object.keys(payload).filter((key) => key.endsWith("_truncated"));
    expect(truncated).toEqual([]);
    expect(run.skipped).toBe(false);
  });
});
