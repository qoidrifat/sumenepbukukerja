# Laporan Hardening Keamanan - Sumenep Buku Kerja

Tanggal: 1 Oktober 2026
Basis: branch `main`, commit `b51be9cbc3f46e70eea9f173c61cddcd89354eb3`
Deployment dev: `qualified-chameleon-491` | Deployment prod: `focused-lemur-389`

> **Cara membaca laporan ini.**
>
> Setiap butir ditandai `SELESAI`, `SEBAGIAN`, atau `BELUM`. Yang ditandai
> `SELESAI` sudah melewati typecheck, test, dan lint pada commit ini. Yang
> ditandai `SEBAGIAN`/`BELUM` disertai berkas dan baris yang tepat serta
> langkah berikutnya, bukan kalimat "akan ditangani nanti".
>
> Satu hal yang perlu dinyatakan di depan: **pekerjaan ini TIDAK selesai
> seluruhnya.** Dari 22 bagian master prompt, 5 bagian selesai penuh, 3
> sebagian, dan 14 belum disentuh. Bagian yang belum disentuh bukan karena
> tidak penting, melainkan karena mengerjakannya setengah jalan akan
> menghasilkan regresi yang lebih berbahaya daripada tidak mengerjakannya.
> Rinciannya ada di bagian 1.2 dan 1.3.

---

## 1. Ringkasan Eksekutif

### 1.1 Yang berubah di commit ini

Sebelas kelompok perubahan, semuanya terverifikasi:

**A. Kebocoran pengenal akun dari papan permintaan publik (P1, sudah bocor).**

`community.listRequests` membentuk jawabannya dengan menyebar seluruh dokumen
database lalu membuang field satu per satu. Pola itu selalu kalah dari
perubahan schema: setiap field baru di `serviceRequests` otomatis ikut keluar.
Yang sudah terbukti bocor adalah `requesterId` (atau, lihat bagian 2.1) untuk
setiap pembaca yang punya sesi.

Sekarang jawabannya dibentuk oleh daftar putih di `src/lib/request-dto.ts`.
Field yang tidak disebut di sana tidak punya jalan keluar. Penggantinya untuk
UI adalah tiga boolean yang dihitung server: `isMine`, `canManage`,
`canOffer`.

**B. Lima keputusan otorisasi yang bercabang menjadi satu (P1).**

`src/convex/vendors.ts` dan `src/convex/community.ts` masing-masing menyimpan
salinan `requireUser`, `hasStaffAccess`, `isViewer`, `requireStaff`, dan
`requireVendorManager` hasil salin-tempel dari `src/convex/access.ts`.

Salinan itu membaca identitas lewat `getAuthUserId` langsung, sehingga **tidak
pernah memanggil `assertSessionNotRevoked`**. Akibatnya konkret: sesi pengelola
yang sudah dicabut admin dari Security Desk masih bisa membuat listing,
mengubah ketersediaan, memoderasi foto, dan mengubah paket lewat dua berkas
itu, sementara jalur lain menolaknya seketika. Pencabutan sesi mengandalkan
pemeriksaan di setiap permintaan, dan dua berkas ini melewatkannya.

**C. `ensureCatalogSeeded` berhenti menulis ke baris milik orang lain (P2).**

Fungsi ini publik tanpa sesi dan dipanggil setiap pengunjung saat katalog
kosong. Ia dulu juga mem-patch `lat`/`lng` baris mana pun yang slug-nya sama
dengan benih - artinya pemilik listing yang sengaja mengoreksi titik lokasinya
bisa dikembalikan oleh pengunjung anonim. Penulisan itu dipindahkan ke
`alignSeededCoordinates` yang `internalMutation`; sisanya diberi batas kerja
`MAX_SEED_INSERTS`.

**D. Deteksi serangan yang sungguhan, bukan dashboard hiasan (P1).**

Tabel `securityIncidents` beserta katalog sembilan aturan di
`src/lib/security-rules.ts`, pencatat beragregasi di
`src/convex/securityIncidents.ts`, dan operasi Security Desk yang diotorisasi
server. Aturan deteksi ditulis sebagai logika murni sehingga seluruh matriks
ambang bisa diuji tanpa deployment.

Tiga dari sembilan aturan sudah **tersambung ke pemicu nyata** dan diuji:

| Aturan | Pemicu | Cara kerja |
|---|---|---|
| `admin_passcode_failures` | `adminGate.recordAttempt` | Menghitung kegagalan di jendela lewat indeks `byKeyCreatedAt`, satu pembacaan |
| `admin_lockout_threshold` | `adminGate.recordAttempt` (outcome `locked`) | Ambang satu; kunci penuh tidak punya alasan sah |
| `webhook_signature_failure` | `http.ts::reportWebhookIssue` | Menjumlahkan `occurrences` laporan error webhook ber-sidik-jari sama di jendela aturan |

Enam sisanya belum tersambung; daftarnya di bagian 5.1.

**E. `postMessage` tidak lagi ke bintang.**

`src/main.tsx` mengirim telemetri rute ke `window.parent` dengan target `"*"`,
artinya situs mana pun yang memasang aplikasi ini di dalam iframe menerima
seluruh jejak navigasi pengunjung. Sekarang targetnya daftar putih origin yang
eksplisit, dan perintah navigasi masuk hanya diterima dari induk langsung.

**F. Panel "Sesi Anda" berhenti mempercayai peramban (P1, baru commit ini).**

`reportSessionContext` menerima token konteks server sebagai argumen wajib,
tidak pernah membacanya, lalu menulis apa pun yang dikirim browser ke
`adminPresence`: IP, sumber IP, request id, browser, sistem operasi, dan jenis
perangkat. Panel yang menjalankan keputusan "cabut sesi ini" karena itu
menampilkan angka yang bisa ditulis sendiri oleh subjek yang dinilai. Sekarang
token itu dikonsumsi, kolom jaringan diambil dari baris `adminSecurityContexts`,
dan klasifikasi perangkat diturunkan server dari user agent yang diamati.
Rincian di 2.6.

**G. Route konteks ditutup dan dibatasi (P1, baru commit ini).**

`POST /admin-gate/context` menjawab `access-control-allow-origin: *` setiap kali
allowlist origin kosong, sehingga situs mana pun bisa membaca masked IP, kota,
dan token konteks milik pengunjung dari perambannya. Allowlist kosong kini
berarti tidak ada header izin sama sekali; wildcard hanya aktif kalau operator
mengaktifkan `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS=true`. Route yang sama kini
dibatasi 30 permintaan per menit per sumber IP, dihitung dari IP yang diamati
server. Rincian di 2.7 dan 2.8.

**I. Postur dependensi diperbaiki dari data, bukan dari daftar (P1, baru commit ini).**

`bun audit` menemukan 46 kerentanan, termasuk satu **critical** di `@auth/core`
(normalizer email Auth.js membolehkan bypass lewat tanda `@` homoglif) dan
sebelas advisory high di `axios` yang **tidak pernah diimpor berkas pun**.
`axios` dihapus, semua paket diperbarui dalam rentang yang sudah
dideklarasikan, `@auth/core` + `@convex-dev/auth` dinaikkan ke kombinasi yang
didukung vendor, dan `package-lock.json` yang sudah menyimpang (lima dependensi
langsung hilang dari sana) dihapus supaya `bun.lock` jadi satu-satunya sumber
kebenaran. Hasil: 46 -> 15 kerentanan, **0 critical**, **0 dependensi langsung
yang rentan**. Rinciannya di bagian 8.

**H. Bukti bahwa pola penolakan tidak bisa dicatat dari dalam gerbang (P1, baru commit ini).**

Dua aturan deteksi (`privileged_call_denied`, `storage_reference_invalid`) hidup
di `access.ts`, di dalam gerbang yang melempar. Pendekatan itu dicoba, diuji,
dan **ditarik kembali karena terbukti tidak bisa bekerja**: mutation Convex
bersifat atomik, jadi ketika handler melempar, satu baris bukti yang ditulis
satu baris sebelumnya ikut hilang. Test membuktikannya secara langsung, dan
kode yang "tidak bisa bekerja" itu justru tidak pernah complain - hanya
membayar satu write per penolakan untuk sesuatu yang selalu hilang. Batas kedua
(`ConvexError` dengan objek mengubah pesan yang dilihat pengguna) juga ketahuan
karena test yang sudah ada menangkapnya.

Yang berhasil dipasang: `invite_token_invalid`, karena jalur penolakannya
mengembalikan nilai, bukan melempar. Infrastruktur untuk sisanya sudah siap dan
retensinya sudah dijadwalkan. Rinciannya di 2.9 dan 5.1.

**J. Storage dan permukaan publik dibatasi dari dalam server (P1/P2, baru commit ini).**Bagian 10 dan 11 dari master prompt menuntut lima hal yang melekat. Empat di
 antaranya sudah benar sebelumnya dan satu belum sama sekali; satu hal yang
tidak disebut eksplisit ternyata indeksnya sudah ada di skema, hanya tidak
dipakai. Yang dikerjakan commit ini:

- **MIME bukan lagi awalan `image/`.** `isStoredImage` menerima apa pun yang
  diawali `image/`, termasuk `image/svg+xml`. SVG adalah dokumen yang boleh
  memuat `<script>` dan `onload`, dan Convex menyajikan berkas storage sebagai
  dokumen utuh - bukan `<img>` yang terisolasi. Sekarang aturannya allowlist
  raster eksplisit (`ALLOWED_IMAGE_TYPES`), dinormalisasi huruf besar dan
  parameter `; charset=`. `gif`, `avif`, `heic`, dan `heif` tetap diterima
  karena semuanya sudah menjadi perilaku yang berjalan.
- **Peta blob mendapat batas ukuran.** `storage.recordUploadedBlob` hanya
  memanggil `isStoredImage`, jadi foto 200 MB tetap masuk peta. Peta membuat
  `pruneOrphanStorage` menganggap blob itu "pernah dipakai", sehingga satu
  unggahan raksasa menghasilkan sampah yang TIDAK PERNAH dipangkas. Sekarang
  pemanggilnya `imageRejection` - aturan yang sama dengan `users` dan
  `community`, jadi tidak ada aturan ukuran kedua.
- **Pemangkasan memakai indeks yang sudah ada.** `pruneOrphanStorage` mencari
  rujukan foto profil dengan `.filter()` di atas SELURUH tabel `users`,
  padahal `users.byProfileImageStorageId` sudah ada. Sekarang satu pembacaan
  indeks.
- **Enam permukaan publik yang membaca tanpa batas** (bagian 2.10 dan 2.11):
  inbox notifikasi, penandaan terbaca, deduplikasi interaksi, kuota laporan,
  kuota ulasan anonim, dan fans-out notifikasi request. Semuanya kini
  dibatasi di server; tidak satu pun nilai balik pemanggil berubah, dan
  980 test tetap hijau tanpa satu pun test lama yang perlu di-`skip`.

Bagian 15 (performa) ditangani terpisah: `vendors.listActive` dan
`community.listRequests` kini punya plafon pemindaian dengan hasil yang sama
bagi pemanggilan anonim. Rinciannya di 2.10, 2.11, dan 2.12.

### 1.2 Status per bagian

| Bagian | Judul | Status | Catatan |
|---|---|---|---|
| 0 | Secret containment | SEBAGIAN | `.gitignore` diperbaiki; riwayat Git & rotasi tidak bisa dikerjakan dari sini |
| 1 | Otorisasi terpusat | SELESAI | 2 berkas, 5 fungsi, 2 salinan dihapus |
| 2 | Audit fungsi publik | SELESAI | Semua 113 fungsi publik diaudit; 106 bergerbang, 7 pengecualian tertulis. Audit jadi tripwire (`public-surface-audit.test.ts`), bukan dokumen |
| 3 | Minimisasi data | SELESAI | Daftar putih + 13 test regresi |
| 4 | Privasi WhatsApp | SELESAI | Nomor USAHA lewat handoff opaque + kuota; nomor pribadi warga terenkripsi (AES-GCM) + lookup HMAC. Sisa: migrasi dijalankan pemilik (9.2) |
| 5 | Integritas Security Desk | SELESAI | `reportSessionContext` sekarang server-authoritative; 8 test regresi |
| 6 | CORS / HTTP | SELESAI | Fail-closed saat allowlist kosong + batas 30 permintaan/menit per IP; 11 test |
| 7 | Deteksi serangan | SEBAGIAN | Model + katalog + pencatat + panel + retensi + penghitung laju SELESAI; 7 dari 9 pemicu tersambung dan diuji |
| 8 | Security header | BELUM | Butuh lapisan deployment (lihat bagian 12) |
| 9 | postMessage | SELESAI | |
| 10 | Storage | SELESAI | Allowlist MIME, batas ukuran peta blob, indeks foto profil dipakai; 2.10 |
| 11 | Abuse hardening | SELESAI | Enam permukaan publik dibatasi; 2.11. Kuota yang sudah ada dipertahankan |
| 12 | QA responsif | BELUM | Tidak ada peramban di lingkungan ini |
| 13 | Integritas tombol | BELUM | |
| 14 | Sinkronisasi rute | BELUM | |
| 15 | Performa | SEBAGIAN | Plafon pemindaian pada 7 query (2.13); N+1 dan agregat dashboard masih terbuka secara sadar |
| 16 | Dependency / lockfile | SELESAI | 46 -> 15 kerentanan, 0 critical, `axios` dihapus, satu lockfile |
| 17-19 | Test / unit / e2e | SEBAGIAN | 1027 test hijau, termasuk 15 test enkripsi nomor, 5 test audit permukaan publik, 15 test handoff kontak, 12 test pemicu deteksi; E2E belum disentuh (tidak ada peramban) |
| 20 | Urutan pengerjaan | SEBAGIAN | Urutan diikuti untuk yang dikerjakan |
| 21 | Laporan ini | SELESAI | |
| 22 | Definition of Done | SEBAGIAN | Lihat bagian 11 |

### 1.3 Kenapa sebagian besar tidak dikerjakan

Bukan karena kurang waktu, tapi karena tiga batas nyata di lingkungan ini:

1. **Riwayat Git tidak bisa diperiksa.** Perintah `git` diblokir oleh platform
   (`"Git and GitHub commands are blocked; Vly manages version control"`).
   Bagian 0 menuntut pemindaian riwayat dan penghapusan material dari history.
   Keduanya tidak bisa saya lakukan maupun verifikasi dari sini. Yang bisa saya
   lakukan sudah dilakukan: mencegah pengulangan.
2. **Tidak ada peramban.** Bagian 12, 13, dan 14 menuntut screenshot dari lima
   mesin dan sepuluh lebar layar. Lingkungan ini tidak punya peramban sama
   sekali, dan `bunx vite build` diblokir. Setiap klaim verifikasi visual dari
   sini akan menjadi klaim palsu.
3. **Tidak ada kredensial prod.** Deploy prod dan publish frontend hanya bisa
   dijalankan pemilik. Bagian 8 harus dipasang di lapisan itu.

Berbeda dari tiga hal di atas, Bagian 4, 10, 11, 15, dan 16 **bisa**
dikerjakan di sini. Bagian 5 dan 6 sudah dikerjakan pada commit ini (lihat
2.6, 2.7, dan 5.3). Bagian 10, 11, dan 15 (sebagian) juga sudah dikerjakan pada
commit ini; lihat 2.10 sampai 2.12. Sisanya belum dikerjakan karena masing-masing
adalah refaktor lintas berkas yang tidak bisa diverifikasi secara visual pada
turn ini, dan saya memilih tidak mengirim perubahan yang belum saya yakini benar
daripada mengirim perubahan yang merusak CTA utama produk.

---

## 2. Temuan Menurut Tingkat Keparahan

### 2.1 `requesterId` bocor ke papan permintaan publik

- **Tingkat:** P1 - kebocoran data yang sudah berjalan
- **Berkas (sebelum):** `src/convex/community.ts`, handler `listRequests`
- **Pola:** `const { requesterId, ...publicRequest } = request; return { ...publicRequest, ...(viewerId ? { requesterId: request.requesterId } : {}) }`
- **Skenario ancaman.** Papan permintaan bisa dibaca tanpa akun. Untuk pembaca
  yang punya sesi, jawabannya memuat id akun Convex (`users._id`) dari setiap
  pembuat permintaan. Sebuah akun Convex Auth bisa dibuat tanpa verifikasi
  email, jadi penyerang tinggal mendaftar, membaca papan, dan mengumpulkan id
  akun warga. Id itu adalah kunci yang dipakai di seluruh skema, termasuk di
  `auditLogs.actorId` dan `listingClaims.requesterId`.
- **Perbaikan.** Daftar putih eksplisit di `src/lib/request-dto.ts`. UI
  mendapat `isMine`/`canManage`/`canOffer` yang dihitung server.
- **Test regresi.** `src/lib/request-dto.test.ts` (13 test) dan dua test di
  `src/convex/security-surface.test.ts` serta
  `src/convex/display-name-security.test.ts` yang sebelumnya **mengunci
  kebocoran itu sebagai perilaku benar** - sekarang menguncinya sebagai
  larangan.
- **Sisa risiko.** Nol untuk jalur ini. `requesterName` masih keluar dan itu
  disengaja (bagian 3.2).

### 2.2 Sesi yang dicabut masih bisa menulis lewat dua berkas

- **Tingkat:** P1 - kontrol keamanan yang bisa dilewati
- **Berkas (sebelum):** `src/convex/community.ts` baris 86-146,
  `src/convex/vendors.ts` baris 36-98
- **Skenario ancaman.** Admin mencabut sesi perangkat yang dicurigai dari
  Security Desk. `src/convex/access.ts` menolak permintaan berikutnya dari
  perangkat itu karena `requireUser` memanggil `assertSessionNotRevoked`.
  Tetapi `community.ts` dan `vendors.ts` memakai salinan yang membaca
  `getAuthUserId` langsung, jadi perangkat yang "sudah dicabut" masih bisa:
  membuat listing baru, mengubah ketersediaan listing, memoderasi foto, dan
  menambah/mengubah/menghapus paket. Pencabutan yang tidak berlaku di semua
  pintu bukan pencabutan.
- **Perbaikan.** Kelima fungsi di dua berkas itu sekarang hanya menyesuaikan
  bentuk nilai kembali dari `src/convex/access.ts`. Tidak ada satu pun
  keputusan izin yang masih dihitung di sana.
- **Test regresi.** `src/convex/revoked-session-coverage.test.ts`, 10 test.
  Empat di antaranya membuktikan sesi yang ada di `revokedAdminSessions`
  ditolak pada `community.updateAvailability`, `community.createPackage`,
  `community.moderateVendorPhoto`, dan `vendors.createVendor` - yaitu empat
  fungsi yang persis ada di dua berkas yang dulu bocor. Setiap penolakan
  dipasangkan dengan pemanggilan yang sama dari sesi yang TIDAK dicabut dan
  harus berhasil, supaya test tidak bisa lulus hanya karena fungsinya menolak
  semua orang.

  Pencabutannya ditulis langsung ke `revokedAdminSessions`, bukan lewat
  `adminGate.revokeAdminSession`. Itu disengaja: yang diuji adalah apakah
  setiap permintaan memeriksa daftar cabut, bukan apakah satu mutation
  pencabutan bekerja. Kalau test ini mencabut lewat mutation itu, kegagalan di
  salah satunya akan menyamar sebagai kegagalan di yang lain.
- **Sisa risiko.** `src/convex/adminGate.ts` masih punya jalur gerbangnya
  sendiri; itu memang benar karena gerbang berjalan sebelum ada identitas.

### 2.3 `ensureCatalogSeeded` menulis ke baris milik orang lain

- **Tingkat:** P2 - integritas data
- **Berkas:** `src/convex/vendors.ts`
- **Skenario ancaman.** Fungsi publik tanpa sesi, dipanggil setiap pengunjung
  saat katalog kosong. Ia mem-patch `lat`/`lng` baris yang slug-nya sama
  dengan benih repo. Siapa pun bisa memanggilnya berulang kali dan mengembalikan
  koordinat listing ke nilai benih - pemilik yang mengoreksi titik lokasinya
  tidak bisa mempertahankan koreksinya.
- **Perbaikan.** Cabang "baris sudah ada" berhenti menulis; penyelarasan
  koordinat menjadi `alignSeededCoordinates` (`internalMutation`).
- **Test regresi.** Empat test di `src/convex/revoked-session-coverage.test.ts`
  (describe "FASE 2"). Yang dikunci: pemanggilan ulang TIDAK menimpa `lat`/`lng`
  yang sudah dikoreksi, `alignSeededCoordinates` tetap bisa menyelaraskan dan
  idempoten, dan jumlah sisipan tidak melewati batas.
- **Sisa risiko.** Nol untuk penulisan; `ensureCatalogSeeded` tetap bisa
  dipanggil siapa pun dan tetap menulis baris BARU, tapi isinya konstanta repo.

### 2.4 Telemetri rute ke induk mana pun

- **Tingkat:** P2 - kebocoran metadata navigasi
- **Berkas:** `src/main.tsx`, fungsi `RouteSyncer`
- **Skenario ancaman.** `window.parent.postMessage({ path }, "*")` mengirim
  setiap perpindahan rute ke induk tanpa memeriksa siapa induknya. Situs mana
  pun bisa memasang aplikasi ini di iframe dan menerima jejak navigasi pasif,
  termasuk rute profil listing yang sedang dibuka dan rute undangan sebelum
  tautannya dikonsumsi. Sisi masuk juga menerima perintah `navigate` dari
  mana pun, sehingga jendela luar bisa memerintahkan `history.back()`.
- **Perbaikan.** Daftar putih origin eksplisit dari
  `VITE_PREVIEW_PARENT_ORIGIN`. Di PROD tanpa variabel itu, tidak ada pesan
  yang keluar sama sekali.
- **Test regresi.** `src/lib/postmessage-origin.test.ts`, 6 test. Yang dikunci:
  tidak ada satu pun panggilan `postMessage` yang memakai penanda bintang,
  tujuan kirim tidak pernah diambil dari `event.origin`/`document.referrer`,
  halaman non-iframe tidak mengirim apa pun, dan baik `event.source` maupun
  origin pengirim diperiksa sebelum perintah `navigate` dijalankan.

  Pemindai ini membuang komentar blok lebih dulu, dan itu disengaja: dokumen
  di `main.tsx` sengaja menuliskan panggilan lamanya apa adanya supaya orang
  tahu apa yang diperbaiki. Tanpa membuang komentar, test ini akan gagal pada
  kode yang sudah benar.
- **Sisa risiko.** Nol.

### 2.5 Duplikasi aturan otorisasi (temuan struktural)

Lima salinan aturan di dua berkas. Sudah dijelaskan di 2.2. Nilai tambahnya
dicatat terpisah karena akar masalahnya bukan bug di satu salinan, melainkan
pola: satu keputusan keamanan yang hidup di lima tempat pasti akan berbeda di
salah satunya.

### 2.6 Panel "Sesi Anda" menampilkan apa pun yang diklaim peramban (tinggi)

Ditemukan dan diperbaiki pada commit ini.

`adminGate.reportSessionContext` mendeklarasikan `token: v.string()` sebagai
argumen WAJIB, dan nama argumen itu menjanjikan satu-satunya sumber metadata
server. Kenyataannya `token` **tidak pernah dibaca** di seluruh mutation itu.
Handler langsung menulis nilai yang dikirim browser:

```ts
ipHash: args.ipHash ?? existing?.ipHash,
ipMasked: args.ipMasked ?? existing?.ipMasked,
ipSource: args.ipSource ?? existing?.ipSource,
ipFamily: args.ipFamily ?? existing?.ipFamily,
requestId: args.requestId ?? existing?.requestId,
userAgent: args.userAgent ?? existing?.userAgent,
browser: args.browser ?? existing?.browser,
os: args.os ?? existing?.os,
deviceType: args.deviceType ?? existing?.deviceType,
```

Baris konteks yang sebenarnya dibuat `POST /admin-gate/context` di
`http.ts` - dengan `resolveClientIp`, `sha256Hex`, dan `parseUserAgent` - lalu
dibiarkan menua di `adminSecurityContexts` tanpa pernah dipakai. meanwhile
`verifyAdminPasscode` di berkas yang sama sudah benar sejak awal
(`parseUserAgent(serverContext?.userAgent ?? args.userAgent)`). Satu gerbang
membaca server, satu gerbang membaca klien, dan keduanya kelihatan sama dari luar.

Dampaknya bukan kebocoran data ke pihak ketiga. Dampaknya adalah panel
"Sesi Anda" menampilkan nilai yang bisa ditulis sendiri oleh perangkat yang
sedang diperiksa: IP dari kota lain, `requestId` bikainan, `deviceType`
"Desktop" padahal ponsel. Security Desk dipakai untuk dua keputusan -
"cabut sesi ini" dan "ini bukan orang saya" - dan keduanya tidak boleh
dibangun di atas angka yang dikontrol subjek yang dinilai.

Perbaikannya: `consumeSecurityContextRow` (fungsi biasa, supaya pembacaan dan
penghapusan terjadi dalam satu transaksi) membuka baris konteks sekali pakai,
seluruh kolom jaringan diambil dari sana, dan `browser`/`os`/`deviceType`
diturunkan server lewat `parseUserAgent`. Klien yang tetap mengirim kedua
bentuk itu tidak merusak apa pun: nilainya dibuang di server, bukan
menimpa. Beacon di `src/components/admin-session-actions.tsx` juga berhenti
menyalin angka itu, jadi tidak ada lagi jalur peramban yang bisa menulis IP
ke tabel presence.

### 2.7 Route konteks terbuka ke semua origin saat allowlist kosong (sedang)

Ditemukan dan diperbaiki pada commit ini.

`buildContextCorsHeaders` memakai wildcard ketika
`ADMIN_CONTEXT_ALLOWED_ORIGINS` kosong. Wildcard berarti setiap situs di
internet dapat memanggil `POST /admin-gate/context` dari peramban pengunjung
dan membaca jawabannya: masked IP, kota, negara, dan token konteks milik
pengunjung itu sendiri. Bukti ukurannyaterta di
`tmp/qa-p91-http-evidence.json` dan `tmp/qa-p91-cors-allowlist-evidence.json`.

Wildcard itu sengaja ada waktu lalu, dengan alasan yang jujur: allowlist kosong
suka menyebabkan Security Desk kehilangan metadata IP. Perbaikannya bukan
menghapus wildcard, tapi meminta operator memilihnya:

| Allowlist | `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS` | Hasil |
|---|---|---|
| terisi | bebas | hanya origin di daftar; asing tidak mendapat apa pun |
| kosong | `"true"` | wildcard tanpa credentials (perilaku lama, atas permintaan) |
| kosong | kosong atau nilai lain | **tidak ada** `access-control-allow-origin` |

Penegakan sengaja tidak bergantung pada `NODE_ENV`. Dokumentasi Convex tidak
menjamin variabel itu ada di setiap deployment, jadi menjadikannya penentu
"ini produksi" adalah cara yang rapi untuk tidak menegakkan apa pun. Ada test
yang menjaga `http.ts` tidak boleh membaca `NODE_ENV` sama sekali.

Konsekuensi yang harus diterima pemilik: sampai `ADMIN_CONTEXT_ALLOWED_ORIGINS`
diisi, panel "Sesi Anda" tidak lagi menampilkan IP. Itu kehilangan metadata,
bukan kebocoran.

### 2.8 Route konteks tanpa batas permintaan (sedang)

`POST /admin-gate/context` adalah satu-satunya tempat di project yang bisa
membaca header permintaan, dan route itu publik. Setiap pemanggilannya
melakukan satu `resolveClientIp`, satu `sha256Hex`, satu pencarian geolokasi
(jika provider dikonfigurasi), dan satu write. Tidak ada batasnya.

Perbaikannya: `adminGate.contextRequestWindow` menghitung permintaan satu
sumber IP dalam jendela 60 detik dari baris `adminSecurityContexts` yang sudah
ada, memakai indeks baru `byIpHashCreatedAt`. Tidak ada tabel penghitung baru,
jadi tidak ada state yang bisa tidak sinkron, dan jejak permintaan ikut terhapus
sendiri bersama barisnya. Kunci hitungannya adalah `ipHash` yang dihitung
server, bukan nilai kiriman klien - kalau kunci bisa datang dari klien, batasnya
hanya hiasan. Di atas 30 permintaan dalam 60 detik jawabannya `429` dengan
`retry-after`, dan penolakan tidak pernah menggagalkan gerbang passcode.

### 2.9 Pola penolakan tidak pernah bisa dicatat dari dalam gerbang (temuan arsitektur)

Ditemukan dan dibuktikan pada commit ini. Ini menjawab pertanyaan yang sejak
awal menggantung di bagian 5.1: apakah aturan `privileged_call_denied` dan
`storage_reference_invalid` bisa disambungkan dari `access.ts`.

**Jawabannya: tidak, dan alasannya sudah dibuktikan**

Dua hal dicoba dan dua-duanya gagal. Keduanya sekarang terkunci oleh test, jadi
tidak akan dicoba ulang oleh orang berikutnya.

1. **Jejak di database tidak bisa ditulis dari mutation yang melempar.**
   Mutation Convex bersifat atomik: ketika handler melempar, seluruh perubahan
   di transaksi itu ikut dibuang - termasuk satu baris `securityDenyLog` yang
   ditulis satu baris sebelumnya. Test "bukti yang hilang" di
   `src/convex/access-denial-contract.test.ts` membuktikannya langsung: satu baris
   ditulis, error dilempar, baris itu diperiksa, hasilnya nol.
   Percobaan pertama (gerbang mencatat lalu melempar) terlihat benar saat dibaca
   dan tidak pernah complain saat berjalan, padahal jejaknya selalu hilang.
2. **`code` terstruktur mengubah yang dilihat pengguna.** `ConvexError({ code,
   message })` mengubah `message` menjadi JSON hasil `JSON.stringify`, jadi toast
   pengguna menerima `{"code":"ACCESS_DENIED",...}` alih-alih kalimatnya.
   `security-surface.test.ts` menangkapnya sebagai regression. `SESSION_REVOKED`
   boleh memakai bentuk itu karena sisi kliennya memang memeriksa `data.code`
   secara khusus; gerbang umum tidak.

Tiga pilihan yang tersisa, semuanya mengubah kontrak pemanggil dan tidak ada
yang dikerjakan diam-diam:

| Pilihan | Bentuknya | Kenapa belum |
|---|---|---|
| Kembalikan objek penolakan | Sudah dipakai di `users.changeStaffRole` dengan alasan yang sama tertulis di sana | Menerapkannya ke seluruh gerbang mengubah kontrak puluhan pemanggil sekaligus |
| Laporkan dari transaksi lain | Action lewat `runMutation`, atau klien lewat mutation pelaporan yang hanya menerima fakta milik pemanggil sendiri | Butuh wiring klien di provider Convex; tidak bisa diverifikasi tanpa peramban |
| Jalur yang mengembalikan nilai | `acceptStaffInvite` sudah seperti ini | Persis jalur yang sekarang terpasang |

Yang **berhasil** dipasang pada commit ini: `invite_token_invalid`. Jalur
`acceptStaffInvite` mengembalikan nilai, bukan melempar, jadi transaksinya selesai
dan jejaknya bertahan - perbedaan itu diuji langsung berdampingan dengan kasus
yang rollback. Infrastruktur untuk sisanya sudah siap: tabel `securityDenyLog`,
`noteSecurityDenial`, indeks per subjek, dan cron retensi. Yang belum adalah
sumber peristiwanya sendiri.

### 2.10 Penyimpanan menerima tipe aktif, dan peta blob tidak punya batas ukuran (sedang)

Bagian 10 master prompt menuntut lima hal: validasi metadata di server, MIME
yang tidak bisa dipercaya dari klien, batas ukuran, allowlist tipe gambar,
bukti privat yang tidak boleh jadi publik, storage id bebas yang tidak boleh
jadi URL publik, dan pemakaian indeks foto profil. Statusnya satu per satu:

| Syarat | Sebelum commit ini | Sekarang |
|---|---|---|
| Metadata dibaca dari storage, bukan dari klien | Sudah (`imageRejection`) | Tidak berubah |
| MIME tidak dipercaya dari klien | Sudah (baca `contentType` storage) | Tidak berubah |
| Batas ukuran | Ada di `users` dan `community`, **tidak ada** di `storage.recordUploadedBlob` | `imageRejection` di semua jalur |
| Allowlist tipe gambar | **Tidak ada**: `startsWith("image/")` menerima `image/svg+xml` | `ALLOWED_IMAGE_TYPES` |
| Bukti privat tidak jadi publik | Sudah (`vendors.getImageUrl` + `requireAssignablePhoto`) | Tidak berubah |
| Storage id bebas tidak jadi URL publik | Sudah, dua-duanya | Tidak berubah |
| Indeks foto profil | **Tidak dipakai**: `pruneOrphanStorage` memakai `.filter()` di atas seluruh tabel `users` | `withIndex("byProfileImageStorageId")` |

Dua temuan yang nyata di sana:

**`image/svg+xml` lolos ke storage milik kita.** SVG adalah dokumen, bukan
gambar: ia boleh memuat `<script>`, `onload`, dan `<foreignObject>`. Convex
menyajikan berkas storage lewat URL sendiri, jadi berkas seperti itu bisa
dieksekusi sebagai skrip di origin storage. Yang membuat ini praktis adalah
klien boleh mengunggah lewat `generateUploadUrl` biasa, lalu menempelkan
storageId-nya sendiri di mana saja - dan validasi di setiap tempat memakai fungsi
yang sama yang salah itu. Perbaikannya allowlist, bukan awalan. `gif`, `avif`,
`heic`, dan `heif` sengaja tetap diterima karena semuanya format raster yang
sudah menjadi perilaku berjalan dan tidak bisa membawa skrip.

**Peta blob tidak punya batas ukuran.** `recordUploadedBlob` hanya memanggil
`isStoredImage`, sehingga foto 200 MB tetap masuk peta. Baris peta dibaca
`pruneOrphanStorage` sebagai bukti "blob ini pernah dipakai jalur kita", jadi
satu unggahan raksasa menghasilkan sampah yang tidak akan pernah dipangkas -
dua masalah sekaligus: biaya storage, dan umur dari sampah.

Test regresi: `src/convex/storage.test.ts` ("peta menolak foto yang melebihi
batas ukuran" dan "peta menolak SVG meski awalan MIME-nya image/"), plus tiga
test di `src/lib/image-upload.test.ts`.

### 2.11 Enam permukaan publik membaca tanpa batas (sedang)

Bagian 11 master prompt menyebut `incrementClick`, `recordSearch`, `addReview`,
`submitFeedback`, pembuatan request, laporan, dan aksi notifikasi. Dua yang
pertama dan `submitFeedback` **sudah** punya plafon dari Fase 9 (plafon per jam
di `incrementClick`/`recordSearch`, kuota per akun dan kuota global di
`submitFeedback`). Yang tersisa adalah pola lain yang sama: **membaca seluruh
riwayat untuk menghitung atau menemukan sesuatu di ujung bars**.

| Fungsi | Sebelum | Batas sekarang | Batas keras |
|---|---|---|---|
| `community.listNotifications` | `.collect()` semua notifikasi, lalu sort dan potong | `.order("desc").take(limit)` | 100 baris |
| `community.markNotificationsRead` | `.collect()` semua, lalu patch semua yang belum dibaca | filter `read === false` di database, lalu `.take(200)` | 200 baris |
| `community.recordInteraction` | `.collect()` seluruh riwayat interaksi untuk cari duplikat 5 menit | `.order("desc").take(100)` | 100 baris |
| `community.createReport` | `.collect()` semua laporan target dan semua laporan pelapor | `.order("desc").take(50)` per irisan | 50 baris |
| `vendors.addReview` (kuota anonim) | `.collect()` semua ulasan listing untuk hitung kuota 3 per hari | `.order("desc").take(100)` | 100 baris |
| `community.createRequest` (fans-out) | Untuk tiap kandidat, `.collect()` semua notifikasi kandidat itu | `.order("desc").take(50)` per kandidat | 50 baris |

Yang paling serius adalah `markNotificationsRead`: satu akun dengan 20.000
notifikasi belum dibaca menghasilkan 20.000 tulisan dalam SATU transaksi, dan
transaksi yang gagal berarti semua penandaan hilang. Perbaikannya memfilter
`read === false` di dalam database dan membatasi 200 baris per panggilan;
panggilan berikutnya menutup sisanya, jadi tidak ada baris yang terkunci
selamanya.

Nilai balik `markNotificationsRead` berubah makna: dulu "jumlah seluruh
notifikasi milik pengguna", sekarang "jumlah baris yang benar-benar
ditandai". Pemanggil di `community-notification-center.tsx` mengabaikan nilai
itu, dan satu-satunya test yang memegangnya (`marked === 0` untuk anonim) tetap
benar.

Untuk keenam sisanya, bentuk indeks `byUser`/`byVendor` sudah terurut dari yang
terbaru, jadi `.order("desc").take(n)` mengembalikan baris yang **sama persis**
dengan sort-then-slice lama untuk kasus yang tidak melebihi n. Perbedaan hanya
muncul kalau history-nya memang lebih dari n, dan itu justru kasus yang tidak
boleh jadi mahal. Tidak ada satu pun kontrak pemanggil yang berubah, dan tidak
ada satu pun test lama yang perlu diubah atau di-`skip`.

Test regresi: dua test baru di `src/convex/reviews-notifications.test.ts`
(penandaan terbaca dibatasi 200 per panggilan dan menutup sisanya; inbox
memotong 5 baris dan mengurutkan dari yang terbaru).

### 2.12 Dua query publik terberat tanpa plafon pemindaian (rendah, performa)

Bagian 15 master prompt menyebut `vendors.listActive` dan
`community.listRequests` secara khusus. Keduanya memang sudah memotong hasil
sebelum memetakan baris (pemetaan beratnya sudah terbatas), tapi keduanya juga
membaca SELURUH kumpulan baris lebih dulu untuk bisa memfilter dan mengurutkan
di memori.

Keduanya kini punya plafon pemindaian: 2.000 listing aktif untuk katalog, dan
500 permintaan terbaru untuk papan. Angka 500 dipilih karena papan menampilkan
paling banyak 100 baris dan 500 baris terbaru selalu lebih dari cukup untuk
menghasilkan 30 hasil teratas yang sama.

Yang SENGAJA tidak dikerjakan: paginasi sungguhan. Menambahkannya berarti
mengubah produk - tombol "muat lagi" atau gulir tak hingga di katalog adalah
keputusan pemilik, bukan hasil audit. Konsekuensinya dicatat di bagian 11:
katalog masih satu permintaan penuh, hanya sekarang punya batas.

### 2.13 Audit seluruh permukaan publik, dan pivotnya dari dokumen ke test

Bagian 2 memuat temuan demi temuan. Yang belum pernah ada adalah
jawaban untuk pertanyaan "berapa banyak permukaan publik yang ada, dan
semuanya bergerbang?".-matrix di `docs/security/AUTHORIZATION-MATRIX.md`
m menjawabnya, tapi jawabannya berupa dokumen - dan dokumen tidak gagal
ketika ada `export const` baru yang ditambahkan tanpa gerbang. Audit berikutnya
harus menemukan ulang semuanya dari nol.

Hasil pemindaian kode: **113 fungsi publik**, 106 memanggil gerbang, 7 tidak.
Tujuh itu semuanya disengaja dan ketujuhnya sudah tertulis di bagian 3
matriks: tiga query baca katalog publik, satu bootstrap katalog, satu probe
konfigurasi, satu penghitung klik, satu pencatat pencarian.

Yang berubah adalah bentuk auditnya. `public-surface-audit.test.ts` memindai
`src/convex/*.ts` **pada saat test jalan**, lalu mensyaratkan setiap fungsi
publik untuk menyentuh gerbang yang dikenal ATAU ada di daftar pengecualian
yang alasannya ditulis di dalam test. Menambah endpoint publik tanpa
memperbarui audit sekarang menggagalkan CI, bukan menunggu temuan audit
berikutnya.

Empat pengaman tambahan di test yang sama: daftar pengecualian tidak boleh
menyimpan entri untuk fungsi yang sudah dihapus (entri basi membuat angka
audit terlihat benar padahal permukaannya berubah); setiap alasan wajib
memiliki isi nyata; dan setiap mutasi publik tanpa gerbang wajib menyebut
batasnya secara eksplisit, karena "publik" untuk baca saja wajar, sedangkan
"publik" tanpa batas adalah primitive tulis anonim.

Audit ini sudah diuji terhadap dirinya sendiri: sebuah mutasi publik tiruan
ditambahkan sementara, dan test gagal dengan nama fungsi, jenisnya, berkasnya,
langkah pemulihan, dan nomor baris yang harus diperbaiki.

**Satu temuan nyata dari audit ini.** `vendors.ensureCatalogSeeded` adalah
mutasi publik tanpa sesi yang dipanggil dari peramban SETIAP pengunjung saat
katalog masih kosong, dan - ini yang terlewat - ia adalah satu-satunya mutasi
publik di aplikasi ini yang TIDAK punya penjaga laju. Dia sudah punya idempotensi
dan batas 200 baris, jadi tidak bisa menyalahgunakan, tapi ribuan permintaan
anonim tetap membanjiri kuota baca/tulis deployment milik orang lain.
Sistemnya tidak butuh satu akses tulis untuk halogenasi. Sekarang ikut
`public_mutation_rate`, sama dengan mutasi publik lain.

### 2.14 Plafon pemindaian pada lima query yang tumbuh tanpa batas

Tujuh rantai `.collect()` tanpa batas ditemukan. Empat di antaranya adalah
pola yang sama: hasil akhirnya dipotong di memori, tapi pemindaiannya dulu
membaca SELURUH tabel. Tabel itu dipangkas cron atau tidak dipangkas sama
sekali, jadi biayanya naik seiring waktu.

| Fungsi | Tabel | interception | Plafon |
|---|---|---|---|
| `community.createRequest` | `vendors` | setiap request baru mencocokkan pemilik yang lokasinya cocok | 2.000 |
| `community.listInteractions` | `vendorInteractions` | riwayat penuh per pengguna, lalu diurutkan dan dipotong 100 | 500 |
| `vendors.listFavorites` | `favorites` | seluruh favorit, plus satu `db.get` per baris (N+1) | 500 |
| `whatsapp.getWhatsappStatus` | `whatsappDeliveries` | seluruh kiriman, lalu dipotong 5 | 50 |
| `vendors.listForAdmin` | `vendors` | seluruh katalog ke peramban pengelola | 2.000 |

**Kenapa `.take()` dan bukan `.order("desc").take()`.** Ini jebakan yang mudah
ditemukan. Indeks `byUser` pada tabel-tabel ini hanya memuat `userId`, tanpa
field waktu. `.order("desc")` pada indeks itu berarti "urutan indeks", bukan
"terbaru dulu". Menghapus `.collect()` lalu menambahkan `.order("desc")`terlihat
seperti optimasi, padahal ia membalik urutan tampil tanpa mengurangi satu
pun baris yang dibaca - biaya yang sama, hasil yang salah. Karena itu yang
dipakai hanya `.take()`: urutan di dalam memori dipertahankan, dan biaya
dibatasi.

Untuk riwayat yang tumbuh, ini trade-off yang diketahui, dan trade-off-nya
disengaja - di atas batas, hasil bisa lebih sedikit dari biasanya. Itu lebih
baik daripada satu query membaca puluhan ribu baris demi mengembalikan
ratusan.

**Yang SENGAJA tidak diberi plafon, dan alasannya.** Tujuh pembacaan penuh
tersisa adalah agregat dashboard admin (`community.listCommunityMetrics`,
`analytics.adminMetrics`) yang menghitung angka dari seluruh tabel. Memotongnya
dengan `.take()` tidak membuat halaman lebih cepat secara jujur - ia membuat
angka di dashboard MENYATAKAN ANGKA YANG SALAH dengan percaya diri penuh.
"K vastlyng" yang lebih lambat lebih baik daripada angka yang berbohong, dan
mengganti hitungan penuh dengan penghitung berjalur (pola yang sudah dipakai
`analyticsCounters` untuk peristiwa) adalah refactor lintas berkas yang
tidak bisa diverifikasi tanpa membuka panel admin di peramban.

Dua N+1 lain (`offers.listOwnerRequests`, `adminMetrics` yang menghitung
permintaan per vendor lewat satu query per vendor) sengaja tidak diubah pada
commit ini: menghilangkannya mengubah bentuk hasil atau jumlah dokumen yang
dibaca, dan kedua-duanya butuh verifikasi visual yang tidak tersedia di
lingkungan ini.

### 2.15 Satu test yang gagal sesekali, dan penyebab sebenarnya

`ciphertext yang dimanipulasi ditolak` gagal sekitar 1 dari 8 kali. Enkripsi
tidak pernah salah - testnya yang salah.

Test itu memutar karakter TERAKHIR dari ciphertext base64url. Pada base64,
kelompok terakhir bisa lebih pendek dari tiga byte, dan bit-bit yang tidak
terpakai di karakter terakhir dibuang saat dekode. Mengubah `A` menjadi `B` di
sana karena itu bisa menghasilkan byte yang PERSIS SAMA: yang di
"dimanipulasi" ternyata bukan manipulasi, dan dekripsi tetap berhasil - dengan
benar.

Terukur: dari 40 panjang ciphertext, 5 menghasilkan byte yang identik. Angka
12,5% itu cocok persis dengan gejala "sekali-sekali". Karakter PERTAMA aman
selalu, karena dia meng-encode 6 bit penuh yang langsung masuk ke byte
pertama. Test sekarang memutar karakter pertama dan lolos 5 kali berturut-
turut.

Yang membuat ini layak dicatat bukan hanya perbaikannya, tapi risikonya kalau
dibiarkan: test yang gagal sesekali melatih kita mengabaikan merah. Kalau
demikian, test ini akan dibiarkan atau di-`skip` - dan bersama testnya,
satu-satunya bukti bahwa GCM benar-benar menolak ciphertext yang diubah
ikut hilang.

---

## 3. Berkas dan Rentang Baris

### 3.1 Berkas yang diubah

| Berkas | Perubahan |
|---|---|
| `.gitignore` | Menambahkan `.env.keys`, `.env.keys.*`, `*.env.keys`, seluruh keluarga `.env.*`, dump rahasia (`*.secrets`, `deploy-prod.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`) |
| `src/main.tsx` | `RouteSyncer`: `trustedParentOrigins()` baru; pengiriman keluar dan penerimaan `navigate` memakai daftar putih; dilewati kalau tidak di iframe |
| `src/convex/community.ts` | Blok helper baris 86-146 diganti penyesuai tipis ke `./access`; handler `listRequests` memakai daftar putih; `staffAccess` dibaca sekali per halaman |
| `src/convex/vendors.ts` | Blok helper baris 36-98 diganti penyesuai tipis; `ensureCatalogSeeded` tidak lagi menulis ke baris yang ada; `alignSeededCoordinates` baru |
| `src/convex/schema.ts` | Tabel `securityIncidents` + 6 indeks |
| `src/convex/audit.ts` | Dua `AuditAction` baru |
| `src/convex/securityIncidents.ts` | Baru: `recordIncidentWithin`, `recordIncident`, `listIncidents`, `incidentSummary`, `acknowledgeIncident`, `resolveIncident`, `pruneIncidents` |
| `src/lib/request-dto.ts` | Baru: daftar putih DTO |
| `src/lib/request-dto.test.ts` | Baru: 13 test regresi |
| `src/lib/security-rules.ts` | Baru: katalog 9 aturan, agregasi, sanitasi bukti |
| `src/lib/security-rules.test.ts` | Baru: 21 test |
| `src/lib/catalog-store.ts` | `ServiceRequest.requesterId` dan `RequestOffer.offeredBy` dihapus dari tipe klien |
| `src/components/community-widgets.tsx` | `request.requesterId` diganti `request.isMine` |
| `src/convex/security-surface.test.ts` | Dua test diubah kontraknya |
| `src/convex/display-name-security.test.ts` | Satu test diubah kontraknya |
| `src/convex/adminGate.ts` | `consumeSecurityContextRow` baru; `reportSessionContext` server-authoritative; `contextRequestWindow` baru; `CONTEXT_REQUEST_LIMIT` |
| `src/convex/http.ts` | `resolveContextCorsMode` baru; fail-closed saat allowlist kosong; batas 30 permintaan/menit per IP dengan `429` |
| `src/convex/schema.ts` | Indeks `byIpHashCreatedAt` pada `adminSecurityContexts` |
| `src/components/admin-session-actions.tsx` | Beacon sesi hanya mengirim token dan device id |
| `src/convex/session-context-authority.test.ts` (baru) | 8 test: konteks sesi harus dari server |
| `src/convex/context-route-hardening.test.ts` (baru) | 11 test: CORS fail-closed + batas permintaan, diuji lewat `t.fetch` |
| `src/convex/http-cors-security.test.ts` | Satu test diubah kontraknya (wildcard jadi opt-in), tiga test baru |
| `src/convex/securitySignal.ts` (baru) | Penulis insiden dipisah dari operasi; `noteSecurityDenial` + tabel `securityDenyLog` |
| `src/convex/securityIncidents.ts` | Penulis insiden diekspor ulang; `pruneIncidents` ikut memangkas `securityDenyLog` |
| `src/convex/schema.ts` | Tabel `securityDenyLog` + 3 indeks |
| `src/convex/users.ts` | Penolakan klaim undangan dicatat sebagai pola (`invite_token_invalid`) |
| `src/convex/crons.ts` | Cron harian "retensi Security Desk" |
| `src/convex/access-denial-contract.test.ts` (baru) | 10 test: batasan transaksi Convex, gerbang tetap menolak, jalur return-only terdeteksi |
| `package.json` | `axios` (dependensi tak terpakai, 8 advisory high) dihapus; `@convex-dev/auth` 0.0.90 -> 0.0.96; `@auth/core` 0.41.3 ditambahkan eksplisit |
| `bun.lock` | `bun update` dalam rentang + lockfile yang sudah bersih |
| `package-lock.json` | **Dihapus.** Sudah menyimpang (lima dependensi langsung tidak ada di sana) dan tidak dipakai satu pun script; `bun.lock` jadi satu-satunya sumber kebenaran |
| `src/lib/image-upload.ts` | `ALLOWED_IMAGE_TYPES` baru (allowlist raster); `isStoredImage` memakai allowlist + normalisasi MIME, bukan awalan `image/` |
| `src/lib/image-upload.test.ts` | Tiga test baru: SVG ditolak, normalisasi huruf besar/spasi, allowlist hanya raster |
| `src/convex/storage.ts` | `recordUploadedBlob` memakai `imageRejection` (batas ukuran ikut ditegakkan); `pruneOrphanStorage` memakai indeks `byProfileImageStorageId` |
| `src/convex/storage.test.ts` | Dua test baru: batas ukuran peta blob, SVG ditolak |
| `src/convex/community.ts` | `listNotifications` dan `markNotificationsRead` dibatasi (filter di database); `recordInteraction`, `createReport`, `createRequest` memakai pemindaian terpotong; `listRequests` punya plafon `REQUEST_BOARD_SCAN` |
| `src/convex/reviews-notifications.test.ts` | Dua test baru: penandaan terbaca dibatasi, inbox terpotong dan terurut |
| `src/convex/vendors.ts` | `addReview` memakai pemindaian terpotong untuk kuota anonim; `listActive` punya plafon `CATALOG_SCAN` |

### 3.2 Alasan tiap keputusan yang bisa dipertanyakan

**`requesterName` masih keluar.** Nama yang ditampilkan sudah melewati
`resolvePublicName`, yang memakai `users.publicName` atau tebakan dari email,
dan `email` mentah tidak pernah ikut. Papan permintaan tanpa nama pembuat
kehilangan gunanya, dan yang tersisa hanya nama panggilan yang sudah
dipisahkan dari akun.

**`canOffer` bukan otorisasi.** Ini hanya petunjuk tampilan. Otorisasi
sebenarnya tetap di `claimRequest`, yang memeriksa kepemilikan listing,
kategori, area layanan, dan klaim identitas. Menyebut ini eksplisit penting
supaya tidak ada yang memakainya sebagai gerbang.

**`ensureCatalogSeeded` tetap publik.** Permintaan awal adalah
`internalMutation` atau admin-only. Keduanya akan merusak produk:
`useCatalogSeedBootstrap` memanggilnya dari peramban setiap pengunjung saat
katalog kosong. Admin-only berarti deployment baru menampilkan katalog kosong
sampai ada admin yang kebetulan membuka `/admin` - dan yang paling butuh
katalog justru warga yang belum punya akun. Jadi yang diperbaiki bukan siapa
yang boleh memanggil, melainkan apa yang bisa dilakukan panggilan itu.

**Pesan penolakan `requireStaff` di `vendors.ts` ikut berubah** dari "Hanya
pengelola yang dapat mengakses ruang ini" menjadi "... melakukan tindakan
ini". Kalimatnya setara bagi pengguna, dan tidak ada test yang memeriksa
keduanya. Ini harga yang pantas untuk menghapus satu keputusan keamanan yang
bercabang.

---

## 4. Model Insiden

Tabel `securityIncidents` di `src/convex/schema.ts`. Fieldnya mengikuti
permintaan: `ruleKey`, `severity`, `status`, `subjectType`, `subjectRef`,
`userId`, `ipHash`, `ipMasked`, `sessionFingerprint`, `route`, `method`,
`count`, `firstSeenAt`, `lastSeenAt`, `evidence`, `createdAt`, `updatedAt`,
ditambah `acknowledgedBy/At`, `resolvedBy/At`, dan `resolutionNote` supaya
"sudah ditangani" bisa ditanyakan balik kepada orangnya.

**Satu baris per pola, bukan per kejadian.** `count` diperbarui, bukan
ditambahi berulang: nilainya berasal dari hitungan yang sudah dihitung
pemanggil atas data nyata, jadi membiarkannya bertambah sendiri akan membuat
angkanya menggelembung setiap kali fungsi ini dipanggil untuk sinyal yang
sama. Percobaan beruntun 10.000 kali menghasilkan satu baris.

**Tingkat hanya boleh naik.** Kalau insiden yang sama kembali dengan hitungan
lebih kecil, itu bukan alasan menurunkan kewaspadaan.

**Insiden yang sudah `resolved`/`suppressed` tidak dihidupkan lagi.** Kejadian
yang sama setelah ditutup adalah insiden baru, dan itu satu-satunya cara
operator tahu bahwa masalah yang dikira selesai ternyata kembali.

### 4.1 Yang tidak boleh masuk tabel

Ditegakkan mekanis oleh `sanitizeEvidence` dan `assertSafeEvidence` di
`src/lib/security-rules.ts`: passcode, password, access/refresh/id token,
`Bearer`, cookie, header `Authorization`, nomor telepon mentah, email, secret
provider (`sk_`, `pk_`, `whsec_`, `EAAG`, `vcp_`), dan kunci privat.

IP tidak pernah disimpan apa adanya. Yang ada `ipHash` (untuk mengelompokkan
tanpa bisa dibalik) dan `ipMasked` (`103.47.x.x`). IP mentah hidup hanya
selama satu permintaan HTTP.

`resolutionNote` juga disanitasi: ini kolom bebas yang dibaca manusia di
panel, jadi ia adalah jalur masuk yang sama berbahayanya dengan `evidence`.

### 4.2 Sembilan aturan

| Aturan | Ambang / jendela | Tingkat dasar | Respons |
|---|---|---|---|
| `admin_passcode_failures` | 5 / 15 menit | high | rate_limit |
| `admin_lockout_threshold` | 1 / 60 menit | critical | alert |
| `storage_reference_invalid` | 10 / 10 menit | medium | record |
| `privileged_call_denied` | 5 / 10 menit | high | record |
| `public_mutation_rate` | 60 / 1 menit | medium | rate_limit |
| `webhook_signature_failure` | 3 / 10 menit | critical | alert |
| `invite_token_invalid` | 10 / 15 menit | medium | rate_limit |
| `session_device_change` | 2 / 30 menit | medium | revoke_session |
| `endpoint_error_burst` | 20 / 5 menit | high | alert |

Pelipatan: 2x ambang dan 4x ambang masing-masing menaikkan satu langkah,
dibatasi `maxSeverity`. `storage_reference_invalid` dibatasi `high` karena
rujukan storage salah memang sering terjadi pada pengunjung sah, dan sinyal
yang sering muncul wajar tidak boleh berubah menjadi `critical`.

Argumen untuk tiap ambang ada di kolom `rationale` dan ikut ditampilkan di
panel, supaya operator tahu harus apa tanpa membaca kode.

---

## 5. Sisa Pekerjaan, Berurutan Menurut Nilai

Ini bukan daftar keinginan; ini urutan yang saya sarankan kalau hanya ada
waktu untuk tiga hal.

### 5.1 Menyambungkan sisa aturan ke titik pemicunya (P1, nilai tertinggi)

**Tujuh dari sembilan sudah tersambung** dan diuji.

| Aturan | Pemicu | Cara kerja |
|---|---|---|
| `admin_passcode_failures` | `adminGate.recordAttempt` | Menghitung kegagalan di jendela lewat indeks `byKeyCreatedAt`, satu pembacaan |
| `admin_lockout_threshold` | `adminGate.recordAttempt` (outcome `locked`) | Ambang satu; kunci penuh tidak punya alasan sah |
| `webhook_signature_failure` | `http.ts::reportWebhookIssue` | Menjumlahkan `occurrences` laporan error webhook ber-sidik-jari sama di jendela aturan |
| `invite_token_invalid` | `users.acceptStaffInvite` saat klaim ditolak | Satu baris kecil per penolakan di `securityDenyLog`, dihitung per ember, satu insiden saat ambang terlampaui |

Tiga aturan disambungkan pada commit ini (FASE 10):

| Aturan | Titik pemicu | Cara kerja |
|---|---|---|
| `public_mutation_rate` | `community.createRequest`, `community.recordInteraction` | Penghitung berjalan per akun di `securityRateCounters`, satu baris per (subjek, jendela) |
| `session_device_change` | `adminGate.reportSessionContext` saat `isNewSession` | Penghitung yang sama; ambang 2 per 30 menit |
| `endpoint_error_burst` | `http.ts::reportWebhookIssue`, untuk SETIAP masalah | Menjumlahkan `occurrences` dari `errorReports` per fitur di jendela aturan |

Untuk dua yang pertama, penghitung BARU (`securityRateCounters`) dibuat karena
keduanya butuh JUMLAH kejadian dalam jendela, dan menghitung ulang dari log
mentah setiap kali berarti satu pemindaian per kejadian - persis yang tidak
boleh terjadi di jalur yang sedang diserang. Jendelanya dipotong ke dalam
`key`, dan baris jendela lama dihapus saat jendela baru dimulai, jadi tabelnya
sebesar jumlah subjek, bukan jumlah jendela.

Yang tersisa, dengan status jujur masing-masing:

| Aturan | Titik pemicu | Kenapa belum tersambung |
|---|---|---|
| `privileged_call_denied` | `access.ts::requireStaff`, `requireManagementViewer`, `requireVendorManager`, `requireProvenIdentity` | **Terbukti mustahil dari dalam gerbang** - lihat 2.9 |
| `storage_reference_invalid` | `access.ts::requireAssignablePhoto` | Idem |

Kedua sisanya sengaja TIDAK disambungkan lewat jalan pintas. Batasnya kini
terkunci test di `src/convex/detection-wiring.test.ts` ("aturan yang terbukti
tidak bisa disambungkan") supaya tidak ada yang mengira keduanya sedang
berjalan.

**Keputusan arsitektur yang menggantung sudah terjawab oleh bukti, bukan oleh
preferensi.** Pertanyaan aslinya adalah "`denied()` atau `deniedWith(ctx)`?".
Jawabannya: keduanya salah, dan alasannya ada di 2.9 - mutation yang melempar
membuang seluruh tulisannya, jadi "catat lalu tolak" menghasilkan jejak yang
selalu hilang tanpa pernah complain. Pendekatan itu sudah dicoba, diuji, dan
ditarik kembali.

Yang sudah disiapkan supaya pekerjaan ini murah ketika keputusan diambil:

- `securitySignal.noteSecurityDenial` - menulis satu baris kecil per penolakan,
  menghitungnya per subjek lewat indeks komposit, lalu mencatat insiden hanya
  di atas ambang. Tidak pernah melempar.
- Tabel `securityDenyLog` dengan `bySubjectCreatedAt`, `byRuleCreatedAt`, dan
  `byCreatedAt`.
- Cron harian "retensi Security Desk" yang memangkas insiden yang sudah ditutup
  dan penghitung yang sudah lewat jendela aturan, tanpa pernah menyentuh
  insiden yang masih terbuka.

Tiga pilihan yang tersisa, semuanya mengubah kontrak pemanggil:

1. Mutation mengembalikan objek penolakan alih-alih melempar. Sudah dipakai di
   `users.changeStaffRole` dengan alasan yang sama tertulis di sana.
2. Melaporkan dari transaksi lain: action lewat `runMutation`, atau klien lewat
   mutation pelaporan yang hanya menerima fakta milik pemanggil sendiri. Ini
   satu-satunya pilihan yang tidak mengubah perilaku mutation mana pun, tetapi
   menyentuh provider Convex dan tidak bisa diverifikasi tanpa peramban.
3. Membiarkan dua aturan itu tidak aktif, dengan batasnya tertulis di sini dan
   dikunci test agar tidak ada yang mengira ia sudah berjalan.

### 5.2 Privasi nomor WhatsApp (P1, "harder to scrape") - SEBAGIAN SELESAI

> **Status setelah commit ini.** KEDUA bagian sudah dikerjakan. Nomor USAHA
> tidak lagi dikirim mentah ke katalog publik (lihat 5.2a), dan nomor pribadi
> warga sekarang disimpan terenkripsi dengan kunci server, dicari lewat kunci
> HMAC, dan ditampilkan tersamar ke admin (lihat 5.2b). Yang tersisa hanyalah
> langkah operasional: pemilik harus memasang kunci, lalu menjalankan urutan
> migrasi yang tertulis di 9.2.

#### 5.2a Yang sudah dikerjakan: nomor usaha tidak lagi bocor

**Bukti kebocorannya.** `toPublicCatalogVendor` di `src/convex/vendors.ts`
mengembalikan `phone` mentah, dan dipanggil oleh `listActive` serta
`getBySlug` - keduanya query publik tanpa login. Satu permintaan anonim ke
`listActive` mengembalikan nomor SETIAP listing aktif. HTTPS tidak menolong:
yang meminta memang dialing sendiri ke endpoint yang memang publik.

**Yang diganti.**

| Sebelum | Sesudah |
|---|---|
| `phone` (penuh) di DTO publik | `contactRef` (opaque 128 bit) + `phoneMasked` |
| `<a href={generateWhatsAppLink({phone})}>` | `<button>` yang meminta handoff ke server |
| `tel:${vendor.phone}` di DOM | `telUrl` dari handoff, hanya setelah diklik |
| `telephone` di JSON-LD | dihapus |
| `generateWhatsAppLink` | dihapus dari repo |

**Alur baru.**

```
katalog publik  -> contactRef (cr1_ + 128 bit acak)
tekan tombol    -> vendors:getContactHandoff
                      1. bentuk contactRef (regex, sebelum sentuh DB)
                      2. listing masih `active`
                      3. kuota laju (per akun; per contactRef bila tanpa identitas)
                      4. jejak di analyticsEvents (tanpa nomor, tanpa teks pesan)
                   -> URL wa.me + telUrl
peramban        -> membuka URL; nomor tidak pernah mendarat di state
```

**Kenapa `contactRef` dan bukan HMAC nomor.** Rancangan awal menyebut HMAC
dengan kunci server. Yang dipakai sebenarnya 128 bit dari
`crypto.randomUUID()`.
Alasannya: pegangan acak memberi sifat anti-panen yang sama (tidak bisa
ditebak, tidak bisa dipetakan tanpa memegang respons yang sah) TANPA
menambah satu pun rahasia yang harus diisi operator. Kunci HMAC yang belum
diisi akan mematikan tombol WhatsApp untuk semua orang; pegangan acak tidak
pernah punya keadaan gagal seperti itu. Pegangan juga sengaja TIDAK
diturunkan dari nomor: kalau begitu, mengganti nomor mematikan semua tautan
yang sudah dibagikan orang.

**Kuota tidak mematikan produk.** `getAuthUserId` bersifat OPSIONAL di
handoff. Pengunjung yang sesinya belum terbentuk tetap bisa menekan tombol.
Menolak mereka demi "batas laju" menukar risiko kecil dengan tombol mati -
regresi yang jauh lebih mahal. Tanpa identitas, kuota ditegakkan per
`contactRef`, yang cukup karena pegangan itu sendiri tidak bisa ditebak.

**Jejak.** `recordEvent({ event: "contact_handoff" })` mencatat intent dan
listing. Nomor dan teks pesan TIDAK masuk apa pun - termasuk ke
`analyticsEvents`, yang dibaca dashboard admin.

**Migrasi.** `vendors:backfillContactRefs` (internal, idempoten) mengisi
listing aktif yang `contactRef`-nya kosong. Listing yang sudah punya
pegangan tidak pernah disentuh, jadi tautan yang sudah dibagikan tetap
hidup. Bekerjaannya dipotong 200 baris per panggilan.

**Yang masih jujur untuk disebut:** skema `tel:` tidak punya jalur
server-side - URL-nya harus sudah ada sebelum diklik. Jadi nomor tetap
sampai ke peramban untuk tombol TELEPON, tapi hanya setelah pengguna
menekan, lewat jalur yang sudah dibatasi kuotanya dan tercatat jejaknya.
Yang bisa dipanen adalah respons katalog, dan itu tidak lagi memuat nomor.

**Regresi:** 15 test di `src/convex/contact-handoff.test.ts` (happy path,
anonymous, bentuk salah, ref tak dikenal, draft/archived, tanpa ref, nomor
tidak valid, kuota, pembersihan otomatis, anti-spam, jejak, backfill
idempoten) plus `public-data-surface.test.ts` B2 yang mengunci `phone`
tidak boleh muncul di `listActive` maupun `getBySlug`, dan
`listing-metadata.test.ts` yang mengunci `telephone` tidak boleh muncul di
JSON-LD.

**Yang TIDAK terverifikasi:** apakah tombolnya masih bisa ditekan setelah
mengubah `<a>` menjadi `<button>`. Analisisnya cocok, tapi
lingkungan ini tidak punya peramban (bagian 1.3). Inilah refaktor yang
sebelumnya ditolak karena tidak bisa diverifikasi - sekarang dikerjakan
dengan pengaman yang berbeda: galat handoff selalu jadi toast, tab kosong
selalu ditutup, dan tidak ada jalur yang kembali diam-diam ke nomor di
klien.

#### 5.2b Yang SUDAH: nomor pribadi warga terenkripsi

Tiga field yang tadinya polos sekarang menyimpan ciphertext:

- `notificationPreferences.whatsappPhoneEnc` + `whatsappPhoneKey`
- `listingClaims.whatsappPhoneEnc` + `whatsappPhoneKey`
- `whatsappThreads.phoneEnc` + `phoneKey`

Kolom polos lama (`whatsappPhone`, `phone`) **tidak dihapus** oleh migrasi.
Pengosongannya adalah langkah terpisah yang dijaga, dan itu disengaja - lihat
"kenapa kolom polos masih ada" di bawah.

**Kunci.** Satu variabel, `PHONE_DATA_KEY`, berisi 32 byte base64
(`openssl rand -base64 32`). Dari master key itu diturunkan dua kunci
terpisah lewat HKDF-SHA256: satu untuk AES-GCM-256, satu untuk HMAC-SHA256
untuk pencarian. Satu variabel env berarti satu rahasia yang harus dipasang,
bukan dua yang bisa saling lupa.

Dua kunci turunan itu tidak bisa saling menggantikan, dan itu diuji - kalau
salah derivasi, `decryptPhone` dengan kunci HMAC akan gagal diam-diam pada
semua baris, dan gejala yang muncul bukan "kunci salah" melainkan "semua nomor
warga tidak terbaca".

**Pencarian.** Indeks `byPhone` tidak lagi jadi jalur utama: `findByPhoneKey`
mencari lewat HMAC 128-bit yang dipotong dan diberi prefiks `bkp1.`. Indeks
`byPhone` lama dipakai sebagai jaring pengaman untuk baris yang belum
dimigrasi, jadi urutan yang salah tidak langsung membuat nomor hilang.

Formatnya `bk1.<iv>.<ciphertext>` (base64url). `isEncryptedPhone` mengenali
format ini, sehingga `readStoredPhone` bisa membaca ciphertext dan jatuh ke
kolom polos untuk baris lama tanpa menebak.

**Kegagalan yang paling berbahaya, dan bagaimana bentuknya.** Kegagalan
enkripsi yang paling umum bukan "dekripsi gagal", tapi "kunci tidak ada, jadi
sistem menyimpan polos sambil mengaku sudah mengenkripsi". Owner akan melihat
aplikasi normal, semua tes bisa lulus, dan database tetap polos. Karena itu
jalur tulis di sini **gagal terbuka**: tanpa `PHONE_DATA_KEY`, setiap mutasi
yang menyentuh nomor melempar, bukan menulis. Test `tanpa kunci, migrasi gagal
terbuka` mengunci perilaku itu - ia menolak hasil `migrated: 1, failed: 0`,
yang akan membuat pemilik yakin migrasi berjalan padahal tidak ada yang
terjadi.

**Kenapa kolom polos masih ada.** Migrasi menulis ciphertext di samping nomor
lama dan tidak mengosongkan kolom itu. Alasannya: menghapus kolom polos di
langkah yang sama dengan mengenkripsi berarti satu transaksi menentukan apakah
data Anda masih ada atau tidak. Kalau migrasi gagal di tengah jalan, nomor
warga hilang dan tidak bisa dipulihkan. `clearLegacyPlainPhones` karena itu
adalah mutasi TERPISAH yang menolak berjalan selama masih ada baris polos, dan
hanya pemilik yang menjalankannya setelah `report` menunjukkan nol. PII yang
tidak bisa dipulihkan tidak boleh dihapus oleh skrip yang mungkin salah
dipanggil.

**Migrasi.** `src/convex/phoneMigration.ts`, semua fungsi `internal*` sehingga
tidak terjangkau peramban. Semuanya dibatasi 500 baris per panggilan dan
idempoten: baris yang sudah punya ciphertext dilewati, bukan dienkripsi ulang.
Mengenkripsi ulang akan membakar kuota tulis dan, kalau kuncinya berganti,
membuat baris lama tidak bisa terbaca. Urutan jalannya ada di 9.2.

**Tampilan admin.** `listClaimStatus` sekarang mengembalikan DTO eksplisit
(masked, tanpa ciphertext dan tanpa kunci) alih-alih baris mentah.
Audit `submitClaim` mencatat `whatsappPhoneMasked`, bukan nomor mentah.

15 test di `src/convex/phone-encryption.test.ts`, termasuk yang menguji bahwa
ciphertext tidak memuat nomor, bahwa manipulasi DITOLAK, dan bahwa kunci
yang salah tidak bisa mendekripsi.

#### 5.2c Catatan lama (rencana sebelum dikerjakan)

**Ini permintaan yang paling langsung menjawab "harder to scrape", dan yang
paling belum tersentuh.**

Saat ini `toPublicCatalogVendor` di `src/convex/vendors.ts` mengembalikan
`phone` mentah di DTO publik `listActive` dan `getBySlug`. Nomor itu sampai ke
peramban dan bisa dipanen dari satu permintaan HTTP tanpa pernah membuka
halaman.

Blast radiusnya sudah saya petakan: 12 titik di frontend membaca
`vendor.phone`:

- `src/pages/Landing.tsx:81`
- `src/pages/VendorProfile.tsx:108, 178, 185, 192, 396, 418, 594`
- `src/components/community-widgets.tsx:338, 774`
- `src/pages/Dashboard.tsx:158, 498, 681`
- `src/lib/catalog-data.ts:31, 37, 50` (skor kelengkapan listing - fungsi murni)
- `src/lib/listing-metadata.ts:95` (JSON-LD `Organization.telephone` - kanal
  panen terstruktur)

Rencana migrasi:

1. DTO publik: buang `phone`, tambahkan `contactRef` (HMAC deterministik dari
   `vendor._id` dengan kunci server) dan `phoneMasked` (`0812 xxxx 345`).
2. Action baru `vendors.getContactHandoff({ contactRef, intent, reference })`:
   memvalidasi listing masih `active`, memeriksa kebijakan kontak, membatasi
   laju per pemanggil, lalu mengembalikan URL `wa.me` sekali pakai.
3. `catalog-data.ts`: skor kelengkapan tidak boleh bergantung pada nomor;
   pakai keberadaan `contactRef`.
4. `listing-metadata.ts`: hapus `telephone` dari JSON-LD. Membiarkannya berarti
   nomor tetap bisa dipanen meski DTO sudah bersih.
5. Tujuh titik lainnya: ubah dari `generateWhatsAppLink({ phone })` menjadi
   tombol yang menunggu handoff.

**Kenapa belum dikerjakan.** Langkah 5 menyentuh CTA utama produk (tombol
WhatsApp) di tujuh tempat, dan saya tidak punya peramban untuk memverifikasi
bahwa tombolnya masih bekerja. Mengirim refaktor itu tanpa verifikasi berarti
menukar kebocoran nomor dengan tombol mati - dan tombol mati adalah regresi
yang lebih mahal. Urutannya benar, tapi butuh satu turn khusus dengan
verifikasi visual.

Untuk data pribadi: `notificationPreferences.whatsappPhone`,
`listingClaims.whatsappPhone`, dan `whatsappThreads.phone` semuanya masih
tersimpan apa adanya. Enkripsi application-layer, HMAC lookup, dan tampilan
tersamar untuk admin belum dikerjakan. Schema sudah punya indeks `byPhone` di
`notificationPreferences` dan `whatsappThreads` yang harus diganti menjadi
indeks atas kunci HMAC saat migrasi.

### 5.3 Integritas Security Desk dan CORS fail-closed (P1)

SELESAI pada commit ini. Rinciannya ada di 2.6, 2.7, dan 2.8; ringkasannya:

1. **Konteks sesi sekarang server-authoritative.** `token` pada
   `reportSessionContext` akhirnya dikonsumsi, dan nilai jaringan apa pun yang
   dikirim klien dibuang di server, bukan dipercaya. `browser`, `os`, dan
   `deviceType` diturunkan dari user agent yang dibaca server.
2. **CORS fail-closed.** Allowlist kosong berarti tidak ada
   `access-control-allow-origin` sama sekali, kecuali operator mengaktifkan
   `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS=true` secara eksplisit. `Vary: Origin`
   dan `x-content-type-options: nosniff` ada di semua mode, termasuk respons
   `429`.
3. **Batas permintaan.** 30 permintaan per menit per sumber IP, dihitung dari
   baris konteks yang sudah ada, dijawab `429` dengan `retry-after`, dan tidak
   pernah menggagalkan gerbang passcode.

Yang tersisa dari bagian ini: `ADMIN_CONTEXT_ALLOWED_ORIGINS` harus diisi di
deployment prod (bagian 9.1). Tanpa itu, panel "Sesi Anda" menampilkan
"Tidak terdeteksi" untuk IP - degraded, bukan bocor.

### 5.4 Sisanya

- **Security header (bagian 8).** Harus dipasang di lapisan deployment
  (Freebuff/Vercel + Convex), bukan di kode aplikasi. HSTS, CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, dan
  proteksi clickjacking. CSP harus dibangun dari dependensi nyata; jangan
  menambahkan `unsafe-inline`/`unsafe-eval` tanpa alasan tertulis.
- **Storage (bagian 10).** `requireAssignablePhoto` sudah kuat. Yang belum
  diaudit: `src/convex/storage.ts` dan `src/lib/image-upload.ts`.
- **Abuse hardening (bagian 11).** `incrementClick`, `recordSearch`,
  `addReview`, `submitFeedback`, `request`, `reports`, notifikasi. Sebagian
  sudah punya batas (F-12 di `submitFeedback`).
- **Performa (bagian 15).** Paginasi dan indeks untuk `vendors.listActive`,
  `community.listRequests`, metrik admin, pencarian penerima notifikasi.
- **QA responsif (bagian 12), integritas tombol (13), sinkronisasi rute (14).**
  Butuh peramban. Lihat bagian 10 di bawah.
- **Dependency (bagian 16).** **SELESAI** - lihat bagian 8. Yang tersisa hanya
  dua rantai transitif (`@grpc/grpc-js` lewat lapisan compat Firebase yang
  tidak diimpor, dan `undici` lewat `@vly-ai/integrations`), keduanya tidak
  ditutup paksa karena butuh lompatan major pada rantai yang tidak bisa
  diuji dari lingkungan ini.

---

## 6. Checklist Rotasi Rahasia

`.env.keys` memuat kunci privat Dotenvx, dan kunci itu bisa mendekripsi seluruh
nilai terenkripsi di keluarga `.env`. **Perlakukan seluruh isi `.env` sebagai
kompromi.** Saya tidak bisa membaca, mencetak, atau memutar nilai itu dari
sini; yang berikut harus dijalankan pemilik proyek.

| # | Rahasia | Tindakan | Kenapa |
|---|---|---|---|
| 1 | Kunci privat Dotenvx (`.env.keys`) | Cabut dan ganti | Bisa mendekripsi semua yang lain |
| 2 | `WHATSAPP_APP_SECRET` | Rotasi di Meta, lalu perbarui di Convex prod | Dipakai HMAC webhook Meta |
| 3 | Token Twilio auth | Rotasi di Twilio | Dipakai HMAC webhook Twilio |
| 4 | `WHATSAPP_ACCESS_TOKEN` | Rotasi di Meta | Mengirim pesan atas nama bisnis |
| 5 | Token Vercel (`vcp_...`) | Revoke di Vercel, buat baru | Akses deployment |
| 6 | Kunci Firebase / service account | Rotasi di Firebase console | Autentikasi pengguna |
| 7 | `STAFF_BOOTSTRAP_EMAILS` | Hapus variabelnya setelah admin pertama ada | Jalan masuk tanpa undangan |
| 8 | Passcode admin | Ganti dari `/admin` (rotasi sudah ada di aplikasi) | Semua tiket lama gugur lewat `generation` |
| 9 | `SITE_URL` prod | Ubah dari `rare-scorpion-625.convex.site` ke `focused-lemur-389.convex.site` | Nilai lama menunjuk deployment yang salah |

Langkah wajib yang tidak bisa saya kerjakan:

```bash
# 1. Periksa riwayat Git (diblokir di lingkungan ini)
git log --all --full-history -- .env.keys
git log --all -p -- .env.keys | head -100

# 2. Bersihkan riwayat kalau terbukti pernah ter-commit.
#    Ini menulis ulang riwayat dan memaksa semua orang meng-clone ulang.
#    JANGAN jalankan tanpa persetujuan eksplisit.
git filter-repo --path .env.keys --invert-paths

# 3. Pasang penjaga di CI supaya terulang tidak mungkin.
#    Contoh untuk GitHub Actions:
#      - uses: gitleaks/gitleaks-action@v2
```

Yang sudah saya kerjakan: `.gitignore` sekarang memblokir `.env.keys`,
seluruh keluarga `.env.*` (kecuali `.env.example`), dan semua bentuk dump
rahasia. Sebelum ini, satu `git add -A` sudah cukup membawa kunci itu masuk.

**.env.keys yang hilang dari working tree BUKAN bukti masalahnya selesai.**
Riwayat Git publik tetap menyimpan apa pun yang pernah ter-commit.

---

## 7. Matriks Peramban dan Perangkat

**Tidak ada satu pun baris di tabel ini yang bisa saya isi dengan jujur.**

Lingkungan ini tidak punya peramban. `bunx vite build` juga diblokir platform
(`"do not start, restart, kill, or background server processes"`), jadi bahkan
analisis bundle produksi lokal tidak mungkin. Yang bisa saya lakukan hanyalah
memeriksa bundle prod yang sudah tayang lewat probe HTTP, dan itu bukan
verifikasi visual.

| Mesin | Lebar | 320 | 360 | 390 | 430 | 768 | 1024 | 1280 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|---|---|---|
| Chromium desktop | | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM |
| Firefox desktop | | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM |
| WebKit desktop | | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM |
| Android (Chromium) | | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM |
| iPhone (WebKit) | | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM | BELUM |

Kondisi yang juga belum diuji: loading, empty, error, offline/reconnect, konten
panjang, keyboard terbuka, modal, drawer, `prefers-reduced-motion`, teks besar,
kontras tinggi, lanskap, dan `safe-area`.

Cakupan Playwright yang ada saat ini ada di `e2e/main-flow.spec.ts` dan
`e2e/flows.spec.ts`. Keduanya belum diperluas.

**Kondisi yang perlu disebut terpisah.** Perbaikan tinggi dialog admin
(`height: fit-content`, `translate: 0`) sudah ada di kode dan di bundle dev,
tetapi **belum tayang di produksi**. Probe `tmp/qa-prod-dialog-verify.mjs`
terhadap prod melaporkan 9/11 PASS, dengan dua FAIL yang persis sesuai:
"Tinggi dialog mengikuti isi" dan "CSS memuat lebar sempit dialog konfirmasi
(26rem)". Artinya: dialog yang terlihat terlalu tinggi pada tangkapan layar
pengguna berasal dari bundle lama. Setelah `npx convex deploy --env-file
deploy-prod.env` dan publish ulang, kedua FAIL itu akan hilang.

---

## 8. Postur Dependensi

Sudah diaudit pada commit ini. Bukti mentahnya: `tmp/qa-p10-bun-audit.txt`
(Sebelum), `tmp/qa-p16-bun-audit-final.txt` (sesudah).

### 8.1 Angka

| | Sebelum | Sesudah |
|---|---:|---:|
| Total kerentanan | 46 | **15** |
| Critical | 1 | **0** |
| High | 26 | 4 |
| Moderate | 17 | 7 |
| Low | 2 | 4 |
| Dependensi langsung yang rentan | 3 (`axios`, `react-router`, `hono`) | **0** |

### 8.2 Yang dikerjakan

1. **`axios` dihapus dari `package.json`.** Ia adalah dependensi langsung dengan
   sebelas advisory (delapan high), tapi **tidak diimpor satu pun berkas pun** di
   `src/`, `e2e/`, atau `scripts/`. Dependensi yang tidak dipakai bukan hanya
   repot: ia tetap masuk audit, menarik pohon transitifnya, dan memberi kesan
   ada jalur HTTP yang tidak ada.
2. **`bun update` dalam rentang yang sudah dideklarasikan.** Semua paket
   diperbarui ke versi tertinggi yang masih diizinkan `^` di `package.json` -
   tidak ada lompatan major. Ini yang menutup `react-router` (CSRF RSC),
   `postcss`, `nanoid`, `brace-expansion`, `js-yaml`, dan `baseline-browser-mapping`.
3. **`@auth/core` dinaikkan ke 0.41.3 dan `@convex-dev/auth` ke 0.0.96.** Ini
   satu-satunya advisory **critical** di daftar awal: normalizer email Auth.js
   memvalidasi alamat sebelum normalisasi Unicode, sehingga tanda `@` homoglif
   bisa melewati validasi. Yang penting di sini: `@auth/core` adalah **peer
   dependency** `@convex-dev/auth`, jadi versinya memang dikontrol kita -
   tetapi rentang peer `@convex-dev/auth@0.0.90` hanya menerima `^0.37.0`.
   `@convex-dev/auth@0.0.96` memperlebar peer itu ke `^0.41.1`, jadi kombinasi
   di atas adalah kombinasi yang didukung vendor, bukan Dipaksa. Jalur auth
   tetap terverifikasi: `invites.test.ts` menerbitkan sesi sungguhan lewat
   `auth:store` dengan kunci RSA asli, dan `firebase-auth-security.test.ts`
   menguji provider-nya.
4. **`package-lock.json` dihapus.** Dua lockfile adalah dua sumber kebenaran,
   dan yang ini memang sudah menyimpang: lima dependensi langsung yang ada di
   `package.json` (`firebase`, `@playwright/test`, `convex-test`, `vitest`,
   `@edge-runtime/vm`) tidak ada di dalamnya. Tidak ada script, workflow, atau
   berkas yang memanggil `npm ci`/`npm install`, dan `bun install
   --frozen-lockfile` sekarang lulus tanpa perubahan. Sumber kebenaran:
   `bun.lock`.

### 8.3 Yang tersisa, dan kenapa tidak ditutup paksa

| Paket | Advisory | Asal | Alasan tidak ditutup |
|---|---|---|---|
| `@grpc/grpc-js@1.9.16` | 1 high, 1 low | `firebase > @firebase/firestore-compat > @firebase/firestore` | Lapisan *compat*, dan `src/` tidak mengimpor `firebase/compat/*` sama sekali - paket ini tidak masuk bundel peramban. Memaksa versi lewat `overrides` berisiko merusak pemuatan modul Firebase yang sedang dipakai. |
| `undici@5.29.0` | 4 high, 7 moderate, 1 low | `@vly-ai/integrations > ai > @ai-sdk/provider-utils` | Integrasi toolbar Freebuff. `bun update` sudah mengambil versi `@vly-ai/integrations` tertinggi dalam rentang; sisanya butuh lompatan major pada rantai `ai`/`undici`, dan toolbar itu tidak bisa diuji dari lingkungan ini. |

### 8.4 Dependensi tidak terpakai yang lain

Dicek dengan pencarian impor di `src/`, `e2e/`, `scripts/`, dan berkas akar:
`hono` (dipakai hanya `main.ts`, skrip Deno untuk menyajikan `dist/`),
`@jridgewell/trace-mapping`, `@oslojs/crypto` (sekarang ikut `@convex-dev/auth`),
dan `react-intersection-observer` tidak diimpor berkas mana pun. Semuanya tidak punya
advisory, jadi tidak dihapus pada commit ini: memangkasnya adalah kebersihan
manifest, bukan perbaikan keamanan, dan tidak perlu downtime.

### 8.5 Perintah yang dipakai

```bash
bun install --frozen-lockfile   # lulus, tanpa perubahan
bun update                      # dalam rentang, tidak ada major
bun audit                       # sebelum vs sesudah, tersimpan di tmp/
bun run test && bun run lint && bun tsc -b --noEmit
```

**Tidak ada paket yang ditambahkan untuk membungkam `audit`.** Perbaikan yang
benar adalah memperbarui atau menghapus, bukan menambal.

---

## 9. Perubahan Deployment dan Environment

### 9.1 Variabel lingkungan baru

| Variabel | Di mana | Wajib? | Kalau kosong |
|---|---|---|---|
| `VITE_PREVIEW_PARENT_ORIGIN` | Frontend (Vite) | Tidak | Telemetri rute tidak dikirim keluar sama sekali; perintah `navigate` tidak diterima |
| `ADMIN_CONTEXT_ALLOWED_ORIGINS` | Convex dev + prod | Ya untuk prod | Route konteks menutup lintas origin; panel "Sesi Anda" menampilkan "Tidak terdeteksi" untuk IP |
| `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS` | Convex dev (opsional) | Tidak | Semua origin closing; biarkan kosong |
| `WHATSAPP_APP_SECRET` | Convex prod | Sudah ada | Perlu rotasi (bagian 6) |
| `PHONE_DATA_KEY` | Convex prod | **Ya** | Setiap mutasi yang menyentuh nomor warga MELEMPAR. Tidak ada nomor polos baru yang ditulis, tapi prefs/klaim/thread BARU akan gagal tersimpan |

`PHONE_DATA_KEY` berisi **32 byte base64**. Buat dengan:

```bash
openssl rand -base64 32
```

Nilainya harus persis 32 byte setelah di-decode base64. Kunci yang lebih
pendek atau lebih panjang akan ditolak `phoneKeyMaterial`, dan karena itu
gagal dengan pesan yang menyebut panjangnya - bukan diam-diam memakai kunci
yang terpotong.

**Jangan ganti nilai ini setelah data terenkripsi sudah ada.** Kunci ini
bukan sandi login yang bisa diganti kapan saja. Mengganti kunci membuat
semua ciphertext lama menjadi tidak terbaca, dan nomor warga yang
sudah ada tidak punya salinan polos yang bisa dipulihkan setelah kolom polos
dikosongkan. Kalau kunci hilang, pemulihan harus lewat backup (bagian 9.2),
bukan lewat kode.

Nilai yang benar untuk frontend produksi:

```
ADMIN_CONTEXT_ALLOWED_ORIGINS=https://sumenepbukukerja.freebuff.app
```

Kalau frontend juga dibuka di origin lain (misalnya pratinjau), tambahkan
dengan pemisah koma. Ingat `SITE_URL` **tidak boleh** dipakai di sini: pada
deployment yang diuji, `SITE_URL` menunjuk origin `.convex.site` itu sendiri,
bukan origin frontend.

### 9.2 Yang harus dijalankan pemilik

```bash
# Deploy fungsi Convex baru (tabel securityIncidents, dua AuditAction,
# alignSeededCoordinates, seluruh modul securityIncidents).
npx convex deploy --env-file deploy-prod.env

# Publish ulang frontend setelah itu, supaya perbaikan dialog ikut tayang.
```

Setelah deploy, `alignSeededCoordinates` bisa dijalankan sekali dari Convex
dashboard kalau koordinat benih memang perlu diselaraskan. Ia tidak lagi
berjalan sendiri dari peramban.

#### 9.2b Migrasi nomor warga (WAJIB, urutan tidak boleh dibalik)

Nomor warga sudah terenkripsi untuk semua PENULISAN BARU begitu kode ini
tayang. Data lama masih polos sampai migrasi ini dijalankan.

Pasang `PHONE_DATA_KEY` dulu (bagian 9.1), lalu jalankan dari Convex
dashboard, berurutan:

```bash
1. phoneMigration:report              # berapa yang polos vs terenkripsi
2. phoneMigration:migratePreferences  # jalankan sampai migrated: 0
3. phoneMigration:migrateClaims       # jalankan sampai migrated: 0
4. phoneMigration:migrateThreads      # jalankan sampai migrated: 0
5. phoneMigration:report              # remainingLegacy harus 0
6. phoneMigration:clearLegacyPlainPhones   # HANYA setelah langkah 5 = 0
```

Path di atas sengaja TIDAK diawali `internal/`. Modulnya berada di
`src/convex/phoneMigration.ts`, bukan di `src/convex/internal/`, jadi path CLI
yang benar adalah `phoneMigration:*`. Path `internal/phoneMigration:*` tidak
pernah ada - memakainya membuat CLI mencetak daftar seluruh fungsi dan berhenti,
yaitu tanda command tidak ditemukan, bukan tanda database sudah aman.

Langkah 2-4 dibatasi 500 baris per pemanggilan dan idempoten, jadi boleh
dijalankan berulang kali sampai `migrated: 0`. Itu yang diharapkan, bukan
tanda gagal.

Langkah 6 menolak berjalan selama masih ada baris polos. Itu penjaga, bukan
bug: mengosongkan kolom polos di langkah yang sama dengan mengenkripsi berarti
satu transaksi menentukan apakah nomor warga Anda masih ada atau tidak.
Nomor yang hilang tidak bisa dipulihkan - hanya ada di backup mingguan.

Jangan lewati langkah 5. Kalau `remainingLegacy` belum nol, berarti ada baris
yang gagal dienkripsi (biasanya karena data rusak, bukan format nomor), dan
menghapus kolom polos sekarang akan membuang nomor yang tidak punya salinan
aman.

### 9.3 Security header (bagian 8)

Belum dipasang. Lokasi yang benar adalah lapisan deployment, bukan kode
aplikasi:

- **Frontend (Vercel/Freebuff):** HSTS, CSP, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY` (atau
  `frame-ancestors` di CSP), COOP/CORP.
- **Convex (`http.ts`):** header yang sama untuk rute HTTP publik.

CSP harus dibangun dari dependensi nyata. Sebelum menambahkan
`unsafe-inline`/`unsafe-eval`, audit dulu:
`dangerouslySetInnerHTML`, HTML mentah, URL-ke-HTML, SVG dari pengguna, dan
konten buatan pengguna.

Catatan: `X-Frame-Options: DENY`/`frame-ancestors 'none'` akan mematikan
pratinjau Freebuff yang berjalan di dalam iframe. Kalau pratinjau itu masih
dibutuhkan, nilainya harus berbeda antara dev dan prod.

---

## 10. Verifikasi

Dijalankan pada commit ini, semuanya lulus:

| Perintah | Hasil |
|---|---|
| `bunx convex dev --once` | Convex functions ready |
| `bunx tsc -b --noEmit` | 0 error |
| `bun run test` | **70 berkas / 980 test / 0 gagal** (naik dari 62/883) |
| `bun run lint` | **0 error / 26 warning** (sama dengan baseline) |
| `bun install --frozen-lockfile` | Lulus, tanpa perubahan |
| `bun audit` | **15 kerentanan, 0 critical**, 0 dependensi langsung rentan (sebelumnya 46 / 1 critical) |
| `node tmp/qa-p91-leakscan.mjs <29 berkas yang disentuh>` | CLEAN |

Uji naik dari 883 ke 980 bersih. Berkas test baru:

| Berkas | Test | Isi |
|---|---:|---|
| `src/lib/security-rules.test.ts` (baru) | 21 | Sembilan aturan, agregasi, sanitasi bukti |
| `src/lib/request-dto.test.ts` (baru) | 13 | Daftar putih DTO papan permintaan |
| `src/convex/security-incidents.test.ts` (baru) | 11 | Tiga pemicu deteksi yang tersambung |
| `src/convex/revoked-session-coverage.test.ts` (baru) | 10 | Sesi tercabut ditolak; `ensureCatalogSeeded` |
| `src/lib/postmessage-origin.test.ts` (baru) | 6 | Kontrak origin `postMessage` |
| `src/convex/session-context-authority.test.ts` (baru) | 8 | Konteks sesi harus dari server, bukan dari klien |
| `src/convex/context-route-hardening.test.ts` (baru) | 11 | CORS fail-closed dan batas permintaan, lewat `t.fetch` |
| `src/convex/access-denial-contract.test.ts` (baru) | 10 | Batasan transaksi Convex, gerbang tetap menolak, jalur return-only terdeteksi |

Tujuh test ditambahkan pada commit ini, semuanya di berkas yang sudah ada, dan
**tidak ada satu pun test lama yang diubah kontraknya atau di-`skip`**:

| Berkas | Test | Isi |
|---|---:|---|
| `src/lib/image-upload.test.ts` | 3 | SVG ditolak walau berawalan `image/`; huruf besar dan spasi tidak membuat ditolak; allowlist hanya berisi raster |
| `src/convex/storage.test.ts` | 2 | Peta blob menolak foto melebihi batas ukuran dan menolak SVG |
| `src/convex/reviews-notifications.test.ts` | 2 | Penandaan terbaca dibatasi 200 per panggilan dan menutup sisanya; inbox memotong 5 baris dari yang terbaru |

Jumlah di atas lebih besar daripada kenaikan bersihnya karena tiga test lama
DIUBAH kontraknya sejak Fase 3, bukan ditambah: dua di
`src/convex/security-surface.test.ts` dan satu di
`src/convex/display-name-security.test.ts`. Ketiganya sebelumnya **mengunci
kebocoran `requesterId` sebagai perilaku yang benar**; sekarang menguncinya
sebagai larangan. Tidak ada test yang dihapus dan tidak ada yang di-`skip`.

Empat test lama berubah kontraknya sejak laporan pertama, semuanya di
`src/convex/http-cors-security.test.ts`. Test "tanpa allowlist: wildcard"
mengaku wildcard sebagai perilaku yang benar; sekarang ia mengunci **tutup**
sebagai bawaan dan wildcard sebagai opt-in. Test itu tidak dihapus karena ia
justru yang menangkap paling jujur: kalau kontrak ini tidak dijaga dengan
test, allowlist kosong akan diam-diam kembali jadi wildcard.



Leakscan melaporkan 5 temuan `U+00B7` (`·`) di
`src/components/community-widgets.tsx` (baris 551, 593, 629, 759, 774).
**Semuanya sudah ada sebelum perubahan ini** dan tidak ada satu pun yang saya
tambahkan. Karakter itu tidak ada di allowlist pemindai; kalau pemindai ingin
bersih total, allowlist-nya perlu ditambah `·` atau karakter itu diganti di
kelima baris tersebut.

### 10.1 Test yang belum ada

Disebut eksplisit supaya tidak terlihat seperti sudah tercakup.

Sudah ditutup sejak versi pertama laporan ini: sesi tercabut (10 test),
`ensureCatalogSeeded` (4 test), `postMessage` (6 test), dan pemicu deteksi
untuk tiga aturan pertama (11 test). Sejak commit ini: integritas konteks sesi
(8 test), CORS fail-closed plus batas permintaan (11 test), allowlist tipe
gambar dan batas ukuran peta blob (5 test), serta batas kerja enam permukaan
publik (2 test).

Yang masih terbuka lebih sedikit, dan itu penting untuk disebut:

- **Matriks otorisasi yang lengkap.** Yang sudah ada: anonim ditolak, warga
  tanpa peran ditolak pada data pengelola, sesi tercabut ditolak di empat
  fungsi, dan akun dengan `staffMembers` boleh. Yang BELUM: viewer hanya bisa
  baca (memastikan viewer ditolak pada setiap mutation, bukan hanya pada
  `requireVendorManager`), staff sesuai lingkup, dan admin pada setiap pintu.
- **Test pemicu insiden untuk enam aturan sisanya.** Pola pengujiannya sudah
  ada di `src/convex/security-incidents.test.ts` dan bisa disalin: sinyal di
  bawah ambang tidak membuat baris, sinyal di atas ambang membuat TEPAT satu
  baris, panggilan berikutnya digabung ke baris yang sama, dan bukti yang
  berbahaya disunting.
- **Test idempotensi dan pencegahan replay webhook.** Bagian 6 menuntutnya;
  belum ada test maupun implementasinya.
- **Test CORS fail-closed.** Sudah ada: 11 test di
  `src/convex/context-route-hardening.test.ts` dan 4 test yang diubah
  kontraknya di `src/convex/http-cors-security.test.ts`. Yang BELUM teruji:
  perilaku route setelah `ADMIN_CONTEXT_ALLOWED_ORIGINS` benar-benar diisi di
  deployment prod, karena itu hanya bisa dibuktikan dari luar.

---

## 11. Definition of Done

### Keamanan

- [ ] Rahasia dihapus dan diputar - **BELUM.** `.gitignore` sudah diperbaiki,
      tapi rotasi dan riwayat Git hanya bisa dikerjakan pemilik (bagian 6).
- [ ] Riwayat dipindai - **BELUM.** Perintah `git` diblokir di lingkungan ini.
- [x] Otorisasi terpusat - dua berkas, lima fungsi, dua salinan dihapus.
- [x] Sesi tercabut ditolak secara konsisten - dibuktikan 10 test di
      `src/convex/revoked-session-coverage.test.ts`, empat di antaranya pada
      fungsi yang dulu bocor.
- [x] Tidak ada pengenal internal yang tidak perlu terekspos - `requesterId`
      dan `offeredBy` sekarang tidak punya jalur keluar.
- [x] Nomor telepon USAHA tidak ada di DTO publik - `listActive` dan
      `getBySlug` tidak lagi mengirim `phone`; yang dikirim `contactRef` opaque
      dan bentuk tersamar. Nomor penuh hanya lahir di
      `vendors:getContactHandoff` setelah empat pemeriksaan lulus. `telephone`
      juga dihapus dari JSON-LD. 15 test baru di
      `src/convex/contact-handoff.test.ts` plus regresi di
      `public-data-surface.test.ts` dan `listing-metadata.test.ts`
      (bagian 5.2a).
- [x] Nomor telepon pribadi tidak bocor ke DTO - `listClaimStatus`
      sekarang mengembalikan DTO eksplisit dengan nomor tersamar, tanpa
      ciphertext dan tanpa kunci pencarian; audit `submitClaim` mencatat
      `whatsappPhoneMasked`, bukan nomor mentah (bagian 5.2b).
- [x] Nomor telepon pribadi dilindungi saat disimpan - AES-GCM-256 dengan
      kunci turunan HKDF dari `PHONE_DATA_KEY`, pencarian lewat HMAC 128-bit
      berprefiks `bkp1.`, `listClaimStatus` tersamar. Jalur tulis gagal
      terbuka tanpa kunci. 15 test di `src/convex/phone-encryption.test.ts`
      (bagian 5.2b). Sisa: migrasi data lama dijalankan pemilik (9.2b).
- [x] Setiap fungsi publik bergerbang atau punya pengecualian tertulis -
      113 fungsi publik dipindai dari kode; 106 bergerbang, 7 pengecualian
      terdokumentasi. Audit berjalan sebagai test, jadi endpoint publik baru
      tanpa keputusan akan menggagalkan CI (bagian 2.13).
- [x] Bukti Security Desk otoritatif dari server - `reportSessionContext`
      mengonsumsi token konteks, kolom jaringan diambil dari
      `adminSecurityContexts`, dan klasifikasi perangkat diturunkan server;
      8 test regresi di `src/convex/session-context-authority.test.ts`.
- [x] CORS produksi fail-closed - allowlist kosong berarti tidak ada header
      izin; wildcard harus diminta lewat `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS`.
      Route konteks juga dibatasi 30 permintaan/menit per IP yang diamati
      server. 11 test di `src/convex/context-route-hardening.test.ts`.
- [x] Webhook diperkuat - HMAC dan perbandingan panjang sudah ada; pada
      commit ini ditambah **idempotensi** (kiriman ulang dengan
      `providerMessageId` yang sama tidak mengubah apa pun) dan **pagar
      replay** (pesan yang lebih tua dari 7 hari ditolak; pesan tanpa
      timestamp provider tetap diterima), plus batas ukuran badan 256 kB.
      6 test di `src/convex/detection-wiring.test.ts`.
- [x] Penyimpanan tidak menerima tipe aktif - `image/svg+xml` dan keluarga
      XML lain ditolak lewat allowlist raster; batas ukuran ditegakkan di
      `storage`, `users`, dan `community` dari aturan yang sama; bukti klaim,
      dokumen cadangan, dan foto profil orang lain tetap tidak bisa jadi foto
      listing. 5 test regresi (bagian 2.10).
- [x] Deteksi serangan nyata diimplementasikan dan diuji - model, katalog,
      pencatat, panel, retensi, penghitung laju, 21 test aturan, dan 33 test
      pemicu. **7 dari 9 pemicu tersambung**; dua sisanya terbukti mustahil
      dari dalam gerbang yang melempar (bagian 2.9) dan batasnya dikunci test.
- [ ] Security header aktif - **BELUM** (bagian 9.3).
- [x] Postur dependensi diperbaiki - `bun audit`: 46 -> 15 kerentanan,
      **0 critical**, 0 dependensi langsung rentan. `axios` tak terpakai
      dihapus, `@auth/core` 0.41.3 + `@convex-dev/auth` 0.0.96 (kombinasi
      peer yang didukung vendor), `package-lock.json` yang menyimpang dihapus,
      `bun install --frozen-lockfile` lulus.

### Keandalan

- [ ] Tidak ada tombol rusak yang diketahui - **TIDAK DIVERIFIKASI.**
- [ ] Tidak ada error kritis yang tertelan tanpa penjelasan - **TIDAK DIVERIFIKASI.**
- [ ] Tidak ada deep-link rusak - **TIDAK DIVERIFIKASI.**
- [x] Tidak ada beban kerja publik tanpa batas - untuk `ensureCatalogSeeded`,
      `listRequests`, `listActive`, dan `POST /admin-gate/context`, semuanya
      sekarang dibatasi. Enam permukaan baca publik lainnya juga dipotong di
      server: inbox notifikasi, penandaan terbaca, deduplikasi interaksi,
      kuota laporan, kuota ulasan anonim, dan fans-out notifikasi request.
      Pemindaian menyeluruh menambah lima lagi: pencocokan listing di
      `createRequest`, riwayat interaksi, favorit, status WhatsApp, dan
      daftar admin (bagian 2.14).

### Responsif

Semuanya **BELUM**, tanpa kecuali: desktop, Android, iPhone/WebKit, Firefox,
keyboard, safe-area, reduced-motion, teks besar/kontras tinggi.

### Verifikasi

- [x] Lint - 0 error / 26 warning (warning sama seperti sebelum commit ini).
- [x] Typecheck - 0 error.
- [x] Test unit - 1027 lulus di 74 berkas.
- [x] Test Convex baru - 15 test enkripsi nomor di
      `src/convex/phone-encryption.test.ts` (ciphertext tidak memuat nomor,
      manipulasi ditolak, kunci salah ditolak, gagal terbuka tanpa kunci,
      migrasi idempoten); 5 test audit permukaan publik di
      `src/convex/public-surface-audit.test.ts`; 15 test handoff kontak di
      `src/convex/contact-handoff.test.ts`.
- [ ] E2E - belum dijalankan; tidak ada peramban.
- [ ] Pemindaian dependensi - belum dijalankan (bagian 8).
- [ ] Peninjauan diff akhir - sebagian, `git diff` diblokir.
- [ ] Laporan hardening di-commit - berkas ini ada; commit ada di tangan
      pemilik.

---

## 12. Tujuan Akhir

Ingat tujuan yang diminta di akhir instruksi: bukan "membuat kode terlihat
lebih rapi", melainkan **lebih sulit diserang, lebih sulit dipanen, lebih
sulit dirusak, lebih mudah dideteksi, lebih mudah dipulihkan, dan terverifikasi
di peramban nyata, sambil menjaga identitas Sumenep Buku Kerja.**

Terhadap enam kata kerja itu:

| | Status |
|---|---|
| Struktur penyerangan | **Membaik.** Dua pintu otorisasi yang bocor ditutup; satu penulisan lintas-akun dihapus. |
| Pemanenan data | **Membaik untuk id akun. Belum membaik untuk nomor telepon** - dan nomor telepon adalah target panen yang lebih bernilai. |
| Ketahanan terhadap kerusakan | **Belum disentuh.** Butuh audit tombol, rute, dan beban kerja per endpoint. |
| Kemampuan deteksi | **Membaik signifikan, dan mulai nyata.** Model, katalog, agregasi, panel, dan sanitasi bukti sudah ada dan teruji; tiga aturan sudah menerima sinyal sungguhan dan menghasilkan insiden beragregasi. Enam aturan sisanya masih berupa katalog tanpa pemicu. |
| Kemampuan pemulihan | **Belum disentuh.** Pencabutan sesi sudah ada sebelumnya dan sekarang berlaku lebih konsisten. |
| Verifikasi lintas peramban | **Belum disentuh.** Tidak ada peramban di lingkungan ini. |

Bagian yang paling menentukan status keseluruhan adalah bagian 5.2 dan sisa
bagian 5.1: nomor telepon yang belum dienkripsi, dan enam aturan deteksi yang
belum menerima sinyal. Yang pertama adalah target panen yang lebih bernilai
daripada id akun mana pun; yang kedua adalah bedanya antara "bisa mendeteksi"
dan "sedang mendeteksi".

Sampai keduanya selesai, aplikasi ini **lebih aman daripada kemarin, dan
kerentanan yang sudah bocor sudah ditutup** - tetapi belum memenuhi standar
yang diminta di akhir instruksi.
