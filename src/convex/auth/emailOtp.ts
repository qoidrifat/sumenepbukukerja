// Provider OTP email.
//
// FASE 9 - PERBAIKAN KEAMANAN (lihat docs/security/PHASE-9-SECURITY-AUDIT.md)
//
// Dua masalah nyata yang ditemukan di audit, keduanya sudah ditutup di sini:
//
// 1. KUNCI API DI-HARDCODE. Nilai lama ditulis literal di berkas ini, jadi ikut
//    masuk ke Git dan tidak pernah bisa dicabut tanpa mengubah kode.
//    Sekarang satu-satunya sumbernya adalah environment
//    `VLY_EMAIL_OTP_API_KEY`. Kalau variabel itu kosong, pengiriman OTP GAGAL
//    DENGAN PESAN JELAS - bukan diam-diam memakai nilai bawaan, dan tidak pernah
//    memuat kunci ke mana pun.
//
// 2. KUNCI BOCOR LEWAT PESAN ERROR. `catch` versi lama melempar
//    `new Error(JSON.stringify(error))`. `JSON.stringify` pada AxiosError
//    menyalin `config.headers` - termasuk header `x-api-key` - ke dalam pesan
//    yang dikembalikan ke pemanggil `auth:signIn`, yaitu siapa pun yang tidak
//    punya sesi. Buktinya ada di `src/convex/otp-provider-security.test.ts` dan
//    di `tmp/qa-p9-axios-error-probe.mjs`.
//
//    Sekarang objek error dari axios TIDAK PERNAH ikut ke pesan. Yang dicatat ke
//    log server hanya kode status, dan itu bukan rahasia.
//
// CATATAN OPERATOR: nilai kunci yang lama harus dianggap bocor (ada di Git dan
// bisa dibaca lewat jalur error di atas) lalu DICABUT dan DIGANTI di sisi
// penyedia. Setelah berganti, set `VLY_EMAIL_OTP_API_KEY` di Keys/API keys.

import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/** Satu-satunya tempat nama variabel kunci OTP ditulis. */
const OTP_API_KEY_ENV = "VLY_EMAIL_OTP_API_KEY";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    // Fail-closed. Pesan penolakan ini milik operator, bukan milik pemanggil,
    // dan tidak pernah memuat nilai kunci.
    const apiKey = process.env[OTP_API_KEY_ENV]?.trim();
    if (!apiKey) {
      throw new Error(
        `Integrasi email OTP belum dikonfigurasi. Set ${OTP_API_KEY_ENV} di Keys/API keys.`,
      );
    }
    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a freebuff.com application",
        },
        {
          headers: {
            "x-api-key": apiKey,
          },
        },
      );
    } catch (error) {
      // Yang boleh keluar dari sini HANYA kode status. `error` mentah terlihat
      // berguna tapi tidak boleh ikut: isinya memuat request config lengkap
      // dengan header otorisasi.
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const code = axios.isAxiosError(error) ? error.code : undefined;
      console.warn("[EMAIL_OTP] pengiriman OTP gagal", { status, code });
      throw new Error("Kode OTP gagal dikirim. Coba lagi sebentar lagi.");
    }
  },
});
