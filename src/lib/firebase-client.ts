// Klien Firebase Authentication, sisi peramban.
//
// FASE 9.5
//
// Tiga aturan yang tidak bisa ditawar di berkas ini:
//
// 1. INISIALISASI LAZY. Modul Firebase hanya dibuat saat ada yang benar-benar
//    memanggil. Alasannya ukuran: bundel auth Firebase menambah bobot yang
//    tidak proporsional untuk satu tombol di halaman `/auth`. Halaman itu sudah
//    `lazy()` di `src/main.tsx`, jadi komponen ini tidak pernah menyentuh jalur
//    kritis beranda.
// 2. KETIKA ENV BELUM DIISI, TIDAK ADA YANG MELEDAK. `firebaseAvailable()` jadi
//    `false`, tombol Google disembunyikan, dan `/auth` menampilkan penjelasan
//    apa yang belum terisi. Auth yang hilang total akan membuat `/auth` kosong
//    untuk siapa pun, dan layar kosong selalu dibaca orang sebagai situs rusak.
// 3. PESAN ERROR KE PENGGUNA TIDAK PERNAH BERISI DETAIL TEKNIS. Kode Firebase
//    dipetakan ke kalimat yang bisa ditindaklanjuti. Menumpuk pesan mentah
//    dari SDK pernah membocorkan nama project dan konfigurasi di halaman, dan
//    itu persis kelas kesalahan yang ditegakkan di
//    `docs/security/PHASE-9.1-*`.
//
// FASE 9.5 menghapus seluruh fungsi email-sandi (`createEmailAccount`,
// `signInWithEmail`, `requestPasswordReset`, `completePasswordReset`):
// tidak ada lagi pintu berbasis kredensial Firebase di `/auth`, jadi
// keempatnya yatim. Yang tersisa di sini hanya Google.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type Auth,
} from "firebase/auth";
import { FIREBASE_WEB_CONFIG, type FirebaseWebConfig } from "./firebase-web-config";

type FirebaseClientConfig = FirebaseWebConfig;

/**
 * Awalan nilai yang disandikan pipeline build.
 *
 * Dipakai sebagai deteksi, bukan formalitas. Tanpa cek ini, konfigurasi
 * terenkripsi lolos sebagai "terisi" dan kegagalannya baru ketahuan di sisi
 * Firebase dengan pesan yang tidak menunjuk ke build.
 */
const ENCRYPTED_PREFIX_PATTERN = /^encrypted:/i;

let cached: { auth: Auth; projectId: string } | null = null;

/**
 * Env yang dibaca lebih dulu, kalau isinya layak pakai.
 *
 * Ketiganya bukan rahasia. Aturan Firebase memang client key bukan rahasia,
 * dan nilainya sudah ikut ada di bundel setiap kali aplikasi dimuat. Yang
 * tidak pernah ada di sini: private key, service account, atau kredensial
 * admin.
 */
function configFromEnv(): FirebaseClientConfig | null {
  // WAJIB dibaca sebagai anggota statik. Akses lewat objek
  // `const env = import.meta.env` membuat nama variabelnya sendiri yang
  // disandikan, sehingga kompilasi tidak pernah menggantinya dengan teks
  // biasa. Buktinya ada di bundle produksi.
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !authDomain || !projectId) return null;
  if (ENCRYPTED_PREFIX_PATTERN.test(apiKey) || ENCRYPTED_PREFIX_PATTERN.test(authDomain)) {
    // Keluhan ini tidak pernah tampil di layar. Isinya hanya untuk operator.
    console.error(
      "[FIREBASE_AUTH] VITE_FIREBASE_* masuk terenkripsi oleh pipeline build. Memakai konfigurasi dari repo.",
    );
    return null;
  }
  return { apiKey, authDomain, projectId };
}

/**
 * Konfigurasi yang benar-benar dipakai.
 *
 * `configFromEnv` lebih dulu, konstanta di `firebase-web-config.ts` sebagai
 * cadangan. Urutan ini penting: di Freebuff, setiap env yang ditambahkan
 * operator tiba di aplikasi dalam keadaan terenkripsi, jadi di Freebuff env
 * tidak pernah jadi sumber utama. Penjelasan panjangnya ada di berkas
 * konfigurasi itu.
 */
function readConfig(): FirebaseClientConfig | null {
  return configFromEnv() ?? { ...FIREBASE_WEB_CONFIG };
}

/** Apakah tombol Google boleh ditampilkan sama sekali. */
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

/** Dipakai kalau penyebabnya tidak bisa dipastikan. Sengaja tanpa kode. */
const GENERIC_MESSAGE = "Gagal masuk. Coba lagi sebentar lagi.";

/**
 * Kode error Firebase yang dipetakan ke kalimat yang bisa ditindaklanjuti.
 *
 * Peta ini pernah terlalu sempit: sebelas kode. Semua yang tidak ada di sana
 * jatuh ke satu kalimat generik - termasuk kode yang menunjuk masalah
 * konfigurasi milik operator, seperti kunci API yang tidak sah atau project
 * id yang salah. Pengunjung lalu melihat "Gagal masuk" padahal penyebabnya ada
 * di sisi build, bukan di miliknya, dan tidak ada yang bisa mengetahuinya.
 *
 * Dua aturan yang wajib dijaga setiap kali kode baru ditambahkan:
 *
 *   1. Kalimatnya HARUS menyebut apa yang harus dilakukan, bukan sekadar
 *      menyatakan gagal.
 *   2. Kalimatnya TIDAK BOLEH menyebut nama environment variable, nama
 *      project, atau potongan isi kunci. Halaman ini publik. Rincian untuk
 *      operator ada di baris console.warn di bawah, yang tidak pernah tampil
 *      di layar. Aturan kedua dikunci test di `firebase-client.test.ts`.
 */
const CODE_TO_MESSAGE: Record<string, string> = {
  // Kredensial dan status akun.
  "auth/invalid-credential": "Email atau sandi tidak cocok.",
  "auth/user-not-found": "Email atau sandi tidak cocok.",
  "auth/wrong-password": "Email atau sandi tidak cocok.",
  "auth/invalid-email": "Format email tidak valid.",
  "auth/email-already-in-use": "Email itu sudah punya akun. Masuk saja.",
  "auth/weak-password": "Sandi minimal 6 karakter.",
  "auth/user-disabled": "Akun ini dinonaktifkan. Hubungi pengelola.",
  "auth/credential-already-in-use":
    "Email itu sudah dipakai metode masuk lain. Masuk saja dengan yang sudah ada.",
  "auth/multi-factor-auth-required":
    "Akun ini butuh verifikasi tambahan. Hubungi pengelola untuk membuka aksesnya.",
  "auth/unsupported-first-factor": "Metode masuk ini tidak dipakai akun tersebut.",

  // Verifikasi email.
  "auth/email-already-verified":
    "Email itu sudah terverifikasi. Masuk saja dengan sandi Anda.",
  "auth/invalid-verification-code": "Kode verifikasi tidak cocok atau sudah kedaluwarsa.",
  "auth/invalid-verification-id": "Tautan verifikasi tidak berlaku lagi. Minta yang baru.",
  "auth/expired-action-code": "Tautan verifikasi sudah kedaluwarsa. Minta yang baru.",

  // Reset sandi.
  "auth/invalid-action-code": "Tautan ini sudah tidak berlaku atau sudah dipakai. Minta tautan baru.",
  "auth/missing-password": "Sandi baru belum diisi.",

  // Jendela masuk dan keterbatasan peramban.
  "auth/popup-closed-by-user": "Jendela masuk Google ditutup sebelum selesai.",
  "auth/popup-blocked": "Popup diblokir peramban. Izinkan popup untuk situs ini.",
  "auth/cancelled-popup-request":
    "Percobaan masuk sebelumnya masih berjalan. Tutup jendela yang terbuka, lalu coba lagi.",
  "auth/operation-not-supported-in-this-environment":
    "Masuk lewat jendela tidak didukung di lingkungan ini. Kembali dan gunakan tombol Google atau Email.",
  "auth/web-storage-unsupported":
    "Peramban ini memblokir penyimpanan lokal, jadi sesi tidak bisa disimpan. Coba peramban lain.",
  "auth/network-request-failed": "Jaringan bermasalah. Periksa koneksi lalu coba lagi.",

  // Konfigurasi Firebase. Kelompok ini penyebab paling sering di proyek ini,
  // dan semuanya adalah salah setelan, bukan kesalahan pengguna.
  "auth/unauthorized-domain": "Domain ini belum diizinkan di Firebase Console.",
  "auth/invalid-api-key":
    "Kunci API Firebase pada build ini tidak valid. Administrator perlu memperbarui konfigurasi build.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    "Kunci API Firebase pada build ini tidak valid. Administrator perlu memperbarui konfigurasi build.",
  "auth/project-not-found":
    "Proyek Firebase tidak ditemukan. Administrator perlu memeriksa konfigurasi build.",
  "auth/configuration-not-found":
    "Authentication di proyek Firebase ini belum disiapkan. Hubungi pengelola.",
  "auth/requests-from-referer-are-blocked":
    "Domain ini diblokir oleh pembatasan kunci API. Administrator perlu mengizinkan domain ini.",
  "auth/app-not-authorized":
    "Aplikasi web ini belum terdaftar di proyek Firebase. Hubungi pengelola.",
  "auth/operation-not-allowed": "Metode masuk ini belum diaktifkan di Firebase Console.",
  "auth/tenant-id-mismatch": "Konfigurasi masuk tidak cocok dengan akun ini.",

  // Kuota dan laju.
  "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi sebentar lagi.",
  "auth/quota-exceeded": "Kuota Firebase untuk hari ini sudah habis. Coba lagi besok.",
};

/**
 * Terjemahkan error SDK jadi kalimat yang bisa ditindaklanjuti.
 *
 * Dua aturan yang dipegang di sini:
 *
 * 1. KODE ASLI TIDAK PERNAH TAMPIL DI LAYAR. Kalimat mentah dari SDK pernah
 *    memuat nama project dan konfigurasi, dan itu persis kebocoran yang
 *    ditegakkan di `docs/security/PHASE-9.1-*`. Yang tampil hanya kalimat di
 *    peta atau `GENERIC_MESSAGE`.
 * 2. KODE ASLI TETAP DICATAT KE CONSOLE. Tanpa ini, satu kode baru dari
 *    Firebase hanya muncul sebagai "gagal masuk" dan operator tidak punya
 *    bahan apa pun untuk mencari penyebabnya. Kode Firebase bukan rahasia,
 *    cuma kode.
 */
export function firebaseErrorMessage(error: unknown): string {
  if (error instanceof FirebaseClientError) return error.message;
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== "string") return GENERIC_MESSAGE;
  console.warn(`[FIREBASE_AUTH] kode error: ${code}`);
  return CODE_TO_MESSAGE[code] ?? GENERIC_MESSAGE;
}