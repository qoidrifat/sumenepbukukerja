// Gerbang passcode untuk ruang /admin.
//
// Kenapa ini harus action, bukan pemeriksaan di browser: apa pun yang dicek di
// sisi klien bisa dilewati dengan satu baris di console. Di sini passcode
// dibandingkan di server terhadap hash PBKDF2 yang ada di environment, dengan
// perbandingan waktu-tetap dan rate limit yang disimpan di database.
//
// Batasnya perlu jujur diketahui: passcode ini menambah gesekan, jejak audit,
// dan rate limit. Ia BUKAN pengganti otentikasi. Peran admin tetap diputuskan
// server dari tabel `staffMembers`, jadi orang yang menebak passcode dengan
// benar pun tidak melihat apa-apa tanpa akun berstatus staff.
//
// SOAL IP — hasil audit platform, bukan asumsi:
// `ctx` pada query/mutation/action Convex TIDAK punya properti `request`
// (hanya runQuery, runMutation, runAction, scheduler, auth, storage, vectorSearch,
// meta). Jadi IP tidak bisa dibaca di action biasa. Satu-satunya tempat yang
// menerima objek `Request` adalah `httpAction`, karena itu ada satu route
// kecil `POST /admin-gate/context` yang menangkap header sekali sebelum
// passcode dikirim. Rowinya menyimpan token sekali pakai berumur 5 menit, dan
// `verifyAdminPasscode` mengambil metadata dari sana.
//
// Yang dikembalikan ke browser hanya bentuk tersamar. IP mentah tidak pernah
// ditulis ke tabel mana pun: langsung diturunkan jadi `ipHash` (untuk korelasi)
// dan `ipMasked` (untuk dibaca manusia). Tidak ada passcode, token, cookie,
// atau JWT yang masuk ke log.

import { anyApi } from "convex/server";
import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireManagementViewer, requireUser } from "./access";
import {
  GLOBAL_ATTEMPT_CEILING,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  PASSCODE_MAX_LENGTH,
  deriveAttemptKey,
  derivePasscodeHash,
  maskEmail,
  maskIp,
  normalizePasscode,
  parsePasscodeHash,
  timingSafeEqual,
  trimUserAgent,
} from "../lib/admin-passcode";
import {
  deriveSessionFingerprint,
  maskFingerprint,
  maskRequestId,
  parseUserAgent,
  sanitizeReferrer,
  securityStatus,
  toHex as bytesToHex,
} from "../lib/security-context";

const TICKET_TTL_MS = 10 * 60_000;
const CONTEXT_TTL_MS = 5 * 60_000;
const PRESENCE_STALE_MS = 90_000;
/** Salt untuk sidik jari sesi. Bukan rahasia, hanya pemisah antar instalasi. */
const FINGERPRINT_SALT = process.env.ADMIN_FINGERPRINT_SALT?.trim() || "sumenep-buku-kerja";

const toHex = (bytes: Uint8Array) => bytesToHex(bytes);

const passcodeHashEnv = () => process.env.ADMIN_PASSCODE_HASH?.trim();

type AttemptContext = {
  key: string;
  emailMasked?: string;
  reportedIp?: string;
  userAgent?: string;
  timezone?: string;
  locale?: string;
};

/** Metadata yang berasal dari server, hasil pembacaan header pada httpAction. */
export type ServerRequestContext = {
  ipHash?: string;
  ipMasked?: string;
  ipSource: string;
  userAgent?: string;
  acceptLanguage?: string;
  referrer?: string;
  requestId: string;
  country?: string;
  region?: string;
  city?: string;
  networkType?: string;
};

export const captureSecurityContext = internalMutation({
  args: {
    token: v.string(),
    ipHash: v.optional(v.string()),
    ipMasked: v.optional(v.string()),
    ipSource: v.string(),
    userAgent: v.optional(v.string()),
    acceptLanguage: v.optional(v.string()),
    referrer: v.optional(v.string()),
    requestId: v.string(),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    networkType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Buang konteks kedaluwarsa sekalian, supaya tabel tidak menumpuk.
    const stale = await ctx.db
      .query("adminSecurityContexts")
      .withIndex("byExpiresAt", (q) => q.lt("expiresAt", now))
      .collect();
    for (const row of stale) await ctx.db.delete(row._id);
    await ctx.db.insert("adminSecurityContexts", { ...args, createdAt: now, expiresAt: now + CONTEXT_TTL_MS });
    return now + CONTEXT_TTL_MS;
  },
});

/** Konteks dipakai sekali saja: dibaca lalu dihapus, jadi tidak bisa dipakai ulang. */
export const readSecurityContext = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("adminSecurityContexts")
      .withIndex("byToken", (q) => q.eq("token", args.token))
      .unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt <= Date.now()) return null;
    return row;
  },
});

/** Presence ringan supaya log bisa menandai "Aktif sekarang" tanpa polling klien. */
export const heartbeatAdminPresence = mutation({
  args: { sessionFingerprint: v.optional(v.string()), route: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("adminPresence")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        sessionFingerprint: args.sessionFingerprint ?? existing.sessionFingerprint,
        route: args.route ?? existing.route,
      });
    } else {
      await ctx.db.insert("adminPresence", {
        userId,
        sessionFingerprint: args.sessionFingerprint,
        route: args.route,
        lastSeenAt: now,
      });
    }
    return now;
  },
});

export const listAdminPresence = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);
    const rows = await ctx.db.query("adminPresence").collect();
    const now = Date.now();
    return rows
      .filter((row) => now - row.lastSeenAt < PRESENCE_STALE_MS)
      .map((row) => ({ sessionFingerprint: row.sessionFingerprint ?? null, route: row.route ?? null, lastSeenAt: row.lastSeenAt }));
  },
});

/** Berapa kali percobaan gagal untuk satu kunci, dan kapan yang terakhir. */
export const attemptWindow = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("adminPasscodeAttempts")
      .withIndex("byKey", (q) => q.eq("key", args.key))
      .collect();
    const since = Date.now() - LOCKOUT_MS;
    const failures = rows.filter((row) => row.createdAt >= since && row.outcome === "failed");
    return {
      count: failures.length,
      latestAt: failures.reduce((max, row) => Math.max(max, row.createdAt), 0),
    };
  },
});

export const globalFailureCount = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("adminPasscodeAttempts")
      .withIndex("byOutcome", (q) => q.eq("outcome", "failed"))
      .collect();
    const since = Date.now() - LOCKOUT_MS;
    return rows.filter((row) => row.createdAt >= since).length;
  },
});

export const recordAttempt = internalMutation({
  args: {
    key: v.string(),
    outcome: v.union(v.literal("success"), v.literal("failed"), v.literal("locked")),
    failureReason: v.optional(v.string()),
    emailMasked: v.optional(v.string()),
    reportedIp: v.optional(v.string()),
    ipHash: v.optional(v.string()),
    ipMasked: v.optional(v.string()),
    ipSource: v.optional(v.string()),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    networkType: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    browser: v.optional(v.string()),
    browserVersion: v.optional(v.string()),
    os: v.optional(v.string()),
    osVersion: v.optional(v.string()),
    deviceType: v.optional(v.string()),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    platform: v.optional(v.string()),
    viewport: v.optional(v.string()),
    devicePixelRatio: v.optional(v.number()),
    touchPoints: v.optional(v.number()),
    route: v.optional(v.string()),
    returnTo: v.optional(v.string()),
    referrer: v.optional(v.string()),
    acceptLanguage: v.optional(v.string()),
    sessionFingerprint: v.optional(v.string()),
    requestId: v.optional(v.string()),
    attemptNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("adminPasscodeAttempts", { ...args, createdAt: Date.now() });
    return null;
  },
});

export const issueTicket = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("adminPasscodeTickets", {
      // Email diisi saat tiket ditukar, bukan saat diterbitkan, supaya alurnya
      // "passcode dulu, baru verifikasi email" bisa jalan.
      email: "",
      tokenHash: args.tokenHash,
      expiresAt: now + TICKET_TTL_MS,
      createdAt: now,
    });
    return now + TICKET_TTL_MS;
  },
});

export const consumeTicket = internalMutation({
  args: { tokenHash: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("adminPasscodeTickets")
      .withIndex("byTokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!row) return { ok: false, reason: "invalid" };
    if (row.consumedAt) return { ok: false, reason: "used" };
    if (row.expiresAt <= Date.now()) return { ok: false, reason: "expired" };
    await ctx.db.patch(row._id, { consumedAt: Date.now(), email: args.email });
    return { ok: true, reason: "ok" };
  },
});

/** Data yang dikembalikan ke pengunjung saat gerbang menolak, sudah tersamar. */
export type GateAlert = {
  emailMasked: string | null;
  reportedIp: string | null;
  userAgent: string | null;
  timezone: string | null;
  locale: string | null;
  ipMasked: string | null;
  ipSource: string | null;
  requestId: string | null;
  failedAttempts: number;
};

export type VerifyPasscodeResult =
  | { ok: true; ticket: string; expiresAt: number; requestId: string | null; ipMasked: string | null }
  | {
      ok: false;
      reason: "invalid" | "locked" | "unconfigured";
      remaining: number;
      lockedUntil: number | null;
      attempts: number;
      requestId?: string | null;
      alert?: GateAlert;
    };

const clip = (value: string | undefined | null, max: number) => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

export const verifyAdminPasscode = action({
  args: {
    passcode: v.string(),
    email: v.optional(v.string()),
    deviceId: v.string(),
    // Dipertahankan untuk kompatibilitas, tapi TIDAK lagi dipakai untuk
    // keputusan keamanan: nilai ini dikendalikan klien.
    reportedIp: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    // Token sekali pakai dari httpAction /admin-gate/context.
    contextId: v.optional(v.string()),
    route: v.optional(v.string()),
    returnTo: v.optional(v.string()),
    platform: v.optional(v.string()),
    viewportWidth: v.optional(v.number()),
    viewportHeight: v.optional(v.number()),
    devicePixelRatio: v.optional(v.number()),
    touchPoints: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<VerifyPasscodeResult> => {
    const encoded = passcodeHashEnv();
    if (!encoded) {
      return { ok: false, reason: "unconfigured", remaining: 0, lockedUntil: null, attempts: 0 };
    }
    const parsed = parsePasscodeHash(encoded);
    if (!parsed) {
      throw new Error("ADMIN_PASSCODE_HASH tidak valid. Periksa formatnya di dashboard Convex.");
    }

    // Metadata server kalau ada. Kalau context belum sampai (jaringan lambat,
    // route gagal), gerbang tetap jalan — hanya audit yang jadi lebih tipis.
    const serverContext: ServerRequestContext | null = args.contextId
      ? await ctx.runMutation(anyApi.adminGate.readSecurityContext, { token: args.contextId })
      : null;

    const requestId = serverContext?.requestId ?? null;
    const email = (args.email ?? "").trim().toLowerCase();
    // Kunci rate limit memakai IP dari server bila ada. Nilai IP kiriman
    // klien sengaja diabaikan supaya tidak bisa dipakai memisahkan jatah.
    const key = await deriveAttemptKey({
      deviceId: args.deviceId,
      reportedIp: serverContext?.ipHash ?? args.reportedIp,
    });
    const sessionFingerprint = await deriveSessionFingerprint(args.deviceId, FINGERPRINT_SALT);
    const parsedUserAgent = parseUserAgent(serverContext?.userAgent ?? args.userAgent);
    const context: AttemptContext = {
      key,
      emailMasked: maskEmail(email) ?? undefined,
      reportedIp: maskIp(args.reportedIp) ?? undefined,
      userAgent: trimUserAgent(serverContext?.userAgent ?? args.userAgent) ?? undefined,
      timezone: clip(args.timezone, 60),
      locale: clip(args.locale, 20),
    };
    const width = Number.isFinite(args.viewportWidth) ? Math.round(args.viewportWidth as number) : null;
    const height = Number.isFinite(args.viewportHeight) ? Math.round(args.viewportHeight as number) : null;
    const auditFields = {
      ...context,
      failureReason: undefined as string | undefined,
      ipHash: serverContext?.ipHash,
      ipMasked: serverContext?.ipMasked,
      ipSource: serverContext?.ipSource,
      country: serverContext?.country,
      region: serverContext?.region,
      city: serverContext?.city,
      networkType: serverContext?.networkType,
      browser: parsedUserAgent.browser ?? undefined,
      browserVersion: parsedUserAgent.browserVersion ?? undefined,
      os: parsedUserAgent.os ?? undefined,
      osVersion: parsedUserAgent.osVersion ?? undefined,
      deviceType: parsedUserAgent.deviceType,
      platform: clip(args.platform, 40),
      viewport: width && height ? `${width}x${height}` : undefined,
      devicePixelRatio: Number.isFinite(args.devicePixelRatio) ? Number(args.devicePixelRatio) : undefined,
      touchPoints: Number.isFinite(args.touchPoints) ? Math.max(0, Math.round(args.touchPoints as number)) : undefined,
      route: clip(args.route, 60),
      // returnTo hanya boleh path internal; query string dibuang.
      returnTo: (() => {
        const value = (args.returnTo ?? "").trim();
        return value.startsWith("/") && !value.startsWith("//") ? value.split("?")[0].slice(0, 60) : undefined;
      })(),
      referrer: sanitizeReferrer(serverContext?.referrer) ?? undefined,
      acceptLanguage: clip(serverContext?.acceptLanguage, 80),
      sessionFingerprint,
      requestId: requestId ?? undefined,
    };

    const window = await ctx.runMutation(anyApi.adminGate.attemptWindow, { key });
    const globalFailures = await ctx.runMutation(anyApi.adminGate.globalFailureCount, {});
    const attemptNumber = window.count + (globalFailures >= GLOBAL_ATTEMPT_CEILING ? 0 : 1);

    if (window.count >= MAX_ATTEMPTS || globalFailures >= GLOBAL_ATTEMPT_CEILING) {
      const lockedUntil = window.latestAt + LOCKOUT_MS;
      await ctx.runMutation(anyApi.adminGate.recordAttempt, {
        ...auditFields,
        outcome: "locked",
        failureReason: "rate_limited",
        attemptNumber,
      });
      return {
        ok: false,
        reason: "locked",
        remaining: 0,
        lockedUntil: Math.max(lockedUntil, Date.now() + 60_000),
        attempts: window.count,
        requestId,
        alert: {
          emailMasked: context.emailMasked ?? null,
          reportedIp: context.reportedIp ?? null,
          userAgent: context.userAgent ?? null,
          timezone: context.timezone ?? null,
          locale: context.locale ?? null,
          ipMasked: serverContext?.ipMasked ?? null,
          ipSource: serverContext?.ipSource ?? null,
          requestId: maskRequestId(requestId),
          failedAttempts: window.count,
        },
      };
    }

    const candidate = normalizePasscode(args.passcode);
    const matches =
      candidate.length > 0 &&
      candidate.length <= PASSCODE_MAX_LENGTH &&
      timingSafeEqual(
        await derivePasscodeHash(candidate, parsed.salt, parsed.iterations),
        parsed.hash,
      );

    if (!matches) {
      await ctx.runMutation(anyApi.adminGate.recordAttempt, {
        ...auditFields,
        outcome: "failed",
        failureReason: "wrong_passcode",
        attemptNumber,
      });
      const used = window.count + 1;
      return {
        ok: false,
        reason: "invalid",
        remaining: Math.max(0, MAX_ATTEMPTS - used),
        lockedUntil: null,
        attempts: used,
        requestId,
      };
    }

    // Passcode benar: terbitkan tiket sekali pakai. Email baru diketahui pada
    // langkah verifikasi email, jadi tidak ditanyakan di sini.
    const ticket = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = toHex(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket))),
    );
    const expiresAt = await ctx.runMutation(anyApi.adminGate.issueTicket, { tokenHash });
    await ctx.runMutation(anyApi.adminGate.recordAttempt, {
      ...auditFields,
      outcome: "success",
      attemptNumber,
    });
    return { ok: true, ticket, expiresAt, requestId, ipMasked: serverContext?.ipMasked ?? null };
  },
});

/**
 * Membuktikan tiket yang sudah diterbitkan sebelum verifikasi email dijalankan,
 * supaya email yang diverifikasi pasti email yang sudah lolos passcode.
 */
export const verifyAdminTicket = action({
  args: { ticket: v.string(), email: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    if (!passcodeHashEnv()) return { ok: false, reason: "unconfigured" };
    const tokenHash = toHex(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(args.ticket.trim()),
        ),
      ),
    );
    return await ctx.runMutation(anyApi.adminGate.consumeTicket, {
      tokenHash,
      email: args.email.trim().toLowerCase(),
    });
  },
});

/**
 * Jejak percobaan masuk ruang admin, untuk ditinjau pengelola di /admin.
 *
 * Agregasi (jumlah percobaan, perbandingan dengan login sebelumnya, status
 * keamanan) dihitung di server dari satu kali baca tabel, bukan disusun di
 * sisi klien. Tabel ini sudah dipangkas, jadi satu `collect` masih murah.
 *
 * Yang dikembalikan sudah tersamar: tidak ada IP mentah, passcode, token,
 * atau ID perangkat di dalam respons ini.
 */
export const listAdminSecurityEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = (await ctx.db.query("adminPasscodeAttempts").withIndex("byCreatedAt").collect()).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const now = Date.now();
    const presence = await ctx.db.query("adminPresence").collect();
    const liveFingerprints = new Set(
      presence.filter((row) => now - row.lastSeenAt < PRESENCE_STALE_MS && row.sessionFingerprint).map((row) => row.sessionFingerprint as string),
    );

    const windowStart = now - LOCKOUT_MS;
    const successes = rows.filter((row) => row.outcome === "success");
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);

    return rows.slice(0, limit).map((row) => {
      const related = rows.filter(
        (other) =>
          other.createdAt >= windowStart &&
          other._id !== row._id &&
          (other.key === row.key || (row.ipHash !== undefined && other.ipHash === row.ipHash)),
      );
      const failedInWindow = related.filter((other) => other.outcome === "failed").length;
      const previous = successes.find(
        (other) => other.createdAt < row.createdAt && other.sessionFingerprint === row.sessionFingerprint,
      );
      const locked = row.outcome === "locked";
      return {
        _id: row._id,
        outcome: row.outcome,
        failureReason: row.failureReason ?? null,
        emailMasked: row.emailMasked ?? null,
        ipMasked: row.ipMasked ?? row.reportedIp ?? null,
        ipSource: row.ipSource ?? null,
        country: row.country ?? null,
        region: row.region ?? null,
        city: row.city ?? null,
        networkType: row.networkType ?? null,
        userAgent: row.userAgent ?? null,
        browser: row.browser ?? null,
        browserVersion: row.browserVersion ?? null,
        os: row.os ?? null,
        osVersion: row.osVersion ?? null,
        deviceType: row.deviceType ?? null,
        timezone: row.timezone ?? null,
        locale: row.locale ?? null,
        platform: row.platform ?? null,
        viewport: row.viewport ?? null,
        devicePixelRatio: row.devicePixelRatio ?? null,
        touchPoints: row.touchPoints ?? null,
        route: row.route ?? null,
        returnTo: row.returnTo ?? null,
        referrer: row.referrer ?? null,
        acceptLanguage: row.acceptLanguage ?? null,
        sessionFingerprint: maskFingerprint(row.sessionFingerprint),
        requestId: maskRequestId(row.requestId),
        attemptNumber: row.attemptNumber ?? null,
        createdAt: row.createdAt,
        // Agregasi
        attemptsInWindow: related.length + 1,
        failedInWindow,
        successfulInWindow: related.filter((other) => other.outcome === "success").length,
        status: securityStatus({ outcome: row.outcome, failedInWindow, locked, maxAttempts: MAX_ATTEMPTS }),
        sessionLive: row.sessionFingerprint ? liveFingerprints.has(row.sessionFingerprint) : false,
        previousSuccessAt: previous?.createdAt ?? null,
        sameIpAsPrevious: previous ? previous.ipHash === row.ipHash && row.ipHash !== undefined : null,
        sameDeviceAsPrevious: previous
          ? previous.browser === row.browser && previous.os === row.os && previous.deviceType === row.deviceType
          : null,
      };
    });
  },
});

/** Ringkasan untuk strip pembuka panel audit, dihitung dari data yang sama. */
export const adminSecuritySummary = query({
  args: {},
  handler: async (ctx) => {
    await requireManagementViewer(ctx);
    const rows = await ctx.db.query("adminPasscodeAttempts").withIndex("byCreatedAt").collect();
    const now = Date.now();
    const dayStart = now - 24 * 60 * 60_000;
    const today = rows.filter((row) => row.createdAt >= dayStart);
    return {
      total: rows.length,
      last24h: today.length,
      succeeded24h: today.filter((row) => row.outcome === "success").length,
      failed24h: today.filter((row) => row.outcome === "failed").length,
      locked24h: today.filter((row) => row.outcome === "locked").length,
      lastEventAt: rows.reduce((max, row) => Math.max(max, row.createdAt), 0) || null,
    };
  },
});

/** Memangkas riwayat lama agar tabel tidak tumbuh tanpa batas. */
export const pruneAdminSecurityEvents = internalMutation({
  args: { keepLatest: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("adminPasscodeAttempts").withIndex("byCreatedAt").collect();
    const sorted = rows.sort((a, b) => b.createdAt - a.createdAt);
    const keep = Math.max(sorted.length - (args.keepLatest ?? 500), 0);
    for (const row of sorted.slice(keep)) await ctx.db.delete(row._id);
    const now = Date.now();
    const staleContexts = await ctx.db
      .query("adminSecurityContexts")
      .withIndex("byExpiresAt", (q) => q.lt("expiresAt", now))
      .collect();
    for (const row of staleContexts) await ctx.db.delete(row._id);
    const stalePresence = await ctx.db
      .query("adminPresence")
      .withIndex("byLastSeenAt", (q) => q.lt("lastSeenAt", now - 7 * 24 * 60 * 60_000))
      .collect();
    for (const row of stalePresence) await ctx.db.delete(row._id);
    return sorted.length - keep;
  },
});

/** Membuang konteks yang sudah kedaluwarsa; dipanggil berkala dari sisi klien. */
export const pruneSecurityContexts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("adminSecurityContexts")
      .withIndex("byExpiresAt", (q) => q.lt("expiresAt", now))
      .collect();
    for (const row of stale) await ctx.db.delete(row._id);
    return stale.length;
  },
});
