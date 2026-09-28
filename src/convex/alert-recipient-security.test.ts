/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Jumlahkan file yang boleh memuat nomor telepon. Daftar ini diperiksa
 * sebagai daftar — menambah file baru berarti menambah satu alasan tertulis,
 * bukan satu ligne yang lolos tanpa noticed.
 */
const OPERATIONAL_SOURCES = [
  "src/convex/errorReports.ts",
  "src/convex/whatsapp.ts",
  "src/convex/offers.ts",
  "src/convex/community.ts",
  "src/convex/users.ts",
  "src/convex/storage.ts",
  "src/lib/owner-account.ts",
] as const;

/** Nomor WhatsApp Indonesia selalu diawali 62 dan diikuti 9 sampai 13 digit. */
const PHONE_LITERAL = /["'`]62\d{9,13}["'`]/;

async function createOwnerListing(t: ReturnType<typeof convexTest>) {
  const owner = await t.withIdentity({ name: "Pemilik Uji Alert" });
  const vendorId = await owner.mutation(api.vendors.createVendor, {
    name: "Bengkel Uji Alert",
    category: "Servis Teknik",
    description: "Servis pompa air untuk warga Sumenep.",
    address: "Jl. Uji No. 1, Sumenep",
    landmark: "kalianget",
    price: "Mulai Rp50.000",
    hours: "Setiap hari · 07.00–17.00",
    phone: "081234567890",
    tags: ["pompa"],
    status: "active" as const,
    availability: "available" as const,
    responseMinutes: 45,
    serviceRadiusKm: 8,
  });
  return { owner, vendorId };
}

async function promoteToAdmin(t: ReturnType<typeof convexTest>, vendorId: string) {
  const vendor = await t.run(async (ctx) => await ctx.db.get(vendorId as never));
  if (!vendor?.ownerId) throw new Error("Test owner was not created");
  await t.run(async (ctx) =>
    ctx.db.insert("staffMembers", {
      userId: vendor.ownerId!,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return vendor.ownerId;
}

const originalAlertPhone = process.env.ERROR_ALERT_WHATSAPP;

afterEach(() => {
  if (originalAlertPhone === undefined) delete process.env.ERROR_ALERT_WHATSAPP;
  else process.env.ERROR_ALERT_WHATSAPP = originalAlertPhone;
});

describe("Nomor tujuan alert hanya dari environment", () => {
  test("tidak ada nomor telepon Indonesia yang tertanam di source operasional", () => {
    const offenders = OPERATIONAL_SOURCES.filter((file) =>
      PHONE_LITERAL.test(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  test("ERROR_ALERT_WHATSAPP tidak punya nilai cadangan di source", () => {
    const source = readFileSync(
      new URL("../../src/convex/errorReports.ts", import.meta.url),
      "utf8",
    );
    // Pola `env || "628..."` adalah bentuk yang dihapus. Yang boleh ada hanya
    // pembacaan env yang bersih.
    expect(source).toContain("process.env.ERROR_ALERT_WHATSAPP");
    expect(source).not.toMatch(/ERROR_ALERT_WHATSAPP\?\?\.trim\(\)\s*\|\|/);
  });

  test("tanpa nomor tujuan, alert diblokir dengan alasan yang menyebut Keys", async () => {
    delete process.env.ERROR_ALERT_WHATSAPP;
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);
    await owner.mutation(api.errorReports.reportError, {
      kind: "integration",
      code: "WHATSAPP_SEND_FAILED",
      feature: "WhatsApp Notification Settings",
      operation: "whatsapp.sendTestWhatsapp",
      message: "Meta menolak pesan. Kode 131008",
    });
    const row = await t.run(async (ctx) => await ctx.db.query("errorReports").first());

    const result = await t.action(internal.errorReports.deliverAdminAlert, {
      reportId: row!._id,
    });

    expect(result.sent).toBe(false);
    const after = await t.run(async (ctx) => await ctx.db.get(row!._id));
    expect(after?.alertStatus).toBe("blocked");
    // Diagnostik harus menyebut nama env var-nya, supaya administrator tahu
    // env mana yang perlu diisi tanpa membaca kode.
    expect(after?.alertReason).toContain("ERROR_ALERT_WHATSAPP");
    // Tidak ada nomor yang dikarang: tidak ada baris pengiriman sama sekali.
    expect(await t.run(async (ctx) => await ctx.db.query("whatsappDeliveries").collect())).toEqual(
      [],
    );
    // Laporan tetap utuh — gracefully dilewati, bukan dibuang.
    expect(after?.message).toContain("131008");
  });

  test("dengan nomor tujuan dari env, alert lanjut ke pemeriksaan provider", async () => {
    // Env diisi dengan nomor contoh yang jelas bukan nomor asli. Tujuannya hanya
    // membuktikan NOMOR dibaca dari environment dan tidak pernah dikarang.
    process.env.ERROR_ALERT_WHATSAPP = "6280000000000";
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);
    await owner.mutation(api.errorReports.reportError, {
      kind: "integration",
      code: "WHATSAPP_SEND_FAILED",
      feature: "WhatsApp Notification Settings",
      operation: "whatsapp.sendTestWhatsapp",
      message: "Meta menolak pesan. Kode 131008",
    });
    const row = await t.run(async (ctx) => await ctx.db.query("errorReports").first());

    const result = await t.action(internal.errorReports.deliverAdminAlert, {
      reportId: row!._id,
    });

    // Nomor terbaca (bukan "tanpa tujuan"), lalu dihentikan provider karena
    // token tidak ada di lingkungan uji.
    expect(result.sent).toBe(false);
    expect(result.reason).not.toBe("tanpa tujuan");
    const after = await t.run(async (ctx) => await ctx.db.get(row!._id));
    expect(after?.alertStatus).toBe("blocked");
    expect(after?.alertReason).not.toContain("ERROR_ALERT_WHATSAPP");
    // Tetap tidak ada pengiriman yang dibuat: provider dicek sebelum queue.
    expect(await t.run(async (ctx) => await ctx.db.query("whatsappDeliveries").collect())).toEqual(
      [],
    );
  });
});
