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

    const result = (await ctx.runMutation(AUTH_STORE, {
      args: {
        type: "createAccountFromCredentials",
        provider: PROVIDER_ID,
        account: { id: email },
        profile: { email, emailVerified: true },
        shouldLinkViaEmail: true,
      },
    })) as { user?: { _id?: unknown } } | undefined;

    const userId = result?.user?._id;
    if (typeof userId !== "string") {
      console.warn("[OTP_EMAIL] akun tidak berhasil dibuat atau ditemukan");
      return null;
    }
    return { userId: userId as never };
  },
});
