/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Hapus laporan error oleh admin, dengan jejak audit.
 *
 * Hapus = musnahkan bukti, jadi gerbangnya lebih ketat dari
 * `setErrorReportStatus` (staff boleh): hanya admin. Tombol di UI
 * disembunyikan untuk non-admin SEBAGAI UX, dan server tetap menolak
 * (defense in depth — dua-duanya dites, di sini sisi servernya).
 */

type SeedRole = "admin" | "staff" | "viewer";

async function seedStaff(
  t: ReturnType<typeof convexTest>,
  name: string,
  role: SeedRole,
) {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    const id = await db.insert("users", { name, email: `${name}@sumenep.co.id` });
    await db.insert("staffMembers", {
      userId: id,
      role,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return id;
  });
  return t.withIdentity({ name, subject: userId });
}

type ReportStatus = "open" | "acknowledged" | "resolved" | "ignored";

async function seedReport(
  t: ReturnType<typeof convexTest>,
  reportId: string,
  status: ReportStatus,
) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("errorReports", {
      reportId,
      fingerprint: `fp-${reportId}`,
      severity: "error",
      status,
      errorCode: "E_UJI_HAPUS",
      title: `Gangguan uji ${reportId}`,
      message: "Pesan kegagalan uji.",
      feature: "Uji Hapus",
      operation: "errorReports.deleteErrorReport",
      source: "server",
      retryable: false,
      recommendedAction: "Periksa lalu hapus bila sudah selesai.",
      environment: "test",
      occurrences: 1,
      firstSeenAt: 1_000,
      lastSeenAt: 2_000,
      alertStatus: "skipped",
      createdAt: 1_000,
      updatedAt: 2_000,
    });
  });
}

describe("deleteErrorReport", () => {
  test("admin menghapus laporan resolved: hilang dari daftar + audit tercatat", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedStaff(t, "Admin Hapus", "admin");
    const id = await seedReport(t, "ERR-20261007-DEL01", "resolved");

    const result = await admin.mutation(api.errorReports.deleteErrorReport, {
      id: id as never,
    });
    expect(result).toBe(true);

    const listed = await admin.query(api.errorReports.listErrorReports, {});
    expect(listed.find((row) => row.reportId === "ERR-20261007-DEL01")).toBeUndefined();

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const entry = audit.find((row) => row.action === "error_report.deleted");
    expect(entry).toBeDefined();
    expect(entry?.entityId).toBe("ERR-20261007-DEL01");
    expect(JSON.stringify(entry?.metadata)).toContain("resolved");
    expect(JSON.stringify(entry?.metadata)).toContain("Gangguan uji ERR-20261007-DEL01");
  });

  test("admin boleh menghapus laporan ignored", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedStaff(t, "Admin Abaikan", "admin");
    const id = await seedReport(t, "ERR-20261007-DEL02", "ignored");

    await expect(
      admin.mutation(api.errorReports.deleteErrorReport, { id: id as never }),
    ).resolves.toBe(true);
    const listed = await admin.query(api.errorReports.listErrorReports, {});
    expect(listed.find((row) => row.reportId === "ERR-20261007-DEL02")).toBeUndefined();
  });

  test("staff non-admin ditolak dengan pesan admin-only", async () => {
    const t = convexTest(schema, modules);
    const staff = await seedStaff(t, "Staff Biasa", "staff");
    const id = await seedReport(t, "ERR-20261007-DEL03", "resolved");

    await expect(
      staff.mutation(api.errorReports.deleteErrorReport, { id: id as never }),
    ).rejects.toThrow(/Hanya admin/);
    // Barisnya tetap ada: penolakan tidak memusnahkan bukti.
    const rows = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(rows).toHaveLength(1);
  });

  test("viewer ditolak dengan pesan admin-only", async () => {
    const t = convexTest(schema, modules);
    const viewer = await seedStaff(t, "Viewer Saja", "viewer");
    const id = await seedReport(t, "ERR-20261007-DEL04", "resolved");

    await expect(
      viewer.mutation(api.errorReports.deleteErrorReport, { id: id as never }),
    ).rejects.toThrow(/Hanya admin/);
  });

  test("tanpa identity ditolak", async () => {
    const t = convexTest(schema, modules);
    await seedStaff(t, "Admin Lain", "admin");
    const id = await seedReport(t, "ERR-20261007-DEL05", "resolved");
    const anon = t.withIdentity({ name: "Tanpa Sesi" });

    await expect(
      anon.mutation(api.errorReports.deleteErrorReport, { id: id as never }),
    ).rejects.toThrow();
  });

  test("id tak ada melempar Laporan tidak ditemukan", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedStaff(t, "Admin Hampa", "admin");
    const id = await seedReport(t, "ERR-20261007-DEL06", "resolved");
    // Hapus barisnya lewat jalur dalam supaya id-nya valid tapi tak ada isinya.
    await t.run(async (ctx) => await ctx.db.delete(id as never));

    await expect(
      admin.mutation(api.errorReports.deleteErrorReport, { id: id as never }),
    ).rejects.toThrow(/Laporan tidak ditemukan/);
  });

  test("hapus dua kali: pertama sukses, kedua Laporan tidak ditemukan", async () => {
    const t = convexTest(schema, modules);
    const admin = await seedStaff(t, "Admin Ganda", "admin");
    const id = await seedReport(t, "ERR-20261007-DEL07", "resolved");

    await expect(
      admin.mutation(api.errorReports.deleteErrorReport, { id: id as never }),
    ).resolves.toBe(true);
    await expect(
      admin.mutation(api.errorReports.deleteErrorReport, { id: id as never }),
    ).rejects.toThrow(/Laporan tidak ditemukan/);
  });
});
