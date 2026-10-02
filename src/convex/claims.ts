import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getStaffAccess, requireManagementViewer, requireStaff, requireUser } from "./access";
import { writeAudit } from "./audit";
import { recordEvent } from "./analytics";
import { notifyReviewers } from "./community";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { preparePhone, readStoredPhone } from "./phoneVault";
import { maskPhoneForAdmin } from "../lib/phone-crypto";

const MAX_EVIDENCE_BYTES = 1_000_000;

async function validateEvidenceFile(
  ctx: GenericMutationCtx<DataModel>,
  storageId: string | undefined,
) {
  if (!storageId) return;
  const metadata = await ctx.db.system.get("_storage", storageId as never);
  if (!metadata) throw new Error("Bukti klaim tidak ditemukan");
  if (metadata.size > MAX_EVIDENCE_BYTES) throw new Error("Bukti klaim maksimal 1 MB");
  if (metadata.contentType && !metadata.contentType.startsWith("image/")) {
    throw new Error("Bukti klaim harus berupa foto");
  }
}

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
    if (phone.length < 10 || phone.length > 15 || !/^\S+@\S+\.\S+$/.test(email) || address.length < 5 || address.length > 300) {
      throw new Error("Nomor WhatsApp, email, dan alamat usaha wajib diisi dengan benar");
    }
    await validateEvidenceFile(ctx, args.evidenceStorageId);
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
    // FASE 16 - nomor claimant adalah PII warga, jadi disimpan dalam bentuk
    // terenkripsi dan TIDAK PERNAH masuk ke audit log polos. Yang masuk ke
    // audit cuma bentuk tersamarnya: audit dibaca pengelola dan sering ikut
    // diekspor, jadi nomor mentah di sana berarti PII bocor ke tempat yang
    // justru paling lama menyimpannya.
    const storedPhone = await preparePhone(phone);
    const claimId = await ctx.db.insert("listingClaims", {
      vendorId: args.vendorId,
      requesterId: userId,
      whatsappPhoneEnc: storedPhone.enc,
      whatsappPhoneKey: storedPhone.key,
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
      newValue: { email, whatsappPhoneMasked: maskPhoneForAdmin(phone) },
    });
    // Kabari pengelola seketika: tanpa ini, klaim hanya diam di daftar sampai
    // admin kebetulan membuka tab tersebut.
    await notifyReviewers(ctx, {
      kind: "review.claim_pending",
      title: "Klaim listing baru",
      body: `${vendor.name} diklaim oleh ${email}. Periksa bukti usaha sebelum menyetujui.`,
      vendorId: args.vendorId,
    });
    return claimId;
  },
});

// Public roadmap name kept alongside the descriptive internal name used by
// older clients. Both references point to the same server mutation.
export const claimVendorListing = submitVendorClaim;

export const listVendorClaims = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    const access = await getStaffAccess(ctx, userId);
    const claims = await ctx.db
      .query("listingClaims")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    if (access || vendor.ownerId === userId) return claims;
    const ownClaims = claims.filter((claim) => claim.requesterId === userId);
    if (ownClaims.length === 0) throw new Error("Klaim listing tidak dapat diakses");
    return ownClaims;
  },
});

export const listPendingClaims = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);
    const claims = await ctx.db
      .query("listingClaims")
      .withIndex("byStatus", (q) => q.eq("status", "pending"))
      .collect();
    return Promise.all(claims.map(async (claim) => {
      const vendor = await ctx.db.get(claim.vendorId);
      const requester = await ctx.db.get(claim.requesterId);
      return {
        ...claim,
        vendorName: vendor?.name,
        vendorSlug: vendor?.slug,
        requesterName: requester?.name,
        requesterEmail: requester?.email,
        evidenceUrl: claim.evidenceStorageId ? await ctx.storage.getUrl(claim.evidenceStorageId) : undefined,
      };
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
        verified: true,
        updatedAt: now,
      });
      await writeAudit(ctx, {
        action: "listing.claim_approved",
        actorId: userId,
        vendorId: claim.vendorId,
        entityId: args.claimId,
        newValue: { ownerAssigned: true },
      });
      if (!vendor.verified) {
        await writeAudit(ctx, {
          action: "listing.verified",
          actorId: userId,
          vendorId: claim.vendorId,
          oldValue: false,
          newValue: true,
          metadata: { source: "claim_review" },
        });
      }
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

/**
 * Klaim milik pengguna yang sedang login, lengkap dengan nama listing-nya.
 * Inilah sumber kebenaran untuk kartu "status identitas" di Dashboard.
 */
export const listMyClaims = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const claims = await ctx.db
      .query("listingClaims")
      .withIndex("byRequester", (q) => q.eq("requesterId", userId))
      .collect();
    return await Promise.all(
      claims.map(async (claim) => {
        const vendor = await ctx.db.get(claim.vendorId);
        return {
          _id: claim._id,
          vendorId: claim.vendorId,
          status: claim.status,
          reviewNote: claim.reviewNote,
          // Claimant berhak melihat nomornya sendiri; itu datanya. Yang
          // kembali ke panel admin DISAMARK di `listClaimStatus` di bawah.
          whatsappPhone: await readStoredPhone(
            claim.whatsappPhoneEnc,
            claim.whatsappPhone,
          ),
          businessAddress: claim.businessAddress,
          createdAt: claim.createdAt,
          reviewedAt: claim.reviewedAt,
          vendorName: vendor?.name ?? "Listing tidak ditemukan",
          vendorStatus: vendor?.status ?? "archived",
        };
      }),
    );
  },
});

export const listClaimStatus = query({
  args: { claimStatus: claimStatusValidator },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const claims = await ctx.db
      .query("listingClaims")
      .withIndex("byStatus", (q) => q.eq("status", args.claimStatus))
      .collect();

    // FASE 16 - DTO EKSPLISIT, bukan spread baris utuh.
    //
    // Versi sebelumnya mengembalikan dokumen `listingClaims` apa adanya. Setelah
    // kolom enkripsi ditambahkan, spread itu otomatis ikut membawa
    // `whatsappPhoneEnc` (ciphertext) dan `whatsappPhoneKey` (kunci HMAC
    // pencarian) ke peramban pengelola - dua-duanya tidak ada gunanya di sana dan
    // keduanya tidak boleh masuk ke state klien.
    //
    // Nomor ditampilkan TERSAMAR. Admin melihat nomor penuh karena klaim
    // memang butuh verifikasi; bentuk tersamar tetap memungkinkan verifikasi
    // (pengelola bisa cocokkan dengan catatan offline) tanpa menjadikan panel
    // admin sebagai tempat nomor warga menumpuk.
    return await Promise.all(
      claims.map(async (claim) => {
        const requester = await ctx.db.get(claim.requesterId);
        const vendor = await ctx.db.get(claim.vendorId);
        const phone = await readStoredPhone(claim.whatsappPhoneEnc, claim.whatsappPhone);
        return {
          _id: claim._id,
          vendorId: claim.vendorId,
          requesterId: claim.requesterId,
          status: claim.status,
          reviewNote: claim.reviewNote,
          businessAddress: claim.businessAddress,
          evidenceStorageId: claim.evidenceStorageId,
          email: claim.email,
          createdAt: claim.createdAt,
          updatedAt: claim.updatedAt,
          whatsappPhone: phone ? maskPhoneForAdmin(phone) : "",
          vendorName: vendor?.name ?? "Listing tidak ditemukan",
          requesterName: requester?.name ?? "Warga",
          requesterEmail: claim.email,
        };
      }),
    );
  },
});
