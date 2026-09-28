import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Retensi data yang寫 tumbuh sendiri.
 *
 * Audit ini menemukan bahwa ~98% dokumen di database ini BUKAN data aplikasi.
 * Pada 2026-09-28 isinya: 791 `authRefreshTokens`, 330 `users` (327 di antaranya
 * anonim), 330 `authAccounts`, 328 `authSessions` — unearthed dari 35
 * `auditLogs`, 17 `errorReports`, dan 6 `vendors`.
 *
 * Akun anonim dibuat ~81 kali sehari. Setiap penanda tangan anonim menulis
 * sekitar 5 dokumen (user + account + session + ±2 refresh token), jadi
 * ~437 dokumen per hari, atau ~160.000 per tahun — dari satu tombol yang
 *Pressed di halaman yang tidak seorang pun_posts.
 *
 * Sumbernya di luar kendali aplikasi: `src/convex/auth.ts` mendaftarkan
 * penyedia `Anonymous` dan file itu BEKU (jangan diubah), dan tidak ada satu
 * pun baris `signIn("anonymous")` di `src/` — itu dikunci oleh
 * `auth-entrypoints.test.ts`. Jadi pemanggilnya berasal dari luar source kita,
 * dan satu-satunya cara yang benar-benar’OFFICIAL untukawaninya adalah
 * membersihkannya.
 *
 * Syarataman Extremely konservatif: hanya akun TANPA email, sudah tua, dan
 * tidak memiliki apa pun. Account yang masih punya listing, peran, atau
 * manager akan dilewati apa pun usianya.
 */

const DAY = 24 * 60 * 60_000;

/** Usia minimum sebelum akun anonim dianggap selesai. */
const ANONYMOUS_RETENTION_DAYS = 7;

/** Batas jumlah baris audit yang dipertahankan, di luar batas usia. */
const AUDIT_KEEP_LATEST = 2_000;
const AUDIT_RETENTION_DAYS = 180;

/** Batas jumlah laporan error; isinya sudah diringkas per fingerprint. */
const ERROR_REPORT_KEEP_LATEST = 500;
const ERROR_REPORT_RETENTION_DAYS = 90;

/**
 * Apakah akun anonim ini memiliki sesuatu yang tidak boleh hilang?
 *
 * Ini pertanyaan "bolehkah dihapus?", jadi jawabannya yang failed-closed: kalau
 * ada satu saja yang tidak bisa dipastikan, akunnya DISISIKAN. Men mistakenly
 * menghapus akun yang masih punya listing berarti data hilang permanen;
 * menyisakan satu akun anonim berarti satu baris yang tidak berarti apa-apa.
 */
async function ownsSomething(
  ctx: Parameters<Parameters<typeof internalMutation>[0]["handler"]>[0],
  userId: Id<"users">,
): Promise<boolean> {
  const [membership, vendor, requests, interactions, favorites, claims, reports, offers, photos, notifications, presence, attempts] =
    await Promise.all([
      ctx.db
        .query("staffMembers")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("vendors")
        .withIndex("byOwner", (q) => q.eq("ownerId", userId))
        .first(),
      ctx.db
        .query("serviceRequests")
        .withIndex("byRequester", (q) => q.eq("requesterId", userId))
        .first(),
      ctx.db
        .query("vendorInteractions")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("favorites")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first(),
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
      ctx.db
        .query("notifications")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("adminPresence")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("adminPasscodeAttempts")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .first(),
    ]);
  return Boolean(
    membership || vendor || requests || interactions || favorites || claims || reports ||
    offers || photos || notifications || presence || attempts,
  );
}

/**
 * Bersihkan akun anonim, sesi, dan refresh token yang sudah lama tidak
 * bertegur.
 *
 * Dijalankan harian oleh `crons.ts`. `internalMutation` supaya tidak ada jalan
 * memanggilnya dari klien: siapa pun yang bisa memanggilnya dengan
 * `retentionDays: 0` bisa mengosongkan seluruh riwayat akun anonim — dan,
 * lebih buruk, membuat低端 bug di sini terasa seperti fitur.
 */
export const pruneAnonymousAccounts = internalMutation({
  args: {
    retentionDays: v.optional(v.number()),
    /** Batas kerja per pemanggilan, supaya satu hari tidak membakar kuota. */
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.retentionDays ?? ANONYMOUS_RETENTION_DAYS;
    const batchSize = args.batchSize ?? 400;
    const cutoff = Date.now() - days * DAY;

    // Kandidat diambil dari `authAccounts`, bukan dari `users`: tabel itu yang
    // benar-benar menandai "ini akun anonim", dan `_creationTime`-nya adalah
    // saat akun dibuat.
    const candidates = await ctx.db
      .query("authAccounts")
      .filter((q) => q.eq(q.field("provider"), "anonymous"))
      .collect();

    // Yang sudah kedaluwarsa dulu diurutkan dengan `expirationTime`, sehingga
    //-account yang paling jelas sudah selesai dikerjakan paling dulu.
    const ordered = candidates
      .filter((account) => {
        const session = account.userId;
        return Boolean(session);
      })
      .sort((a, b) => a._creationTime - b._creationTime);

    let users = 0;
    let accounts = 0;
    let sessions = 0;
    let refreshTokens = 0;
    let keptOwned = 0;

    for (const account of ordered) {
      if (users + accounts + sessions + refreshTokens >= batchSize) break;
      const userId = account.userId as Id<"users">;
      if (account._creationTime > cutoff) continue;

      const user = await ctx.db.get(userId);
      // akun sudah hilang, tapi baris account-nya masih ada: tetap dibersihkan.
      if (user && user.isAnonymous !== true) continue;
      if (user?.email) continue;
      if (user && (await ownsSomething(ctx, userId))) {
        keptOwned += 1;
        continue;
      }

      for (const session of await ctx.db
        .query("authSessions")
        .withIndex("byUser", (q) => q.eq("userId", userId))
        .collect()) {
        for (const token of await ctx.db
          .query("authRefreshTokens")
          .withIndex("bySessionId", (q) => q.eq("sessionId", session._id))
          .collect()) {
          await ctx.db.delete(token._id);
          refreshTokens += 1;
        }
        await ctx.db.delete(session._id);
        sessions += 1;
      }
      for (const sibling of await ctx.db
        .query("authAccounts")
        .withIndex("byUserId", (q) => q.eq("userId", userId))
        .collect()) {
        await ctx.db.delete(sibling._id);
        accounts += 1;
      }
      if (user) {
        await ctx.db.delete(userId);
        users += 1;
      }
    }

    return { users, accounts, sessions, refreshTokens, keptOwned, scanned: candidates.length };
  },
});

/**
 * Retensi audit log dan laporan error.
 *
 * Keduanya pernah tumbuh tanpa batas: `auditLogs` ditulis setiap aksi
 * pengelola, `errorReports` setiap error aplikasi, dan tidak ada cron yang
 * menyentuhnya. Batas jumlah dan batas usia ditegakkan bersamaan, sama seperti
 * retensi data keamanan yang sudah ada.
 */
export const pruneApplicationHistory = internalMutation({
  args: {},
  handler: async (ctx) => {
    let removed = 0;

    // `byCreatedAt` diurutkan menaik, jadi iterate dari yang tertua.
    const auditCutoff = Date.now() - AUDIT_RETENTION_DAYS * DAY;
    let auditOverflow = 0;
    const auditTotal = await ctx.db.query("auditLogs").withIndex("byCreatedAt").collect();
    auditOverflow = Math.max(0, auditTotal.length - AUDIT_KEEP_LATEST);
    for (const row of auditTotal) {
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

    const errorCutoff = Date.now() - ERROR_REPORT_RETENTION_DAYS * DAY;
    let errorOverflow = 0;
    const errorTotal = await ctx.db.query("errorReports").withIndex("byLastSeenAt").collect();
    errorOverflow = Math.max(0, errorTotal.length - ERROR_REPORT_KEEP_LATEST);
    for (const row of errorTotal) {
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

/** Batas yang dipakai, diekspor supaya tes bisa mengunci angkanya. */
export const RETENTION_LIMITS = {
  anonymousDays: ANONYMOUS_RETENTION_DAYS,
  auditKeepLatest: AUDIT_KEEP_LATEST,
  auditDays: AUDIT_RETENTION_DAYS,
  errorReportKeepLatest: ERROR_REPORT_KEEP_LATEST,
  errorReportDays: ERROR_REPORT_RETENTION_DAYS,
} as const;

/** Dipakai oleh tes agar tipe `Doc` tetap terpakai. */
export type RetentionDoc = Doc<"users">;
