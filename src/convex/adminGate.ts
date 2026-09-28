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
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { sha256Hex } from "../lib/security-context";
import { writeAudit } from "./audit";
import { isOwnerAccount } from "../lib/owner-account";
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getStaffAccess, requireManagementViewer, requireStaff, requireUser } from "./access";
import {
  GLOBAL_ATTEMPT_CEILING,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  PASSCODE_MAX_LENGTH,
  assessPasscode,
  deriveAttemptKey,
  derivePasscodeHash,
  encodePasscodeHash,
  maskEmail,
  maskIp,
  normalizePasscode,
  parsePasscodeHash,
  timingSafeEqual,
  trimUserAgent,
} from "../lib/admin-passcode";
import {
  deriveSecuritySignals,
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

/**
 * Generasi passcode aktif. 0 selama masih memakai hash dari environment, dan
 * naik setiap kali passcode dirotasi dari dalam aplikasi.
 */
const currentGeneration = async (ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>) => {
  const rows = await ctx.db.query("adminPasscodeConfig").collect();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.generation ?? 0;
};

type AttemptContext = {
  key: string;
  emailMasked?: string;
  reportedIp?: string;
  userAgent?: string;
  timezone?: string;
  locale?: string;
};

/**
 * Ember bersama untuk percobaan yang tidak punya konteks server.
 *
 * Nilai konstan, bukan input klien: begitulah rate limit tetap berlaku saat
 * beacon diblokir, tanpa mempercayai apa pun yang dikirim browser.
 */
const UNTRUSTED_IP_BUCKET = "no-server-context";

/** Metadata yang berasal dari server, hasil pembacaan header pada httpAction. */
export type ServerRequestContext = {
  ipHash?: string;
  ipMasked?: string;
  ipSource: string;
  ipFamily?: string;
  ipTrust?: string;
  proxyDetected?: boolean;
  chainLength?: number;
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
    ipFamily: v.optional(v.string()),
    ipTrust: v.optional(v.string()),
    proxyDetected: v.optional(v.boolean()),
    chainLength: v.optional(v.number()),
    mappedFromIpv6: v.optional(v.boolean()),
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
    ipFamily: v.optional(v.string()),
    ipTrust: v.optional(v.string()),
    proxyDetected: v.optional(v.boolean()),
    chainLength: v.optional(v.number()),
    signals: v.optional(v.array(v.string())),
    userId: v.optional(v.id("users")),
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
      generation: await currentGeneration(ctx),
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
    // Tiket terbit sebelum rotasi passcode tidak boleh menyelesaikan langkah
    // email dengan passcode yang sudah diganti.
    if ((row.generation ?? 0) !== (await currentGeneration(ctx))) {
      await ctx.db.delete(row._id);
      return { ok: false, reason: "superseded" };
    }
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
    // Sumber hash harus sama dengan yang dipakai `changeAdminPasscode`. Kalau
    // gerbang masih membaca environment sementara rotasi menulis ke database,
    // passcode "baru" tidak akan pernah berlaku — persis bug yang diDitangkap
    // test regresi.
    const config = await ctx.runQuery(anyApi.adminGate.passcodeConfig, {});
    if (!config.hash) {
      return { ok: false, reason: "unconfigured", remaining: 0, lockedUntil: null, attempts: 0 };
    }
    const parsed = parsePasscodeHash(config.hash);
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
    // Kunci rate limit HANYA boleh memakai IP dari server. Nilai `reportedIp`
    // kiriman klien sengaja tidak pernah dipakai: kalau beacon terblokir dan
    // nilai klien dipakai sebagai ganti, siapa pun bisa memanggil action ini
    // dengan IP berbeda tiap kali dan mendapat jatah baru tanpa batas. Tanpa
    // konteks server, semua percobaan masuk satu ember yang sama — lebih ketat,
    // bukan lebih longgar.
    const key = await deriveAttemptKey({
      deviceId: args.deviceId,
      reportedIp: serverContext?.ipHash ?? UNTRUSTED_IP_BUCKET,
    });
    const sessionFingerprint = await deriveSessionFingerprint(args.deviceId, FINGERPRINT_SALT);
    const parsedUserAgent = parseUserAgent(serverContext?.userAgent ?? args.userAgent);
    const context: AttemptContext = {
      key,
      emailMasked: maskEmail(email) ?? undefined,
      userAgent: trimUserAgent(serverContext?.userAgent ?? args.userAgent) ?? undefined,
      // Untuk ditampilkan saja, dan tetap dipangkas supaya argumen raksasa dari
      // klien tidak ada gunanya.
      reportedIp: clip(maskIp(args.reportedIp), 32) ?? undefined,
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
      ipFamily: serverContext?.ipFamily,
      ipTrust: serverContext?.ipTrust,
      proxyDetected: serverContext?.proxyDetected,
      chainLength: serverContext?.chainLength,
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
    const config = await ctx.runQuery(anyApi.adminGate.passcodeConfig, {});
    if (!config.hash) return { ok: false, reason: "unconfigured" };
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
  args: { limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = (await ctx.db.query("adminPasscodeAttempts").withIndex("byCreatedAt").collect()).sort(
      (a, b) => b.createdAt - a.createdAt || (a._id < b._id ? 1 : -1),
    );
    const now = Date.now();
    // Referensi sesi milik pemanggil, dihitung dari JWT-nya sendiri. Dipakai
    // untuk menandai kartu mana yang sebenarnya perangkat yang sedang dipakai, supaya
    // UI tidak menawarkan mencabut sesi yang sedang dinaiki.
    const ownSessionId = await getAuthSessionId(ctx);
    const ownSessionReference = ownSessionId ? await sha256Hex(ownSessionId) : null;
    const presence = await ctx.db.query("adminPresence").collect();
    const liveFingerprints = new Set(
      presence.filter((row) => now - row.lastSeenAt < PRESENCE_STALE_MS && row.sessionFingerprint).map((row) => row.sessionFingerprint as string),
    );

    // Kursor disusun dari `createdAt` + `_id` supaya baris dengan timestamp sama
    // tidak saling menimpa saat halaman dimuat berikutnya.
    let start = 0;
    if (args.cursor) {
      const parsed = args.cursor.split(":");
      const at = Number(parsed[0]);
      if (Number.isFinite(at)) {
        start = rows.findIndex((row) => row.createdAt < at);
        if (start < 0) start = rows.length;
      }
    }

    const windowStart = now - LOCKOUT_MS;
    const successes = rows.filter((row) => row.outcome === "success");
    const knownIps = new Set(rows.map((row) => row.ipHash).filter((value): value is string => Boolean(value)));
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const page = rows.slice(start, start + limit);
    const last = page[page.length - 1];
    const nextCursor =
      page.length === limit && last ? `${last.createdAt}:${last._id}` : null;

    const events = await Promise.all(page.map(async (row) => {
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
      const ipRows = row.ipHash ? rows.filter((other) => other.ipHash === row.ipHash) : [];
      const signals = deriveSecuritySignals({
        ipHash: row.ipHash,
        seenIps: knownIps,
        previousSameSession: previous ?? null,
        browser: row.browser,
        os: row.os,
        deviceType: row.deviceType,
        timezone: row.timezone,
        country: row.country,
        failedInWindow,
        rapidAttempts: rows.filter(
          (other) => other.createdAt >= row.createdAt - 60_000 && other.createdAt <= row.createdAt,
        ).length,
        maxAttempts: MAX_ATTEMPTS,
        proxyDetected: row.proxyDetected,
      });
      return {
        _id: row._id,
        outcome: row.outcome,
        failureReason: row.failureReason ?? null,
        emailMasked: row.emailMasked ?? null,
        ipMasked: row.ipMasked ?? row.reportedIp ?? null,
        ipSource: row.ipSource ?? null,
        ipFamily: row.ipFamily ?? null,
        ipTrust: row.ipTrust ?? null,
        proxyDetected: row.proxyDetected ?? null,
        chainLength: row.chainLength ?? null,
        mappedFromIpv6: row.mappedFromIpv6 ?? null,
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
        // Keadaan sesi untuk tombol "Logout dari sesi ini". Yang dikirim hanya
        // bentuk ternormalisasi, bukan id sesi maupun hash-nya: UI tidak butuh
        // pengenal apa pun untuk memutuskan, dan begitu pengenal ikut terbawa ke
        // payload, kebocorannya jadi jauh lebih sulit dilacak.
        sessionState: await stateOfAttempt(ctx, row, ownSessionReference),
        sessionRevokedAt: row.sessionRevokedAt ?? null,
        // Agregasi
        attemptsInWindow: related.length + 1,
        failedInWindow,
        successfulInWindow: related.filter((other) => other.outcome === "success").length,
        ipTotal: ipRows.length,
        ipFirstSeenAt: ipRows.reduce((min, other) => Math.min(min, other.createdAt), row.createdAt),
        ipLastSeenAt: ipRows.reduce((max, other) => Math.max(max, other.createdAt), row.createdAt),
        ipSuccessCount: ipRows.filter((other) => other.outcome === "success").length,
        ipFailureCount: ipRows.filter((other) => other.outcome === "failed").length,
        status: securityStatus({ outcome: row.outcome, failedInWindow, locked, maxAttempts: MAX_ATTEMPTS }),
        sessionLive: row.sessionFingerprint ? liveFingerprints.has(row.sessionFingerprint) : false,
        previousSuccessAt: previous?.createdAt ?? null,
        sameIpAsPrevious: previous ? previous.ipHash === row.ipHash && row.ipHash !== undefined : null,
        sameDeviceAsPrevious: previous
          ? previous.browser === row.browser && previous.os === row.os && previous.deviceType === row.deviceType
          : null,
        signals,
      };
    }));
    return { events, nextCursor, total: rows.length };
  },
});

/** Detail satu percobaan, lengkap dengan riwayat IP-nya. */
export const getAdminSecurityAttempt = query({
  args: { attemptId: v.id("adminPasscodeAttempts") },
  handler: async (ctx, args) => {
    const { userId } = await requireManagementViewer(ctx);
    const row = await ctx.db.get(args.attemptId);
    if (!row) return null;
    const all = await ctx.db.query("adminPasscodeAttempts").collect();
    const ipRows = row.ipHash ? all.filter((other) => other.ipHash === row.ipHash) : [];
    void userId;
    return {
      _id: row._id,
      outcome: row.outcome,
      failureReason: row.failureReason ?? null,
      emailMasked: row.emailMasked ?? null,
      ipMasked: row.ipMasked ?? row.reportedIp ?? null,
      ipSource: row.ipSource ?? null,
      ipFamily: row.ipFamily ?? null,
      ipTrust: row.ipTrust ?? null,
      proxyDetected: row.proxyDetected ?? null,
      chainLength: row.chainLength ?? null,
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
      signals: row.signals ?? [],
      ipHistory: ipRows
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
        .map((other) => ({
          _id: other._id,
          outcome: other.outcome,
          createdAt: other.createdAt,
          browser: other.browser ?? null,
          os: other.os ?? null,
          deviceType: other.deviceType ?? null,
          country: other.country ?? null,
        })),
      ipTotals: {
        attempts: ipRows.length,
        success: ipRows.filter((other) => other.outcome === "success").length,
        failed: ipRows.filter((other) => other.outcome === "failed").length,
        locked: ipRows.filter((other) => other.outcome === "locked").length,
        firstSeenAt: ipRows.length
          ? Math.min(...ipRows.map((other) => other.createdAt))
          : null,
        lastSeenAt: ipRows.length
          ? Math.max(...ipRows.map((other) => other.createdAt))
          : null,
      },
    };
  },
});

/** "Aktivitas berdasarkan IP": satu baris per IP, untuk orientasi cepat. */
export const listAdminIpActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = await ctx.db.query("adminPasscodeAttempts").collect();
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const byIp = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.ipHash) continue;
      const bucket = byIp.get(row.ipHash) ?? [];
      bucket.push(row);
      byIp.set(row.ipHash, bucket);
    }
    return [...byIp.entries()]
      .map(([ipHash, bucket]) => {
        const sorted = bucket.slice().sort((a, b) => b.createdAt - a.createdAt);
        const latest = sorted[0];
        return {
          ipHash,
          ipMasked: latest.ipMasked ?? null,
          ipSource: latest.ipSource ?? null,
          ipFamily: latest.ipFamily ?? null,
          ipTrust: latest.ipTrust ?? null,
          proxyDetected: latest.proxyDetected ?? null,
          attempts: bucket.length,
          success: bucket.filter((row) => row.outcome === "success").length,
          failed: bucket.filter((row) => row.outcome === "failed").length,
          locked: bucket.filter((row) => row.outcome === "locked").length,
          firstSeenAt: Math.min(...bucket.map((row) => row.createdAt)),
          lastSeenAt: Math.max(...bucket.map((row) => row.createdAt)),
          lastBrowser: latest.browser ?? null,
          lastBrowserVersion: latest.browserVersion ?? null,
          lastOs: latest.os ?? null,
          lastOsVersion: latest.osVersion ?? null,
          lastDeviceType: latest.deviceType ?? null,
          country: latest.country ?? null,
          region: latest.region ?? null,
          city: latest.city ?? null,
          isNew: bucket.length === 1,
        };
      })
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, limit);
  },
});

/** Ringkasan untuk strip pembuka panel audit, dihitung dari data yang sama. */
export const adminSecuritySummary = query({
  args: { windowHours: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = await ctx.db.query("adminPasscodeAttempts").withIndex("byCreatedAt").collect();
    const now = Date.now();
    const hours = Math.min(Math.max(args.windowHours ?? 24, 1), 24 * 90);
    const dayStart = now - hours * 60 * 60_000;
    const today = rows.filter((row) => row.createdAt >= dayStart);
    const earlier = rows.filter((row) => row.createdAt < dayStart);

    const ipOf = (row: (typeof rows)[number]) => row.ipHash;
    const knownBefore = new Set(earlier.map(ipOf).filter((value): value is string => Boolean(value)));
    const knownDevicesBefore = new Set(
      earlier.map((row) => `${row.browser ?? ""}|${row.os ?? ""}|${row.deviceType ?? ""}`),
    );
    const currentIps = [...new Set(today.map(ipOf).filter((value): value is string => Boolean(value)))];

    // Sinyal dihitung ulang untuk jendela ini, supaya angka di ringkasan
    // konsisten dengan yang tampil di daftar.
    let riskFlags = 0;
    for (const row of today) {
      riskFlags += deriveSecuritySignals({
        ipHash: row.ipHash,
        seenIps: knownBefore,
        previousSameSession: null,
        browser: row.browser,
        os: row.os,
        deviceType: row.deviceType,
        timezone: row.timezone,
        country: row.country,
        failedInWindow: 1,
        proxyDetected: row.proxyDetected,
      }).length;
    }

    await Promise.resolve();
    return {
      windowHours: hours,
      total: rows.length,
      last24h: today.length,
      succeeded24h: today.filter((row) => row.outcome === "success").length,
      failed24h: today.filter((row) => row.outcome === "failed").length,
      locked24h: today.filter((row) => row.outcome === "locked").length,
      uniqueIps: currentIps.length,
      newIps: currentIps.filter((ip) => !knownBefore.has(ip)).length,
      newDevices: today.filter(
        (row) =>
          row.browser &&
          !knownDevicesBefore.has(`${row.browser}|${row.os ?? ""}|${row.deviceType ?? ""}`),
      ).length,
      countries: [...new Set(today.map((row) => row.country).filter(Boolean))].length,
      riskFlags,
      lastEventAt: rows.reduce((max, row) => Math.max(max, row.createdAt), 0) || null,
    };
  },
});

/**
 * Memangkas riwayat lama agar tabel tidak tumbuh tanpa batas.
 *
 * Dijalankan setiap hari oleh cron di `src/convex/crons.ts`. Sengaja
 * `internalMutation`: tidak ada jalan untuk memanggilnya dari sisi klien,
 * jadi tidak ada siapa pun — termasuk admin — yang bisa memanggilnya dengan
 * `keepLatest: 0` lalu mengosongkan Security Desk. Batasannya hanya bisa
 * diubah di server lewat `ADMIN_SECURITY_RETENTION_DAYS` di Keys.
 *
 * Versi `pruneSecurityContexts` yang lama dihapus: isinya sudah tercakup penuh
 * di sini (konteks lewat `byExpiresAt`, kehadiran lewat `byLastSeenAt`), dan
 * karena tidak pernah dipanggil, ia cuma kode mati.
 */
export const pruneAdminSecurityEvents = internalMutation({
  args: { keepLatest: v.optional(v.number()), retentionDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("adminPasscodeAttempts").withIndex("byCreatedAt").collect();
    const sorted = rows.sort((a, b) => b.createdAt - a.createdAt);
    // Dua batas, bukan satu: jumlah baris supaya tabel tetap kecil, dan usia
    // supaya tidak ada data IP yang disimpan tanpa batas. Batas usia
    // dikonfigurasi lewat `ADMIN_SECURITY_RETENTION_DAYS` di Keys.
    const configuredDays = Number(process.env.ADMIN_SECURITY_RETENTION_DAYS);
    const retentionDays =
      args.retentionDays ?? (Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : 30);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60_000;
    // `keep` adalah JUMLAH baris yang dipertahankan, bukan banyaknya baris
    // yang dibuang. Versi sebelumnya menulis `max(sorted.length - keepLatest, 0)`
    // sehingga selama tabel masih berisi kurang dari `keepLatest` baris, `keep`
    // bernilai 0 — dan loop batas usia di bawahnya tidak pernah jalan sama
    // sekali. Akibatnya data IP bisa disimpan tanpa batas selama berbulan-bulan,
    // persis hal yang fungsi ini dibuat untuk cegah.
    const keep = args.keepLatest ?? 500;
    let removed = 0;
    for (const row of sorted.slice(keep)) {
      await ctx.db.delete(row._id);
      removed += 1;
    }
    // Batas usia berlaku ke semua baris di dalam N terbaru, bukan hanya yang
    // sudah melewati batas jumlah: usia adalah batas mutlak.
    for (const row of sorted.slice(0, keep)) {
      if (row.createdAt < cutoff) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
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
    return removed;
  },
});

/* ------------------------------------------------------------------ *
 * Retensi
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Rotasi passcode, logout, dan sesi-management
 * ------------------------------------------------------------------ */

/**
 * Sumber kebenaran passcode aktif.
 *
 * Environment tetap jadi baseline supaya instalasi baru langsung jalan tanpa
 * langkah tambahan. Setelah admin merotasi dari Security Desk, baris di tabel
 * yang menang — dan apa pun yang masih di environment diabaikan sampai baris
 * itu dihapus. Yang disimpan tetap hash PBKDF2, tidak pernah passcode mentah.
 */
export const passcodeConfig = internalQuery({
  args: {},
  handler: async (ctx) => {
    const generation = await currentGeneration(ctx);
    const rows = await ctx.db.query("adminPasscodeConfig").collect();
    const stored = rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (stored) return { hash: stored.hash, generation, source: stored.source as "env" | "rotated" };
    return { hash: passcodeHashEnv() ?? null, generation, source: "env" as const };
  },
});

/** Peran pemanggil, untuk gerbang internal yang dipanggil dari action. */
export const callerRole = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return (await getStaffAccess(ctx, userId))?.role ?? null;
  },
});

/**
 * Otorisasi ada DI SINI, bukan di action: action tidak punya `ctx.db`, jadi
 * kalau gerbangnya hanya di sisi action, satu baris pemanggilan yang keliru akan
 * membukanya. Query internal ini satu-satunya sumber "apakah pemanggil ini
 * pemilik".
 */
export const callerIsOwnerAccount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    if (!(await getStaffAccess(ctx, userId))) return false;
    const user = await ctx.db.get(userId);
    return isOwnerAccount(user?.email);
  },
});

/**
 * Terapkan hash baru. Otorisasi ada DI SINI, bukan di action: action hanya
 * memegang kripto, sedangkan ctx action tidak punya akses database sama sekali.
 * Tanpa gerbang ini, siapa pun yang bisa memanggil action bisa merotasi passcode.
 */
export const applyPasscodeChange = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireStaff(ctx, "admin");
    const now = Date.now();
    const existing = await ctx.db.query("adminPasscodeConfig").collect();
    for (const row of existing) await ctx.db.delete(row._id);
    await ctx.db.insert("adminPasscodeConfig", {
      hash: args.hash,
      // Generasi memakai timestamp supaya selalu naik dan tidak perlu dihitung.
      generation: now,
      source: "rotated",
      updatedAt: now,
      updatedBy: userId,
    });

    // Tiket gerbang yang belum dipakai ikut dibatalkan. Tanpa ini, seseorang
    // yang sudah melewati passcode sebelum rotasi masih bisa menyelesaikan
    // langkah verifikasi email dan masuk dengan passcode yang sudah diganti.
    const tickets = await ctx.db.query("adminPasscodeTickets").collect();
    let revokedTickets = 0;
    for (const ticket of tickets) {
      if (!ticket.consumedAt) {
        await ctx.db.delete(ticket._id);
        revokedTickets += 1;
      }
    }

    const presence = await ctx.db
      .query("adminPresence")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    if (presence) await ctx.db.delete(presence._id);

    await writeAudit(ctx, {
      action: "admin.passcode_changed",
      actorId: userId,
      entityId: String(userId),
      newValue: "rotated",
      // Tidak ada passcode lama/baru, hash, salt, atau secret di sini.
      metadata: { revokedTickets, source: "admin_security_desk" },
    });
    return { revokedTickets, generation: now };
  },
});

export type ChangePasscodeResult =
  | { ok: true; revokedTickets: number; level: "weak" | "fair" | "strong" }
  | { ok: false; reason: "unauthorized" | "owner_only" | "unconfigured" | "wrong_current" | "weak"; issues?: string[] };

/**
 * Ganti passcode admin.
 *
 * Gerbang session DITARUH DI AWAL, dan itu bukan formalitas: tanpa ia, action
 * ini jadi oracle penebakan passcode tanpa rate limit, karena siapa pun bisa
 * memanggilnya. Setelah itu passcode lama diperiksa dengan PBKDF2 dan
 * perbandingan waktu-tetap, persis seperti di gerbang masuk.
 */
export const changeAdminPasscode = action({
  args: { currentPasscode: v.string(), newPasscode: v.string() },
  handler: async (ctx, args): Promise<ChangePasscodeResult> => {
    const role = await ctx.runQuery(anyApi.adminGate.callerRole, {});
    if (role !== "admin") return { ok: false, reason: "unauthorized" };
    // Passcode adalah kunci ruang admin, jadi hanya akun pemilik yang boleh
    // menggantinya. Tombol di UI disembunyikan untuk yang lain, tapi itu
    // sekadar tampilan; batas yang sebenarnya ada di sini.
    const isOwner = await ctx.runQuery(anyApi.adminGate.callerIsOwnerAccount, {});
    if (!isOwner) return { ok: false, reason: "owner_only" };

    const config = await ctx.runQuery(anyApi.adminGate.passcodeConfig, {});
    if (!config.hash) return { ok: false, reason: "unconfigured" };
    const parsed = parsePasscodeHash(config.hash);
    if (!parsed) throw new Error("Passcode admin belum dikonfigurasi dengan benar di server.");

    const candidate = normalizePasscode(args.currentPasscode);
    const matches =
      candidate.length > 0 &&
      candidate.length <= PASSCODE_MAX_LENGTH &&
      timingSafeEqual(
        await derivePasscodeHash(candidate, parsed.salt, parsed.iterations),
        parsed.hash,
      );
    if (!matches) return { ok: false, reason: "wrong_current" };

    const assessment = assessPasscode(args.newPasscode, args.currentPasscode);
    if (!assessment.ok) return { ok: false, reason: "weak", issues: assessment.issues };

    const encoded = await encodePasscodeHash(normalizePasscode(args.newPasscode));
    const applied = await ctx.runMutation(anyApi.adminGate.applyPasscodeChange, { hash: encoded });
    return { ok: true, revokedTickets: applied.revokedTickets, level: assessment.level };
  },
});

/**
 * Logout admin.
 *
 * Yang diinvalidasi di sisi server: presence (supaya sesi ini tidak lagi
 * ditandai "Aktif sekarang") dan jejak audit. Token sesi Convex Auth sendiri
 * dicabut oleh `signOut()` di browser; begitu JWT dicabut, setiap query
 * berikutnya ditolak server, jadi tombol Back tidak membuka apa-apa.
 */
/**
 * Jejak bahwa Security Desk dibuka.
 *
 * Sengaja mutation, bukan query: query Convex tidak boleh menulis. Jadi panel
 * memanggilnya sekali saat dibuka dan sekali saat detail satu baris dibuka,
 * supaya ada jejak siapa yang meninjau data login tanpa menambah satu
 * write per render.
 */
export const recordSecurityDeskEvent = mutation({
  args: {
    kind: v.union(v.literal("viewed"), v.literal("detail_viewed")),
    attemptId: v.optional(v.id("adminPasscodeAttempts")),
    windowHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, role } = await requireManagementViewer(ctx);
    await writeAudit(ctx, {
      action: args.kind === "viewed" ? "admin.security_viewed" : "admin.security_detail_viewed",
      actorId: userId,
      entityId: args.attemptId,
      metadata: {
        role,
        ...(args.windowHours ? { windowHours: args.windowHours } : {}),
      },
    });
    return true;
  },
});

export const logoutAdmin = mutation({
  args: { route: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId, role } = await requireStaff(ctx);
    const presence = await ctx.db
      .query("adminPresence")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    if (presence) await ctx.db.delete(presence._id);
    await writeAudit(ctx, {
      action: "admin.logout",
      actorId: userId,
      entityId: String(userId),
      newValue: role,
      metadata: { route: (args.route ?? "/admin").slice(0, 60) },
    });
    return { at: Date.now() };
  },
});

/**
 * Simpan konteks server untuk sesi yang sedang aktif, supaya panel "Sesi Anda"
 * menampilkan IP yang benar-benar diamati origin — bukan yang diklaim browser.
 * Nilainya disamarkan persis seperti di log percobaan masuk.
 */
export const reportSessionContext = mutation({
  args: {
    token: v.string(),
    ipHash: v.optional(v.string()),
    ipMasked: v.optional(v.string()),
    ipSource: v.optional(v.string()),
    ipFamily: v.optional(v.string()),
    requestId: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    deviceType: v.optional(v.string()),
    timezone: v.optional(v.string()),
    // Klien mengirim device id mentah, sama seperti saat login. Yang tersimpan
    // di server tetap hasil hash-nya, persis seperti `verifyAdminPasscode`
    // melakukan. Kalau klien boleh mengirim sidik jadi, kedua sisi tidak pernah
    // bisa dibandingkan — dan device id mentah ikut bocor ke tabel presence.
    deviceId: v.optional(v.string()),
    // Nama lama. Klien versi sebelumnya mengirim device id mentah di sini juga,
    // jadi nilainya identik dan bisa langsung di-hash. Satu argumen transisional
    // ini membuat urutan deploy tidak penting: klien lama tidak diam-diam gagal
    // heartbeat, dan adaptsinya ke bentuk baru selesai sendiri.
    sessionFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    if (!(await getStaffAccess(ctx, userId))) return null;
    const now = Date.now();
    const deviceId = args.deviceId ?? args.sessionFingerprint;
    const sessionFingerprint = deviceId
      ? await deriveSessionFingerprint(deviceId, FINGERPRINT_SALT)
      : undefined;
    // Id sesi dibaca dari JWT yang ditandatangani server, tidak pernah dari
    // klien. Kalau ini diambil dari argumen, siapa pun bisa menulis id sesi
    // orang lain lalu mencabutnya.
    const sessionId = await getAuthSessionId(ctx);
    const sessionReference = sessionId ? await sha256Hex(sessionId) : null;
    const existing = await ctx.db
      .query("adminPresence")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    const isNewSession = !existing || existing.sessionFingerprint !== sessionFingerprint;
    const fields = {
      sessionFingerprint: sessionFingerprint ?? existing?.sessionFingerprint,
      ipHash: args.ipHash ?? existing?.ipHash,
      ipMasked: args.ipMasked ?? existing?.ipMasked,
      ipSource: args.ipSource ?? existing?.ipSource,
      ipFamily: args.ipFamily ?? existing?.ipFamily,
      requestId: args.requestId ?? existing?.requestId,
      userAgent: args.userAgent ?? existing?.userAgent,
      browser: args.browser ?? existing?.browser,
      os: args.os ?? existing?.os,
      deviceType: args.deviceType ?? existing?.deviceType,
      timezone: args.timezone ?? existing?.timezone,
      lastSeenAt: now,
      sessionReference: sessionReference ?? existing?.sessionReference,
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        // `signedInAt` hanya bergerak saat perangkatnya benar-benar berganti,
        // jadi heartbeat tiap menit tidak mereset "masuk sejak".
        signedInAt: isNewSession ? now : existing.signedInAt ?? now,
        firstSeenAt: existing.firstSeenAt ?? now,
      });
    } else {
      await ctx.db.insert("adminPresence", {
        userId,
        ...fields,
        firstSeenAt: now,
        signedInAt: now,
      });
    }
    // Ikat percobaan login berhasil terakhir ke sesi yang baru saja terbukti
    // nyata. Tanpa langkah ini Security Desk hanya tahu "passcode cocok", bukan
    // "ada sesi hidup dari perangkat ini" — sehingga tidak ada yang bisa
    // dicabut. Lihat `adminSessionBindings` di schema.
    if (sessionId && sessionReference && sessionFingerprint) {
      await bindAttemptToSession(ctx, {
        userId,
        sessionId,
        sessionReference,
        fingerprint: sessionFingerprint,
      });
    }
    return { isNewSession };
  },
});

/**
 * Seberapa lama percobaan "berhasil" masih boleh diklaim oleh sebuah sesi.
 *
 * Jendelanya longgar karena pencocokan sekarang WAJIB persis pada sidik jari
 * perangkat, bukan sekadar "percobaan sukses terbaru". Device id yang sudah
 * di-hash dan bergaram tidak bisa ditebak, jadi melebar jendela di sini tidak
 * menambah permukaan serangan. Justru sebaliknya: pengikatan jadi andal
 * tanpa perlu melonggarkan pengecekan sama sekali.
 */
const SESSION_BIND_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Menemukan percobaan "berhasil" yang menjadi asal sesi ini lalu mengikatnya.
 *
 * Syaratnya sengaja ketat: hanya percobaan sukses, hanya yang belum terikat,
 * dan sidik jarinya harus PERSIS sama dengan perangkat yang sedang melapor.
 *
 * Sebelumnya ada fallback "ambil kandidat terbaru saja" kalau sidik jarinya
 * tidak cocok. Fallback itu yang membuat dua admin yang kebetulan login di
 * menit yang sama bisa saling mengambil-alih percobaan, sehingga tombol
 * "Cabut Sesi Ini" bisa mengarahkan admin mencabut perangkat yang salah.
 * Fallback itu sudah dihapus; sekarang tidak cocok berarti tidak terikat, dan
 * UI jujur menampilkan "sesi tidak terlacak".
 */
async function bindAttemptToSession(
  ctx: GenericMutationCtx<DataModel>,
  args: {
    userId: DataModel["users"]["document"]["_id"];
    sessionId: DataModel["authSessions"]["document"]["_id"];
    sessionReference: string;
    fingerprint?: string;
  },
) {
  if (!args.fingerprint) return null;
  const windowStart = Date.now() - SESSION_BIND_WINDOW_MS;
  const candidates = (
    await ctx.db
      .query("adminPasscodeAttempts")
      .withIndex("byCreatedAt", (q) => q.gte("createdAt", windowStart))
      .collect()
  )
    .filter(
      (row) =>
        row.outcome === "success" &&
        !row.sessionReference &&
        row.sessionFingerprint === args.fingerprint,
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  const match = candidates[0];
  if (!match) return null;

  await ctx.db.insert("adminSessionBindings", {
    attemptId: match._id,
    userId: args.userId,
    sessionId: args.sessionId,
    sessionReference: args.sessionReference,
    sessionFingerprint: args.fingerprint,
    createdAt: Date.now(),
  });
  await ctx.db.patch(match._id, { sessionReference: args.sessionReference });
  return match._id;
}

/**
 * Mencabut satu sesi admin dari Security Desk.
 *
 * Yang dicabut hanya sesi target. Sesi pemanggil sendiri dikecualikan secara
 * eksplisit: menekan tombol dari perangkat yang sedang dipakai harus berarti
 * "keluar dari perangkat ini", bukan "matikan semua sesi saya".
 *
 * Sisi idempoten: memanggilnya dua kali pada sesi yang sama tidak melempar
 * error, hanya mengembalikan waktu pencabutan yang pertama.
 */
export const revokeAdminSession = mutation({
  args: { attemptId: v.id("adminPasscodeAttempts"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireStaff(ctx, "admin");
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) return { ok: false as const, reason: "ATTEMPT_NOT_FOUND" as const };
    if (attempt.outcome !== "success") {
      return { ok: false as const, reason: "NOT_A_SUCCESSFUL_ATTEMPT" as const };
    }
    const binding = await ctx.db
      .query("adminSessionBindings")
      .withIndex("byAttempt", (q) => q.eq("attemptId", args.attemptId))
      .unique();
    // Percobaan lama, sebelum fitur ini ada, memang tidak punya pengikat.
    // UI sudah menampilkan ini sebagai "sesi tidak terlacak", bukan error.
    if (!binding) return { ok: false as const, reason: "SESSION_NOT_FOUND" as const };

    const already = await ctx.db
      .query("revokedAdminSessions")
      .withIndex("bySession", (q) => q.eq("sessionId", binding.sessionId))
      .unique();
    if (already) {
      return { ok: true as const, revokedAt: already.revokedAt, alreadyRevoked: true as const };
    }

    // Sesi sendiri BOLEH dicabut, tapi hanya sesi itu sendiri. Ini berbeda
    // dari `invalidateSessions` milik Convex Auth yang bisa mematikan semua
    // sesi milik satu pengguna: di sini yang dicabut tepat satu `sessionId`,
    // sehingga perangkat lain milik admin yang sama tidak ikut tersentuh.
    // Sesi remote tidak pernah ikut: target sudah dipastikan satu baris
    // binding, bukan "semua sesi milik user".
    const ownSession = await getAuthSessionId(ctx);
    const isCurrentSession = Boolean(ownSession && binding.sessionId === ownSession);

    const revokedAt = Date.now();
    await ctx.db.insert("revokedAdminSessions", {
      sessionId: binding.sessionId,
      userId: binding.userId,
      attemptId: args.attemptId,
      reason: args.reason?.slice(0, 200) || undefined,
      revokedAt,
      revokedBy: access.userId,
    });
    await ctx.db.patch(args.attemptId, { sessionRevokedAt: revokedAt });

    // Kehadiran dicatat per pengguna, bukan per sesi, jadi baris Presence milik
    // perangkat lain TIDAK ikut dihapus — memotongnya akan membuat perangkat
    // yang masih aktif terlihat offline. Yang dilepas hanya sidik jarinya, dan
    // hanya kalau memang milik perangkat yang dicabut.
    const presence = await ctx.db
      .query("adminPresence")
      .withIndex("byUser", (q) => q.eq("userId", binding.userId))
      .unique();
    if (presence && presence.sessionReference === binding.sessionReference) {
      await ctx.db.patch(presence._id, {
        sessionFingerprint: undefined,
        sessionReference: undefined,
      });
    }

    await writeAudit(ctx, {
      action: "admin.session_revoked",
      actorId: access.userId,
      entityId: args.attemptId,
      // Hanya ringkasan terbaca manusia. Tidak ada id sesi, access token,
      // refresh token, cookie, atau passcode yang masuk ke audit.
      //
      // `targetSessionRef` dan `targetUserRef` sengaja hanya potongan pendek
      // dari hash yang dihitung server: cukup untuk mengaitkan dan mencari
      // baris audit, tidak cukup untuk dipakai ulang sebagai kredensial.
      metadata: {
        targetIpMasked: attempt.ipMasked || undefined,
        targetBrowser: attempt.browser || undefined,
        targetOs: attempt.os || undefined,
        reason: args.reason?.slice(0, 200) || undefined,
        targetSessionRef: binding.sessionReference.slice(0, 8),
        targetUserRef: await maskUserReference(binding.userId),
        requestId: maskRequestId(attempt.requestId) || undefined,
        selfRevoked: isCurrentSession,
      },
    });
    return {
      ok: true as const,
      revokedAt,
      alreadyRevoked: false as const,
      // Sinyal ke klien supaya perangkat ini melakukan signOut + redirect,
      // bukan tertinggal dengan UI yang masih aktif.
      selfRevoked: isCurrentSession,
    };
  },
});

/**
 * Referensi pengguna yang aman untuk ditulis di audit.
 *
 * Id dokumen Convex adalah pengenal internal: ia menunjuk baris database dan
 * tidak perlu ikut jejak. Yang dibutuhkan audit adalah sesuatu yang bisa
 * dicari admin tanpa membuka identitas. Enam karakter pertama dari SHA-256 id
 * itu cukup — tidak bisa dibalik ke id asli tanpa menebak ruang yang sangat besar,
 * tapi tetap stabil sehingga dua baris audit untuk orang yang sama bisa
 * dikelompokkan.
 */
async function maskUserReference(userId: string): Promise<string> {
  return (await sha256Hex(userId)).slice(0, 12);
}

/**
 * Status siklus hidup sesi untuk satu baris percobaan.
 *
 * "Tidak ada baris yang dicabut" TIDAK otomatis berarti aktif. Baris
 * `authSessions` milik Convex Auth dihapus sendiri saat logout atau kedaluwarsa,
 * jadi kalau baris itu hilang sementara tidak ada catatan pencabutan, sesi
 * memang sudah berakhir — bukan sedang aktif. Tanpa pemeriksaan ini, semua
 * sesi yang sudah tutup akan tetap terlihat "aktif" dan admin bisa ditipu
 * oleh Security Desk.
 *
 * Sumber kebenarannya tetap `authSessions.expirationTime` milik Convex Auth.
 * Tidak ada salinan waktu kedaluwarsa di tabel binding kita, jadi tidak ada
 * yang bisa basi.
 */
async function stateOfAttempt(
  ctx: GenericQueryCtx<DataModel>,
  row: DataModel["adminPasscodeAttempts"]["document"],
  ownSessionReference: string | null,
): Promise<AdminSessionState> {
  if (row.outcome !== "success") return "none";
  if (row.sessionRevokedAt) return "revoked";
  if (!row.sessionReference) return "untracked";
  if (ownSessionReference && row.sessionReference === ownSessionReference) return "current";
  const binding = await ctx.db
    .query("adminSessionBindings")
    .withIndex("byAttempt", (q) => q.eq("attemptId", row._id))
    .unique();
  if (!binding) return "untracked";
  const live = await ctx.db.get(binding.sessionId);
  if (!live || live.expirationTime < Date.now()) return "expired";
  return "active";
}

/** Keadaan siklus hidup satu sesi, dipakai bersama watchdog dan Security Desk. */
export type AdminSessionState =
  | "none"
  | "untracked"
  | "active"
  | "current"
  | "revoked"
  | "expired";

/**
 * Watchdog reaktif: memberi tahu klien status sesi yang SEDANG dipakainya.
 *
 * Yang membuatnya penting adalah apa yang TIDAK dilakkukannya: query ini
 * sengaja TIDAK memanggil `requireStaff`, jadi ia tidak melempar
 * `SESSION_REVOKED`. Kalau ia ikut melempar, perangkat yang dicabut tidak
 * akan pernah sempat membaca "saya sudah dicabut" — ia hanya akan melihat
 * error. Di sini, klien bisa keluar dengan rapi: satu toast, satu
 * `signOut()`, satu redirect.
 *
 * Penegakan di server tetap ada dan tidak berubah: semua operasi admin tetap
 * melewati `assertSessionNotRevoked` lewat `requireUser`. Watchdog hanya
 * membuat pengalaman keluarnya remote logout terasa bersih.
 *
 * Biaya: satu index read pada `revokedAdminSessions.bySession` plus satu
 * `db.get` pada baris `authSessions`. Tidak ada pemindaian tabel, tidak ada
 * riwayat sesi yang ditarik.
 */
export const currentAdminSessionStatus = query({
  args: {},
  handler: async (ctx) => {
    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) return { status: "none" as const };

    const revoked = await ctx.db
      .query("revokedAdminSessions")
      .withIndex("bySession", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (revoked) {
      return { status: "revoked" as const, revokedAt: revoked.revokedAt };
    }

    // Sumber kebenaran masa berlaku tetap milik Convex Auth: `authSessions`.
    // Tidak ada salinan `expiredAt` di tabel binding, jadi tidak ada yang bisa
    // basi. Baris `authSessions` dihapus oleh Convex Auth saat logout atau
    // kedaluwarsa — jadi "baris tidak ada" sama dengan "sesi sudah berakhir".
    const live = await ctx.db.get(sessionId);
    if (!live) return { status: "expired" as const };
    if (live.expirationTime < Date.now()) return { status: "expired" as const };
    return { status: "active" as const };
  },
});

/** Panel "Sesi Anda". Hanya untuk pengelola, hanya tentang dirinya sendiri. */
export const currentAdminSession = query({
  args: {},
  handler: async (ctx) => {
    const { userId, role } = await requireStaff(ctx);
    const user = await ctx.db.get(userId);
    const presence = await ctx.db
      .query("adminPresence")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    return {
      role,
      // Dihitung server dari aturan yang sama dengan gerbang passcode.
      // Klien tidak pernah menentukan sendiri apakah ia pemilik.
      isOwnerAccount: isOwnerAccount(user?.email),
      name: user?.name ?? null,
      signedInAt: presence?.signedInAt ?? presence?.lastSeenAt ?? null,
      lastSeenAt: presence?.lastSeenAt ?? null,
      active: presence ? now - presence.lastSeenAt < PRESENCE_STALE_MS : false,
      sessionFingerprint: maskFingerprint(presence?.sessionFingerprint),
      requestId: maskRequestId(presence?.requestId),
      ipMasked: presence?.ipMasked ?? null,
      ipSource: presence?.ipSource ?? null,
      ipFamily: presence?.ipFamily ?? null,
      userAgent: presence?.userAgent ?? null,
      browser: presence?.browser ?? null,
      os: presence?.os ?? null,
      deviceType: presence?.deviceType ?? null,
      timezone: presence?.timezone ?? null,
    };
  },
});
