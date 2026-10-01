// Provider autentikasi Firebase (Google / email+sandi).
//
// FASE 9.2 - FASAL 9.1.1
//
// Latar belakang yang jujur: proyek ini sebelumnya hanya punya jalur OTP yang
// bergantung pada kredensial milik platform Freebuff. Kredensial itu tidak bisa
// dirotasi dan tidak bisa disalin ke akun Convex milik pemilik sendiri, jadi
// setelah migrasi akun jalur itu tidak punya kuncinya dan provider-nya sudah
// dihapus. Provider ini menutup jalur masuk tanpa kredensial tersebut.
//
// Mengapa `ConvexCredentials` dan bukan "cukup kirim ID token ke Convex":
// `requireUser()` di `src/convex/access.ts` memakai `getAuthUserId()` dari
// Convex Auth, yang membaca SESI Convex Auth - bukan identitas dari token JWT
// mentah. Memberi token Firebase lewat `setAuth()` hanya membuat
// `ctx.auth.getUserIdentity()` terisi, tanpa membuat sesi, sehingga setiap
// panggilan terautentikasi tetap ditolak dengan "Masuk untuk menggunakan fitur
// Buku Kerja". `ConvexCredentials` adalah jalur resmi yang membuat sesi itu,
// dan tidak ada lagi provider lain yang bergantung pada kredensial pihak ketiga.
//
// Yang dikunci di sini, dan alasan setiap keputusan:
//
// 1. VERIFIKASI TOKEN DI SERVER. Token diverifikasi di sini dengan JWKS resmi
//    Google, bukan karena klien sudah masuk. Klien yang mengarang payload hanya
//    bisa sampai ke baris verifikasi dan berhenti di situ.
// 2. `email_verified` WAJIB true. Aplikasi ini menurunkan nama publik dari
//    email (lihat `src/lib/display-name.ts`) dan memakai email untuk mengaitkan
//    akun. Akun Firebase dengan email yang belum terverifikasi akan membuat
//    dua orang bisa mengklaim identitas yang sama.
// 3. `issuer` dan `audience` keduanya dicocokkan dengan project id. Tanpa itu,
//    token dari project Firebase lain milik orang lain akan diterima.
// 4. GAGAL TERTUTUP, TANPA MENYALIN APA PUN. Pesan yang dilempar ke pemanggil
//    tidak pernah memuat token, kunci JWKS, atau objek error dari `jose`.
//    Pola yang sama sudah dipakai di provider OTP yang sekarang dihapus, dan
//    aturan itu dikunci test di berkas ini.
// 5. Identitas memakai `sub` (Firebase UID), bukan email. `sub` tidak bisa
//    diubah pengguna; email bisa.
//
// CATATAN PRODUK: `shouldLinkViaEmail: true` berarti akun Google dengan email
// yang sama TERHUBUNG ke akun lama yang sudah ada, jadi listing, permintaan, dan
// peran pengelola ikut terbawa. Itu yang membuat migrasi tidak memutus riwayat.
// Kalau suatu saat ingin pemisahan penuh, ubah satu baris ini - tapi perhatikan
// akibatnya: orang yang sama akan punya dua akun terpisah, dan itu keputusan
// produk, bukan keputusan teknis.

import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FunctionReference } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

/**
 * Referensi ke `auth:store`.
 *
 * Sengaja ditulis sebagai konstanta, BUKAN diimpor dari `./auth`. Impor
 * `./auth` dari berkas ini akan membentuk lingkaran: `./auth` memanggil
 * `convexAuth({ providers: [..., firebase] })` pada waktu modul dievaluasi,
 * sementara `firebase` belum selesai diinisialisasi - sehingga provider-nya
 * bernilai `undefined` dan `convexAuth()` gagal saat start, bukan saat ada
 * yang mencoba masuk. Bukti kegagalannya ada di
 * `src/convex/firebase-auth-security.test.ts`.
 *
 * Bentuk argumennya tetap dikunci penuh oleh tipe di bawah, jadi perubahan
 * shape di store tetap menggagalkan build.
 */
const AUTH_STORE = "auth:store" as unknown as FunctionReference<"mutation">;

/**
 * Bentuk argumen `auth:store` untuk pembuatan akun dari kredensial.
 *
 * `store` terdaftar sebagai `internal`, sedangkan `ctx.runMutation` di dalam
 * provider menerima referensi publik. Perbedaannya hanya bentuk TIPE
 * referensinya - argumennya sama persis. Jadi referensinya yang di-cast satu
 * kali, sementara argumennya dikunci di sini supaya compiler tetapotene_entry
 * memeriksa nama field dan tipenya. Kalau store berubah, build gagal di sini,
 * bukan gagal saat orang mencoba masuk.
 */
type CreateAccountArgs = {
  type: "createAccountFromCredentials";
  provider: string;
  account: { id: string; secret?: string };
  // Validator store untuk field ini memang `v.any()`, jadi bentuknya bebas.
  // Di sini tetap ditulis ketat supaya isi profil yang kita kirim terlihat
  // jelas dan tidak bisa tanpa sengaja melebar tanpa disadari.
  profile: Record<string, unknown>;
  shouldLinkViaEmail?: boolean;
  shouldLinkViaPhone?: boolean;
};

/** Satu-satunya tempat nama variabel project id ditulis. */
const FIREBASE_PROJECT_ID_ENV = "FIREBASE_PROJECT_ID";

/** Id provider. Client memanggil `signIn("firebase", { token })`. */
const PROVIDER_ID = "firebase";

type FirebaseVerified = {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
};

/**
 * Kunci publik penandatangan token Firebase Auth.
 *
 * PENTING: nama yang diminta endpoint ini adalah NAMA LAYANAN yang
 * menandatangani token, yaitu `securetoken@system.gserviceaccount.com` -
 * BUKAN project id. Nama itu memang milik Google dan sama untuk semua
 * project Firebase di dunia.
 *
 * Versi lama memakai `{projectId}` di sini, dan itu selalu gagal: endpoint
 * membalas `400 Request contains an invalid argument` karena project id bukan
 * service account. Akibatnya `jwtVerify` selalu melempar, dan setiap pengguna -
 * termasuk yang sudah benar-benar berhasil masuk di Google - mendapat "Sesi
 * Google tidak bisa diverifikasi". Gejalanya Mirip dengan token palsu, jadi
 * kegagalan ini tidak pernah terdeteksi dari log.
 *
 * Apakah aman memakai kumpulan kunci yang dibagi seluruh project? Ya, karena
 * `issuer` dan `audience` tetap dicocokkan dengan `FIREBASE_PROJECT_ID` di
 * bawah. Token dari project Firebase lain punya `aud` berbeda dan ditolak
 * sebelum signature-nya berarti apa pun. Aturan itu ada di
 * `src/convex/firebase-auth-security.test.ts`.
 *
 * `createRemoteJWKSet` sudah melakukan cache kunci di dalam dirinya dan hanya
 * mengambil ulang saat `kid` yang datang tidak dikenal, jadi rotasi kunci
 * Google tidak perlu ditangani manual.
 */
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function jwksFor() {
  if (jwksCache) return jwksCache;
  const jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  jwksCache = jwks;
  return jwks;
}

/**
 * Ubah klaim yang SUDAH terverifikasi signature-nya menjadi identitas.
 *
 * Dipisah dari verifikasi JWT supaya aturannya bisa diuji tanpa jaringan dan
 * tanpa kunci JWKS. Fungsi ini murni: masuknya klaim, keluarannya identitas
 * atau pelepasan.
 */
export function identityFromClaims(claims: Record<string, unknown>): FirebaseVerified {
  const uid = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!uid) throw new Error("Sesi Google tidak lengkap. Masuk lagi.");

  // Wajib, bukan opsional. Tanpa email terverifikasi, `shouldLinkViaEmail` di
  // bawah bisa menautkan akun ini ke akun orang lain yang memakai email sama.
  if (claims.email_verified !== true || !email) {
    console.warn("[FIREBASE_AUTH] email belum terverifikasi, masuk ditolak");
    throw new Error("Verifikasi email Google Anda dulu sebelum masuk.");
  }

  return {
    uid,
    email,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}

/**
 * Verifikasi satu ID token Firebase dan kembalikan identitas yang sudah
 * dibuktikan.
 *
 * Semua kegagalan dikembalikan sebagai exception generik. Detail kegagalan -
 * termasuk objek error dari `jose`, yang memuat klaim dan alasan kegagalan -
 * hanya ditulis ke log server sebagai kode, bukan ke pemanggil.
 */
async function verifyFirebaseToken(token: string): Promise<FirebaseVerified> {
  const projectId = process.env[FIREBASE_PROJECT_ID_ENV]?.trim();
  if (!projectId) {
    // Fail-closed. Tanpa project id, tidak ada issuer yang bisa dipercaya, dan
    // menerima token apa pun di titik ini sama saja dengan tidak punya auth.
    throw new Error(
      `Masuk lewat Google belum dikonfigurasi. Set ${FIREBASE_PROJECT_ID_ENV} di Keys/API keys.`,
    );
  }

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, jwksFor(), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });
    claims = verified.payload as Record<string, unknown>;
  } catch (error) {
    // Yang dicatat hanya nama kesalahan, bukan objek error-nya: objek itu
    // memuat klaim token dan bisa jadi memuat material yang tidak boleh
    // masuk ke log bersama. Persis aturan yang sama dengan provider OTP yang dihapus.
    const reason = error instanceof Error ? error.name : "unknown";
    console.warn("[FIREBASE_AUTH] verifikasi token gagal", { reason });
    throw new Error("Sesi Google tidak bisa diverifikasi. Masuk lagi.");
  }

  return identityFromClaims(claims);
}
/**
 * Bentuk argumen untuk `auth:store`.
 *
 * Perhatikan lapisannya: mutation-nya bukan `v.object({ type, provider, ... })`,
 * melainkan `v.object({ args: v.union(...) })`. Jadi yang dikirim ke
 * `ctx.runMutation` adalah objek yang membungkus seluruh argumen itu di dalam
 * satu field bernama `args`.
 *
 * Versi lama mengirim isinya langsung sebagai argumen, dan server menjawab
 * `ArgumentValidationError: Object is missing the required field 'args'`.
 * Gejalanya menipu: verifikasi token SUDAH berhasil - akun dan email sudah
 * terbaca server - tapi pembuatan sesi gagal, sehingga yang tampil ke pengguna
 * tetap "gagal masuk" tanpa alasan.
 *
 * Diekstrak jadi fungsi murni supaya bentuk pembungkusnya bisa diuji tanpa
 * jaringan dan tanpa session.
 */
export function createAccountRequest(identity: FirebaseVerified): {
  args: CreateAccountArgs;
} {
  return {
    args: {
      type: "createAccountFromCredentials",
      provider: PROVIDER_ID,
      account: { id: identity.uid },
      profile: {
        email: identity.email,
        emailVerified: true,
        name: identity.name,
        image: identity.picture,
      },
      shouldLinkViaEmail: true,
    },
  };
}

export const firebase = ConvexCredentials<DataModel>({
  id: PROVIDER_ID,
  async authorize(credentials, ctx) {
    const token = typeof credentials.token === "string" ? credentials.token.trim() : "";
    if (!token) return null;

    const identity = await verifyFirebaseToken(token);

    // `createAccountFromCredentials` adalah find-or-create resmi Convex Auth:
    // ia mencari `authAccounts` dengan pasangan (provider, uid) lebih dulu, dan
    // hanya membuat user + account baru kalau memang belum ada. Dipanggil
    // lewat `auth:store` karena context di sini adalah action, yang tidak boleh
    // menulis ke database secara langsung.
    //
    // Argumennya dibungkus `{ args }`, bukan dikirim level paling atas.
    const result = (await ctx.runMutation(AUTH_STORE, createAccountRequest(identity))) as
      | { user?: { _id?: unknown } }
      | undefined;

    const userId = result?.user?._id;
    if (typeof userId !== "string") {
      console.warn("[FIREBASE_AUTH] akun tidak berhasil dibuat atau ditemukan");
      return null;
    }

    return { userId: userId as never };
  },
});
