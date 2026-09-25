import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { getStaffAccess, requireUser } from "./access";
import { recordEvent } from "./analytics";
import { writeAudit } from "./audit";

const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isMatch = (
  request: DataModel["serviceRequests"]["document"],
  vendor: DataModel["vendors"]["document"],
) => {
  if (request.status !== "open" || vendor.status !== "active" || request.category !== vendor.category) return false;
  if (request.expiresAt && request.expiresAt <= Date.now()) return false;
  if (request.landmark !== "all" && vendor.landmark !== request.landmark) {
    if (request.lat === undefined || request.lng === undefined || vendor.lat === undefined || vendor.lng === undefined) return false;
    const km = distanceKm(request.lat, request.lng, vendor.lat, vendor.lng);
    if (km > (vendor.serviceRadiusKm ?? 0)) return false;
  }
  return true;
};

export const listMatchingRequests = query({
  args: { vendorId: v.optional(v.id("vendors")) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const owned = args.vendorId
      ? [await ctx.db.get(args.vendorId)].filter((vendor): vendor is NonNullable<typeof vendor> => Boolean(vendor && vendor.ownerId === userId))
      : await ctx.db.query("vendors").withIndex("byOwner", (q) => q.eq("ownerId", userId)).collect();
    if (owned.length === 0) return [];
    const requests = await ctx.db.query("serviceRequests").withIndex("byStatus", (q) => q.eq("status", "open")).collect();
    const result = await Promise.all(requests.map(async (request) => {
      const requester = await ctx.db.get(request.requesterId);
      const vendorMatches = owned
        .filter((vendor) => isMatch(request, vendor))
        .map((vendor) => {
          const km = request.lat !== undefined && request.lng !== undefined && vendor.lat !== undefined && vendor.lng !== undefined
            ? distanceKm(request.lat, request.lng, vendor.lat, vendor.lng)
            : request.landmark !== "all" && request.landmark === vendor.landmark ? 0 : undefined;
          return { vendorId: vendor._id, name: vendor.name, distanceKm: km, responseMinutes: vendor.responseMinutes };
        })
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || (a.responseMinutes ?? 999999) - (b.responseMinutes ?? 999999));
      if (vendorMatches.length === 0) return null;
      return { ...request, requesterName: requester?.name ?? "Warga Sumenep", vendorMatches };
    }));
    return result.filter((item): item is NonNullable<typeof item> => item !== null).sort((a, b) => {
      const aDistance = a.vendorMatches[0]?.distanceKm ?? Infinity;
      const bDistance = b.vendorMatches[0]?.distanceKm ?? Infinity;
      return aDistance - bDistance || (a.vendorMatches[0]?.responseMinutes ?? 999999) - (b.vendorMatches[0]?.responseMinutes ?? 999999);
    }).slice(0, 50);
  },
});

export const listOwnerRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const vendors = await ctx.db.query("vendors").withIndex("byOwner", (q) => q.eq("ownerId", userId)).collect();
    const vendorIds = new Set(vendors.map((vendor) => vendor._id));
    if (vendorIds.size === 0) return [];
    const requests = await ctx.db.query("serviceRequests").collect();
    const offers = await ctx.db.query("requestOffers").collect();
    const visible = requests.filter((request) => request.vendorId ? vendorIds.has(request.vendorId) : vendors.some((vendor) => isMatch(request, vendor)));
    return Promise.all(visible.map(async (request) => {
      const requester = await ctx.db.get(request.requesterId);
      const vendor = request.vendorId ? await ctx.db.get(request.vendorId) : null;
      return {
        ...request,
        requesterName: requester?.name ?? "Warga Sumenep",
        vendorName: vendor?.name,
        offers: offers.filter((offer) => offer.requestId === request._id && vendorIds.has(offer.vendorId)),
      };
    })).then((rows) => rows.sort((a, b) => b.updatedAt - a.updatedAt));
  },
});

export const offerRequest = mutation({
  args: { requestId: v.id("serviceRequests"), vendorId: v.id("vendors"), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    const vendor = await ctx.db.get(args.vendorId);
    if (!request || request.status !== "open" || (request.expiresAt && request.expiresAt <= Date.now())) throw new Error("Permintaan sudah tidak tersedia");
    if (!vendor || vendor.status !== "active" || vendor.ownerId !== userId) throw new Error("Hanya pemilik listing aktif yang dapat menawarkan bantuan");
    if (!isMatch(request, vendor)) throw new Error("Listing belum cocok dengan kategori, area, atau radius layanan");
    const now = Date.now();
    const existing = await ctx.db.query("requestOffers").withIndex("byRequestVendor", (q) => q.eq("requestId", args.requestId).eq("vendorId", args.vendorId)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { status: "offered", message: args.message?.trim() || undefined, updatedAt: now });
      return existing._id;
    }
    const offerId = await ctx.db.insert("requestOffers", { requestId: args.requestId, vendorId: args.vendorId, offeredBy: userId, message: args.message?.trim() || undefined, status: "offered", createdAt: now, updatedAt: now });
    await recordEvent(ctx, { event: "request_matched", userId, requestId: args.requestId, vendorId: args.vendorId });
    await writeAudit(ctx, { action: "request.status_changed", actorId: userId, requestId: args.requestId, vendorId: args.vendorId, newValue: "offered" });
    return offerId;
  },
});

export const withdrawOffer = mutation({
  args: { offerId: v.id("requestOffers") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const offer = await ctx.db.get(args.offerId);
    if (!offer) throw new Error("Tawaran tidak ditemukan");
    const access = await getStaffAccess(ctx, userId);
    if (offer.offeredBy !== userId && !access) throw new Error("Anda tidak dapat menarik tawaran ini");
    await ctx.db.patch(args.offerId, { status: "withdrawn", updatedAt: Date.now() });
    return args.offerId;
  },
});

export const listRequestOffers = query({
  args: { requestId: v.id("serviceRequests") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Permintaan tidak ditemukan");
    const access = await getStaffAccess(ctx, userId);
    if (request.requesterId !== userId && !access) {
      const ownsOffer = (await ctx.db.query("requestOffers").withIndex("byRequest", (q) => q.eq("requestId", args.requestId)).collect()).some((offer) => {
        if (offer.offeredBy !== userId) return false;
        return true;
      });
      if (!ownsOffer) throw new Error("Riwayat tawaran tidak dapat diakses");
    }
    const rows = await ctx.db.query("requestOffers").withIndex("byRequest", (q) => q.eq("requestId", args.requestId)).collect();
    return Promise.all(rows.map(async (offer) => ({ ...offer, vendorName: (await ctx.db.get(offer.vendorId))?.name ?? "Listing" })));
  },
});
