import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import { vendors as seedVendors } from "../lib/catalog";
import type { DataModel } from "./_generated/dataModel";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "usaha";

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

async function requireUser(
  ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Masuk untuk mengakses ruang pengelola");
  return userId;
}

export const listActive = query({
  args: {
    category: v.optional(v.string()),
    landmark: v.optional(v.string()),
    search: v.optional(v.string()),
    openNow: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("vendors")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const search = args.search?.trim().toLowerCase();

    return rows
      .map((vendor) => {
        const distanceKm =
          args.lat !== undefined &&
          args.lng !== undefined &&
          vendor.lat !== undefined &&
          vendor.lng !== undefined
            ? haversineKm(args.lat, args.lng, vendor.lat, vendor.lng)
            : undefined;
        const openNow =
          /24|24 jam|setiap hari|senin|minggu/.test(vendor.hours.toLowerCase()) &&
          currentMinutes >= 360 &&
          currentMinutes <= 1320;
        return {
          ...vendor,
          reviews: vendor.reviewsCount ?? 0,
          distanceKm,
          openNow,
        };
      })
      .filter(
        (vendor) =>
          !args.category || args.category === "Semua" || vendor.category === args.category,
      )
      .filter(
        (vendor) =>
          !args.landmark || args.landmark === "all" || vendor.landmark === args.landmark,
      )
      .filter((vendor) => !args.openNow || vendor.openNow)
      .filter(
        (vendor) =>
          !search ||
          [vendor.name, vendor.description, vendor.category, ...vendor.tags]
            .join(" ")
            .toLowerCase()
            .includes(search),
      )
      .sort(
        (a, b) =>
          Number(b.featured ?? false) - Number(a.featured ?? false) ||
          (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
      );
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    if (!args.slug) return null;
    const vendor = await ctx.db
      .query("vendors")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!vendor || vendor.status !== "active") return null;
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("byVendor", (q) => q.eq("vendorId", vendor._id))
      .order("desc")
      .take(20);
    return { ...vendor, reviews };
  },
});

export const getImageUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    if (!args.storageId) return null;
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const listForAdmin = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const rows = args.status
      ? await ctx.db
          .query("vendors")
          .withIndex("byStatus", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("vendors").collect();
    return rows
      .map((vendor) => ({ ...vendor, reviews: vendor.reviewsCount ?? 0 }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

const vendorFields = {
  name: v.string(),
  category: v.string(),
  description: v.string(),
  address: v.string(),
  landmark: v.string(),
  price: v.string(),
  hours: v.string(),
  phone: v.string(),
  rating: v.optional(v.string()),
  accent: v.optional(v.string()),
  mark: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  status: v.optional(
    v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
  ),
  featured: v.optional(v.boolean()),
  verified: v.optional(v.boolean()),
  photoId: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
};

export const ensureCatalogSeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;

    for (const [index, vendor] of seedVendors.entries()) {
      const existing = await ctx.db
        .query("vendors")
        .withIndex("bySlug", (q) => q.eq("slug", vendor.slug))
        .unique();
      if (existing) {
        const coordinatePatch = {
          ...(existing.lat !== vendor.lat ? { lat: vendor.lat } : {}),
          ...(existing.lng !== vendor.lng ? { lng: vendor.lng } : {}),
        };
        if (Object.keys(coordinatePatch).length > 0) {
          await ctx.db.patch(existing._id, coordinatePatch);
        }
        continue;
      }

      await ctx.db.insert("vendors", {
        slug: vendor.slug,
        name: vendor.name,
        category: vendor.category,
        description: vendor.description,
        address: vendor.address,
        landmark: vendor.landmark,
        lat: vendor.lat,
        lng: vendor.lng,
        price: vendor.price,
        hours: vendor.hours,
        phone: vendor.phone,
        rating: vendor.rating,
        reviewsCount: vendor.reviews,
        accent: vendor.accent,
        mark: vendor.mark,
        tags: vendor.tags,
        status: "active",
        featured: vendor.featured ?? false,
        verified: vendor.verified ?? false,
        createdAt: now + index,
        updatedAt: now + index,
      });
      inserted += 1;
    }

    return inserted;
  },
});

export const createVendor = mutation({
  args: vendorFields,
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const now = Date.now();
    const base = slugify(args.name);
    const existing = await ctx.db
      .query("vendors")
      .withIndex("bySlug", (q) => q.eq("slug", base))
      .unique();
    const slug = existing ? `${base}-${now.toString(36).slice(-4)}` : base;

    return await ctx.db.insert("vendors", {
      name: args.name.trim(),
      category: args.category as
        | "Servis Teknik"
        | "Hajatan & Acara"
        | "Kuliner"
        | "Transportasi"
        | "Jasa Umum",
      description: args.description,
      address: args.address,
      landmark: args.landmark,
      price: args.price,
      hours: args.hours,
      phone: args.phone.replace(/\D/g, ""),
      rating: args.rating ?? "Baru",
      reviewsCount: 0,
      accent: args.accent ?? "from-blue-600 to-cyan-400",
      mark: args.mark ?? args.name.slice(0, 2).toUpperCase(),
      tags: args.tags ?? [],
      status: args.status ?? "active",
      featured: args.featured ?? false,
      verified: args.verified ?? false,
      photoId: args.photoId,
      lat: args.lat,
      lng: args.lng,
      slug,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateVendor = mutation({
  args: { id: v.id("vendors"), ...vendorFields },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const { id, ...changes } = args;
    const current = await ctx.db.get(id);
    if (!current) throw new Error("Listing tidak ditemukan");

    await ctx.db.patch(id, {
      name: changes.name,
      category: changes.category as
        | "Servis Teknik"
        | "Hajatan & Acara"
        | "Kuliner"
        | "Transportasi"
        | "Jasa Umum",
      description: changes.description,
      address: changes.address,
      landmark: changes.landmark,
      price: changes.price,
      hours: changes.hours,
      phone: changes.phone.replace(/\D/g, ""),
      rating: changes.rating,
      accent: changes.accent,
      mark: changes.mark,
      tags: changes.tags,
      status: changes.status,
      featured: changes.featured,
      verified: changes.verified,
      photoId: changes.photoId === undefined ? current.photoId : changes.photoId,
      lat: changes.lat,
      lng: changes.lng,
      updatedAt: Date.now(),
    });
    return id;
  },
});

export const archiveVendor = mutation({
  args: { id: v.id("vendors") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("Listing tidak ditemukan");
    await ctx.db.patch(args.id, {
      status: "archived",
      featured: false,
      updatedAt: Date.now(),
    });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const incrementClick = mutation({
  args: {
    id: v.id("vendors"),
    kind: v.optional(
      v.union(v.literal("whatsapp"), v.literal("share"), v.literal("impression")),
    ),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) return;
    const kind = args.kind ?? "whatsapp";
    const key =
      kind === "whatsapp"
        ? "whatsappClicks"
        : kind === "share"
          ? "shareClicks"
          : "searchImpressions";
    await ctx.db.patch(args.id, {
      [key]: (current[key] ?? 0) + 1,
      updatedAt: current.updatedAt,
    });
  },
});

export const addReview = mutation({
  args: {
    vendorId: v.id("vendors"),
    authorName: v.string(),
    rating: v.number(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.status !== "active") throw new Error("Listing tidak ditemukan");
    const authorName = args.authorName.trim();
    const body = args.body.trim();
    if (!authorName || !body) throw new Error("Nama dan ulasan tidak boleh kosong");

    const reviewId = await ctx.db.insert("reviews", {
      vendorId: args.vendorId,
      authorId: userId ?? undefined,
      authorName,
      rating: Math.min(5, Math.max(1, args.rating)),
      body,
      helpful: 0,
      createdAt: Date.now(),
    });
    const all = await ctx.db
      .query("reviews")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    const average = all.reduce((sum, item) => sum + item.rating, 0) / all.length;
    await ctx.db.patch(args.vendorId, {
      rating: average.toFixed(1),
      reviewsCount: all.length,
      updatedAt: Date.now(),
    });
    return reviewId;
  },
});

export const toggleFavorite = mutation({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.status !== "active") throw new Error("Listing tidak ditemukan");
    const existing = await ctx.db
      .query("favorites")
      .withIndex("byUserVendor", (q) =>
        q.eq("userId", userId).eq("vendorId", args.vendorId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    else {
      await ctx.db.insert("favorites", {
        userId,
        vendorId: args.vendorId,
        createdAt: Date.now(),
      });
    }
    return !existing;
  },
});

export const listFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("favorites")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .collect();
    const favorites = await Promise.all(
      rows.map(async (favorite) => {
        const vendor = await ctx.db.get(favorite.vendorId);
        return vendor
          ? { vendorId: favorite.vendorId, slug: vendor.slug, createdAt: favorite.createdAt }
          : null;
      }),
    );
    return favorites.filter((favorite): favorite is NonNullable<typeof favorite> => favorite !== null);
  },
});

export const submitFeedback = mutation({
  args: { email: v.optional(v.string()), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    return await ctx.db.insert("notifications", {
      userId: userId ?? undefined,
      email: args.email,
      kind: "feedback",
      title: args.title.trim(),
      body: args.body.trim(),
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const setSubscription = mutation({
  args: {
    vendorId: v.id("vendors"),
    tier: v.union(v.literal("free"), v.literal("featured"), v.literal("premium")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    await ctx.db.patch(args.vendorId, {
      subscriptionTier: args.tier,
      featured: args.tier !== "free",
      updatedAt: Date.now(),
    });
  },
});
