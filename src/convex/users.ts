import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
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

export const currentUserId = query({
  args: {},
  handler: async (ctx) => await getAuthUserId(ctx),
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

/**
 * Masa berlaku undangan. Didefinisikan sekali di sini supaya backend, label
 * di panel admin, dan halaman penerima tidak pernah berbeda pendapat: UI
 * menampilkan `expiresAt` yang dikembalikan server, bukan menulis ulang
 * "48 jam" di tempat lain.
 */
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Status setup ruang pengelola. Tanpa ini, "/admin" menampilkan pesan yang sama
 * untuk dua kondisi yang sangat berbeda: "deployment ini belum punya admin sama
 * sekali" dan "akun Anda bukan staff". Kondisi pertama membuat pengunjung buntu
 * tanpa petunjuk apa pun, karena satu-satunya jalan masuk (bootstrap) masih mati.
 *
 * Query ini sengaja tidak butuh login: halaman /admin tampil untuk tamu juga,
 * dan yang dipublikasikan hanya informasi setup, bukan data pengguna.
 */
/**
 * Daftar email yang boleh menjalankan bootstrap admin awal.
 *
 * Pemisahnya longgar: koma, titik koma, dan whitespace. Dulu hanya koma yang
 * diterima, jadi daftar yang diketik dengan baris baru atau titik koma
 * menjadi satu email raksasa yang tidak akan pernah cocok dengan email
 * siapa pun — allowlist terlihat benar di Keys, tapi tidak pernah berlaku.
 * Huruf besar dan spasi tepi sudah dinormalisasi oleh normalizeEmail.
 */
const bootstrapAllowlist = () =>
  (process.env.STAFF_BOOTSTRAP_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);

export const adminSetupStatus = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("staffMembers").collect();
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    const email = normalizeEmail(user?.email ?? "");
    const allowlist = bootstrapAllowlist();
    const eligible = allowlist.includes(email);
    const bootstrapBlocker: "signedOut" | "noEmail" | "notAllowlisted" | null = !userId
      ? "signedOut"
      : !email
        ? "noEmail"
        : eligible
          ? null
          : "notAllowlisted";
    return {
      staffCount: members.length,
      hasAnyStaff: members.length > 0,
      bootstrapAvailable: Boolean(process.env.STAFF_BOOTSTRAP_EMAILS?.trim()),
      // Hanya tentang akun yang sedang ditanyakan: email-nya sendiri ada atau
      // tidak di daftar. Tidak pernah membocorkan email orang lain, dan hanya
      // dipakai untuk jujur soal tombol pemulihan di /admin.
      bootstrapEligible: eligible,
      // Kenapa tombolnya mati, dibedakan karena sebabnya punya tindakan yang
      // berbeda: akun tamu tidak punya email sama sekali, sedangkan akun
      // beremail hanya salah masuk daftar. Tanpa ini, keduanya terlihat seperti
      // error yang sama padahal tindakan perbaikannya tidak sama.
      bootstrapBlocker,
      // Email akun yang sedang masuk — miliknya sendiri, jadi aman dipamerkan
      // supaya bisa disalin ke daftar yang diizinkan. Inilah aksi nyata untuk
      // kasus "email saya tidak ada di daftar": tanpa ini orang hanya bisa
      // menebak karakter yang salah ketik.
      accountEmail: email || null,
      // URL backend yang benar-benar dipakai. Halaman "/admin" di laptop bisa
      // menunjuk deployment berbeda dari Keys, dan itu yang membuat allowlist
      // yang sudah terlihat benar tetap tidak berlaku.
      deployment: process.env.CONVEX_CLOUD_URL ?? null,
    };
  },
});

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
    const allowlist = bootstrapAllowlist();
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
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("Masukkan email pengelola yang valid");
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
    const expiresAt = now + INVITE_TTL_MS;
    const inviteId = await ctx.db.insert("staffInvites", {
      email,
      role: args.role,
      tokenHash: await hashToken(token),
      invitedBy: userId,
      expiresAt,
      createdAt: now,
    });
    await writeAudit(ctx, {
      action: "admin.invite_created",
      actorId: userId,
      entityId: inviteId,
      newValue: `${email}:${args.role}`,
      metadata: { expiresAt },
    });
    // Token mentah hanya pernah dikembalikan di sini, sekali, ke admin yang
    // sedang membuat undangan. Tidak ada query yang memintanya lagi, jadi
    // siapa pun yang menyadap query tidak bisa memainkannya ulang.
    return { inviteId, token, expiresAt, email, role: args.role };
  },
});

/**
 * Ringkasan undangan untuk halaman penerima. Query publik: orang yang
 * membuktikan diri dengan memegang tautan memang belum punya sesi.
 *
 * Prinsip anti-enumerasi: "tidak ada" dan "sudah dipakai" dan "kedaluwarsa"
 * sengaja menjawab dengan bentuk yang sama persis, `valid: false`. Kalau
 * ketiganya dibedakan, halaman ini jadi alat untuk menebak alamat email mana
 * saja yang sudah terdaftar di sistem — itu sendiri informasi yang tidak layak
 * dibuka ke publik.
 *
 * Yang keluar juga sengaja tidak memuat id baris database, id/internal
 * pengundang, atau hash token. Untuk render cukup email, peran, nama
 * pengundang, dan waktu berakhir.
 */
export const getInviteDetails = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token || token.length > 200) return { valid: false as const, reason: "EXPIRED_OR_INVALID" as const };
    const tokenHash = await hashToken(token);
    const invite = await ctx.db
      .query("staffInvites")
      .withIndex("byTokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < Date.now()) {
      return { valid: false as const, reason: "EXPIRED_OR_INVALID" as const };
    }
    const inviter = await ctx.db.get(invite.invitedBy);
    return {
      valid: true as const,
      email: invite.email,
      role: invite.role,
      // Label tetap, bukan nama pribadi. Admin tidak perlu ikut disebut
      // supaya penerima tahu siapa yang mengangnya.
      invitedByName: "Administrator Sistem",
      inviterPresent: Boolean(inviter),
      expiresAt: invite.expiresAt,
    };
  },
});

/**
 * Menerima undangan sekali klik: membuat akun bila perlu, mengikat peran,
 * lalu menerbitkan sesi aktif dalam satu mutasi.
 *
 * BAHAYA YANG DISENGAJA DAN HARUS DIBAWA PEMIMPIN: alur ini TIDAK memverifikasi
 * kepemilikan email. Yang membuktikan identitas di sini adalah token
 * undangan itu sendiri — 256 bit acak, sekali pakai, berlaku 48 jam, terikat
 * ke satu alamat email, bisa dicabut, dan tercatat di audit. Itu pola
 * "magic link", sah, tapi kekuatannya setara whoever memegang tautannya.
 * Karena itu link hanya boleh dikirim ke alamat yang diundang.
 *
 * Verifikasi email tetap ada di jalur lama (masuk normal lewat OTP). Yang
 * hilang di sini hanya untuk penerima undangan, dan itu konsekuensi langsung
 * dari permintaan "tanpa langkah registrasi manual".
 *
 * Sesi diterbitkan lewat `auth:store` milik Convex Auth sendiri dengan
 * `generateTokens: true` — bukan JWT yang dirakit sendiri. Jadi sesi yang
 * hasilnya persis jenis sesi yang dihasilkan login biasa, termasuk refresh
 * token dan pencatatannya di `authSessions`.
 */
export const acceptStaffInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    const reject = async (reason: string) => {
      // Kegagalan klaim juga masuk audit: tanpa ini, orang yang memindai
      // token tanda tangan tidak terlihat sama sekali.
      await writeAudit(ctx, {
        action: "staff.invite_rejected",
        metadata: { reason, hasToken: Boolean(token) },
      });
      return { ok: false as const, reason };
    };

    if (!token || token.length > 200) return reject("EXPIRED_OR_INVALID");
    const tokenHash = await hashToken(token);
    const invite = await ctx.db
      .query("staffInvites")
      .withIndex("byTokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invite) return reject("EXPIRED_OR_INVALID");
    if (invite.revokedAt || invite.expiresAt < Date.now()) return reject("EXPIRED_OR_INVALID");
    if (invite.acceptedAt) {
      // Balapan: dua klaim datang hampir bersamaan. Yang menang sudah
      // menandai `acceptedAt`, jadi yang kalah harus berhenti di sini. Convex
      // menjalankan mutasi secara serial, jadi tidak ada kasus kedua yang
      // berhasil menembus baris yang sama.
      return reject("ALREADY_ACCEPTED");
    }

    // Kalau pemanggil sudah punya sesi, emailnya harus sama dengan email yang
    // diundang. Ini yang menjaga pengikatan email tetap berarti: orang yang
    // masuk sebagai X tidak bisa memakai undangan milik Y.
    const callerId = await getAuthUserId(ctx);
    if (callerId) {
      const caller = await ctx.db.get(callerId);
      if (normalizeEmail(caller?.email ?? "") !== normalizeEmail(invite.email)) {
        return reject("EMAIL_MISMATCH");
      }
    }

    const email = normalizeEmail(invite.email);
    let userId = (
      await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique()
    )?._id;
    if (userId === undefined) {
      userId = await ctx.db.insert("users", {
        email,
        // emailVerificationTime: alamat ini sudah dibuktikan dengan memegang
        // undangan yang admin kirim ke sana, bukan diketik sendiri.
        emailVerificationTime: Date.now(),
        isAnonymous: false,
      });
    }

    const membership = await ctx.db
      .query("staffMembers")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    if (!membership) {
      await ctx.db.insert("staffMembers", {
        userId,
        role: invite.role,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else if (membership.role !== invite.role) {
      if (membership.role === "admin" && invite.role !== "admin") {
        return reject("CANNOT_DEMOTE_ADMIN");
      }
      await ctx.db.patch(membership._id, { role: invite.role, updatedAt: Date.now() });
    }

    await ctx.db.patch(invite._id, { acceptedAt: Date.now(), acceptedBy: userId });
    await writeAudit(ctx, {
      action: "staff.invite_accepted",
      actorId: userId,
      entityId: invite._id,
      newValue: invite.role,
      metadata: { email, via: "invite_link" },
    });

    // Terbitkan sesi. `createNewAndDeleteExistingSession` di dalam auth hanya
    // menghapus sesi milik pemanggil saat ini; pemanggil di sini belum punya
    // sesi, jadi tidak ada sesi lain yang ikut hilang.
    const minted = (await ctx.runMutation(internal.auth.store, {
      args: { type: "signIn" as const, userId, generateTokens: true },
    })) as unknown as { tokens: { token: string; refreshToken: string } | null } | undefined;

    const tokens = minted?.tokens ?? null;
    if (!tokens) {
      // Akun dan peran sudah tercatat, jadi tidak ada setengah jadi yang
      // tidak terlihat oleh admin. Yang gagal cuma penerbitan sesi; penerima
      // bisa menerima ulang lewat OTP biasa.
      await writeAudit(ctx, {
        action: "staff.invite_rejected",
        actorId: userId,
        entityId: invite._id,
        metadata: { reason: "SESSION_MINT_FAILED", email },
      });
      return { ok: false as const, reason: "SESSION_MINT_FAILED" as const, role: invite.role };
    }
    return { ok: true as const, role: invite.role, email, tokens };
  },
});

/**
 * Akun pemilik. Perannya hanya boleh diubah oleh dirinya sendiri.
 *
 * Daftar ini sengaja pendek dan tinggal di satu tempat supaya mudah ditinjau:
 * menambah nama berarti menambah satu baris di sini, bukan Menambah kondisi
 * baru yang tersembunyi di beberapa tempat.
 */
const OWNER_ACCOUNT_EMAILS = new Set(["qoidrifat23@gmail.com"]);

function isOwnerAccount(email: string | null | undefined): boolean {
  return OWNER_ACCOUNT_EMAILS.has((email ?? "").trim().toLowerCase());
}

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
    if (membership.role !== args.role) {
      const target = await ctx.db.get(args.userId);
      // Dilarang oleh siapa pun selain pemiliknya sendiri. Perbandingan memakai
      // id, bukan email, jadi akun yang dihapus lalu dibuat ulang dengan email
      // sama tidak mewarisi perlindungan ini.
      //
      // Penolakan ini sengaja dikembalikan, bukan dilempar. Melempar akan
      // membatalkan seluruh transaksi, termasuk pencatatan audit-nya — dan
      // percobaan mengubah peran akun pemilik justru salah satu hal yang
      // paling perlu terlihat di log.
      if (args.userId !== actorId && isOwnerAccount(target?.email)) {
        await writeAudit(ctx, {
          action: "staff.role_change_blocked",
          actorId,
          entityId: args.userId,
          oldValue: membership.role,
          newValue: args.role,
          metadata: { reason: "OWNER_ACCOUNT" },
        });
        return {
          ok: false as const,
          reason: "OWNER_ACCOUNT_PROTECTED" as const,
          message: "Peran akun pemilik hanya dapat diubah oleh pemilik akun tersebut",
        };
      }
    }
    await ctx.db.patch(membership._id, { role: args.role, updatedAt: Date.now() });
    await writeAudit(ctx, { action: "staff.role_changed", actorId, entityId: args.userId, oldValue: membership.role, newValue: args.role });
    return { ok: true as const, membershipId: membership._id };
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
    const { userId: actorId } = await requireStaff(ctx, "admin");
    const rows = await ctx.db.query("staffMembers").collect();
    return Promise.all(rows.map(async (membership) => {
      const user = await ctx.db.get(membership.userId);
      return {
        ...membership,
        name: user?.name ?? "Pengguna",
        email: user?.email ?? "Email belum tersedia",
        emailVerified: Boolean(user?.emailVerificationTime),
        // Dihitung dari server memakai aturan yang sama persis dengan mutasi
        // ubah peran. Daftar akun pemilik hanya ada di satu tempat; kalau
        // aturan ini ikut disalin ke klien, cepat atau lambat keduanya
        // berbeda pendapat.
        roleLocked: membership.userId !== actorId && isOwnerAccount(user?.email),
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

export const listRecentListingHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = await ctx.db.query("listingHistory").collect();
    const recent = rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(args.limit ?? 40, 1), 100));
    return Promise.all(recent.map(async (row) => ({
      ...row,
      vendorName: (await ctx.db.get(row.vendorId))?.name ?? "Listing",
    })));
  },
});
