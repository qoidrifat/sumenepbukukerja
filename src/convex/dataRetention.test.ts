/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { RETENTION_LIMITS } from "./dataRetention";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Retensi data yang tumbuh sendiri.
 *
 * Yang dikunci di sini bukan "bisa menghapus baris" — itu remeh. Yang dikunci
 * adalah dua hal yang bisa merusak dan tidak akan terlihat kalau tidak diuji:
 *
 *  1. Pemangkasan akun anonim TIDAK boleh menyentuh apa pun yang masih punya
 *     isi. Salah hapus di sini berarti data hilang permanen.
 *  2. Batas retensi harus benar-benar ditegakkan, baik batas usia maupun batas
 *     jumlah. Salah di sini berarti tabelnya kembali tumbuh tanpa batas.
 *
 * Catatan soal usia: `convex-test` selalu menulis `_creationTime` = sekarang,
 * jadi tidak ada cara membuat baris yang "sudah tua". Karena itu tes usia
 * memakai `retentionDays` negatif — `cutoff` jadi di masa depan dan semua baris
 * dianggap sudah lewat jendelanya. Itu jalur kode yang sama persis, bukan
 * cabang lain.
 */

const OLD = { retentionDays: -1 };

async function seedAnonymous(
  t: ReturnType<typeof convexTest>,
  extra: { email?: string } = {},
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      isAnonymous: true,
      ...(extra.email ? { email: extra.email } : {}),
    });
    const accountId = await ctx.db.insert("authAccounts", {
      userId,
      provider: "anonymous",
      providerAccountId: `anon-${userId}`,
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 24 * 60 * 60 * 1000,
    });
    const tokenId = await ctx.db.insert("authRefreshTokens", {
      sessionId,
      expirationTime: Date.now() + 24 * 60 * 60 * 1000,
    });
    return { userId, accountId, sessionId, tokenId };
  });
}

async function countRows(t: ReturnType<typeof convexTest>, table: string) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      query: (table: string) => { collect: () => Promise<unknown[]> };
    };
    return (await db.query(table).collect()).length;
  });
}

describe("retensi akun anonim", () => {
  test("akun anonim yang lewat jendela dihapus bersama sesi dan tokennya", async () => {
    const t = convexTest(schema, modules);
    await seedAnonymous(t);

    const result = await t.mutation(internal.dataRetention.pruneAnonymousAccounts, OLD);

    expect(result.users).toBe(1);
    expect(result.accounts).toBe(1);
    expect(result.sessions).toBe(1);
    expect(result.refreshTokens).toBe(1);
    expect(await countRows(t, "users")).toBe(0);
    expect(await countRows(t, "authAccounts")).toBe(0);
    expect(await countRows(t, "authSessions")).toBe(0);
    expect(await countRows(t, "authRefreshTokens")).toBe(0);
  });

  test("akun yang masih di dalam jendela disisakan", async () => {
    const t = convexTest(schema, modules);
    await seedAnonymous(t);

    // Jendela normal (7 hari): baris yang baru saja ditulis masih muda.
    const result = await t.mutation(internal.dataRetention.pruneAnonymousAccounts, {});

    expect(result.keptRecent).toBe(1);
    expect(result.users).toBe(0);
    expect(await countRows(t, "users")).toBe(1);
    expect(await countRows(t, "authSessions")).toBe(1);
  });

  test("akun yang punya email tidak pernah dihapus, sekalipun sudah tua", async () => {
    const t = convexTest(schema, modules);
    await seedAnonymous(t, { email: "warga@sumenep.co.id" });

    const result = await t.mutation(internal.dataRetention.pruneAnonymousAccounts, OLD);

    expect(result.users).toBe(0);
    expect(await countRows(t, "users")).toBe(1);
  });

  test("akun anonim yang sudah memilih ikut notifikasi disisakan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedAnonymous(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("notificationPreferences", {
        userId,
        whatsappPhone: "628123456789",
        whatsappUpdates: true,
        whatsappOptInAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.mutation(internal.dataRetention.pruneAnonymousAccounts, OLD);

    // Nomor WhatsApp yang sudah opt-in berarti akunnya benar-benar dipakai.
    // Menghapusnya akan membuat opt-in itu menggantung tanpa pemilik.
    expect(result.keptOwned).toBe(1);
    expect(result.users).toBe(0);
    expect(await countRows(t, "users")).toBe(1);
  });

  test("akun tanpa email yang masih meninggalkan jejak disisakan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedAnonymous(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("adminPresence", { userId, lastSeenAt: Date.now() });
    });

    const result = await t.mutation(internal.dataRetention.pruneAnonymousAccounts, OLD);

    // Fail-closed: begitu ada satu saja baris yang menunjuk akun ini, akunnya
    // disisakan. Menyisakan satu akun sampah jauh lebih murah daripada
    // menghapus data yang ternyata masih dipakai.
    expect(result.keptOwned).toBe(1);
    expect(result.users).toBe(0);
    expect(await countRows(t, "users")).toBe(1);
  });

  test("batchSize membatasi jumlah DOKUMEN yang dihapus, bukan jumlah akun", async () => {
    const t = convexTest(schema, modules);
    for (let index = 0; index < 5; index += 1) {
      await seedAnonymous(t);
    }

    // Satu akun anonim membawa 4 dokumen (user + account + session + token),
    // jadi `batchSize: 2` habis di akun pertama dan pemangkasan berhenti di
    // situ. Itu memang yang dimaksud "batas kerja per pemanggilan": yang
    // dibatasi adalah jumlah tulisan, bukan jumlah akun yang dilewati.
    const result = await t.mutation(internal.dataRetention.pruneAnonymousAccounts, {
      retentionDays: -1,
      batchSize: 2,
    });

    expect(result.users).toBe(1);
    expect(await countRows(t, "users")).toBe(4);
    // Sisanya menunggu jalan berikutnya dalam hari yang sama.
    expect(result.keptRecent).toBe(0);
  });

  test("scanned melaporkan berapa kandidat yang diperiksa, bukan berapa yang dihapus", async () => {
    const t = convexTest(schema, modules);
    await seedAnonymous(t);
    await seedAnonymous(t);

    const result = await t.mutation(internal.dataRetention.pruneAnonymousAccounts, OLD);
    expect(result.scanned).toBe(2);
  });
});

describe("retensi riwayat aplikasi", () => {
  test("auditLogs dipangkas menurut batas jumlah lebih dulu", async () => {
    const t = convexTest(schema, modules);
    const overflow = 3;
    await t.run(async (ctx) => {
      for (let index = 0; index < RETENTION_LIMITS.auditKeepLatest + overflow; index += 1) {
        await ctx.db.insert("auditLogs", {
          action: "listing.published",
          createdAt: Date.now() - index,
        });
      }
    });

    await t.mutation(internal.dataRetention.pruneApplicationHistory, {});

    expect(await countRows(t, "auditLogs")).toBe(RETENTION_LIMITS.auditKeepLatest);
  });

  test("auditLogs dipangkas menurut batas usia walau jumlahnya masih sedikit", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        action: "listing.published",
        createdAt: Date.now() - (RETENTION_LIMITS.auditDays + 1) * 24 * 60 * 60 * 1000,
      });
      await ctx.db.insert("auditLogs", { action: "admin.logout", createdAt: Date.now() });
    });

    await t.mutation(internal.dataRetention.pruneApplicationHistory, {});

    const rows = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("admin.logout");
  });

  test("errorReports dibatasi 500 baris sekaligus 90 hari", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("errorReports", {
        reportId: "ERR-LAMA",
        fingerprint: "AAAAAAA",
        severity: "critical",
        status: "open",
        errorCode: "RUNTIME_ERROR",
        title: "Laporan lama",
        message: "lama",
        feature: "Application Shell",
        operation: "RootErrorBoundary",
        source: "client",
        retryable: false,
        recommendedAction: "Periksa",
        environment: "production",
        occurrences: 1,
        firstSeenAt: Date.now(),
        lastSeenAt:
          Date.now() - (RETENTION_LIMITS.errorReportDays + 1) * 24 * 60 * 60 * 1000,
        alertStatus: "queued",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const before = await countRows(t, "errorReports");
    await t.mutation(internal.dataRetention.pruneApplicationHistory, {});
    const after = await countRows(t, "errorReports");

    expect(after).toBeLessThanOrEqual(Math.min(before, RETENTION_LIMITS.errorReportKeepLatest));
  });

  test("analyticsEvents dipangkas menurut batas usia, dan angkanya tetap di penghitung", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 4; index += 1) {
        await ctx.db.insert("analyticsEvents", {
          event: "listing_opened",
          createdAt: Date.now() - (RETENTION_LIMITS.analyticsDays + 1) * 24 * 60 * 60 * 1000,
        });
      }
      await ctx.db.insert("analyticsEvents", {
        event: "listing_opened",
        createdAt: Date.now(),
      });
    });

    await t.mutation(internal.dataRetention.pruneApplicationHistory, {});

    expect(await countRows(t, "analyticsEvents")).toBe(1);

    // Barisnya hilang, tapi `analyticsCounters` adalah angka lain yang berdiri
    // sendiri — justru itu alasan log mentahnya boleh dipangkas seagresif ini.
    const counters = await t.run(
      async (ctx) => await ctx.db.query("analyticsCounters").collect(),
    );
    expect(counters.find((row) => row.key === "listing_opened")).toBeUndefined();
  });

  test("nilai batasnya terkunci supaya tidak diam-diam melebar", () => {
    expect(RETENTION_LIMITS).toEqual({
      anonymousDays: 7,
      auditKeepLatest: 2_000,
      auditDays: 180,
      errorReportKeepLatest: 500,
      errorReportDays: 90,
      analyticsDays: 90,
      analyticsKeepLatest: 20_000,
      whatsappDeliveredDays: 30,
    });
  });

  test("pengiriman WhatsApp yang belum berakhir tidak pernah dihapus", async () => {
    const t = convexTest(schema, modules);
    const old = Date.now() - (RETENTION_LIMITS.whatsappDeliveredDays + 1) * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      for (const status of ["delivered", "failed", "queued", "sent"] as const) {
        await ctx.db.insert("whatsappDeliveries", {
          deliveryKey: `key-${status}`,
          status,
          attempts: 1,
          title: "Notifikasi",
          body: "Isi",
          createdAt: old,
          updatedAt: old,
        });
      }
    });

    await t.mutation(internal.dataRetention.pruneApplicationHistory, {});

    const rows = await t.run(
      async (ctx) => await ctx.db.query("whatsappDeliveries").collect(),
    );
    const remaining = rows.map((row) => row.status).sort();

    // `queued` dan `sent` bertahan walaupun tuanya berapa pun: baris itu
    // menandakan kiriman yang menggantung, dan itu justru yang perlu diperiksa.
    expect(remaining).toEqual(["queued", "sent"]);
  });
});

const DAY = 24 * 60 * 60_000;

describe("retensi data keamanan ruang pengelola", () => {
  test("percobaan kedaluwarsa dibuang, yang baru dipertahankan", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "lama",
        outcome: "failed",
        createdAt: now - 40 * DAY,
      });
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "baru",
        outcome: "failed",
        createdAt: now - 60_000,
      });
    });

    const removed = await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {
      keepLatest: 500,
      retentionDays: 30,
    });
    expect(removed).toBe(1);

    const left = await t.run(async (ctx) => {
      const rows = await ctx.db.query("adminPasscodeAttempts").collect();
      return rows.map((row) => row.key);
    });
    // Baris yang belum kedaluwarsa tidak boleh ikut terhapus, meskipun jumlahnya
    // sedikit. Salah di sini berarti jejak audit hilang sebelum waktunya.
    expect(left).toEqual(["baru"]);
  });

  test("nonce relay kedaluwarsa dibuang, yang masih hidup dipertahankan", async () => {
    // Tabel ini tidak punya jalur pemangkasan sendiri. Tanpa penyiangan di
    // sini, satu baris baru masuk setiap permintaan relay dan tidak pernah
    // keluar: tabel yang tumbuh tanpa batas.
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("adminRelayNonces", {
        nonce: "a".repeat(32),
        createdAt: now - 60 * 60_000,
        expiresAt: now - 60 * 60_000,
      });
      await ctx.db.insert("adminRelayNonces", {
        nonce: "b".repeat(32),
        createdAt: now,
        expiresAt: now + 10 * 60_000,
      });
    });

    await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {});

    const left = await t.run(async (ctx) => {
      const rows = await ctx.db.query("adminRelayNonces").collect();
      return rows.map((row) => row.nonce);
    });
    // Nonce yang masih hidup harus tetap ada: menghapusnya membuka reuse,
    // karena claim berikutnya akan otomatis menang.
    expect(left).toEqual(["b".repeat(32)]);
  });

  test("konteks yang belum kedaluwarsa tidak ikut terhapus", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("adminSecurityContexts", {
        token: "lama",
        requestId: "req_lama",
        ipSource: "Vercel Edge",
        createdAt: now - 60 * 60_000,
        expiresAt: now - 1_000,
      });
      await ctx.db.insert("adminSecurityContexts", {
        token: "masih-hidup",
        requestId: "req_baru",
        ipSource: "Vercel Edge",
        createdAt: now,
        expiresAt: now + 10 * 60_000,
      });
    });

    await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {});

    const left = await t.run(async (ctx) => {
      const rows = await ctx.db.query("adminSecurityContexts").collect();
      return rows.map((row) => row.token);
    });
    expect(left).toEqual(["masih-hidup"]);
  });

  test("pembersihan berulang tidak merusak dan tidak menghapus apa pun lagi", async () => {
    // Cron harian bisa berjalan dua kali untuk hari yang sama, atau dijalankan
    // ulang setelah kegagalan. Pembersihan harus idempotent.
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "lama",
        outcome: "failed",
        createdAt: now - 40 * DAY,
      });
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "baru",
        outcome: "failed",
        createdAt: now,
      });
      await ctx.db.insert("adminRelayNonces", {
        nonce: "c".repeat(32),
        createdAt: now - 60 * 60_000,
        expiresAt: now - 1_000,
      });
    });

    const pertama = await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {
      retentionDays: 30,
    });
    const kedua = await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {
      retentionDays: 30,
    });
    expect(pertama).toBe(1);
    expect(kedua).toBe(0);

    const sisa = await t.run(async (ctx) => ({
      percobaan: (await ctx.db.query("adminPasscodeAttempts").collect()).map((r) => r.key),
      nonce: (await ctx.db.query("adminRelayNonces").collect()).map((r) => r.nonce),
    }));
    expect(sisa.percobaan).toEqual(["baru"]);
    expect(sisa.nonce).toEqual([]);
  });
});
