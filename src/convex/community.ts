import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

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
    const visible = rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(args.limit ?? 40, 1), 100));
    return Promise.all(
      visible.map(async (interaction) => {
        const vendor = await ctx.db.get(interaction.vendorId);
        return {
          ...interaction,
          vendorName: vendor?.name ?? "Listing",
          vendorSlug: vendor?.slug,
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
    areaUpdates: v.optional(v.boolean()),
    requestUpdates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const current = await ctx.db
      .query("notificationPreferences")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    const next = {
      whatsappUpdates: args.whatsappUpdates ?? current?.whatsappUpdates ?? false,
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
