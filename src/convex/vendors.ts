import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, internalQuery } from "./_generated/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";
import { vendors as seedVendors } from "../lib/catalog";
import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { recordEvent } from "./analytics";
import { writeAudit, writeListingHistory } from "./audit";
import { requireManagementViewer, requireProvenIdentity } from "./access";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "usaha";

const normalizeWhatsAppPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return normalized.length >= 10 && normalized.length <= 15 ? normalized : undefined;
};

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
    throw new Error("Hanya pengelola yang dapat mengakses ruang ini");
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

/**
 * Slug listing publik untuk sitemap.
 *
 * Hanya `status: "active"`. Listing draft, arsip, dan yang sedang dimoderasi
 * TIDAK boleh muncul di peta situs: halamannya sendiri menolak status selain
 * active, jadi memetakannya hanya menghasilkan 404 di indeks pencarian.
 *
 * Dijalankan dari route HTTP, jadi harus `internal` — tidak ada permukaan
 * publik baru di aplikasi.
 */
export const publicSitemapVendors = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("vendors")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .order("desc")
      .take(2_000);
    return rows
      .map((vendor) => ({ slug: vendor.slug, updatedAt: vendor.updatedAt ?? vendor.createdAt }))
      .filter((vendor) => Boolean(vendor.slug));
  },
});

// TODO(paginasi): daftar listing aktif sengaja DIBACA PENUH lalu disaring di
// memori, bukan dengan kursor paginasi. Pada skala sekarang (puluhan listing
// aktif) itu lebih murah daripada kursor: satu pembacaan indeks `byStatus` yang
// berurutan lebih hemat daripada N+1 pembacaan per halaman, dan tidak ada
// tombol "Muat lagi" yang perlu diutak-atik di UX.
//
// Kapan harus dikerjakan ulang:
//   - vendor `status: "active"` melewati ~500, ATAU
//   - satu burst pembacaan dashboard/listingan terasa berat.
//
// Yang harus dibuat saat itu (bukan sooner):
//   1. indeks komposit `byStatusCategory` (dan `byStatusLandmark`) supaya filter
//      kategori/area tidak menyaring seluruh tabel di memori;
//   2. `paginate()` pada `listActive` dengan kursor `createdAt`, dan Dashboard
//      memakai `.continueCursor()` untuk tombol "Muat lagi";
//   3. pencarian teks pindah ke indeks `bySearchText` (lowercase gabungan nama,
//      kategori, tag) daripada `.includes()` di memori.
//
// requirement audit secara eksplisit menyatakan belum waktunya, jadi tidak ada
// kursor paginasi yang ditulis sekarang.
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
          vendor.availability !== "closed" &&
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

export const listForOwner = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db
      .query("vendors")
      .withIndex("byOwner", (q) => q.eq("ownerId", userId))
      .collect();
    return rows
      .map((vendor) => ({ ...vendor, reviews: vendor.reviewsCount ?? 0 }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listForAdmin = query({
  args: {
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
  },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
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
  availability: v.optional(v.union(v.literal("available"), v.literal("busy"), v.literal("closed"))),
  availabilityNote: v.optional(v.string()),
  nextAvailableAt: v.optional(v.number()),
  responseMinutes: v.optional(v.number()),
  serviceRadiusKm: v.optional(v.number()),
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
        availability: vendor.availability ?? "available",
        availabilityNote: vendor.availabilityNote,
        responseMinutes: vendor.responseMinutes,
        serviceRadiusKm: vendor.serviceRadiusKm,
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
    const userId = await requireUser(ctx);
    if (await isViewer(ctx, userId)) throw new Error("Viewer hanya dapat melihat data");
    // Membuat listing sendiri tidak butuh klaim: listing langsung masuk sebagai
    // draft milik pembuat dan tidak pernah tampil sebelum admin memverifikasi.
    // Yang diwajibkan klaim adalah mengelola listing yang sudah tayang.
    const privileged = await hasStaffAccess(ctx, userId);
    const phone = normalizeWhatsAppPhone(args.phone);
    if (!phone) throw new Error("Masukkan nomor WhatsApp yang valid");
    if (!["Servis Teknik", "Hajatan & Acara", "Kuliner", "Transportasi", "Jasa Umum"].includes(args.category)) {
      throw new Error("Kategori usaha tidak dikenal");
    }
    if (args.name.trim().length < 2 || args.name.trim().length > 120) {
      throw new Error("Nama usaha harus 2–120 karakter");
    }
    if (args.description.trim().length < 10 || args.description.trim().length > 2000) {
      throw new Error("Deskripsi usaha harus 10–2000 karakter");
    }
    if (args.address.trim().length < 5 || args.address.trim().length > 300) {
      throw new Error("Alamat usaha harus 5–300 karakter");
    }
    if (args.hours.trim().length > 200) throw new Error("Jam kerja terlalu panjang");
    if (args.lat !== undefined && (args.lat < -90 || args.lat > 90)) throw new Error("Koordinat latitude tidak valid");
    if (args.lng !== undefined && (args.lng < -180 || args.lng > 180)) throw new Error("Koordinat longitude tidak valid");
    if (args.responseMinutes !== undefined && (args.responseMinutes < 0 || args.responseMinutes > 10080)) {
      throw new Error("Waktu respons harus antara 0 dan 10.080 menit");
    }
    if (args.serviceRadiusKm !== undefined && (args.serviceRadiusKm < 0 || args.serviceRadiusKm > 500)) {
      throw new Error("Radius layanan harus antara 0 dan 500 km");
    }
    const now = Date.now();
    const base = slugify(args.name);
    const existing = await ctx.db
      .query("vendors")
      .withIndex("bySlug", (q) => q.eq("slug", base))
      .unique();
    const slug = existing ? `${base}-${now.toString(36).slice(-4)}` : base;

    const vendorId = await ctx.db.insert("vendors", {
      name: args.name.trim(),
      category: args.category as
        | "Servis Teknik"
        | "Hajatan & Acara"
        | "Kuliner"
        | "Transportasi"
        | "Jasa Umum",
      ownerId: userId,
      description: args.description,
      address: args.address,
      landmark: args.landmark,
      price: args.price,
      hours: args.hours,
      phone,
      rating: privileged ? args.rating ?? "Baru" : "Baru",
      reviewsCount: 0,
      accent: args.accent ?? "from-blue-600 to-cyan-400",
      mark: args.mark ?? args.name.slice(0, 2).toUpperCase(),
      tags: args.tags ?? [],
      // Owner-created listings enter moderation as drafts. Only a staff
      // member can publish a listing, so a URL or client flag cannot bypass it.
      status: privileged ? args.status ?? "draft" : "draft",
      featured: privileged ? args.featured ?? false : false,
      verified: privileged ? args.verified ?? false : false,
      photoId: privileged ? args.photoId : undefined,
      lat: args.lat,
      lng: args.lng,
      availability: args.availability ?? "available",
      availabilityNote: args.availabilityNote?.trim() || undefined,
      nextAvailableAt: args.nextAvailableAt,
      responseMinutes: args.responseMinutes,
      serviceRadiusKm: args.serviceRadiusKm,
      slug,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      action: "listing.created",
      actorId: userId,
      vendorId,
      newValue: { status: privileged ? args.status ?? "draft" : "draft" },
    });
    if ((privileged ? args.status ?? "draft" : "draft") === "active") {
      await recordEvent(ctx, {
        event: "listing_published",
        userId,
        vendorId,
        metadata: { source: "create" },
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.whatsapp.sendVendorCreatedNotifications,
      { vendorId },
    );
    return vendorId;
  },
});

export const updateVendor = mutation({
  args: { id: v.id("vendors"), ...vendorFields },
  handler: async (ctx, args) => {
    const { id, ...changes } = args;
    const current = await ctx.db.get(id);
    if (!current) throw new Error("Listing tidak ditemukan");
    const userId = await requireVendorManager(ctx, current);
    await requireProvenIdentity(ctx, userId, current);
    const privileged = await hasStaffAccess(ctx, userId);
    const phone = normalizeWhatsAppPhone(changes.phone);
    if (!phone) throw new Error("Masukkan nomor WhatsApp yang valid");
    if (!["Servis Teknik", "Hajatan & Acara", "Kuliner", "Transportasi", "Jasa Umum"].includes(changes.category)) {
      throw new Error("Kategori usaha tidak dikenal");
    }
    if (changes.name.trim().length < 2 || changes.name.trim().length > 120) throw new Error("Nama usaha harus 2–120 karakter");
    if (changes.description.trim().length < 10 || changes.description.trim().length > 2000) throw new Error("Deskripsi usaha harus 10–2000 karakter");
    if (changes.address.trim().length < 5 || changes.address.trim().length > 300) throw new Error("Alamat usaha harus 5–300 karakter");
    if (changes.hours.trim().length > 200) throw new Error("Jam kerja terlalu panjang");
    if (changes.lat !== undefined && (changes.lat < -90 || changes.lat > 90)) throw new Error("Koordinat latitude tidak valid");
    if (changes.lng !== undefined && (changes.lng < -180 || changes.lng > 180)) throw new Error("Koordinat longitude tidak valid");
    if (changes.responseMinutes !== undefined && (changes.responseMinutes < 0 || changes.responseMinutes > 10080)) throw new Error("Waktu respons harus antara 0 dan 10.080 menit");
    if (changes.serviceRadiusKm !== undefined && (changes.serviceRadiusKm < 0 || changes.serviceRadiusKm > 500)) throw new Error("Radius layanan harus antara 0 dan 500 km");

    const nextStatus = privileged
      ? changes.status
      : changes.status === "active"
        ? current.status
        : changes.status;
    const next = {
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
      phone,
      rating: privileged ? changes.rating : current.rating,
      accent: changes.accent === undefined ? current.accent : changes.accent,
      mark: changes.mark === undefined ? current.mark : changes.mark,
      tags: changes.tags === undefined ? current.tags : changes.tags,
      status: nextStatus,
      featured: privileged ? changes.featured : current.featured,
      verified: privileged ? changes.verified : current.verified,
      photoId: privileged
        ? changes.photoId === undefined ? current.photoId : changes.photoId
        : current.photoId,
      lat: changes.lat === undefined ? current.lat : changes.lat,
      lng: changes.lng === undefined ? current.lng : changes.lng,
      availability: changes.availability ?? current.availability,
      availabilityNote: changes.availabilityNote === undefined ? current.availabilityNote : changes.availabilityNote,
      nextAvailableAt: changes.nextAvailableAt === undefined ? current.nextAvailableAt : changes.nextAvailableAt,
      responseMinutes: changes.responseMinutes === undefined ? current.responseMinutes : changes.responseMinutes,
      serviceRadiusKm: changes.serviceRadiusKm === undefined ? current.serviceRadiusKm : changes.serviceRadiusKm,
    };
    const trackedFields = [
      "name", "category", "description", "address", "landmark", "price", "hours",
      "phone", "rating", "accent", "mark", "tags", "status", "featured",
      "verified", "photoId", "lat", "lng", "availability", "availabilityNote",
      "nextAvailableAt", "responseMinutes", "serviceRadiusKm",
    ] as const;
    const historyChanges = trackedFields.flatMap((field) => {
      const before = current[field];
      const after = next[field];
      return JSON.stringify(before) === JSON.stringify(after)
        ? []
        : [{ field, oldValue: before, newValue: after }];
    });
    await ctx.db.patch(id, { ...next, updatedAt: Date.now() });
    await writeListingHistory(ctx, { vendorId: id, actorId: userId, changes: historyChanges });
    if (current.status !== next.status) {
      await writeAudit(ctx, {
        action: next.status === "archived" ? "listing.archived" : next.status === "active" ? "listing.published" : "listing.status_changed",
        actorId: userId,
        vendorId: id,
        oldValue: current.status,
        newValue: next.status,
      });
    }
    if (current.verified !== next.verified) {
      await writeAudit(ctx, {
        action: "listing.verified",
        actorId: userId,
        vendorId: id,
        oldValue: current.verified ?? false,
        newValue: next.verified ?? false,
      });
    }
    if (current.status !== next.status) {
      await recordEvent(ctx, {
        event: next.status === "archived" ? "listing_archived" : next.status === "active" ? "listing_published" : "listing_published",
        userId,
        vendorId: id,
        metadata: { source: "update" },
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.whatsapp.sendVendorUpdatedNotifications,
      { vendorId: id },
    );
    return id;
  },
});

export const archiveVendor = mutation({
  args: { id: v.id("vendors") },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    const actorId = await requireVendorManager(ctx, current);
    await requireProvenIdentity(ctx, actorId, current);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "archived",
      featured: false,
      updatedAt: now,
    });
    await writeListingHistory(ctx, {
      vendorId: args.id,
      actorId,
      changes: [
        { field: "status", oldValue: current?.status, newValue: "archived" },
        { field: "featured", oldValue: current?.featured ?? false, newValue: false },
      ],
      reason: "archive",
    });
    await writeAudit(ctx, {
      action: "listing.archived",
      actorId,
      vendorId: args.id,
      oldValue: current?.status,
      newValue: "archived",
    });
    await recordEvent(ctx, { event: "listing_archived", userId: actorId, vendorId: args.id });
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
    if (!current || current.status !== "active") return;
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
    if (kind === "whatsapp") {
      await recordEvent(ctx, { event: "whatsapp_clicked", vendorId: args.id });
    } else if (kind === "share") {
      await recordEvent(ctx, { event: "share_clicked", vendorId: args.id });
    }
  },
});

export const recordSearch = mutation({
  args: {
    vendorIds: v.array(v.id("vendors")),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const normalized = args.query.trim().slice(0, 120);
    if (normalized.length < 2 || args.vendorIds.length === 0) return 0;
    const uniqueIds = [...new Set(args.vendorIds)].slice(0, 24);
    const vendors = await Promise.all(
      uniqueIds.map((vendorId) => ctx.db.get(vendorId)),
    );
    await Promise.all(
      vendors
        .filter((vendor) => vendor?.status === "active")
        .map((vendor) =>
          ctx.db.patch(vendor!._id, {
            searchImpressions: (vendor!.searchImpressions ?? 0) + 1,
          }),
        ),
    );
    await Promise.all(
      vendors
        .filter((vendor) => vendor?.status === "active")
        .map((vendor) => recordEvent(ctx, { event: "search_impression", vendorId: vendor!._id, metadata: { queryLength: normalized.length } })),
    );
    return vendors.filter((vendor) => vendor?.status === "active").length;
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
    if (body.length > 600) throw new Error("Ulasan maksimal 600 karakter");
    // Rating dibatasi 1-5 DAN harus bilangan bulat. Tanpa pembulatan, `4.7`
    // akan tersimpan dan merusak rata-rata yang tampil di listing.
    const rating = Math.round(Math.min(5, Math.max(1, args.rating)));

    // Satu ulasan per orang per listing. Tanpa ini, satu akun bisa menulis
    // ratusan ulasan dalam semalam dan mengubah rating rata-rata — dan untuk
    // direktori lokal, rating yang bisa dib bought bukan lagi sinyal.
    //
    // Hanya berlaku untuk penulis yang punya akun. Penulis tanpa akun
    // (anonim) tetap boleh menulis — itu model yang sudah berjalan — tapi tidak
    // bisa dihitung per orang, jadi batasnya berupa kuota harian per listing.
    if (userId) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("byVendorAuthor", (q) => q.eq("vendorId", args.vendorId).eq("authorId", userId))
        .first();
      if (existing) throw new Error("Anda sudah menulis ulasan untuk listing ini");
    } else {
      const todayStart = Date.now() - 24 * 60 * 60_000;
      const recentAnonymous = await ctx.db
        .query("reviews")
        .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
        .collect();
      const sameDay = recentAnonymous.filter(
        (row) => !row.authorId && row.createdAt >= todayStart,
      ).length;
      if (sameDay >= 3) throw new Error("Terlalu banyak ulasan hari ini untuk listing ini");
    }

    const reviewId = await ctx.db.insert("reviews", {
      vendorId: args.vendorId,
      authorId: userId ?? undefined,
      authorName,
      rating,
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
    await writeAudit(ctx, {
      action: "review.created",
      actorId: userId ?? undefined,
      vendorId: args.vendorId,
      entityId: reviewId,
      newValue: rating,
      metadata: { hasAccount: Boolean(userId) },
    });
    return reviewId;
  },
});

export const syncLocalFavorites = mutation({
  args: {
    items: v.array(
      v.object({
        slug: v.string(),
        collection: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const uniqueSlugs = Array.from(
      new Set(args.items.map((item) => item.slug.trim()).filter(Boolean)),
    ).slice(0, 100);
    let imported = 0;

    for (const slug of uniqueSlugs) {
      const vendor = await ctx.db
        .query("vendors")
        .withIndex("bySlug", (q) => q.eq("slug", slug))
        .unique();
      if (!vendor || vendor.status !== "active") continue;
      const existing = await ctx.db
        .query("favorites")
        .withIndex("byUserVendor", (q) =>
          q.eq("userId", userId).eq("vendorId", vendor._id),
        )
        .unique();
      if (existing) continue;
      const requestedCollection = args.items.find(
        (item) => item.slug.trim() === slug,
      )?.collection?.trim();
      await ctx.db.insert("favorites", {
        userId,
        vendorId: vendor._id,
        collection: requestedCollection || "Tersimpan",
        createdAt: Date.now(),
      });
      imported += 1;
    }

    return imported;
  },
});

export const toggleFavorite = mutation({
  args: {
    vendorId: v.id("vendors"),
    collection: v.optional(v.string()),
    saved: v.optional(v.boolean()),
  },
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
    const shouldSave = args.saved ?? !existing;
    if (!shouldSave && existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    if (shouldSave && !existing) {
      await ctx.db.insert("favorites", {
        userId,
        vendorId: args.vendorId,
        collection: args.collection?.trim() || "Tersimpan",
        createdAt: Date.now(),
      });
    } else if (shouldSave && existing && args.collection !== undefined) {
      await ctx.db.patch(existing._id, {
        collection: args.collection.trim() || "Tersimpan",
      });
    }
    return shouldSave;
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
          ? { vendorId: favorite.vendorId, slug: vendor.slug, collection: favorite.collection ?? "Tersimpan", createdAt: favorite.createdAt }
          : null;
      }),
    );
    return favorites.filter((favorite): favorite is NonNullable<typeof favorite> => favorite !== null);
  },
});

export const setFavoriteCollection = mutation({
  args: {
    vendorId: v.id("vendors"),
    collection: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("favorites")
      .withIndex("byUserVendor", (q) => q.eq("userId", userId).eq("vendorId", args.vendorId))
      .unique();
    if (!existing) throw new Error("Simpan listing sebelum memilih koleksi");
    await ctx.db.patch(existing._id, { collection: args.collection.trim() || "Tersimpan" });
    return existing._id;
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
    await requireStaff(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    await ctx.db.patch(args.vendorId, {
      subscriptionTier: args.tier,
      featured: args.tier !== "free",
      updatedAt: Date.now(),
    });
  },
});
