import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export type StaffRole = "admin" | "staff" | "viewer";
export type StaffAccess = {
  userId: DataModel["users"]["document"]["_id"];
  role: StaffRole;
};

type Context = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

/**
 * Resolve permissions exclusively from server-side records. A normal Auth user
 * is deliberately not privileged just because they have a client-side URL or
 * a role posted by the browser. Legacy admin/staff rows remain supported for
 * an existing deployment, but all new role assignments use staffMembers.
 */
export async function getStaffAccess(ctx: Context, userId: DataModel["users"]["document"]["_id"]): Promise<StaffAccess | null> {
  const membership = await ctx.db
    .query("staffMembers")
    .withIndex("byUser", (q) => q.eq("userId", userId))
    .unique();
  if (membership?.role === "admin" || membership?.role === "staff" || membership?.role === "viewer") {
    return { userId, role: membership.role };
  }

  // Backwards-compatible migration path for databases that were provisioned
  // before staffMembers existed. Ordinary Auth roles (member/user) never grant
  // administrative access.
  const user = await ctx.db.get(userId);
  if (user?.role === "admin" || user?.role === "staff") {
    return { userId, role: user.role };
  }
  return null;
}

export async function requireUser(ctx: Context) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Masuk untuk menggunakan fitur Buku Kerja");
  return userId;
}

export async function requireStaff(ctx: Context, minimum: "staff" | "admin" = "staff") {
  const userId = await requireUser(ctx);
  const access = await getStaffAccess(ctx, userId);
  if (!access || (minimum === "admin" && access.role !== "admin")) {
    throw new Error(minimum === "admin" ? "Hanya admin yang dapat melakukan tindakan ini" : "Hanya pengelola yang dapat melakukan tindakan ini");
  }
  return access;
}

export async function requireManagementViewer(ctx: Context) {
  const userId = await requireUser(ctx);
  const access = await getStaffAccess(ctx, userId);
  if (!access) throw new Error("Hanya pengelola yang dapat mengakses data ini");
  return access;
}

export async function requireVendorManager(
  ctx: Context,
  vendor: DataModel["vendors"]["document"] | null,
) {
  const userId = await requireUser(ctx);
  if (!vendor) throw new Error("Listing tidak ditemukan");
  const access = await getStaffAccess(ctx, userId);
  if (vendor.ownerId !== userId && !access) {
    throw new Error("Hanya pemilik listing atau pengelola yang dapat mengubah data ini");
  }
  return { userId, access };
}
