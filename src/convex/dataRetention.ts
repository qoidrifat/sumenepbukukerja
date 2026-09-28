import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

/**
 * Retensi data yang tumbuh sendiri.
 *
 * Audit 2026-09-28 menemukan bahwa ~98% dokumen di database ini BUKAN data
 * aplikasi. Isinya: 791 `authRefreshTokens`, 330 `users` (327 di antaranya
 * anonim), 330 `authAccounts`, 328 `authSessions` — dibanding 35 `auditLogs`,
 * 17 `errorReports`, dan 6 `vendors`.
 *
 * Akun anonim dibuat ~81 kali sehari. Setiap penanda tangan anonim menulis
 * sekitar 5 dokumen (user + account + session + refresh token), jadi ~437
 * dokumen per hari atau ~160.000 per tahun, dari satu tombol yang ditekan di
 * halaman yang tidak seorang pun핀往来.
 *
 * Sumbernya di luar kendali aplikasi: `src/convex/auth.ts` mendaftarkan
 * penyedia `Anonymous` dan file itu BEKU, dan tidak ada satu pun baris
 * `signIn("anonymous")` di `src/` — itu dikunci oleh `auth-entrypoints.test.ts`.
 * Jadi pemanggilnya berasal dari luar source kita, dan satu-satunya cara
 *_membersihkan-nya adalah offendmembersihkannya.
 *
 * Syaratnya sengaja konservatif: hanya akun tanpa email, sudah tua, dan tidak
 * memiliki apa pun. Akun yang masih punya listing, peran, atau Manager akan
 * dilewati apa pun usianya.
 */

const DAY = 24 * 60 * 60_000;

/** Batas yang dipakai. Diekspor supaya tes bisa mengunci angkanya. */
export const RETENTION_LIMITS = {
  anonymousDays: 7,
  auditKeepLatest: 2_000,
  auditDays: 180,
  errorReportKeepLatest: 500,
  errorReportDays: 90,
} as const;

/**
 * Apakah akun ini memiliki sesuatu yang tidak boleh hilang?
 *
 * Pertanyaan "bolehkah dihapus?", jadi dijawab fail-closed: kalau ada satu saja
 * yang tidak bisa dipastikan, akunnya DISISIKAN. Salah menghapus akun yang
 * masih punya listing berarti data hilang permanen; menyisakan satu akun
 * anonim berarti satu baris yang tidak berarti apa-apa.
 */
async function ownsSomething(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
): Promise<boolean> {
  const checks = await Promise.all([
    ctx.db.query("staffMembers").withIndex("byUser", (q) => q.eq("userId", userId)).first(),
    ctx.db.query("vendors").withIndex("byOwner", (q) => q.eq("ownerId", userId)).first(),
    ctx.db
      .query("serviceRequests")
      .withIndex("byRequester", (q) => q.eq("requesterId", userId))
      .first(),
    ctx.db
      .query("vendorInteractions")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .first(),
    ctx.db.query("favorites").withIndex("byUser", (q) => q.eq("userId", userId)).first(),
    ctx.db
      .query("listingClaims")
      .withIndex("byClaimant", (q) => q.eq("claimantId", userId))
      .first(),
    ctx.db
      .query("reports")
      .withIndex("byReporter", (q) => q.eq("reporterId", userId))
      .first(),
    ctx.db
      .query("requestOffers")
      .withIndex("byOfferer", (q) => q.eq("offeredBy", userId))
      .first(),
    ctx.db
      .query("vendorPhotos")
      .withIndex("byUploader", (q) => q.eq("uploadedBy", userId))
      .first(),
    ctx.db.query("notifications").withIndex("byUser", (q) => q.eq("userId", userId)).first(),
    ctx.db.query("adminPresence").withIndex("byUser", (q) => q.eq("userId", userId)).first(),
  ]);
  return checks.some(Boolean);
}

/**
 * Bersihkan akun anonim, sesi, dan refresh token yang sudah lama tidak
 * bertegur.
 *
 * Dijalankan harian oleh `crons.ts`. `internalMutation` supaya tidak ada jalan
 * memanggilnya dari klien: siapa pun yang bisa memanggilnya dengan
 * `retentionDays: 0` bisa mengosongkan seluruh riwayat akun anonim.
 */
export const pruneAnonymousAccounts = internalMutation({
  args: {
    retentionDays: v.optional(v.number()),
    /** Batas kerja per pemanggilan, supaya satu hari tidak membakar kuota. */
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.retentionDays ?? RETENTION_LIMITS.anonymousDays;
    const batchSize = args.batchSize ?? 400;
    const cutoff = Date.now() - days * DAY;

    // Kandidat diambil dari `authAccounts`: tabel itu yang benar-benar menandai
    // "ini akun anonim", lewat `provider`.
    const candidates = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", "anonymous"))
      .collect();

    // Tertua dulu: akun yang paling jelas sudah selesai dikerjakan lebih dulu.
    const ordered = [...candidates].sort((a, b) => a._creationTime - b._creationTime);

    const result = {
      users: 0,
      accounts: 0,
      sessions: 0,
      refreshTokens: 0,
      keptOwned: 0,
      keptRecent: 0,
      scanned: candidates.length,
    };

    for (const account of ordered) {
      if (result.users + result.accounts + result.sessions + result.refreshTokens >= batchSize) {
        break;
      }
      if (account._creationTime > cutoff) {
        result.keptRecent += 1;
        continue;
      }
      const userId = account.userId as Id<"users">;
      const user = await ctx.db.get(userId);
      // Akun sudah hilang tapi barisnya masih ada: tetap dibersihkan.
      if (user && user.isAnonymous !== true) continue;
      // Akun bertanda anonim TAPI punya email berarti ada yang promotions
      // mengisi identitasnya. Itu akun sungguhan, bukan sisa.
      if (user?.email) continue;
      if (user && (await ownsSomething(ctx, userId))) {
        result.keptOwned += 1;
        continue;
      }

      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect();
      for (const session of sessions) {
        const tokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .collect();
        for (const token of tokens) {
          await ctx.db.delete(token._id);
          result.refreshTokens += 1;
        }
        await ctx.db.delete(session._id);
        result.sessions += 1;
      }

      const accounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
        .collect();
      for (const sibling of accounts) {
        await ctx.db.delete(sibling._id);
        result.accounts += 1;
      }

      if (user) {
        await ctx.db.delete(userId);
        result.users += 1;
      }
    }

    return result;
  },
});

/**
 * Retensi audit log dan laporan error.
 *
 * Keduanya pernah tumbuh tanpa batas: `auditLogs` ditulis setiap aksi
 * pengelola, `errorReports` setiap error aplikasi, dan tidak ada cron yang
 * menyentuhnya. Batas jumlah dan batas usia ditegakkan bersamaan, sama seperti
 * retensi data keamanan yang sudah ada.
 *
 * Batas JUMLAH lebih dulu, jadi tabel yang meledak dipangkas dari yang tertua
 * walau usianya masih muda.
 */
export const pruneApplicationHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    let removed = 0;

    const auditCutoff = Date.now() - RETENTION_LIMITS.auditDays * DAY;
    const auditRows = await ctx.db.query("auditLogs").withIndex("byCreatedAt").collect();
    let auditOverflow = Math.max(0, auditRows.length - RETENTION_LIMITS.auditKeepLatest);
    for (const row of auditRows) {
      if (auditOverflow > 0) {
        await ctx.db.delete(row._id);
        removed += 1;
        auditOverflow -= 1;
        continue;
      }
      if (row.createdAt < auditCutoff) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    const errorCutoff = Date.now() - RETENTION_LIMITS.errorReportDays * DAY;
    const errorRows = await ctx.db.query("errorReports").withIndex("byLastSeenAt").collect();
    let errorOverflow = Math.max(0, errorRows.length - RETENTION_LIMITS.errorReportKeepLatest);
    for (const row of errorRows) {
      if (errorOverflow > 0) {
        await ctx.db.delete(row._id);
        removed += 1;
        errorOverflow -= 1;
        continue;
      }
      if (row.lastSeenAt < errorCutoff) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    return removed;
  },
});
