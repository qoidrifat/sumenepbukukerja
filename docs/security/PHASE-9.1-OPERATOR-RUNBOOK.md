# PHASE 9.1 — Runbook Operator

Dokumen ini berisi prosedur yang **hanya bisa dijalankan operator**, karena
memerlukan perubahan kredensial, environment, dan konfigurasi deployment.
Coding agent tidak dapat dan tidak harus mengarang bukti bahwa prosedur ini
sudah dijalankan.

Aturan yang berlaku untuk semua bagian di bawah:

- **Jangan menulis nilai kredensial apa pun di dokumen ini, di issue, di chat, atau di log.**
- Setiap langkah punya cara verifikasi yang bisa diulang orang lain.
- Kalau sebuah langkah tidak bisa diverifikasi, tulis `NOT VERIFIED`. Jangan
  menulis `PASS` hanya karena langkahnya "sounds right".

Status per temuan ada di `PHASE-9.1-OPERATOR-CLOSURE.md`. Ringkasan per temuan
ada di `PHASE-9.1-SECURITY-CLOSURE-REPORT.md`.

> **Rotasi dua rahasia produksi** (`ADMIN_CONTEXT_RELAY_SECRET`,
> `SERVER_IP_HASH_SECRET`) punya runbook sendiri:
> [PHASE-9.4-SECRET-ROTATION-RUNBOOK.md](PHASE-9.4-SECRET-ROTATION-RUNBOOK.md).
> Jangan menjalankannya dari ingatan - urutan langkahnya menentukan apakah
> relay kehilangan bukti telemetri atau tidak.

---

## F-17a — Mengaktifkan Firebase Authentication (P0, untuk akun produksi)

Bagian ini ditambahkan 2026-09-30 dan diperbarui 2026-10-01 setelah migrasi
selesai. Provider `firebase` sudah aktif di kedua deployment dan Google sign-in
sudah terbukti bekerja. JALUR EMAIL-OTP SUDAH DIHAPUS.

### Kenapa ini perlu

`VLY_EMAIL_OTP_API_KEY` adalah kredensial milik platform Freebuff. Setelah proyek
pindah ke akun Convex milik pemilik, kuncinya tidak ikut, jadi `auth:signIn`
gagal tertutup. Provider Firebase menutup jalur masuk itu tanpa kredensial
berbayar dan tanpa domain pengirim milik sendiri.

### Env var yang wajib diisi

Hanya satu, di **Convex** (backend), per deployment - `focused-lemur-389` dan
`qualified-chameleon-491`:

| Nama | Isi | Mandatory |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Project ID dari Firebase Console | Ya |

**`VITE_FIREBASE_*` TIDAK lagi dipakai.** Pipeline build platform Freebuff
mengenskripsi setiap nilai environment yang ditambahkan operator; di bundel
nilainya muncul sebagai `"encrypted:..."`, yang ditolak Firebase sebagai API key
tidak sah. Nilai aslinya sekarang tersimpan di
`src/lib/firebase-web-config.ts` dan dipakai sebagai cadangan. `readConfig()`
membaca env lebih dulu, jadi kalau suatu saat platform berhenti mengenskripsi,
env otomatis menang tanpa perubahan kode lagi.

Nilai Web API key **bukan rahasia** dan memang wajib ada di sisi klien - itu
aturan Firebase. Yang tidak boleh pernah ada di repo maupun bundel: service
account JSON, private key, dan admin credential.

### Di Firebase Console

1. Authentication > Sign-in method > aktifkan **Google**.
2. Authentication > Sign-in method > aktifkan **Email/Password**.
3. Authentication > Settings > Authorized domains: tambahkan
   `sumenepbukukerja.freebuff.app` (dan domain preview kalau ada). Tanpa ini,
   masuk Google gagal dengan `auth/unauthorized-domain`.
4. Settings > General > Project ID: cocokkan dengan `FIREBASE_PROJECT_ID`.

### Verifikasi

1. Isi env var di kedua deployment, lalu deploy ulang.
2. Buka `/auth`. Tombol **Masuk dengan Google** dan **Gunakan email dan sandi**
   harus muncul. Kalau tidak, `VITE_FIREBASE_*` belum terbaca saat build.
3. Masuk dengan Google, lalu buka `/dashboard`. Kalau muncul "Masuk untuk
   menggunakan fitur Buku Kerja", berarti sesi tidak terbentuk - cek Logs di
   dashboard Convex.
4. Cek `users:adminSetupStatus` di deployment itu. Akun Google dengan email
   yang sama harus TERHUBUNG ke akun lama: `staffCount` tidak boleh naik,
   karena `shouldLinkViaEmail` menyatukannya, bukan membuat akun baru.
5. `bun run test` harus tetap hijau (target saat ini 59 berkas / 837 test).

### Jalur email-otp: SUDAH DIHAPUS (2026-10-01)

Keputusan produk, bukan kegagalan teknis. Provider `email-otp`, berkas
`src/convex/auth/emailOtp.ts`, dan form OTP di `/auth` semuanya dihapus.

Alasannya:

1. `VLY_EMAIL_OTP_API_KEY` adalah kredensial platform Freebuff. Tidak bisa
   dibuat ulang di akun Convex milik pemilik, jadi jalur itu tidak akan pernah
   bisa mengirim kode.
2. Selama provider-nya masih terdaftar, `/auth` menampilkan satu klik yang
   pasti berakhir di jalan buntu. Kode mati lebih mahal daripada kode tidak
   ada.
3. Penggantinya sudah ada dan gratis: Google dan Email/Sandi lewat Firebase.
   Verifikasi email di Firebase punya kuota 1.000/hari di plan Spark, jauh
   melebihi kebutuhan.
4. Opsi "email tanpa sandi" (magic link) tidak diambil karena batas email link
   sign-in di plan gratis hanya 5 email/hari. Itu bukan gratis, itu tidak
   berfungsi.

Akun yang sudah ada TIDAK terhapus; hanya kemampuannya masuk lewat provider itu
yang hilang. Pengelola produksi yang masuk lewat Google tidak terpengaruh.

Untuk pasang ulang `STAFF_BOOTSTRAP_EMAILS`, lihat F-08.

### Reset sandi

`/auth` punya alur **Lupa sandi?** yang memanggil `sendPasswordResetEmail`.
Tautannya kembali ke `/auth?oobCode=...` dan ditangani
`src/components/reset-password-form.tsx`.

Dua aturan yang dijaga:

- Pesan yang tampil **sama** apakah email-nya terdaftar atau tidak. Kalau
  dibedakan, halaman publik berubah jadi alat menebak email yang punya akun.
- Kode diverifikasi sebelum sandi bisa ditulis, jadi tautan kedaluwarsa atau
  yang sudah dipakai tidak bisa mengubah kata sandi siapa pun.

Dua hal yang harus dipastikan operator di Firebase Console sebelum reset bisa
digerakkan, karena keduanya gagal dari sisi server dan tidak kelihatan dari
kode mana pun:

1. **Sign-in provider Email/Password harus aktif.** Kalau tidak, permintaannya
   ditolak dengan `auth/operation-not-allowed`.
2. **Domain produksi harus ada di daftar Authorized domains.** Kalau tidak,
   tautannya ditolak dengan `auth/unauthorized-domain`. Domain yang dipakai
   adalah `sumenepbukukerja.freebuff.app`.

Kalau salah satu belum beres, halaman `/auth` akan menampilkan penjelasan, bukan
layar kosong. `src/pages/auth-password-reset.test.ts` mengunci hal itu.

Jejak OTP yang masih ada di `e2e/flows.spec.ts` adalah komentar historis.

### Menuju suite E2E ber-auth (F-17, masih OPEN)

Terukur 2026-10-04 dengan `npm run test:e2e` (Chromium desktop dan Pixel 5,
build produksi lokal, backend Convex nyata): **64 tes, 32 lulus, 32 dilewati,
0 gagal**. Semua yang dilewati membutuhkan kredensial uji:

| Variabel | Isi |
|---|---|
| `E2E_USER_EMAIL` | email akun uji nyata di Firebase |
| `E2E_USER_PASSWORD` | sandi akun uji itu |
| `E2E_ADMIN_PASSCODE` | passcode yang cocok dengan `ADMIN_PASSCODE_HASH` di deployment yang diuji |

Empat syarat sebelum suite ini boleh masuk pipeline otomatis:

1. **Jangan dijalankan terhadap produksi.** Skenario B menulis satu baris
   `errorReports` sungguhan ke deployment yang sedang diuji (hal ini
   terdokumentasi di berkasnya). Menyetirkan E2E ke deployment uji/staging
   lebih dulu; kalau tidak, setiap run_smokes_test menjadi pencemaran data
   produksi yang tidak terlihat sebagai bug.
2. **Akun uji terpisah dengan izin terbatas.** Peran pengelola diberikan
   server, tidak pernah dari sisi klien, dan akun uji tidak boleh memakai
   kredensial pengelola produksi yang sebenarnya.
3. **Kredensial hanya di secret store CI.** Tidak masuk repository, tidak masuk
   berkas `.env*`, tidak pernah dicetak ke log - aturan yang sama dengan
   bagian rotasi di atas. Locally, cukup variabel shell untuk satu run manual.
4. **Bukti selesai adalah angka, bukan kesan.** `npm run test:e2e` dengan ketiga
   variabel terisi harus menghasilkan 64 tes, 0 gagal, **0 dilewati**. Baru
   setelah itu suite ini boleh jadi gerbang pipeline.

Yang sudah disiapkan sampai hari ini: helper login sudah mengikuti urutan yang
benar di aplikasi - di `/auth?returnTo=/admin` pada peramban yang bersih,
gerbang passcode tampil lebih dulu dan form email+sandi baru muncul setelah
passcode lolos - dan form email+sandi memang ada di balik tombol "Gunakan
email dan sandi" sejak migrasi Firebase. Yang belum ada hanya akunnya.

Gerbang publiknya sudah jalan tanpa satu pun rahasia: `.github/workflows/ci.yml`
menjalankan typecheck, ESLint dengan `--max-warnings 0`, 1234 unit test, dan 64
tes Playwright - 32 di antaranya publik dan ikut dijalankan, sedangkan 32 tes
ber-auth otomatis dilewati karena `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, dan
`E2E_ADMIN_PASSCODE` belum diisi (lihat F-17). Job E2E-nya sengaja menunjuk
deployment **dev** (`qualified-chameleon-491`), bukan produksi, karena Skenario B
menulis baris `errorReports` sungguhan; dengan begitu penulisan uji jatuh ke
data uji.
Backend-nya dipindah lewat repository variable `CI_CONVEX_URL` tanpa menyentuh
workflow, jadi staging F-17 nanti hanya perlu mengarahkan satu variabel itu.

Satu hal yang perlu diketahui operator sebelum mempercayai hasil E2E publik:
deployment produksi belum punya satu pun baris `vendors` (terukur 2026-10-04 -
`vendors:listActive` mengembalikan 0 baris, dan `vendors:getBySlug` untuk slug
katalog mengembalikan `null`). Katalog publik di produksi karena itu dirender
dari data contoh yang ikut ter-bundle (`seedVendors`, lihat `useCatalogVendors`
di `src/lib/catalog-store.ts`). Artinya 32 tes publik itu menguji perilaku
antarmuka dan konektivitas ke Convex, bukan isi data produksi.

---

## F-01 — Kredensial OTP bawaan platform (TIDAK bisa dirotasi)

### Kenapa bagian ini berubah

Versi runbook sebelumnya memuat prosedur rotasi 10 langkah dan menandainya
sebagai P0. **Prosedur itu tidak berlaku untuk proyek ini**, dan menjalankannya
justru berbahaya: langkah "cabut kredensial lama" tidak bisa dieksekusi karena
tidak ada dasbor penyedia yang dimiliki operator, dan meletakkannya di awal
urutan membuat seluruh proyek terkunci bila proses dihentikan di tengah jalan.

Fakta yang dipakai: nilai `VLY_EMAIL_OTP_API_KEY` adalah kredensial **bawaan
platform Freebuff**, bukan kunci privat proyek ini. Dikonfirmasi oleh tim
Freebuff lewat kanal komunitas resmi atas nama deployer platform.

### Kenapa ini boleh ditutup tanpa rotasi

Temuan asli F-01 punya dua bagian, dan hanya satu yang berakar pada nilai:

| Bagian temuan | Status | Alasan |
|---|---|---|
| Nilai literal ada di berkas | Sudah diperbaiki | Kode membaca dari env. Repository tidak memuat nilai. |
| `JSON.stringify(error)` menyalin header `x-api-key` ke respons pemanggil anonim | Sudah diperbaiki, lalu jalurnya dihapus | Objek error penyedia tidak lagi ikut ke pesan. Test yang mengunci aturan itu, `src/convex/otp-provider-security.test.ts`, ikut dihapus pada 2026-10-01 bersama provider-nya. |
| Rotasi nilai | **Tidak berlaku** | Nilai milik platform, tidak bisa dicabut dari sisi proyek. |

Bagian kedua inilah yang sebenarnya berbahaya, dan bagian itulah yang sudah
tertutup. Risiko yang tersisa adalah penyalahgunaan kuota penyedia milik
platform - bukan takeover akun, bukan kebocoran data warga.

### Prosedur yang tersisa (bukan rotasi)

**Tidak ada satu pun langkah yang tersisa.** Jalur yang memakai kredensial itu
dihapus pada 2026-10-01 (lihat bagian "Jalur email-otp: SUDAH DIHAPUS" di atas),
jadi tidak ada kode di repo ini yang membaca `VLY_EMAIL_OTP_API_KEY`. Yang
sekarang perlu dilakukan operator:

1. **Jangan** menuliskan nilai kredensial ke mana pun - dokumen, issue, chat,
   atau log.
2. Variabel `VLY_EMAIL_OTP_API_KEY` boleh dikosongkan atau dihapus dari Keys.
   Menghapusnya bebas risiko sekarang, karena tidak ada kode yang membacanya.
3. Bila Freebuff suatu saat mengganti nilai bawaannya, tidak ada tindakan yang
   perlu diambil: proyek tidak pernah memakainya lagi.
4. Catat keputusan ini beserta sumber konfirmasinya (tim Freebuff, kanal
   komunitas resmi, tanggal) di `PHASE-9.1-SECURITY-CLOSURE.md` bagian F-01.

### Histori Git

Nilai lama masih dapat dibaca siapa pun yang punya akses repository. Rewrite
sejarah **tidak direkomendasikan**: risikonya lebih besar dari nilai kuncinya
sendiri, dan nilai itu bukan rahasia proyek. Putusan ini sudah dicatat.

### Kalau suatu saat platform mengaktifkan rotasi

**Tidak berlaku lagi.** Rotasi hanya masuk akal kalau ada kode yang memakai
kuncinya; sekarang tidak ada. Kalau suatu saat proyek memakai ulang penyedia
email itu, prosedurnya tetap: buat nilai baru di platform, pasang, deploy,
verifikasi **sign-in email dan sandi** di `/auth`, **lalu** cabut yang lama di
platform. Urutan "cabut dulu, baru buat" tidak boleh dipakai - di antara
keduanya tidak ada satu pun akun yang bisa masuk.

---

## F-08 — Pembersihan jalur pemulihan admin (SELESAI 2026-09-30)

Status: **`CLOSED — OPERATOR VERIFIED`**. Bagian di bawah tetap disimpan sebagai
catatan keputusan dan prosedur, karena kalau allowlist ini suatu saat perlu
diaktifkan lagi, urutan yang benar sudah tertulis di sini.

### Kenapa ini boleh ditutup lewat konfigurasi, bukan lewat kode

`users.bootstrapAdministrator` memang harus tetap ada di kode. Itu satu-satunya
cara mengembalikan akses admin kalau semua pengelola hilang, dan menghapus
kodenya demi membuat status "bersih" akan menghapus kemampuan pemulihan
proyek ini. Yang harus dimatikan adalah **allowlist di environment**, bukan
kemampuan pemulihan.

Kode pemulihan dan test-nya tidak boleh diperlemah. Yang berubah hanya nilai
`STAFF_BOOTSTRAP_EMAILS` di Keys.

### Prosedur

1. **Verifikasi pengelola sekarang.** Jalankan query `users:adminSetupStatus`
   (tanpa sesi sudah cukup) dan catat `staffCount` serta `hasAnyStaff`.
   Saat evidence terakhir diambil, `staffCount = 3` dan `hasAnyStaff = true`.
2. **Verifikasi pemulihan tidak dibutuhkan.** Pastikan setiap pengelola punya
   akun aktif yang bisa masuk lewat Google atau email dan sandi. Kalau ada
   pengelola yang belum pernah masuk, selesaikan dulu - jangan matikan
   allowlist sebelum itu.
3. **Hapus `STAFF_BOOTSTRAP_EMAILS`** dari Keys/API keys (hapus variablanya,
   jangan hanya dikosongkan, supaya tidak bisa terisi kembali tidak sengaja).
4. **Deploy ulang / restart** deployment bila perlu.
5. **Verifikasi hasilnya.** Query `users:bootstrapAdministratorAvailable` harus
   menjawab `{"available": false}`. Ini pemeriksaan yang sebenarnya; UI di
   `/admin` hanya menampilkan tombol, bukan bukti.
6. **Verifikasi operasi admin normal tetap jalan:** satu pengelola bisa masuk,
   membuka panel, memoderasi satu antrean uji, dan melihat Security Desk.
7. **Verifikasi test pemulihan tetap hijau.** `bun run test` harus tetap lulus
   penuh. Test pemulihan sengaja masih ada dan harus tetap ada.

### Kalau masih butuh pemulihan

Biarkan variabelnya. Statusnya `OPEN` dengan alasan, dan catat siapa yang
memerlukannya untuk apa.

### Langkah siap salin

```
1. Buka tab Keys/API keys di platform
2. HAPUS variabel bernama STAFF_BOOTSTRAP_EMAILS
   (hapus variabelnya, jangan hanya dikosongkan)
3. Deploy ulang / restart deployment
4. node tmp/qa-p91-closure-probe.mjs
```

Hasil yang diharapkan pada langkah 4:

```
bootstrap available : {"available":false}
staff count         : 3 | hasAnyStaff: true
```

Kalau baris pertama masih `{"available":true}`, variabelnya belum benar-benar
hilang. Kalau `staff count` turun ke `0`, **kembalikan variabelnya sekarang**
sebelum melanjutkan - itu berarti allowlist itu yang membuat tiga pengelola itu
eksis.

### Hasil yang benar-benar diukur

Dijalankan 2026-09-30T19:16:22Z, sesudah operator menghapus variabelnya:

```
bootstrap available : {"available":false}
staff count         : 3 | hasAnyStaff: true
PROBE_EXIT=0
```

Dua syarat terpenuhi. Allowlist hilang, dan ketiga pengelola tidak ikut hilang.
Pengeuwapan di atas tidak terpicu, jadi variabelnya tidak dikembalikan, dan
`users.bootstrapAdministrator` beserta test pemulihannya tetap ada di kode.

### Mengapa ini prioritas P0

Di deployment yang diuji, `bootstrapAdministratorAvailable` menjawab
`{"available": true}` sementara tiga pengelola sudah ada. Selama allowlist itu
terisi, siapa pun yang email-nya ada di sana bisa menjalankan
`users:bootstrapAdministrator` dan memberi dirinya sendiri peran admin, tanpa persetujuan siapa
pun. Menutupnya butuh menghapus satu variabel - tidak perlu akses ke dasbor
penyedia mana pun, tidak perlu rewrite kode, dan tidak bisa gagal di tengah jalan.

---

## F-09 / F-11 — Origin, route, dan header keamanan

### Fakta origin yang sudah terukur (bukan tebakan)

Pengujian dilakukan terhadap deployment yang dikonfigurasi di Keys lewat
`VITE_CONVEX_URL`. **Migrasi 2026-09-30:** proyek pindah dari Convex milik
Freebuff ke akun Convex milik pemilik, jadi nama deployment berubah. Yang
dipakai probe sekarang:

| Fungsi | Origin | Bukti |
|---|---|---|
| Query, mutation, action (`/api/*`) | `https://qualified-chameleon-491.convex.cloud` (dev) | `tmp/qa-p91-closure-evidence.json` |
| Route HTTP (`/sitemap.xml`, `/robots.txt`, `/admin-gate/context`, `/webhook/whatsapp`, `/twilio/status`) | `https://qualified-chameleon-491.convex.site` (dev) | probe yang sama |
| Frontend (HTML aplikasi) | `https://sumenepbukukerja.freebuff.app/` (Vercel) | `tmp/qa-origin-probe.mjs` |
| Produksi | `https://focused-lemur-389.convex.cloud` / `.convex.site` | **belum pernah di-deploy** |

Deployment lama milik Freebuff (`rare-scorpion-625` = PAUSED,
`hidden-starfish-79` = ditinggalkan) **tidak boleh dipakai sebagai bukti
apa pun** setelah migrasi ini.

## Menghentikan `[CONVEX A(auth:signIn)] Server Error` di produksi

Gejalanya: di `/auth`, passcode lolos lalu email gagal dengan
`[CONVEX A(auth:signIn)] ... Server Error`.

Penyebabnya **bukan** OTP, bukan kode, dan bukan kredensial. Build Vercel punya
URL Convex lama yang tertanam di dalam bundel:

```
new ConvexReactClient("https://hidden-starfish-79.convex.cloud")
```

`hidden-starfish-79` adalah deployment Freebuff yang sudah ditinggalkan, dan
setiap fungsinya menjawab `Server Error`. Perbaikannya ada di **Vercel**, bukan
di Keys:

1. **Pilih jalur publish dulu.** Ada dua, dan keduanya **tidak bisa dipakai
   bersamaan**:

   - **Jalur A - tetap publish dari Freebuff.** Build dan deploy dilakukan
     Freebuff, di project Vercel milik Freebuff. `VITE_CONVEX_URL` disuntik
     Freebuff saat build, jadi **tidak bisa diubah dari akun Vercel Anda
     sendiri** - project itu bukan milik Anda. Yang bisa dilakukan: cari
     `VITE_CONVEX_URL` di tab Keys/API keys Freebuff; kalau ada dan bisa
     diedit, isi dengan `https://focused-lemur-389.convex.cloud`, lalu
     publish ulang. Kalau tidak ada atau ditimpa, hanya Freebuff yang bisa
     mengarahkan project ini ke Convex Anda.
     **Konsekuensi besar:** header keamanan (F-11a) juga mustahil di jalur ini,
     karena CSP/HSTS datang dari lapisan penyajian dan itu milik Freebuff.
     `vercel.json` di repo ini tidak akan dibaca.
   - **Jalur B - deploy ke Vercel milik Anda sendiri.** Anda memegang build-nya,
     jadi `VITE_CONVEX_URL` dan header keamanan keduanya bisa Anda atur.
     Inilah satu-satunya jalur yang sekaligus membuka F-11a.

2. Deploy kode ke `focused-lemur-389` lebih dulu. Selama deployment itu belum
   ada, frontend produksi akan menolak semua panggilan. Perintah:
   `npx convex deploy`.

   CATATAN: `convex deploy` TIDAK punya flag `--prod`. Targetnya sudah
   production sejak dulu - flag itu hanya ada di `convex data`, `convex run`,
   dan `convex env`. Menjalankan `bunx convex deploy --prod` akan gagal dengan
   "unknown option". Perintah yang benar sudah diperbaiki di baris ini pada
   commit yang sama.
3. Publish ulang (Preview dulu, baru Production). Perhatikan `age: 674` pada
   respons origin - halamannya di-cache CDN Vercel, jadi tunggu sekitar satu
   menit lalu hard refresh sebelum menyimpang.
4. Verifikasi: `node tmp/qa-origin-probe.mjs`. Baris `instantiated client` harus
   menunjuk `focused-lemur-389`, bukan `hidden-starfish-79`. Satu baris ini
   adalah satu-satunya bukti yang perlu; kalau masih `hidden-starfish-79`,
   langkah 1 belum berhasil.
5. Setelah itu, F-08 di produksi harus dinilai ulang: buat satu pengelola,
   pastikan `staffCount >= 1`, baru kunci `STAFF_BOOTSTRAP_EMAILS`.

Jangan tertukar dua kelompok env var ini:

| Env var | Ditaruh di | Dipakai untuk |
|---|---|---|
| `VITE_CONVEX_URL` | tempat build berjalan | backend yang dipanggil frontend, bake saat build. Kalau publish dari Freebuff, ini milik Freebuff dan tidak bisa diubah dari akun Vercel sendiri. |
| `VLY_EMAIL_OTP_API_KEY` | Convex | tidak lagi dipakai - jalur OTP dihapus 2026-10-01 |
| `STAFF_BOOTSTRAP_EMAILS` | Convex | allowlist pemulihan admin |
| `SITE_URL` | Convex | host untuk sitemap dan robots |
| `ADMIN_CONTEXT_ALLOWED_ORIGINS` | Convex | allowlist CORS beacon admin |

Kriteria pembeda yang dipakai: `fetch` ke `.convex.cloud` untuk route HTTP membalas
`404`, sedangkan `.convex.site` menjawab `200`/`405` sesuai daemonnya. Berarti
route HTTP hidup di `.convex.site`. Ini juga yang dicatat di
`src/lib/admin-gate-client.ts` (`convexSiteUrl`).

### Prosedur verifikasi origin produksi

1. Tentukan **origin frontend produksi** dari sumber resmi: konfigurasi
   deployment platform, atau domain yang dipakai pengguna. Jangan menebak dari
   nama repository.
2. Tentukan **origin Convex produksi** (`.convex.cloud` dan `.convex.site`).
3. Uji keenam route di kedua origin memakai skrip yang sudah ada:
   ```bash
   node tmp/qa-p91-closure-probe.mjs   # sesuaikan konstanta DEPLOY bila perlu
   ```
4. Bandingkan hasilnya dengan `docs/security/PHASE-9.1-SECURITY-CLOSURE.md`.
   Kalau `.convex.cloud` menjawab 404 dan `.convex.site` menjawab 200/405,
   itu **EXPECTED 404 AT THIS ORIGIN**, bukan bug.
5. Kalau sebuah route memang Seharusnya ada di origin itu tetapi 404, jangan
   dipindahkan: investigasi konfigurasi deploy lebih dulu.

### F-11 — Header keamanan di origin frontend

Ini bagian yang tidak bisa dikerjakan agent, karena origin frontend tidak
disajikan oleh kode repo ini. Aplikasinya adalah SPA Vite; header HTTPnya
harus datang dari lapisan penyajian (platform, reverse proxy, atau
`vercel.json`/setara).

Hal yang sudah diketahui dari inventaris sumber. Ini syarat agar kebijakan tidak
memecahkan aplikasi:

- `index.html` tidak memuat font, CDN, atau skrip pihak ketiga. Hanya
  `/src/main.tsx` dan aset lokal di `public/`.
- `src/index.css` memakai Tailwind dan `tw-animate-css`; tidak ada
  `@import url(...)` ke host luar.
- Komponen menyuntik gaya ke DOM, jadi `style-src 'unsafe-inline'` kemungkinan
  dibutuhkan sampai aturan animasi bisa dipindahkan ke file.
- Tidak ada analytics pihak ketiga, tidak ada iframe, tidak ada service worker.
- Data dan websocket datang dari origin Convex (`.convex.cloud` untuk API,
  `.convex.site` untuk route HTTP) dan URL gambar dari domain storage Convex.
- Komponen tidak memakai `dangerouslySetInnerHTML` yang dapat dicapai (lihat
  F-15/F-16 di laporan closure).

Usulan kebijakan, **harus diuji di origin staging lebih dulu**:

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.convex.cloud;
  connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site;
  font-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
```

Catatan penting:

- `style-src 'unsafe-inline'` kemungkinan **wajib** pada tahap ini, karena
  Tailwind dan komponen animasi menyuntik aturan gaya ke dalam DOM. Sebelum
  dilepas, ukur dulu dampaknya; jangan dihapus asal agar audit hijau.- `'unsafe-eval'` **tidak boleh** masuk. Kalau setelah pengujian kebijakan ini
  terbukti memecahkan aplikasi, tulis alasannya di dokumen ini, bukan
  diam-diam menambahkannya.
- `Strict-Transport-Security` hanya berguna di origin yang benar-benar HTTPS dan
  sudah menjadi domain utama. Salah pasang HSTS pada domain yang masih dipakai
  untuk pengembangan bisa mengunci akses browser.
- CSP harus diuji dengan E2E (`bun run test:e2e`) pada origin yang sama dengan
  konfigurasi header, bukan hanya di build lokal.

### F-11 — CORS `/admin-gate/context`

Kode sudah mendukung allowlist origin eksplisit melalui environment
`ADMIN_CONTEXT_ALLOWED_ORIGINS` (daftar origin dipisah koma). Selama variabel
itu kosong, route tetap menjawab `access-control-allow-origin: *` **tanpa**
`access-control-allow-credentials`, seperti sebelum Fase 9.1 — supaya metadata
IP di Security Desk tidak ikut hilang.

`SITE_URL` **tidak boleh** dipakai untuk ini. Pada deployment yang diuji,
`SITE_URL` menunjuk origin `.convex.site` itu sendiri, bukan frontend; ketika
dicoba sebagai allowlist, beacon langsung kehilangan akses.

Prosedur bila ingin mengetatkan:

1. Tentukan origin frontend produksi (langkah 1 di atas).
2. Isi `ADMIN_CONTEXT_ALLOWED_ORIGINS` dengan origin itu (tanpa garis miring
   di akhir). Lebih dari satu origin dipisah koma.
3. Deploy ulang.
4. Uji dengan `node tmp/qa-p91-cors-allowlist-probe.mjs` setelah mengganti
   konstantanya: origin yang diizinkan harus mendapat
   `access-control-allow-origin`, origin asing tidak mendapat apa pun.
5. Login ke `/admin` dan pastikan Security Desk masih menampilkan IP sumber.
   Kalau `ipSource` kembali `"Unknown"`, allowlist salah - kembalikan variabelnya.

---

## Deploy frontend di Vercel sendiri (2026-10-03)

Bagian ini ada karena jalur publish bawaan platform ternyata bisa membuat
deployment yang tercatat sukses, padahal build-nya dari sumber lama. Terukur
2026-10-03: deployment `ed65ed0` sukses, aset produksi benar-benar dibuat ulang
pada 07:29 UTC dengan hash baru, tapi isinya masih memakai kelas dan
placeholder sebelum perbaikan. Jadi "deployment sukses" bukan bukti bahwa
kode yang sudah dikomit sudah tayang. Verifikasi isinya, bukan statusnya.

### Isi form import GitHub

| Kolom | Isi | Dasar |
|---|---|---|
| Root Directory | `./` | `package.json`, `vite.config.ts`, `convex.json` di root |
| Framework Preset | Vite | `vite.config.ts` + `@vitejs/plugin-react` |
| Build Command | `vite build` | codegen ikut ter-commit, lihat catatan codegen |
| Output Directory | `dist` | default Vite |
| Install Command | `bun install --frozen-lockfile` | `bun.lock` sudah diregenerasi ke format v1 (lihat catatan lockfile) |

### Codegen Convex: ikut ter-commit, bukan dijalankan saat build

`src/convex/_generated` dipakai lebih dari 15 berkas frontend. Folder itu
pernah diabaikan Git, dan build Vercel yang pertama gagal justru di sini:

```
401 Unauthorized: MissingAccessToken: An access token is required for this
command. Authenticate with `npx convex dev`
```

`convex codegen` menghubungi Convex untuk membaca keadaan deployment,
jadi butuh access token. Vercel tidak punya token itu, dan menyimpan token
pribadi di dashboard pihak ketiga memberi akses ke seluruh deployment Convex
milik akun - termasuk backend produksi.

Keputusan 2026-10-03: folder hasil codegen IKUT TER-COMMIT, dan Build
Command jadi `vite build` polos. Ini juga anjuran resmi Convex di
`convex codegen --help`: *"This code is generated automatically while
running npx convex dev and should be committed to the repo (your code
won't typecheck without it!)"*.

Konsekuensi yang harus dijaga:

- Tanda tangan fungsi Convex yang berubah harus diikuti `npx convex codegen`
  lalu commit hasilnya. Penjaganya `scripts/qa/ensure-convex-codegen.mjs`
  (dijalankan sebagai `pretest`) memeriksa foldernya masih ada.
- `.gitignore` tidak boleh mengabaikan folder itu lagi; ada test yang
  menjaganya.

### Lockfile

`bun.lock` pernah ter-commit dalam format lama (`lockfileVersion: 2`), yang
tidak lagi bisa dibaca Bun 1.3: `bun install` mengabaikannya dan
`bun install --frozen-lockfile` gagal dengan
`lockfile had changes, but lockfile is frozen`. Install di Vercel jadi
tidak reproducible - dependensi diambil dari `package.json` saja.

Pada 2026-10-03 lockfile diregenerasi ke format baru (`lockfileVersion: 1`) dan
diuji `bun install --frozen-lockfile` lulus tanpa perubahan: 431 install
melintasi 533 paket. Yang bergeser hanya beberapa paket transitif
(`@types/node`, `electron-to-chromium`, `tinybench`, `tinyexec`); dependensi
langsung di `package.json` tidak berubah.

### Environment variable (Vercel)

Wajib:

| Key | Value |
|---|---|
| `VITE_CONVEX_URL` | `https://focused-lemur-389.convex.cloud`; dibaca `src/main.tsx` dan di-inline ke bundle saat build |

Jangan diisi:

| Key | Kenapa |
|---|---|
| `VITE_FIREBASE_*` | sudah ada fallback ter-commit di `src/lib/firebase-web-config.ts`; file itu dibuat justru karena platform mengenkripsi env |
| `VITE_CONVEX_SITE_URL` | tidak dibaca berkas mana pun di `src/` |
| `VITE_VLY_*`, `VITE_PREVIEW_PARENT_ORIGIN` | instrumentasi preview platform |

Variabel backend (`PHONE_DATA_KEY`, `WHATSAPP_APP_SECRET`,
`ADMIN_CONTEXT_ALLOWED_ORIGINS`, `VLY_CONVEX_AUTH_ISSUER`, `CONVEX_SITE_URL`)
tinggal di dashboard Convex, bukan di Vercel.

JANGAN menyalin `.env.local`: `VITE_CONVEX_URL` di sana menunjuk
`http://127.0.0.1:3210`, sehingga build menghasilkan aplikasi yang bicara ke
localhost.

### Checklist pasca-deploy

1. Firebase Console -> Authentication -> Settings -> Authorized domains:
   tambahkan domain Vercel. Tanpa itu, "Masuk dengan Google" gagal dengan
   `auth/unauthorized-domain`.
2. Dashboard Convex -> Environment variables -> `ADMIN_CONTEXT_ALLOWED_ORIGINS`:
   tambahkan origin baru dipisah koma, pertahankan yang lama. Tanpa itu
   Security Desk menampilkan "Sumber IP: Tidak terdeteksi".
3. Buka `/auth` lalu hard refresh. Kalau masih basi: DevTools -> Application ->
   Unregister service worker.
4. Verifikasi isi build, bukan status deployment:
   `node tmp/verify-publish.mjs https://domain-anda.vercel.app`

## Relay IP audit ruang pengelola (2026-10-03)

### Gejala yang dilaporkan

Security Desk mencatat percobaan masuk ruang pengelola dengan benar, tapi selalu
menampilkan `IP Tidak terdeteksi` dan `Lokasi Tidak terdeteksi`, walaupun jelas
ada percobaan yang sah.

### Dua sebab, keduanya sudah terukur (bukan dugaan)

**1. CORS tertutup.** Probe langsung ke origin produksi:

```
OPTIONS /admin-gate/context  ->  204 TANPA access-control-allow-origin
```

`ADMIN_CONTEXT_ALLOWED_ORIGINS` kosong, jadi mode `closed` aktif dan browser
memblokir beacon sebelum request-nya benar-benar berguna.

**2. Convex membuang header IP.** Ini yang menentukan, karena effort pertama
(`ADMIN_CONTEXT_ALLOWED_ORIGINS`) saja tidak akan cukup:

```
curl -X POST .../admin-gate/context -H "X-Forwarded-For: 1.2.3.4"
-> {"ipMasked":null,"ipSource":"Unknown","chainLength":0}
```

Header yang disuntik tidak sampai ke `httpAction`. `resolveClientIp()` sudah benar
dan sudah dijaga test - platformnya yang membuang header. Tidak ada satu pun
environment variable yang bisa memperbaikinya.

### Solusi: relay lewat edge Vercel

Satu-satunya pihak dalam rantai ini yang melihat alamat IP klien adalah Vercel, dan
hanya untuk permintaan yang **melewati** Vercel. Beacon lama melompati Vercel dan
langsung ke `*.convex.site`.

```
browser  --POST /api/admin-context (same-origin)-->  fungsi Vercel
fungsi Vercel  --POST /admin-gate/context-relay + Bearer secret-->  Convex
```

Geo diambil dari header milik Vercel sendiri (`x-vercel-ip-country`,
`x-vercel-ip-city`, `x-vercel-ip-country-region`), BUKAN dari layanan geolokasi
pihak ketiga. Jadi tidak ada alamat IP yang keluar dari Vercel dan Convex hanya
untuk memetakan lokasi.

IP mentah hanya berpindah di kabel antara dua komponen milik kita sendiri, lalu
langsung diturunkan jadi `ipHash` dan `ipMasked`. Alamat lengkap tidak pernah
ditulis ke tabel mana pun - perlakuan yang sama seperti sebelum relay ada.

### Menandai laporan produksi sebagai `production`

`resolveEnvironment` dijalankan di sisi **Convex** (`process.env` di
`src/convex/errorReports.ts`), bukan di Vercel. Tanpa ini, laporan dari
`sumenepbukukerja.com` muncul di Security Desk dengan label `development`
dan tidak terbaca sebagai masalah produksi - persis yang terjadi pada
laporan `ERR-20261003-0O72S0A` dan sesudahnya.

| Nama | Ditetapkan di | Nilai |
|---|---|---|
| `CONVEX_SITE_URL` | **Dashboard Convex** | `https://focused-lemur-389.convex.site` |

Urutan pembacaan disengaja: `APP_ENV` > `CONVEX_SITE_URL` > `CONVEX_DEPLOYMENT`.
Nilai yang disuntikkan platform dibaca paling akhir karena bisa tertinggal -
deployment yang pernah dibuat sebagai dev lalu dipakai untuk produksi, misalnya.
Kalau urlandanya dibalik, label `development` menutupi produksi.

`CONVEX_SITE_URL` di **Vercel** tetap berguna juga, untuk relay IP. Dua
tempat itu memang env var dengan nama sama tapi pembacaan berbeda.

### Environment variable (WAJIB, nilai sama persis di kedua tempat)

| Nama | Ditetapkan di | Nilai |
|---|---|---|
| `ADMIN_CONTEXT_RELAY_SECRET` | Dashboard Convex | string acak, mis. `openssl rand -hex 32` |
| `ADMIN_CONTEXT_RELAY_SECRET` | Vercel (Production + Preview) | **nilai yang sama persis** |
| `CONVEX_SITE_URL` | Vercel | `https://<deployment>.convex.site` |
| `ADMIN_CONTEXT_ALLOWED_ORIGINS` | Vercel + Convex | dipisah koma, pertahankan yang lama |

Secret KOSONG tidak merusak apa pun: relay menjawab netral dan Security Desk
kembali seperti sekarang. Secret yang berbeda di kedua tempat juga aman - relay
mati. Yang berbahaya hanya secret yang dipakai browser, dan kode itu dilarang.

Contoh membuat secret:

```bash
openssl rand -hex 32
```

### Kenapa `vercel.json` berubah

Rewrite SPA tadinya `/(.*)`, yang akan menelan `/api/admin-context` dan
mengembalikan `index.html` di tempat JSON. Gejalanya bukan error, hanya IP yang
hilang lagi. Sekarang:

```json
{ "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }] }
```

`src/lib/deploy-config.test.ts` menjaga bahwa setiap fetch same-origin ke `/api`
benar-benar dikecualikan, dan menambah route baru di `/api` memaksa test itu
dijalankan ulang.

### Checklist verifikasi setelah deploy

1. Dari browser, buka DevTools -> Network -> filter `admin-context`.
2. Balasan harus punya `ipSource: "Vercel Edge"` dan `ipMasked` terisi.
3. Masuk ke `/auth?returnTo=%2Fadmin`, salah ketik passcode sekali.
4. Buka `/admin` -> Security Desk. Kartu percobaan terbaru harus punya:
   - `IP <alamat tersamar>` (bukan `IP Tidak terdeteksi`),
   - `Lokasi <kota, wilayah>` dari header Vercel,
   - kode `ADM-YYYYMMDD-XXXXXX` yang bisa dibaca dan disebut dalam laporan.

Kalau `ipSource` masih `Unknown` tetapi `relay` bernilai `unavailable`, artinya
secret di kedua environment tidak sama. Kalau `relay` bernilai `vercel-edge`
tapi `ipMasked` null, artinya Vercel tidak mengirim header IP - cek apakah domain
sudah diverifikasi dan memang lewat edge, bukan preview lokal.

### Yang TIDAK dikerjakan, dan kenapa

- **Tidak menebak IP.** Kalau platform tidak formalized alamat klien, header itu
  dipakai otomatis pada permintaan berikutnya - tanpa perubahan kode. Mengarang
  nilai membuat log tampak lengkap padahal kosong.
- **Tidak mempercayai IP kiriman browser untuk keputusan rate limit.** Nilai itu
  masih disimpan sebagai `reportedIp` untuk dibaca manusia, tapi kunci rate limit
  hanya boleh memakai IP yang diamati server. Kalau tidak, siapa pun bisa memanggil
  dengan IP berbeda tiap kali dan mendapat jatah baru tanpa batas.
- **Tidak memakai layanan geolokasi pihak ketiga.** Header Vercel sudah cukup,
  dan mengundang pihak ketiga berarti alamat keluar dari sistem kita sendiri.

---

## Fase 9.2 - Relay admin bertanda tangan (2026-10-03)

### Apa yang berubah

Sebelum fase ini, relay dari edge Vercel ke backend memakai rahasia bersama polos
di header `Authorization: Bearer`. Secret itu membuktikan pemilik secret
sedang bicara, tapi tidak membuktikan dua hal yang penting untuk audit:

- apakah isi yang dikirim masih yang dimaksud,
- apakah permintaan itu hasil penangkapan ulang.

Sekarang setiap permintaan relay membawa tiga header:

| Header | Isi |
|---|---|
| `x-admin-relay-timestamp` | milidetik sejak epoch, dihitung server |
| `x-admin-relay-nonce` | 16 byte acak kriptografis, heksa 32 karakter |
| `x-admin-relay-signature` | HMAC-SHA-256 atas `v2.timestamp.nonce.metode.path.digestBadan` |

Backend menolak permintaan yang cap waktunya lebih dari 5 menit, nonce-nya
sudah pernah dipakai, tanda tangannya tidak cocok, atau badannya berubah satu
byte saja. Perbandingan tanda tangan waktu-tetap.

Secret polos sebagai `Authorization` sudah tidak lagi jadi jalur auth. Kalau
kelihatan di log atau di header berarti deployment ini belum ikut fase ini.

### Hash IP sekarang berkey

Sebelumnya `ipHash` dihitung dengan `sha256(ip)`. Hash itu satu arah, tapi
tidak rahasia: siapa pun yang punya daftar alamat bisa mencocokkannya. Sekarang
hash-nya `HMAC-SHA-256(kunci, ip)`, dan kunci diambil berurutan dari:

1. `SERVER_IP_HASH_SECRET`
2. `ADMIN_CONTEXT_RELAY_SECRET`

Kalau keduanya kosong, `ipHash` sengaja dikosongkan dan `ipHashMethod`
dicatat `unavailable`. Itu lebih jujur daripada diam-diam memakai hash lemah.
Kolom `ipHashMethod` di Security Desk menunjukkan cara setiap hash dibentuk.

### Kolom baru di Security Desk

Setiap baris `adminPasscodeAttempts` sekarang membawa:

| Kolom | Isi |
|---|---|
| `eventId` | `EVT-` + 24 heksa, dibuat server |
| `relayTraceId` | `rly_` + 16 heksa, dibuat di tepi sebelum perjalanan |
| `relay` | `vercel-edge`, `convex`, atau `unavailable` |
| `telemetryStatus` | `complete`, `partial`, atau `failed` |
| `ipHashMethod` | `hmac-sha256` atau `unavailable` |
| `eventType` | jenis kejadian, terpisah dari `outcome` |
| `timezone` | dari header edge, bentuknya sudah divalidasi |

Empat keadaan yang tadinya terlihat sama di layar kini bisa dibedakan:

| Status | Arti |
|---|---|
| Lengkap | IP benar-benar diamati edge dan lokasi ada |
| Sebagian terkumpul | IP ada, lokasi kosong |
| Gagal terkirim | tidak ada konteks jaringan sama sekali |
| Tidak tercatat | baris ditulis sebelum fase ini, tidak punya status |

Baris `IP tidak terdeteksi` tanpa keterangan apa pun adalah kegagalan
tampilan, bukan bukti. Sekarang alasannya ikut ditampilkan.

### Environment variable (Fase 9.2)

Convex:

| Nama | Wajib | Keterangan |
|---|---|---|
| `ADMIN_CONTEXT_RELAY_SECRET` | ya | Nilainya harus sama persis dengan yang di Vercel. Kosong berarti relay MATI, bukan terbuka. |
| `SERVER_IP_HASH_SECRET` | ya (produksi) | Kunci khusus hash IP. Kosong di produksi berarti `ipHash` tidak dibuat dan `ipHashMethod` mencatat `missing-in-production`. |
| `ADMIN_SECURITY_RETENTION_DAYS` | tidak | Umur retensi event. Bawaan 30 hari. |

Vercel (produksi dan preview):

| Nama | Wajib | Keterangan |
|---|---|---|
| `ADMIN_CONTEXT_RELAY_SECRET` | ya | Sama persis dengan nilai di Convex. |
| `SERVER_IP_HASH_SECRET` | ya (produksi) | Kunci khusus hash IP. Nilai boleh berbeda dari secret relay, dan memang harus berbeda. |
| `CONVEX_SITE_URL` | ya | Asal backend. Cloud URL dikoreksi ke `.convex.site`. |
| `ADMIN_CONTEXT_ALLOWED_ORIGINS` | tidak | Kosong berarti CORS tertutup, bukan wildcard. |

Dua kunci itu tugasnya berbeda dan tidak boleh disamakan.
`ADMIN_CONTEXT_RELAY_SECRET` membuktikan identitas pengirim dan ada di dua
tempat, jadi ia melewati jaringan. `SERVER_IP_HASH_SECRET` menjaga hash IP
tidak bisa ditebak dari daftar alamat yang masuk akal. Kalau keduanya bernilai
sama, satu kebocoran langsung membuka dua hal sekaligus dan tidak ada cara
mengetahui kunci mana yang bocor. Mulai Fase 9.3, produksi memakai
`SERVER_IP_HASH_SECRET` sebagai syarat: kalau kosong, `ipHash` sengaja tidak
dibuat dan `ipHashMethod` mencatat `missing-in-production`. Baris auditnya
tetap ditulis, hanya kehilangan bukti hash - itu lebih jujur daripada hash
yang rahasianya bocor ke tempat lain. Di luar produksi secret relay masih
boleh dipakai sebagai cadangan, dan hasilnya ditandai
`hmac-sha256-fallback` supaya penyimpangan itu terbaca di Security Desk.

Tanda tangan relay juga mengikat endpoint-nya. Rangkaian yang ditandatangani
memuat versi skema, cap waktu, nonce, metode HTTP, dan path, bukan hanya
cap waktu, nonce, dan digest badan. Tanpa itu, satu tanda tangan sah untuk
`/admin-gate/context-relay` juga sah untuk route lain yang kebetulan memakai
secret sama. Tanda tangan dari skema lama ditolak, bukan diterima diam-diam.

Cara memeriksa tanpa mencetak nilai:

```bash
# Convex
npx convex env list | grep -E 'ADMIN_CONTEXT_RELAY_SECRET|SERVER_IP_HASH_SECRET'
# Vercel
vercel env ls | grep -E 'ADMIN_CONTEXT_RELAY_SECRET|CONVEX_SITE_URL'
```

Hanya yang muncul atau tidak yang boleh dilaporkan. Jangan pernah mencetak
nilainya ke log, ke tiket, atau ke percakapan.

### Diagnosis kegagalan

| Gejala di Security Desk | Kemungkinan | Yang diperiksa |
|---|---|---|
| `telemetryStatus: Gagal terkirim`, `relay: Tidak tersedia` | Fungsi Vercel tidak hidup, atau `CONVEX_SITE_URL` kosong | Log fungsi Vercel |
| `relay: Ditolak` | Secret tidak sama di kedua sisi, atau jam berbeda lebih dari 5 menit | Bandingkan `configured/missing/mismatched` di kedua environment |
| `relayTraceId` ada tapi tidak ada event | Backend menolak nonce yang berulang, atau rate limit aktif | Cari `relayTraceId` itu di log terstruktur |
| `ipHashMethod: Tidak dibuat - tidak ada kunci` | Kedua kunci hash kosong | Isi `SERVER_IP_HASH_SECRET` |
| `Lokasi tidak terdeteksi - sebagian terkumpul` | Edge tidak mengirim header `x-vercel-ip-*` | Cek apakah domain lewat Vercel, bukan akses langsung |

Setiap penolakan menulis satu baris log terstruktur dengan `type:
"security_telemetry"`. Baris itu sengaja tidak memuat alamat IP, secret,
passcode, token sesi, atau badan permintaan - hanya pengenal dan keterangan.
Pencarian lewat `eventId` atau `relayTraceId` adalah cara resmi
mengikuti satu perjalanan dari HTTP sampai persistence.

### Checklist verifikasi produksi

Setelah redeploy:

1. Buka `/admin` dan lakukan satu percobaan.
2. Di DevTools, pastikan ada `POST /api/admin-context`. Kalau jawabannya HTML,
   aturan rewrite capturing endpoint: cek `vercel.json` masih
   `/((?!api/).*)`.
3. Pastikan jawabannya bukan `relay: unavailable`.
4. Buka Security Desk, baris terbaru harus punya `eventId`, `attemptCode`,
   `occurredAt`, `outcome`, `telemetryStatus`, dan konteks perangkat.
5. Kalau `telemetryStatus: Gagal terkirim`, itu jawaban yang BENAR untuk
   deployment yang relay-nya belum terhubung. Laporkan sebagai limitation,
   jangan tutup dengan fallback palsu.

Verifikasi resmi berhenti di `persistensi`. Status HTTP `200` saja tidak
membuktikan apa pun: jalur lengkapnya HTTP, relay, Convex, persistence,
Security Desk.

### Retensi

Event disimpan paling lama `ADMIN_SECURITY_RETENTION_DAYS` hari, bawaan 30,
dan jumlah baris dibatasi 500 terbaru. Keduanya dijalankan oleh
`pruneAdminSecurityEvents`, yang juga menghapus konteks relay yang kedaluwarsa,
nonce yang sudah tak berlaku, dan presence yang lebih tua dari 7 hari.

Tabel `adminRelayNonces` ikut dibersihkan oleh penyiangan yang sama. Tanpa itu,
tabel itu akan tumbuh tanpa batas seiring relay berjalan.

### Yang disimpan, dan yang tidak

| Disimpan | Tidak disimpan |
|---|---|
| Bentuk IP tersamar (`103.xxx.xxx.xxx`) | Alamat IP mentah |
| Hash IP berkey | Alamat IP di log aplikasi |
| Negara, wilayah, kota, zona waktu | Koordinat presisi di Security Desk |
| User agent yang sudah dipangkas | Sidik jari canvas, WebGL, font, perangkat |
| `eventId`, `relayTraceId`, `requestId` | Passcode, kata sandi, token sesi, cookie |
| Header `Authorization` | Secret apa pun |

Tabel `adminRelayNonces` menyimpan `nonce`, bukan kredensial: `nonce`
hanya berguna kalau secret sudah diketahui, dan tidak pernah dikembalikan ke
siapa pun.

### Catatan privasi untuk operator

Sistem memproses metadata keamanan untuk keperluan audit dan investigasi
insiden di ruang pengelola sendiri. Pen-catatan ini bukan pelacakan pengunjung
dan tidak ada data yang dikirim ke pihak ketiga.

Dasar pemrosesan dan kebijakan retensi WAJIB divalidasi terhadap tujuan pemrosesan
sesungguhnya milik operator serta ketentuan privasi Indonesia yang berlaku.
Dokumen ini tidak mengklaim kepatuhan otomatis, dan tidak memberi hak atas
dasar keputusan hukum apa pun. Kepatuhan adalah keputusan operator, bukan hasil
dari kode ini.

Telemetry keamanan tidak bergantung pada persetujuan pengguna peramban. Audit
keamanan tidak boleh berhenti hanya karena seseorang tidak menekan tombol
setuju. Tapi catatan ini juga bukan alasan menambah modal persetujuan
tambahan yang tidak menjelaskan apa pun.

## Ringkasan aksi operator

| Temuan | Tindakan | Verifikasi | Bisa dikerjakan agent? |
|---|---|---|---|
| F-01 | Tidak ada rotasi; kunci adalah bawaan platform, dan jalur yang memakainya sudah dihapus | Tidak ada kode yang membaca `VLY_EMAIL_OTP_API_KEY` | Tidak ada tindakan yang tersisa |
| F-08 | Hapus `STAFF_BOOTSTRAP_EMAILS` (dev sudah selesai; produksi menilai ulang setelah deploy) | Terukur 2026-09-30 di `qualified-chameleon-491`: `available = false`, `staffCount = 3` | Sudah (operator) |
| F-09 | Tetapkan origin produksi, uji 6 route | Status per route di kedua origin | Sebagian (probe sudah ada) |
| F-11a | Header keamanan di origin frontend | Header yang benar-benar terlihat di respons origin | Tidak |
| F-11b | Header di route Convex | `vary` + `nosniff` di respons | Sudah (kode + test) |
| F-11c | Allowlist CORS (opsional) | Probe allowlist + Security Desk masih terisi | Sebagian (kode + test sudah ada) |
| F-05 | Keputusan kebijakan PII | Register keputusan terisi | Tidak (product owner) |
| F-17 | Infrastruktur test E2E dua sesi | `npm run test:e2e` tanpa dilewati: 64 tes, 0 dilewati | Tidak (butuh kredensial uji; syaratnya di bagian F-17a) |
