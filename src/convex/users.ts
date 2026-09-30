import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { denied, getStaffAccess, requireManagementViewer, requireStaff, requireUser, type StaffRole } from "./access";
import { writeAudit } from "./audit";
import { isOwnerAccount } from "../lib/owner-account";
import { imageRejection } from "../lib/image-upload";
import { resolveDisplayName, sanitizeDisplayName } from "../lib/display-name";

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

const permissionsFor = (role: StaffRole | null) => ({  canViewAdmin: role !== null,
  canModerate: role === "admin" || role === "staff",
  canManageRoles: role === "admin",
  canArchive: role === "admin" || role === "staff",
  canVerify: role === "admin" || role === "staff",
});

export const currentUserId = query({
  args: {},
  handler: async (ctx) => await getAuthUserId(ctx),
});

/* ------------------------------------------------------------------ */
/* Profil pengelola                                                   */
/* ------------------------------------------------------------------ */

const MAX_PROFILE_NAME_LENGTH = 80;

/**
 * Aturan jenis dan ukuran foto tinggal di `@/lib/image-upload` supaya klien dan
 * server memakai kalimat yang sama persis. Di sini hanya diteruskan, bukan
 * ditulis ulang — dua salinan aturan berarti dua kesempatan untuk berbeda.
 *
 * `isStoredImage` tetap diekspor dari modul ini karena sudah dipakai test;
 * yang diekspor adalah fungsi yang sama, bukan salinannya.
 *
 * Aturan yang sama juga dipakai foto listing (`community.ts`), jadi unggahan
 * tanpa header `Content-Type` ditolak di kedua tempat dengan alasan yang sama.
 */
export { isStoredImage } from "../lib/image-upload";

/**
 * Profil pengelola yang sedang masuk, siap ditampilkan.
 *
 * `imageUrl` dihitung server dari storage id. Ini satu-satunya alasan field ini
 * ada: storage id tidak boleh bocor ke klien, dan klien juga tidak boleh
 * menebak-nebak apakah `image` berisi URL penyedia OAuth atau storage milik kit
 * sendiri. Kalau baris storage-nya sudah hilang, hasilnya `null` — bukan URL rusak.
 */
export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const access = await getStaffAccess(ctx, userId);
    return {
      name: user.name ?? "",
      email: user.email ?? "",
      imageUrl: user.profileImageStorageId
        ? ((await ctx.storage.getUrl(user.profileImageStorageId)) ?? null)
        : null,
      hasImage: Boolean(user.profileImageStorageId),
      role: access?.role ?? null,
      updatedAt: user.profileUpdatedAt ?? null,
    };
  },
});

/**
 * URL sekali pakai untuk mengunggah foto profil.
 *
 * Mutation terpisah dari `updateMyProfile` karena unggahan harus lewat HTTP
 * `POST` ke storage, sementara patch profil lewat mutation biasa. Yang
 * dijaga di sini hanya satu: storage id yang dihasilkan HANYA boleh dipasang
 * ke baris `users` milik pemanggil, lewat `updateMyProfile`.
 */
export const generateProfileUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Simpan nama dan foto profil.
 *
 * Batasannya sengaja dibuat di server, bukan hanya di UI:
 *  - Nama diktrim dan dipotong; input 5.000 karakter akan disimpan utuh kalau
 *    tidak dipotong, dan setiap panel yang menampilkannya ikut melebar.
 *  - File dicek dari metadata storage SEBELUM patch. Metriksanya dibaca dari
 *    storage, bukan dari `File` yang dikirim klien, karena nama file dan
 *    `type` di sisi klien bisa dipalsukan.
 *  - Email tidak bisa diubah dari sini. Mengganti email adalah urusan reset
 *    password dan verifikasi ulang; membiarkan field itu terbuka di panel
 *    profil hanya menciptakan akun yang tidak bisa masuk lagi.
 */
export const updateMyProfile = mutation({
  args: {
    name: v.string(),
    imageStorageId: v.optional(v.string()),
    removeImage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = args.name.trim().replace(/\s+/g, " ").slice(0, MAX_PROFILE_NAME_LENGTH);
    if (name.length < 2) throw new Error("Nama profil minimal 2 karakter");

    const current = await ctx.db.get(userId);
    const previousStorageId = current?.profileImageStorageId;
    let nextStorageId: string | undefined = previousStorageId;

    if (args.removeImage) {
      nextStorageId = undefined;
    } else if (args.imageStorageId) {
      const metadata = await ctx.db.system.get("_storage", args.imageStorageId as never);
      if (!metadata) throw new Error("Foto profil tidak ditemukan");
      // Satu aturan, satu kalimat — sama persis dengan yang ditampilkan klien
      // sebelum berkasnya diunggah. Ukuran dan jenisnya dibaca dari metadata
      // storage, bukan dari `File` di peramban.
      const rejection = imageRejection({
        size: metadata.size,
        contentType: metadata.contentType,
      });
      if (rejection) throw new Error(rejection);
      nextStorageId = args.imageStorageId;
    }

    await ctx.db.patch(userId, {
      name,
      profileImageStorageId: nextStorageId,
      profileUpdatedAt: Date.now(),
    });

    // Berkas lama dihapus setelah patch berhasil. Kalau lebih dulu, kegagalan
    // patch akan membuat foto lama hilang tanpa ada yang menggantinya.
    if (previousStorageId && previousStorageId !== nextStorageId) {
      try {
        await ctx.storage.delete(previousStorageId);
      } catch {
        // Berkas sudah hilang atau masih dirujuk. Bukan alasan gagalkan simpan.
      }
    }

    await writeAudit(ctx, {
      action: "admin.profile_updated",
      metadata: {
        nameChanged: name !== (current?.name ?? ""),
        photoChanged: previousStorageId !== nextStorageId,
      },
    });

    return {
      ok: true as const,
      name,
      imageUrl: nextStorageId
        ? ((await ctx.storage.getUrl(nextStorageId)) ?? null)
        : null,
    };
  },
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
 * Nama tampilan publik milik pemanggil.
 *
 * Query ini HANYA untuk sesi pemilik. Mengembalikan nama orang lain dari sini
 * hanya membuka enumerasi yang F-05 sedang tutup.
 */
export const myDisplayName = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const doc = (await ctx.db.get(userId)) as {
      publicName?: string;
      email?: string;
    } | null;
    return {
      publicName: doc?.publicName ?? null,
      // Yang SEDANG tampil, supaya UI bisa memakai nilai itu sebagai awal
      // isian tanpa menebak sendiri di browser.
      current: resolveDisplayName(doc?.publicName, doc?.email),
    };
  },
});

/**
 * Menyimpan tebakan turunan SEKALI, lalu tidak pernah menimpanya lagi.
 *
 * Kenapa mutation dan bukan ditulis di dalam query: query Convex tidak boleh
 * menulis, jadi cache harus hidup di jalur yang boleh. Dipanggil sekali
 * setelah pengguna masuk - itulah yang membuat nama stabil antar pembacaan
 * tanpa melanggar batasan itu.
 *
 * Kenapa nilai yang ada tidak ditimpa: tebakan pertama harus stabil. Kalau
 * setiap panggilan menghitung ulang, nama di papan berubah setiap kali aturan
 * turunan berubah, dan koreksi pengguna hilang tanpa jejak.
 */
export const ensureMyDisplayName = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const doc = (await ctx.db.get(userId)) as {
      publicName?: string;
      email?: string;
    } | null;
    if (!doc) return null;
    if (doc.publicName) return doc.publicName;
    const derived = resolveDisplayName(undefined, doc.email);
    // Fallback tidak disimpan: `Warga Sumenep` yang tersimpan akan membekukan
    // akun yang email-nya baru saja terkirim.
    if (derived === "Warga Sumenep") return derived;
    await ctx.db.patch(userId, { publicName: derived });
    return derived;
  },
});

/**
 * Koreksi eksplisit oleh pengguna.
 *
 * Inilah yang membuat aturan turunan boleh gagal dengan jujur. Tanpa jalur ini,
 * `ahmanuddinfirman92@gmail.com` akan selamanya tampil sebagai
 * "Ahmanuddinfirman" dan tidak ada jalan keluar selain mengganti email.
 */
export const setMyDisplayName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const cleaned = sanitizeDisplayName(args.name);
    if (!cleaned) return denied("Nama tampilan minimal 2 huruf.");
    if (cleaned !== args.name.trim()) {
      // Dijawab dengan nilai yang benar-benar dipakai, bukan ditolak diam-diam
      // supaya pengguna tidak menebak apa yang salah.
      return denied(`Nama tampilan itu tidak bisa dipakai. Coba: ${cleaned}`);
    }
    await ctx.db.patch(userId, { publicName: cleaned });
    return cleaned;
  },
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

/**
 * Audit log terbaru, diperkaya untuk panel admin.
 *
 * Nama, email, dan peran PELAKU diambil ulang dari `users`/`staffMembers` saat
 * dibaca, bukan hanya dari snapshot yang tersimpan saat kejadian. Snapshot saja
 * tidak cukup untuk baris lama: kolom itu baru ada belakangan, jadi semua
 * baris yang tertulis sebelumnya akan tampil sebagai "Tanpa pelaku" yang
 * permanen — persis baris yang paling sering ditanyakan.
 *
 * Snapshot tetap dipakai sebagai cadangan kalau akunnya sudah dihapus, karena
 * "pernah bernama siapa" lebih berharga daripada "sekarang tidak ada".
 */
export const listAuditLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const take = Math.min(Math.max(args.limit ?? 60, 1), 200);
    // Ambil HANYA sebanyak yang ditampilkan, lewat indeks `byCreatedAt` urut
    // turun. Sebelumnya seluruh tabel dibaca lalu dipotong di memori: satu kali
    // buka panel = membaca sampai 2.000 dokumen (batas retensi) untuk
    // menampilkan 60. Sekarang 60.
    const recent = await ctx.db
      .query("auditLogs")
      .withIndex("byCreatedAt")
      .order("desc")
      .take(take);
    // Foto pelaku ikut disinkronkan saat dibaca, dengan alasan yang sama seperti
    // nama dan email di atas. Membedanya: blob foto lama SELALU dihapus begitu
    // diganti (lihat `updateMyProfile`), jadi menyimpan id fotonya di baris
    // audit hanya akan menghasilkan URL mati. Yang bisa sinkron realtime adalah
    // foto TERKINI milik akun itu — dan query reaktif menjalankan ulang
    // pembacaan ini begitu baris `users`-nya berubah, tanpa muat ulang halaman.
    // Aktor yang sama pada banyak baris dibaca sekali saja per panggilan; satu
    // admin yang menulis 80 baris berarti 3 pembacaan, bukan 240.
    const actorCache = new Map<
      string,
      { name?: string; email?: string; role?: string; imageUrl?: string; isOwner?: boolean }
    >();
    const actorOf = async (actorId: DataModel["users"]["document"]["_id"]) => {
      const cached = actorCache.get(actorId);
      if (cached) return cached;
      const [user, membership] = await Promise.all([
        ctx.db.get(actorId),
        ctx.db
          .query("staffMembers")
          .withIndex("byUser", (q) => q.eq("userId", actorId))
          .unique(),
      ]);
      const resolved = {
        name: user?.name ?? undefined,
        email: user?.email ?? undefined,
        role: membership?.role ?? undefined,
        // `getUrl` mengembalikan null kalau baris storage-nya sudah hilang;
        // hasilnya tanpa foto, bukan URL rusak yang gagal dimuat.
        imageUrl: user?.profileImageStorageId
          ? ((await ctx.storage.getUrl(user.profileImageStorageId as never)) ?? undefined)
          : undefined,
        // Dihitung server dengan aturan yang sama dengan gerbang passcode.
        // Klien tidak pernah menentukan sendiri siapa akun pemilik — sama
        // seperti `roleLocked` pada `listStaff`.
        isOwner: isOwnerAccount(user?.email),
      };
      actorCache.set(actorId, resolved);
      return resolved;
    };
    const enriched = await Promise.all(
      recent.map(async (row) => {
        if (!row.actorId) {
          return {
            ...row,
            actorName: row.actorName,
            actorEmail: row.actorEmail,
            actorRole: row.actorRole,
            actorImageUrl: undefined,
            actorIsOwnerAccount: false,
          };
        }
        const actor = await actorOf(row.actorId);
        return {
          ...row,
          actorName: actor.name ?? row.actorName,
          actorEmail: actor.email ?? row.actorEmail,
          actorRole: actor.role ?? row.actorRole,
          actorImageUrl: actor.imageUrl,
          actorIsOwnerAccount: actor.isOwner ?? false,
        };
      }),
    );
    return enriched.map((row) => ({ ...row, oldValue: row.oldValue, newValue: row.newValue }));
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
    // Indeks `byVendor` sudah terurut naik menurut `createdAt`, jadi urutan
    // turun tidak perlu menyortir seluruh riwayat listing ini di memori.
    return await ctx.db
      .query("listingHistory")
      .withIndex("byVendor", (q) => q.eq("vendorId", args.vendorId))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 30, 1), 100));
  },
});

export const listRecentListingHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const recent = await ctx.db
      .query("listingHistory")
      .withIndex("byCreatedAt")
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 40, 1), 100));
    return Promise.all(recent.map(async (row) => ({
      ...row,
      vendorName: (await ctx.db.get(row.vendorId))?.name ?? "Listing",
    })));
  },
});
