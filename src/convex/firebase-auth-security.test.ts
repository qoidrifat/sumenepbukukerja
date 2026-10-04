/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAccountRequest, firebase, identityFromClaims } from "./auth/firebase";

/**
 * FASE 9.2 - regression test untuk provider Firebase.
 *
 * Yang dikunci di sini, semuanya hal yang kalau lupa akan jadi lubang:
 *
 *  1. IDENTITAS DARI `sub`, BUKAN EMAIL. `sub` (Firebase UID) tidak bisa diubah
 *     pengguna; email bisa. Kalau uid diambil dari email, satu orang bisa
 *     mengambil alih akun orang lain hanya dengan mengubah email akunnya.
 *  2. `email_verified` WAJIB true. Provider memakai `shouldLinkViaEmail: true`,
 *     jadi akun dengan email yang belum terverifikasi bisa menautkan diri ke
 *     akun lama yang memakai email sama - termasuk akun dengan daftar dan peran
 *     pengelola.
 *  3. GAGAL TERTUTUP KALAU PROJECT ID KOSONG. Tanpa issuer yang diketahui, tidak
 *     boleh ada token yang diterima.
 *  4. TOKEN DAN DETAIL ERROR TIDAK PERNAH KE PESAN. Pola yang sama seperti
 *     `otp-provider-security.test.ts`, dan alasannya sama: `auth:signIn` bisa
 *     dipanggil siapa pun tanpa sesi.
 *  5. JALUR EMAIL-OTP SUDAH DIHAPUS. Provider-nya bergantung pada kredensial
 *     milik platform lain yang tidak bisa dibuat ulang di akun pemilik, jadi
 *     membiarkannya terdaftar hanya menghasilkan form yang pasti gagal.
 */

const FIREBASE_PROJECT_ID_ENV = "FIREBASE_PROJECT_ID";
const SOURCE = new URL("./auth/firebase.ts", import.meta.url);

/**
 * Bentuk yang BENAR-BENAR dipakai Convex Auth.
 *
 * `ConvexCredentials()` mengembalikan objek yang isinya ada di dua tempat:
 * properties atas (`type: "credentials"`, `id: "credentials"`) dan isi
 * konfigurasi di dalam `options`. Convex Auth menggabungkan keduanya lewat
 * `merge(provider, provider.options)` di `provider_utils.ts`, jadi yang
 * effective adalah `options`. `authorize` milik Convex Auth di atas selalu
 * mengembalikan `null` - kalau test memanggil itu, dia menguji internal
 * pustaka, bukan kode kita.
 */
type FirebaseProviderShape = {
  type?: string;
  options?: {
    id?: string;
    authorize?: (
      credentials: Record<string, unknown>,
      ctx: unknown,
    ) => Promise<{ userId?: unknown } | null>;
  };
};

const provider = firebase as unknown as FirebaseProviderShape;
const authorize = provider.options?.authorize;

const VERIFIED = {
  sub: "firebase-uid-abc123",
  email: "Warga.Sumenep@Gmail.com",
  email_verified: true,
  // Asal kredensial menurut ID token Firebase. Fase 9.5 hanya menerima
  // Google; nilai lain (termasuk tidak ada) harus ditolak.
  firebase: { sign_in_provider: "google.com" },
  name: "Warga Sumenep",
  picture: "https://example.test/photo.jpg",
};

describe("Fase 9.2: klaim yang sudah terverifikasi signature-nya", () => {
  test("email dinormalkan ke huruf kecil dan dipangkas", () => {
    const identity = identityFromClaims(VERIFIED);
    expect(identity.email).toBe("warga.sumenep@gmail.com");
  });

  test("identitas diambil dari sub, bukan dari email", () => {
    const identity = identityFromClaims(VERIFIED);
    expect(identity.uid).toBe("firebase-uid-abc123");
    expect(identity.uid).not.toBe(identity.email);
  });

  test("nama dan foto hanya diambil kalau memang string", () => {
    const identity = identityFromClaims({ ...VERIFIED, name: 42, picture: null });
    expect(identity.name).toBeUndefined();
    expect(identity.picture).toBeUndefined();
  });

  test("tanpa sub, masuk ditolak", () => {
    expect(() => identityFromClaims({ ...VERIFIED, sub: "" })).toThrow(/tidak lengkap/i);
    expect(() => identityFromClaims({ ...VERIFIED, sub: undefined })).toThrow(/tidak lengkap/i);
  });

  test("email yang belum diverifikasi ditolak, bukan diterima diam-diam", () => {
    // Ini aturan yang menjaga `shouldLinkViaEmail` di provider. Nilai yang salah
    // di sini berarti satu orang bisa mengambil alih akun orang lain.
    expect(() => identityFromClaims({ ...VERIFIED, email_verified: false })).toThrow(
      /verifikasi email/i,
    );
    // `email_verified` yang tidak ada sama sekali tidak boleh dianggap true.
    // Field-nya dihapus lewat `Object.fromEntries`, bukan destructuring, supaya
    // tidak ada variabel yang hanya buat dibuang.
    const withoutFlag = Object.fromEntries(
      Object.entries(VERIFIED).filter(([key]) => key !== "email_verified"),
    );
    expect(() => identityFromClaims(withoutFlag)).toThrow(/verifikasi email/i);
    // String "true" bukan boolean true.
    expect(() =>
      identityFromClaims({ ...VERIFIED, email_verified: "true" as unknown }),
    ).toThrow(/verifikasi email/i);
  });

  test("tanpa email, masuk ditolak walau email_verified true", () => {
    expect(() => identityFromClaims({ ...VERIFIED, email: "" })).toThrow(/verifikasi email/i);
  });

  test("token provider sandi ditolak walau signature-nya sah", () => {
    // FASE 9.5. Token akun sandi lama VALID secara signature (project sama,
    // issuer/audience cocok), jadi tanpa gerbang ini penghapusan UI hanya
    // kosmetik: `signIn("firebase", { token })` tetap menerbitkan sesi.
    // `identityFromClaims` hanya menerima klaim yang SUDAH terverifikasi,
    // jadi test ini tepat menggambarkan gerbangnya: klaim password masuk,
    // identitas tidak keluar.
    expect(() =>
      identityFromClaims({
        ...VERIFIED,
        firebase: { sign_in_provider: "password" },
      }),
    ).toThrow(/sudah tidak dipakai/i);
  });

  test("klaim firebase yang hilang atau bukan string ditolak tertutup", () => {
    // Klaim karangan tidak boleh lolos karena bentuknya tak dikenal.
    const withoutProvider = Object.fromEntries(
      Object.entries(VERIFIED).filter(([key]) => key !== "firebase"),
    );
    expect(() => identityFromClaims(withoutProvider)).toThrow(/sudah tidak dipakai/i);
    expect(() =>
      identityFromClaims({ ...VERIFIED, firebase: { sign_in_provider: 42 } }),
    ).toThrow(/sudah tidak dipakai/i);
    expect(() =>
      identityFromClaims({ ...VERIFIED, firebase: "google.com" }),
    ).toThrow(/sudah tidak dipakai/i);
  });

  test("penolakan provider menyebut pintu hidup, bukan isi klaim", () => {
    let caught: Error | null = null;
    try {
      identityFromClaims({
        ...VERIFIED,
        firebase: { sign_in_provider: "password" },
      });
    } catch (error) {
      caught = error as Error;
    }
    // Menyebut pintu yang hidup (Google, OTP) supaya bisa ditindaklanjuti;
    // tidak menyebut provider yang ditolak, uid, atau email dari klaim.
    expect(caught?.message).toContain("Google");
    expect(caught?.message).toContain("OTP");
    expect(caught?.message).not.toContain("password");
    expect(caught?.message).not.toContain("firebase-uid-abc123");
    expect(caught?.message).not.toContain("warga.sumenep@gmail.com");
  });
});

describe("Fase 9.2: gerbang authorize", () => {
  const previous = process.env[FIREBASE_PROJECT_ID_ENV];

  beforeEach(() => {
    process.env[FIREBASE_PROJECT_ID_ENV] = "uji-bukan-project-nyata";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (previous === undefined) delete process.env[FIREBASE_PROJECT_ID_ENV];
    else process.env[FIREBASE_PROJECT_ID_ENV] = previous;
    vi.restoreAllMocks();
  });

  test("token kosong tidak pernah menyentuh jaringan atau database", async () => {
    expect(await authorize?.({ token: "" }, {})).toBeNull();
    expect(await authorize?.({ token: "   " }, {})).toBeNull();
  });

  test("token yang bukan string ditolak tanpa error membingungkan", async () => {
    expect(await authorize?.({}, {})).toBeNull();
    expect(await authorize?.({ token: 12345 }, {})).toBeNull();
  });

  test("tanpa project id, gagal tertutup dan menyebut nama env var", async () => {
    delete process.env[FIREBASE_PROJECT_ID_ENV];
    const token = "token-palsu-yang-tidak-pernah-boleh-dikirim-ke-client";

    let caught: Error | null = null;
    try {
      await authorize?.({ token }, {});
    } catch (error) {
      caught = error as Error;
    }

    expect(caught, "tanpa project id, masuk harus gagal").not.toBeNull();
    // Pesan harus membantu operator, bukan pengguna.
    expect(caught?.message).toContain(FIREBASE_PROJECT_ID_ENV);
    // Dan tidak boleh pernah memuat token.
    expect(caught?.message).not.toContain(token);
    expect(caught?.message).not.toMatch(/eyJ/);
  });

  test("token tidak sah tidak pernah muncul di pesan error", async () => {
    const token = "eyJhbGciOiJSUzI1NiJ9.token-palsu.signature-palsu";
    let caught: Error | null = null;
    try {
      await authorize?.({ token }, {});
    } catch (error) {
      caught = error as Error;
    }
    expect(caught, "token tidak sah harus ditolak").not.toBeNull();
    const message = caught?.message ?? "";
    expect(message).not.toContain(token);
    expect(message).not.toContain("eyJhbGciOiJSUzI1NiJ9");
    // Nama host JWKS juga tidak perlu muncul ke pemanggil.
    expect(message).not.toContain("googleapis.com");
  });
});

describe("Fase 9.2: bentuk permintaan pembuatan akun", () => {
  test("argumen dibungkus di dalam field args, bukan dikirim level teratas", () => {
    // Regresi untuk ArgumentValidationError yang memblokir SELURUH pengguna.
    //
    // `auth:store` tidak menerima `{ type, provider, account, ... }` langsung.
    // Validatornya `v.object({ args: v.union(...) })`, jadi seluruh isi harus
    // masuk ke satu field bernama `args`. Tanpa pembungkusan itu, verifikasi
    // token berhasil - akun dan email terbaca server - tetapi pembuatan sesi
    // ditolak, dan yang tampil ke pengguna tetap "gagal masuk".
    const request = createAccountRequest(identityFromClaims(VERIFIED));
    expect(Object.keys(request)).toEqual(["args"]);
    expect(request.args.type).toBe("createAccountFromCredentials");
    expect(request.args.provider).toBe("firebase");
    expect(request.args.account.id).toBe(VERIFIED.sub);
    expect(request.args.shouldLinkViaEmail).toBe(true);
  });

  test("profil yang dikirim memuat email terverifikasi dan tidak memuat token", () => {
    const request = createAccountRequest(identityFromClaims(VERIFIED));
    const serialized = JSON.stringify(request);
    expect(request.args.profile.email).toBe("warga.sumenep@gmail.com");
    expect(request.args.profile.emailVerified).toBe(true);
    // `account.id` memang berisi `sub`; itu persis aturan identitas kita.
    expect(request.args.account.id).toBe(VERIFIED.sub);
    // Yang tidak boleh ikut terbawa adalah ID token mentah.
    expect(serialized).not.toMatch(/eyJhbGciOi/);
  });
});

describe("Fase 9.2: registrasi provider", () => {
  test("provider firebase terdaftar dengan id yang dipanggil klien", () => {
    expect(provider.type).toBe("credentials");
    expect(provider.options?.id).toBe("firebase");
  });

  test("provider email-otp sudah tidak terdaftar lagi", () => {
    // Kredensialnya milik platform lain dan tidak bisa dibuat ulang, jadi
    // provider ini tidak akan pernah bisa mengirim kode. Seliorkannya dari
    // daftar provider mencegah `/auth` menampilkan form OTP yang pasti gagal.
    const source = readFileSync(SOURCE, "utf8");
    expect(source).not.toContain("email-otp");
    expect(source).not.toContain("emailOtp");
  });

  test("provider otp-email terdaftar sebagai pengganti resmi (Fase 9.5)", () => {
    // Larangan `email-otp` di atas TETAP: itu provider lama berkredensial
    // milik platform lain. Yang diizinkan di sini hanya penerusnya yang
    // kuncinya milik sendiri (`RESEND_API_KEY`), terdaftar di `auth.ts`.
    const otpEmailSource = readFileSync(new URL("./auth/otpEmail.ts", import.meta.url), "utf8");
    expect(otpEmailSource).toContain('"otp-email"');
    const authSource = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
    expect(authSource).toContain("otpEmail");
  });

  test("komentar auth.ts tidak lagi menunjuk sandi sebagai pintu pengganti (Fase 9.5)", () => {
    // Masuk email-sandi dihapus total di Fase 9.5. Komentar yang masih
    // menyebutnya sebagai "jalur yang menggantikan" akan mengirim pembaca
    // ke pintu yang sudah tidak ada - persis jalan buntu yang dihapus itu.
    const authSource = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
    expect(authSource).not.toContain("Email/Sandi");
    expect(authSource).toContain("9.5");
  });

  test("sumber tidak memuat project id atau token sebagai literal", () => {
    const source = readFileSync(SOURCE, "utf8");
    // Issuer tetap dibangun dari env, bukan ditulis mati.
    expect(source).toContain(FIREBASE_PROJECT_ID_ENV);
    expect(source).toMatch(/securetoken\.google\.com\/\$\{/);
    // Tidak ada satu pun ID token atau private key yang boleh masuk repo.
    expect(source).not.toMatch(/eyJhbGciOi/);
    expect(source).not.toMatch(/-----BEGIN/);
  });

  test("kunci publik diambil dari layanan penandatangan, bukan dari project id", () => {
    const source = readFileSync(SOURCE, "utf8");
    // Regresi untuk bug yang membuat semua pengguna ditolak.
    //
    // Endpoint `service_accounts/v1/jwk/{nama}` MEMBUTUHKAN nama service
    // account. Memasukkan project id membalas 400, `jwtVerify` selalu gagal,
    // dan pesannya ("Sesi Google tidak bisa diverifikasi") identik dengan
    // kasus token palsu - sehingga tidak ada bedanya di log dan tidak ada yang
    // realizes sampai semua orang gagal masuk.
    expect(source).toContain("securetoken@system.gserviceaccount.com");
    // Dan project id tidak boleh disisipkan ke URL JWKS sama sekali.
    expect(source).not.toMatch(/service_accounts\/v1\/jwk\/\$\{/);
    expect(source).not.toMatch(/jwk\/\$\{projectId\}/);
  });
});
