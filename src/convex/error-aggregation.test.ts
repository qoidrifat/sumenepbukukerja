/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { DEDUPE_WINDOW_MS } from "../lib/error-reporting";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Agregasi laporan error.
 *
 * Aturan yang dikunci di sini sudah ada sejak awal; tujuannya bukan
 * membangun ulang, melainkan memastikan tidak ada refactor berikutnya yang
 * melanggarnya tanpa disadari — karena begitu pecah, panel pengelola akan
 * menampilkan 20 masalah yang sebenarnya satu.
 */

const reportArgs = {
  kind: "integration" as const,
  code: "WHATSAPP_SEND_FAILED",
  feature: "WhatsApp Notification Settings",
  operation: "whatsapp.sendTestWhatsapp",
  message: "Meta menolak pesan. Kode 131008",
  provider: "meta" as const,
  providerCode: "131008",
};

describe("skrip E2E tidak membuang antrean pengelola", () => {
  /**
   * Dua skenario di `e2e/flows.spec.ts` MELEMPAR error sungguhan
   * (ruang nama `e2e:`) supaya dialog pelaporan teruji end-to-end. Rantai
   * penuh sengaja tetap dijalankan — server memang harus menerima laporan
   * dan mengembalikan ID. Yang tidak boleh terjadi: baris-artefak itu
   * mengisi antrean `open` dan membangunkan admin (ERR-20261003-1Y09URI,
   * ERR-20261004-0XRTHMK).
   */
  const e2eArgs = {
    ...reportArgs,
    kind: "operation" as const,
    code: "RUNTIME_ERROR",
    feature: "Unhandled runtime error",
    operation: "window.onerror@unknown",
    message: "e2e: pemeriksa nama aksesibel dialog",
  };

  test("pesan ber-awalan e2e: tersimpan sebagai ignored, bukan open", async () => {
    const t = convexTest(schema, modules);
    const outcome = await t.mutation(api.errorReports.reportError, e2eArgs);
    // Rantai yang diuji E2E tetap utuh: server menjawab dengan ID laporan.
    expect(outcome.reported).toBe(true);
    expect(outcome.reportId).toMatch(/^ERR-/);

    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("ignored");
    expect(rows[0]!.alertStatus).toBe("skipped");
  });

  test("pengulangan e2e digabung tetap ignored dan tidak menjadwalkan alert", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.errorReports.reportError, e2eArgs);
    await t.mutation(api.errorReports.reportError, e2eArgs);

    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.occurrences).toBe(2);
    expect(rows[0]!.status).toBe("ignored");
    expect(rows[0]!.alertStatus).toBe("skipped");
  });

  test("laporan biasa tetap masuk antrean open", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.errorReports.reportError, reportArgs);

    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("open");
    expect(rows[0]!.alertStatus).toBe("queued");
  });
});

describe("agregasi laporan per fingerprint", () => {
  test("fingerprint di luar jendela dedup menjadi kelompok tersendiri", async () => {
    // Jendela dedup sengaja berbatas: kegagalan yang sama setelah jendela
    // berakhir dianggap masalah baru. Kalau tidak begitu, satu bug lama bisa
    // menelan semua baris dan kejadian barunya hilang dari pandangan.
    const t = convexTest(schema, modules);
    const resident = await t.withIdentity({ name: "Warga Jendela" });
    await resident.mutation(api.errorReports.reportError, reportArgs);

    // Baris pertama dikeluarkan dari jendela dedup dengan waktu di masa lalu.
    const first = await t.run(async (ctx) => await ctx.db.query("errorReports").first());
    await t.run(async (ctx) => {
      await ctx.db.patch(first!._id, {
        lastSeenAt: Date.now() - DEDUPE_WINDOW_MS - 60_000,
        firstSeenAt: Date.now() - DEDUPE_WINDOW_MS - 60_000,
      });
    });

    await resident.mutation(api.errorReports.reportError, reportArgs);

    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows).toHaveLength(2);
    // Dua baris, sidik yang sama, tapi kelompok terpisah karena waktunya beda.
    expect(new Set(rows.map((row) => row.fingerprint)).size).toBe(1);
  });

  test("kelompok menyimpan detail kejadian individual, bukan cuma jumlahnya", async () => {
    // Panel pengelola harus bisa melihat APA yang terjadi, bukan hanya "20x".
    // Detail individual yang hilang membuat panel tidak bisa ditindaklanjuti.
    const t = convexTest(schema, modules);
    const resident = await t.withIdentity({ name: "Warga Detail" });
    for (let index = 0; index < 5; index += 1) {
      await resident.mutation(api.errorReports.reportError, {
        ...reportArgs,
        message: `Meta menolak pesan percobaan ${index}. Kode 131008`,
      });
    }
    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows).toHaveLength(1);

    const group = rows[0]!;
    expect(group.occurrences).toBe(5);
    // Sidik yang bisa dicari, nomor yang bisa disebut ke pengguna, dan waktu.
    expect(group.reportId).toMatch(/^ERR-/);
    expect(group.fingerprint).toBeTruthy();
    expect(group.firstSeenAt).toBeGreaterThan(0);
    expect(group.lastSeenAt).toBeGreaterThanOrEqual(group.firstSeenAt);
    // Konteks teknis masih ikut: tanpanya, pengelola tidak bisa menghubungi
    // provider dengan benar.
    expect(group.provider).toBeTruthy();
    expect(group.providerCode).toBe("131008");
    expect(group.retryable).toBeDefined();
    // Sumber singkat: tidak ada data pengguna yang bocor ke panel.
    expect(JSON.stringify(group)).not.toMatch(/EAAG[A-Za-z0-9]/);
  });

  test("grup terbaru muncul lebih dulu di daftar pengelola", async () => {
    // Urutan yang tidak masuk akal membuat masalah lama menutupi masalah baru.
    const t = convexTest(schema, modules);
    const resident = await t.withIdentity({ name: "Warga Urutan" });
    const adminId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      const id = await db.insert("users", { name: "Pengelola", email: "urutan@sumenep.co.id" });
      await db.insert("staffMembers", { userId: id, role: "admin", createdAt: Date.now(), updatedAt: Date.now() });
      return id;
    });
    const admin = t.withIdentity({ subject: adminId });
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      await db.insert("errorReports", {
        kind: "integration",
        code: "LAMA",
        severity: "error",
        status: "open",
        source: "server",
        feature: "Lama",
        operation: "lama",
        message: "kesalahan lama",
        fingerprint: "fp-lama",
        occurrences: 3,
        reportId: "ERR-20260101-OLD1",
        alertStatus: "queued",
        dedupeKey: "lama",
        firstSeenAt: 1_000,
        lastSeenAt: 1_000,
        createdAt: 1_000,
        updatedAt: 1_000,
      });
    });
    await resident.mutation(api.errorReports.reportError, reportArgs);

    const listed = (await admin.query(api.errorReports.listErrorReports, {})) as Array<
      Record<string, unknown>
    >;
    expect(listed.length).toBeGreaterThan(0);
    // Yang paling baru harus di depan.
    expect(listed[0]?.lastSeenAt as number).toBeGreaterThan(1_000);
    expect(listed[0]?.errorCode).not.toBe("LAMA");
  });
});
