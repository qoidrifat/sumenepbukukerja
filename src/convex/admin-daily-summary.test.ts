/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

/**
 * Ringkasan harian admin (backlog item 11).
 *
 * Item ini punya cron, punya implementation, dan punya cron meta-test untuk
 * pemangkas retensi - tapi SAMPA FASE 6 TIDAK PERNAH punya satu pun test yang
 * menjalankan logikanya. Kegagalan di sini adalah keheningan: ringkasan bisa
 * diam-diam mengirim angka nol, melewatkan admin, atau melaporkan "terkirim"
 * padahal provider menolaknya, dan tidak ada yang gagal.
 *
 * Berkas ini menutup gap itu TANPA kredensial apa pun. Yang diuji murni
 * keputusan dan pencatatan yang terjadi sebelum dan sesudah provider dipanggil:
 *
 *   sumber data -> angka -> ringkasan -> payload -> status pengiriman
 *
 * Batasnya harus jujur: tidak ada test di sini yang membuktikan pesan sampai
 * ke recipient. Yang dibuktikan adalah bahwa setiap tahap reporting truthfully,
 * termasuk ketika gagal.
 */

const modules = import.meta.glob("./**/*.ts");

const HOUR = 60 * 60_000;
const MINUTE = 60_000;

/**
 * Env yang membentuk perilaku ringkasan. Semua disimpan dan dikembalikan,
 * supaya test ini tidak mengubah environment test lain di file yang sama.
 */
const MANAGED_ENV = [
  "ERROR_ALERT_WHATSAPP",
  "WHATSAPP_PROVIDER",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TEMPLATE_NAME",
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const name of MANAGED_ENV) savedEnv[name] = process.env[name];
  // Default: provider TIDAK dikonfigurasi. Semua test di sini memakai default
  // ini kecuali yang disebut eksplisit, jadi "provider menolak" adalah keadaan
  // normal yang diuji, bukan pengecualian.
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TEMPLATE_NAME;
});

afterEach(() => {
  for (const name of MANAGED_ENV) {
    const original = savedEnv[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

type TestCtx = ReturnType<typeof convexTest>;
type LooseDb = { insert: (table: string, doc: Record<string, unknown>) => Promise<string> };

/** Nomor contoh yang jelas bukan nomor asli. Hanya untuk membentuk payload. */
const RECIPIENT = "6280000000000";

/**
 * Satu baris `errorReports` dengan status yang bisa dipilih.
 *
 * Dipakai langsung lewat `ctx.db.insert` supaya test tidak bergantung pada
 * alur pelaporan lengkap - yang diuji di `error-aggregation.test.ts`. Di sini
 * yang penting hanyalah kolom `status`, karena `adminDailySummaryCounts`
 * membacanya lewat index `byStatus`.
 */
async function seedErrorReport(
  t: TestCtx,
  status: "open" | "acknowledged" | "resolved" | "ignored",
) {
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as LooseDb;
    const now = Date.now();
    await db.insert("errorReports", {
      reportId: `uji-${status}`,
      fingerprint: `uji-${status}`,
      severity: "error",
      status,
      errorCode: "UJI",
      title: `Laporan uji ${status}`,
      message: "Pesan uji.",
      feature: "Ringkasan Harian",
      operation: "uji",
      source: "server",
      retryable: true,
      recommendedAction: "periksa",
      environment: "test",
      occurrences: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      alertStatus: "skipped",
      createdAt: now,
      updatedAt: now,
    });
  });
}

/**
 * Satu pengguna. Tabel `users` berdiri sendiri dari tabel auth, jadi
 * `withIdentity` TIDAK membuat baris di sini - disisipkan langsung.
 */
async function seedUser(t: TestCtx) {
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as LooseDb;
    await db.insert("users", { name: "Admin Uji", role: "admin" });
  });
}

async function firstUserId(t: TestCtx) {
  return await t.run(async (ctx) => (await ctx.db.query("users").first())!._id);
}

/** Satu permintaan warga; `createdAt` menentukan apakah masuk hitungan 24 jam. */
async function seedRequest(t: TestCtx, ageMs: number) {
  const requesterId = await firstUserId(t);
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as LooseDb;
    await db.insert("serviceRequests", {
      requesterId,
      title: "Butuh bantuan",
      description: "Deskripsi.",
      category: "Servis Teknik",
      landmark: "kalianget",
      status: "open",
      createdAt: Date.now() - ageMs,
      updatedAt: Date.now() - ageMs,
    });
  });
}

/** Kehadiran admin; `lastSeenAt` menentukan apakah dihitung sebagai aktif. */
async function seedPresence(t: TestCtx, ageMs: number) {
  const userId = await firstUserId(t);
  await t.run(async (ctx) => {
    const db = ctx.db as unknown as LooseDb;
    await db.insert("adminPresence", { userId, lastSeenAt: Date.now() - ageMs });
  });
}

async function deliveries(t: TestCtx) {
  return await t.run(async (ctx) => await ctx.db.query("whatsappDeliveries").collect());
}

describe("angka ringkasan harian sesuai sumber data", () => {
  test("ketiga angka dihitung dari tabelnya masing-masing", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedErrorReport(t, "open");
    await seedErrorReport(t, "open");
    await seedRequest(t, HOUR);
    await seedPresence(t, MINUTE);

    const summary = await t.query(internal.whatsapp.adminDailySummaryCounts, {});

    expect(summary.openErrorReports).toBe(2);
    expect(summary.newRequests).toBe(1);
    expect(summary.activeAdminSessions).toBe(1);
  });

  test("hanya laporan berstatus open yang dihitung, bukan seluruh tabel", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedErrorReport(t, "open");
    await seedErrorReport(t, "acknowledged");
    await seedErrorReport(t, "resolved");
    await seedErrorReport(t, "ignored");

    const summary = await t.query(internal.whatsapp.adminDailySummaryCounts, {});

    // Satu saja. Kalau ini menghitung semua baris, hasilnya 4 - dan angka 4
    // akan terkirim ke admin setiap pagi tanpa pernah melempar error.
    expect(summary.openErrorReports).toBe(1);
  });

  test("permintaan di luar 24 jam tidak dihitung", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedRequest(t, 30 * 60_000);
    await seedRequest(t, 23 * HOUR);
    await seedRequest(t, 25 * HOUR);

    const summary = await t.query(internal.whatsapp.adminDailySummaryCounts, {});

    expect(summary.newRequests).toBe(2);
  });

  test("sesi admin yang sudah lama tidak dihitung sebagai aktif", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedPresence(t, 2 * MINUTE);
    await seedPresence(t, 14 * MINUTE);
    await seedPresence(t, 16 * MINUTE);
    await seedPresence(t, 3 * HOUR);

    const summary = await t.query(internal.whatsapp.adminDailySummaryCounts, {});

    // Presence yang lewat 15 menit bukan "sesi aktif". Kalau jendela ini
    // dilonggarkan, admin yang sudah tutup laptop tetap dihitung setiap pagi.
    expect(summary.activeAdminSessions).toBe(2);
  });

  test("basis data kosong menghasilkan angka nol, bukan error", async () => {
    const t = convexTest(schema, modules);
    const summary = await t.query(internal.whatsapp.adminDailySummaryCounts, {});
    expect(summary).toEqual({ openErrorReports: 0, newRequests: 0, activeAdminSessions: 0 });
  });
});

describe("tidak ada false-positive saat pengiriman gagal", () => {
  test("tanpa nomor tujuan: dilewati dengan alasan, tanpa membakar baris delivery", async () => {
    delete process.env.ERROR_ALERT_WHATSAPP;
    const t = convexTest(schema, modules);
    await seedUser(t);

    const result = await t.action(internal.whatsapp.sendAdminDailySummary, {});

    expect(result.sent).toBe(false);
    expect(result.reason).toContain("ERROR_ALERT_WHATSAPP");
    // Angka tetap dikembalikan walau tidak terkirim: admin bisa tetap
    // memastikan ringkasan sudah dihitung.
    expect(result.summary).toBeDefined();
    // Tidak ada nomor yang dikarang, jadi tidak ada jejak pengiriman sama
    // sekali. Baris `queued` di sini berarti sistem mencoba mengirim ke
    // recipient yang tidak ada.
    expect(await deliveries(t)).toEqual([]);
  });

  test("provider menolak: tercatat failed dengan kode, TIDAK pernah sent", async () => {
    process.env.ERROR_ALERT_WHATSAPP = RECIPIENT;
    // Token dan nomor telepon sengaja TIDAK diisi: itu keadaan sebenarnya di
    // lingkungan uji, dan itulah yang harus dicatat dengan jujur.
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedErrorReport(t, "open");

    const result = await t.action(internal.whatsapp.sendAdminDailySummary, {});

    expect(result.sent).toBe(false);
    const rows = await deliveries(t);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // INI adalah assertion terpenting di seluruh berkas ini. Baris yang GAGAL
    // tidak boleh muncul sebagai `sent`, karena itulah yang membuat panel
    // admin menampilkan "terkirim" untuk pesan yang sebenarnya hilang.
    expect(row.status).toBe("failed");
    expect(row.status).not.toBe("sent");
    expect(row.lastErrorCode).toBe("not_configured");
  });

  test("percobaan kedua di hari yang sama memakai baris yang sama", async () => {
    process.env.ERROR_ALERT_WHATSAPP = RECIPIENT;
    const t = convexTest(schema, modules);
    await seedUser(t);

    await t.action(internal.whatsapp.sendAdminDailySummary, {});
    await t.action(internal.whatsapp.sendAdminDailySummary, {});

    // Idempoten lewat `deliveryKey` beruffix tanggal WIB: dua kali jalan pada
    // hari yang sama tidak menghasilkan dua pesan, dan tidak menghasilkan dua
    // baris jejak audit.
    const rows = await deliveries(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deliveryKey).toMatch(/^admin-summary:\d{4}-\d{2}-\d{2}$/);
  });

  test("nomor tujuan dibaca dari environment, tidak pernah dikarang di source", () => {
    // Buktinya dari source, bukan dari test: nomor hanya boleh datang
    // dari environment. ("Tidak ada nomor cadangan" diuji di
    // `alert-recipient-security.test.ts` - di sini cukup syarat positifnya.)
    const source = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");
    expect(source).toContain("process.env.ERROR_ALERT_WHATSAPP");
  });
});

describe("peringatan sebelum mencoba mengirim", () => {
  test("provider meta tanpa template memberi blocker yang menyebut kode Meta", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "token-uji";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    // WHATSAPP_TEMPLATE_NAME sengaja dibiarkan kosong.
    const t = convexTest(schema, modules);

    const blockers = await t.query(internal.whatsapp.adminAlertBlockers, {});

    // Tanpa template, Meta menolak pesan di luar jendela layanan 24 jam dengan
    // kode 131008. Operator harus tahu itu SEBELUM menekan tombol kirim.
    expect(blockers.join(" ")).toContain("131008");
  });

  test("tanpa provider sama sekali, blocker pertama menyebut env yang harus diisi", async () => {
    const t = convexTest(schema, modules);
    const blockers = await t.query(internal.whatsapp.adminAlertBlockers, {});
    expect(blockers.join(" ")).toMatch(/WHATSAPP_ACCESS_TOKEN/);
  });

  test("template terisi: blocker template hilang", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "token-uji";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
    process.env.WHATSAPP_TEMPLATE_NAME = "notifikasi_buku_kerja";
    const t = convexTest(schema, modules);

    const blockers = await t.query(internal.whatsapp.adminAlertBlockers, {});

    expect(blockers.join(" ")).not.toContain("131008");
  });
});

describe("cron ringkasan harian benar-benar terdaftar", () => {
  const readCrons = () => readFileSync(new URL("./crons.ts", import.meta.url), "utf8");

  test("cron harian memanggil sendAdminDailySummary", () => {
    const crons = readCrons();
    expect(crons).toContain("internal.whatsapp.sendAdminDailySummary");
    expect(crons).toMatch(/crons\.daily\(/);
  });

  test("cron tidak diarahkan ke api publik", () => {
    // Kalau cron memakai `api.*`, siapa pun bisa memicu ringkasan setiap
    // saat dan membakar kuota WhatsApp warga.
    expect(readCrons()).not.toMatch(/crons\.\w+\([^)]*api\./s);
  });

  test("action-nya internal, bukan publik", () => {
    const source = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");
    const declaration = source.match(
      /export const sendAdminDailySummary = (\w+)\(/,
    );
    expect(declaration?.[1]).toBe("internalAction");
  });
});
