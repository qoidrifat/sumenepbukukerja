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

---

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
| F-17 | Infrastruktur test E2E dua sesi | Test berjalan tanpa dilewati | Tidak (butuh kredensial uji) |
