// FASE 10/16 - dasar enkripsi nomor telepon pribadi, di lapisan aplikasi.
//
// MASALAH YANG DISERIKAN MODUL INI
//
// Tiga tabel menyimpan nomor warga sebagai teks biasa:
//
//   notificationPreferences.whatsappPhone
//   listingClaims.whatsappPhone
//   whatsappThreads.phone
//
// Tiga field itu adalah PII orang sungguhan - bukan nomor usaha yang memang
// sengaja dipublikasikan. Bedanya besar: nomor usaha butuh terlihat supaya
// produknya bekerja, sedangkan nomor warga tidak pernah punya alasan itu.
// Selama masih polos di database, satu dump, satu cadangan, atau satu
// kebocoran berarti semua nomor warga ikut keluar.
//
// Kenapa tidak cukup hanya "jangan kirim ke peramban".
//
// Itu memperbaiki jalan OUTPUT, tapi tidak jalan at rest. Siapa pun yang punya
// akses baca database - atau salinan-cadangan yang bocor - masih melihat
// semua nomor. Enkripsi di lapisan aplikasi menutup keduanya: yang tersimpan
// bukan nomor, dan yang bisa dicari bukan nomor.
//
// KENAPA SATU KUNCI, DUA TURUNAN.
//
// Satu rahasia yang harus dikelola jauh lebih mudah daripada dua, dan
// menurunkan kunci dari satu akar lewat HKDF membuat rotasi maupun pengujian
// tetap sederhana. Yang penting kedua turunan TIDAK bisa dipakai saling
// menggantikan: kunci enkripsi dan kunci lookup tidak boleh sama.
//
// MENGAPA LOOKUP MEMBUTUHKAN HMAC, BUKAN ENCRYPT.
//
// Pencarian lewat indeks hanya bisa mencocokkan nilai yang disimpan apa
// adanya. Kalau nomornya dienkripsi, tiap pencarian jadi pemindaian penuh atas
// seluruh tabel - tepat hal yang tidak boleh terjadi di jalur yang paling
// sering dipanggil. Jadi nomor disimpan DUA KALI: terenkripsi (untuk dibaca
// kembali) dan berupa HMAC (untuk dicari). HMAC bersifat satu arah, jadi
// storage yang bocor tidak bisa dibalik menjadi nomor.
//
// KEBIJAKAN KETIKA KUNCI TIDAK ADA: FAIL CLOSED.
//
// Kalau `PHONE_DATA_KEY` kosong, fungsi enkripsi MELEMPAR. Ia tidak pernah
// jatuh ke "simpan saja polos" - itulah cara paling umum enkripsi gagal diam-
// diam: data baru masuk polos sementara data lama terenkripsi, dan tidak ada
// yang menyadarinya. Melempar membuat konfigurasi salah terlihat saat deploy,
// bukan enam bulan kemudian.
//
// CATATAN RUNTIME.
//
// Hanya Web Crypto API (`crypto.subtle`). Tidak ada `node:crypto`, karena
// query dan mutation Convex berjalan di isolate V8, bukan di Node. Web Crypto
// tersedia di keduanya (Convex runtime dan Node 18+), jadi modul yang sama
// dipakai produksi dan test tanpa jalur khusus.

const ENC_INFO = "sumenep-buku-kerja:phone:enc:v1";
const LOOKUP_INFO = "sumenep-buku-kerja:phone:lookup:v1";

/** Awalan nilai terenkripsi. Memakai magic byte-ish prefix, bukan JSON. */
const ENC_PREFIX = "bk1";
const LOOKUP_PREFIX = "bkp1";

/** Panjang kunci turunan: 256 bit. */
const DERIVED_BITS = 256;

/**
 * Panjang HMAC yang disimpan di indeks: 128 bit.
 *
 * Dipangkas dari 256 bit karena yang disimpan adalah kunci PENCARIAN pada
 * tabel yang maksimal berisi ratusan ribu baris. 128 bit sudah membuat tabrakan
 * mustahil pada skala itu, dan memangkasnya membuat indeks jauh lebih pendek.
 */
const LOOKUP_BYTES = 16;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/* ------------------------------------------------------------------ */
/* base64url                                                          */
/* ------------------------------------------------------------------ */

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/* ------------------------------------------------------------------ */
/* Kunci                                                              */
/* ------------------------------------------------------------------ */

/**
 * Nama variabel yang menyimpan kunci akar, dalam base64.
 *
 * Isi: 32 byte acak. Cara membuatnya(owner, di luar aplikasi):
 *
 *   openssl rand -base64 32
 *
 * Nilai itu hanya diisi lewat tab Keys/API keys. Nilai ini TIDAK PERNAH
 * ditulis ke repo, ke log, ke laporan error, maupun ke audit.
 */
export const PHONE_DATA_KEY_ENV = "PHONE_DATA_KEY";

/**
 * Kunci untukmelakukan enkripsi/HMAC pada nomor telepon.
 *
 * Melempar kalau belum diisi. Pelemparan ini disengaja: kode yang memakai
 * modul ini adalah jalur penyimpanan dan pembacaan nomor warga, dan ia tidak
 * boleh punya mode "dipakai tanpa enkripsi".
 */
export const phoneKeyMaterial = (env: Record<string, string | undefined> = process.env) => {
  const raw = env[PHONE_DATA_KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${PHONE_DATA_KEY_ENV} belum diisi. Isi di tab Keys/API keys dengan output \`openssl rand -base64 32\`. ` +
        "Nomor telepon tidak boleh disimpan tanpa kunci ini.",
    );
  }
  let master: Uint8Array;
  try {
    master = fromBase64Url(raw);
  } catch {
    throw new Error(`${PHONE_DATA_KEY_ENV} bukan base64 yang sah.`);
  }
  if (master.length !== 32) {
    throw new Error(
      `${PHONE_DATA_KEY_ENV} harus berisi tepat 32 byte, ditemukan ${master.length}.`,
    );
  }
  return master;
};

/** True kalau kunci sudah dikonfigurasi. Untuk diagnostik, bukan untuk logika. */
export const isPhoneKeyConfigured = (
  env: Record<string, string | undefined> = process.env,
) => Boolean(env[PHONE_DATA_KEY_ENV]?.trim());

type DerivedKeys = { enc: CryptoKey; lookup: CryptoKey };

const deriveKeys = async (master: Uint8Array): Promise<DerivedKeys> => {
  // Cast ke `BufferSource`: `@types/node` terbaru membuat `Uint8Array`
  // generik terhadap `ArrayBufferLike`, sehingga `ArrayBufferView` tidak lagi
  // langsung cocok dengan `BufferSource` yang dipakai lib DOM WebCrypto.
  // Isinya tetap `Uint8Array` yang sama persis.
  const source = master as unknown as BufferSource;
  const base = await crypto.subtle.importKey("raw", source, "HKDF", false, [
    "deriveKey",
  ]);
  const salt = new Uint8Array(32);
  const [enc, lookup] = await Promise.all([
    crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: textEncoder.encode(ENC_INFO) },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    ),
    crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: textEncoder.encode(LOOKUP_INFO) },
      base,
      { name: "HMAC", hash: "SHA-256", length: DERIVED_BITS },
      false,
      ["sign"],
    ),
  ]);
  return { enc, lookup };
};

/* ------------------------------------------------------------------ */
/* Normalisasi                                                        */
/* ------------------------------------------------------------------ */

/**
 * Bentuk kanonik nomor untuk disimpan dan di-hash.
 *
 * Sama dengan normalisasi yang sudah dipakai di sisi server (`normalizePhone`),
 * supaya webhook dan penyimpanan bertemu pada satu bentuk. Menyimpan dua bentuk
 * dari nomor yang sama adalah kesalahan klasik yang membuat HMAC tidak cocok
 * dan ciphertext duplikat.
 */
export const normalizePhone = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return normalized.length >= 10 && normalized.length <= 15 ? normalized : undefined;
};

/* ------------------------------------------------------------------ */
/* Enkripsi                                                           */
/* ------------------------------------------------------------------ */

export const isEncryptedPhone = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(`${ENC_PREFIX}.`);

/**
 * Enkripsi satu nomor.
 *
 * AES-GCM, jadi ciphertext sekaligus membawa tag autentikasi. Menempelkan satu
 * bit ke ciphertext membuat `decryptPhone` melempar - bukan mengembalikan
 * nomor yang diam-diam rusak. Untuk PII, itu persis yang diinginkan:
 * kegagalan harus terlihat, bukan menghasilkan nomor salah yang terkirim ke
 * warga.
 *
 * IV dibuat acak per pemanggilan. Memakai ulang IV dengan kunci yang sama
 * itulah kesalahan yang membatalkan jaminan GCM.
 */
export const encryptPhone = async (
  plain: string,
  master: Uint8Array,
): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { enc } = await deriveKeys(master);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, enc, textEncoder.encode(plain)),
  );
  return `${ENC_PREFIX}.${toBase64Url(iv)}.${toBase64Url(ciphertext)}`;
};

/**
 * Dekripsi satu nomor.
 *
 * Melempar kalau ciphertext rusak, atau kalau dipakai kunci yang berbeda -
 * termasuk kunci dari generasi rotasi sebelumnya. Keduanya harus terlihat;
 * diam-diam mengembalikan teks sampah akan dikirim ke warga.
 */
export const decryptPhone = async (
  payload: string,
  master: Uint8Array,
): Promise<string> => {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== ENC_PREFIX) {
    throw new Error("Nilai terenkripsi tidak recognizable.");
  }
  const { enc } = await deriveKeys(master);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(parts[1]) },
    enc,
    fromBase64Url(parts[2]),
  );
  return textDecoder.decode(plaintext);
};

/* ------------------------------------------------------------------ */
/* Kunci pencarian (HMAC)                                             */
/* ------------------------------------------------------------------ */

/**
 * Kunci pencarian satu arah untuk satu nomor.
 *
 * Disimpan di indeks supaya baris bisa dicari tanpa mendekripsi seluruh
 * tabel. Panjang 128 bit sudah lebih dari cukup untuk tabel sekecil ini.
 */
export const phoneLookupKey = async (
  plain: string,
  master: Uint8Array,
): Promise<string> => {
  const { lookup } = await deriveKeys(master);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", lookup, textEncoder.encode(plain)),
  );
  return `${LOOKUP_PREFIX}.${toBase64Url(signature.slice(0, LOOKUP_BYTES))}`;
};

/**
 * Bentuk tersamar untuk ditampilkan 관리.
 *
 * Digit yang disimpan sengaja dikecilkan: empat di depan, tiga di belakang.
 * Gunanya supaya pengelola bisa mencocokkan dengan catatan offline, bukan
 * supaya nomornya berguna dipanen ulang dari panel admin.
 */
export const maskPhoneForAdmin = (raw: string) => {
  const normalized = normalizePhone(raw);
  if (!normalized) return "tidak valid";
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}****`;
  return `${normalized.slice(0, 4)}****${normalized.slice(-3)}`;
};