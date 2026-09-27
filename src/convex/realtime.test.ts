/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { anyApi } from "convex/server";
import { api, internal } from "./_generated/api";
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
 * Managing listing requires a WhatsApp number whose ownership is proven, so the
 * fixtures patch `phoneVerifiedAt` directly instead of sending a real OTP.
 */
async function verifiedIdentity(t: ReturnType<typeof convexTest>, name: string) {
  const client = t.withIdentity({ name });
  const userId = await client.query(api.users.currentUserId, {});
  await t.run(async (ctx) => {
    await ctx.db.insert("phoneVerifications", {
      userId: userId as never,
      phone: "628123456789",
      verifiedAt: Date.now(),
    });
  });
  return client;
}

/** Hash OTP dihitung dengan formula yang sama seperti di server. */
async function otpHash(code: string, userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${code}:${userId}`));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createOwnerListing(t: ReturnType<typeof convexTest>) {
  const owner = await verifiedIdentity(t, "Pemilik Uji");
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
    const claimant = await verifiedIdentity(t, "Pemilikclaims");
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
    const first = await verifiedIdentity(t, "Pemilik Satu");
    const firstVendor = await first.mutation(api.vendors.createVendor, listingPayload);
    await promoteToAdmin(t, firstVendor);
    await publishListing(first, firstVendor);
    const second = await verifiedIdentity(t, "Pemilik Dua");
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
    const owner = await verifiedIdentity(t, "Pemilik Foto");
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
    const owner = await verifiedIdentity(t, "Pemilik WhatsApp");
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

  test("viewer bisa membaca data kelola tetapi tidak bisa mengubah listing", async () => {
    const t = convexTest(schema, modules);
    const owner = await verifiedIdentity(t, "Admin Uji");
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

  test("viewer tidak dapat memoderasialthough viewer dapat membaca", async () => {
    const t = convexTest(schema, modules);
    const owner = await verifiedIdentity(t, "Pemilik Moderasi");
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

  test("mengelola listing ditolak sampai nomor WhatsApp terverifikasi lewat OTP", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});
    const stranger = t.withIdentity({ name: "Tanpa Verifikasi" });
    await expect(stranger.mutation(api.vendors.createVendor, listingPayload)).rejects.toThrow(
      /Verifikasi nomor WhatsApp/,
    );
    const seeded = await t.run(async (ctx) =>
      ctx.db.query("vendors").withIndex("bySlug", (q) => q.eq("slug", "karya-jaya")).unique(),
    );
    await expect(
      stranger.mutation(api.claims.submitVendorClaim, {
        vendorId: seeded!._id,
        whatsappPhone: "081234567890",
        email: "tanpa@example.test",
        businessAddress: "Alamat claimant",
      }),
    ).rejects.toThrow(/Verifikasi nomor WhatsApp/);
  });

  test("OTP salah tidak memverifikasi, OTP benar membuka akses mengelola listing", async () => {
    const t = convexTest(schema, modules);
    const client = t.withIdentity({ name: "Pemilik OTP" });
    const userId = (await client.query(api.users.currentUserId, {})) as string;
    expect(await client.query(api.whatsapp.phoneVerificationStatus, {})).toMatchObject({ verified: false });

    await t.run(async (ctx) => {
      await ctx.db.insert("phoneOtp", {
        userId: userId as never,
        phone: "628123456789",
        codeHash: await otpHash("123456", userId),
        attempts: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60_000,
      });
    });

    await expect(
      t.mutation(anyApi.whatsapp.applyPhoneOtp, { userId, codeHash: await otpHash("000000", userId) }),
    ).rejects.toThrow(/belum tepat/);
    expect(await client.query(api.whatsapp.phoneVerificationStatus, {})).toMatchObject({ verified: false });

    const phone = await t.mutation(anyApi.whatsapp.applyPhoneOtp, {
      userId,
      codeHash: await otpHash("123456", userId),
    });
    expect(phone).toBe("628123456789");
    expect(await client.query(api.whatsapp.phoneVerificationStatus, {})).toMatchObject({
      verified: true,
      phone: "628123456789",
    });

    const vendorId = await client.mutation(api.vendors.createVendor, listingPayload);
    expect(vendorId).toBeTruthy();

    // Kode yang sudah dipakai tidak bisa dipakai ulang.
    await expect(
      t.mutation(anyApi.whatsapp.applyPhoneOtp, { userId, codeHash: await otpHash("123456", userId) }),
    ).rejects.toThrow(/tidak ditemukan/);
  });

  test("requester dapat melihat klaimnya sendiri tanpa membuka klaim orang lain", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.vendors.ensureCatalogSeeded, {});
    const seeded = await t.run(async (ctx) => await ctx.db.query("vendors").withIndex("bySlug", (q) => q.eq("slug", "karya-jaya")).unique());
    const claimant = await verifiedIdentity(t, "Pemilik Klaim");
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
});
