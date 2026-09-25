import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { api } from "./_generated/api";

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

async function requireUser(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Masuk untuk menggunakan fitur warga");
  return userId;
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
      .filter((request) => args.mine || request.status !== "cancelled")
      .filter((request) => !args.mine || request.requesterId === requesterId)
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
        const [requester, vendor] = await Promise.all([
          ctx.db.get(request.requesterId),
          request.vendorId ? ctx.db.get(request.vendorId) : Promise.resolve(null),
        ]);
        return {
          ...request,
          requesterName: requester?.name ?? "Warga Sumenep",
          vendorName: vendor?.name,
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
    budget: v.optional(v.string()),
    neededAt: v.optional(v.number()),
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
    const now = Date.now();
    const requestId = await ctx.db.insert("serviceRequests", {
      requesterId: userId,
      title,
      description,
      category: args.category,
      landmark: args.landmark,
      budget: args.budget?.trim() || undefined,
      neededAt: args.neededAt,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      api.whatsapp.sendRequestCreatedNotifications,
      { requestId },
    );
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
      await notifyUser(
        ctx,
        candidate._id,
        "request",
        "Permintaan baru di Sumenep",
        `${title} — ${args.landmark === "all" ? "sekitar Sumenep" : landmarkLabelForNotification(args.landmark)}`,
      );
      notified += 1;
    }
    return requestId;
  },
});

const landmarkLabelForNotification = (landmark: string) =>
  ({ adipura: "Taman Bunga / Adipura", trunojoyo: "Jl. Trunojoyo", anom: "Pasar Anom Baru", keraton: "Keraton / Labang Mesem", jamik: "Masjid Jamik" }[landmark] ?? landmark);

export const claimRequest = mutation({
  args: {
    requestId: v.id("serviceRequests"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    const vendor = await ctx.db.get(args.vendorId);
    if (!request || request.status !== "open") throw new Error("Permintaan sudah tidak tersedia");
    if (!vendor || vendor.status !== "active") throw new Error("Listing tidak tersedia");
    if (request.requesterId === userId) throw new Error("Anda tidak dapat menawarkan permintaan milik sendiri");
    const user = await ctx.db.get(userId);
    const staffMembership = await ctx.db
      .query("staffMembers")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    const isStaff = user?.role === "admin" || user?.role === "staff" || Boolean(staffMembership);
    if (vendor.ownerId && vendor.ownerId !== userId && !isStaff) {
      throw new Error("Hanya pemilik listing atau pengelola yang dapat menawarkan permintaan ini");
    }
    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "claimed",
      vendorId: args.vendorId,
      claimedAt: now,
      updatedAt: now,
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
        api.whatsapp.sendRequestStatusNotification,
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
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Permintaan tidak ditemukan");
    if (request.requesterId !== userId) {
      throw new Error("Hanya pembuat permintaan yang dapat memperbarui status");
    }
    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: args.status,
      completedAt: args.status === "completed" ? now : undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      api.whatsapp.sendRequestStatusNotification,
      { requestId: args.requestId, status: args.status },
    );
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
    await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
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
    await requireUser(ctx);
    const { id, ...changes } = args;
    const current = await ctx.db.get(id);
    if (!current) throw new Error("Paket tidak ditemukan");
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
    await requireUser(ctx);
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("Paket tidak ditemukan");
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
    await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    await ctx.db.patch(args.vendorId, {
      availability: args.availability,
      availabilityNote: args.availabilityNote?.trim() || undefined,
      nextAvailableAt: args.nextAvailableAt,
      responseMinutes: args.responseMinutes,
      serviceRadiusKm: args.serviceRadiusKm,
      updatedAt: Date.now(),
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
    const phone = (args.whatsappPhone ?? current?.whatsappPhone ?? "")
      .replace(/\D/g, "")
      .replace(/^0/, "62");
    const whatsappUpdates =
      args.whatsappUpdates ?? current?.whatsappUpdates ?? false;
    if (whatsappUpdates && (phone.length < 10 || phone.length > 15)) {
      throw new Error("Masukkan nomor WhatsApp yang valid sebelum mengaktifkan notifikasi");
    }
    const next = {
      whatsappUpdates,
      whatsappPhone: phone || undefined,
      whatsappOptInAt: whatsappUpdates
        ? current?.whatsappOptInAt ?? Date.now()
        : undefined,
      areaUpdates: args.areaUpdates ?? current?.areaUpdates ?? false,
      requestUpdates: args.requestUpdates ?? current?.requestUpdates ?? false,
    };
    if (current) {
      await ctx.db.patch(current._id, { ...next, updatedAt: Date.now() });
      return current._id;
    }
    return await ctx.db.insert("notificationPreferences", {
      userId,
      ...next,
      updatedAt: Date.now(),
    });
  },
});

export const listVendorPhotos = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.status !== "active") return [];
    const rows = await ctx.db
      .query("vendorPhotos")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    const visible = rows
      .filter((photo) => photo.active !== false)
      .sort((a, b) => b.createdAt - a.createdAt)
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
    await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    if (!args.storageId) throw new Error("Foto belum berhasil diunggah");
    return await ctx.db.insert("vendorPhotos", {
      vendorId: args.vendorId,
      storageId: args.storageId,
      caption: args.caption?.trim() || undefined,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const removeVendorPhoto = mutation({
  args: { id: v.id("vendorPhotos") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const photo = await ctx.db.get(args.id);
    if (!photo) throw new Error("Foto tidak ditemukan");
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const listCommunityMetrics = query({
  args: {},
  handler: async (ctx) => {
    const [vendors, requests, users, favorites, photos] = await Promise.all([
      ctx.db.query("vendors").collect(),
      ctx.db.query("serviceRequests").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("favorites").collect(),
      ctx.db.query("vendorPhotos").collect(),
    ]);
    const activeVendors = vendors.filter((vendor) => vendor.status === "active");
    const photoVendorIds = new Set(
      photos.filter((photo) => photo.active !== false).map((photo) => photo.vendorId),
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
      completedRequests: requests.filter((request) => request.status === "completed").length,
      completeListingRate: activeVendors.length > 0
        ? Math.round((completeListings.length / activeVendors.length) * 100)
        : 0,
      completeListings: completeListings.length,
      listingsWithPhotos: activeVendors.filter(
        (vendor) => Boolean(vendor.photoId) || photoVendorIds.has(vendor._id),
      ).length,
      returningSaverRate: users.length > 0
        ? Math.round((returningUsers.size / users.length) * 100)
        : 0,
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
    if (reason.length < 3 || details.length < 5) throw new Error("Ceritakan alasan laporan dengan lebih lengkap");
    return await ctx.db.insert("reports", {
      reporterId: userId ?? undefined,
      vendorId: args.vendorId,
      requestId: args.requestId,
      reason,
      details,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateReport = mutation({
  args: {
    id: v.id("reports"),
    status: v.union(v.literal("reviewing"), v.literal("resolved"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const report = await ctx.db.get(args.id);
    if (!report) throw new Error("Laporan tidak ditemukan");
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    return args.id;
  },
});

export const listReports = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const reports = await ctx.db.query("reports").collect();
    return reports
      .filter((report) => report.status === "open" || report.status === "reviewing")
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});
