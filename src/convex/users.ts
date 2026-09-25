import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getStaffAccess, requireManagementViewer, requireStaff, requireUser, type StaffRole } from "./access";
import { writeAudit } from "./audit";

/**
 * Read-only user query used by the existing auth UI. Role assignment is never
 * accepted from the client; elevated access is resolved in currentAccess and
 * enforced again by every server mutation.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

const permissionsFor = (role: StaffRole | null) => ({
  canViewAdmin: role !== null,
  canModerate: role === "admin" || role === "staff",
  canManageRoles: role === "admin",
  canArchive: role === "admin" || role === "staff",
  canVerify: role === "admin" || role === "staff",
});

export const currentAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { role: null, isStaff: false, ...permissionsFor(null) };
    const access = await getStaffAccess(ctx, userId);
    return {
      role: access?.role ?? null,
      isStaff: access?.role === "admin" || access?.role === "staff",
      ...permissionsFor(access?.role ?? null),
    };
  },
});

const staffRoleValidator = v.union(
  v.literal("admin"),
  v.literal("staff"),
  v.literal("viewer"),
);

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const hashToken = async (token: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const createToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

export const bootstrapAdministratorAvailable = query({
  args: {},
  handler: async () => ({
    available: Boolean(process.env.STAFF_BOOTSTRAP_EMAILS?.trim()),
  }),
});

/**
 * One-time server-side bootstrap for a fresh deployment. Enable it by setting
 * STAFF_BOOTSTRAP_EMAILS to a comma-separated allowlist in Keys/API keys, then
 * remove it after the first administrator accepts it.
 */
export const bootstrapAdministrator = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const email = normalizeEmail(user?.email ?? "");
    const allowlist = (process.env.STAFF_BOOTSTRAP_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean);
    if (!email || !allowlist.includes(email)) {
      throw new Error("Email ini belum diizinkan untuk bootstrap admin awal");
    }
    const existing = await ctx.db
      .query("staffMembers")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;
    const membershipId = await ctx.db.insert("staffMembers", {
      userId,
      role: "admin",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, { action: "staff.role_changed", actorId: userId, entityId: userId, newValue: "admin", metadata: { source: "bootstrap" } });
    return membershipId;
  },
});

export const createStaffInvite = mutation({
  args: { email: v.string(), role: staffRoleValidator },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, "admin");
    const email = normalizeEmail(args.email);
    if (!email || !email.includes("@")) throw new Error("Masukkan email pengelola yang valid");
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (existingUser) {
      const membership = await ctx.db
        .query("staffMembers")
        .withIndex("byUser", (q) => q.eq("userId", existingUser._id))
        .unique();
      if (membership) throw new Error("Pengguna ini sudah memiliki peran pengelola");
    }
    const token = createToken();
    const now = Date.now();
    const inviteId = await ctx.db.insert("staffInvites", {
      email,
      role: args.role,
      tokenHash: await hashToken(token),
      invitedBy: userId,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      createdAt: now,
    });
    await writeAudit(ctx, { action: "staff.invited", actorId: userId, entityId: inviteId, newValue: `${email}:${args.role}` });
    // The raw code is shown once to the admin. It is never persisted or sent to
    // the browser from a query, so an intercepted query cannot replay it.
    return { inviteId, token, expiresAt: now + 7 * 24 * 60 * 60 * 1000 };
  },
});

export const acceptStaffInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const email = normalizeEmail(user?.email ?? "");
    if (!email || !user?.emailVerificationTime) {
      throw new Error("Verifikasi email terlebih dahulu sebelum menerima undangan");
    }
    const tokenHash = await hashToken(args.token.trim());
    const invite = await ctx.db
      .query("staffInvites")
      .withIndex("byTokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < Date.now()) {
      throw new Error("Kode undangan tidak valid atau sudah kedaluwarsa");
    }
    if (normalizeEmail(invite.email) !== email) {
      throw new Error("Kode undangan ini tidak cocok dengan email akun Anda");
    }
    const existing = await ctx.db
      .query("staffMembers")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { role: invite.role, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("staffMembers", { userId, role: invite.role, createdAt: Date.now(), updatedAt: Date.now() });
    }
    await ctx.db.patch(invite._id, { acceptedAt: Date.now(), acceptedBy: userId });
    await writeAudit(ctx, { action: "staff.invite_accepted", actorId: userId, entityId: invite._id, newValue: invite.role });
    return invite.role;
  },
});

export const changeStaffRole = mutation({
  args: { userId: v.id("users"), role: staffRoleValidator },
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireStaff(ctx, "admin");
    if (args.userId === actorId && args.role !== "admin") {
      throw new Error("Admin tidak dapat menurunkan perannya sendiri");
    }
    const membership = await ctx.db
      .query("staffMembers")
      .withIndex("byUser", (q) => q.eq("userId", args.userId))
      .unique();
    if (!membership) throw new Error("Anggota pengelola tidak ditemukan");
    await ctx.db.patch(membership._id, { role: args.role, updatedAt: Date.now() });
    await writeAudit(ctx, { action: "staff.role_changed", actorId, entityId: args.userId, oldValue: membership.role, newValue: args.role });
    return membership._id;
  },
});

export const revokeStaffInvite = mutation({
  args: { inviteId: v.id("staffInvites") },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, "admin");
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Undangan tidak ditemukan");
    if (invite.acceptedAt) throw new Error("Undangan yang sudah digunakan tidak dapat dicabut");
    await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
    await writeAudit(ctx, { action: "staff.invited", actorId: userId, entityId: invite._id, newValue: "revoked" });
    return args.inviteId;
  },
});

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "admin");
    const rows = await ctx.db.query("staffMembers").collect();
    return Promise.all(rows.map(async (membership) => {
      const user = await ctx.db.get(membership.userId);
      return {
        ...membership,
        name: user?.name ?? "Pengguna",
        email: user?.email ?? "Email belum tersedia",
        emailVerified: Boolean(user?.emailVerificationTime),
      };
    }));
  },
});

export const listStaffInvites = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "admin");
    return await ctx.db.query("staffInvites").collect();
  },
});

export const listAuditLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = await ctx.db.query("auditLogs").collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(args.limit ?? 60, 1), 200))
      .map((row) => ({ ...row, oldValue: row.oldValue, newValue: row.newValue }));
  },
});

export const listListingHistory = query({
  args: { vendorId: v.id("vendors"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Listing tidak ditemukan");
    const access = await getStaffAccess(ctx, userId);
    if (vendor.ownerId !== userId && !access) throw new Error("Riwayat listing tidak dapat diakses");
    const rows = await ctx.db
      .query("listingHistory")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(args.limit ?? 30, 1), 100));
  },
});
