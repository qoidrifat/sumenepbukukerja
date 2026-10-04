import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * FASE 9.5 - reversal resmi: jalur sandi di `/auth` DIHAPUS TOTAL.
 *
 * Berkas ini DULU mengunci jalur lupa sandi Firebase (tautan reset,
 * `oobCode`, form buat-sandi-baru). Keputusan pemilik membalik itu:
 * tidak ada lagi pintu berbasis sandi - tidak ada form sandi, tidak ada
 * permintaan tautan reset, tidak ada penyelesaian `oobCode`. Yang dikunci
 * di sini adalah ketidakberadaan total jalur itu di `Auth.tsx`, plus
 * keberadaan penggantinya (dialog OTP).
 *
 * Yang TIDAK dikunci di sini: apakah kode OTP benar-benar sampai ke
 * kotak masuk. Itu butuh akun uji dan tetap di luar jangkauan unit test.
 */

const auth = readFileSync(new URL("./Auth.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../lib/firebase-client.ts", import.meta.url), "utf8");

test("tidak ada penangan, state, atau impor sandi yang tersisa di Auth", () => {
  for (const sisa of [
    "handlePasswordSubmit",
    "handlePasswordReset",
    "passwordMode",
    "showReset",
    "resetEmail",
    "RESET_SENT",
    "requestPasswordReset",
    "createEmailAccount",
    "signInWithEmail",
    "ResetPasswordForm",
    "oobCode",
    "admin-auth-intent",
    "Lupa sandi",
  ]) {
    expect(auth, `sisa jalur sandi: ${sisa}`).not.toContain(sisa);
  }
  // "sandi" dalam bentuk apa pun (kapital, gabungan "email-sandi") tidak
  // boleh muncul di salinan UI maupun komentar halaman ini.
  expect(auth).not.toMatch(/sandi/i);
});

test("penggantinya ada: dialog OTP dibuka dari tombol Gunakan Email", () => {
  expect(auth).toContain("EmailOtpDialog");
  expect(auth).toContain("Gunakan Email");
  // Status OTP dibaca saat render untuk matriks ketersediaan; query yang
  // belum terjawab tidak boleh mem-flash fallback.
  expect(auth).toContain("otpEmail");
  expect(auth).toContain("setOtpOpen(true)");
  // Selesai OTP = tutup + navigasi tepat sekali ke tujuan semula.
  expect(auth).toContain("onVerified");
  expect(auth).toContain("setOtpDone(true)");
});

test("navigasi otomatis tidak memotong sekuens sukses OTP", () => {
  // Efek sesi yang sudah ada menavigasi langsung - benar untuk Google,
  // salah untuk OTP yang dialognya masih terbuka (animasi sukses Task 5
  // akan terpotong sebelum terlihat).
  expect(auth).toContain("!otpOpen");
});

test("semua navigasi pasca-masuk tepat sekali tanpa entri ganda", () => {
  // Dialog menutup DULU lalu `onVerified` navigasi, dan di saat yang sama
  // efek sesi ikut melihat sesi baru: dua navigasi ke tujuan sama dalam
  // satu tick menumpuk entri riwayat yang sama. Semua lewat `navigateOnce`.
  expect(auth).toContain("navigateOnce(redirect)");
  expect(auth).not.toMatch(/[^e]navigate\(redirect\)/);
});

test("klien Firebase tidak lagi mengekspor fungsi email-sandi yang yatim", () => {
  for (const fn of [
    "export async function createEmailAccount",
    "export async function signInWithEmail",
    "export async function requestPasswordReset",
    "export async function completePasswordReset",
  ]) {
    expect(client, `fungsi yatim: ${fn}`).not.toContain(fn);
  }
  // Yang hidup: Google. Pintu itu yang tersisa di sisi Firebase.
  expect(client).toContain("export async function signInWithGoogle");
});

test("pesan salah di layar masuk punya perannya untuk pembaca layar", () => {
  expect(auth).toContain('role="alert"');
});
