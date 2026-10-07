// FASE 16 - satu-satunya pintu masuk untuk nomor telepon warga.
//
// KENAPA MODUL INI ADA, BUKAN CUKUP PEMAKAIAN `phone-crypto` DI TEMPAT.
//
// Tiga tabel menyimpan nomor warga, dan masing-masing punya beberapa jalur
// tulis. Kalau setiap jalur memanggil `encryptPhone` sendiri, cepat atau lambat
// ada satu jalur lupa - dan jalur yang lupa itu menyimpan PII polos tanpa
// jejaknya. Modul ini menutupnya di satu tempat: yang mengekspos "simpan",
// "baca", dan "cari", dan semuanya sudah benar secara bawaan.
// dan "cari", dan semuanya sudah benar secara bawaan.
//
// ATURAN YANG DIPAKSA MODUL INI
//
// 1. Tulis SELALU terenkripsi. Tidak ada jalur yang menyimpan nomor polos.
// 2. Baca yang tahan terhadap baris lama: kalau kolom terenkripsi
//    kosong tapi kolom polos terisi, baris itu belum dimigrasi dan polosnya
//    dipakai sebagai jawaban sementara. Inilah yang membuat migrasi bisa
//    berjalan selangkah demi selangkah tanpa downtime.
// 3. Cari lewat HMAC, bukan lewat dekripsi. Dekripsi tidak bisa dipakai untuk
//    pencarian karena tidak ada indeksnya.
//
// KEGAGALAN KUNCI.
//
// `phoneKeyMaterial()` melempar kalau `PHONE_DATA_KEY` belum diisi. Modul ini
// SENGAJA tidak menangkap pengecualian itu di jalur tulis: konfigurasi
// yang salah harus terlihat seketika, bukan menjadi data baru yang diam-diam
// tidak terenkripsi. Jalur baca tetap melempar juga - lebih baik error terlihat
// daripada nomor salah terkirim ke warga.

import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import {
  decryptPhone,
  encryptPhone,
  isEncryptedPhone,
  normalizePhone as normalizePhoneForStorage,
  phoneKeyMaterial,
  phoneLookupKey,
} from "../lib/phone-crypto";
import { PHONE_MAX_VERIFY_ATTEMPTS, sha256Hex } from "../lib/otp-email";

type Ctx = GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>;

/** Tiga bentuk yang perlu disimpan bersama: polos (lama), sandi, dan kunci cari. */
export type StoredPhone = {
  /** Hanya diisi untuk baris lama yang belum dimigrasi. */
  plain?: string;
  enc?: string;
  key?: string;
};

/**
 * Siapkan satu nomor untuk disimpan.
 *
 * Melempar kalau nomornya tidak valid, jadi nomorinvalid tidak pernah sampai
 * ke database dalam bentuk apa pun.
 */
export const preparePhone = async (
  raw: string,
): Promise<Required<StoredPhone>> => {
  const normalized = normalizePhoneForStorage(raw);
  if (!normalized) {
    throw new Error("Nomor WhatsApp tidak valid.");
  }
  const master = phoneKeyMaterial();
  const [enc, key] = await Promise.all([
    encryptPhone(normalized, master),
    phoneLookupKey(normalized, master),
  ]);
  return { plain: normalized, enc, key };
};

/*** Normalisasi tanpa enkripsi.
 *
 * Dipakai untuk baris yang SUDAH terenkripsi, ketika yang dibutuhkan hanya
 * menulis ulang bentuk kanoniknya (mis. saat memproses nomor yang masuk dari
 * webhook). Tidak pernah dipakai untuk penyimpanan.
 */
export const normalizedPhoneForExisting = (raw: string) => {
  const normalized = normalizePhoneForStorage(raw);
  if (!normalized) throw new Error("Nomor WhatsApp tidak valid.");
  return normalized;
};

/**
 * Baca nomor dari baris database, apa pun tahap migrasinya.
 *
 * Urutannya penting: bentuk terenkripsi menang kalau ada. Kalau hanya polos
 * yang ada, baris itu belum dimigrasi dan polosnya dikembalikan - inilah yang
 * membuat `migrateResidentPhones` bisa dijalankan bertahap tanpa memutus
 * pembacaan yang sudah berjalan.
 */
export const readStoredPhone = async (
  enc: string | undefined,
  plain: string | undefined,
): Promise<string | undefined> => {
  if (isEncryptedPhone(enc)) {
    const master = phoneKeyMaterial();
    return await decryptPhone(enc, master);
  }
  return plain;
};

/**
 * Cari satu baris berdasarkan nomor, lewat indeks HMAC.
 *
 * Bolt dengan urutan: bentuk baru dulu, lalu bentuk lama sebagai jaring
 * pengaman. Tanpa urutan itu, baris yang sudah dimigrasi akan hilang dari
 * pencarian selama satu jendela - dan pada `notificationPreferences` itu berarti
 * notifikasi warga berhenti terkirim tanpa tanda apa pun.
 *
 * Baris yang dikembalikan adalah `null` kalau tidak ada. Jenis barisnya
 * dikembalikan sebagai `unknown`; pemanggil yang memetakannya ke
 * `Doc<"notificationPreferences">` atau `Doc<"whatsappThreads">`, karena nama
 * kolomnya berbeda antar tabel dan itu bukan hal yang perlu ditebak di sini.
 */
export const findByPhoneKey = async (
  ctx: Ctx,
  lookup: {
    table: "notificationPreferences" | "whatsappThreads";
    keyField: "whatsappPhoneKey" | "phoneKey";
    encField: "whatsappPhoneEnc" | "phoneEnc";
    plainField: "whatsappPhone" | "phone";
  },
  rawPhone: string,
): Promise<{ row: unknown; phone: string } | null> => {
  const master = phoneKeyMaterial();
  const key = await phoneLookupKey(normalizedPhoneForExisting(rawPhone), master);

  const modern = await ctx.db
    .query(lookup.table)
    .withIndex("byPhoneKey", (q) => q.eq(lookup.keyField, key))
    .first();
  if (modern) {
    const enc = (modern as Record<string, unknown>)[lookup.encField];
    const phone = await readStoredPhone(
      typeof enc === "string" ? enc : undefined,
      undefined,
    );
    return { row: modern, phone: phone ?? "" };
  }

  // Jaring pengaman untuk baris yang belum dimigrasi.
  const legacyPhone = normalizePhoneForStorage(rawPhone);
  if (!legacyPhone) return null;
  const legacy = await ctx.db
    .query(lookup.table)
    .withIndex("byPhone", (q) => q.eq(lookup.plainField, legacyPhone))
    .first();
  if (!legacy) return null;
  return { row: legacy, phone: legacyPhone };
};

/**
 * Tulis nomor terverifikasi: enkripsi + stempel, flags lain tetap.
 *
 * Dipakai klaim inbound webhook dan penyimpanan profil supaya keduanya
 * sepakat tentang arti "terverifikasi". Nomor lain tidak ikut tersentuh.
 */
export const storeVerifiedPhone = async (
  db: GenericMutationCtx<DataModel>["db"],
  userId: DataModel["users"]["document"]["_id"],
  phone: string,
  now: number,
): Promise<void> => {
  const stored = await preparePhone(phone);
  const phoneFields = {
    whatsappPhoneEnc: stored.enc,
    whatsappPhoneKey: stored.key,
    whatsappPhone: undefined,
    whatsappVerifiedAt: now,
  };
  const prefs = await db
    .query("notificationPreferences")
    .withIndex("byUser", (q) => q.eq("userId", userId))
    .unique();
  if (prefs) {
    await db.patch(prefs._id, { ...phoneFields, updatedAt: now });
  } else {
    await db.insert("notificationPreferences", {
      userId,
      whatsappUpdates: false,
      areaUpdates: false,
      requestUpdates: false,
      ...phoneFields,
      updatedAt: now,
    });
  }
};

/**
 * Klaim kode verifikasi inbound dari webhook.
 *
 * Pengirim membuktikan kepemilikan nomor dengan mengirimkan kode yang
 * diterbitkan `profile.requestInboundCode` (mis. `K-4829`) dari nomor itu
 * sendiri. Bentuk kode disengaja beda dari OTP email 6 digit supaya
 * keduanya tidak tertukar di log maupun pikiran pengguna.
 *
 * Aturan: bukan kode → abaikan; nomor pengirim beda dari nomor yang
 * diminta → abaikan TANPA dihitung (mencegah pembakaran oleh pengirim
 * asing); hash cocok + nomor sama → bakar sekali pakai, simpan nomor
 * terverifikasi. Brute force tidak ekonomis: tiap tebakan adalah satu
 * pesan WhatsApp sungguhan dan kode hangus dalam 10 menit.
 */
export const claimInboundVerificationCode = async (
  db: GenericMutationCtx<DataModel>["db"],
  phone: string,
  body: string,
  now: number,
): Promise<{ verified: boolean }> => {
  const cleaned = body.trim().toUpperCase();
  if (!/^K-[A-Z0-9]{4}$/.test(cleaned)) return { verified: false };
  const codeHash = await sha256Hex(cleaned);
  const row = await db
    .query("phoneVerificationCodes")
    .withIndex("byCodeHash", (q) => q.eq("codeHash", codeHash))
    .first();
  if (!row || row.consumedAt || now > row.expiresAt) return { verified: false };
  if (row.attempts >= PHONE_MAX_VERIFY_ATTEMPTS) {
    await db.patch(row._id, { consumedAt: now });
    return { verified: false };
  }
  if (row.phone !== phone) return { verified: false };
  await db.patch(row._id, { consumedAt: now, attempts: row.attempts + 1 });
  await storeVerifiedPhone(db, row.userId, row.phone, now);
  return { verified: true };
};