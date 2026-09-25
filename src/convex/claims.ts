import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getStaffAccess, requireStaff, requireUser } from "./access";
import { writeAudit } from "./audit";
import { recordEvent } from "./analytics";

const claimStatusValidator = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

export const submitVendorClaim = mutation({
  args: {
    vendorId: v.id("vendors"),
    whatsappPhone: v.string(),
    email: v.string(),
    businessAddress: v.string(),
    evidenceStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    if (vendor.ownerId && vendor.ownerId !== userId) {
      throw new Error("Listing ini sudah terhubung ke pemilik lain");
    }
    const phone = args.whatsappPhone.replace(/\D/g, "").replace(/^0/, "62");
    const email = args.email.trim().toLowerCase();
    const address = args.businessAddress.trim();
    if (phone.length < 10 || phone.length > 15 || !email.includes("@") || address.length < 5) {
      throw new Error("Nomor WhatsApp, email, dan alamat usaha wajib diisi dengan benar");
    }
    const previous = await ctx.db
      .query("listingClaims")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    const pending = previous.find((claim) => claim.status === "pending");
    if (pending) {
      if (pending.requesterId !== userId) throw new Error("Listing sedang menunggu verifikasi klaim lain");
      return pending._id;
    }
    const now = Date.now();
    const claimId = await ctx.db.insert("listingClaims", {
      vendorId: args.vendorId,
      requesterId: userId,
      whatsappPhone: phone,
      email,
      businessAddress: address,
      evidenceStorageId: args.evidenceStorageId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      action: "listing.claim_submitted",
      actorId: userId,
      vendorId: args.vendorId,
      entityId: claimId,
      newValue: { email, whatsappPhone: phone },
    });
    return claimId;
  },
});

export const listVendorClaims = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    const access = await getStaffAccess(ctx, userId);
    if (vendor.ownerId !== userId && !access) throw new Error("Klaim listing tidak dapat diakses");
    return await ctx.db
      .query("listingClaims")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
  },
});

export const listPendingClaims = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const claims = await ctx.db
      .query("listingClaims")
      .withIndex("byStatus", (q) => q.eq("status", "pending"))
      .collect();
    return Promise.all(claims.map(async (claim) => {
      const vendor = await ctx.db.get(claim.vendorId);
      const requester = await ctx.db.get(claim.requesterId);
      return { ...claim, vendorName: vendor?.name, vendorSlug: vendor?.slug, requesterName: requester?.name, requesterEmail: requester?.email };
    }));
  },
});

export const reviewVendorClaim = mutation({
  args: {
    claimId: v.id("listingClaims"),
    decision: v.union(v.literal("verified"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (!claim) throw new Error("Klaim tidak ditemukan");
    if (claim.status !== "pending") throw new Error("Klaim ini sudah diproses");
    const vendor = await ctx.db.get(claim.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    if (vendor.ownerId && vendor.ownerId !== claim.requesterId) {
      throw new Error("Listing sudah memiliki pemilik lain");
    }
    const now = Date.now();
    if (args.decision === "verified") {
      await ctx.db.patch(args.claimId, {
        status: "verified",
        reviewNote: args.reviewNote?.trim() || undefined,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(claim.vendorId, {
        ownerId: claim.requesterId,
        updatedAt: now,
      });
      await writeAudit(ctx, {
        action: "listing.claim_approved",
        actorId: userId,
        vendorId: claim.vendorId,
        entityId: args.claimId,
        newValue: { ownerAssigned: true },
      });
      await writeAudit(ctx, {
        action: "listing.status_changed",
        actorId: userId,
        vendorId: claim.vendorId,
        oldValue: vendor.status,
        newValue: vendor.status,
        metadata: { reason: "claim_approved" },
      });
    } else {
      await ctx.db.patch(args.claimId, {
        status: "rejected",
        reviewNote: args.reviewNote?.trim() || undefined,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });
      await writeAudit(ctx, {
        action: "listing.claim_rejected",
        actorId: userId,
        vendorId: claim.vendorId,
        entityId: args.claimId,
        newValue: { reviewNote: args.reviewNote?.trim() || "Ditolak" },
      });
    }
    if (args.decision === "verified") {
      await recordEvent(ctx, { event: "listing_published", userId, vendorId: claim.vendorId, metadata: { source: "claim_review" } });
    }
    return args.claimId;
  },
});

export const listClaimStatus = query({
  args: { claimStatus: claimStatusValidator },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    return await ctx.db
      .query("listingClaims")
      .withIndex("byStatus", (q) => q.eq("status", args.claimStatus))
      .collect();
  },
});
