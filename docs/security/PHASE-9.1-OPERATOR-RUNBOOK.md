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
| `JSON.stringify(error)` menyalin header `x-api-key` ke respons pemanggil anonim | Sudah diperbaiki | Objek error penyedia tidak lagi ikut ke pesan. Dikunci `src/convex/otp-provider-security.test.ts`. |
| Rotasi nilai | **Tidak berlaku** | Nilai milik platform, tidak bisa dicabut dari sisi proyek. |

Bagian kedua inilah yang sebenarnya berbahaya, dan bagian itulah yang sudah
tertutup. Risiko yang tersisa adalah penyalahgunaan kuota penyedia milik
platform - bukan takeover akun, bukan kebocoran data warga.

### Prosedur yang tersisa (bukan rotasi)

Tidak ada langkah rotasi. Yang perlu dilakukan operator:

1. **Jangan** menuliskan nilai kredensial ke mana pun - dokumen, issue, chat,
   atau log.
2. Pastikan `VLY_EMAIL_OTP_API_KEY` tetap terisi di Keys, karena kode gagal
   dengan pesan jelas bila env kosong.
3. Bila Freebuff suatu saat mengganti nilai bawaannya, tidak ada tindakan yang
   perlu diambil: proyek mengambil nilai baru dari env tanpa perubahan kode.
4. Catat keputusan ini beserta sumber konfirmasinya (tim Freebuff, kanal
   komunitas resmi, tanggal) di `PHASE-9.1-SECURITY-CLOSURE.md` bagian F-01.

### Histori Git

Nilai lama masih dapat dibaca siapa pun yang punya akses repository. Rewrite
sejarah **tidak direkomendasikan**: risikonya lebih besar dari nilai kuncinya
sendiri, dan nilai itu bukan rahasia proyek. Putusan ini sudah dicatat.

### Kalau suatu saat platform mengaktifkan rotasi

Bila Freebuff menyediakan mekanisme rotasi per-deploy, prosedur sebenarnya
adalah: buat nilai baru di platform, pasang ke `VLY_EMAIL_OTP_API_KEY`, deploy,
verifikasi OTP sign-in di `/auth`, **lalu** cabut yang lama di platform.
Urutan "cabut dulu, baru buat" tidak boleh dipakai - di antara keduanya tidak
ada satu pun akun yang bisa masuk.

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
   akun aktif yang bisa masuk lewat OTP. Kalau ada pengelola yang belum pernah
   masuk, selesaikan dulu - jangan matikan allowlist sebelum itu.
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
`VITE_CONVEX_URL`, yaitu `https://rare-scorpion-625.convex.cloud`. Pengujian
itu **DEVELOPMENT**, bukan produksi.

| Fungsi | Origin | Bukti |
|---|---|---|
| Query, mutation, action (`/api/*`) | `https://rare-scorpion-625.convex.cloud` | `tmp/qa-p91-closure-evidence.json` |
| Route HTTP (`/sitemap.xml`, `/robots.txt`, `/admin-gate/context`, `/webhook/whatsapp`, `/twilio/status`) | `https://rare-scorpion-625.convex.site` | probe yang sama |
| Frontend (HTML aplikasi) | **belum diketahui** | tidak ada konfigurasi deploy di repositori |

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

## Ringkasan aksi operator

| Temuan | Tindakan | Verifikasi | Bisa dikerjakan agent? |
|---|---|---|---|
| F-01 | Tidak ada rotasi; kunci adalah bawaan platform. Jaga env tetap terisi | OTP masuk di `/auth` | Tidak ada tindakan yang tersisa |
| F-08 | Hapus `STAFF_BOOTSTRAP_EMAILS` | Terukur 2026-09-30: `available = false`, `staffCount = 3` | Sudah (operator) |
| F-09 | Tetapkan origin produksi, uji 6 route | Status per route di kedua origin | Sebagian (probe sudah ada) |
| F-11a | Header keamanan di origin frontend | Header yang benar-benar terlihat di respons origin | Tidak |
| F-11b | Header di route Convex | `vary` + `nosniff` di respons | Sudah (kode + test) |
| F-11c | Allowlist CORS (opsional) | Probe allowlist + Security Desk masih terisi | Sebagian (kode + test sudah ada) |
| F-05 | Keputusan kebijakan PII | Register keputusan terisi | Tidak (product owner) |
| F-17 | Infrastruktur test E2E dua sesi | Test berjalan tanpa dilewati | Tidak (butuh kredensial uji) |
