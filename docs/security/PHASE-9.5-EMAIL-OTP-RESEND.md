# PHASE 9.5 — Email OTP via Resend: decision record

Tanggal: 2026-10-04 (UTC) / 2026-10-05 (+0700).
Status: DIIMPLEMENTASI (Task 3–6 seri `2026-10-04-email-otp-resend`).
Berkas ini keputusan; spesifikasinya di
`docs/superpowers/specs/2026-10-04-email-otp-resend-design.md`, rencananya di
`docs/superpowers/plans/2026-10-04-email-otp-resend.md`.

## 1. Reversal resmi Fase 9.2

Fase 9.2 menghapus provider `email-otp` karena kredensialnya
(`VLY_EMAIL_OTP_API_KEY`) milik platform Freebuff dan tidak bisa dibuat ulang
di akun pemilik sendiri — login kode waktu itu tidak mungkin hidup. Fase 9.5
MEMBALIK keputusan itu, bukan mengulang kesalahannya: kuncinya kini milik
sendiri (`RESEND_API_KEY`, di server Convex saja, tidak pernah masuk
repo/bundle), provider-nya baru (`otp-email`, `src/convex/auth/otpEmail.ts`),
dan kode-nya hanya hidup sebagai hash SHA-256 di tabel `emailOtpCodes`.

Kunci milik sendiri adalah seluruh isi keputusan ini. Tanpa itu, Fase 9.5
tidak ada.

## 2. Pintu sandi dihapus total (keputusan pemilik)

`/auth` hanya punya dua pintu: Google dan Email OTP. Yang ikut dihapus:

- Form, state, dan penangan email-sandi di `src/pages/Auth.tsx` dan
  `src/components/auth-admin-panel.tsx` (termasuk cabang `step === "password"`
  yang di panel admin bahkan tidak punya tombol menuju ke sana).
- Jalur reset Firebase seluruhnya: permintaan tautan, cabang `oobCode`,
  `src/components/reset-password-form.tsx`, `src/lib/admin-auth-intent.ts`.
- Empat fungsi yatim di `src/lib/firebase-client.ts`: `createEmailAccount`,
  `signInWithEmail`, `requestPasswordReset`, `completePasswordReset`.

Konsekuensi yang diterima sadar: akun email-sandi Firebase yang sudah ada
tidak lagi punya jalan masuk. Tidak ada migrasi otomatis — pemilik
memutuskan penghapusan, bukan transisi.

## 3. Sifat keamanan yang dikunci test

- **Secret opaque.** `requestCode` gagal dengan satu kalimat generik yang
  sama untuk kunci hilang, Resend non-2xx, dan jaringan gagal; detail hanya
  `console.error` server. Respons sukses dan email invalid identik
  (anti-enumerasi). Dikunci di `src/convex/otpEmail.test.ts`.
- **Rate-limit dua lapis.** Plafon 5/jam + cooldown 60 detik per email;
  pelanggaran plafon melempar `ConvexError("Terlalu banyak permintaan")`.
  Klien memakai `retryAfterMs` dari HASIL sukses untuk countdown, tidak
  pernah mengasumsikan bentuk `error.data`. Dikunci di test yang sama.
- **Kode sekali pakai, kedaluwarsa 10 menit, hangus setelah 5 salah.**
  Verifikasi atomik satu transaksi (`verifyOtpCode`); kode yang di-hash
  dibuktikan sama dengan kode yang dikirim (test mengekstrak dari stub
  email lalu mencocokkan hash). Alur `signIn` penuh diuji ujung-ke-ujung
  (token + identity + pakai-ulang ditolak).
- **Larangan provider lama tetap.** `email-otp`/`emailOtp` tidak boleh
  muncul kembali di `src/convex/auth/firebase.ts`; satu-satunya penerus
  resmi adalah `otp-email` yang terdaftar di `src/convex/auth.ts`.
  Dikunci di `src/convex/firebase-auth-security.test.ts`.
- **Tidak ada pintu buntu di UI.** Matriks `firebaseEnabled && otpEnabled`:
  keduanya → Google + pembatas + Email; satu → hanya yang hidup tanpa
  pembatas; tidak ada → fallback yang menyebut Google + Email OTP (tidak
  pernah layar kosong, tidak pernah flash saat query belum terjawab).
  Tahap sukses dirender di dalam Dialog yang sama (bukan Dialog bersarang),
  navigasi tepat sekali (`navigateOnce` + guard `doneRef`/`onDoneRef` di
  komponen). Dikunci di `auth-signin`, `auth-admin-panel`, dan
  `email-otp-dialog` test.

## 4. Yang TIDAK dibuktikan (terbuka, jujur)

- Pengiriman email benar-benar sampai ke kotak masuk: butuh akun uji,
  di luar jangkauan unit test. E2E membuktikan sampai tahap kode tampil,
  lalu skip eksplisit (`SKIP_NO_INBOX`) — penerus `F-17`.
- Retensi tabel `emailOtpCodes` (~5 baris/jam/email aktif, lihat laporan
  Task 3): belum ada cron prune. Bukan blocker pada volume sekarang.
- Perbandingan hash `!==` (bukan timing-safe), sama seperti spesifikasi;
  risiko praktis nihil (6 digit acak + rate limit).
- `CODE_TO_MESSAGE` di `firebase-client.ts` masih menyimpan entri
  berkode sandi yang kini dorman (tidak ada kode yang bisa memicunya
  lewat pintu Google). Sengaja tidak dihapus: peta itu data runtime,
  dan test `SPECIFIC_CODES` menguncinya utuh. Pembersihan boleh ikut
  lain waktu, bukan bagian fase ini.

## 5. Jejak implementasi

| Task | Commit | Isi |
|------|--------|-----|
| 3 | `b879296` | Backend `requestCode` + provider `otp-email` |
| 4 | `90089f8` | Dialog email + kode OTP |
| 5 | `2787dc6` + `067e233` + `2e79e15` | Sekuens sukses + confetti + guard sekali-panggil |
| 6 | (seri ini) | Bedah Auth, tulis ulang pengunci, record ini |

Laporan per task: `.superpowers/sdd/2026-10-04-email-otp-resend/task-{3,4,5,6}-report.md`.
Verifikasi akhir Task 6: full suite 92 berkas / 1255 test hijau,
`npm run typecheck` bersih, `npx eslint` bersih, `npm run build` sukses.
