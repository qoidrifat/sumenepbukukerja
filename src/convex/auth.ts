// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
// FASE 9.2: provider `email-otp` DIHAPUS.
//
// Alasannya: credentials `VLY_EMAIL_OTP_API_KEY` adalah milik platform Freebuff
// dan tidak bisa dibuat ulang di akun Convex milik pemilik sendiri, jadi jalur itu
// tidak akan pernah bisa mengirim kode lagi. Selama provider-nya masih
// terdaftar, satu klik berarti satu pesan operator tanpa jalan keluar - lebih buruk
// daripada tidak ada.
//
// Jalur yang menggantikannya sudah ada dan gratis: Google dan Email/Sandi lewat
// provider `firebase` di bawah. Keduanya diverifikasi di server dengan JWKS
// resmi Google, dan tidak butuh layanan email pihak ketiga.
import { firebase } from "./auth/firebase";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, firebase],
});