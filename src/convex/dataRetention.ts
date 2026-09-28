import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

/**
 * Retensi data yang tumbuh sendiri.
 *
 * Audit 2026-09-28 mengukur langsung isi deployment dan hasilnya: 1.788 dari
 * ~1.900 dokumen BUKAN data aplikasi. Rinciannya 800 `authRefreshTokens`,
 * 330 `authAccounts`, 328 `authSessions`, dan 330 `users` (327 di antaranya
 * anonim) — dibanding 35 `auditLogs`, 17 `errorReports`, 17 `analyticsEvents`,
 * dan 6 `vendors`. Itu 94% isi database, tumbuh ~99 akun per hari, dan tidak
 * satupun dibaca oleh satu halaman produk.
 *
 * Tanpa cron ini, lajunya ~500 dokumen per hari atau ~180.000 per tahun.
 * Dengan jendela 7 hari, jumlah yang mengendap di database jadi tetap:
 * ~700 akun anonim beserta sesi dan tokennya, bukan bertambah terus.
 *
 * Jendelanya sengaja tidak lebih pendek dari 7 hari walaupun baris-baris ini
 * jelas sampah. Yang dihapus adalah baris akun dan sesinya, dan sebuah sesi
 * anonim yang masih hidup di perangkat seseorang akan langsung terputus.
 * Pemangkasan lebih agresif hanya menghemat ~0,3 MB di kuota 2 GB, jadi tidak
 * sepadan dengan risiko itu.
 *
 * Sumbernya di luar kendali aplikasi: `src/convex/auth.ts` mendaftarkan
 * penyedia `Anonymous` dan file itu BEKU, dan tidak ada satu pun baris
 * `signIn("anonymous")` di `src/` — itu dikunci oleh `auth-entrypoints.test.ts`.
 * Jadi pemanggilnya berasal dari luar source kita, dan yang bisa kita lakukan
 * hanyalah membersihkan sisanya secara berkala.
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
  /**
   * Log peristiwa mentah.
   *
   * Jauh lebih pendek dari yang lain karena isinya sudah diringkas ke
   * `analyticsCounters` saat ditulis: dashboard tetap tahu total sepanjang masa
   * walaupun barisnya sudah dibuang. Yang tersimpan cuma cukup untuk menelusuri
   * kejadian beberapa bulan terakhir.
   */
  analyticsDays: 90,
  analyticsKeepLatest: 20_000,
  /**
   * Riwayat pengiriman WhatsApp yang sudah selesai.
   *
   * Satu baris per notifikasi, tanpa batas sebelumnya. Yang dibuang hanya baris
   * yang sudah benar-benar berakhir (`delivered` atau `failed`); yang masih
   * `queued` atau `sent` sengaja disimpan berapa pun usianya, karena baris itu
   * justru bukti ada kiriman yang menggantung dan perlu diperiksa.
   *
   * Dua pengiriman terakhir per pengguna masih dibutuhkan untuk rate limit dan
   * panel status, dan itu jauh di dalam jendela 30 hari.
   */
  whatsappDeliveredDays: 30,
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
      .withIndex("byRequester", (q) => q.eq("requesterId", userId))
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
      .withIndex("byModeratedBy", (q) => q.eq("moderatedBy", userId))
      .first(),
    ctx.db.query("notifications").withIndex("byUser", (q) => q.eq("userId", userId)).first(),
    ctx.db.query("adminPresence").withIndex("byUser", (q) => q.eq("userId", userId)).first(),
    // Tersimpan paling akhir justru yang paling penting: nomor WhatsApp yang
    // sudah memilih ikut notifikasi. Akun anonim yang sampai ke situ berarti
    // seseorang benar-benar memakainya, dan menghapusnya akan membuat opt-in
    // itu menggantung tanpa pemilik.
    ctx.db
      .query("notificationPreferences")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .first(),
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
      // Akun bertanda anonim TAPI punya email berarti ada yang mengisi
      // identitasnya. Itu akun sungguhan, bukan sisa.
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
 * Retensi riwayat aplikasi.
 *
 * Empat tabel yang tumbuh sendiri tanpa ada yang menyentuhnya: `auditLogs`
 * (setiap aksi pengelola), `errorReports` (setiap error aplikasi),
 * `analyticsEvents` (setiap peristiwa produk), dan `whatsappDeliveries`
 * (setiap notifikasi terkirim). Batas jumlah dan batas usia ditegakkan
 * bersamaan, sama seperti retensi data keamanan yang sudah ada.
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

    // Log peristiwa mentah. Angkanya sudah ada di `analyticsCounters`, jadi
    // barisnya boleh dibuang begitu batas usia atau jumlahnya lewat.
    const analyticsCutoff = Date.now() - RETENTION_LIMITS.analyticsDays * DAY;
    const analyticsRows = await ctx.db
      .query("analyticsEvents")
      .withIndex("byCreatedAt")
      .collect();
    let analyticsOverflow = Math.max(
      0,
      analyticsRows.length - RETENTION_LIMITS.analyticsKeepLatest,
    );
    for (const row of analyticsRows) {
      if (analyticsOverflow > 0) {
        await ctx.db.delete(row._id);
        removed += 1;
        analyticsOverflow -= 1;
        continue;
      }
      if (row.createdAt < analyticsCutoff) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    // Riwayat pengiriman WhatsApp yang sudah berakhir. Yang belum berakhir
    // (`queued`/`sent`) tidak disentuh sama sekali: baris itu menandakan
    // kiriman yang menggantung, dan menghapusnya berarti kehilangan buktinya.
    const deliveryCutoff = Date.now() - RETENTION_LIMITS.whatsappDeliveredDays * DAY;
    const deliveries = await ctx.db
      .query("whatsappDeliveries")
      .withIndex("byCreatedAt")
      .collect();
    for (const row of deliveries) {
      const finished = row.status === "delivered" || row.status === "failed";
      if (finished && row.createdAt < deliveryCutoff) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    return removed;
  },
});
