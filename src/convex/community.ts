import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { recordEvent } from "./analytics";
import { writeAudit, writeListingHistory } from "./audit";
import { requireManagementViewer } from "./access";
import { imageRejection } from "../lib/image-upload";

const categoryValidator = v.union(
  v.literal("Servis Teknik"),
  v.literal("Hajatan & Acara"),
  v.literal("Kuliner"),
  v.literal("Transportasi"),
  v.literal("Jasa Umum"),
);
const requestStatusValidator = v.union(
  v.literal("open"),
  v.literal("claimed"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("expired"),
);
const availabilityStatusValidator = v.union(
  v.literal("available"),
  v.literal("busy"),
  v.literal("closed"),
);
const interactionKindValidator = v.union(
  v.literal("whatsapp"),
  v.literal("share"),
  v.literal("call"),
  v.literal("view"),
  v.literal("request"),
);
const interactionStatusValidator = v.union(
  v.literal("opened"),
  v.literal("waiting"),
  v.literal("completed"),
  v.literal("dismissed"),
);

const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isWithinServiceArea = (
  request: { landmark: string; lat?: number; lng?: number },
  vendor: DataModel["vendors"]["document"],
) => {
  if (request.landmark === "all" || vendor.landmark === request.landmark) return true;
  if (request.lat === undefined || request.lng === undefined || vendor.lat === undefined || vendor.lng === undefined) return false;
  return distanceKm(request.lat, request.lng, vendor.lat, vendor.lng) <= (vendor.serviceRadiusKm ?? 0);
};

async function requireUser(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Masuk untuk menggunakan fitur warga");
  return userId;
}

async function hasStaffAccess(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  userId: DataModel["users"]["document"]["_id"],
) {
  const user = await ctx.db.get(userId);
  const membership = await ctx.db
    .query("staffMembers")
    .withIndex("byUser", (q) => q.eq("userId", userId))
    .unique();
  if (membership) return membership.role === "admin" || membership.role === "staff";
  return user?.role === "admin" || user?.role === "staff";
}

async function isViewer(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  userId: DataModel["users"]["document"]["_id"],
) {
  const membership = await ctx.db
    .query("staffMembers")
    .withIndex("byUser", (q) => q.eq("userId", userId))
    .unique();
  return membership?.role === "viewer";
}

async function requireStaff(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
) {
  const userId = await requireUser(ctx);
  if (!(await hasStaffAccess(ctx, userId))) {
    throw new Error("Hanya pengelola yang dapat mengakses data ini");
  }
  return userId;
}

async function requireVendorManager(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
  vendor: DataModel["vendors"]["document"] | null,
) {
  const userId = await requireUser(ctx);
  if (!vendor) throw new Error("Listing tidak ditemukan");
  if (await isViewer(ctx, userId)) throw new Error("Viewer hanya dapat melihat data");
  if (vendor.ownerId !== userId && !(await hasStaffAccess(ctx, userId))) {
    throw new Error("Hanya pemilik listing atau pengelola yang dapat mengubah data ini");
  }
  return userId;
}



async function validatePhotoFile(
  ctx: GenericMutationCtx<DataModel>,
  storageId: string,
) {
  const metadata = await ctx.db.system.get("_storage", storageId as never);
  if (!metadata) throw new Error("File foto tidak ditemukan");
  // Sebelumnya jenis berkas hanya diperiksa `if (contentType && ...)`, jadi
  // unggahan yang sengaja TIDAK mengirim header lolos apa adanya dan berkas
  // sembarang lalu disajikan ulang dari storage milik kita. Sekarang aturannya
  // sama persis dengan foto profil: jenis kosong DITOLAK, dan batas ukurannya
  // satu sumber.
  const rejection = imageRejection({ size: metadata.size, contentType: metadata.contentType });
  if (rejection) throw new Error(rejection);
}

async function notifyUser(
  ctx: GenericMutationCtx<DataModel>,
  userId: DataModel["users"]["document"]["_id"],
  kind: string,
  title: string,
  body: string,
) {
  await ctx.db.insert("notifications", {
    userId,
    kind,
    title,
    body,
    read: false,
    createdAt: Date.now(),
  });
}

/**
 * Kabar ke semua pengelola yang bisa memoderasi (admin dan staff; viewer hanya
 * membaca jadi tidak perlu diberi tahu).
 *
 * Notifikasi untuk listing yang sama digabung kalau masih belum dibaca:
 * unggah 12 foto sekaligus tidak boleh membanjiri 12 baris di panel admin, dan * moderasi yang penting di antaranya akan tenggelam.
 */
export async function notifyReviewers(
  ctx: GenericMutationCtx<DataModel>,
  input: {
    kind: string;
    title: string;
    body: string;
    vendorId: DataModel["vendors"]["document"]["_id"];
  },
) {
  const members = await ctx.db.query("staffMembers").collect();
  const reviewers = members.filter(
    (member) => member.role === "admin" || member.role === "staff",
  );
  const now = Date.now();
  for (const reviewer of reviewers) {
    const inbox = await ctx.db
      .query("notifications")
      .withIndex("byUser", (q) => q.eq("userId", reviewer.userId))
      .collect();
    const alreadyQueued = inbox.some(
      (item) => !item.read && item.kind === input.kind && item.vendorId === input.vendorId,
    );
    if (alreadyQueued) continue;
    await ctx.db.insert("notifications", {
      userId: reviewer.userId,
      vendorId: input.vendorId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      read: false,
      createdAt: now,
    });
  }
  return reviewers.length;
}

/** Antrean yang harus ditangani pengelola, dipakai untuk lonceng di header /admin. */
export const listReviewQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);
    const claims = await ctx.db
      .query("listingClaims")
      .withIndex("byStatus", (q) => q.eq("status", "pending"))
      .collect();
    const photos = await ctx.db
      .query("vendorPhotos")
      .withIndex("byModeration", (q) => q.eq("moderationStatus", "pending"))
      .collect();
    const reports = await ctx.db
      .query("reports")
      .withIndex("byStatus", (q) => q.eq("status", "open"))
      .collect();
    return {
      claims: claims.length,
      photos: photos.length,
      reports: reports.length,
      total: claims.length + photos.length + reports.length,
    };
  },
});

export const listRequests = query({
  args: {
    status: v.optional(requestStatusValidator),
    landmark: v.optional(v.string()),
    category: v.optional(categoryValidator),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
    mine: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const requesterId = args.mine ? await getAuthUserId(ctx) : undefined;
    if (args.mine && !requesterId) return [];
    const rows = args.status
      ? await ctx.db
          .query("serviceRequests")
          .withIndex("byStatus", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("serviceRequests").collect();
    const search = args.search?.trim().toLowerCase();
    const visible = rows
      .filter((request) => args.mine || (request.status !== "cancelled" && request.status !== "expired"))
      .filter((request) => !args.mine || request.requesterId === requesterId)
      .filter((request) => request.status !== "open" || !request.expiresAt || request.expiresAt > Date.now())
      .filter((request) => !args.landmark || args.landmark === "all" || request.landmark === args.landmark)
      .filter((request) => !args.category || request.category === args.category)
      .filter(
        (request) =>
          !search ||
          [request.title, request.description, request.category, request.budget ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(search),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(args.limit ?? 30, 1), 100));
    return Promise.all(
      visible.map(async (request) => {
        const [requester, vendor, offerRows] = await Promise.all([
          ctx.db.get(request.requesterId),
          request.vendorId ? ctx.db.get(request.vendorId) : Promise.resolve(null),
          ctx.db.query("requestOffers").withIndex("byRequest", (q) => q.eq("requestId", request._id)).collect(),
        ]);
        const offers = await Promise.all(offerRows.map(async (offer) => ({
          ...offer,
          vendorName: (await ctx.db.get(offer.vendorId))?.name ?? "Listing",
        })));
        return {
          ...request,
          requesterName: requester?.name ?? "Warga Sumenep",
          vendorName: vendor?.name,
          offers,
        };
      }),
    );
  },
});

export const createRequest = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: categoryValidator,
    landmark: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    budget: v.optional(v.string()),
    neededAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const title = args.title.trim();
    const description = args.description.trim();
    if (title.length < 5 || title.length > 100) {
      throw new Error("Judul kebutuhan harus 5–100 karakter");
    }
    if (description.length < 10 || description.length > 1000) {
      throw new Error("Ceritakan kebutuhan dalam 10–1000 karakter");
    }
    if (args.lat !== undefined && (args.lat < -90 || args.lat > 90)) throw new Error("Koordinat lokasi tidak valid");
    if (args.lng !== undefined && (args.lng < -180 || args.lng > 180)) throw new Error("Koordinat lokasi tidak valid");
    const now = Date.now();
    const expiresAt = Math.min(
      Math.max(args.expiresAt ?? now + 14 * 24 * 60 * 60 * 1000, now + 60 * 60 * 1000),
      now + 90 * 24 * 60 * 60 * 1000,
    );
    const requestId = await ctx.db.insert("serviceRequests", {
      requesterId: userId,
      title,
      description,
      category: args.category,
      landmark: args.landmark,
      lat: args.lat,
      lng: args.lng,
      budget: args.budget?.trim() || undefined,
      neededAt: args.neededAt,
      status: "open",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await recordEvent(ctx, { event: "request_created", userId, requestId });
    await ctx.scheduler.runAfter(
      Math.max(0, expiresAt - now - 24 * 60 * 60 * 1000),
      internal.community.sendRequestExpiryReminder,
      { requestId },
    );
    await ctx.scheduler.runAfter(
      expiresAt - now,
      internal.community.expireRequest,
      { requestId },
    );
    await ctx.scheduler.runAfter(
      0,
      internal.whatsapp.sendRequestCreatedNotifications,
      { requestId },
    );
    // Notify owners of active, matching listings directly in the app. Public
    // WhatsApp remains opt-in and rate-limited; this internal alert is only a
    // pointer to the matching request.
    const matchingVendors = await ctx.db
      .query("vendors")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();
    const matchingOwners = new Set(
      matchingVendors
        .filter((vendor) => vendor.category === args.category && isWithinServiceArea({ landmark: args.landmark, lat: args.lat, lng: args.lng }, vendor))
        .map((vendor) => vendor.ownerId)
        .filter((ownerId): ownerId is NonNullable<typeof ownerId> => Boolean(ownerId) && ownerId !== userId),
    );
    for (const ownerId of matchingOwners) {
      await notifyUser(ctx, ownerId as DataModel["users"]["document"]["_id"], "request_match", "Request cocok untuk listing Anda", `${title} — ${args.category} di ${args.landmark === "all" ? "Sumenep" : landmarkLabelForNotification(args.landmark)}.`);
    }

    // Do not fan out a notification to every account by default. Users opt
    // in explicitly, and the cap keeps a busy board from creating unbounded
    // notification rows in a small deployment.
    const users = await ctx.db.query("users").take(100);
    let notified = 0;
    for (const candidate of users) {
      if (candidate._id === userId || notified >= 50) continue;
      const preferences = await ctx.db
        .query("notificationPreferences")
        .withIndex("byUser", (q) => q.eq("userId", candidate._id))
        .unique();
      if (preferences?.requestUpdates !== true) continue;
      const body = `${title} — ${args.landmark === "all" ? "sekitar Sumenep" : landmarkLabelForNotification(args.landmark)}`;
      const recentNotifications = await ctx.db
        .query("notifications")
        .withIndex("byUser", (q) => q.eq("userId", candidate._id))
        .collect();
      const recentRequestNotifications = recentNotifications.filter(
        (notification) =>
          notification.kind === "request" &&
          now - notification.createdAt < 24 * 60 * 60 * 1000,
      );
      if (
        recentRequestNotifications.length >= 3 ||
        recentRequestNotifications.some((notification) => notification.body === body)
      ) {
        continue;
      }
      await notifyUser(
        ctx,
        candidate._id,
        "request",
        "Permintaan baru di Sumenep",
        body,
      );
      notified += 1;
    }
    return requestId;
  },
});

export const expireRequest = internalMutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "open" || !request.expiresAt || request.expiresAt > Date.now()) return;
    const now = Date.now();
    await ctx.db.patch(args.requestId, { status: "expired", updatedAt: now });
    await recordEvent(ctx, { event: "request_expired", requestId: args.requestId });
    const offers = await ctx.db
      .query("requestOffers")
      .withIndex("byRequest", (q) => q.eq("requestId", args.requestId))
      .collect();
    for (const offer of offers.filter((item) => item.status === "offered")) {
      await ctx.db.patch(offer._id, { status: "expired", updatedAt: now });
    }
    const recent = await ctx.db
      .query("notifications")
      .withIndex("byUser", (q) => q.eq("userId", request.requesterId))
      .collect();
    const expiryKey = `request_expired:${request._id}`;
    if (!recent.some((notification) => notification.kind === expiryKey)) {
      await ctx.db.insert("notifications", {
        userId: request.requesterId,
        kind: expiryKey,
        title: "Permintaan kedaluwarsa",
        body: `"${request.title}" sudah melewati masa aktif dan tidak dapat diklaim.`,
        read: false,
        createdAt: now,
      });
    }
  },
});

const landmarkLabelForNotification = (landmark: string) =>
  ({ adipura: "Taman Bunga / Adipura", trunojoyo: "Jl. Trunojoyo", anom: "Pasar Anom Baru", keraton: "Keraton / Labang Mesem", jamik: "Masjid Jamik", "kota-lama": "Kota Lama", kalianget: "Kalianget", bluto: "Bluto", pragaan: "Pragaan" }[landmark] ?? landmark);

export const sendRequestExpiryReminder = internalMutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "open" || !request.expiresAt || request.expiresAt <= Date.now()) return;
    const reminderKey = `request_expiry:${request._id}`;
    const existing = await ctx.db
      .query("notifications")
      .withIndex("byUser", (q) => q.eq("userId", request.requesterId))
      .collect();
    if (existing.some((notification) => notification.kind === reminderKey)) return;
    await ctx.db.insert("notifications", {
      userId: request.requesterId,
      kind: reminderKey,
      title: "Permintaan hampir kedaluwarsa",
      body: `"${request.title}" masih terbuka. Tandai selesai atau buka kembali bila masih dibutuhkan.`,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const claimRequest = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    const vendor = await ctx.db.get(args.vendorId);
    if (!request || request.status !== "open" || (request.expiresAt && request.expiresAt <= Date.now())) {
      throw new Error("Permintaan sudah tidak tersedia");
    }
    if (!vendor || vendor.status !== "active") throw new Error("Listing tidak tersedia");
    if (request.requesterId === userId) throw new Error("Anda tidak dapat menawarkan permintaan milik sendiri");
    if (vendor.category !== request.category) throw new Error("Listing tidak cocok dengan kategori permintaan");
    if (!isWithinServiceArea(request, vendor)) {
      throw new Error("Listing berada di luar area atau radius layanan permintaan");
    }
    await requireVendorManager(ctx, vendor);
    const now = Date.now();
    const offers = await ctx.db
      .query("requestOffers")
      .withIndex("byRequest", (q) => q.eq("requestId", args.requestId))
      .collect();
    const existingOffer = offers.find((offer) => offer.vendorId === args.vendorId);
    if (existingOffer) {
      await ctx.db.patch(existingOffer._id, { status: "accepted", updatedAt: now });
    } else {
      await ctx.db.insert("requestOffers", {
        requestId: args.requestId,
        vendorId: args.vendorId,
        offeredBy: userId,
        status: "accepted",
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const offer of offers.filter((item) => item.vendorId !== args.vendorId && item.status === "offered")) {
      await ctx.db.patch(offer._id, { status: "withdrawn", updatedAt: now });
    }
    await ctx.db.patch(args.requestId, {
      status: "claimed",
      vendorId: args.vendorId,
      claimedAt: now,
      updatedAt: now,
    });
    await recordEvent(ctx, { event: "request_claimed", userId, vendorId: args.vendorId, requestId: args.requestId });
    await writeAudit(ctx, {
      action: "request.status_changed",
      actorId: userId,
      requestId: args.requestId,
      vendorId: args.vendorId,
      oldValue: "open",
      newValue: "claimed",
      metadata: { source: "direct_claim" },
    });
    await ctx.db.insert("vendorInteractions", {
      userId,
      vendorId: args.vendorId,
      requestId: args.requestId,
      kind: "request",
      status: "opened",
      createdAt: now,
      updatedAt: now,
    });
    if (request.requesterId !== userId) {
      await notifyUser(ctx, request.requesterId, "request_update", "Permintaan Anda ditawari", `Seseorang telah menawarkan bantuan untuk "${request.title}".`);
      await ctx.scheduler.runAfter(
        0,
        internal.whatsapp.sendRequestStatusNotification,
        { requestId: args.requestId, status: "claimed" },
      );
    }
    return args.requestId;
  },
});

export const updateRequestStatus = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    status: v.union(v.literal("completed"), v.literal("cancelled")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Permintaan tidak ditemukan");
    if (request.requesterId !== userId) {
      throw new Error("Hanya pembuat permintaan yang dapat memperbarui status");
    }
    if (["completed", "cancelled", "expired"].includes(request.status)) {
      throw new Error("Permintaan ini sudah selesai atau dibatalkan");
    }
    if (args.status === "cancelled" && (args.reason?.trim().length ?? 0) < 5) {
      throw new Error("Cantumkan alasan pembatalan agar mitra tidak salah menunggu");
    }
    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: args.status,
      completedAt: args.status === "completed" ? now : undefined,
      cancelledReason: args.status === "cancelled" ? args.reason?.trim() : undefined,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      action: "request.status_changed",
      actorId: userId,
      requestId: args.requestId,
      oldValue: request.status,
      newValue: args.status,
      metadata: { reason: args.reason?.trim() || undefined },
    });
    if (args.status === "completed") {
      await recordEvent(ctx, { event: "request_completed", userId, requestId: args.requestId });
    }
    await notifyUser(
      ctx,
      userId,
      "request_update",
      args.status === "completed" ? "Permintaan selesai" : "Permintaan dibatalkan",
      `"${request.title}" telah ${args.status === "completed" ? "ditandai selesai" : "dibatalkan"}.`,
    );
    await ctx.scheduler.runAfter(
      0,
      internal.whatsapp.sendRequestStatusNotification,
      { requestId: args.requestId, status: args.status },
    );
    return args.requestId;
  },
});

export const reopenRequest = mutation({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.requesterId !== userId) throw new Error("Permintaan tidak ditemukan");
    if (request.status !== "cancelled" && request.status !== "expired") throw new Error("Hanya permintaan batal atau kedaluwarsa yang dapat dibuka kembali");
    const now = Date.now();
    const expiresAt = now + 14 * 24 * 60 * 60 * 1000;
    await ctx.db.patch(args.requestId, {
      status: "open",
      vendorId: undefined,
      claimedAt: undefined,
      completedAt: undefined,
      cancelledReason: undefined,
      reopenedAt: now,
      expiresAt,
      updatedAt: now,
    });
    const offers = await ctx.db
      .query("requestOffers")
      .withIndex("byRequest", (q) => q.eq("requestId", args.requestId))
      .collect();
    for (const offer of offers) {
      if (offer.status !== "expired") await ctx.db.patch(offer._id, { status: "expired", updatedAt: now });
    }
    await writeAudit(ctx, {
      action: "request.status_changed",
      actorId: userId,
      requestId: args.requestId,
      oldValue: request.status,
      newValue: "open",
      metadata: { source: "reopen" },
    });
    await recordEvent(ctx, { event: "request_reopened", userId, requestId: args.requestId, metadata: { source: "reopen" } });
    await ctx.scheduler.runAfter(
      Math.max(0, expiresAt - now - 24 * 60 * 60 * 1000),
      internal.community.sendRequestExpiryReminder,
      { requestId: args.requestId },
    );
    await ctx.scheduler.runAfter(expiresAt - now, internal.community.expireRequest, { requestId: args.requestId });
    return args.requestId;
  },
});

export const listPackages = query({
  args: { vendorId: v.optional(v.id("vendors")) },
  handler: async (ctx, args) => {
    const vendorId = args.vendorId;
    if (!vendorId) return [];
    const rows = await ctx.db
      .query("vendorPackages")
      .withIndex("byVendor", (q) => q.eq("vendorId", vendorId))
      .collect();
    return rows.filter((row) => row.active !== false).sort((a, b) => a.createdAt - b.createdAt);
  },
});

const packageFields = {
  vendorId: v.id("vendors"),
  name: v.string(),
  description: v.string(),
  price: v.string(),
  duration: v.optional(v.string()),
  area: v.optional(v.string()),
  active: v.optional(v.boolean()),
};

export const createPackage = mutation({
  args: packageFields,
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    await requireVendorManager(ctx, vendor);
    const name = args.name.trim();
    const description = args.description.trim();
    if (name.length < 2 || description.length < 5) throw new Error("Nama dan deskripsi paket belum lengkap");
    const now = Date.now();
    return await ctx.db.insert("vendorPackages", {
      vendorId: args.vendorId,
      name,
      description,
      price: args.price.trim(),
      duration: args.duration?.trim() || undefined,
      area: args.area?.trim() || undefined,
      active: args.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePackage = mutation({
  args: {
    id: v.id("vendorPackages"),
    name: v.string(),
    description: v.string(),
    price: v.string(),
    duration: v.optional(v.string()),
    area: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...changes } = args;
    const current = await ctx.db.get(id);
    if (!current) throw new Error("Paket tidak ditemukan");
    await requireVendorManager(ctx, await ctx.db.get(current.vendorId));
    await ctx.db.patch(id, {
      name: changes.name.trim(),
      description: changes.description.trim(),
      price: changes.price.trim(),
      duration: changes.duration?.trim() || undefined,
      area: changes.area?.trim() || undefined,
      active: changes.active ?? current.active,
      updatedAt: Date.now(),
    });
    return id;
  },
});

export const removePackage = mutation({
  args: { id: v.id("vendorPackages") },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("Paket tidak ditemukan");
    await requireVendorManager(ctx, await ctx.db.get(current.vendorId));
    await ctx.db.delete(args.id);
  },
});

export const updateAvailability = mutation({
  args: {
    vendorId: v.id("vendors"),
    availability: availabilityStatusValidator,
    availabilityNote: v.optional(v.string()),
    nextAvailableAt: v.optional(v.number()),
    responseMinutes: v.optional(v.number()),
    serviceRadiusKm: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    const actorId = await requireVendorManager(ctx, vendor);
    const next = {
      availability: args.availability,
      availabilityNote: args.availabilityNote === undefined ? vendor?.availabilityNote : args.availabilityNote.trim() || undefined,
      nextAvailableAt: args.nextAvailableAt === undefined ? vendor?.nextAvailableAt : args.nextAvailableAt,
      responseMinutes: args.responseMinutes === undefined ? vendor?.responseMinutes : args.responseMinutes,
      serviceRadiusKm: args.serviceRadiusKm === undefined ? vendor?.serviceRadiusKm : args.serviceRadiusKm,
    };
    await ctx.db.patch(args.vendorId, { ...next, updatedAt: Date.now() });
    await writeListingHistory(ctx, {
      vendorId: args.vendorId,
      actorId,
      changes: [
        { field: "availability", oldValue: vendor?.availability, newValue: next.availability },
        { field: "availabilityNote", oldValue: vendor?.availabilityNote, newValue: next.availabilityNote },
        { field: "nextAvailableAt", oldValue: vendor?.nextAvailableAt, newValue: next.nextAvailableAt },
        { field: "responseMinutes", oldValue: vendor?.responseMinutes, newValue: next.responseMinutes },
        { field: "serviceRadiusKm", oldValue: vendor?.serviceRadiusKm, newValue: next.serviceRadiusKm },
      ],
      reason: "availability_update",
    });
    return args.vendorId;
  },
});

export const recordInteraction = mutation({
  args: {
    vendorId: v.id("vendors"),
    kind: interactionKindValidator,
    status: v.optional(interactionStatusValidator),
    requestId: v.optional(v.id("serviceRequests")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) return null;
    const now = Date.now();
    if (args.kind !== "view") {
      const recent = await ctx.db
        .query("vendorInteractions")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .collect();
      const duplicate = recent.find(
        (item) =>
          item.vendorId === args.vendorId &&
          item.kind === args.kind &&
          item.requestId === args.requestId &&
          now - item.updatedAt < 5 * 60 * 1000,
      );
      if (duplicate) {
        await ctx.db.patch(duplicate._id, {
          status: args.status ?? duplicate.status,
          note: args.note?.trim() || duplicate.note,
          updatedAt: now,
        });
        return duplicate._id;
      }
    }
    const eventName = args.kind === "view"
      ? "listing_opened"
      : args.kind === "call"
        ? "call_clicked"
        : args.kind === "share"
          ? "share_clicked"
          : args.kind === "whatsapp"
            ? "whatsapp_clicked"
            : "request_matched";
    await recordEvent(ctx, { event: eventName, userId, vendorId: args.vendorId, requestId: args.requestId });
    return await ctx.db.insert("vendorInteractions", {
      userId,
      vendorId: args.vendorId,
      requestId: args.requestId,
      kind: args.kind,
      status: args.status ?? "opened",
      note: args.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listInteractions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("vendorInteractions")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .collect();
    const seen = new Set<string>();
    const visible = rows
      .filter((item) => item.kind === "whatsapp" || item.kind === "request")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((item) => {
        const key = `${item.vendorId}:${item.requestId ?? "direct"}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.min(Math.max(args.limit ?? 40, 1), 100));
    return Promise.all(
      visible.map(async (interaction) => {
        const vendor = await ctx.db.get(interaction.vendorId);
        return {
          ...interaction,
          vendorName: vendor?.name ?? "Listing",
          vendorSlug: vendor?.slug,
          vendorPhone: vendor?.phone,
          vendorCategory: vendor?.category,
          vendorLandmark: vendor?.landmark,
        };
      }),
    );
  },
});

export const updateInteraction = mutation({
  args: {
    id: v.id("vendorInteractions"),
    status: interactionStatusValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db.get(args.id);
    if (!current || current.userId !== userId) throw new Error("Riwayat tidak ditemukan");
    await ctx.db.patch(args.id, {
      status: args.status,
      note: args.note?.trim() || undefined,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const listNotifications = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("notifications")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.min(Math.max(args.limit ?? 30, 1), 100));
  },
});

export const markNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(rows.filter((row) => !row.read).map((row) => ctx.db.patch(row._id, { read: true })));
    return rows.length;
  },
});

export const getNotificationPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("notificationPreferences")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const setNotificationPreferences = mutation({
  args: {
    whatsappUpdates: v.optional(v.boolean()),
    whatsappPhone: v.optional(v.string()),
    areaUpdates: v.optional(v.boolean()),
    requestUpdates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db
      .query("notificationPreferences")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    const previousPhone = current?.whatsappPhone ?? "";
    const phone = (args.whatsappPhone ?? previousPhone)
      .replace(/\D/g, "")
      .replace(/^0/, "62");
    const phoneChanged = phone !== previousPhone;
    const whatsappUpdates =
      args.whatsappUpdates ?? current?.whatsappUpdates ?? false;
    if (whatsappUpdates && (phone.length < 10 || phone.length > 15)) {
      throw new Error("Masukkan nomor WhatsApp yang valid sebelum mengaktifkan notifikasi");
    }
    const next = {
      whatsappUpdates,
      whatsappPhone: phone || undefined,
      whatsappOptInAt: whatsappUpdates
        ? current?.whatsappOptInAt && !phoneChanged
          ? current.whatsappOptInAt
          : Date.now()
        : undefined,
      areaUpdates: args.areaUpdates ?? current?.areaUpdates ?? false,
      requestUpdates: args.requestUpdates ?? current?.requestUpdates ?? false,
    };
    if (current) {
      await ctx.db.patch(current._id, { ...next, updatedAt: Date.now() });
      if (whatsappUpdates && current.whatsappUpdates !== true) {
        await recordEvent(ctx, { event: "notification_opted_in", userId, metadata: { channel: "whatsapp" } });
      }
      if (args.areaUpdates === true && current.areaUpdates !== true) {
        await recordEvent(ctx, { event: "notification_opted_in", userId, metadata: { channel: "area" } });
      }
      if (args.requestUpdates === true && current.requestUpdates !== true) {
        await recordEvent(ctx, { event: "notification_opted_in", userId, metadata: { channel: "request" } });
      }
      return current._id;
    }
    const id = await ctx.db.insert("notificationPreferences", {
      userId,
      ...next,
      updatedAt: Date.now(),
    });
    if (whatsappUpdates) {
      await recordEvent(ctx, { event: "notification_opted_in", userId, metadata: { channel: "whatsapp" } });
    }
    if (args.areaUpdates === true) {
      await recordEvent(ctx, { event: "notification_opted_in", userId, metadata: { channel: "area" } });
    }
    if (args.requestUpdates === true) {
      await recordEvent(ctx, { event: "notification_opted_in", userId, metadata: { channel: "request" } });
    }
    return id;
  },
});

export const listVendorPhotos = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) return [];
    const viewerId = await getAuthUserId(ctx);
    const canManage = Boolean(
      viewerId && (vendor.ownerId === viewerId || (await hasStaffAccess(ctx, viewerId))),
    );
    if (vendor.status !== "active" && !canManage) return [];
    const rows = await ctx.db
      .query("vendorPhotos")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    const canSeePending = canManage;
    const visible = rows
      .filter((photo) => photo.active !== false && (canSeePending || (photo.moderationStatus !== "pending" && photo.moderationStatus !== "rejected")))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 12);
    return Promise.all(
      visible.map(async (photo) => ({
        ...photo,
        url: await ctx.storage.getUrl(photo.storageId),
      })),
    );
  },
});

export const createVendorPhoto = mutation({
  args: {
    vendorId: v.id("vendors"),
    storageId: v.string(),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    const actorId = await requireVendorManager(ctx, vendor);
    // requireVendorManager sudah melempar kalau listing hilang, tapi TypeScript
    // tidak bisa menyimpulkan itu dari return type-nya.
    if (!vendor) throw new Error("Listing tidak ditemukan");
    if (!args.storageId) throw new Error("Foto belum berhasil diunggah");
    await validatePhotoFile(ctx, args.storageId);
    if (args.caption && args.caption.trim().length > 160) throw new Error("Deskripsi foto maksimal 160 karakter");
    const currentPhotos = await ctx.db
      .query("vendorPhotos")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    if (currentPhotos.filter((photo) => photo.active !== false).length >= 12) {
      throw new Error("Maksimal 12 foto per listing");
    }
    const photoId = await ctx.db.insert("vendorPhotos", {
      vendorId: args.vendorId,
      storageId: args.storageId,
      caption: args.caption?.trim() || undefined,
      active: true,
      moderationStatus: "pending",
      createdAt: Date.now(),
    });
    await writeAudit(ctx, { action: "photo.uploaded", actorId, vendorId: args.vendorId, entityId: photoId });
    await recordEvent(ctx, { event: "photo_uploaded", userId: actorId, vendorId: args.vendorId });
    await notifyReviewers(ctx, {
      kind: "review.photo_pending",
      title: "Foto baru menunggu moderasi",
      body: `${vendor.name} menambahkan foto. Periksa sebelum foto tampil di katalog publik.`,
      vendorId: args.vendorId,
    });
    return photoId;
  },
});

export const removeVendorPhoto = mutation({
  args: { id: v.id("vendorPhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.id);
    if (!photo) throw new Error("Foto tidak ditemukan");
    await requireVendorManager(ctx, await ctx.db.get(photo.vendorId));
    const vendor = await ctx.db.get(photo.vendorId);
    await ctx.db.delete(args.id);
    if (vendor?.photoId === photo.storageId) {
      const remaining = await ctx.db
        .query("vendorPhotos")
        .withIndex("byVendor", (q) => q.eq("vendorId", photo.vendorId))
        .collect();
      const nextPhoto = remaining
        .filter((item) => item.active !== false && item.moderationStatus !== "pending" && item.moderationStatus !== "rejected")
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      await ctx.db.patch(photo.vendorId, { photoId: nextPhoto?.storageId, updatedAt: Date.now() });
    }
    return args.id;
  },
});

export const moderateVendorPhoto = mutation({
  args: {
    id: v.id("vendorPhotos"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requireStaff(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo) throw new Error("Foto tidak ditemukan");
    await ctx.db.patch(args.id, {
      moderationStatus: args.decision,
      moderationNote: args.note?.trim() || undefined,
      moderatedBy: actorId,
      moderatedAt: Date.now(),
      active: args.decision === "approved" ? true : false,
    });
    const vendor = await ctx.db.get(photo.vendorId);
    if (vendor) {
      const remaining = await ctx.db
        .query("vendorPhotos")
        .withIndex("byVendor", (q) => q.eq("vendorId", photo.vendorId))
        .collect();
      const nextPhoto = remaining
        .filter((item) => item._id !== photo._id && item.active !== false && item.moderationStatus === "approved")
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      const shouldUsePhoto = args.decision === "approved"
        ? (!vendor.photoId || vendor.photoId === photo.storageId ? photo.storageId : vendor.photoId)
        : vendor.photoId === photo.storageId
          ? nextPhoto?.storageId
          : vendor.photoId;
      if (shouldUsePhoto !== vendor.photoId) {
        await ctx.db.patch(photo.vendorId, { photoId: shouldUsePhoto, updatedAt: Date.now() });
      }
    }
    await writeAudit(ctx, {
      action: "photo.moderated",
      actorId,
      vendorId: photo.vendorId,
      entityId: args.id,
      newValue: { decision: args.decision },
    });
    return args.id;
  },
});

export const listPhotosForModeration = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);
    const photos = await ctx.db
      .query("vendorPhotos")
      .withIndex("byModeration", (q) => q.eq("moderationStatus", "pending"))
      .collect();
    return Promise.all(photos.map(async (photo) => ({
      ...photo,
      url: await ctx.storage.getUrl(photo.storageId),
      vendorName: (await ctx.db.get(photo.vendorId))?.name,
    })));
  },
});

export const listCommunityMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);

    // Lima pembacaan penuh sebelumnya digantikan pembacaan yang dipersempit.
    // Yang paling penting: `users` TIDAK lagi dibaca seluruhnya.
    //
    // Tabel `users` berisi residu Convex Auth anonim yang tumbuh ~99 baris per
    // hari (~36.000 setahun), dan panel ini adalah dashboard — dibuka berkali-
    // kali, bukan sekali. Membaca seluruh tabel untuk MEMBAGI satu angka berarti
    // kuota I/O habis oleh baris yang bahkan tidak punya email.
    //
    // Rentang indeks `email` melewati SEMUA dokumen yang tidak punya field itu,
    // dan hanya akun anonim yang tidak punya. Jadi yang terbaca tepat "warga
    // terdaftar", apa pun yang terjadi pada tabel bawahnya. Efek sampingnya
    // disengaja: penyebut `returningSaverRate` sekarang berarti "warga
    // terdaftar", bukan "termasuk bot yang tidak pernah mengisi apa pun".
    const [activeVendors, completedRequests, expiredRequests, registeredUsers, favorites, photos] =
      await Promise.all([
        ctx.db.query("vendors").withIndex("byStatus", (q) => q.eq("status", "active")).collect(),
        ctx.db
          .query("serviceRequests")
          .withIndex("byStatus", (q) => q.eq("status", "completed"))
          .collect(),
        ctx.db
          .query("serviceRequests")
          .withIndex("byStatus", (q) => q.eq("status", "expired"))
          .collect(),
        ctx.db
          .query("users")
          .withIndex("email", (q) => q.gt("email", ""))
          .collect(),
        // `favorites` sengaja dibiarkan apa adanya: barisnya berpasangan
        // (pengguna x listing), jadi jumlahnya dibatasi oleh data nyata, bukan
        // oleh waktu. Ia bisa ditinjau lagi kalau suatu saat jumlah barisnya
        // melewati beberapa ribu.
        ctx.db.query("favorites").collect(),
        ctx.db.query("vendorPhotos").collect(),
      ]);
    const photoVendorIds = new Set(
      photos.filter((photo) => photo.active !== false && photo.moderationStatus !== "rejected" && photo.moderationStatus !== "pending").map((photo) => photo.vendorId),
    );
    const searches = activeVendors.reduce(
      (total, vendor) => total + Number(vendor.searchImpressions ?? 0),
      0,
    );
    const whatsappClicks = activeVendors.reduce(
      (total, vendor) => total + Number(vendor.whatsappClicks ?? 0),
      0,
    );
    const responseValues = activeVendors
      .map((vendor) => Number(vendor.responseMinutes ?? 0))
      .filter((value) => value > 0);
    const returningUsers = new Set(favorites.map((favorite) => favorite.userId));
    const completeListings = activeVendors.filter(
      (vendor) =>
        vendor.price.trim().length > 0 &&
        vendor.hours.trim().length > 0 &&
        (Boolean(vendor.photoId) || photoVendorIds.has(vendor._id)),
    );
    const byCategory = Object.fromEntries(
      categoryOptionsForMetrics.map((category) => [
        category,
        activeVendors.filter((vendor) => vendor.category === category).length,
      ]),
    );
    const byArea = Object.fromEntries(
      Array.from(new Set(activeVendors.map((vendor) => vendor.landmark)))
        .filter((area) => Boolean(area))
        .map((area) => [
          area,
          activeVendors.filter((vendor) => vendor.landmark === area).length,
        ]),
    );
    return {
      activeListings: activeVendors.length,
      searches,
      whatsappClicks,
      searchToWhatsappRate: searches > 0
        ? Math.round((whatsappClicks / searches) * 100)
        : 0,
      averageResponseMinutes: responseValues.length > 0
        ? Math.round(
            responseValues.reduce((total, value) => total + value, 0) /
              responseValues.length,
          )
        : 0,
      completedRequests: completedRequests.length,
      completeListingRate: activeVendors.length > 0
        ? Math.round((completeListings.length / activeVendors.length) * 100)
        : 0,
      completeListings: completeListings.length,
      listingsWithPhotos: activeVendors.filter(
        (vendor) => Boolean(vendor.photoId) || photoVendorIds.has(vendor._id),
      ).length,
      returningSaverRate: registeredUsers.length > 0
        ? Math.round((returningUsers.size / registeredUsers.length) * 100)
        : 0,
      listingsWithoutPrice: activeVendors.filter((vendor) => !vendor.price.trim()).length,
      listingsWithoutPhotos: activeVendors.filter((vendor) => !vendor.photoId && !photoVendorIds.has(vendor._id)).length,
      listingsWithoutHours: activeVendors.filter((vendor) => !vendor.hours.trim()).length,
      expiredRequests: expiredRequests.length,
      mostResponsiveProvider: activeVendors
        .filter((vendor) => (vendor.responseMinutes ?? 0) > 0)
        .sort((a, b) => (a.responseMinutes ?? 0) - (b.responseMinutes ?? 0))[0]?.name,
      byCategory,
      byArea,
    };
  },
});

const categoryOptionsForMetrics = [
  "Servis Teknik",
  "Hajatan & Acara",
  "Kuliner",
  "Transportasi",
  "Jasa Umum",
] as const;

export const createReport = mutation({
  args: {
    vendorId: v.optional(v.id("vendors")),
    requestId: v.optional(v.id("serviceRequests")),
    reason: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const reason = args.reason.trim();
    const details = args.details.trim();
    if (Boolean(args.vendorId) === Boolean(args.requestId)) {
      throw new Error("Laporan harus menunjuk satu listing atau satu permintaan");
    }
    if (reason.length < 3 || details.length < 5 || details.length > 1000) {
      throw new Error("Ceritakan alasan laporan dengan lebih lengkap");
    }

    const [vendor, request] = await Promise.all([
      args.vendorId ? ctx.db.get(args.vendorId) : Promise.resolve(null),
      args.requestId ? ctx.db.get(args.requestId) : Promise.resolve(null),
    ]);
    if (args.vendorId && !vendor) throw new Error("Listing yang dilaporkan tidak ditemukan");
    if (args.requestId && !request) throw new Error("Permintaan yang dilaporkan tidak ditemukan");

    const now = Date.now();

    // Dua pembacaan yang dipersempit, bukan satu pembacaan seluruh tabel.
    //
    // Sebelumnya seluruh tabel `reports` dibaca untuk memeriksa duplikat dan
    // kuota pelapor, padahal tiap aturannya hanya menyangkut satu dari dua
    // irisan kecil: laporan untuk TARGET yang sama, dan laporan MILIK pelapor
    // ini. Keduanya punya indeksnya sendiri sekarang, jadi tabel laporan yang
    // menumpuk bertahun-tahun tidak lagi menentukan biaya satu kali kirim
    // laporan.
    const targetReports = args.vendorId
      ? await ctx.db
          .query("reports")
          .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
          .collect()
      : args.requestId
        ? await ctx.db
            .query("reports")
            .withIndex("byRequest", (q) => q.eq("requestId", args.requestId))
            .collect()
        : [];
    const sameTarget = (report: (typeof targetReports)[number]) =>
      report.vendorId === args.vendorId && report.requestId === args.requestId;
    const duplicate = targetReports.some(
      (report) =>
        sameTarget(report) &&
        report.reason === reason &&
        report.details === details &&
        now - report.createdAt < 6 * 60 * 60 * 1000,
    );
    if (duplicate) throw new Error("Laporan serupa sudah dikirim baru saja");

    const recentTargetReports = targetReports.filter(
      (report) => sameTarget(report) && now - report.createdAt < 60 * 60 * 1000,
    );
    const ownReports = userId
      ? await ctx.db
          .query("reports")
          .withIndex("byReporter", (q) => q.eq("reporterId", userId))
          .collect()
      : [];
    const recentReporterReports = userId
      ? ownReports.filter((report) => now - report.createdAt < 24 * 60 * 60 * 1000)
      : recentTargetReports;
    if (
      recentReporterReports.length >= (userId ? 10 : 5) ||
      recentTargetReports.length >= 20
    ) {
      throw new Error("Terlalu banyak laporan untuk target ini. Coba lagi nanti");
    }

    return await ctx.db.insert("reports", {
      reporterId: userId ?? undefined,
      vendorId: args.vendorId,
      requestId: args.requestId,
      reason,
      details,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateReport = mutation({
  args: {
    id: v.id("reports"),
    status: v.union(v.literal("reviewing"), v.literal("resolved"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const actorId = await requireStaff(ctx);
    const report = await ctx.db.get(args.id);
    if (!report) throw new Error("Laporan tidak ditemukan");
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    await writeAudit(ctx, {
      action: "report.moderated",
      actorId,
      vendorId: report.vendorId,
      requestId: report.requestId,
      entityId: args.id,
      oldValue: report.status,
      newValue: args.status,
    });
    return args.id;
  },
});

export const listReports = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);
    // Hanya dua status yang ditampilkan, jadi hanya dua rentang indeks itu yang
    // dibaca. Sebelumnya seluruh tabel dibaca lalu yang sudah `resolved` dan
    // `dismissed` dibuang di memori — dan dua status itu justru yang menumpuk
    // selamanya, karena laporan selesai tidak pernah dihapus.
    const [open, reviewing] = await Promise.all([
      ctx.db.query("reports").withIndex("byStatus", (q) => q.eq("status", "open")).collect(),
      ctx.db
        .query("reports")
        .withIndex("byStatus", (q) => q.eq("status", "reviewing"))
        .collect(),
    ]);
    return [...open, ...reviewing].sort((a, b) => b.createdAt - a.createdAt);
  },
});
