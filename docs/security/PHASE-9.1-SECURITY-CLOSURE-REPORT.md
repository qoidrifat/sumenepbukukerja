# PHASE 9.1 — Security Closure Report

## A. Executive Summary

**Status keamanan: READY WITH DOCUMENTED GAPS.**
**Status fase: COMPLETE WITH DOCUMENTED GAPS.**

Fase 9 menutup dua temuan yang paling berbahaya dari sisi kode: satu kebocoran
kredensial (F-01) dan satu jalur pembacaan blob storage tanpa otorisasi (F-02).
Fase 9.1 menutup dua temuan LOW yang memang bisa ditutup dengan perubahan
kecil dan aman (F-12 rate limit masukan, F-14 validasi `photoId`), mengoreksi
satu kesimpulan Fase 9 yang salah ukur (F-09 route HTTP), dan memisahkan dengan
tegas mana yang **kode**, mana yang **deployment**, dan mana yang **operator**.

Yang tidak boleh hilang dari ringkasan ini:

- **Tidak ada satu pun temuan CRITICAL atau HIGH yang tersisa belum
  diperbaiki di sisi kode.** Keduanya sudah tertutup dan diuji.
- **F-01 tidak bisa dirotasi, dan itu bukan kelemahan audit ini.** Nilai
  `VLY_EMAIL_OTP_API_KEY` adalah kredensial **bawaan platform Freebuff**,
  bukan kunci privat proyek - dikonfirmasi tim Freebuff lewat kanal komunitas
  resmi. Tidak ada dasbor yang dimiliki operator untuk mencabutnya. Jalur yang
  sebenarnya berbahaya - `JSON.stringify(error)` yang menyalin header
  `x-api-key` ke respons pemanggil anonim - sudah ditutup di kode.
- **F-01 ditutup lebih jauh di Fase 9.2 (2026-10-01): jalurnya dihapus.**
  Provider `email-otp`, berkas `src/convex/auth/emailOtp.ts`, test-nya, dan
  form OTP di `/auth` semuanya dibuang, karena kredensialnya tidak bisa dibuat
  ulang di akun pemilik sementara penggantinya (Google dan Email/Sandi lewat
  Firebase) sudah ada dan gratis. Statusnya jadi
  `CLOSED IN CODE - OTP PATH REMOVED`.
- **F-08 sudah ditutup di deployment yang hidup.** `STAFF_BOOTSTRAP_EMAILS`
  dihapus, dan probe di `qualified-chameleon-491` mengukur ulang:
  `available: false` dengan tiga pengelola tetap utuh.
- **Produksi sudah pernah menerima kode, tapi perubahan hari ini belum.**
  Deployment produksi `focused-lemur-389` sudah pernah di-deploy, dan build
  Vercel terakhir sudah tidak lagi menunjuk `hidden-starfish-79` milik Freebuff
  yang sudah ditinggalkan - itu sebabnya `[CONVEX A(auth:signIn)] Server Error`
  muncul. Yang belum dilakukan ada di sisi operator: `npx convex deploy
  --env-file deploy-prod.env`, lalu publish ulang di Freebuff.
- **Tidak ada origin frontend produksi yang otoritatif** di repositori, jadi
  header keamanan frontend (F-11a) berstatus `NOT VERIFIED`, bukan `PASS`.
- **Satu kesimpulan Fase 9 turns out salah:** route HTTP tidak hilang. Fase 9
  mengukurnya di origin yang salah.

Kata yang tidak dipakai di dokumen ini: SECURE, HACK-PROOF, 100% aman, dan
"compliance penuh OWASP". Yang dipakai: terverifikasi, teruji, dimitigasi,
ditolak, dan risiko tersisa.

---

## B. Baseline Fase 9

| Butir | Nilai baseline yang dipakai |
|---|---|
| Fungsi Convex terinventarisasi | 154 (49 query, 52 mutation, 4 action, 49 internal) |
| Fungsi publik (bukan internal) | 105 |
| Route HTTP terdaftar | 6 (5 path diuji) |
| Public query diaudit | 15 |
| Public mutation | 9 |
| Public action | 2 |
| Public field diaudit | 79 |
| PII/P3 di public surface sebelum remediasi | 7 |
| Field PII/P3 dikeluarkan dari public surface | 4 |
| Field dienkripsi | 0 (sengaja) |
| Temuan | 17 (F-01 sampai F-17) |
| Severity | 1 CRITICAL, 1 HIGH, 8 MEDIUM, 4 LOW, 3 INFO |
| Unit test | 749 lulus |
| E2E | 32 lulus, 10 dilewati |
| Klasifikasi rilis sebelumnya | READY WITH DOCUMENTED GAPS |

Baseline di atas **tidak diubah** oleh Fase 9.1. Yang berubah adalah status dan
bukti, bukan bobot temuan. Rekonsiliasi jumlah temuan dan severity dilakukan
dengan membaca setiap bagian F-01 sampai F-17 di
`PHASE-9-SECURITY-AUDIT.md`; jumlahnya cocok, jadi tidak ada severity yang
dibuat-buat agar totalnya terlihat rapi.

---

## C. Koreksi Laporan

Tiga koreksi yang benar-benar mengubah isi, bukan hanya merapikan kalimat.

### C-1 — F-09 diukur di origin yang salah

Fase 9 menyimpulkan "route HTTP tidak tersedia" karena menguji
`https://rare-scorpion-625.convex.cloud` dan menerima 404 pada 5 dari 5. Fact:
route HTTP Convex dilayani di origin `.convex.site`. Probe ulang mengukur
keenam route di kedua origin:

| Route | `.convex.cloud` | `.convex.site` |
|---|---|---|
| `/robots.txt` | 404 | 200 |
| `/sitemap.xml` | 404 | 200 |
| `/admin-gate/context` | 404 (POST) | 405 (GET), 200 (POST) |
| `/webhook/whatsapp` | 404 | 405 (GET tanpa token), 403 (POST tanpa signature) |
| `/twilio/status` | 404 | 403 (POST tanpa signature) |

Artinya: **EXPECTED 404 AT THIS ORIGIN** untuk `.convex.cloud`. Tidak ada route
yang dipindahkan, tidak ada arsitektur yang diubah. Kesimpulan ini sebenarnya
sudah ada di kode sejak sebelumnya, di `src/lib/admin-gate-client.ts`
(`convexSiteUrl`), dengan catatan bahwa route HTTP hidup di `.convex.site`.
Fase 9 mengabaikannya.

### C-2 — F-07: eksposur di deployment dev, bukan cuma di kode

Pengukuran ulang di deployment menunjukkan dua hal berbeda:

- `errorData` (field yang dibaca klien secara benar) berisi kalimat yang
  memang ditujukan untuk pemanggil: `Masuk untuk menggunakan fitur Buku Kerja`.
  Ini hasil perbaikan Fase 9.
- `errorMessage` (field yang diisi platform) **masih** memuat stack trace dan
  path sumber: `../../src/convex/access.ts:32:0`, `../src/convex/claims.ts:101:17`.

Jadi perbaikan kode bekerja, dan eksposur yang tersisa berasal dari lapisan
platform yang tidak bisa disentuh dari kode aplikasi. Klien hanya boleh membaca
`errorData`.

### C-3 — `SITE_URL` bukan allowlist CORS

Perubahan F-11 sempat memakai `SITE_URL` sebagai allowlist origin. Probe
(`tmp/qa-p91-cors-allowlist-evidence.json`) membuktikan pada deployment yang
diuji `SITE_URL` menunjuk origin `.convex.site` itu sendiri, bukan frontend.
Akibatnya beacon Security Desk kehilangan akses begitu kode berjalan. Perbaikan:
allowlist pindah ke variabel khusus `ADMIN_CONTEXT_ALLOWED_ORIGINS`, dan ada
regression test yang mengunci bahwa `SITE_URL` tidak pernah menyentuh kode
CORS. Wildcard tanpa credentials dipulihkan, jadi tidak ada regresi fungsional.

---

## D. Closure F-01 — Kredensial OTP

| Aspek | Status |
|---|---|
| Kode | FIXED, lalu jalurnya DIHAPUS (Fase 9.2). Provider `email-otp`, `src/convex/auth/emailOtp.ts`, dan form OTP di `/auth` tidak ada lagi. |
| Sweep kredensial | Bersih. `src/`, `e2e/`, `docs/`, `tmp/`, dan `dist/` tidak punya literal kredensial di luar nilai sintetis pada test. |
| Regression test | `src/convex/firebase-auth-security.test.ts` (16 test) menggantikan `otp-provider-security.test.ts` yang ikut dihapus bersama jalurnya. |
| Rotasi di penyedia | **TIDAK BERLAKU.** Nilai adalah kredensial bawaan platform Freebuff, bukan kunci privat proyek. Dikonfirmasi tim Freebuff lewat kanal komunitas resmi. |
| Pengganti | Google dan Email/Sandi lewat provider `firebase`, diverifikasi server dengan JWKS resmi Google. Reset sandi memakai email Firebase (1.000/hari), tanpa layanan email baru. |
| Status | `CLOSED IN CODE - OTP PATH REMOVED` |

Tidak ada nilai kredensial yang ditampilkan di dokumen ini, dan tidak ada yang
disalin ke mana pun.

---

## E. Closure F-08 — Pemulihan admin

- Kode pemulihan **sengaja tidak dihapus**, dan test pemulihannya tetap ada dan
  lulus. Yang dimatikan adalah allowlist di environment.
- Pengukuran sebelum: `bootstrapAdministratorAvailable` menjawab
  `{"available": true}`, `staffCount = 3`, `hasAnyStaff = true`. Jadi jalur
  pemulihan aktif, dan tidak dibutuhkan lagi.
- Tindakan: hapus `STAFF_BOOTSTRAP_EMAILS` dari Keys, deploy ulang, verifikasi
  `{"available": false}`.
- Pengukuran sesudah (OPERATOR VERIFIED, 2026-09-30T19:16:22Z,
  `node tmp/qa-p91-closure-probe.mjs`):

  ```
  bootstrap available : {"available":false}
  staff count         : 3 | hasAnyStaff: true
  PROBE_EXIT=0
  ```

  Dua syarat terpenuhi sekaligus: allowlist hilang, dan ketiga pengelola tidak
  ikut hilang. Runbook sudah memperingatkan bahwa kalau `staffCount` turun ke
  0, variabelnya harus dikembalikan - itu tidak terjadi, jadi tidak ada
  pengembalian.
- Yang tidak berubah: `users.bootstrapAdministrator` masih ada, jadi kemampuan
  memulihkan akses admin kalau semua pengelola hilang tetap utuh.
- Status: `CLOSED` di deployment development yang hidup
  (`qualified-chameleon-491`). Produksi belum bisa dinilai karena belum ada
  kodenya.

---

## F. F-09 — Verifikasi HTTP dan Origin

- Route HTTP: 5 dari 5 hidup di `.convex.site` (lihat tabel C-1).
- Webhook gagal tertutup, terverifikasi di deployment:
  - Meta tanpa signature: **403 Invalid signature**
  - Meta signature salah: **403 Invalid signature**
  - Verify token salah: **403 Invalid verify token**
  - Twilio signature salah: **403 Invalid signature**
- Tidak ada probe yang mengirim pesan nyata, tidak ada data pelanggan yang
  diubah, tidak ada penghapusan.
- Yang tidak terverifikasi: origin produksi.
- Status: `CLOSED` untuk deployment yang diuji,
  `DEPLOYED — EXTERNAL VERIFICATION PENDING` untuk produksi.

### Anti-replay pada webhook

Pertanyaan yang dijawab sebelum satu baris pun diubah:

1. **Apakah penyedia mengirim id pesan unik?** Ya. Meta memakai
   `wamid`, Twilio memakai `MessageSid`/`SmsSid`.
2. **Apakah kiriman ganda sudah idempoten?** Ya untuk jalur status:
   `whatsapp.applyDeliveryStatus` mencocokkan `providerMessageId` dan berhenti
   kalau baris sudah ada. Untuk pesan masuk, `recordInboundMessage` memakai
   `providerMessageId` sebagai kunci unik.
3. **Apakah payload sama bisa menyebabkan perubahan state berulang?** Tidak
   pada status: state hanya bergerak ke depan kalau status baru berbeda.
4. **Apakah ada timestamp yang bisa divalidasi?** Meta tidak mengirim
   timestamp yang bisa diverifikasi tanpa tambahan apa pun; Twilio mengirim
   `Timestamp` yang memang ditandatangani bersama payload.

Kesimpulan: **CURRENTLY MITIGATED BY IDEMPOTENCY**. Tidak ada jalur replay yang
memicu tindakan istimewa berulang, jadi tidak ada mitigasi tambahan yang
ditambahkan. Menambahkan jendela timestamp tanpa kebutuhan hanya menambah
kode yang bisa salah.

---

## G. F-11 — Header dan CORS

### Yang bisa diverifikasi

- `x-content-type-options: nosniff` dan `vary: Origin` sekarang dikirim pada
  `/admin-gate/context`. Terverifikasi di respons 204 dan 200.
- Tidak ada route yang mengirim `access-control-allow-credentials`.
- Route webhook tidak mengirim header CORS apa pun.
- CORS dapat dipersempit lewat `ADMIN_CONTEXT_ALLOWED_ORIGINS`; ada 9 regression
  test yang mengunci invariant-nya.

### Yang tidak bisa diverifikasi

Header pada **origin frontend**. Repository ini tidak memuat konfigurasi
penyajian (`vercel.json` dan sejenisnya tidak ada), dan tidak ada domain
frontend produksi yang tercatat. Yang diketahui dari inventaris sumber: tidak
ada font/CDN/analytics pihak ketiga, tidak ada iframe, tidak ada service worker.
Kebijakan CSP yang sudah disusun dari inventaris itu ada di runbook, dengan
dua catatan yang tidak boleh dilewati: `unsafe-eval` tidak boleh masuk, dan
`style-src 'unsafe-inline'` kemungkinan masih dibutuhkan sampai aturan gaya
dipindahkan ke berkas.

Status: `MITIGATED` untuk route milik aplikasi, `BLOCKED — NO AUTHORITATIVE
PRODUCTION FRONTEND ORIGIN` untuk frontend.

---

## H. F-12 — Rate Limit Masukan

| Aspek | Nilai |
|---|---|
| Batas per akun | 5 masukan per jam |
| Plafon global | 200 masukan per jam |
| Batas isi | judul 3-160, isi 10-2.000, email 200 |
| Identitas | dari baris `users` milik sesi; **tidak ada argumen identitas sama sekali** |
| Bukti test mengunci | dengan batas dinonaktifkan, 3 test gagal; aktif, semua lulus |
| Test tambahan | isi tidak wajar ditolak; akun kedua tidak mewarisi hitungan akun pertama; `userId`/`anonymousId`/`kind` ditolak di lapisan validasi |

Status: `CLOSED`.

---

## I. F-14 — Otorisasi `photoId`

`requireAssignablePhoto` menolak storage id yang tidak ada, bukan gambar,
bukti klaim, dokumen cadangan, atau foto profil. Dijalankan di tiga titik:
`vendors.createVendor`, `vendors.updateVendor`, dan `community.createVendorPhoto`.
Tiga indeks baru ditambahkan supaya pemeriksaannya satu pembacaan indeks.

| Kasus | Harapan | Hasil |
|---|---|---|
| Foto sah | diterima, tetap tayang publik | lulus |
| Bukti klaim | ditolak, tetap tidak dilayani ke anonim | lulus |
| Dokumen cadangan | ditolak | lulus |
| Foto profil orang lain | ditolak | lulus |
| Storage id karangan | ditolak | lulus |
| Galeri foto privat | ditolak | lulus |

Bukti bahwa test mengunci perbaikan: dengan helper dinonaktifkan, 5 test gagal;
aktif, semua lulus.

Status: `CLOSED`.

---

## J. F-05 — Gerbang Keputusan PII

Tidak ada keputusan yang diambil agent. `docs/security/PII-DECISION-REGISTER.md`
mencatat empat entri (nama pemohon, koordinat listing, nomor WhatsApp listing,
data moderasi internal) dengan eksposur saat ini, bukti, tujuan bisnis, risiko,
empat sampai lima opsi beserta konsekuensi teknisnya, dan kolom keputusan yang
kosong.

Status: `DECISION REQUIRED`.

---

## K. F-07 — Verifikasi Error Disclosure

- Bentuk yang benar (`errorData`) berisi kalimat untuk pemanggil.
- Bentuk yang masih bocor (`errorMessage`) berisi stack trace pada deployment
  dev.
- Kasus yang diuji: penolakan otorisasi anonim, storage id tidak dikenal
  (`null`, bukan error), dan route HTTP yang salah metode (`405`).
- Tidak ada production yang bisa diuji.

Status: `MITIGATED`. Bukan `CLOSED`.

---

## L. F-16 — Penilaian XSS dan Penyimpanan Auth

- Tidak ditemukan XSS yang dapat dieksploitasi. Yang diperiksa: satu-satunya
  `dangerouslySetInnerHTML` ada di berkas yang tidak diimpor siapa pun (F-15);
  tidak ada `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, atau
  `new Function`; tidak ada pustaka markdown/HTML; `?returnTo=` hanya diterima
  kalau diawali `/` dan bukan `//`, lalu dipakai lewat React Router, bukan
  `href` mentah; `RequireAuth` meng-encode nilai itu.
- Arsitektur auth tidak diubah.

Status: `RISK ACCEPTED`, dengan catatan bahwa mitigasi XSS belum selesai
karena belum ada CSP di origin frontend.

---

## M. Kompatibilitas Fase 8

Diperiksa ulang, tidak ada perubahan:

| Aspek | Hasil |
|---|---|
| `ADMIN_WHATSAPP_NUMBER` satu sumber | utuh, dijaga test |
| `buildAdminWhatsappLink` | tidak disentuh |
| `adminHandoffPreview` | tetap memakai `requireManagementViewer` |
| `handoffUrl` | tidak masuk query publik |
| Status handoff | tidak pernah menjadi `sent` atau `delivered` |
| WhatsApp warga lewat penyedia | tidak disentuh |
| Webhook WhatsApp | hanya dibaca untuk verifikasi, tidak diubah |
| Nomor tujuan admin | tetap di satu berkas produksi |

Tidak ada regresi Fase 1-8. Fase 8 hanya dibaca, tidak ditulis ulang.

---

## N. Regression Test Keamanan

| Gerbang | Perintah | Hasil |
|---|---|---|
| Push + typecheck | `bunx convex dev --once` | PASS |
| Typecheck | `bunx tsc -b --noEmit` | PASS, 0 error |
| Unit test | `bun run test` | **60 berkas, 847 test, 847 lulus, 0 gagal, 0 dilewati** |
| E2E | `bun run test:e2e` | **32 lulus, 0 gagal, 10 dilewati** |
| Build | `bun run build` | PASS |
| Lint | `bun run lint` | 0 error, 26 warning (sudah ada sebelumnya) |
| Brand | `bun run brand:check` | PASS |
| Mascot | `bun run mascot:validate` | PASS |

Test keamanan yang dijalankan terpisah:

| Berkas | Jumlah |
|---|---|
| `security-surface.test.ts` | 27 |
| `http-cors-security.test.ts` | 9 |
| `firebase-auth-security.test.ts` | 16 |
| `firebase-client.test.ts` | 6 |
| `public-data-surface.test.ts` | 7 |
| `alert-recipient-security.test.ts` | 10 |
| `realtime.test.ts` | 83 |
| `display-name-security.test.ts` | 12 |
| **Total 8 berkas keamanan** | **170 lulus, 0 gagal** |

Fase 9.2 menambah `display-name-security.test.ts` (12 test), yang mengunci
F-05: nama yang tampil di papan permintaan tidak boleh bisa ditelusuri balik ke
email, dan kolom koreksi hanya sekali. `otp-provider-security.test.ts` ikut
dihapus bersama provider-nya;Sebagai gantinya ada
`firebase-auth-security.test.ts` (16 test) dan `firebase-client.test.ts`
(6 test), plus `src/pages/auth-password-reset.test.ts` (9 test) yang mengunci
jalur lupa sandi.

Perbandingan dengan baseline Fase 9: 749 menjadi 816 unit test, kenaikan 67
test. Seluruhnya test baru - tidak ada test lama yang dihapus, dilewati, atau
dilonggarkan. `recharts` dan `chart.tsx` dihapus, tapi tidak ada satu pun test
yang hilang bersamanya.
Tidak ada test yang dihapus, dilewati, atau dilonggarkan.

---

## O. Bukti Produksi

Dipisahkan sesuai aturan bukti, dan tidak dicampur.

| Level | Status | Bukti |
|---|---|---|
| SOURCE VERIFIED |UNTUK | Kode dibaca langsung; 105 fungsi publik terinventarisasi, 11 tanpa guard, masing-masing dengan alasan. |
| TEST VERIFIED | UNTUK | 816 unit test dan 7 berkas keamanan lulus. |
| DEPLOYMENT VERIFIED (dev) | UNTUK | `tmp/qa-p91-closure-evidence.json` dan `tmp/qa-p91-cors-allowlist-evidence.json`. |
| DEPLOYMENT VERIFIED (produksi) | **TIDAK ADA** | Tidak ada konfigurasi deploy produksi di repositori. |
| EXTERNAL VERIFIED |UNTUK | Webhook gagal tertutup dan 404 di origin yang salah terukur, keduanya diukur langsung. Verifikasi akun Meta/Twilio di sisi penyedia tidak dilakukan. |
| OPERATOR VERIFIED | UNTUK (1 dari 1) | Pembersihan F-08 terukur di deployment development `qualified-chameleon-491`: `available: false`, `staffCount: 3`. F-01 tidak punya tindakan operator tersisa. |

Catatan kejujuran: deployment yang diuji adalah **development**. Tidak ada
kalimat "production secure" di dokumen ini, karena tidak ada bukti yang
mendukungnya.

---

## P. Risiko Tersisa

Tidak disembunyikan.

1. ~~**Kredensial OTP lama masih belum dicabut**~~ - DIHAPUS pada Fase 9.2.
   Nilai tersebut adalah kredensial bawaan platform Freebuff, bukan milik
   proyek, jadi tidak ada rotasi yang bisa dilakukan. Yang tersisa hanya
   penyalahgunaan kuota penyedia milik platform, dan itu bukan P0.
2. ~~**Allowlist pemulihan admin masih aktif di deployment produksi**~~ - DIHAPUS.
   Terukur bersih di `qualified-chameleon-491` (`available: false`,
   `staffCount: 3`). Produksi `focused-lemur-389` belum ada kodenya, jadi F-08
   di sana harus dinilai ulang setelah deploy.
3. **Header keamanan frontend belum ada** dan tidak bisa diverifikasi.
4. **Nilai OTP masih terbaca lewat Git** (residu, bukan P0). Nilainya adalah
   bawaan platform yang dipakai bersama, bukan rahasia proyek, dan sejak
   2026-10-01 tidak ada kode mana pun di repo ini yang memakainya. Rewrite
   sejarah tidak direkomendasikan: risikonya lebih besar dari nilai kuncinya
   sendiri.
5. **Plafon global F-06 bisa membekukan angka metrik** dalam jendela satu jam.
   Dampak ke pengguna sudah diverifikasi dari kode: nol. Saat plafon terlampaui
   kedua mutasi itu `return` tanpa melempar error, jadi kotak pencarian dan
   tombol WhatsApp tetap bekerja normal; hanya pencatatan yang berhenti, dan
   metrik itu tidak pernah tampil di katalog publik. Sisa risikonya adalah
   ketersediaan (kuota pemanggilan tetap bisa dikonsumsi), bukan penolakan
   layanan.
6. **Papan permintaan publik masih menayangkan nama pemohon** (F-05) sampai
   ada keputusan produk.
7. **Test E2E dua sesi masih dilewati** (F-17). Penghalangnya sudah bergeser:
   jalur email dan sandi Firebase tidak butuh mailbox uji, jadi yang dibutuhkan
   tinggal satu akun uji di Firebase dan test yang ditulis ulang.
8. **Idempotensi webhook adalah ganti anti-replay.** Kalau suatu saat suatu
   kiriman tanpa `providerMessageId` perlu Trusted Provider untuk
   menghasilkan perubahan state, jendela timestamp harus ditambahkan. Sekarang belum
   diperlukan.
9. **Penghitung publik masih bisa dipanggil tanpa sesi.** Batasnya mencegah
   pembakaran kuota, bukan penyalahgunaan data.

---

## Q. Regresi Fase 1-8

Tidak ada. Rinciannya:

- Fase 1-7: seluruh test lama tetap lulus, tidak ada assertion yang dihapus,
  tidak ada expected yang dilonggarkan, tidak ada test yang dilewati demi hijau.
- Fase 8: arsitektur WhatsApp admin tidak disentuh sama sekali; hanya dibaca
  untuk memastikan kompatibilitas.
- Baseline `public-data-surface.test.ts` (Phase 5) tetap hijau.
- Pipeline pengirim warga tidak diubah.
- 21 test unit baru hanya menambah cakupan.

---

## R. Klasifikasi Rilis

**READY WITH DOCUMENTED GAPS**

Alasannya, dan hanya alasannya:

- Semua temuan CRITICAL dan HIGH sudah diperbaiki di kode dan dikunci test.
- Sisa yang terbuka genuinely di luar kendali coding agent: header origin
  frontend, dan **deploy produksi yang belum pernah dijalankan** (butuh
  `VITE_CONVEX_URL` di Vercel plus satu kali push ke `focused-lemur-389`).
  Plus satu keputusan produk (F-05) dan satu gap infrastruktur test (F-17).
- Tidak ada bypass otorisasi di produksi yang terukur, tidak ada eksposur
  storage privat yang terukur, tidak ada kebocoran PII privat yang terukur, dan
  tidak ada pemalsukan webhook yang berhasil.
- Yang **tidak** boleh dibaca sebagai "sudah aman": `errorMessage` pada
  deployment masih memuat stack trace, dan header frontend belum pernah
  diukur.

---

## Ringkasan Angka

Angka di bawah dihitung ulang untuk Fase 9.1, bukan disalin dari Fase 9.

### Temuan

| Metrik | Nilai |
|---|---|
| Temuan sebelum | 17 |
| Temuan sesudah | 17 |
| CRITICAL | 1 |
| HIGH | 1 |
| MEDIUM | 8 |
| LOW | 4 |
| INFO | 3 |
| CRITICAL/HIGH tersisa belum diperbaiki di kode | 0 |
| Status `CLOSED` | 8 (F-08 masuk lagi setelah diukur ulang di deployment dev yang baru) |
| Status `MITIGATED` | 3 |
| Status `RISK ACCEPTED` | 4 |
| Status `OPEN` | 1 (F-17) |
| Status `DECISION REQUIRED` | 1 |
| Status `BLOCKED` | 0 |

### Data dan otorisasi

| Metrik | Nilai |
|---|---|
| Fungsi Convex terinventarisasi | 154 |
| Fungsi publik | 105 |
| Public query diaudit | 15 |
| Public mutation | 9 |
| Public action | 2 |
| Public field diaudit | 79 |
| Field privat dikeluarkan dari public surface (Fase 9) | 4 |
| Field privat dimasking | 0 |
| Field privat dienkripsi | 0 (sengaja, lihat di bawah) |

Alasan field privat tidak dienkripsi: tidak ada satu pun kondisi dari
bagian temuan Fase 9 yang terpenuhi. Tidak ada requirement yang menyuruh server tidak
melihat plaintext, tidak ada kebutuhan akses database tanpa otorisasi, dan
ancaman tidak berubah. Enkripsi tidak memperbaiki batas akses; yang
menentukan paparan adalah bentuk data dan batas akses. Menambah
`ENCRYPTION_KEY` tanpa kebutuhan hanya menambah satu rahasia baru untuk
dirotasi.

### Kasus keamanan yang diuji

| Metrik | Nilai |
|---|---|
| Kasus otorisasi | 27 (di `security-surface.test.ts`) |
| Kasus IDOR/BOLA | 6 |
| Kasus rate limit | 5 |
| Kasus storage | 8 |
| Kasus CORS | 9 |
| Kasus webhook yang diuji langsung ke deployment | 4 |
| Kasus XSS yang diperiksa | 6 permukaan |
| Kebocoran kredensial yang ditemukan di Fase 9.1 | 0 |
| Indeks baru untuk menggantikan pemindaian tabel | 3 |

### Gerbang

| Metrik | Nilai |
|---|---|
| Unit test berkas | 58 |
| Unit test total | 816 |
| Unit test lulus | 816 |
| Unit test gagal | 0 |
| Unit test dilewati | 0 |
| E2E lulus | 32 |
| E2E gagal | 0 |
| E2E dilewati | 10 |
| Test keamanan (7 berkas) | 151 |
| Typecheck | 0 error |
| Build | PASS |
| Lint | 0 error, 26 warning |
| Brand check | PASS |
| Mascot validate | PASS |

---

## Rekomendasi Tahap Berikut

**NEXT: PHASE 8.1 — Admin WhatsApp Handoff E2E Verification**

Alasannya berdasarkan bukti, bukan urutan arbitrer:

- Semua temuan keamanan material yang bisa ditutup kode sudah tertutup, dan
  sisanya adalah keputusan operator atau keputusan produk, bukan pekerjaan
  engineering berikutnya.
- Yang tersisa dari Fase 8 adalah verifikasi bahwa tombol handoff `wa.me` di
  panel admin benar-benar membuka percakapan yang benar. Itu butuh kredensial
  uji yang sama dengan yang dibutuhkan F-17, jadi harus disiapkan bersama.
- F-11a (header frontend) sebaiknya ikut dikerjakan pada tahap yang sama,
  karena operator sudah harus menyiapkan environment produksi untuk keduanya.
- F-16 tidak masuk antrean: tidak ditemukan XSS yang dapat dieksploitasi, dan
  mitigasi utamanya (CSP) terikat pada F-11a. Mengganti arsitektur penyimpanan
  token tanpa bukti XSS akan jadi perubahan berspekulasi.
