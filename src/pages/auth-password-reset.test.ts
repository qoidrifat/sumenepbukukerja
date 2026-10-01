import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak jalur lupa sandi di `/auth`.
 *
 * Jalur ini tidak bisa diuji dari sisi server: yang menentukan berhasil atau
 * tidak adalah email yang sampai ke kotak masuk orang. Yang bisa dikunci di sini
 * adalah hal yang justru pernah merusak halaman ini:
 *
 *  1. Tidak ada satu pun pintu masuk yang menunjuk layar yang sudah dihapus.
 *     Provider `email-otp` sudah dibuang di Fase 9.2, jadi satu kalimat yang
 *     masih menyebut kode OTP sama dengan menunjuk tombol yang salah.
 *  2. Form reset tidak boleh duduk DI DALAM form sign-in. Dua form bersarang
 *     membuat satu klik "Kirim tautan reset" menjalankan dua penangan
 *     sekaligus: reset sandi dan masuk dengan sandi lama.
 *  3. Halaman tidak boleh kosong kalau Firebase belum terkonfigurasi. Layar
 *     kosong selalu dibaca orang sebagai situs rusak, lalu mereka pergi.
 *  4. Pesan sukses tidak boleh membedakan email terdaftar dan tidak,
 *     karena `/auth` adalah halaman publik.
 *
 * Yang TIDAK dikunci di sini: apakah email benar-benar sampai. Itu butuh akun
 * uji dan tetap berstatus OPEN di F-17.
 */

const auth = readFileSync(new URL("./Auth.tsx", import.meta.url), "utf8");
const resetForm = readFileSync(
  new URL("../components/reset-password-form.tsx", import.meta.url),
  "utf8",
);
const client = readFileSync(new URL("../lib/firebase-client.ts", import.meta.url), "utf8");

/** Kalimat yang harus sama persis di halaman dan di modul klien. */
const RESET_SENT_TEXT =
  "Kalau email itu terdaftar di Buku Kerja, kami sudah mengirim tautan untuk membuat sandi baru.";

test("tautan reset dikirim ke aplikasi sendiri, bukan ke halaman default Firebase", () => {
  // Tanpa `url`, pengguna menyelesaikan reset di domain Firebase lalu tidak
  // pernah kembali ke Buku Kerja - akunnya berubah, riwayatnya tidak.
  expect(client).toContain("sendPasswordResetEmail(auth, email.trim().toLowerCase(), {");
  expect(client).toContain("url: `${window.location.origin}/auth`");
  expect(client).toContain("handleCodeInApp: true");
});

test("pesan sukses sama di modul klien dan di halaman", () => {
  // Satu kalimat, dua tempat. Kalau hanya salah satu yang menyebut "kalau",
  // halaman berubah jadi alat untuk menebak email mana yang punya akun.
  expect(client).toContain(RESET_SENT_TEXT);
  expect(auth).toContain(RESET_SENT_TEXT);
});

test("email yang tidak terdaftar tidak pernah dibedakan di sisi peramban", () => {
  // Kode itu ditelan sebelum dilempar ulang.
  expect(client).toContain('code === "auth/user-not-found" || code === "auth/missing-email"');
  expect(client).toContain('throw new FirebaseClientError("not-configured", RESET_SENT_MESSAGE)');
});

test("layan buat sandi baru hanya dibuka dari tautan email", () => {
  expect(auth).toContain('const resetCode = searchParams.get("oobCode")');
  expect(auth).toContain("oobCode={resetCode}");
  // Layar ini punya satu tugas: mengganti sandi. Tidak ada tombol yang
  // memanggilnya dari dalam halaman lain.
  expect(resetForm).toContain("completePasswordReset(");
  // Kode diverifikasi DI SEBELUM sandi bisa ditulis, jadi tautan kedaluwarsa
  // atau yang sudah dipakai tidak bisa mengubah kata sandi siapa pun.
  expect(client).toContain("await verifyPasswordResetCode(auth, oobCode);");
});

test("layar buat sandi baru ikut bertema ruang pengelola", () => {
  // Tautan reset dibuat Firebase, jadi `returnTo` tidak bisa ikut di dalamnya.
  // Tanpa niat yang disimpan sebelum email dikirim, pengelola akan melihat
  // layar tema publik di tengah alur yang semuanya internal.
  expect(auth).toContain("if (adminGateRequired) rememberAdminAuthIntent(redirect);");
  expect(auth).toContain('variant={adminGateRequired || adminIntent ? "admin" : "public"}');
  // Setelah sandi tersimpan, orang kembali ke pintu masuk admin, bukan ke
  // daftar akun warga.
  expect(resetForm).toContain("`/auth?returnTo=${encodeURIComponent(returnTo || \"/admin\")}`");
  // Cangkanya memakai primitive admin, bukan kartu dan isian aplikasi.
  expect(resetForm).toContain('variant?: "public" | "admin"');
  expect(resetForm).toContain("admin-workspace");
  expect(resetForm).toContain("admin-panel");
  expect(resetForm).toContain("admin-input");
});

test("form reset tidak bersarang di dalam form sign-in", () => {
  // Dua `<form>` bersarang membuat event submit dari form dalam ikut memicu
  // form luar juga. Efeknya nyata: menekan "Kirim tautan reset" sekaligus
  // mencoba masuk dengan sandi lama.
  expect(auth).not.toContain("onSubmit={handlePasswordReset}");
  expect(auth).toContain("void handlePasswordReset();");
  // Isian email jadi controlled supaya nilainya tidak harus dibaca dari
  // FormData form yang tidak boleh jadi submit.
  expect(auth).toContain("value={resetEmail}");
  expect(auth).toContain("onChange={(event) => setResetEmail(event.target.value)}");
  // Hanya dua form di berkas ini: gerbang passcode dan form email-sandi.
  expect(auth.split("<form").length - 1).toBe(2);
});

test("email kosong ditolak sebelum jaringan dipanggil", () => {
  // Kalau tidak dijaga, `sendPasswordResetEmail` menerima string kosong dan
  // tombol terlihat sudah terkirim padahal tidak ada apa pun yang dikirim.
  expect(auth).toContain('setError("Tulis dulu email yang dipakai untuk masuk.");');
});

test("halaman menjelaskan diri saat Firebase belum terkonfigurasi", () => {
  expect(auth).toContain("firebaseEnabled ? (");
  expect(auth).toContain("Pintu masuk belum siap di lingkungan ini.");
  // Sesi yang sudah terbentuk tidak ikut hilang: kalimat itu yang mencegah orang
  // mengira akunnya ikut hilang bersama tombolnya.
  expect(auth).toContain("Sesi yang sudah");
});

test("tidak ada satu pun pintu masuk yang menunjuk layar yang sudah dihapus", () => {
  // Satu-satunya sisa "otp" yang boleh ada adalah komentar yang mencatat
  // penghapusannya, di `src/convex/auth.ts`.
  expect(auth).not.toMatch(/kode OTP/);
  expect(auth).not.toContain("InputOTP");
  expect(auth).not.toContain("handleOtpSubmit");
  // Dua pintu masuk yang benar-benar hidup, dan keduanya ada.
  expect(auth).toContain("Masuk dengan Google");
  expect(auth).toContain("Gunakan email dan sandi");
});

test("pesan salah di layar masuk punya perannya untuk pembaca layar", () => {
  // Pergantian tahap (Firebase -> tiket passcode -> server) punya pesan berbeda.
  // Tanpa `role="alert"`, pembaca layar membacanya terlambat.
  expect(auth).toContain('role="alert"');
});