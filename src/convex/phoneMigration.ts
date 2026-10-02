// FASE 17 - migrasi nomor warga polos ke penyimpanan terenkripsi.
//
// KENAPA MIGRASI TERPISAH DARI PERBAIKAN JALUR TULIS.
//
// Jalur tulis sudah menyimpan nomor terenkripsi sejak commit ini, jadi tidak ada
// data baru yang masuk polos. Yang tersisa adalah baris LAMA, dan baris lama
// tidak bisa langsung dibuang: kalau kolom lamanya dikosongkan bersamaan dengan
// pembacaan yang belum dialihkan, notifikasi warga berhenti tanpa satu pun
// tanda di log. Karena itu migrasi berjalan bertahap, dan pengosongan kolom
// polos adalah langkah TERPISAH yang dijaga.
//
// ATURAN YANG DIPAKSA MODUL INI
//
// 1. IDEMPOTEN. Baris yang sudah punya bentuk terenkripsi dilewati.
// 2. TERBATAS. Setiap panggilan hanya menyentuh `limit` baris, jadi tidak ada
//    pemanggilan yang menulis tak terbatas.
// 3. GAGAL TERBUKA. Kalau `PHONE_DATA_KEY` belum diisi, fungsi-fungsi ini
//    melempar di awal - bukan melewati baris-baris itu dengan diam-diam lalu
//    melaporkan "tidak ada yang perlu dikerjakan".
// 4. TIDAK MENGHAPUS APA PUN. Pembersihan kolom polos adalah langkah manual
//    terpisah (`clearLegacyPlainPhones`), supaya ada jeda waktu di mana kedua
//    skema masih hidup dan bisa dibandingkan.
//
// URUTAN PENJALANAN YANG DIREKOMENDASIKAN
//
//   npx convex run phoneMigration:report            # berapa yang tersisa?
//   npx convex run phoneMigration:migratePreferences
//   npx convex run phoneMigration:migrateClaims
//   npx convex run phoneMigration:migrateThreads
//   npx convex run phoneMigration:report            # harus nol
//   ... audit sisa pembacaan kolom polos ...
//   npx convex run phoneMigration:clearLegacyPlainPhones

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  isEncryptedPhone,
  isPhoneKeyConfigured,
  normalizePhone as normalizePhoneForStorage,
  phoneKeyMaterial,
} from "../lib/phone-crypto";
import { preparePhone } from "./phoneVault";

/** Batas keras per pemanggilan. Melebihi ini membuat satu mutation terlalu lama. */
const MAX_BATCH = 500;

const defaultLimit = (value: number | undefined) =>
  Math.min(Math.max(value ?? 100, 1), MAX_BATCH);



/**
 * Berapa banyak baris polos yang masih tersisa di ketiga tabel.
 *
 * Ini adalah sumber kebenaran untuk pertanyaan "sudah selesai atau belum".
 * Angka nol di sini BUKAN berarti aman mengosongkan kolom polos - audit kode
 * masih harus dilakukan lebih dulu.
 */
export const report = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [preferences, claims, threads] = await Promise.all([
      ctx.db.query("notificationPreferences").collect(),
      ctx.db.query("listingClaims").collect(),
      ctx.db.query("whatsappThreads").collect(),
    ]);

    const legacyPreferences = preferences.filter(
      (row) => row.whatsappPhone && !row.whatsappPhoneEnc,
    );
    const legacyClaims = claims.filter(
      (row) => row.whatsappPhone && !row.whatsappPhoneEnc,
    );
    const legacyThreads = threads.filter((row) => row.phone && !row.phoneEnc);

    return {
      keyConfigured: isPhoneKeyConfigured(),
      notificationPreferences: {
        legacy: legacyPreferences.length,
        encrypted: preferences.filter((row) =>
          isEncryptedPhone(row.whatsappPhoneEnc),
        ).length,
      },
      listingClaims: {
        legacy: legacyClaims.length,
        encrypted: claims.filter((row) => isEncryptedPhone(row.whatsappPhoneEnc))
          .length,
      },
      whatsappThreads: {
        legacy: legacyThreads.length,
        encrypted: threads.filter((row) => isEncryptedPhone(row.phoneEnc))
          .length,
      },
      remainingLegacy:
        legacyPreferences.length + legacyClaims.length + legacyThreads.length,
    };
  },
});

export const migratePreferences = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Fail-closed. Tanpa kunci, iterasi di bawah akan melewati semua baris
    // dan melaporkan nol perubahan - kesalahpahaman paling berbahaya di
    // seluruh migrasi ini.
    phoneKeyMaterial();
    const rows = await ctx.db
      .query("notificationPreferences")
      .take(defaultLimit(args.limit));
    let migrated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.whatsappPhone || row.whatsappPhoneEnc) {
        skipped += 1;
        continue;
      }
      const normalized = normalizePhoneForStorage(row.whatsappPhone);
      if (!normalized) {
        skipped += 1;
        continue;
      }
      const stored = await preparePhone(normalized);
      await ctx.db.patch(row._id, {
        whatsappPhoneEnc: stored.enc,
        whatsappPhoneKey: stored.key,
        updatedAt: Date.now(),
      });
      migrated += 1;
    }
    return { scanned: rows.length, migrated, skipped };
  },
});

export const migrateClaims = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    phoneKeyMaterial();
    const rows = await ctx.db.query("listingClaims").take(defaultLimit(args.limit));
    let migrated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.whatsappPhone || row.whatsappPhoneEnc) {
        skipped += 1;
        continue;
      }
      const normalized = normalizePhoneForStorage(row.whatsappPhone);
      if (!normalized) {
        skipped += 1;
        continue;
      }
      const stored = await preparePhone(normalized);
      await ctx.db.patch(row._id, {
        whatsappPhoneEnc: stored.enc,
        whatsappPhoneKey: stored.key,
      });
      migrated += 1;
    }
    return { scanned: rows.length, migrated, skipped };
  },
});

export const migrateThreads = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    phoneKeyMaterial();
    const rows = await ctx.db.query("whatsappThreads").take(defaultLimit(args.limit));
    let migrated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.phone || row.phoneEnc) {
        skipped += 1;
        continue;
      }
      const normalized = normalizePhoneForStorage(row.phone);
      if (!normalized) {
        skipped += 1;
        continue;
      }
      const stored = await preparePhone(normalized);
      await ctx.db.patch(row._id, { phoneEnc: stored.enc, phoneKey: stored.key });
      migrated += 1;
    }
    return { scanned: rows.length, migrated, skipped };
  },
});

/**
 * Kosongkan kolom polos SETELAH semua baris punya bentuk terenkripsi.
 *
 * Dijaga dengan dua hal:
 *
 * 1. Menolak jalan kalau masih ada baris polos tersisa. Tanpa penjaga ini,
 *    satu salah klik menghapus nomor warga yang belum punya ciphertext - dan
 *    PII yang hilang tidak bisa dipulihkan.
 * 2. Batch terbatas, supaya pemanggil bisa mengulangi sampai selesai.
 *
 * Jalankan HANYA setelah `report` mengembalikan `remainingLegacy: 0` DAN audit
 * kode memastikan tidak ada pembacaan kolom polos yang tersisa.
 */
export const clearLegacyPlainPhones = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    phoneKeyMaterial();
    const [preferences, claims, threads] = await Promise.all([
      ctx.db.query("notificationPreferences").collect(),
      ctx.db.query("listingClaims").collect(),
      ctx.db.query("whatsappThreads").collect(),
    ]);
    const remaining =
      preferences.filter((row) => row.whatsappPhone && !row.whatsappPhoneEnc)
        .length +
      claims.filter((row) => row.whatsappPhone && !row.whatsappPhoneEnc).length +
      threads.filter((row) => row.phone && !row.phoneEnc).length;

    if (remaining > 0) {
      throw new Error(
        `Masih ada ${remaining} baris polos yang belum dimigrasi. Jalankan migrasi sampai selesai sebelum membersihkan.`,
      );
    }

    const limit = defaultLimit(args.limit);
    let cleared = 0;
    for (const row of preferences) {
      if (!row.whatsappPhone) continue;
      await ctx.db.patch(row._id, { whatsappPhone: undefined });
      cleared += 1;
      if (cleared >= limit) return { cleared, done: false };
    }
    for (const row of claims) {
      if (!row.whatsappPhone) continue;
      await ctx.db.patch(row._id, { whatsappPhone: undefined });
      cleared += 1;
      if (cleared >= limit) return { cleared, done: false };
    }
    for (const row of threads) {
      if (!row.phone) continue;
      await ctx.db.patch(row._id, { phone: undefined });
      cleared += 1;
      if (cleared >= limit) return { cleared, done: false };
    }
    return { cleared, done: true };
  },
});