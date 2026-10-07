// Profil warga Fase 9.6 — kelengkapan data diri + verifikasi nomor WhatsApp.
//
// Gate dashboard ("lengkapi profil") membaca `myProfileStatus`: lengkap bila
// nama + nomor terverifikasi + alamat semuanya ada.
//
// Dua jalur verifikasi nomor (satu tabel, satu kontrak keamanan):
//  - inbound (AKTIF): server menerbitkan kode `K-XXXX` + tautan chat;
//    pengguna mengirim kode dari nomornya, webhook mencocokkan
//    (`phoneVault.claimInboundVerificationCode`). Tanpa template, tanpa
//    biaya, tanpa SMS.
//  - outbound (DORMAN sampai template OTP WhatsApp disetujui):
//    `requestPhoneCode` mengirim kode 6 digit sebagai pesan WhatsApp.
//
// Bentuk kode meniru `emailOtpCodes` dengan sengaja: hash SHA-256 saja, sekali
// pakai, kedaluwarsa 10 menit, plafon kirim 5/jam + cooldown 60 dtk, plafon
// 5x salah. Bedanya kunci baris: (userId, phone).
//
// Nomor disimpan terenkripsi lewat `phoneVault.preparePhone` (sama seperti
// preferensi notifikasi) dan `whatsappVerifiedAt` dicatat saat kode cocok.
// Mengganti nomor di `setNotificationPreferences` menghapus stempel itu
// (lihat community.ts) supaya nomor baru wajib diverifikasi ulang.
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { denied, requireUser } from "./access";
import { sha256Hex } from "../lib/otp-email";
import {
  PHONE_CODE_TTL_MS,
  PHONE_MAX_SENDS_PER_HOUR,
  PHONE_RESEND_COOLDOWN_MS,
} from "../lib/otp-email";
import { checkDisplayNameInput, resolveDisplayName } from "../lib/display-name";
import { readStoredPhone, storeVerifiedPhone } from "./phoneVault";
import { sendWhatsappMessage } from "./whatsapp";

/**
 * Kode inbound yang ditampilkan ke pengguna, mis. `K-4829`. Bentuknya
 * disengaja beda dari OTP email 6 digit supaya keduanya tidak tertukar di
 * log, laporan, maupun pikiran pengguna. Alfabet tanpa 0/O/1/I/L agar
 * tidak salah baca saat diketik ulang dari layar.
 */
const INBOUND_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeInboundCode(randomValues: Uint32Array): string {
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += INBOUND_ALPHABET[(randomValues[i] ?? 0) % INBOUND_ALPHABET.length];
  }
  return `K-${suffix}`;
}

/** Nomor WhatsApp bisnis publik (tujuan click-to-chat verifikasi). */
function businessChatNumber(): string {
  const raw = (process.env.WHATSAPP_BUSINESS_NUMBER ?? "").replace(/\D/g, "");
  const normalized = raw.replace(/^0/, "62");
  if (normalized.length < 10 || normalized.length > 15) return "";
  return normalized;
}

/**
 * Teks chat yang terisi otomatis saat pengguna menekan "Buka WhatsApp
 * bisnis". Sopan dan jelas bagi manusia yang membacanya di sisi bisnis,
 * membawa data diri dari form gate (nama, email, nomor, alamat) supaya
 * pengelola langsung tahu siapa, dan tetap mengandung kode dalam bentuk
 * yang bisa diekstrak webhook (`K-XXXX` berdiri sendiri di barisnya).
 *
 * Nilai dirapikan (tanpa baris baru liar, dibatasi panjang) supaya satu
 * isian nakal tidak merusak susunan pesan.
 */
export function buildInboundChatText(input: {
  code: string;
  name: string;
  email?: string;
  phone: string;
  address: string;
}): string {
  const oneLine = (value: string, max: number) =>
    value.replace(/\s+/g, " ").trim().slice(0, max);
  const lines = [
    "Halo Sumenep Buku Kerja,",
    "",
    "Saya ingin memverifikasi nomor WhatsApp saya dengan data berikut:",
    "",
    `Nama: ${oneLine(input.name, 60) || "-"}`,
    `Email: ${oneLine(input.email ?? "", 80) || "-"}`,
    `Nomor WhatsApp: ${oneLine(input.phone, 20)}`,
    `Alamat: ${oneLine(input.address, 300) || "-"}`,
    "",
    `Kode verifikasi: ${input.code}`,
    "",
    "Terima kasih.",
  ];
  return lines.join("\n");
}

export function normalizeProfilePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0/, "62");
}

export function isValidProfilePhone(phone: string): boolean {
  return phone.length >= 10 && phone.length <= 15;
}

/**
 * Status kelengkapan untuk gate dashboard. Server yang memutuskan, bukan
 * klien: modal tampil/tutup murni mengikuti nilai ini (realtime), jadi
 * refresh tidak bisa mengakali gate.
 */
export const myProfileStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const prefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .unique();
    // Dekripsi bisa gagal (kunci hilang/rotasi): anggap nomor belum ada
    // supaya form meminta ulang, bukan meledakkan dashboard.
    let phone = "";
    try {
      phone =
        (prefs ? await readStoredPhone(prefs.whatsappPhoneEnc, prefs.whatsappPhone) : undefined) ??
        "";
    } catch {
      phone = "";
    }
    const name = resolveDisplayName(user?.publicName, user?.email);
    const nameSet = Boolean(user?.publicName);
    const phoneVerified = Boolean(prefs?.whatsappVerifiedAt) && phone !== "";
    const address = user?.homeAddress?.trim() ?? "";
    const complete = nameSet && phoneVerified && address.length >= 5;
    return {
      complete,
      name: user?.publicName ?? "",
      nameSuggestion: nameSet ? "" : name,
      phone,
      phoneVerified,
      address,
    };
  },
});

/** Jendela kiriman kode per (pengguna, nomor): plafon + cooldown. */
export const phoneSendWindow = internalQuery({
  args: { userId: v.id("users"), phone: v.string(), since: v.number() },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("phoneVerificationCodes")
      .withIndex("byUserPhone", (q) => q.eq("userId", args.userId).eq("phone", args.phone))
      .order("desc")
      .take(6);
    return {
      count: latest.filter((row) => row.createdAt >= args.since).length,
      latestCreatedAt: latest[0]?.createdAt ?? 0,
    };
  },
});

/** Simpan kode baru; bakar semua kode aktif lama untuk pasangan ini. */
export const storePhoneCode = internalMutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
    codeHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("phoneVerificationCodes")
      .withIndex("byUserPhone", (q) => q.eq("userId", args.userId).eq("phone", args.phone))
      .order("desc")
      .take(6);
    for (const row of rows) {
      if (!row.consumedAt && row.expiresAt > args.createdAt) {
        await ctx.db.patch(row._id, { consumedAt: args.createdAt });
      }
    }
    await ctx.db.insert("phoneVerificationCodes", {
      userId: args.userId,
      phone: args.phone,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      attempts: 0,
      createdAt: args.createdAt,
    });
  },
});

/**
 * Minta kode verifikasi inbound: server TIDAK mengirim apa pun, hanya
 * menerbitkan kode + tautan chat. Pengguna yang mengirim kode dari nomornya
 * Kode inbound (`K-XXXX`, lihat `requestInboundCode`) yang dikirim pengguna
 * dari nomornya sendiri (dicocokkan `phoneVault.claimInboundVerificationCode`
 * yang dipanggil webhook) membuktikan kepemilikan.
 *
 * Dipakai selama template OTP WhatsApp belum ada. Setelah template live,
 * `requestPhoneCode` (outbound) menjadi jalur utama dan fungsi ini tetap
 * sebagai alternatif tanpa template.
 *
 * Catatan kejujuran: kode lama TIDAK bisa ditampilkan ulang (yang tersimpan
 * hanya hash). Minta lagi dalam cooldown = hanya info sisa tunggu; kode baru
 * terbit setelah cooldown lewat dan kode lama ikut hangus.
 */
export const requestInboundCode = action({
  args: { phone: v.string(), name: v.string(), address: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; code: string; chatUrl: string; retryAfterMs: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Masuk untuk memverifikasi nomor WhatsApp");
    const business = businessChatNumber();
    if (!business) {
      throw new ConvexError("Nomor WhatsApp bisnis belum dikonfigurasi.");
    }
    const phone = normalizeProfilePhone(args.phone);
    if (!isValidProfilePhone(phone)) {
      throw new ConvexError("Masukkan nomor WhatsApp yang valid (10–15 digit).");
    }
    const now = Date.now();
    const window = await ctx.runQuery(internal.profile.phoneSendWindow, {
      userId,
      phone,
      since: now - 3_600_000,
    });
    if (window.count >= PHONE_MAX_SENDS_PER_HOUR) {
      throw new ConvexError("Terlalu banyak permintaan. Coba lagi nanti.");
    }
    if (window.latestCreatedAt > 0 && now - window.latestCreatedAt < PHONE_RESEND_COOLDOWN_MS) {
      return {
        ok: true,
        code: "",
        chatUrl: "",
        retryAfterMs: window.latestCreatedAt + PHONE_RESEND_COOLDOWN_MS - now,
      };
    }
    const code = makeInboundCode(crypto.getRandomValues(new Uint32Array(4)));
    await ctx.runMutation(internal.profile.storePhoneCode, {
      userId,
      phone,
      codeHash: await sha256Hex(code),
      expiresAt: now + PHONE_CODE_TTL_MS,
      createdAt: now,
    });
    // Email diambil dari sesi (sumber server), bukan dari argumen: tidak
    // bisa dipalsukan dari klien untuk mencatut identitas lain.
    const user = await ctx.runQuery(internal.profile.profileEmail, { userId });
    const chatText = buildInboundChatText({
      code,
      name: args.name,
      email: user?.email,
      phone,
      address: args.address,
    });
    return {
      ok: true,
      code,
      chatUrl: `https://wa.me/${business}?text=${encodeURIComponent(chatText)}`,
      retryAfterMs: PHONE_RESEND_COOLDOWN_MS,
    };
  },
});

/** Email pemilik sesi, untuk ditempel di teks chat verifikasi. */
export const profileEmail = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user ? { email: user.email } : null;
  },
});

/**
 * Minta kode verifikasi ke nomor WhatsApp milik pemanggil. Kirim DULU lewat
 * WhatsApp (template UTILITY bila dikonfigurasi, teks bebas bila belum),
 * simpan BELAKANGAN — kiriman gagal tidak membakar plafon/cooldown.
 */
export const requestPhoneCode = action({
  args: { phone: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; retryAfterMs: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Masuk untuk memverifikasi nomor WhatsApp");
    const generic = { ok: true as const, retryAfterMs: PHONE_RESEND_COOLDOWN_MS };
    const phone = normalizeProfilePhone(args.phone);
    if (!isValidProfilePhone(phone)) {
      throw new ConvexError("Masukkan nomor WhatsApp yang valid (10–15 digit).");
    }
    const now = Date.now();
    const window = await ctx.runQuery(internal.profile.phoneSendWindow, {
      userId,
      phone,
      since: now - 3_600_000,
    });
    if (window.count >= PHONE_MAX_SENDS_PER_HOUR) {
      throw new ConvexError("Terlalu banyak permintaan. Coba lagi nanti.");
    }
    if (window.latestCreatedAt > 0 && now - window.latestCreatedAt < PHONE_RESEND_COOLDOWN_MS) {
      return { ok: true, retryAfterMs: window.latestCreatedAt + PHONE_RESEND_COOLDOWN_MS - now };
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
    const codeHash = await sha256Hex(code);
    let sent: { skipped: boolean };
    try {
      sent = await sendWhatsappMessage({
        phone,
        title: "Kode verifikasi WhatsApp",
        body: `Kode verifikasi nomor WhatsApp Anda: ${code}. Berlaku 10 menit. Jangan berikan kepada siapa pun.`,
      });
    } catch {
      // Detail provider (kuota, kunci, template) tetap di server.
      throw new ConvexError("Pesan belum terkirim. Coba lagi sebentar lagi.");
    }
    if (sent.skipped) {
      throw new ConvexError("Layanan pesan WhatsApp belum dikonfigurasi.");
    }
    await ctx.runMutation(internal.profile.storePhoneCode, {
      userId,
      phone,
      codeHash,
      expiresAt: now + PHONE_CODE_TTL_MS,
      createdAt: now,
    });
    return generic;
  },
});

/**
 * Simpan data diri warga dalam satu transaksi: nama (aturan
 * `setMyDisplayName` yang sama persis) + nomor + alamat.
 *
 * Keputusan pemilik (Fase 9.6 revisi): verifikasi nomor CUKUP lewat klik
 * "Konfirmasi ke Admin" di gate (klien menandai `confirmed`, tombol Simpan
 * baru aktif). Artinya `whatsappVerifiedAt` di sini berarti "pengguna
 * menyatakan sudah mengirim kode", BUKAN "kepemilikan terbukti lewat
 * webhook" — kecuali webhook memang sempat mencocokkan lebih dulu (jalur
 * itu tetap berjalan dan menulis stempel yang sama). Nomor palsu BISA
 * masuk lewat jalur ini; itu tradeoff yang disetujui eksplisit demi
 * kelancaran onboarding. Gagal di satu bagian = tidak ada yang tersimpan
 * setengah.
 */
export const saveMyProfile = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const phone = normalizeProfilePhone(args.phone);
    if (!isValidProfilePhone(phone)) {
      throw new ConvexError("Masukkan nomor WhatsApp yang valid (10–15 digit).");
    }
    const address = args.address.trim();
    if (address.length < 5 || address.length > 300) {
      throw new ConvexError("Alamat harus 5–300 karakter.");
    }
    // Aturan yang sama persis dengan `users.setMyDisplayName`: huruf besar-kecil
    // bukan alasan menolak, isi yang hilang (angka, tanda baca, spasi ganda,
    // nama terpotong) tetap ditolak dengan jawaban berisi bentuk yang benar.
    const checked = checkDisplayNameInput(args.name);
    if (!checked.ok) {
      denied(
        checked.suggestion
          ? `Nama itu tidak bisa dipakai. Coba: ${checked.suggestion}`
          : "Nama tampilan minimal 2 huruf.",
      );
    }
    await storeVerifiedPhone(ctx.db, userId, phone, now);
    await ctx.db.patch(userId, { publicName: checked.value, homeAddress: address });
    return { ok: true };
  },
});
