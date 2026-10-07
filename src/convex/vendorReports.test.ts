/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Laporan pemilik (owner-scoped reports).
 *
 * Mitra melihat laporan yang masuk atas listing MILIKNYA sendiri —
 * alasan, rincian, dan status — tanpa pernah menerima identitas pelapor.
 * Identitas pelapor adalah P3 internal: hanya staf yang boleh melihatnya
 * lewat `listReports`. Query di sini memproyeksikan ulang setiap baris
 * dan sengaja membuang pengenal pelapor sebelum mengirim respons.
 */

const listingPayload = {
  name: "Bengkel Uji Laporan Mitra",
  category: "Servis Teknik",
  description: "Servis pompa air dan listrik untuk warga Sumenep.",
  address: "Jl. Uji No. 2, Sumenep",
  landmark: "kalianget",
  price: "Mulai Rp50.000",
  hours: "Setiap hari · 07.00–17.00",
  phone: "081234567890",
  tags: ["pompa"],
  status: "active" as const,
  availability: "available" as const,
  responseMinutes: 45,
  serviceRadiusKm: 8,
};

type Test = ReturnType<typeof convexTest>;

async function seedUser(t: Test, name: string, email: string, role?: "admin") {
  const userId = await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    const id = await db.insert("users", { name, email });
    if (role) {
      await db.insert("staffMembers", { userId: id, role, createdAt: Date.now(), updatedAt: Date.now() });
    }
    return id;
  });
  return { userId, asUser: t.withIdentity({ subject: userId }) };
}

/**
 * Listing aktif.
 *
 * `createVendor` selalu membuat draf untuk akun non-staff, jadi pemiliknya
 * harus berperan — preseden yang sama dengan helper `activeListing` di
 * `reviews-notifications.test.ts`. Bukan pintasan peran.
 */
async function activeListing(t: Test, name = "Bengkel Uji Laporan Mitra") {
  const owner = await seedUser(
    t,
    "Pemilik Laporan",
    `pemilik-laporan-${Math.random().toString(36).slice(2, 8)}@sumenep.co.id`,
    "admin",
  );
  const vendorId = await owner.asUser.mutation(api.vendors.createVendor, { ...listingPayload, name });
  const vendor = await t.run(async (ctx) => await ctx.db.get(vendorId as never));
  expect(vendor?.status).toBe("active");
  return { owner, vendorId };
}

const reportArgs = {
  reason: "Informasi tidak sesuai",
  details: "Nomor telepon di listing tidak bisa dihubungi sejak kemarin.",
};

describe("listMyVendorReports", () => {
  test("pemilik melihat laporan atas listingnya tanpa identitas pelapor", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await activeListing(t);
    const reporter = await seedUser(t, "Pelapor", "pelapor-mitra@sumenep.co.id");

    await reporter.asUser.mutation(api.community.createReport, { vendorId, ...reportArgs });

    const rows = await owner.asUser.query(api.community.listMyVendorReports, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ...reportArgs, status: "open" });
    expect(String(rows[0].vendorId)).toBe(String(vendorId));
    expect(typeof rows[0].vendorName).toBe("string");
    // Bukan sekadar undefined: kuncinya memang tidak ada di objek respons.
    expect("reporterId" in rows[0]).toBe(false);
  });

  test("laporan atas listing orang lain tak terlihat", async () => {
    const t = convexTest(schema, modules);
    const { vendorId } = await activeListing(t, "Bengkel Milik A");
    const { owner: ownerB } = await activeListing(t, "Bengkel Milik B");
    const reporter = await seedUser(t, "Pelapor", "pelapor-asing@sumenep.co.id");

    await reporter.asUser.mutation(api.community.createReport, { vendorId, ...reportArgs });

    expect(await ownerB.asUser.query(api.community.listMyVendorReports, {})).toHaveLength(0);
  });

  test("anonim (tanpa identity) ditolak", async () => {
    const t = convexTest(schema, modules);
    await activeListing(t);
    await expect(t.query(api.community.listMyVendorReports, {})).rejects.toThrow();
  });

  test("laporan bertarget-request dikecualikan", async () => {
    const t = convexTest(schema, modules);
    const { owner } = await activeListing(t);
    const requester = await seedUser(t, "Peminta", "peminta-laporan@sumenep.co.id");
    const requestId = await requester.asUser.mutation(api.community.createRequest, {
      title: "Pompa air tersendat",
      description: "Pompa air di rumah tersendat sejak semalam dan tidak mau menyala.",
      category: "Servis Teknik",
      landmark: "kalianget",
    });
    await requester.asUser.mutation(api.community.createReport, {
      requestId,
      reason: "Permintaan bermasalah",
      details: "Isi permintaan ini mengandung informasi yang menyesatkan warga.",
    });

    expect(await owner.asUser.query(api.community.listMyVendorReports, {})).toHaveLength(0);
  });

  test("laporan berstatus resolved ikut tampil sebagai umpan balik", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await activeListing(t);
    const moderator = await seedUser(t, "Pengelola", "pengelola-laporan@sumenep.co.id", "admin");
    const reporter = await seedUser(t, "Pelapor", "pelapor-selesai@sumenep.co.id");

    const reportId = await reporter.asUser.mutation(api.community.createReport, {
      vendorId,
      ...reportArgs,
    });
    await moderator.asUser.mutation(api.community.updateReport, { id: reportId, status: "resolved" });

    const rows = await owner.asUser.query(api.community.listMyVendorReports, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "resolved" });
    expect("reporterId" in rows[0]).toBe(false);
  });
});
