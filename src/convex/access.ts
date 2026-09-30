import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export type StaffRole = "admin" | "staff" | "viewer";
export type StaffAccess = {
  userId: DataModel["users"]["document"]["_id"];
  role: StaffRole;
};

type Context = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

/**
 * Penolakan yang aman dikirim ke pemanggil.
 *
 * KENAPA `ConvexError` DAN BUKAN `Error` (hasil audit Fase 9):
 * error internal yang tidak tertangkap dikembalikan Convex sebagai "Server
 * Error" yang memuat stack trace beserta path sumber, misalnya
 * `at handler (../src/convex/vendors.ts:312:34)`. Itu bocor struktur internal
 * ke siapa pun yang tahu nama fungsi, termasuk pemanggil tanpa sesi. Buktinya
 * ada di `tmp/qa-p9-public-surface-evidence.json` dan di regression test
 * `src/convex/security-surface.test.ts`.
 *
 * `ConvexError` adalah jalur "kesalahan pemanggil": pesannya sampai ke klien
 * tanpa stack trace. PESANNYA SENDIRI TIDAK DIUBAH, jadi setiap test yang
 * menolak lewat `rejects.toThrow` tetap cocok dan UI tetap menampilkan
 * kalimat yang sama.
 */
export function denied(message: string): never {
  throw new ConvexError(message);
}

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
  if (!userId) denied("Masuk untuk menggunakan fitur Buku Kerja");
  await assertSessionNotRevoked(ctx);
  return userId;
}

/**
 * Menolak sesi yang sudah dicabut admin dari Security Desk.
 *
 * Kenapa ini perlu ada, dan kenapa tidak cukup dengan menghapus sesi:
 * access token Convex Auth adalah JWT stateless yang sudah terbit dan tetap
 * sah sampai `exp`-nya (1 jam), apa pun yang terjadi di database. Satu-satunya
 * cara menolak seketika adalah memeriksa daftar cabut di setiap permintaan.
 *
 * Id sesinya dibaca dari JWT yang ditandatangani server lewat
 * `getAuthSessionId`, tidak pernah dari klien — jadi daftar ini tidak bisa
 * diisi dengan nilai palsu untuk membebaskan sesi orang lain.
 *
 * Pesannya sengaja memakai `code` terstruktur supaya sisi klien bisa
 * membedakan "sesi dicabut" dari "belum masuk" dan langsung mengeluarkan
 * perangkat ke `/auth`, alih-alih menampilkan error generik.
 */
async function assertSessionNotRevoked(ctx: Context) {
  const sessionId = await getAuthSessionId(ctx);
  if (!sessionId) return;
  const revoked = await ctx.db
    .query("revokedAdminSessions")
    .withIndex("bySession", (q) => q.eq("sessionId", sessionId))
    .unique();
  if (!revoked) return;
  throw new ConvexError({
    code: "SESSION_REVOKED",
    message: "Sesi Anda telah diakhiri oleh admin dari perangkat lain.",
  });
}

export async function requireStaff(ctx: Context, minimum: "staff" | "admin" = "staff") {
  const userId = await requireUser(ctx);
  const access = await getStaffAccess(ctx, userId);
  if (!access || (minimum === "admin" && access.role !== "admin") || (minimum === "staff" && access.role === "viewer")) {
    denied(minimum === "admin" ? "Hanya admin yang dapat melakukan tindakan ini" : "Hanya pengelola yang dapat melakukan tindakan ini");
  }
  return access;
}

export async function requireManagementViewer(ctx: Context) {
  const userId = await requireUser(ctx);
  const access = await getStaffAccess(ctx, userId);
  if (!access) denied("Hanya pengelola yang dapat mengakses data ini");
  return access;
}

export async function requireVendorManager(
  ctx: Context,
  vendor: DataModel["vendors"]["document"] | null,
) {
  const userId = await requireUser(ctx);
  if (!vendor) denied("Listing tidak ditemukan");
  const access = await getStaffAccess(ctx, userId);
  if (access?.role === "viewer") denied("Viewer hanya dapat melihat data");
  if (vendor.ownerId !== userId && !access) {
    denied("Hanya pemilik listing atau pengelola yang dapat mengubah data ini");
  }
  return { userId, access };
}

/**
 * Mengelola listing butuh identitas yang sudah dibuktikan manusia: satu klaim
 * yang disetujui admin, lengkap dengan nomor WhatsApp, email, alamat usaha, dan
 * foto bukti. Tanpa ini siapa pun bisa memasang nomor orang lain lalu mengelola
 * listing dengan identitas itu.
 *
 * Verifikasi lewat kode OTP sengaja tidak dipakai. Nomor WhatsApp belonging
 * meta tidak bisa diverifikasi tanpa template resmi Meta, dan akun bisnis yang
 * belum verifikasi tidak boleh membuat template — jadi gerbang itu akan selalu
 * menolak semua orang. Klaim yang disetujui admin lebih sah dan tidak menambah
 * ketergantungan berbayar.
 *
 * Pengelola (admin/staff) tetap boleh, karena mereka bertindak atas nama
 * komunitas, bukan atas nama akun pribadi.
 *
 * `vendor` yang masih draft milik sendiri tetap boleh disunting, supaya
 * pemilik bisa memperbaiki data sebelum klaimnya disetujui. Draft tidak pernah
 * tampil di katalog publik, jadi mengeditnya tidak memberi hak apa pun atas
 * listing orang lain.
 */
export async function requireProvenIdentity(
  ctx: Context,
  userId: DataModel["users"]["document"]["_id"],
  vendor?: { ownerId?: DataModel["vendors"]["document"]["ownerId"]; status?: string } | null,
) {
  if (await getStaffAccess(ctx, userId)) return;
  if (vendor && vendor.ownerId === userId && vendor.status === "draft") return;
  const claims = await ctx.db
    .query("listingClaims")
    .withIndex("byRequester", (q) => q.eq("requesterId", userId))
    .collect();
  const approved = claims.find((claim) => claim.status === "verified");
  if (!approved) {
    denied(
      "Ajukan klaim listing dengan bukti usaha di Dashboard, tunggu admin memverifikasi, lalu Anda boleh mengelola listing",
    );
  }
  return approved.whatsappPhone;
}
