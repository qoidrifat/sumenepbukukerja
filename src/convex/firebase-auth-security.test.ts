/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { firebase, identityFromClaims } from "./auth/firebase";
import { emailOtp } from "./auth/emailOtp";

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
 *  5. PROVIDER OTP TIDAK BOLEH HILANG. Menambah provider baru tidak boleh
 *     mematikan jalur yang sudah dipakai pengguna yang kuncinya tersedia.
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

describe("Fase 9.2: registrasi provider", () => {
  test("provider firebase terdaftar dengan id yang dipanggil klien", () => {
    expect(provider.type).toBe("credentials");
    expect(provider.options?.id).toBe("firebase");
  });

  test("provider OTP yang lama masih ada dengan id yang sama", () => {
    // Menambah jalur baru tidak boleh mematikan jalur lama. Kalau kuncinya
    // suatu saat tersedia lagi, alur itu harus langsung hidup tanpa kod ulang.
    const otp = emailOtp as unknown as { type?: string; options?: { id?: string } };
    expect(otp.type).toBe("email");
    expect(otp.options?.id).toBe("email-otp");
  });

  test("sumber tidak memuat project id atau token sebagai literal", () => {
    const source = readFileSync(SOURCE, "utf8");
    // Issuer dan JWKS harus dibangun dari env, bukan ditulis mati.
    expect(source).toContain(FIREBASE_PROJECT_ID_ENV);
    expect(source).toMatch(/securetoken\.google\.com\/\$\{/);
    expect(source).toMatch(/service_accounts\/v1\/jwk\/\$\{/);
    // Tidak ada satu pun ID token atau private key yang boleh masuk repo.
    expect(source).not.toMatch(/eyJhbGciOi/);
    expect(source).not.toMatch(/-----BEGIN/);
  });
});
