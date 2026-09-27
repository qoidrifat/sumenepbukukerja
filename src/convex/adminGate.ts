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
// Data yang dikirim perangkat (IP, user agent, timezone, locale) adalah laporan
// klien, bukan bukti. Convex tidak mengekspos IP asli permintaan. Data itu
// dipakai untuk rate limit dan jejak audit, dan selalu disimpan tersamar.

import { anyApi } from "convex/server";
import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { requireManagementViewer } from "./access";
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

const TICKET_TTL_MS = 10 * 60_000;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const passcodeHashEnv = () => process.env.ADMIN_PASSCODE_HASH?.trim();

type AttemptContext = {
  key: string;
  emailMasked?: string;
  reportedIp?: string;
  userAgent?: string;
  timezone?: string;
  locale?: string;
};

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
    emailMasked: v.optional(v.string()),
    reportedIp: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("adminPasscodeAttempts", {
      key: args.key,
      outcome: args.outcome,
      emailMasked: args.emailMasked,
      reportedIp: args.reportedIp,
      userAgent: args.userAgent,
      timezone: args.timezone,
      locale: args.locale,
      createdAt: Date.now(),
    });
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
  failedAttempts: number;
};

export type VerifyPasscodeResult =
  | { ok: true; ticket: string; expiresAt: number }
  | {
      ok: false;
      reason: "invalid" | "locked" | "unconfigured";
      remaining: number;
      lockedUntil: number | null;
      attempts: number;
      alert?: GateAlert;
    };

export const verifyAdminPasscode = action({
  args: {
    passcode: v.string(),
    email: v.optional(v.string()),
    deviceId: v.string(),
    reportedIp: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
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

    const email = (args.email ?? "").trim().toLowerCase();
    const key = await deriveAttemptKey({
      deviceId: args.deviceId,
      reportedIp: args.reportedIp,
    });
    const context: AttemptContext = {
      key,
      emailMasked: maskEmail(email) ?? undefined,
      reportedIp: maskIp(args.reportedIp) ?? undefined,
      userAgent: trimUserAgent(args.userAgent) ?? undefined,
      timezone: args.timezone?.trim().slice(0, 60) || undefined,
      locale: args.locale?.trim().slice(0, 20) || undefined,
    };

    const window = await ctx.runMutation(anyApi.adminGate.attemptWindow, { key });
    const globalFailures = await ctx.runMutation(anyApi.adminGate.globalFailureCount, {});

    if (window.count >= MAX_ATTEMPTS || globalFailures >= GLOBAL_ATTEMPT_CEILING) {
      const lockedUntil = window.latestAt + LOCKOUT_MS;
      await ctx.runMutation(anyApi.adminGate.recordAttempt, {
        ...context,
        outcome: "locked",
      });
      return {
        ok: false,
        reason: "locked",
        remaining: 0,
        lockedUntil: Math.max(lockedUntil, Date.now() + 60_000),
        attempts: window.count,
        alert: { ...context, emailMasked: context.emailMasked ?? null, reportedIp: context.reportedIp ?? null, userAgent: context.userAgent ?? null, timezone: context.timezone ?? null, locale: context.locale ?? null, failedAttempts: window.count },
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
        ...context,
        outcome: "failed",
      });
      const used = window.count + 1;
      return {
        ok: false,
        reason: "invalid",
        remaining: Math.max(0, MAX_ATTEMPTS - used),
        lockedUntil: null,
        attempts: used,
      };
    }

    // Passcode benar: terbitkan tiket sekali pakai. Email baru diketahui pada
    // langkah verifikasi email, jadi tidak ditanyakan di sini.
    const ticket = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = toHex(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket))),
    );
    const expiresAt = await ctx.runMutation(anyApi.adminGate.issueTicket, { tokenHash });
    await ctx.runMutation(anyApi.adminGate.recordAttempt, { ...context, outcome: "success" });
    return { ok: true, ticket, expiresAt };
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
 * Nilai yang dikembalikan sudah tersamar di sisi server.
 */
export const listAdminSecurityEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const rows = await ctx.db.query("adminPasscodeAttempts").withIndex("byCreatedAt").collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(args.limit ?? 25, 1), 100))
      .map((row) => ({
        _id: row._id,
        outcome: row.outcome,
        emailMasked: row.emailMasked ?? null,
        reportedIp: row.reportedIp ?? null,
        userAgent: row.userAgent ?? null,
        timezone: row.timezone ?? null,
        locale: row.locale ?? null,
        createdAt: row.createdAt,
      }));
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
    return sorted.length - keep;
  },
});
