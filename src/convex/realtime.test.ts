/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

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

async function createOwnerListing(t: ReturnType<typeof convexTest>) {
  const owner = t.withIdentity({ name: "Pemilik Uji" });
  const vendorId = await owner.mutation(api.vendors.createVendor, listingPayload);
  return { owner, vendorId };
}

describe("Sumenep Buku Kerja realtime contracts", () => {
  test("listing pemilik hanya terlihat dan bisa dikelola oleh pemiliknya", async () => {
    const t = convexTest(schema, modules);
    const { owner, vendorId } = await createOwnerListing(t);
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
