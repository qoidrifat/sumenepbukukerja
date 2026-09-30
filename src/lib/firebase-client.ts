// Klien Firebase Authentication, sisi peramban.
//
// FASE 9.2
//
// Tiga aturan yang tidak bisa ditawar di berkas ini:
//
// 1. INISIALISASI LAZY. Modul Firebase hanya dibuat saat ada yang benar-benar
//    memanggil. Alasannya ukuran: bundel auth Firebase menambah bobot yang
//    tidak proporsional untuk satu tombol di halaman `/auth`. Halaman itu sudah
//    `lazy()` di `src/main.tsx`, jadi komponen ini tidak pernah menyentuh jalur
//    kritis beranda.
// 2. KETIKA ENV BELUM DIISI, TIDAK ADA YANG MELEDAK. `firebaseAvailable()` jadi
//    `false`, tombol disembunyikan, dan aplikasi tetap jalan lewat OTP. Auth
//    yang hilang total akan membuat `/auth` kosong untuk siapa pun.
// 3. PESAN ERROR KE PENGGUNA TIDAK PERNAH BERISI DETAIL TEKNIS. Kode Firebase
//    dipetakan ke kalimat yang bisa ditindaklanjuti. Menumpuk pesan mentah
//    dari SDK pernah membocorkan nama project dan konfigurasi di halaman, dan
//    itu persis kelas kesalahan yang ditegakkan di
//    `docs/security/PHASE-9.1-*`.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  type Auth,
} from "firebase/auth";

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
};

let cached: { auth: Auth; projectId: string } | null = null;

/**
 * Env yang dibaca. Ketiganya berasal dari build, jadi nilainya tertanam di
 * bundel -
 * aman, karena aturan Firebase memang client key bukan rahasia. Yang tidak
 * pernah ada di sini: private key, service account, atau kredensial admin.
 */
function readConfig(): FirebaseClientConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim();
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!apiKey || !authDomain || !projectId) return null;
  return { apiKey, authDomain, projectId };
}

/** Apakah tombol Google dan email-sandi boleh ditampilkan sama sekali. */
export function firebaseAvailable(): boolean {
  return readConfig() !== null;
}

function getClient(): { auth: Auth; projectId: string } {
  if (cached) return cached;
  const config = readConfig();
  if (!config) {
    throw new Error("Firebase belum dikonfigurasi");
  }
  // `getApps()` mencegah error "Firebase App named '[DEFAULT]' already exists"
  // saat modul ini diimpor ulang oleh HMR selama pengembangan.
  const app: FirebaseApp = getApps().length
    ? getApps()[0]!
    : initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId });
  cached = { auth: getAuth(app), projectId: config.projectId };
  return cached;
}

/** ID token yang diverifikasi server di `src/convex/auth/firebase.ts`. */
async function idToken(): Promise<string> {
  const { auth } = getClient();
  const user = auth.currentUser;
  // `getIdToken(true)` memaksa penyegaran kalau token yang dipegang kedaluwarsa.
  // Tanpa itu, token lama yang ditolak server membuat pengguna terjebak di
  // halaman masuk tanpa cara keluar selain memuat ulang.
  if (!user) throw new Error("Belum masuk");
  return user.getIdToken(true);
}

export async function signInWithGoogle(): Promise<string> {
  const { auth } = getClient();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  if (!result.user.emailVerified) {
    await signOut(auth);
    throw new FirebaseClientError(
      "email-unverified",
      "Email Google Anda belum terverifikasi, jadi tidak bisa dipakai masuk.",
    );
  }
  return idToken();
}

export async function createEmailAccount(email: string, password: string): Promise<string> {
  const { auth } = getClient();
  const result = await createUserWithEmailAndPassword(auth, email, password);
  // Email harus diverifikasi sebelum server mau menautkan akun. Permintaan
  // dikirim otomatis supaya pengguna tidak perlu mencarinya di menu lain.
  await sendEmailVerification(result.user).catch(() => {
    // Gagal mengirim tidak membatalkan pendaftaran; alasannya akan muncul lagi
    // saat pengguna menekan "kirim ulang" di UI.
  });
  return idToken();
}

export async function signInWithEmail(email: string, password: string): Promise<string> {
  const { auth } = getClient();
  const result = await signInWithEmailAndPassword(auth, email, password);
  if (!result.user.emailVerified) {
    throw new FirebaseClientError(
      "email-unverified",
      "Verifikasi email Anda dulu lewat tautan yang sudah dikirim, lalu masuk lagi.",
    );
  }
  return idToken();
}

export async function signOutOfFirebase(): Promise<void> {
  await signOut(getClient().auth);
}

/**
 * Email akun yang sedang masuk di Firebase, lowercase.
 *
 * Dipakai oleh halaman `/auth` untuk menukar tiket passcode dengan email
 * SEBELUM token dikirim ke Convex. Urutannya penting: tiket passcode mengikat
 * akses admin ke satu email tertentu, jadi kalau tiketnya ditukar setelah
 * sesi sudah terbentuk, passcode itu sempat berlaku untuk siapa pun.
 * Mengembalikan `null` kalau belum ada yang masuk.
 */
export function currentFirebaseEmail(): string | null {
  const email = getClient().auth.currentUser?.email;
  return email ? email.trim().toLowerCase() : null;
}

/** Kode yang dipetakan ke pesan. Teks asli dari SDK tidak pernah tampil. */
export class FirebaseClientError extends Error {
  // Deklarasi eksplisit, bukan parameter property: `tsconfig.app.json` menyalakan
  // `erasableSyntaxOnly`, yang melarang sintaks yang harus dihapus compiler.
  readonly code: FirebaseErrorCode;

  constructor(code: FirebaseErrorCode, message: string) {
    super(message);
    this.name = "FirebaseClientError";
    this.code = code;
  }
}

export type FirebaseErrorCode =
  | "email-unverified"
  | "email-already-used"
  | "invalid-credential"
  | "weak-password"
  | "popup-closed"
  | "rate-limited"
  | "not-configured";

const CODE_TO_MESSAGE: Record<string, string> = {
  "auth/invalid-credential": "Email atau sandi tidak cocok.",
  "auth/user-not-found": "Email atau sandi tidak cocok.",
  "auth/wrong-password": "Email atau sandi tidak cocok.",
  "auth/invalid-email": "Format email tidak valid.",
  "auth/email-already-in-use": "Email itu sudah punya akun. Masuk saja.",
  "auth/weak-password": "Sandi minimal 6 karakter.",
  "auth/popup-closed-by-user": "Jendela masuk Google ditutup sebelum selesai.",
  "auth/popup-blocked": "Popup diblokir peramban. Izinkan popup untuk situs ini.",
  "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi sebentar lagi.",
  "auth/operation-not-allowed": "Metode masuk ini belum diaktifkan di Firebase Console.",
  "auth/network-request-failed": "Jaringan bermasalah. Periksa koneksi lalu coba lagi.",
  "auth/unauthorized-domain": "Domain ini belum diizinkan di Firebase Console.",
};

/**
 * Terjemahkan error SDK jadi kalimat yang bisa ditindaklanjuti.
 *
 * Fallback disengaja dibuat generik. Kode yang tidak dikenal TIDAK ikut
 * ditampilkan, karena beberapa di antaranya memuat nama project atau
 * konfigurasi yang tidak perlu dilihat pengguna.
 */
export function firebaseErrorMessage(error: unknown): string {
  if (error instanceof FirebaseClientError) return error.message;
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && CODE_TO_MESSAGE[code]) return CODE_TO_MESSAGE[code];
  return "Gagal masuk. Coba lagi sebentar lagi.";
}
