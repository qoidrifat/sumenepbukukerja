// Provider kredensial OTP email (Fase 9.5) — pengganti jalur OTP milik
// platform yang dihapus di Fase 9.2, dengan kunci Resend milik sendiri.
//
// CATATAN KONTEKS: `authorize` di sini berjalan dalam konteks ACTION Convex
// Auth (`GenericActionCtxWithAuthConfig`), BUKAN mutation — jadi tidak ada
// `ctx.db`. Verifikasi kode lewat `internal.otpEmail.verifyOtpCode` (satu
// transaksi baca-banding-bakar), dan pembuatan akun lewat `auth:store`
// `createAccountFromCredentials` resmi — pola yang sama dengan provider
// `firebase` di sebelah. Yang terakhir ini memberi tiga hal gratis:
// menautkan akun Google lama ber-email sama (`shouldLinkViaEmail`),
// menulis baris `authAccounts`, dan mengisi `emailVerificationTime`.
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { FunctionReference } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { normalizeEmail, sha256Hex } from "../../lib/otp-email";

/**
 * Referensi ke `auth:store`. Ditulis sebagai konstanta, BUKAN impor dari
 * `../auth` — alasan lingkarannya sama dengan yang tertulis di `firebase.ts`.
 */
const AUTH_STORE = "auth:store" as unknown as FunctionReference<"mutation">;

/** Id provider. Klien memanggil `signIn("otp-email", { email, code })`. */
const PROVIDER_ID = "otp-email";

/**
 * Bentuk argumen `auth:store` untuk pembuatan akun dari kredensial.
 *
 * Kunci tipe yang sama dengan `CreateAccountArgs` di `firebase.ts`: `store`
 * terdaftar sebagai `internal`, sedangkan `ctx.runMutation` di dalam provider
 * menerima referensi publik — perbedaannya hanya bentuk TIPE referensinya,
 * argumennya sama persis. Jadi referensinya yang di-cast satu kali,
 * sementara argumennya dikunci di sini supaya compiler memeriksa nama field
 * dan tipenya. Kalau store berubah, build gagal di sini, bukan gagal saat
 * orang mencoba masuk.
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

/**
 * Bentuk argumen untuk `auth:store` — dibungkus `{ args }`, bukan dikirim
 * level paling atas (lihat `createAccountRequest` di `firebase.ts`).
 *
 * Diekstrak jadi fungsi murni supaya bentuk pembungkusnya terlihat di satu
 * tempat dan perubahan shape menggagalkan typecheck di sini.
 */
function createAccountRequest(email: string): { args: CreateAccountArgs } {
  return {
    args: {
      type: "createAccountFromCredentials",
      provider: PROVIDER_ID,
      account: { id: email },
      profile: { email, emailVerified: true },
      shouldLinkViaEmail: true,
    },
  };
}

export const otpEmail = ConvexCredentials<DataModel>({
  id: PROVIDER_ID,
  authorize: async (credentials, ctx) => {
    const email = normalizeEmail(String(credentials.email ?? ""));
    const code = String(credentials.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return null;

    const verdict = await ctx.runMutation(internal.otpEmail.verifyOtpCode, {
      email,
      codeHash: await sha256Hex(code),
    });
    if (!verdict.ok) return null;

    const result = (await ctx.runMutation(AUTH_STORE, createAccountRequest(email))) as
      | { user?: { _id?: unknown } }
      | undefined;

    const userId = result?.user?._id;
    if (typeof userId !== "string") {
      console.warn("[OTP_EMAIL] akun tidak berhasil dibuat atau ditemukan");
      return null;
    }
    return { userId: userId as never };
  },
});
