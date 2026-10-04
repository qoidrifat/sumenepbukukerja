// OTP email Fase 9.5 — kirim kode verifikasi lewat Resend milik sendiri.
//
// Alurnya: `requestCode` (action publik, tanpa sesi — pemanggilnya memang
// belum masuk) menormalisasi email, menegakkan plafon 5/jam + cooldown 60
// dtk, POST ke Resend DULU, dan HANYA bila kiriman 2xx menyimpan hash SHA-256
// kode. Verifikasi kode terjadi di provider `auth/otpEmail.ts` lewat
// `verifyOtpCode` di bawah, bukan di sini, supaya pemeriksaan dan pembakaran
// kode dalam satu transaksi.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import {
  isValidEmail,
  MAX_SENDS_PER_HOUR,
  MAX_VERIFY_ATTEMPTS,
  normalizeEmail,
  OTP_FROM,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  RESEND_ENDPOINT,
  sha256Hex,
} from "../lib/otp-email";
import { renderOtpEmailHtml } from "./emailTemplates";

/** Probe konfigurasi untuk UI: tidak membocorkan kunci, hanya ada/tidaknya. */
export const status = query({
  args: {},
  handler: async () => ({ enabled: Boolean(process.env.RESEND_API_KEY?.trim()) }),
});

/** Fetch provider dibungkus supaya kegagalan jaringan punya pesan sendiri. */
const fetchProvider = async (url: string, init: RequestInit) => {
  try {
    return await fetch(url, init);
  } catch (error) {
    console.error("[OTP_EMAIL] jaringan Resend gagal", error instanceof Error ? error.name : "unknown");
    throw new ConvexError("Email belum terkirim. Coba lagi sebentar lagi.");
  }
};

async function sendViaResend(email: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.error("[OTP_EMAIL] RESEND_API_KEY belum dikonfigurasi");
    throw new ConvexError("Email belum terkirim. Coba lagi sebentar lagi.");
  }
  const response = await fetchProvider(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: OTP_FROM,
      to: [email],
      subject: "Kode verifikasi Sumenep Buku Kerja",
      html: renderOtpEmailHtml(code, new Date().getFullYear()),
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    // Status dicatat server; klien hanya menerima pesan generik supaya detail
    // provider (kuota, kunci, validasi) tidak bocor.
    console.error("[OTP_EMAIL] Resend menolak kiriman", { status: response.status });
    throw new ConvexError("Email belum terkirim. Coba lagi sebentar lagi.");
  }
}

/**
 * Jendela kiriman untuk satu email: berapa kiriman dalam satu jam terakhir
 * dan kapan kiriman terbaru. Enam baris terbaru cukup — plafonnya 5, jadi
 * kalau enam-enamnya di dalam jendela, plafon pasti terlampaui.
 */
export const sendWindow = internalQuery({
  args: { email: v.string(), since: v.number() },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("emailOtpCodes")
      .withIndex("byEmail", (q) => q.eq("email", args.email))
      .order("desc")
      .take(6);
    return {
      count: latest.filter((row) => row.createdAt >= args.since).length,
      latestCreatedAt: latest[0]?.createdAt ?? 0,
    };
  },
});

/**
 * Simpan kode baru: tandai baris aktif lama (belum dipakai, belum
 * kedaluwarsa) sebagai terpakai, lalu sisipkan baris baru. Kode lama mati
 * begitu kode baru diminta — hanya satu kode hidup per email.
 *
 * Bacaannya bounded: yang aktif pasti baris terbaru (setiap kiriman membakar
 * semua yang aktif saat itu), jadi 6 baris terbaru lebih dari cukup tanpa
 * pernah memindai seluruh riwayat satu email.
 */
export const storeOtpCode = internalMutation({
  args: {
    email: v.string(),
    codeHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("emailOtpCodes")
      .withIndex("byEmail", (q) => q.eq("email", args.email))
      .order("desc")
      .take(6);
    for (const row of rows) {
      if (!row.consumedAt && row.expiresAt > args.createdAt) {
        await ctx.db.patch(row._id, { consumedAt: args.createdAt });
      }
    }
    await ctx.db.insert("emailOtpCodes", {
      email: args.email,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      attempts: 0,
      createdAt: args.createdAt,
    });
  },
});

/**
 * Retensi `emailOtpCodes`: hapus baris mati (terpakai/kedaluwarsa) yang
 * umurnya lewat 7 hari. Dipanggil cron harian (lihat `crons.ts`).
 *
 * Yang TIDAK dihapus: baris yang masih hidup (belum dipakai + belum
 * kedaluwarsa) — umurnya tidak mungkin lewat 7 hari (TTL 10 menit), tapi
 * syaratnya ditulis eksplisit supaya prune tidak pernah bisa membunuh kode
 * yang masih bisa dipakai. Baris mati yang masih muda (<7 hari) juga
 * dipertahankan supaya jendela plafon 5/jam tetap bisa dihitung.
 */
export const pruneOtpCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - 7 * 24 * 60 * 60_000;
    const rows = await ctx.db
      .query("emailOtpCodes")
      .withIndex("byCreatedAt")
      .order("asc")
      .take(200);
    let removed = 0;
    for (const row of rows) {
      if (row.createdAt >= cutoff) break;
      if (!row.consumedAt && row.expiresAt >= now) continue;
      await ctx.db.delete(row._id);
      removed += 1;
    }
    return removed;
  },
});

/**
 * Verifikasi satu kode dalam satu transaksi: baca baris terbaru, bandingkan
 * hash, catat kegagalan, bakar saat cocok. Mengembalikan `{ ok }` generik —
 * alasan gagal tidak keluar dari server.
 */
export const verifyOtpCode = internalMutation({
  args: { email: v.string(), codeHash: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("emailOtpCodes")
      .withIndex("byEmail", (q) => q.eq("email", args.email))
      .order("desc")
      .first();
    if (!row || row.consumedAt || now > row.expiresAt) return { ok: false };
    if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
      await ctx.db.patch(row._id, { consumedAt: now });
      return { ok: false };
    }
    if (row.codeHash !== args.codeHash) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      return { ok: false };
    }
    await ctx.db.patch(row._id, { consumedAt: now, attempts: row.attempts + 1 });
    return { ok: true };
  },
});

export const requestCode = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; retryAfterMs: number }> => {
    const generic = { ok: true as const, retryAfterMs: RESEND_COOLDOWN_MS };
    const email = normalizeEmail(args.email);
    // Anti user-enumeration: email tak dikenal mendapat respons SAMA dengan
    // sukses — tanpa baris DB, tanpa panggilan provider.
    if (!isValidEmail(email)) return generic;
    const now = Date.now();
    const window = await ctx.runQuery(internal.otpEmail.sendWindow, {
      email,
      since: now - 3_600_000,
    });
    if (window.count >= MAX_SENDS_PER_HOUR) {
      throw new ConvexError("Terlalu banyak permintaan. Coba lagi nanti.");
    }
    if (window.latestCreatedAt > 0 && now - window.latestCreatedAt < RESEND_COOLDOWN_MS) {
      return { ok: true, retryAfterMs: window.latestCreatedAt + RESEND_COOLDOWN_MS - now };
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
    const codeHash = await sha256Hex(code);
    // Kirim DULU, simpan BELAKANGAN: kiriman yang gagal (non-2xx/jaringan)
    // melempar sebelum ada baris baru, jadi tidak membakar plafon 5/jam
    // dan tidak memulai cooldown 60 dtk untuk email yang tak terkirim.
    await sendViaResend(email, code);
    await ctx.runMutation(internal.otpEmail.storeOtpCode, {
      email,
      codeHash,
      expiresAt: now + OTP_TTL_MS,
      createdAt: now,
    });
    return generic;
  },
});
