# Desain: Login Email OTP via Resend (reversal Fase 9.2)

Tanggal: 2026-10-04 · Status: disetujui user, menunggu review spec
Skill: brainstorming + ui-ux-pro-max

## 1. Latar & keputusan yang dibalik

Fase 9.2 (2026-10-01) menghapus provider `email-otp` karena `VLY_EMAIL_OTP_API_KEY`
milik platform Freebuff dan tak bisa dirotasi (`src/convex/auth.ts:5-15`).
User kini punya **Resend API key + sender domain milik sendiri**, sehingga akar
masalahnya hilang. Fitur ini adalah reversal resmi Fase 9.2, bukan pelanggaran:
test pengunci terkait ditulis ulang dan alasannya dicatat di decision record
(see §7). Login kata sandi **dihapus total** (keputusan user); login tinggal
Google + Email OTP.

## 2. Tujuan & kriteria sukses

- Warga bisa masuk hanya dengan email + kode 6 digit yang dikirim realtime
  via Resend, tanpa reload halaman ("sinkronisasi background otomatis").
- Kriteria: kirim OTP < 30 dtk sampai ke inbox, verifikasi < 2 dtk,
  countdown kirim-ulang akurat, nol secret di repo, 0 regresi test lain,
  reduced-motion dihormati, kontras AA.

## 3. Arsitektur (Pendekatan A: ConvexCredentials OTP)

Backend — provider `otp-email` baru (ConvexCredentials, idiom
`@convex-dev/auth`; versi 0.0.96 tidak menyediakan provider ResendOTP
bawaan, jadi custom adalah satu-satunya jalur idiomatis):

- `requestOtp` (action): validasi format email → rate-limit (cooldown kirim
  ulang 60 dtk, maks 5/jam per email, pola `adminGate` + `http.ts` 429 +
  retry-after) → acak 6 digit via CSPRNG → simpan **hash SHA-256** (tak
  pernah polos) + expiry 10 mnt (sinkron `resend.html`) + counter percobaan
  → kirim via `fetch` ke Resend API memakai body dari `resend.html`
  (`{{OTP_CODE}}`, `{{CURRENT_YEAR}}` diisi server-side).
- `authorize` (provider): cocokkan hash, tolak bila kedaluwarsa/salah
  (maks 5x lalu kode hangus), konsumsi sekali pakai, tautkan ke user
  berdasarkan email (satu user untuk login Google dan OTP yang emailnya
  sama), set `emailVerificationTime`.
- Secret: `RESEND_API_KEY` hanya via Convex dashboard + `.env.local`
  (+ slot di `.env.example`), mengikuti pola `ADMIN_CONTEXT_RELAY_SECRET`.
  Tidak di repo, tidak di bundle klien. Status 2026-10-04: key SUDAH disetup
  user. Alamat pengirim: `Sumenep Buku Kerja <noreply@sumenepbukukerja.com>`
  (domain terverifikasi penuh, Opsi A) — ditulis sebagai konstanta di kode
  action karena bukan secret.

Frontend (`src/pages/Auth.tsx` + komponen dialog baru):

- Tombol `Gunakan email dan sandi` → `Gunakan Email` (posisi & gaya sama,
  tetap di bawah pembatas "atau").
- Klik → Radix `Dialog` modal (bukan `window.open`: diblokir browser,
  merusak fokus/mobile) yang meniru tampilan `/auth` (Card + `AnimatedContent`).
  - Tahap 1: input email (label visible, `type=email`, `autocomplete=email`)
    + tombol `Kirim OTP` (loading + disabled saat async, aturan
    `loading-buttons`).
  - Tahap 2: 6 slot via komponen `ui/input-otp` yang sudah ada (tanpa dep
    baru untuk input) + teks `Tidak menerima OTP? Kirim ulang (0:59)` yang
    setelah 60 dtk menjadi tombol `Kirim OTP` + error inline dekat field
    dengan ikon (bukan warna saja) + `aria-live`.
- Sukses: 6 slot `animate` ke tengah + scale-0 (stagger 40ms, spring
  `stiffness 320 damping 26` ala `InviteAcceptance`) → burst `canvas-confetti`
  dua sisi warna brand `#2563EB/#F59E0B/#93C5FD` → lingkaran + path ceklis
  `pathLength` draw 0,5 dtk → teks `Verifikasi OTP Berhasil` +
  `Halaman akan dialihkan secara otomatis dalam (3..2..1)` → `signIn`
  → `navigate(redirect)`. `prefers-reduced-motion` → semua jadi fade instan
  (pola `AnimatedContent`). Fokus otomatis ke slot 1, Esc menutup (kecuali
  saat sekuens sukses berjalan), touch target ≥ 44px, `focusRing` kanonis.

Yang TIDAK dibangun: magic link (menolak brief), Firebase Admin SDK /
custom token (beban secret + cold start, kalah-vs-A), perubahan flow Google,
perubahan admin gate/passcode.

## 4. Keamanan (ancaman & mitigasi)

| Ancaman | Mitigasi |
|---|---|
| Intip kode di DB | Hash SHA-256 + salt per kode, tak ada plaintext |
| Replay / brute force | Sekali pakai; maks 5 salah → hangus; cooldown 60 dtk; cap 5/jam |
| Spam kirim / biaya Resend | Rate-limit per email + per IP di server; pesan error seragam (anti user-enumeration: respons kirim sama untuk email terdaftar/tidak) |
| Kunci bocor | Hanya env server; pola rotasi mengikuti runbook 9.4 |
| Sesi ganda Google vs OTP | Linking by email terverifikasi di `authorize` |

## 5. Testing

- Ditulis ulang (reversal resmi): `auth-password-reset.test.ts`
  (larangan OTP), `auth-signin.test.ts` (teks/urutan tombol),
  `admin-access-gate.test.ts` (larangan OTP), `firebase-auth-security.test.ts`
  (larangan email-otp) — plus hapus komentar Fase 9.2 yang kedaluwarsa.
- Baru: unit hash/expiry/attempt-limit/cooldown; integrasi Convex
  (salah/hangus/kedaluwarsa/duplikat link); render dialog + reduced-motion
  + focus; E2E dengan mock Resend (tanpa inbox sungguhan).
- Gates: `vitest run`, `tsc -b --noEmit`, `eslint`, `vite build`,
  4 breakpoint (390/768/1280/1600).

## 6. Dependensi baru

- `canvas-confetti@1.9.4` (ISC) + tipenya — disetujui user. Alasan:
  burst partikel fisika top-tier yang tak ekonomis dibuat tangan;
  satu-satunya pemakai adalah sekuens sukses. Dievaluasi ulang bila
  bermasalah (framer-motion murni sebagai fallback, partikel SVG kustom).

## 7. Decision record (wajib saat implementasi)

- `docs/security/`: reversal Fase 9.2 — kunci kini milik sendiri, OTP
  kembali sebagai provider `otp-email`; sandi dihapus total.
- `resend.html`: jadikan sumber body email server-side (placeholder
  `{{OTP_CODE}}`/`{{CURRENT_YEAR}}` diisi di action, bukan manual).

## 8. Risiko terbuka (untuk fase rencana)

- Account-linking Google↔OTP di `authorize` butuh riset pola
  `@convex-dev/auth` saat implementasi (risiko utama).
- Domain pengirim Resend harus terverifikasi penuh (SPF/DKIM) agar tidak
  masuk spam — di luar kode, verifikasi manual.
- `canvas-confetti` single-maintainer — fallback documented di §6.
