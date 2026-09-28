/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { encodePasscodeHash } from "../lib/admin-passcode";
import { deriveSessionFingerprint, sha256Hex } from "../lib/security-context";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestIdentity = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;

const listingPayload = {
  name: "Bengkel Uji Realtime",
  category: "Servis Teknik",
  description: "Servis pompa air dan listrik untuk warga Sumenep.",
  address: "Jl. Uji No. 1, Sumenep",
  landmark: "kalianget",
  price: "Mulai Rp50.000",
  hours: "Setiap hari · 07.00–17.00",
  phone: "081234567890",
  tags: ["pompa", "listrik"],
  status: "active" as const,
  availability: "available" as const,
  responseMinutes: 45,
  serviceRadiusKm: 8,
};

/**
 * Pengguna biasa yang sudah masuk, tanpa klaim yang sudah disetujui. Germbang
 * klaim diuji terpisah di "mengelola listing butuh klaim yang disetujui admin".
 */
async function signedInUser(t: ReturnType<typeof convexTest>, name: string) {
  return t.withIdentity({ name });
}

/**
 * convex-test tidak membuat dokumen `users` untuk sebuah identity, jadi
 * `getAuthUserId()` mengembalikan id yang tidak ada isinya. Di produksi baris
 * itu dibuat oleh adapter Convex Auth; test ini menirunya dengan menyeed baris
 * lebih dulu lalu identity dibentuk dengan subject = id baris tersebut.
 */
async function seedUserId(
  t: ReturnType<typeof convexTest>,
  user: { name: string; email?: string },
) {
  return await t.run(async (ctx) => {
    const db = ctx.db as unknown as {
      insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
    };
    return await db.insert("users", user);
  });
}

async function seededUser(
  t: ReturnType<typeof convexTest>,
  user: { name: string; email?: string },
) {
  const id = await seedUserId(t, user);
  return t.withIdentity({ name: user.name, subject: id });
}

async function createOwnerListing(t: ReturnType<typeof convexTest>) {
  const owner = await signedInUser(t, "Pemilik Uji");
  const vendorId = await owner.mutation(api.vendors.createVendor, listingPayload);
  return { owner, vendorId };
}

async function promoteToAdmin(t: ReturnType<typeof convexTest>, vendorId: string) {
  const vendor = await t.run(async (ctx) => await ctx.db.get(vendorId as never));
  if (!vendor?.ownerId) throw new Error("Test owner was not created");
  await t.run(async (ctx) => await ctx.db.insert("staffMembers", { userId: vendor.ownerId!, role: "admin", createdAt: Date.now(), updatedAt: Date.now() }));
  return vendor.ownerId;
}

async function publishListing(identity: TestIdentity, vendorId: string) {
  await identity.mutation(api.vendors.updateVendor, { id: vendorId as never, ...listingPayload, status: "active" });
}

describe("Sumenep Buku Kerja realtime contracts", () => {
  test("listing pemilik hanya terlihat dan bisa dikelola oleh pemiliknya", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);
    await publishListing(owner, vendorId);
    const stranger = t.withIdentity({ name: "Warga lain" });

    const owned = await owner.query(api.vendors.listForOwner, {});
    expect(owned).toHaveLength(1);
    expect(owned[0]).toMatchObject({
      _id: vendorId,
      name: listingPayload.name,
      status: "active",
      availability: "available",
    });
    expect(await stranger.query(api.vendors.listForOwner, {})).toEqual([]);

    await owner.mutation(api.community.updateAvailability, {
      vendorId,
      availability: "busy",
      availabilityNote: "Sedang banyak pesanan",
      responseMinutes: 30,
      serviceRadiusKm: 5,
    });
    const publicListing = await t.query(api.vendors.getBySlug, {
      slug: (owned[0] as { slug: string }).slug,
    });
    expect(publicListing).toMatchObject({
      availability: "busy",
      availabilityNote: "Sedang banyak pesanan",
      responseMinutes: 30,
    });

    await owner.mutation(api.vendors.updateVendor, {
      id: vendorId,
      ...listingPayload,
      name: "Bengkel Uji Realtime Updated",
    });
    const updatedListing = await t.query(api.vendors.getBySlug, {
      slug: (owned[0] as { slug: string }).slug,
    });
    expect(updatedListing).toMatchObject({
      name: "Bengkel Uji Realtime Updated",
      accent: expect.any(String),
      mark: expect.any(String),
    });

    await expect(
      stranger.mutation(api.vendors.updateVendor, {
        id: vendorId,
        ...listingPayload,
        name: "Berusaha diubah",
      }),
    ).rejects.toThrow();

    await owner.mutation(api.community.createPackage, {
      vendorId,
      name: "Paket uji",
      description: "Paket untuk pengujian realtime.",
      price: "Rp75.000",
      duration: "1 jam",
      area: "Kalianget",
    });
    const packages = await t.query(api.community.listPackages, { vendorId });
    expect(packages).toHaveLength(1);
    expect(packages[0]).toMatchObject({ name: "Paket uji", price: "Rp75.000" });

    await owner.mutation(api.vendors.toggleFavorite, {
      vendorId,
      collection: "Untuk rumah",
    });
    expect(await owner.query(api.vendors.listFavorites, {})).toEqual([
      expect.objectContaining({ vendorId, collection: "Untuk rumah" }),
    ]);
  });

  test("request, claim, status, dan riwayat interaksi tersinkron antar query", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);
    await publishListing(owner, vendorId);
    const resident = t.withIdentity({ name: "Warga peminta" });

    const requestId = await resident.mutation(api.community.createRequest, {
      title: "Butuh tukang listrik",
      description: "RC turun di rumah dekat Kalianget.",
      category: "Servis Teknik",
      landmark: "kalianget",
    });
    const openRequests = await t.query(api.community.listRequests, { status: "open" });
    expect(openRequests).toHaveLength(1);
    expect(openRequests[0]).toMatchObject({ _id: requestId, status: "open" });

    await owner.mutation(api.community.claimRequest, { requestId, vendorId });
    expect(await resident.query(api.community.listRequests, { mine: true })).toEqual([
      expect.objectContaining({ _id: requestId, status: "claimed", vendorId }),
    ]);
    await expect(
      owner.mutation(api.community.claimRequest, { requestId, vendorId }),
    ).rejects.toThrow();

    const interactionId = await resident.mutation(api.community.recordInteraction, {
      vendorId,
      kind: "whatsapp",
      status: "opened",
    });
    expect(interactionId).not.toBeNull();
    await resident.mutation(api.community.updateInteraction, {
      id: interactionId as never,
      status: "waiting",
    });
    const history = await resident.query(api.community.listInteractions, {});
    expect(history).toEqual([
      expect.objectContaining({ _id: interactionId, status: "waiting", kind: "whatsapp" }),
    ]);

    await resident.mutation(api.community.updateRequestStatus, {
      requestId,
      status: "completed",
    });
    expect(await resident.query(api.community.listRequests, { mine: true })).toEqual([
      expect.objectContaining({ _id: requestId, status: "completed" }),
    ]);
  });

  test("klaim listing memindahkan owner hanya setelah review dan menulis audit", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});
    const seeded = await t.run(async (ctx) => await ctx.db.query("vendors").withIndex("bySlug", (q) => q.eq("slug", "karya-jaya")).unique());
    expect(seeded?.ownerId).toBeUndefined();
    const claimant = await signedInUser(t, "Pemilikclaims");
    const claimId = await claimant.mutation(api.claims.submitVendorClaim, {
      vendorId: seeded!._id,
      whatsappPhone: "081234567890",
      email: "owner@example.test",
      businessAddress: "Alamat usaha terverifikasi",
    });
    const claim = await t.run(async (ctx) => await ctx.db.get(claimId as never)) as unknown as { requesterId: string };
    await t.run(async (ctx) => await ctx.db.insert("staffMembers", { userId: claim!.requesterId as never, role: "admin", createdAt: Date.now(), updatedAt: Date.now() }));
    await claimant.mutation(api.claims.reviewVendorClaim, { claimId, decision: "verified" });
    const claimed = await t.run(async (ctx) => await ctx.db.get(seeded!._id as never)) as unknown as { ownerId?: string };
    expect(claimed?.ownerId).toBe(claim?.requesterId);
    const history = await claimant.query(api.users.listAuditLogs, {});
    expect(history.some((entry) => entry.action === "listing.claim_submitted")).toBe(true);
    expect(history.some((entry) => entry.action === "listing.claim_approved")).toBe(true);
  });

  test("request offer hanya memiliki satu pemenang dan expired request tidak bisa diklaim", async () => {
    const t = convexTest(schema, modules);
    const first = await signedInUser(t, "Pemilik Satu");
    const firstVendor = await first.mutation(api.vendors.createVendor, listingPayload);
    await promoteToAdmin(t, firstVendor);
    await publishListing(first, firstVendor);
    const second = await signedInUser(t, "Pemilik Dua");
    const secondPayload = { ...listingPayload, name: "Bengkel Uji Dua", phone: "081298765432" };
    const secondVendor = await second.mutation(api.vendors.createVendor, secondPayload);
    await promoteToAdmin(t, secondVendor);
    await publishListing(second, secondVendor);
    const resident = t.withIdentity({ name: "Warga Request" });
    const requestId = await resident.mutation(api.community.createRequest, {
      title: "Butuh pompa air",
      description: "Pompa air di rumah perlu diperiksa.",
      category: "Servis Teknik",
      landmark: "kalianget",
    });
    await first.mutation(api.offers.offerRequest, { requestId, vendorId: firstVendor });
    const offerRows = await t.run(async (ctx) => await ctx.db.query("requestOffers").withIndex("byRequest", (q) => q.eq("requestId", requestId)).collect());
    await resident.mutation(api.offers.acceptRequestOffer, { requestId, offerId: offerRows[0]._id });
    await expect(second.mutation(api.community.claimRequest, { requestId, vendorId: secondVendor })).rejects.toThrow();
    const request = await t.run(async (ctx) => await ctx.db.get(requestId as never)) as unknown as { status: string };
    expect(request?.status).toBe("claimed");
    const offers = await t.run(async (ctx) => await ctx.db.query("requestOffers").withIndex("byRequest", (q) => q.eq("requestId", requestId)).collect());
    expect(offers.filter((offer) => offer.status === "accepted")).toHaveLength(1);
    const expiringId = await resident.mutation(api.community.createRequest, {
      title: "Request kedaluwarsa",
      description: "Request ini hanya untuk menguji masa berlaku.",
      category: "Kuliner",
      landmark: "pragaan",
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    await t.run(async (ctx) => await ctx.db.patch(expiringId as never, { expiresAt: Date.now() - 1 }));
    await t.mutation(internal.community.expireRequest, { requestId: expiringId });
    expect((await t.run(async (ctx) => await ctx.db.get(expiringId as never)) as unknown as { status: string })?.status).toBe("expired");
  });

  test("foto baru menunggu moderasi dan foto pertama approved menjadi foto utama", async () => {
    const t = convexTest(schema, modules);
    const owner = await signedInUser(t, "Pemilik Foto");
    const vendorId = await owner.mutation(api.vendors.createVendor, listingPayload);
    await promoteToAdmin(t, vendorId);
    await publishListing(owner, vendorId);
    const storageId = await owner.run(async (ctx) => await ctx.storage.store(new Blob(["photo-test"])));
    const photoId = await owner.mutation(api.community.createVendorPhoto, { vendorId, storageId, caption: "Etalase" });
    expect(await owner.query(api.community.listVendorPhotos, { vendorId })).toHaveLength(1);
    await owner.mutation(api.community.moderateVendorPhoto, { id: photoId, decision: "approved" });
    const publicPhotos = await t.query(api.community.listVendorPhotos, { vendorId });
    expect(publicPhotos[0]).toMatchObject({ caption: "Etalase" });
    expect((await t.run(async (ctx) => await ctx.db.get(vendorId as never)) as unknown as { photoId?: string })?.photoId).toBe(storageId);
  });

  test("WhatsApp delivery queue dideduplikasi dan webhook mengubah status", async () => {
    const t = convexTest(schema, modules);
    const owner = await signedInUser(t, "Pemilik WhatsApp");
    await owner.mutation(api.vendors.createVendor, listingPayload);
    const userId = await owner.query(api.users.currentUserId, {});
    const args = { userId: userId as never, deliveryKey: "whatsapp:test:dedupe", title: "Uji", body: "Pesan" };
    const first = await t.mutation(internal.whatsapp.queueWhatsappDelivery, args);
    const second = await t.mutation(internal.whatsapp.queueWhatsappDelivery, args);
    expect(first.shouldSend).toBe(true);
    expect(second.shouldSend).toBe(false);
    await t.mutation(internal.whatsapp.markWhatsappSent, { id: first.id, providerMessageId: "SM-test" });
    await t.mutation(internal.whatsapp.applyDeliveryStatus, { providerMessageId: "SM-test", status: "delivered" });
    await t.mutation(internal.whatsapp.applyDeliveryStatus, { providerMessageId: "SM-test", status: "queued" });
    const delivery = await t.query(internal.whatsapp.deliveryForRetry, { deliveryId: first.id });
    expect(delivery?.status).toBe("delivered");
    expect(delivery?.attempts).toBe(1);
  });

  test("laporan error dari klien dinormalisasi, disanitasi, dan disimpan", async () => {
    const t = convexTest(schema, modules);
    const resident = await signedInUser(t, "Warga Pelapor");
    const result = await resident.mutation(api.errorReports.reportError, {
      kind: "integration",
      code: "WHATSAPP_SEND_FAILED",
      feature: "WhatsApp Notification Settings",
      operation: "whatsapp.sendTestWhatsapp",
      route: "/dashboard",
      message: "Meta menolak pesan. Kode 131008",
      userMessage: "Integrasi WhatsApp belum dapat mengirim pesan uji",
      provider: "meta",
      providerCode: "131008",
      context: { access_token: "EAAGZx0123456789abcdefghijk", stage: "send" },
    });
    expect(result.reported).toBe(true);
    const stored = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      severity: "error",
      status: "open",
      errorCode: "WHATSAPP_SEND_FAILED",
      feature: "WhatsApp Notification Settings",
      operation: "whatsapp.sendTestWhatsapp",
      occurrences: 1,
      alertStatus: "queued",
    });
    expect(stored[0]?.reportId).toMatch(/^ERR-\d{8}-[0-9A-Z]+$/);
    // Rahasia di context tidak pernah ikut tersimpan.
    expect(JSON.stringify(stored[0]?.context)).not.toContain("EAAGZx");
  });

  test("kesalahan yang diharapkan tidak pernah membuat laporan", async () => {
    const t = convexTest(schema, modules);
    const resident = await signedInUser(t, "Warga Validasi");
    for (const args of [
      { kind: "validation" as const, message: "Masukkan nomor WhatsApp yang valid sebelum mengaktifkan notifikasi" },
      { kind: "permission" as const, message: "Hanya pemilik listing yang dapat mengubah data ini" },
      { kind: "auth" as const, message: "Masuk untuk menggunakan fitur Buku Kerja" },
      { kind: "operation" as const, message: "Masuk untuk menguji notifikasi WhatsApp" },
    ]) {
      const result = await resident.mutation(api.errorReports.reportError, {
        feature: "Pengaturan",
        operation: "community.setNotificationPreferences",
        ...args,
      });
      expect(result.reported).toBe(false);
    }
    expect(await t.run(async (ctx) => await ctx.db.query("errorReports").collect())).toHaveLength(0);
  });

  test("kesalahan yang sama digabung, bukan multiplied", async () => {
    const t = convexTest(schema, modules);
    const resident = await signedInUser(t, "Warga Berulang");
    const args = {
      kind: "integration" as const,
      code: "WHATSAPP_SEND_FAILED",
      feature: "WhatsApp Notification Settings",
      operation: "whatsapp.sendTestWhatsapp",
      message: "Meta menolak pesan. Kode 131008",
    };
    const first = await resident.mutation(api.errorReports.reportError, args);
    const second = await resident.mutation(api.errorReports.reportError, args);
    const third = await resident.mutation(api.errorReports.reportError, args);
    expect(second.reportId).toBe(first.reportId);
    expect(third.reportId).toBe(first.reportId);
    const stored = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0]?.occurrences).toBe(3);
    // Perbedaan pada request ID tidak boleh memecah dedup.
    await resident.mutation(api.errorReports.reportError, { ...args, requestId: "req-0001" });
    await resident.mutation(api.errorReports.reportError, { ...args, requestId: "req-0002" });
    const afterIds = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(afterIds).toHaveLength(1);
    expect(afterIds[0]?.occurrences).toBe(5);
  });

  test("kegagalan dengan bentuk berbeda menjadi laporan terpisah", async () => {
    const t = convexTest(schema, modules);
    const resident = await signedInUser(t, "Warga Bentuk Beda");
    const base = { kind: "integration" as const, feature: "WhatsApp", operation: "whatsapp.sendTestWhatsapp" };
    await resident.mutation(api.errorReports.reportError, { ...base, message: "Meta menolak pesan. Kode 131008", providerCode: "131008" });
    await resident.mutation(api.errorReports.reportError, { ...base, message: "Meta menolak autentikasi. Kode 190", providerCode: "190" });
    await resident.mutation(api.errorReports.reportError, { ...base, operation: "whatsapp.deliver", message: "Meta menolak pesan. Kode 131008", providerCode: "131008" });
    const stored = await t.run(async (ctx) => await ctx.db.query("errorReports").collect());
    expect(stored).toHaveLength(3);
    expect(new Set(stored.map((row) => row.fingerprint)).size).toBe(3);
  });

  test("alert yang diblokir provider tidak menghapus laporan", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);
    const created = await owner.mutation(api.errorReports.reportError, {
      kind: "integration",
      code: "WHATSAPP_SEND_FAILED",
      feature: "WhatsApp Notification Settings",
      operation: "whatsapp.sendTestWhatsapp",
      message: "Meta menolak pesan. Kode 131008",
    });
    expect(created.reported).toBe(true);
    const row = await t.run(async (ctx) => await ctx.db.query("errorReports").first());
    // Provider belum dikonfigurasi di lingkungan uji, jadi alert harus ditandai
    // diblokir -- bukan gagal diam-diam, dan bukan menghapus laporan.
    const result = await t.action(internal.errorReports.deliverAdminAlert, { reportId: row!._id });
    expect(result.sent).toBe(false);
    const after = await t.run(async (ctx) => await ctx.db.get(row!._id));
    expect(after?.alertStatus).toBe("blocked");
    expect(after?.alertReason).toBeTruthy();
    // Laporan utuh dan tetap terlihat.
    expect(after?.message).toContain("131008");
    // Tidak ada laporan baru yang muncul: reporter tidak melaporkan dirinya.
    expect(await t.run(async (ctx) => await ctx.db.query("errorReports").collect())).toHaveLength(1);
  });

  test("hanya pengelola yang boleh membaca riwayat laporan", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);
    await owner.mutation(api.errorReports.reportError, {
      kind: "critical",
      code: "RUNTIME_ERROR",
      feature: "Application Shell",
      operation: "RootErrorBoundary",
      message: "Aplikasi mengalami gangguan total.",
    });
    const resident = await signedInUser(t, "Warga Biasa");
    await expect(resident.query(api.errorReports.listErrorReports, {})).rejects.toThrow(/pengelola/i);
    await expect(resident.query(api.errorReports.errorReportSummary, {})).rejects.toThrow(/pengelola/i);
    await expect(
      resident.mutation(api.errorReports.setErrorReportStatus, {
        id: (await t.run(async (ctx) => await ctx.db.query("errorReports").first()))!._id as never,
        status: "resolved",
      }),
    ).rejects.toThrow(/pengelola/i);
    const list = await owner.query(api.errorReports.listErrorReports, {});
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ severity: "critical", errorCode: "RUNTIME_ERROR" });
  });

  test("perubahan status laporan tercatat di audit log", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
    await promoteToAdmin(t, vendorId);
    await owner.mutation(api.errorReports.reportError, {
      kind: "operation",
      severity: "error",
      code: "OPERATION_FAILED",
      feature: "Listing Management",
      operation: "vendors.updateVendor",
      message: "Server tidak dapat menghubungi database.",
    });
    const row = (await t.run(async (ctx) => await ctx.db.query("errorReports").first()))!;
    await owner.mutation(api.errorReports.setErrorReportStatus, { id: row._id as never, status: "resolved" });
    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.some((entry) => entry.action === "error_report.created")).toBe(true);
    expect(
      audit.some(
        (entry) =>
          entry.action === "error_report.status" &&
          JSON.stringify(entry.metadata).includes("resolved"),
      ),
    ).toBe(true);
  });

  test("alert sistem tidak ikut menghabiskan kuota warga", async () => {
    const t = convexTest(schema, modules);
    const requester = await signedInUser(t, "Warga Pengaju");
    const neighbour = await signedInUser(t, "Warga Tetangga");
    await neighbour.mutation(api.community.setNotificationPreferences, {
      whatsappUpdates: true,
      requestUpdates: true,
      whatsappPhone: "081234567890",
    });
    const request = await requester.mutation(api.community.createRequest, {
      title: "Butuh pompa air",
      description: "Pompa di rumah bermasalah dan perlu diperbaiki segera.",
      category: "Servis Teknik",
      landmark: "kalianget",
    });
    // Baris alert sistem tidak punya userId, jadi ledger kuota (yang hanya
    // membaca lewat indeks byUser) tidak pernah menghitungnya.
    await t.mutation(internal.whatsapp.queueSystemDelivery, {
      deliveryKey: "system:error-alert:ERR-1",
      title: "ERROR WHATSAPP_SEND_FAILED",
      body: "Isi alert",
    });
    const recipients = await t.query(internal.whatsapp.notificationRecipients, {
      kind: "request_created",
      entityId: request as never,
    });
    expect(recipients).toHaveLength(1);
    // Jejak audit sistem terpisah: tidak ada notifikasi dalam aplikasi untuk
    // warga, dan barisnya tidak punya userId sama sekali.
    const systemRows = await t.run(async (ctx) =>
      (await ctx.db.query("whatsappDeliveries").collect()).filter((row) => row.audience === "system"),
    );
    expect(systemRows).toHaveLength(1);
    expect(systemRows[0]?.userId).toBeUndefined();
    expect(
      await t.run(async (ctx) => await ctx.db.query("notifications").collect()),
    ).toHaveLength(0);
  });

  test("pesan masuk dari webhook tersimpan per nomor dan terhubung ke penggunanya", async () => {
    const t = convexTest(schema, modules);
    const resident = await signedInUser(t, "Warga Balasan");
    await resident.mutation(api.community.setNotificationPreferences, {
      whatsappUpdates: true,
      whatsappPhone: "6282337753394",
    });
    const first = await t.mutation(internal.whatsapp.recordInboundMessage, {
      phone: "6282337753394",
      providerMessageId: "wamid.1",
      body: "Apakah masih buka?",
      kind: "text",
      at: 1_700_000_000_000,
    });
    expect(first).not.toBeNull();
    // Balasan kedua menimpa thread yang sama, bukan membuat baris baru.
    const second = await t.mutation(internal.whatsapp.recordInboundMessage, {
      phone: "6282337753394",
      providerMessageId: "wamid.2",
      body: "Buka sampai 20.00",
      kind: "text",
      at: 1_700_000_060_000,
    });
    expect(second).toBe(first);
    const threads = await t.run(async (ctx) => await ctx.db.query("whatsappThreads").collect());
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ lastInboundBody: "Buka sampai 20.00", unread: true });
    // Balasan lama yang telat tidak boleh menimpa pesan yang lebih baru.
    await t.mutation(internal.whatsapp.recordInboundMessage, {
      phone: "6282337753394",
      providerMessageId: "wamid.late",
      body: "Pesan lama",
      kind: "text",
      at: 1_600_000_000_000,
    });
    const afterLate = await t.run(async (ctx) => await ctx.db.query("whatsappThreads").collect());
    expect(afterLate[0]?.lastInboundBody).toBe("Buka sampai 20.00");

    const status = await resident.query(api.whatsapp.getWhatsappStatus, {});
    expect(status.thread).toMatchObject({ lastInboundBody: "Buka sampai 20.00", unread: true });
    await resident.mutation(api.whatsapp.markWhatsappThreadRead, {});
    const read = await resident.query(api.whatsapp.getWhatsappStatus, {});
    expect(read.thread?.unread).toBe(false);
  });

  test("pesan masuk dari nomor yang tidak dikenal tetap disimpan tanpa pemilik", async () => {
    const t = convexTest(schema, modules);
    const stored = await t.mutation(internal.whatsapp.recordInboundMessage, {
      phone: "+62 812-9999-0000",
      providerMessageId: "wamid.unknown",
      body: "Halo",
      kind: "text",
      at: 1_700_000_000_000,
    });
    expect(stored).not.toBeNull();
    const threads = await t.run(async (ctx) => await ctx.db.query("whatsappThreads").collect());
    expect(threads[0]?.phone).toBe("6281299990000");
    expect(threads[0]?.userId).toBeUndefined();
  });

  test("status pengiriman hanya terlihat oleh pemiliknya", async () => {
    const t = convexTest(schema, modules);
    const owner = await signedInUser(t, "Pemilik Status");
    const other = await signedInUser(t, "Warga Lain");
    const userId = await owner.query(api.users.currentUserId, {});
    const queued = await t.mutation(internal.whatsapp.queueWhatsappDelivery, {
      userId: userId as never,
      deliveryKey: "whatsapp:test:privat",
      title: "WhatsApp aktif",
      body: "Pesan uji",
    });
    await t.mutation(internal.whatsapp.markWhatsappSent, { id: queued.id, providerMessageId: "SM-privat" });
    await t.mutation(internal.whatsapp.applyDeliveryStatus, { providerMessageId: "SM-privat", status: "delivered" });

    const mine = await owner.query(api.whatsapp.getWhatsappStatus, {});
    expect(mine.recent.map((row) => row.status)).toEqual(["delivered"]);
    const theirs = await other.query(api.whatsapp.getWhatsappStatus, {});
    expect(theirs.recent).toEqual([]);
    expect(theirs.thread).toBeNull();
    const anonymous = await t.query(api.whatsapp.getWhatsappStatus, {});
    expect(anonymous.recent).toEqual([]);
  });

  test("pesan uji yang gagal boleh diulang pada hari yang sama", async () => {
    const t = convexTest(schema, modules);
    const resident = await signedInUser(t, "Warga Uji Ulang");
    const userId = (await resident.query(api.users.currentUserId, {})) as never;
    const args = { userId, deliveryKey: "whatsapp:test:ulang", title: "Uji", body: "Pesan" };
    const first = await t.mutation(internal.whatsapp.queueWhatsappDelivery, args);
    expect(first.shouldSend).toBe(true);
    await t.mutation(internal.whatsapp.markWhatsappFailed, { id: first.id, errorCode: "131008" });
    const again = await t.mutation(internal.whatsapp.queueWhatsappDelivery, args);
    expect(again.shouldSend).toBe(false);
    expect(again.status).toBe("failed");
    expect(await t.mutation(internal.whatsapp.reopenFailedDelivery, { id: first.id })).toBe(true);
    const reopened = await t.mutation(internal.whatsapp.queueWhatsappDelivery, args);
    expect(reopened.status).toBe("queued");
    // Baris yang sukses tidak boleh bisa dibuka lagi di hari yang sama.
    await t.mutation(internal.whatsapp.markWhatsappSent, { id: first.id, providerMessageId: "SM-ulang" });
    expect(await t.mutation(internal.whatsapp.reopenFailedDelivery, { id: first.id })).toBe(false);
  });

  test("viewer bisa membaca data kelola tetapi tidak bisa mengubah listing", async () => {
    const t = convexTest(schema, modules);
    const owner = await signedInUser(t, "Admin Uji");
    const vendorId = await owner.mutation(api.vendors.createVendor, listingPayload);
    await promoteToAdmin(t, vendorId);
    await publishListing(owner, vendorId);
    const viewer = t.withIdentity({ name: "Viewer Uji" });
    const requestId = await viewer.mutation(api.community.createRequest, { title: "Request viewer", description: "Request untuk akses viewer.", category: "Kuliner", landmark: "pragaan" });
    const request = await t.run(async (ctx) => await ctx.db.get(requestId as never)) as unknown as { requesterId: string };
    await t.run(async (ctx) => await ctx.db.insert("staffMembers", { userId: request.requesterId as never, role: "viewer", createdAt: Date.now(), updatedAt: Date.now() }));
    expect(await viewer.query(api.vendors.listForAdmin, {})).toHaveLength(1);
    await expect(viewer.mutation(api.vendors.updateVendor, { id: vendorId, ...listingPayload, name: "Tidak boleh" })).rejects.toThrow();
  });

  test("viewer tidak dapat memoderasi meski viewer dapat membaca", async () => {
    const t = convexTest(schema, modules);
    const owner = await signedInUser(t, "Pemilik Moderasi");
    const vendorId = await owner.mutation(api.vendors.createVendor, listingPayload);
    await promoteToAdmin(t, vendorId);
    const storageId = await owner.run(async (ctx) => await ctx.storage.store(new Blob(["photo"], { type: "image/jpeg" })));
    const photoId = await owner.mutation(api.community.createVendorPhoto, { vendorId, storageId, caption: "Foto uji" });
    const viewer = t.withIdentity({ name: "Viewer Moderasi" });
    const viewerRequest = await viewer.mutation(api.community.createRequest, { title: "Permintaan viewer", description: "Deskripsi cukup panjang untuk moderasi.", category: "Kuliner", landmark: "pragaan" });
    const viewerRow = await t.run(async (ctx) => await ctx.db.get(viewerRequest as never)) as unknown as { requesterId: string };
    await t.run(async (ctx) => await ctx.db.insert("staffMembers", { userId: viewerRow.requesterId as never, role: "viewer", createdAt: Date.now(), updatedAt: Date.now() }));
    await expect(viewer.mutation(api.community.moderateVendorPhoto, { id: photoId, decision: "approved" })).rejects.toThrow();
  });

  test("mengelola listing butuh klaim yang disetujui admin, draft sendiri tetap boleh disunting", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});
    const stranger = t.withIdentity({ name: "Tanpa Klaim" });
    const userId = (await stranger.query(api.users.currentUserId, {})) as string;

    // Membuat listing sendiri tidak butuh klaim: hasilnya draft dan tidak tayang.
    const vendorId = await stranger.mutation(api.vendors.createVendor, listingPayload);
    expect(vendorId).toBeTruthy();

    // Draft milik sendiri boleh disunting, supaya pemilik bisa memperbaiki data
    // sebelum klaimnya diverifikasi.
    await expect(
      stranger.mutation(api.vendors.updateVendor, { id: vendorId, ...listingPayload }),
    ).resolves.toBeTruthy();

    // Begitu sudah tayang, pengelolaan perlu identitas yang sudah dibuktikan.
    await t.run(async (ctx) => {
      await ctx.db.patch(vendorId as never, { status: "active" });
    });
    await expect(
      stranger.mutation(api.vendors.updateVendor, { id: vendorId, ...listingPayload, price: "Rp 90.000" }),
    ).rejects.toThrow(/klaim listing/);
    await expect(
      stranger.mutation(api.vendors.archiveVendor, { id: vendorId }),
    ).rejects.toThrow(/klaim listing/);

    // Listing milik orang lain tidak bisa disentuh meski sudah punya akun.
    const seeded = await t.run(async (ctx) =>
      ctx.db.query("vendors").withIndex("bySlug", (q) => q.eq("slug", "karya-jaya")).unique(),
    );
    await expect(
      stranger.mutation(api.vendors.updateVendor, { id: seeded!._id, ...listingPayload }),
    ).rejects.toThrow();

    // Setelah klaim disetujui, akses pengelolaan terbuka.
    await t.run(async (ctx) => {
      await ctx.db.insert("listingClaims", {
        vendorId: vendorId as never,
        requesterId: userId as never,
        whatsappPhone: "628123456789",
        email: "tanpa-klaim@example.test",
        businessAddress: "Alamat claimant",
        status: "verified",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await expect(
      stranger.mutation(api.vendors.updateVendor, { id: vendorId, ...listingPayload, price: "Rp 90.000" }),
    ).resolves.toBeTruthy();
  });

  test("requester dapat melihat klaimnya sendiri tanpa membuka klaim orang lain", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});
    const seeded = await t.run(async (ctx) => await ctx.db.query("vendors").withIndex("bySlug", (q) => q.eq("slug", "karya-jaya")).unique());
    const claimant = await signedInUser(t, "Pemilik Klaim");
    const claimId = await claimant.mutation(api.claims.submitVendorClaim, { vendorId: seeded!._id, whatsappPhone: "081234567890", email: "claimant@example.test", businessAddress: "Alamat claimant" });
    const ownClaims = await claimant.query(api.claims.listVendorClaims, { vendorId: seeded!._id });
    expect(ownClaims).toEqual([expect.objectContaining({ _id: claimId, status: "pending" })]);
    const stranger = t.withIdentity({ name: "Orang Lain" });
    await expect(stranger.query(api.claims.listVendorClaims, { vendorId: seeded!._id })).rejects.toThrow();
  });

  test("notifikasi hanya masuk ke pengguna yang opt-in", async () => {
    const t = convexTest(schema, modules);
    const resident = t.withIdentity({ name: "Warga opt-in" });
    await resident.mutation(api.community.setNotificationPreferences, {
      whatsappUpdates: true,
      whatsappPhone: "081234567890",
      areaUpdates: true,
      requestUpdates: true,
    });
    const { vendorId } = await createOwnerListing(t);

    const recipients = await t.query(internal.whatsapp.notificationRecipients, {
      kind: "vendor_created",
      entityId: vendorId,
    });
    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toMatchObject({
      phone: "6281234567890",
      title: "Listing baru di sekitar Anda",
    });

    const requestId = await resident.mutation(api.community.createRequest, {
      title: "Butuh bantuan Catering",
      description: "Catering untuk acara kecil di Pragaan.",
      category: "Kuliner",
      landmark: "pragaan",
    });
    const requestRecipients = await t.query(internal.whatsapp.notificationRecipients, {
      kind: "request_created",
      entityId: requestId,
    });
    expect(requestRecipients).toHaveLength(0);
  });

  test("klaim dan foto baru langsung mengabari pengelola, tanpa menggandakan", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});
    const seeded = await t.run(async (ctx) =>
      ctx.db.query("vendors").withIndex("bySlug", (q) => q.eq("slug", "karya-jaya")).unique(),
    );
    const claimant = await signedInUser(t, "Warga Pengaju");
    await claimant.mutation(api.claims.submitVendorClaim, {
      vendorId: seeded!._id,
      whatsappPhone: "081234567890",
      email: "warga@example.test",
      businessAddress: "Alamat claimant",
    });

    // Saat belum ada pengelola sama sekali, tidak ada yang perlu diberi tahu.
    expect(await t.run(async (ctx) => await ctx.db.query("notifications").collect())).toHaveLength(0);

    // Klaim pertama ini tetap masuk antrean meski belum ada admin, supaya tidak
    // hilang begitu admin pertama diaktifkan.
    const claimantUserId = (await claimant.query(api.users.currentUserId, {})) as string;
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: claimantUserId as never,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["foto"], { type: "image/jpeg" })),
    );
    const owner = await signedInUser(t, "Pemilik Foto");
    const vendorId = await owner.mutation(api.vendors.createVendor, listingPayload);
    await t.run(async (ctx) => {
      const vendorOwner = (await ctx.db.get(vendorId as never)) as unknown as { ownerId?: string };
      await ctx.db.insert("staffMembers", {
        userId: vendorOwner!.ownerId as never,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await owner.mutation(api.community.createVendorPhoto, { vendorId, storageId, caption: "Etalase" });

    const inbox = (await owner.query(api.community.listNotifications, {})) as Array<{
      kind: string;
      read?: boolean;
      vendorId?: string;
    }>;
    const photoNotice = inbox.filter((item) => item.kind === "review.photo_pending");
    expect(photoNotice).toHaveLength(1);
    expect(photoNotice[0].read).toBe(false);

    // Foto kedua untuk listing yang sama tidak menambah notifikasi baru.
    const second = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["foto2"], { type: "image/jpeg" })),
    );
    await owner.mutation(api.community.createVendorPhoto, { vendorId, storageId: second });
    const afterSecond = (await owner.query(api.community.listNotifications, {})) as Array<{ kind: string }>;
    expect(afterSecond.filter((item) => item.kind === "review.photo_pending")).toHaveLength(1);

    // Antrean yang tampil di lonceng header menghitung klaim dan foto bersama.
    const queue = await owner.query(api.community.listReviewQueue, {});
    expect(queue).toMatchObject({ claims: 1, photos: 2, total: 3 });

    // Setelah klaim disetujui, antrean klaim kosong meski foto tetap menunggu.
    await owner.mutation(api.claims.reviewVendorClaim, {
      claimId: (await t.run(async (ctx) =>
        ctx.db.query("listingClaims").withIndex("byStatus", (q) => q.eq("status", "pending")).unique(),
      ))!._id,
      decision: "verified",
    });
    const settled = await owner.query(api.community.listReviewQueue, {});
    expect(settled).toMatchObject({ claims: 0, photos: 2, total: 2 });
  });
});

/**
 * Kebijakan yang dulu membuat pemilik deployment buntu: begitu ada satu
 * baris di `staffMembers`, /admin berhenti menampilkan tombol bootstrap dan
 * hanya menampilkan "Anda bukan staff". Padahal yang memegang peran itu bisa
 * akun yang tidak bisa dipakai lagi (misalnya sesi anonim), sehingga tidak ada
 * siapa pun yang bisa memulihkannya. Jalur bootstrap tidak boleh bergantung
 * pada jumlah pengelola yang ada, selama email pemanggil ada di allowlist.
 */
describe("jalur pemulihan akses admin lewat bootstrap", () => {
  const ALLOWLIST_KEY = "STAFF_BOOTSTRAP_EMAILS";
  type EnvBag = { process?: { env?: Record<string, string | undefined> } };
  const env = () => {
    const bag = (globalThis as unknown as EnvBag).process?.env;
    if (!bag) throw new Error("Test environment does not expose an env record");
    return bag as Record<string, string | undefined>;
  };
  const previousAllowlist = env()[ALLOWLIST_KEY];
  const setAllowlist = (value: string) => {
    env()[ALLOWLIST_KEY] = value;
  };

  /**
   * convex-test tidak membuat dokumen `users` untuk sebuah identity, jadi
   * getAuthUserId() mengembalikan id yang tidak ada isinya. Di produksi baris
   * itu dibuat oleh adapter Convex Auth. Test ini menirunya: seed baris users
   * lebih dulu, lalu identity dibentuk dengan subject = id baris tersebut.
   */
  const seedUserRow = async (t: ReturnType<typeof convexTest>, user: { name: string; email?: string }) =>
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("users", user);
    });

  const asUser = async (t: ReturnType<typeof convexTest>, user: { name: string; email?: string }) => {
    const id = await seedUserRow(t, user);
    return t.withIdentity({ name: user.name, subject: id });
  };

  test("penyebab tombol mati dibedakan, bukan satu pesan generik", async () => {
    setAllowlist("pemilik@sumenep.co.id");
    const t = convexTest(schema, modules);
    const allowed = await asUser(t, { name: "Pemilik", email: "pemilik@sumenep.co.id" });
    const stranger = await asUser(t, { name: "Orang Lain", email: "bukan@sumenep.co.id" });
    // Akun tamu: baris users ada, tapi tidak punya email sama sekali.
    const guest = t.withIdentity({ name: "Tamu", subject: await seedUserRow(t, { name: "Tamu" }) });

    expect((await allowed.query(api.users.adminSetupStatus, {})).bootstrapBlocker).toBeNull();
    // Email ada tapi tidak di daftar: perbaikannya edit allowlist.
    expect((await stranger.query(api.users.adminSetupStatus, {})).bootstrapBlocker).toBe("notAllowlisted");
    // Akun tamu: perbaikannya bukan edit allowlist, tapi keluar lalu masuk
    // ulang dengan email. Dua hal ini tidak boleh tampil sebagai pesan sama.
    expect((await guest.query(api.users.adminSetupStatus, {})).bootstrapBlocker).toBe("noEmail");
    expect((await t.query(api.users.adminSetupStatus, {})).bootstrapBlocker).toBe("signedOut");
  });

  test("akun tamu tidak bisa menjadi admin, dan alasannya jujur", async () => {
    setAllowlist("pemilik@sumenep.co.id");
    const t = convexTest(schema, modules);
    const guest = t.withIdentity({ name: "Tamu", subject: await seedUserRow(t, { name: "Tamu" }) });

    await expect(guest.mutation(api.users.bootstrapAdministrator, {})).rejects.toThrow(
      "Email ini belum diizinkan untuk bootstrap admin awal",
    );
    expect(await t.query(api.users.adminSetupStatus, {})).toMatchObject({ staffCount: 0 });
  });

  afterEach(() => {
    if (previousAllowlist === undefined) delete env()[ALLOWLIST_KEY];
    else env()[ALLOWLIST_KEY] = previousAllowlist;
  });

  test("hanya akun sendiri yang tahu apakah email-nya di allowlist", async () => {
    setAllowlist("Pemilik@Sumenep.co.id, admin2@sumenep.co.id");
    const t = convexTest(schema, modules);
    const allowed = await asUser(t, { name: "Pemilik", email: "Pemilik@Sumenep.co.id" });
    const stranger = await asUser(t, { name: "Orang Lain", email: "bukan@sumenep.co.id" });

    const forAllowed = await allowed.query(api.users.adminSetupStatus, {});
    expect(forAllowed.bootstrapAvailable).toBe(true);
    expect(forAllowed.bootstrapEligible).toBe(true);

    // Email dinormalisasi: allowlist ditulis campur huruf besar, akun memakai
    // huruf kecil. Ini yang membuat orang mengira dirinya tidak terdaftar,
    // padahal daftarnya yang salah kapital.
    const forStranger = await stranger.query(api.users.adminSetupStatus, {});
    expect(forStranger.bootstrapEligible).toBe(false);
    // Status ini publik, jadi tidak boleh memuat email siapa pun dari allowlist.
    expect(JSON.stringify(forStranger)).not.toContain("admin2@sumenep.co.id");
    expect(JSON.stringify(forStranger)).not.toContain("Pemilik@Sumenep.co.id");

    // Tamu tanpa akun tidak pernah eligible, dan statusnya tetap terbaca.
    const guest = await t.query(api.users.adminSetupStatus, {});
    expect(guest).toMatchObject({ bootstrapAvailable: true, bootstrapEligible: false });
  });

  test("bootstrap memulihkan akses meski sudah ada admin lain", async () => {
    setAllowlist("pemilik@sumenep.co.id");
    const t = convexTest(schema, modules);
    const stuckId = await seedUserRow(t, { name: "Admin Lama", email: "lama@sumenep.co.id" });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: stuckId as never,
        role: "admin",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const owner = await asUser(t, { name: "Pemilik", email: "pemilik@sumenep.co.id" });

    // Inilah kondisi buntu yang dilaporkan: sudah ada pengelola, jadi /admin
    // menampilkan "ditolak", padahal akun ini justru yang berhak memulihkan.
    expect(await owner.query(api.users.adminSetupStatus, {})).toMatchObject({
      hasAnyStaff: true,
      bootstrapEligible: true,
    });

    await owner.mutation(api.users.bootstrapAdministrator, {});
    expect(await owner.query(api.users.currentAccess, {})).toMatchObject({
      role: "admin",
      isStaff: true,
      canViewAdmin: true,
      canManageRoles: true,
    });
  });

  test("daftar yang diketik dengan titik koma atau baris baru tetap berlaku", async () => {
    // Allowlist terlihat benar di Keys tapi tidak pernah cocok: pemisah yang
    // dipakai orang tidak selalu koma.
    setAllowlist("satu@sumenep.co.id; dua@sumenep.co.id\ntiga@sumenep.co.id ,");
    const t = convexTest(schema, modules);
    const second = await asUser(t, { name: "Dua", email: "DUA@sumenep.co.id" });

    expect((await second.query(api.users.adminSetupStatus, {})).bootstrapEligible).toBe(true);
    await second.mutation(api.users.bootstrapAdministrator, {});
    expect(await second.query(api.users.currentAccess, {})).toMatchObject({ role: "admin" });
  });

  test("email akun sendiri dikembalikan supaya bisa disalin ke daftar", async () => {
    setAllowlist("lain@sumenep.co.id");
    const t = convexTest(schema, modules);
    const stranger = await asUser(t, { name: "Orang Lain", email: "  Bukan@Sumenep.co.id " });

    // Dinormalisasi, jadi yang disalin ke Keys langsung cocok.
    expect((await stranger.query(api.users.adminSetupStatus, {})).accountEmail).toBe("bukan@sumenep.co.id");
    expect((await t.query(api.users.adminSetupStatus, {})).accountEmail).toBeNull();
  });

  test("email di luar allowlist tetap ditolak dan tidak membuat peran baru", async () => {
    setAllowlist("pemilik@sumenep.co.id");
    const t = convexTest(schema, modules);
    const stranger = await asUser(t, { name: "Orang Lain", email: "bukan@sumenep.co.id" });

    await expect(stranger.mutation(api.users.bootstrapAdministrator, {})).rejects.toThrow(
      "Email ini belum diizinkan untuk bootstrap admin awal",
    );
    const status = await t.query(api.users.adminSetupStatus, {});
    expect(status).toMatchObject({ staffCount: 0, hasAnyStaff: false });
  });

  test("bootstrap idempoten: panggilan kedua tidak menggandakan peran", async () => {
    setAllowlist("pemilik@sumenep.co.id");
    const t = convexTest(schema, modules);
    const owner = await asUser(t, { name: "Pemilik", email: "pemilik@sumenep.co.id" });

    const first = await owner.mutation(api.users.bootstrapAdministrator, {});
    const second = await owner.mutation(api.users.bootstrapAdministrator, {});
    expect(second).toBe(first);
    expect(await t.query(api.users.adminSetupStatus, {})).toMatchObject({ staffCount: 1 });
  });

  test("tanpa allowlist, tidak ada yang bisa memakai jalur pemulihan", async () => {
    delete env()[ALLOWLIST_KEY];
    const t = convexTest(schema, modules);
    const owner = await asUser(t, { name: "Pemilik", email: "pemilik@sumenep.co.id" });

    expect(await owner.query(api.users.adminSetupStatus, {})).toMatchObject({
      bootstrapAvailable: false,
      bootstrapEligible: false,
    });
    await expect(owner.mutation(api.users.bootstrapAdministrator, {})).rejects.toThrow(
      "Email ini belum diizinkan untuk bootstrap admin awal",
    );
    expect(await owner.query(api.users.currentAccess, {})).toMatchObject({
      role: null,
      canViewAdmin: false,
    });
  });
});

/**
 * Gerbang passcode, sesi, dan security desk.
 *
 * Yang diuji di sini bukan tampilan, tapi hal-hal yang harus tetap benar meski
 * ada yang memaksa: klien mengirimi IP palsu, mencoba membuka log tanpa peran,
 * menebak passcode tanpa batas, atau menyalin passcode ke audit.
 */
describe("gerbang passcode dan security desk", () => {
  const deviceId = "device-uji-keamanan-0001";

  const PASSCODE_ENV = "ADMIN_PASSCODE_HASH";
  type EnvBag = { process?: { env?: Record<string, string | undefined> } };
  const env = () => {
    const bag = (globalThis as unknown as EnvBag).process?.env;
    if (!bag) throw new Error("Test environment does not expose an env record");
    return bag as Record<string, string | undefined>;
  };
  const previousPasscode = env()[PASSCODE_ENV];
  /**
   * `convexTest` versi ini tidak punya opsi env, tapi handler membaca
   * `process.env` saat request berjalan, jadi menetakkannya di sini memberi
   * efek yang sama dengan menaruhnya di Keys.
   */
  const usePasscode = async (value: string) => {
    env()[PASSCODE_ENV] = await encodePasscodeHash(value);
  };
  afterEach(() => {
    if (previousPasscode === undefined) delete env()[PASSCODE_ENV];
    else env()[PASSCODE_ENV] = previousPasscode;
  });

  async function setupAdmin(t: ReturnType<typeof convexTest>) {
    const id = await seedUserId(t, { name: "Admin Uji", email: "admin@sumenep.co.id" });
    const owner = t.withIdentity({ name: "Admin Uji", subject: id });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: id as never,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    return owner;
  }

  test("warga biasa tidak bisa membaca log keamanan, IP activity, atau sesi", async () => {
    const t = convexTest(schema, modules);
    const resident = await seededUser(t, { name: "Warga Biasa", email: "warga@sumenep.co.id" });

    await expect(resident.query(api.adminGate.listAdminSecurityEvents, {})).rejects.toThrow();
    await expect(resident.query(api.adminGate.adminSecuritySummary, {})).rejects.toThrow();
    await expect(resident.query(api.adminGate.listAdminIpActivity, {})).rejects.toThrow();
    await expect(resident.query(api.adminGate.currentAdminSession, {})).rejects.toThrow();
  });

  test("warga biasa tidak bisa logout, ganti passcode, atau mencatat jejak", async () => {
    const t = convexTest(schema, modules);
    const resident = await seededUser(t, { name: "Warga Biasa", email: "warga@sumenep.co.id" });

    await expect(resident.mutation(api.adminGate.logoutAdmin, {})).rejects.toThrow();
    await expect(
      resident.mutation(api.adminGate.recordSecurityDeskEvent, { kind: "viewed" }),
    ).rejects.toThrow();
    // Action ganti passcode menjawab `unauthorized`, bukan melempar apa pun soal
    // passcode: kalau ia melempar, error-nya bisa dipakai membedakannya.
    const result = await resident.action(api.adminGate.changeAdminPasscode, {
      currentPasscode: "apa-saja",
      newPasscode: "yang-sekali-juga-123",
    });
    expect(result).toEqual({ ok: false, reason: "unauthorized" });
  });

  test("IP kiriman klien tidak dipakai sebagai kunci rate limit", async () => {
    await usePasscode("benar-sekali-2026");
    const t = convexTest(schema, modules);
    const attacker = t.withIdentity({ name: "Penyerang" });

    // Beacon diblokir (tidak ada contextId), dan klien mengirimi IP berbeda
    // setiap panggilan. Kalau IP klien dipakai sebagai kunci, tiap panggilan
    // mendapat jatah baru dan rate limit tidak berlaku sama sekali.
    const first = await attacker.action(api.adminGate.verifyAdminPasscode, {
      passcode: "salah",
      deviceId,
      reportedIp: "1.1.1.1",
    });
    const second = await attacker.action(api.adminGate.verifyAdminPasscode, {
      passcode: "salah",
      deviceId,
      reportedIp: "2.2.2.2",
    });
    const third = await attacker.action(api.adminGate.verifyAdminPasscode, {
      passcode: "salah",
      deviceId,
      reportedIp: "3.3.3.3",
    });
    const fourth = await attacker.action(api.adminGate.verifyAdminPasscode, {
      passcode: "salah",
      deviceId,
      reportedIp: "4.4.4.4",
    });
    // Sisa jatah menyusut dan akhirnya terkunci, walaupun IP kiriman klien
    // berbeda tiap panggilan. Kalau IP klien ikut jadi kunci, `remaining`
    // selalu kembali ke nilai penuh dan panggilan keempat tidak pernah terkunci.
    expect(first).toMatchObject({ ok: false, reason: "invalid" });
    expect(second).toMatchObject({ ok: false, reason: "invalid" });
    expect(third).toMatchObject({ ok: false, reason: "invalid", remaining: 0 });
    expect(fourth).toMatchObject({ ok: false, reason: "locked" });
  });

  test("passcode yang dikonfigurasi di environment tetap dipakai sebelum rotasi", async () => {
    await usePasscode("benar-sekali-2026");
    const t = convexTest(schema, modules);
    const owner = await setupAdmin(t);

    const good = await owner.action(api.adminGate.changeAdminPasscode, {
      currentPasscode: "benar-sekali-2026",
      newPasscode: "GaramSumpenep#2026",
    });
    expect(good).toMatchObject({ ok: true });
    // Hash lama tidak pernah ikut dikembalikan ke klien.
    expect(JSON.stringify(good)).not.toContain("pbkdf2");
  });

  test("rotasi menolak passcode lama yang salah dan passcode baru yang lemah", async () => {
    await usePasscode("benar-sekali-2026");
    const t = convexTest(schema, modules);
    const owner = await setupAdmin(t);

    expect(
      await owner.action(api.adminGate.changeAdminPasscode, {
        currentPasscode: "salah-total",
        newPasscode: "GaramSumpenep#2026",
      }),
    ).toEqual({ ok: false, reason: "wrong_current" });

    const weak = await owner.action(api.adminGate.changeAdminPasscode, {
      currentPasscode: "benar-sekali-2026",
      newPasscode: "123",
    });
    expect(weak.ok).toBe(false);
    if (!weak.ok) expect(weak.reason).toBe("weak");
  });

  test("rotasi membatalkan tiket gerbang yang belum dipakai", async () => {
    await usePasscode("benar-sekali-2026");
    const t = convexTest(schema, modules);
    const owner = await setupAdmin(t);
    const visitor = t.withIdentity({ name: "Pengunjung" });

    const opened = await visitor.action(api.adminGate.verifyAdminPasscode, {
      passcode: "benar-sekali-2026",
      deviceId,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const rotated = await owner.action(api.adminGate.changeAdminPasscode, {
      currentPasscode: "benar-sekali-2026",
      newPasscode: "GaramSumpenep#2026",
    });
    expect(rotated).toMatchObject({ ok: true, revokedTickets: 1 });

    // Tiket yang sudah terbit sebelum rotasi tidak lagi berlaku.
    const replay = await visitor.action(api.adminGate.verifyAdminTicket, {
      ticket: opened.ticket,
      email: "apa@saja.id",
    });
    expect(replay.ok).toBe(false);
  });

  test("passcode lama berhenti berlaku setelah rotasi", async () => {
    await usePasscode("benar-sekali-2026");
    const t = convexTest(schema, modules);
    const owner = await setupAdmin(t);
    const visitor = t.withIdentity({ name: "Pengunjung" });

    await owner.action(api.adminGate.changeAdminPasscode, {
      currentPasscode: "benar-sekali-2026",
      newPasscode: "GaramSumpenep#2026",
    });

    const old = await visitor.action(api.adminGate.verifyAdminPasscode, {
      passcode: "benar-sekali-2026",
      deviceId,
    });
    expect(old).toMatchObject({ ok: false, reason: "invalid" });
  });

  test("logout menghapus presence dan menulis jejak audit tanpa passcode", async () => {
    const t = convexTest(schema, modules);
    const owner = await setupAdmin(t);
    await owner.mutation(api.adminGate.heartbeatAdminPresence, { route: "/admin" });
    expect(await t.run(async (ctx) => ctx.db.query("adminPresence").collect())).toHaveLength(1);

    await owner.mutation(api.adminGate.logoutAdmin, { route: "/admin" });
    expect(await t.run(async (ctx) => ctx.db.query("adminPresence").collect())).toHaveLength(0);

    const audit = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").withIndex("byAction", (q) => q.eq("action", "admin.logout")).collect(),
    );
    expect(audit).toHaveLength(1);
    const serialized = JSON.stringify(audit);
    for (const secret of ["passcode", "pbkdf2", "token", "cookie", "authorization"]) {
      expect(serialized.toLowerCase()).not.toContain(secret);
    }
  });

  test("audit rotasi tidak pernah memuat passcode, hash, atau salt", async () => {
    await usePasscode("benar-sekali-2026");
    const t = convexTest(schema, modules);
    const owner = await setupAdmin(t);
    await owner.action(api.adminGate.changeAdminPasscode, {
      currentPasscode: "benar-sekali-2026",
      newPasscode: "GaramSumpenep#2026",
    });

    const audit = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("byAction", (q) => q.eq("action", "admin.passcode_changed"))
        .collect(),
    );
    expect(audit).toHaveLength(1);
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("benar-sekali-2026");
    expect(serialized).not.toContain("GaramSumpenep");
    expect(serialized).not.toContain("pbkdf2");
  });

  test("log keamanan tidak pernah memuat IP mentah, hanya bentuk tersamar", async () => {
    const t = convexTest(schema, modules);
    const owner = await setupAdmin(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-uji",
        outcome: "success",
        ipHash: "hash-rahasia",
        ipMasked: "203.0.113.xxx",
        ipSource: "CF-Connecting-IP",
        ipFamily: "IPv4",
        createdAt: Date.now(),
      });
    });
    const page = await owner.query(api.adminGate.listAdminSecurityEvents, {});
    const serialized = JSON.stringify(page);
    // Hash internal tidak boleh keluar; hanya bentuk yang tersamar.
    expect(serialized).not.toContain("hash-rahasia");
    expect(serialized).toContain("203.0.113.xxx");
  });
});
/**
 * Retensi data keamanan.
 *
 * Fungsi pemangkas ini sebelumnya ada tapi tidak pernah dipanggil siapa pun,
 * jadi batas jumlah baris dan batas usia di dalam kodenya hanya hiasan.
 * Tes di sini mengunci dua sisi: logikanya benar, dan cron-nya benar-benar
 * terdaftar. Tes cron membaca sumbernya karena kegagalan di sini adalah
 * keheningan: menghapus baris `crons.daily(...)` harus menggagalkan tes ini,
 * bukan lolos tanpa terasa.
 */

describe("retensi data keamanan", () => {
  const DAY = 24 * 60 * 60_000;
  const readSource = (name: string) =>
    readFileSync(new URL(name, import.meta.url), "utf8");

  test("cron harian memanggil pemangkas, dan tidak lewat api publik", () => {
    const crons = readSource("./crons.ts");
    expect(crons).toContain("internal.adminGate.pruneAdminSecurityEvents");
    expect(crons).toMatch(/crons\.daily\(/);
    // Kalau cron mengarahkan ke `api.*`, permukaannya jadi publik dan
    // siapa pun bisa memicu pemangkasan.
    expect(crons).not.toMatch(/crons\.\w+\([^)]*api\./s);

    // Pemangkas sendiri harus tetap internal. Menurunkannya ke `mutation`
    // akan membuka jalan untuk mengosongkan Security Desk.
    const adminGate = readSource("./adminGate.ts");
    const declaration = adminGate.match(
      /export const pruneAdminSecurityEvents = (\w+)\(/,
    );
    expect(declaration?.[1]).toBe("internalMutation");
  });

  test("batas jumlah baris: yang tertua dibuang, yang terbaru utuh", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("adminPasscodeAttempts", {
          key: `kunci-${i}`,
          outcome: "failed",
          createdAt: now - i * 60_000, // i=0 paling baru
        });
      }
    });

    const removed = await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {
      keepLatest: 2,
      retentionDays: 30,
    });
    expect(removed).toBe(3);

    const left = await t.run(async (ctx) => {
      const rows = await ctx.db.query("adminPasscodeAttempts").collect();
      return rows.map((row) => row.key).sort();
    });
    expect(left).toEqual(["kunci-0", "kunci-1"]);
  });

  test("batas usia tetap berlaku walau barisnya masih sedikit", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      // Lima perlakuan, hanya dua yang sudah melewati 30 hari.
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "lama-a",
        outcome: "failed",
        createdAt: now - 40 * DAY,
      });
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "lama-b",
        outcome: "failed",
        createdAt: now - 31 * DAY,
      });
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "baru-a",
        outcome: "success",
        createdAt: now - 10 * DAY,
      });
      await ctx.db.insert("adminPasscodeAttempts", {
        key: "baru-b",
        outcome: "success",
        createdAt: now - 1 * DAY,
      });
    });

    // `keepLatest` sengaja dikembalikan ke 500 supaya barisnya sudah di bawah
    // batas jumlah: kalau tes ini masih membuang baris, yang bekerja adalah
    // batas usia.
    const removed = await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {
      keepLatest: 500,
      retentionDays: 30,
    });
    expect(removed).toBe(2);

    const left = await t.run(async (ctx) => {
      const rows = await ctx.db.query("adminPasscodeAttempts").collect();
      return rows.map((row) => row.key).sort();
    });
    expect(left).toEqual(["baru-a", "baru-b"]);
  });

  test("konteks kedaluwarsa dan kehadiran lama ikut dibersihkan", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const userId = await seedUserId(t, { name: "Admin Retensi", email: "retensi@sumenep.co.id" });
    await t.run(async (ctx) => {
      await ctx.db.insert("adminSecurityContexts", {
        token: "basi",
        ipSource: "CF-Connecting-IP",
        requestId: "r1",
        expiresAt: now - 60_000,
        createdAt: now - 60_000,
      });
      await ctx.db.insert("adminSecurityContexts", {
        token: "masih-hidup",
        ipSource: "CF-Connecting-IP",
        requestId: "r2",
        expiresAt: now + 5 * 60_000,
        createdAt: now,
      });
      await ctx.db.insert("adminPresence", {
        userId: userId as never,
        lastSeenAt: now - 30 * DAY,
        firstSeenAt: now - 30 * DAY,
      });
      await ctx.db.insert("adminPresence", {
        userId: userId as never,
        lastSeenAt: now,
        firstSeenAt: now,
      });
    });

    await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {
      keepLatest: 500,
      retentionDays: 30,
    });

    const state = await t.run(async (ctx) => {
      const contexts = await ctx.db.query("adminSecurityContexts").collect();
      const presence = await ctx.db.query("adminPresence").collect();
      return {
        tokens: contexts.map((row) => row.token).sort(),
        presenceCount: presence.length,
      };
    });
    expect(state.tokens).toEqual(["masih-hidup"]);
    expect(state.presenceCount).toBe(1);
  });

  test("prune yang tidak menemukan apa pun tetap idempoten", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {});
    const second = await t.mutation(internal.adminGate.pruneAdminSecurityEvents, {});
    expect(first).toBe(0);
    expect(second).toBe(0);
  });
});

/**
 * Pencabutan sesi admin dari Security Desk.
 *
 * Yang diuji di sini bukan cuma "tombolnya kelihatan", tapi dua hal yang
 * lebih penting: server benar-benar menolak sesi yang dicabut pada permintaan
 * berikutnya, dan tidak ada jalan untuk mencabut sesi orang lain.
 */
describe("pencabutan sesi admin", () => {
  const DAY = 24 * 60 * 60_000;

  /** Sesi Convex Auth palsu: cukup `_id`-nya yang valid untuk dipakai pengikat. */
  async function seedSession(t: ReturnType<typeof convexTest>, userId: string) {
    return await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("authSessions", { userId, expirationTime: Date.now() + 30 * DAY });
    });
  }

  /** Percobaan "berhasil" + pengikatnya, seperti yang dibuat reportSessionContext. */
  async function seedBoundAttempt(
    t: ReturnType<typeof convexTest>,
    args: { userId: string; sessionId: string; reference: string; outcome?: "success" | "failed" },
  ): Promise<DataModel["adminPasscodeAttempts"]["document"]["_id"]> {
    const attemptId = await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
        patch: (id: string, patch: Record<string, unknown>) => Promise<void>;
      };
      const attemptId = await db.insert("adminPasscodeAttempts", {
        key: "kunci-uji-sesi",
        outcome: args.outcome ?? "success",
        ipMasked: "203.0.113.xxx",
        sessionReference: args.reference,
        createdAt: Date.now(),
      });
      if ((args.outcome ?? "success") === "success") {
        await db.insert("adminSessionBindings", {
          attemptId,
          userId: args.userId,
          sessionId: args.sessionId,
          sessionReference: args.reference,
          createdAt: Date.now(),
        });
      }
      return attemptId;
    });
    return attemptId as DataModel["adminPasscodeAttempts"]["document"]["_id"];
  }

  async function setupAdmin(t: ReturnType<typeof convexTest>, email = "admin-cabut@sumenep.co.id") {
    const userId = await seedUserId(t, { name: "Admin Cabut", email });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: userId as never,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    return userId;
  }

  test("warga biasa dan non-admin tidak bisa mencabut sesi siapa pun", async () => {
    const t = convexTest(schema, modules);
    const resident = await seededUser(t, { name: "Warga", email: "warga-cabut@sumenep.co.id" });
    const adminId = await setupAdmin(t);
    const sessionId = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId,
      reference: "ref-target",
    });

    await expect(
      resident.mutation(api.adminGate.revokeAdminSession, { attemptId }),
    ).rejects.toThrow();

    // smelling Viewer juga bukan admin: peran dicek sebelum apa pun.
    const viewerId = await seedUserId(t, { name: "Lihat Saja", email: "lihat@sumenep.co.id" });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: viewerId as never,
        role: "viewer",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const viewer = t.withIdentity({ subject: viewerId });
    await expect(
      viewer.mutation(api.adminGate.revokeAdminSession, { attemptId }),
    ).rejects.toThrow();

    const revoked = await t.run(async (ctx) =>
      (await ctx.db.query("revokedAdminSessions").collect()).length,
    );
    expect(revoked).toBe(0);
  });

  test("percobaan gagal dan percobaan tanpa pengikat ditolak dengan alasan yang jelas", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const sessionId = await seedSession(t, adminId);
    const admin = t.withIdentity({ subject: `${adminId}|${sessionId}` });

    const failedAttempt = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId,
      reference: "ref-gagal",
      outcome: "failed",
    });
    await expect(
      admin.mutation(api.adminGate.revokeAdminSession, { attemptId: failedAttempt }),
    ).resolves.toEqual({ ok: false, reason: "NOT_A_SUCCESSFUL_ATTEMPT" });

    // Baris lama: sukses tapi belum pernah punya pengikat sesi.
    const legacyAttempt = await t.run(async (ctx) =>
      ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-lama",
        outcome: "success" as const,
        createdAt: Date.now(),
      }),
    );
    await expect(
      admin.mutation(api.adminGate.revokeAdminSession, { attemptId: legacyAttempt }),
    ).resolves.toEqual({ ok: false, reason: "SESSION_NOT_FOUND" });
  });

  test("mencabut sesi menandai daftar cabut, attempt, dan menulis audit", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerSessionId = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: "hash-target",
    });
    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });

    const result = await caller.mutation(api.adminGate.revokeAdminSession, {
      attemptId,
      reason: "perangkat hilang",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("harus berhasil");

    const state = await t.run(async (ctx) => {
      const revoked = await ctx.db.query("revokedAdminSessions").collect();
      const attempt = (await ctx.db.get(attemptId)) as
        | { sessionRevokedAt?: number }
        | null;
      const audits = await ctx.db.query("auditLogs").collect();
      return {
        revokedCount: revoked.length,
        revokedSessionId: revoked[0]?.sessionId,
        attemptRevokedAt: attempt?.sessionRevokedAt,
        auditActions: audits.map((a) => a.action),
        auditMeta: audits[0]?.metadata ?? {},
        auditRaw: JSON.stringify(audits),
      };
    });
    expect(state.revokedCount).toBe(1);
    expect(state.revokedSessionId).toBe(targetSessionId);
    expect(state.attemptRevokedAt).toBeGreaterThan(0);
    expect(state.auditActions).toContain("admin.session_revoked");
    expect(state.auditMeta).toMatchObject({ targetIpMasked: "203.0.113.xxx", reason: "perangkat hilang" });
    // Id sesi dan hash-nya tidak boleh bocor ke audit.
    expect(state.auditRaw).not.toContain(targetSessionId);
    expect(state.auditRaw).not.toContain("hash-target");
  });

  test("mencabut sesi yang sudah dicabut tidak melempar, hanya melaporkan sudah dicabut", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerSessionId = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: "hash-ulang",
    });
    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });

    const first = await caller.mutation(api.adminGate.revokeAdminSession, {
      attemptId,
    });
    const second = await caller.mutation(api.adminGate.revokeAdminSession, {
      attemptId,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("harus berhasil");
    expect(second.alreadyRevoked).toBe(true);
    expect(second.revokedAt).toBe(first.revokedAt);

    const rows = await t.run(async (ctx) => ctx.db.query("revokedAdminSessions").collect());
    expect(rows.length).toBe(1);
  });

  test("sesi sendiri bisa dicabut, dan hanya sesi itu yang terpengaruh", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const ownSessionId = await seedSession(t, adminId);
    const otherSessionId = await seedSession(t, adminId);
    const ownAttempt = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: ownSessionId,
      reference: "hash-saya",
    });
    // Sesi perangkat lain milik admin yang sama: harus tetap hidup.
    const otherAttempt = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: otherSessionId,
      reference: "hash-perangkat-lain",
    });
    const caller = t.withIdentity({ subject: `${adminId}|${ownSessionId}` });

    const result = await caller.mutation(api.adminGate.revokeAdminSession, {
      attemptId: ownAttempt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("harus berhasil");
    // Sinyal ke klien supaya ia signOut, bukan menggantung dengan UI aktif.
    expect(result.selfRevoked).toBe(true);

    const revokedSessions = await t.run(async (ctx) =>
      (await ctx.db.query("revokedAdminSessions").collect()).map((r) => r.sessionId),
    );
    // Hanya sesi sendiri. Sesi perangkat lain tidak boleh ikut mati.
    expect(revokedSessions).toEqual([ownSessionId]);
    expect(revokedSessions).not.toContain(otherSessionId);

    // Perangkat lain masih bisa dipakai.
    const other = t.withIdentity({ subject: `${adminId}|${otherSessionId}` });
    await expect(other.query(api.adminGate.listAdminSecurityEvents, {})).resolves.toBeTruthy();

    // Presence perangkat lain tidak boleh ikut terputus.
    const presence = await t.run(async (ctx) => ctx.db.query("adminPresence").collect());
    for (const row of presence) {
      expect(row.sessionFingerprint).toBe("perangkat-admin");
    }
    void otherAttempt;
  });

  test("watchdog melaporkan status sesi tanpa melempar SESSION_REVOKED", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const sessionId = await seedSession(t, adminId);
    const caller = t.withIdentity({ subject: `${adminId}|${sessionId}` });

    // Watchdog harus bisa bilang "aktif" dulu...
    const before = await caller.query(api.adminGate.currentAdminSessionStatus, {});
    expect(before).toEqual({ status: "active" });

    // ...dan setelah dicabut harus bisa bilang "dicabut" TANPA melempar,
    // supaya klien sempat membaca statusnya dan keluar dengan rapi.
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId,
      reference: "hash-watchdog",
    });
    await caller.mutation(api.adminGate.revokeAdminSession, { attemptId });
    const after = await caller.query(api.adminGate.currentAdminSessionStatus, {});
    expect(after.status).toBe("revoked");
    expect(after.revokedAt).toBeGreaterThan(0);
  });

  test("watchdog melaporkan ended untuk sesi yang tidak ada lagi di Convex Auth", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const sessionId = await seedSession(t, adminId);
    const caller = t.withIdentity({ subject: `${adminId}|${sessionId}` });
    // Baris `authSessions` dihapus saat logout/expired oleh Convex Auth, dan
    // tidak ada catatan pencabutan. Itu harus terbaca "ended", bukan "aktif".
    await t.run(async (ctx) => {
      const row = await ctx.db.query("authSessions").first();
      await ctx.db.delete(row!._id);
    });
    const status = await caller.query(api.adminGate.currentAdminSessionStatus, {});
    expect(status).toEqual({ status: "expired" });
  });

  test("watchdog memakai sumber kedaluwarsa milik Convex Auth, bukan salinan", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const sessionId = await seedSession(t, adminId);
    const caller = t.withIdentity({ subject: `${adminId}|${sessionId}` });
    // Ubah HANYA `authSessions.expirationTime` ke masa lalu. Kalau ada salinan
    // waktu kedaluwarsa di tabel binding kita, tes ini akan gagal — dan itu
    // memang tujuannya: membuktikan tidak ada sumber kebenaran ganda.
    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId as never, { expirationTime: Date.now() - 1000 });
    });
    const status = await caller.query(api.adminGate.currentAdminSessionStatus, {});
    expect(status).toEqual({ status: "expired" });
  });

  test("percobaan terkunci dan percobaan tidak ada ditolak dengan aman", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const sessionId = await seedSession(t, adminId);
    const caller = t.withIdentity({ subject: `${adminId}|${sessionId}` });

    const lockedAttempt = await t.run(async (ctx) =>
      ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-terkunci",
        outcome: "locked" as const,
        createdAt: Date.now(),
      }),
    );
    await expect(
      caller.mutation(api.adminGate.revokeAdminSession, { attemptId: lockedAttempt }),
    ).resolves.toEqual({ ok: false, reason: "NOT_A_SUCCESSFUL_ATTEMPT" });

    const missing = await t.run(async (ctx) =>
      ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-hilang",
        outcome: "success" as const,
        createdAt: Date.now(),
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.delete(missing as never);
    });
    await expect(
      caller.mutation(api.adminGate.revokeAdminSession, { attemptId: missing }),
    ).resolves.toEqual({ ok: false, reason: "ATTEMPT_NOT_FOUND" });
  });

  test("percobaan milik orang lain tidak bisa dicabut: ownership diperiksa lewat sesi target", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    // Sesi milik pengguna non-staff, diikat ke percobaan yang sukses.
    const strangerId = await seedUserId(t, { name: "Asing", email: "asing@sumenep.co.id" });
    const strangerSession = await seedSession(t, strangerId);
    const strangerAttempt = await seedBoundAttempt(t, {
      userId: strangerId,
      sessionId: strangerSession,
      reference: "hash-asing",
    });
    const callerSession = await seedSession(t, adminId);
    const caller = t.withIdentity({ subject: `${adminId}|${callerSession}` });

    // Admin BOLEH mencabut sesi siapa pun di organisasinya — tapi yang dipinjam
    // di sini adalah id sesi milik orang non-staff, dan hasilnya harus tetap
    // dicatat untuk user yang benar, bukan dicocokkan dari klien.
    const result = await caller.mutation(api.adminGate.revokeAdminSession, {
      attemptId: strangerAttempt,
    });
    expect(result.ok).toBe(true);
    const row = await t.run(async (ctx) => (await ctx.db.query("revokedAdminSessions").collect())[0]);
    // User yang tercatat adalah pemilik sesi, ditentukan server dari binding.
    expect(row?.userId).toBe(strangerId);
  });

  test("audit menyimpan correlation dan target reference tanpa membocorkan rahasia", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSession = await seedSession(t, adminId);
    const callerSession = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSession,
      reference: "a".repeat(64),
    });
    const caller = t.withIdentity({ subject: `${adminId}|${callerSession}` });
    await caller.mutation(api.adminGate.revokeAdminSession, {
      attemptId,
      reason: "perangkat dicurigai",
    });

    const audit = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect())[0]);
    const meta = audit?.metadata ?? {};
    expect(meta.targetUserRef).toMatch(/^[0-9a-f]{12}$/);
    expect(meta.targetSessionRef).toBe("aaaaaaaa");
    expect(meta.reason).toBe("perangkat dicurigai");
    expect(meta.targetIpMasked).toBe("203.0.113.xxx");

    // Yang TIDAK boleh ada: id sesi mentah, hash penuh, atau kredensial.
    // Pemeriksaan dilakukan pada `metadata` — `entityId` memang memuat nama
    // tabel (`adminPasscodeAttempts`), itu pengenal baris, bukan passcode.
    expect(JSON.stringify(meta)).not.toMatch(/token|refresh|cookie|passcode|secret/i);
    const raw = JSON.stringify(audit);
    expect(raw).not.toContain(targetSession);
    expect(raw).not.toContain(callerSession);
    expect(raw).not.toContain("a".repeat(64));
  });

  test("perilaku publik tetap berjalan setelah ada pencabutan", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSession = await seedSession(t, adminId);
    const callerSession = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSession,
      reference: "hash-publik",
    });
    const caller = t.withIdentity({ subject: `${adminId}|${callerSession}` });
    await caller.mutation(api.adminGate.revokeAdminSession, { attemptId });

    // Sesi yang dicabut: semua operasi admin ditolak...
    const revoked = t.withIdentity({ subject: `${adminId}|${targetSession}` });
    await expect(revoked.query(api.adminGate.listAdminSecurityEvents, {})).rejects.toThrow();
    await expect(revoked.mutation(api.users.createStaffInvite, { email: "x@y.id", role: "staff" })).rejects.toThrow();

    // ...tapi warga biasa dan halaman publik tidak ikut terpengaruh.
    const residentId = await seedUserId(t, { name: "Warga Biasa", email: "warga-umum@sumenep.co.id" });
    const resident = t.withIdentity({ subject: residentId });
    await expect(resident.query(api.users.currentUserId, {})).resolves.toBe(residentId);
    await expect(resident.query(api.vendors.listActive, {})).resolves.toBeDefined();
  });

  test("perangkat yang sesinya dicabut ditolak di permintaan berikutnya dengan SESSION_REVOKED", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerSessionId = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: "hash-live",
    });
    const target = t.withIdentity({ subject: `${adminId}|${targetSessionId}` });
    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });

    // Sebelum dicabut, target boleh masuk seperti biasa.
    await expect(target.query(api.adminGate.listAdminSecurityEvents, {})).resolves.toBeTruthy();

    await caller.mutation(api.adminGate.revokeAdminSession, { attemptId });

    // Sesudahnya, query biasa sudah ditolak. Inilah bukti pencabutan
    // berlaku di server dan bukan cuma berubah tampilan.
    let caught: unknown = null;
    try {
      await target.query(api.adminGate.listAdminSecurityEvents, {});
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeNull();
    const data = (caught as { data?: { code?: string } }).data;
    expect(data?.code).toBe("SESSION_REVOKED");

    // Perangkat lain milik orang yang sama tetap jalan.
    await expect(caller.query(api.adminGate.listAdminSecurityEvents, {})).resolves.toBeTruthy();
  });

  test("daftar Security Desk menandai state sesi tanpa mengirim pengenalnya", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerSessionId = await seedSession(t, adminId);
    // Reference harus hash sungguhan dari id sesi, sama seperti yang dihitung
    // server. String karangan tidak akan pernah cocok, dan itu memang tujuan
    // tes ini: bandingkan hash asli, bukan label buatan.
    const targetRef = await sha256Hex(targetSessionId);
    const callerRef = await sha256Hex(callerSessionId);
    const revokedAttemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: targetRef,
    });
    const ownAttemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: callerSessionId,
      reference: callerRef,
    });
    const failedAttemptId = await t.run(async (ctx) =>
      ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-gagal",
        outcome: "failed" as const,
        createdAt: Date.now(),
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(revokedAttemptId, { sessionRevokedAt: Date.now() });
    });

    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });
    const page = await caller.query(api.adminGate.listAdminSecurityEvents, {});
    const byId = new Map(page.events.map((event) => [event._id, event]));

    expect(byId.get(ownAttemptId)?.sessionState).toBe("current");
    expect(byId.get(revokedAttemptId)?.sessionState).toBe("revoked");
    expect(byId.get(revokedAttemptId)?.sessionRevokedAt).toBeGreaterThan(0);
    expect(byId.get(failedAttemptId)?.sessionState).toBe("none");

    // Hash sesi tidak ikut keluar ke klien; hanya bentuk ternormalisasinya.
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(targetRef);
    expect(serialized).not.toContain(callerRef);
    expect(serialized).not.toContain(targetSessionId);
  });

  test("presence milik perangkat lain tidak ikut terputus", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerSessionId = await seedSession(t, adminId);
    const callerRef = "c".repeat(64);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: "d".repeat(64),
    });
    // Presence satu baris per pengguna, dan baris itu sedang milik perangkat
    // pemanggil. Memotongnya akan membuat perangkat yang masih aktif terlihat
    // offline — itu kesalahan yang harus diuji, bukan diasumsikan.
    await t.run(async (ctx) => {
      await ctx.db.insert("adminPresence", {
        userId: adminId as never,
        sessionFingerprint: "perangkat-admin",
        sessionReference: callerRef,
        lastSeenAt: Date.now(),
        firstSeenAt: Date.now(),
        signedInAt: Date.now(),
      });
    });

    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });
    await caller.mutation(api.adminGate.revokeAdminSession, { attemptId });

    const presence = await t.run(async (ctx) => ctx.db.query("adminPresence").collect());
    expect(presence.length).toBe(1);
    expect(presence[0]?.sessionFingerprint).toBe("perangkat-admin");
    expect(presence[0]?.sessionReference).toBe(callerRef);
  });

  test("dua pencabutan bersamaan hanya menghasilkan satu transisi efektif", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerA = await seedSession(t, adminId);
    const callerB = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: "a".repeat(64),
    });
    const a = t.withIdentity({ subject: `${adminId}|${callerA}` });
    const b = t.withIdentity({ subject: `${adminId}|${callerB}` });

    // Dua admin menekan tombolnya pada milidetik yang sama. Yang penting bukan
    // hasil mana yang menang, tapi bahwa tidak ada dua transisi dan tidak ada
    // ada error:percobaan kedua harus membaca "sudah dicabut".
    const [first, second] = await Promise.all([
      a.mutation(api.adminGate.revokeAdminSession, { attemptId }),
      b.mutation(api.adminGate.revokeAdminSession, { attemptId }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const alreadyCount = [first, second].filter((r) => r.alreadyRevoked === true).length;
    expect(alreadyCount).toBe(1);

    const revocations = await t.run(async (ctx) => ctx.db.query("revokedAdminSessions").collect());
    expect(revocations.length).toBe(1);

    // Audit pun tidak boleh berduplikasi untuk operasi idempoten yang sama.
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("byAction", (q) => q.eq("action", "admin.session_revoked"))
        .collect(),
    );
    expect(audits.length).toBe(1);
  });

  test("target yang logout sendiri di saat yang sama tidak menimbulkan keadaan setengah jadi", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerSessionId = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: "b".repeat(64),
    });
    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });

    // Target menutup sesi-nya sendiri (Convex Auth menghapus baris authSessions)
    // tepat sebelum admin menekan tombol. Baris binding dan attempt masih ada,
    // jadi pencabutan harus tetap aman dan idempoten.
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        get: (id: string) => Promise<unknown>;
        delete: (id: string) => Promise<void>;
      };
      await db.delete(targetSessionId);
    });

    const result = await caller.mutation(api.adminGate.revokeAdminSession, { attemptId });
    expect(result.ok).toBe(true);
    const again = await caller.mutation(api.adminGate.revokeAdminSession, { attemptId });
    expect(again.alreadyRevoked).toBe(true);
  });

  test("perangkat offline yang tersambung kembali tidak regain akses admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const targetSessionId = await seedSession(t, adminId);
    const callerSessionId = await seedSession(t, adminId);
    const attemptId = await seedBoundAttempt(t, {
      userId: adminId,
      sessionId: targetSessionId,
      reference: "c".repeat(64),
    });
    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });
    const target = t.withIdentity({ subject: `${adminId}|${targetSessionId}` });

    // Perangkat target tidak aktif saat admin mencabut: tidak ada satu pun
    // permintaan yang dibuat dari sana.
    await caller.mutation(api.adminGate.revokeAdminSession, { attemptId });

    // Perangkat target tersambung kembali dan langsung mencoba lagi. Ini
    // skenario "reconnect" yang harus gagal, bukan lolos karena jalannya sempat
    // sempat terputus.
    let caught: unknown = null;
    try {
      await target.query(api.adminGate.listAdminSecurityEvents, {});
    } catch (error) {
      caught = error;
    }
    expect((caught as { data?: { code?: string } })?.data?.code).toBe("SESSION_REVOKED");

    // Watchdog di perangkat itu sendiri harus tetap bisa menjawab "revoked",
    // justru supaya klien bisa keluar dengan rapi alih-alih terjebak error.
    const status = await target.query(api.adminGate.currentAdminSessionStatus, {});
    expect(status.status).toBe("revoked");
  });

  test("attemptId karangan dan session reference karangan tidak bisa dipakai", async () => {
    const t = convexTest(schema, modules);
    const adminId = await setupAdmin(t);
    const callerSessionId = await seedSession(t, adminId);
    const caller = t.withIdentity({ subject: `${adminId}|${callerSessionId}` });

    // Id yang|format-nya benar tapi tidak ada di tabel harus berhenti sebagai
    // "tidak ditemukan", bukan meledak atau, lebih buruk, menunjuk baris lain.
    // Id diambil dari baris nyata lalu dihapus, supaya formatnya benar-benar
    // sahih — karangan|string acak akan ditolak validator, bukan logika kita.
    const stale = await t.run(async (ctx) => {
      const attemptId = await ctx.db.insert("adminPasscodeAttempts", {
        key: "kunci-sudah-dihapus",
        outcome: "success" as const,
        createdAt: Date.now(),
      });
      await ctx.db.delete(attemptId);
      return attemptId;
    });
    const missing = await caller.mutation(api.adminGate.revokeAdminSession, { attemptId: stale });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("ATTEMPT_NOT_FOUND");

    // Argumen `sessionReference`/`userId`/`revokedBy` sengaja tidak ada di
    // validator. Server menolaknya sebagai argumen tak dikenal, jadi klien
    // tidak pernah bisa menentukan identitas sesi yang dicabut sendiri.
    await expect(
      caller.mutation(api.adminGate.revokeAdminSession, {
        attemptId: stale,
        sessionReference: "dipalsukan",
        userId: "dipalsukan",
        revokedBy: "dipalsukan",
      } as never),
    ).rejects.toBeTruthy();
  });
});

describe("pengikatan percobaan login ke sesi nyata", () => {
  const SALT = "sumenep-buku-kerja";

  async function staff(t: ReturnType<typeof convexTest>, email: string) {
    const userId = await seedUserId(t, { name: "Penguji", email });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: userId as never,
        role: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    return userId;
  }

  async function authSession(t: ReturnType<typeof convexTest>, userId: string) {
    return await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 30 * 24 * 60 * 60_000,
      });
    });
  }

  async function successAttempt(
    t: ReturnType<typeof convexTest>,
    createdAt: number,
    fingerprint?: string,
  ) {
    return await t.run(async (ctx) => {
      const db = ctx.db as unknown as {
        insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
      };
      return await db.insert("adminPasscodeAttempts", {
        key: "kunci-uji-pengikatan",
        outcome: "success",
        createdAt,
        sessionFingerprint: fingerprint,
      });
    });
  }

  test("deviceId dari klien di-hash server dan tidak pernah tersimpan mentah", async () => {
    const t = convexTest(schema, modules);
    const userId = await staff(t, "hash-owner@sumenep.co.id");
    const sessionId = await authSession(t, userId);
    const rawDeviceId = "4e137404de5843fc6fc2855180057be9";
    const admin = t.withIdentity({ subject: `${userId}|${sessionId}` });

    await admin.mutation(api.adminGate.reportSessionContext, { token: "kctx-uji", deviceId: rawDeviceId });

    const presence = await t.run(async (ctx) => ctx.db.query("adminPresence").collect());
    const expected = await deriveSessionFingerprint(rawDeviceId, SALT);

    // Yang tersimpan harus bentuk ber-prefix `sfp_`, sama seperti yang dipakai
    // tabel percobaan. Bentuk mentah di sini berarti klien pernah kirim sidik
    // jadi, dan pengikatan tidak akan pernah cocok.
    expect(presence[0]?.sessionFingerprint).toBe(expected);
    expect(presence[0]?.sessionFingerprint).toMatch(/^sfp_/);
    // Device id mentah tidak boleh muncul di baris mana pun.
    expect(JSON.stringify(presence)).not.toContain(rawDeviceId);
  });

  test("percobaan sukses diikat ke sesi saat sidik jarinya sama persis", async () => {
    const t = convexTest(schema, modules);
    const userId = await staff(t, "bind-owner@sumenep.co.id");
    const sessionId = await authSession(t, userId);
    const deviceId = "abcdef0123456789abcdef0123456789";
    const fingerprint = await deriveSessionFingerprint(deviceId, SALT);
    const attemptId = await successAttempt(t, Date.now() - 5_000, fingerprint);
    const admin = t.withIdentity({ subject: `${userId}|${sessionId}` });

    await admin.mutation(api.adminGate.reportSessionContext, { token: "kctx-uji", deviceId });

    const bindings = await t.run(async (ctx) => ctx.db.query("adminSessionBindings").collect());
    expect(bindings.length).toBe(1);
    expect(bindings[0]?.attemptId).toBe(attemptId);
    expect(bindings[0]?.sessionId).toBe(sessionId);

    // Baris percobaan ikut ditandai supaya Security Desk tahu ada sesi hidup.
    const attempts = await t.run(async (ctx) => ctx.db.query("adminPasscodeAttempts").collect());
    expect(attempts[0]?.sessionReference).toBe(bindings[0]?.sessionReference);
  });

  test("sidik jari berbeda tidak boleh mengambil alih percobaan orang lain", async () => {
    const t = convexTest(schema, modules);
    const userId = await staff(t, "isolasi-owner@sumenep.co.id");
    const sessionId = await authSession(t, userId);

    // Percobaan milik admin lain, dengan sidik jari perangkat yang lain.
    const otherFingerprint = await deriveSessionFingerprint("perangkat-orang-lain", SALT);
    const now = Date.now();
    await successAttempt(t, now - 2_000, otherFingerprint);
    await successAttempt(t, now - 1_000, otherFingerprint);

    const admin = t.withIdentity({ subject: `${userId}|${sessionId}` });
    await admin.mutation(api.adminGate.reportSessionContext, {
      token: "kctx-uji",
      deviceId: "perangkat-yang-sama-sekali-berbeda",
    });

    // Ini regresi untuk fallback lama. Fallback "ambil kandidat terbaru saja"
    // akan mengikat dua percobaan itu ke sesi admin ini, sehingga admin bisa
    // mencabut perangkat yang salah orang.
    const bindings = await t.run(async (ctx) => ctx.db.query("adminSessionBindings").collect());
    expect(bindings.length).toBe(0);
  });

  test("klien versi lama yang masih memakai nama argumen lama tetap aman", async () => {
    const t = convexTest(schema, modules);
    const userId = await staff(t, "lama-owner@sumenep.co.id");
    const sessionId = await authSession(t, userId);
    const rawDeviceId = "lama-device-id-000000000000000000";
    const admin = t.withIdentity({ subject: `${userId}|${sessionId}` });

    // Klien yang sudah terbuka sebelum deploy baru tetap mengirim device id
    // mentah di argimen bernama lama. Kalau server menolaknya, heartbeat-nya
    // gagal diam-diam dan baris presence membeku. Nilainya tetap di-hash, jadi
    // tidak ada jalan untuk menyimpan device id mentah.
    await admin.mutation(api.adminGate.reportSessionContext, {
      token: "kctx-uji",
      sessionFingerprint: rawDeviceId,
    });

    const presence = await t.run(async (ctx) => ctx.db.query("adminPresence").collect());
    expect(presence[0]?.sessionFingerprint).toBe(await deriveSessionFingerprint(rawDeviceId, SALT));
    expect(JSON.stringify(presence)).not.toContain(rawDeviceId);
  });

  test("percobaan lebih tua dari satu hari tidak diklaim meski sidik jarinya sama", async () => {
    const t = convexTest(schema, modules);
    const userId = await staff(t, "jendela-owner@sumenep.co.id");
    const sessionId = await authSession(t, userId);
    const deviceId = "jendeladeviceid0000000000000000abcd";
    const fingerprint = await deriveSessionFingerprint(deviceId, SALT);
    await successAttempt(t, Date.now() - 25 * 60 * 60_000, fingerprint);
    const admin = t.withIdentity({ subject: `${userId}|${sessionId}` });

    await admin.mutation(api.adminGate.reportSessionContext, { token: "kctx-uji", deviceId });

    const bindings = await t.run(async (ctx) => ctx.db.query("adminSessionBindings").collect());
    expect(bindings.length).toBe(0);
  });

  test("percobaan yang sama tidak diklaim dua kali saat beacon berulang", async () => {
    const t = convexTest(schema, modules);
    const userId = await staff(t, "ulang-owner@sumenep.co.id");
    const sessionId = await authSession(t, userId);
    const deviceId = "ulangdeviceid0000000000000000000abcd";
    const fingerprint = await deriveSessionFingerprint(deviceId, SALT);
    await successAttempt(t, Date.now() - 3_000, fingerprint);
    const admin = t.withIdentity({ subject: `${userId}|${sessionId}` });

    for (let i = 0; i < 3; i += 1) {
      await admin.mutation(api.adminGate.reportSessionContext, { token: "kctx-uji", deviceId });
    }

    const bindings = await t.run(async (ctx) => ctx.db.query("adminSessionBindings").collect());
    expect(bindings.length).toBe(1);
  });
});

describe("perlindungan peran akun pemilik", () => {
  const OWNER_EMAIL = "qoidrifat23@gmail.com";

  async function adminMember(
    t: ReturnType<typeof convexTest>,
    email: string,
    role: "admin" | "staff" | "viewer" = "admin",
  ) {
    const userId = await seedUserId(t, { name: `Uji ${email}`, email });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffMembers", {
        userId: userId as never,
        role,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    return userId;
  }

  test("admin lain tidak dapat mengubah peran akun pemilik", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await adminMember(t, OWNER_EMAIL);
    const otherId = await adminMember(t, "admin-lain@sumenep.co.id");
    const other = t.withIdentity({ subject: otherId });

    const result = await other.mutation(api.users.changeStaffRole, {
      userId: ownerId as never,
      role: "staff",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("pemilik");

    // Perannya benar-benar tidak berubah di server.
    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("staffMembers")
        .withIndex("byUser", (q) => q.eq("userId", ownerId as never))
        .unique(),
    );
    expect(membership?.role).toBe("admin");
  });

  test("percobaan sneaking role owner tercatat di audit", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await adminMember(t, OWNER_EMAIL);
    const otherId = await adminMember(t, "audit-admin@sumenep.co.id");
    const other = t.withIdentity({ subject: otherId });

    const result = await other.mutation(api.users.changeStaffRole, {
      userId: ownerId as never,
      role: "viewer",
    });
    expect(result.ok).toBe(false);

    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("byAction", (q) => q.eq("action", "staff.role_change_blocked"))
        .collect(),
    );
    expect(audits.length).toBe(1);
    expect(audits[0]?.entityId).toBe(ownerId);
  });

  test("peran akun selain pemilik tetap bisa diubah admin lain", async () => {
    const t = convexTest(schema, modules);
    const targetId = await adminMember(t, "biasa@sumenep.co.id", "staff");
    const otherId = await adminMember(t, "pengubah@sumenep.co.id");
    const other = t.withIdentity({ subject: otherId });

    await other.mutation(api.users.changeStaffRole, { userId: targetId as never, role: "viewer" });
    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("staffMembers")
        .withIndex("byUser", (q) => q.eq("userId", targetId as never))
        .unique(),
    );
    expect(membership?.role).toBe("viewer");
  });

  test("pemilik tidak terkunci dari akunnya sendiri di daftar pengelola", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await adminMember(t, OWNER_EMAIL);
    const otherId = await adminMember(t, "penampil@sumenep.co.id");
    const other = t.withIdentity({ subject: otherId });

    const seenByOther = await other.query(api.users.listStaff, {});
    expect(seenByOther.find((m) => m.userId === ownerId)?.roleLocked).toBe(true);

    const owner = t.withIdentity({ subject: ownerId });
    const seenByOwner = await owner.query(api.users.listStaff, {});
    expect(seenByOwner.find((m) => m.userId === ownerId)?.roleLocked).toBe(false);
  });

  test("huruf besar dan spasi tidak membatalkan perlindungan", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await adminMember(t, "  Qoidrifat23@Gmail.COM  ");
    const otherId = await adminMember(t, "kasus-2@sumenep.co.id");
    const other = t.withIdentity({ subject: otherId });

    const result = await other.mutation(api.users.changeStaffRole, {
      userId: ownerId as never,
      role: "staff",
    });
    expect(result.ok).toBe(false);
  });
});
