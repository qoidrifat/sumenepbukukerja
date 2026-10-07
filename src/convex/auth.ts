// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
// FASE 9.2: provider `email-otp` (lama) DIHAPUS karena kredensial
// `VLY_EMAIL_OTP_API_KEY` milik platform Freebuff dan tidak bisa dibuat
// ulang di akun Convex milik pemilik sendiri.
//
// FASE 9.5: masuk email-sandi DIHAPUS TOTAL (keputusan pemilik).
//
// Penggantinya: Google dan kode OTP lewat provider `otp-email` di bawah.
// Kunci Resend kini milik sendiri (`RESEND_API_KEY`), bukan kredensial
// platform lain. Tidak ada lagi pintu berbasis sandi di `/auth`: tidak
// ada form sandi, tidak ada permintaan tautan reset, tidak ada
// penyelesaian `oobCode`.
import { firebase } from "./auth/firebase";
import { otpEmail } from "./auth/otpEmail";

// FASE 9.5: provider otp-email MENGEMBALIKAN login kode — kunci Resend kini milik sendiri (bukan Freebuff).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, firebase, otpEmail],
});