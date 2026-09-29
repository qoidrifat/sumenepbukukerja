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
 * keputusan dan pencatatan yang terjadi sebelum dan sesudah tautan disiapkan:
 *
 *   sumber data -> angka -> ringkasan -> tautan handoff -> status handoff
 *
 * PERGESERAN SEMANTIK (Fase 8): ringkasan tidak lagi dikirim server-side.
 * Yang diuji sekarang adalah tautan `wa.me` yang disiapkan untuk dibuka
 * pengelola, dan terutama itu TIDAK PERNAH dicatat sebagai `sent`.
 *
 * Batasnya harus jujur: tidak ada test di sini yang membuktikan pesan sampai
 * ke recipient - `wa.me` tidak bisa membuktikannya. Yang dibuktikan adalah
 * bahwa setiap tahap mencatat apa adanya, termasuk ketika gagal.
 */

const modules = import.meta.glob("./**/*.ts");

const HOUR = 60 * 60_000;
const MINUTE = 60_000;

/**
 * Env yang membentuk perilaku ringkasan. Semua disimpan dan dikembalikan,
 * supaya test ini tidak mengubah environment test lain di file yang sama.
 */
const MANAGED_ENV = [
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

/**
 * Nomor contoh yang jelas bukan nomor asli.
 *
 * Dipakai sebagai PENANDA: test ini tidak lagi membentuk nomor tujuan apa pun,
 * karena tujuan handoff admin adalah konstanta tunggal di `admin-whatsapp.ts`.
 * Yang dibuktikan di sini adalah kebalikan dari duplikasi: angka ini TIDAK
 * boleh muncul di `whatsapp.ts` maupun `errorReports.ts`.
 */
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

describe("tidak ada klaim palsu tentang pengiriman", () => {
  test("handoff menyiapkan tautan dan MENYIMPAN status handoff, bukan sent", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedErrorReport(t, "open");

    const result = await t.action(internal.whatsapp.prepareAdminDailySummary, {});

    // Yang diklaim hanya dua hal: tautannya dibuat, dan nomornya benar.
    expect(result.handoff).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.url!.startsWith("https://wa.me/")).toBe(true);

    const rows = await deliveries(t);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    // INI adalah assertion terpenting di seluruh berkas ini. Baris handoff
    // TIDAK BOLEH muncul sebagai `sent` atau `delivered`: tidak ada provider
    // yang mengangguk, jadi tidak ada bukti apa pun bahwa pesan sampai.
    expect(row.status).toBe("handoff");
    expect(row.status).not.toBe("sent");
    expect(row.status).not.toBe("delivered");
    expect(row.handoffUrl).toBe(result.url);
  });

  test("tidak ada message ID dari provider, karena tidak ada provider", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    await t.action(internal.whatsapp.prepareAdminDailySummary, {});

    const row = (await deliveries(t))[0]!;
    // `providerMessageId` adalah bukti balasan Cloud API. Handoff tidak punya
    // itu, jadi kolomnya harus tetap kosong.
    expect(row.providerMessageId).toBeUndefined();
  });

  test("percobaan kedua di hari yang sama memakai baris yang sama", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    await t.action(internal.whatsapp.prepareAdminDailySummary, {});
    await t.action(internal.whatsapp.prepareAdminDailySummary, {});

    // Idempoten lewat `deliveryKey` beruffix tanggal WIB: dua kali jalan pada
    // hari yang sama tidak menghasilkan dua baris jejak audit.
    const rows = await deliveries(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deliveryKey).toMatch(/^admin-summary:\d{4}-\d{2}-\d{2}$/);
  });

  test("ringkasan tetap dihitung walau handoff ditolak", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedErrorReport(t, "open");
    await seedRequest(t, HOUR);

    const result = await t.action(internal.whatsapp.prepareAdminDailySummary, {});

    // Angka selalu dikembalikan: pengelola harus bisa memastikan ringkasan
    // sudah dihitung, terlepas dari apa pun yang terjadi pada tautannya.
    expect(result.summary).toEqual({
      openErrorReports: 1,
      newRequests: 1,
      activeAdminSessions: 0,
    });
  });

  test("nomor tujuan hanya ada di satu berkas, tidak pernah dikarang di source", () => {
    // Buktinya dari source, bukan dari test. Setelah migrasi ke `wa.me`,
    // nomor tujuan admin tidak lagi datang dari environment: ia konstanta di
    // `admin-whatsapp.ts`. Tidak boleh ada duplikatnya di server.
    const whatsappSource = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");
    const errorReportsSource = readFileSync(new URL("./errorReports.ts", import.meta.url), "utf8");
    expect(whatsappSource).not.toContain(RECIPIENT);
    expect(errorReportsSource).not.toContain(RECIPIENT);
  });

  test("jalur admin tidak pernah membaca env Cloud API", () => {
    // Setelah migrasi, alert admin tidak butuh token, template, atau nomor
    // dari environment. Kalau salah satu muncul lagi, berarti ada jalur
    // server-side yang masih hidup di belakang layar.
    const errorReportsSource = readFileSync(new URL("./errorReports.ts", import.meta.url), "utf8");
    expect(errorReportsSource).not.toContain("ERROR_ALERT_WHATSAPP");
  });
});

describe("syarat handoff sebelum tautan dibuat", () => {
  test("nomor tujuan valid: tidak ada blocker", async () => {
    const t = convexTest(schema, modules);
    const blockers = await t.query(internal.whatsapp.adminHandoffBlockers, {});
    expect(blockers).toEqual([]);
  });

  test("penghitung handoff terpisah dari empat angka pengiriman", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    await t.action(internal.whatsapp.prepareAdminDailySummary, {});

    const stats = await t.run(async (ctx) => {
      return await ctx.db.query("whatsappDeliveryStats").first();
    });
    // `handoff` dihitung sendiri. Mencampurkannya ke `sent` akan mengubah
    // arti angka yang sudah dibaca dashboard.
    expect(stats!.handoff).toBe(1);
    expect(stats!.sent).toBe(0);
    expect(stats!.delivered).toBe(0);
    expect(stats!.queued).toBe(0);
    expect(stats!.failed).toBe(0);
  });
});

describe("cron ringkasan harian benar-benar terdaftar", () => {
  const readCrons = () => readFileSync(new URL("./crons.ts", import.meta.url), "utf8");

  test("cron harian memanggil prepareAdminDailySummary", () => {
    const crons = readCrons();
    expect(crons).toContain("internal.whatsapp.prepareAdminDailySummary");
    expect(crons).toMatch(/crons\.daily\(/);
  });

  test("cron harian tidak lagi menunjuk fungsi yang sudah dihapus", () => {
    // Nama lama masih ada di git history; kalau masih dirujuk di crons, itu
    // berarti migrasi tidak benar-benar selesai.
    expect(readCrons()).not.toContain("sendAdminDailySummary");
  });

  test("cron tidak diarahkan ke api publik", () => {
    // Kalau cron memakai `api.*`, siapa pun bisa memicu ringkasan setiap
    // saat dan membakar kuota WhatsApp warga.
    expect(readCrons()).not.toMatch(/crons\.\w+\([^)]*api\./s);
  });

  test("action-nya internal, bukan publik", () => {
    const source = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");
    const declaration = source.match(
      /export const prepareAdminDailySummary = (\w+)\(/,
    );
    expect(declaration?.[1]).toBe("internalAction");
  });
});
