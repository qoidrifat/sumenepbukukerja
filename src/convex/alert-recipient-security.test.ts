/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { ADMIN_WHATSAPP_NUMBER } from "../lib/admin-whatsapp";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Jumlahkan file yang boleh memuat nomor telepon. Daftar ini diperiksa
 * sebagai daftar — menambah file baru berarti menambah satu alasan tertulis,
 * bukan satu ligne yang lolos tanpa noticed.
 *
 * `src/lib/admin-whatsapp.ts` SENGAJA tidak ada di daftar ini: file itu adalah
 * sumber kebenaran tunggal nomor tujuan admin, dan keberadaannya diuji
 * secara terpisah di bawah.
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

/**
 * Semua file yang boleh disebut "sumber nomor" — satu, dan hanya satu.
 * Daftar ini dibaca, bukan dikarang, supaya test ini gagal begitu ada file
 * kedua yang mulai memuat nomor tujuan admin.
 */
const ADMIN_NUMBER_SOURCE = "src/lib/admin-whatsapp.ts";

/**
 * Pengecualian yang disengaja: berkas kontrak `admin-whatsapp.test.ts` memuat
 * angka itu sebagai nilai yang diharapkan, karena itu justru tugasnya
 * (Test A di spesifikasi). Pengecualian ini dicatat di sini, bukan dibiarkan
 * muncul sendiri, supaya nomor tidak merayap ke file test lain tanpa alasan.
 */
const NUMBER_ALLOWED_ELSEWHERE = ["src/lib/admin-whatsapp.test.ts"] as const;

/** Nomor WhatsApp Indonesia selalu diawali 62 dan diikuti 9 sampai 13 digit. */
const PHONE_LITERAL = /["'`]62\d{9,13}["'`]/;

/** Halaman yang boleh menampilkan tautan handoff admin. */
const UI_SOURCES = [
  "src/components/admin-error-reports.tsx",
  "src/components/admin-governance.tsx",
  "src/lib/catalog-store.ts",
  "README.md",
] as const;

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

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

const reportCritical = async (t: ReturnType<typeof convexTest>) => {
  const { owner, vendorId } = await createOwnerListing(t);
  await promoteToAdmin(t, vendorId);
  await owner.mutation(api.errorReports.reportError, {
    kind: "integration",
    severity: "critical",
    code: "WHATSAPP_SEND_FAILED",
    feature: "WhatsApp Notification Settings",
    operation: "whatsapp.sendTestWhatsapp",
    message: "Meta menolak pesan. Kode 131008",
  });
  return await t.run(async (ctx) => await ctx.db.query("errorReports").first());
};

const reloadReport = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => await ctx.db.query("errorReports").first());

describe("Nomor tujuan alert tidak pernah dikarang", () => {
  test("tidak ada nomor telepon Indonesia yang tertanam di source operasional", () => {
    const offenders = OPERATIONAL_SOURCES.filter((file) => PHONE_LITERAL.test(read(file)));
    expect(offenders).toEqual([]);
  });

  test("nomor tujuan admin hanya ada di satu berkas", () => {
    // Kekhawatiran aslinya: nomor admin tersebar ke banyak komponen, test,
    // komentar, dan README. Sekarang justru sebaliknya — kalau nomor muncul
    // di file kedua, tes ini yang harus gagal.
    const sources = [
      ...OPERATIONAL_SOURCES,
      ...UI_SOURCES,
      "e2e/flows.spec.ts",
      ADMIN_NUMBER_SOURCE,
    ];
    const holders = sources.filter((file) => read(file).includes(ADMIN_WHATSAPP_NUMBER));
    expect(holders).toEqual([ADMIN_NUMBER_SOURCE]);
  });

  test("berkas kontrak adalah satu-satunya tempat lain yang boleh menyebut angka", () => {
    for (const file of NUMBER_ALLOWED_ELSEWHERE) {
      expect(read(file)).toContain(ADMIN_WHATSAPP_NUMBER);
    }
  });

  test("ERROR_ALERT_WHATSAPP tidak lagi punya consumer", () => {
    // Recipient sudah jadi konstanta, jadi env var ini tidak lagi dibaca
    // siapa pun. Kalau masih ada yang membacanya, ada jalur lama yang belum
    // dimatikan.
    const source = read("src/convex/errorReports.ts");
    expect(source).not.toContain("ERROR_ALERT_WHATSAPP");
  });
});

describe("Handoff admin dijaga tetap di wa.me dan tidak pernah diklaim terkirim", () => {
  test("tautan handoff mengarah ke wa.me dengan nomor tujuan yang benar", async () => {
    const t = convexTest(schema, modules);
    const row = await reportCritical(t);

    const result = await t.action(internal.errorReports.prepareAdminErrorAlert, {
      reportId: row!._id,
    });

    expect(result.handoff).toBe(true);
    expect(result.url!.startsWith(`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=`)).toBe(true);
    // Tidak ada nomor lain yang bisa muncul di tautan: satu tujuan saja.
    expect(result.url!.match(/62\d{9,13}/g)).toEqual([ADMIN_WHATSAPP_NUMBER]);
  });

  test("pesan handoff tidak membocorkan token, stack, atau identitas internal", async () => {
    const t = convexTest(schema, modules);
    const row = await reportCritical(t);

    const result = await t.action(internal.errorReports.prepareAdminErrorAlert, {
      reportId: row!._id,
    });

    const message = new URL(result.url!).searchParams.get("text") ?? "";
    expect(message).not.toContain("WHATSAPP_ACCESS_TOKEN");
    expect(message).not.toContain("EAAG"); // awalan access token Meta
    expect(message).not.toContain(process.env.WHATSAPP_ACCESS_TOKEN ?? "tidak-ada-token-ini");
    expect(message).not.toContain("ownerId");
    expect(message).not.toContain("businessId");
    expect(message).not.toContain("stack");
    // Isi yang paling berguna untuk pengelola tetap ada.
    expect(message).toContain("131008");
  });

  test("status alert handoff bukan sent, dan tidak ada message ID", async () => {
    const t = convexTest(schema, modules);
    const row = await reportCritical(t);

    await t.action(internal.errorReports.prepareAdminErrorAlert, { reportId: row!._id });

    const after = await reloadReport(t);
    expect(after?.alertStatus).toBe("handoff");
    expect(after?.alertStatus).not.toBe("sent");
    expect(after?.alertCode ?? undefined).toBeUndefined();
    // Laporan tetap utuh.
    expect(after?.message).toContain("131008");
  });

  test("alertering kedua untuk laporan yang sama tidak membuat tautan kedua", async () => {
    const t = convexTest(schema, modules);
    const row = await reportCritical(t);

    await t.action(internal.errorReports.prepareAdminErrorAlert, { reportId: row!._id });
    const second = await t.action(internal.errorReports.prepareAdminErrorAlert, {
      reportId: row!._id,
    });

    // `handoff` dicatat sebagai waktu penyiapan, jadi cooldown policy bekerja
    // persis seperti sebelumnya: tidak ada dua jejak audit untuk satu masalah.
    expect(second.handoff).toBe(false);
    expect(second.reason).toBe("dilewati policy");
    const deliveries = await t.run(async (ctx) =>
      (await ctx.db.query("whatsappDeliveries").collect()).filter((row) => row.userId === undefined),
    );
    expect(deliveries).toHaveLength(1);
  });
});

describe("Pratinjau handoff di panel adalah data pengelola", () => {
  test("warga biasa tidak bisa membaca pratinjau handoff", async () => {
    const t = convexTest(schema, modules);
    const resident = await t.withIdentity({ name: "Warga Biasa" });
    // Query publik baru harus tetap di balik gerbang yang sama dengan laporan
    // error. Tanpa ini, tombol WhatsApp untuk admin jadi bisa dipanggil siapa
    // pun hanya dengan knowing satu endpoint.
    await expect(resident.query(api.whatsapp.adminHandoffPreview, {})).rejects.toThrow(/pengelola/i);
  });

  test("pengelola boleh membaca, dan yang kembali tidak memuat field privat", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);

    const preview = await owner.query(api.whatsapp.adminHandoffPreview, {});

    expect(preview.url.startsWith(`https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=`)).toBe(true);
    // Nomor ditampilkan tersamar, tidak pernah mentah di panel.
    expect(preview.recipient).not.toBe(ADMIN_WHATSAPP_NUMBER);
    expect(preview.recipientVerified).toBe(true);
    // Batas bukti ikut dibawa ke UI supaya panel tidak pernah menampilkan
    // kata "terkirim" tanpa penjelasan.
    expect(preview.evidence.boundary).toContain("unverified");
    // Tidak ada field identitas internal di hasil query.
    expect(Object.keys(preview)).not.toContain("ownerId");
    expect(Object.keys(preview)).not.toContain("businessId");
    expect(JSON.stringify(preview)).not.toContain("ownerId");
    expect(JSON.stringify(preview)).not.toContain("businessId");
  });
});
