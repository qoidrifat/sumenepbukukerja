# PHASE 9 — Public PII & Security Hardening: Dokumen Audit

Proyek: **Sumenep Buku Kerja** (Vite + React + Convex + Bun)
Tanggal audit: **30 September 2026**
Origin yang diuji: `https://rare-scorpion-625.convex.cloud` (deployment dev)
Referensi standar: OWASP ASVS 5.0.0 (dipakai sebagai daftar periksa, **bukan**
klaim kepatuhan), OWASP API Security Top 10 2023.

Ringkasan satu kalimat: **satu kebocoran kredensial (CRITICAL) dan satu jalur
pembacaan blob storage tanpa otorisasi (HIGH) ditemukan, diperbaiki, dan
dikunci dengan test; sisanya terdokumentasi apa adanya, termasuk satu risiko
konfigurasi yang hanya bisa ditutup oleh operator.**

---

## 1. Executive summary

| Angka | Nilai |
|---|---:|
| Fungsi Convex terinventarisasi | 154 |
| Route HTTP terdaftar | 6 (5 path) |
| Query publik diaudit | 15 |
| Mutasi publik (dapat dipanggil tanpa sesi) | 9 |
| Action publik | 2 |
| Field pada permukaan publik diaudit | 79 |
| Field PII di permukaan publik (sebelum) | 7 |
| Field PII/P3 dihapus dari permukaan publik | 4 |
| Field dienkripsi | 0 (sengaja, lihat bagian 10) |
| Temuan | 16 |
| CRITICAL / HIGH / MEDIUM / LOW / INFO | 1 / 1 / 7 / 4 / 3 |
| Temuan CRITICAL tersisa | **0** |
| Temuan HIGH tersisa | **0** |
| Test unit | 53 berkas, 749 lulus, 0 gagal |
| Test E2E | 32 lulus, 10 dilewati, 0 gagal |
| Kebocoran rahasia di repositori | 1 (sudah dikeluarkan dari sumber) |

Tiga yang paling penting:

1. **F-01 (CRITICAL, sudah diperbaiki).** Kunci API penyedia OTP ditulis
   sebagai literal di `src/convex/auth/emailOtp.ts`, dan `catch` yang sama
   melempar `new Error(JSON.stringify(error))`. `JSON.stringify` pada
   `AxiosError` menyalin `config.headers` — termasuk header `x-api-key` — ke
   pesan yang dikirim ke pemanggil `auth:signIn`, yaitu siapa pun tanpa sesi.
   Kunci sekarang hanya dibaca dari `VLY_EMAIL_OTP_API_KEY`, dan objek error
   dari axios tidak pernah ikut ke pesan.
2. **F-02 (HIGH, sudah diperbaiki).** `vendors:getImageUrl` menerima storage id
   apa saja dan langsung meminta URL bertanda tangan. Itu menjadikan id opaque
   sebagai otorisasi — persis hal yang dilarang aturan audit. Blast radius-nya
   mencakup bukti usaha warga (`listingClaims.evidenceStorageId`) dan dokumen
   cadangan mingguan (`backupRuns.storageId`). Sekarang query hanya melayanakan
   blob yang bisa dibuktikan sebagai foto listing aktif atau foto galeri yang
   sudah disetujui.
3. **F-08 (MEDIUM, terbuka, tindakan operator).** `STAFF_BOOTSTRAP_EMAILS` masih
   aktif di deployment yang diuji (`bootstrapAdministratorAvailable` =
   `{"available": true}`, `staffCount` = 3). Jalur pemulihan admin ini disengaja
   dan dikunci test, jadi tidak dihapus; yang perlu adalah menghapus variabel
   itu dari Keys setelah pemulihan tidak lagi dibutuhkan.

---

## 2. Scope

**Masuk scope:** seluruh data yang dapat mencapai permukaan publik; otorisasi
query/mutation/action; storage dan unggah; webhook masuk; error dan logging;
kredensial; XSS dan injeksi; rate limit; enumerasi; strategi enkripsi;
kompatibilitas Fase 1–8.

**Keluar scope (tetap):** mascot, brand, logo, desain visual, SEO, arsitektur
paginasi, optimasi performa yang tidak terkait, arsitektur WhatsApp Fase 8,
arsitektur notifikasi warga, penambahan fitur produk.

**Metode:** baca kode, inventaris data flow, uji dengan `convex-test`, probe
read-only ke deployment, perbandingan sebelum/sesudah.

---

## 3. Arsitektur (ringkas, yang relevan untuk keamanan)

- **Backend:** Convex. Fungsi publik adalah `query`/`mutation`/`action`; yang
  tidak boleh dipanggil klien adalah `internalQuery`/`internalMutation`/
  `internalAction`.
- **Otorisasi:** satu-satunya sumber kebenaran peran adalah tabel
  `staffMembers` (dengan fallback ke `users.role` untuk deployment lama).
  Gerbang terkumpul di `src/convex/access.ts` dan diduplikasi (secara sadar)
  di `vendors.ts` dan `community.ts`.
- **AuthN:** Convex Auth dengan provider `emailOtp` dan `Anonymous`. Tidak ada
  password. Token JWT disimpan klien di `localStorage` (mekanisme bawaan).
- **Storage:** blob privat di `_storage`; tidak ada URL publik permanen. Semua
  URL yang keluar adalah URL bertanda tangan hasil `ctx.storage.getUrl`.
- **Deploy yang diuji adalah deployment DEV.** Perbedaan ini penting untuk
  bagian 8 (F-07): deployment dev_convex_self_menampilkan stack trace di
  `errorMessage`.

---

## 4. Threat model

| Aktor | Kemampuan yang diasumsikan |
|---|---|
| A — Anonim | HTTP publik, query publik, form, devtools, mengulang permintaan, mengubah payload, mengubah id |
| B — Warga | Akun miliknya sendiri (didapat lewat OTP), query/mutasi yang diizinkan |
| C — Staff | Fungsi pengelola (`staff`) |
| D — Management viewer | Fungsi baca operasional |
| E — Admin | Fungsi privilegi, termasuk ganti passcode dan cabut sesi |
| F — Browser/klien yang dikompromikan | JS dimodifikasi, permintaan dimodifikasi, API dipanggil langsung, permintaan diulang, id diganti |

Asumsi yang dipakai di seluruh dokumen ini: **server tidak mempercayai klien,
UI yang tersembunyi bukan pengaman, dan id opaque bukan otorisasi.**

---

## 5. Public data inventory

Ringkasan; matriks lengkap ada di `docs/security/PUBLIC-DATA-MATRIX.md`.

| Permukaan | Jumlah field | Field sensitif yang terlihat | tackled |
|---|---:|---|---|
| `vendors:listActive` (anonim) | 21 | `phone` (P0, kontak usaha = isi produk) | dipertahankan |
| `vendors:getBySlug` (anonim) | 21 | `photoId` (P3, pengenal storage) | dipertahankan |
| `community:listRequests` (anonim) | 14 (sebelumnya 15) | `requesterName` (P2), `lat`/`lng` (P2) | decision point |
| `community:listVendorPhotos` (anonim) | 6 | sebelumnya `moderationNote`, `moderatedBy`, `storageId` | dihapus |
| `community:listPackages` (anonim) | 8 | tidak ada, tapi bocor untuk listing draft | diperbaiki |
| `users:adminSetupStatus` (anonim) | 7 | `deployment`, `bootstrapAvailable`, `accountEmail` sendiri | lihat F-08 |
| `internal.vendors:publicSitemapVendors` | 2 | tidak ada | terkunci test |

Total 79 field publik diaudit, 7 di antaranya PII/P3 sebelum Fase 9.

---

## 6. PII classification

Kategori yang dipakai: **P0** aman-publik, **P1** sensitivitas rendah,
**P2** data pribadi, **P3** sensitif/operasional, **P4** rahasia.
P3/P4 tidak boleh berada pada respons publik.

| Field | Kelas | Permukaan publik | Keputusan |
|---|---|---|---|
| `vendors.phone` | P0 | ya | dipertahankan: produk ini direktori WhatsApp, nomor adalah isi produk |
| `serviceRequests.requesterName` | P2 | ya | **decision point** untuk pemilik produk (bagian 17) |
| `serviceRequests.lat/lng` | P2 | ya (bila diisi) | dipertahankan: dipakai pencocokan jarak |
| `serviceRequests.requesterId` | P3 | **dihapus Fase 9** | tidak dibutuhkan papan publik |
| `requestOffers.offeredBy` | P3 | **dihapus Fase 9** | id akun penawar |
| `vendorPhotos.moderationNote` | P3 | **dihapus Fase 9** | catatan internal pengelola |
| `vendorPhotos.moderatedBy` | P3 | **dihapus Fase 9** | id akun pengelola |
| `vendors.photoId` | P3 | ya | pengenal storage untuk foto yang memang publik |
| `listingClaims.evidenceStorageId` | P3 | tidak | pasti tidak setelah F-02 |
| `backupRuns.storageId` | P3 | tidak | pasti tidak setelah F-02 |
| Kredensial penyedia | P4 | tidak | dipindah ke environment pada F-01 |

---

## 7. Attack surface map

| Permukaan | Entry | Data | Otorisasi | Rate limit | Validasi | Risiko | Test |
|---|---|---|---|---|---|---|---|
| Katalog | `vendors:listActive` | data publik | tidak perlu | tidak (read-only) | enum kategori | rendah | `public-data-surface` |
| Papan permintaan | `community:listRequests` | P2 + P3 | tidak perlu | `limit` 1-100 | enum status | sedang (F-05) | `security-surface` |
| Galeri foto | `community:listVendorPhotos` | publik + P3 | tidak perlu | slice 12 | - | sedang (F-04) | `security-surface` |
| Paket listing | `community:listPackages` | draft/aktif | **diperbaiki** | - | - | sedang (F-03) | `security-surface` |
| Blob storage | `vendors:getImageUrl` | storage | **diperbaiki** | - | - | tinggi (F-02) | `security-surface` |
| Penghitung publik | `incrementClick`, `recordSearch` | metrik | tidak perlu | **ditambahkan** | - | sedang (F-06) | `security-surface` |
| Ulasan | `vendors:addReview` | teks warga | opsional | 1/listing, 3/hari anonim | panjang 600 | rendah | `realtime` |
| Laporan | `community:createReport` | teks warga | opsional | 10/24 jam | panjang 1000 | rendah | `metrics-index` |
| Gerbang admin | `adminGate:verifyAdminPasscode` | passcode | rate limit | per perangkat + global | PBKDF2 | rendah (terkunci) | `realtime`, `admin-passcode` |
| Preview handoff | `whatsapp:adminHandoffPreview` | internal | `requireManagementViewer` | - | - | rendah | `alert-recipient-security` |
| Webhook | `/webhook/whatsapp`, `/twilio/status` | status & chat | HMAC | - | parser | rendah | `whatsapp-webhook` |
| Konteks admin | `/admin-gate/context` | IP tersamar | tanpa auth | tidak | header | sedang (F-11) | probe |
| Cadangan | `storage:writeWeeklyBackup` | 6 tabel penuh | `internal*` | mingguan | - | rendah | `backup-recovery` |
| Bootstrap admin | `users:bootstrapAdministrator` | peran | allowlist env | tidak | - | sedang (F-08) | `realtime` |

---

## 8. Findings

Format setiap finding: ID, aset, permukaan, aktor, prasyarat, bukti, dampak,
kemungkinan, severity, root cause, fix, regression test, verifikasi, status.

### F-01 — Kunci API penyedia OTP ditulis di sumber dan bocor lewat pesan error
- **Aset:** kredensial penyedia layanan email OTP.
- **Permukaan:** repositori (Git) dan action `auth:signIn`.
- **Aktor:** A (anonim).
- **Prasyarat:** satu kegagalan pengiriman OTP (kunci kadaluwarsa, penyedia 5xx, atau jaringan).
- **Bukti:** `tmp/qa-p9-axios-error-probe.mjs` → `AXIOS_LEAK_PROOF=LEAKS_API_KEY`,
  1.646 byte hasil `JSON.stringify` memuat nilai header. Alur ke klien tidak
  dicegat: `node_modules/@convex-dev/auth/dist/server/implementation/signIn.js:79`
  memanggil `provider.sendVerificationRequest` tanpa `try/catch`, jadi error
  langsung keluar dari action.
- **Dampak:** siapa pun yang dapat memicu `auth:signIn` bisa membaca kunci
  penyedia lewat pesan error, lalu menyalahgunakannya (spam, biaya, reputasi).
- **Severity:** **CRITICAL**.
- **Root cause:** (1) kredensial ditulis literal di modul server; (2) error
  upstream diserialisasi mentah ke pesan yang keluar ke pemanggil.
- **Fix:** kunci dibaca dari `process.env.VLY_EMAIL_OTP_API_KEY`; `catch` hanya
  mencatat kode status server-side dan melempar pesan tanpa data teknis.
- **Regression test:** `src/convex/otp-provider-security.test.ts` (3 test).
- **Verifikasi:** `bun run test` hijau; `grep` sumber tidak menemukan pola
  `fb_email_`; tidak ada kredensial lain yang ditemukan di `src/`, `e2e/`,
  `scripts/`, `index.html`.
- **Status:** **FIXED di kode. TINDAKAN OPERATOR Wajib:** nilai lama harus
  dianggap bocor (ada di Git dan di jalur error), lalu dirotasi di penyedia dan
  diisi sebagai `VLY_EMAIL_OTP_API_KEY` di Keys/API keys. Tanpa itu, pengiriman
  OTP gagal dengan pesan yang jelas: "Integrasi email OTP belum dikonfigurasi".

### F-02 — `vendors:getImageUrl` membaca blob storage apa pun tanpa otorisasi
- **Aset:** seluruh isi `_storage` yang rujukan storage id-nya diketahui.
- **Permukaan:** query publik tanpa sesi.
- **Aktor:** A.
- **Prasyarat:** mengetahui satu storage id yang bukan foto publik.
- **Bukti:** `tmp/qa-p9-public-surface-evidence-BEFORE.json` menunjukkan
  `getImageUrl` menerima storage id sintetis dan membalas dengan error server
  yang memuat path sumber; tidak ada pemeriksaan apa pun pada sumber id.
  Sumber: `ctx.storage.getUrl(args.storageId)` tanpa syarat.
- **Dampak:** jika satu id bocor (misalnya lewat `vendors.photoId` yang memang
  publik, atau log, atau tangkapan layar), penyerang bisa membuka bukti usaha
  warga dan dokumen cadangan yang berisi enam tabel termasuk audit log.
- **Severity:** **HIGH**.
- **Root cause:** otorisasi dijawab dengan "kamu tahu id-nya".
- **Fix:** storage id hanya dilayani bila `vendors.photoId` dari listing
  `active`, atau `vendorPhotos` yang aktif **dan** sudah disetujui moderasi.
  Selain itu `null`, bukan error. Indeks `vendors.byPhotoId` ditambahkan supaya
  pemeriksaan ini tidak jadi pemindaian tabel.
- **Regression test:** `security-surface.test.ts` — 6 test (publik tetap jalan,
  bukti klaim ditolak, cadangan ditolak, draft ditolak, galeri pending/rejected
  ditolak, id tak dikenal tidak melempar).
- **Verifikasi:** SOURCE + TEST + DEPLOYED (probe sesudah: `value: null`).
- **Status:** **FIXED**.

### F-03 — Paket listing draft terbaca siapa pun yang tahu id listing
- **Aset:** `vendorPackages` untuk listing yang belum tayang.
- **Aktor:** A atau B. **Bukti:** `listPackages` tidak memeriksa `vendor.status`,
  berbeda dari `listVendorPhotos` yang sudah ancestnya.
- **Dampak:** membocorkan konten yang belum ditinjau admin (harga, paket,
  deskripsi) sebelum tayang. **Severity: MEDIUM.**
- **Fix:** aturan sama dengan `listVendorPhotos` — publik hanya untuk `active`.
- **Test:** 3 test di `security-surface.test.ts`. **Status: FIXED.**

### F-04 — Metadata moderasi bocor ke pembaca anonim
- **Aset:** `vendorPhotos.moderationNote`, `vendorPhotos.moderatedBy`.
- **Bukti:** `return { ...photo, url }` mengirim seluruh dokumen ke pembaca anonim.
- **Dampak:** catatan internal pengelola dan id akunnya terbaca publik.
  **Severity: MEDIUM.**
- **Fix:** proyeksi eksplisit; field moderasi hanya untuk pengelola/pemilik.
- **Test:** 2 test. **Status: FIXED.**

### F-05 — Papan permintaan publik mengirim pengenal akun warga
- **Aset:** `serviceRequests.requesterId`, `requestOffers.offeredBy`.
- **Bukti:** probe sebelum → kunci `requesterId` ada pada respons anonim;
  sesudah → tidak ada (`communityRequests.exposesRequesterId` `true` → `false`).
- **Dampak:** P3 (pengenal akun internal) terkumpul dari permukaan publik.
  **Severity: MEDIUM.**
- **Fix:** kedua id hanya ikut bila pemanggil punya identitas. UI tetap bekerja
  karena peramban selalu punya sesi, dan pemanggil tanpa sesi jelas tidak bisa
  memiliki permintaan.
- **Sisa:** `requesterName` (P2) dan `lat`/`lng` (P2) masih keluar. Keduanya
  keputusan produk — lihat bagian 17.
- **Status:** **MITIGATED PARTIALLY** (id_internal dihapus, P2 yang disengaja
  ditanyakan ke pemilik produk).

### F-06 — Penghitung publik dapat dipanggil tanpa batas
- **Aset:** `vendors.searchImpressions`, `vendors.whatsappClicks`,
  `vendors.shareClicks`, tabel `analyticsEvents`.
- **Aktor:** A. **Bukti:** kedua mutasi tidak punya pemeriksaan apa pun,
  sedangkan `analytics:track` sudah punya batas 300/jam per perangkat.
- **Dampak:** angka dashboard bisa dipalsukan tanpa batas, dan kuota pemanggilan
  fungsi dibakar. **Severity: MEDIUM.**
- **Fix:** plafon global per jam, diukur server-side lewat indeks `byEvent`
  (bounded `.take(limit + 1)`), tanpa mempercayai apa pun dari klien.
  1.000/hari untuk pencarian, 2.000/hari untuk klik — jauh di atas pemakaian nyata.
- **Test:** 1 test (panggilan setelah plafon tidak menambah hitungan).
- **Status:** **FIXED** untuk batas global. Sisa: batas per perangkat belum ada
  karena membutuhkan id yang diklaim klien; dicatat sebagai **LOW** di bagian 16.

### F-07 — Pesan error ke pemublik memuat detail server
- **Aset:** struktur internal (path sumber, nomor baris, nama fungsi).
- **Bukti:** `tmp/qa-p9-public-surface-evidence-BEFORE.json`:
  `at async handler (../src/convex/vendors.ts:312:34)`. Sesudah perbaikan,
  `getImageUrl` tidak lagi melempar sama sekali, dan penolakan otorisasi memakai
  `ConvexError` sehingga respons memiliki `errorData` berisi pesan yang dimaksud.
- **Dampak:** memetakan kode danTechnik attackers. **Severity: MEDIUM.**
- **Sisa yang jujur:** pada deployment **dev** (yang diuji), Convex tetap
  mengisi `errorMessage` dengan stack trace meski errornya `ConvexError` —
  `../../src/convex/access.ts:31:0` masih terlihat. Perilaku deployment produksi
  berbeda, tetapi itu **tidak bisa diverifikasi** di sini.
- **Status:** **MITIGATED PARTIALLY** — perbaikan kode sudah masuk, verifikasi
  produksi masih perlu deployment produksi.

### F-08 — Jalur pemulihan admin masih aktif di deployment
- **Aset:** peran `admin`.
- **Bukti (probe, tanpa sesi):** `users:bootstrapAdministratorAvailable` →
  `{"available": true}`; `users:adminSetupStatus` → `staffCount: 3`.
- **Prasyarat:**-controlled atas mailbox yang emailnya ada di
  `STAFF_BOOTSTRAP_EMAILS` (OTP email harus diterima di alamat itu). Tidak ada
  kedaluwarsa, notifikasi, atau batas percobaan.
- **Dampak:** bila salah satu alamat allowlist tidak lagi milik admin aktif,
  siapa pun yang menguasai mailbox itu bisa mengambil peran admin penuh.
  **Severity: MEDIUM** (naik menjadi HIGH bila allowlist memuat alamat yang
  tidak terikat pada admin sungguhan).
- **Kenapa tidak diperbaiki di kode:** jalur ini memang jalur pemulihan yang
  disengaja dan dikunci test — `realtime.test.ts` secara eksplisit menyatakan
  "jalur bootstrap tidak boleh bergantung pada jumlah pengelola yang ada". Menghapus
  atau membatasiinya akan mematikan pemulihan dan melanggar aturan regression.
- **Tindakan:** hapus `STAFF_BOOTSTRAP_EMAILS` dari Keys setelah pemulihan tidak
  dibutuhkan. `bootstrapAdministratorAvailable` adalah cara memverifikasinya.
- **Status:** **OPEN — tindakan operator.**

### F-09 — Route HTTP tidak tersedia pada origin yang diuji
- **Aset:** `/sitemap.xml`, `/robots.txt`, `/webhook/whatsapp`, `/twilio/status`,
  `/admin-gate/context`.
- **Bukti:** probe → 5 dari 5 menjawab **404** di `rare-scorpion-625.convex.cloud`.
- **Dampak:** verifikasi signature webhook, CORS, dan header keamanan **tidak
  bisa dijalankan** terhadap deployment. Kode webhook sudah diaudit sumber:
  `x-hub-signature-256` (HMAC-SHA256, perbandingan waktu-tetap), `X-Twilio-Signature`
  (HMAC-SHA1 atas URL + parameter terurut), `hub.verify_token` untuk verifikasi
  langganan, dan kedua verifier gagal tertutup bila secret tidak dikonfigurasi.
  **Severity: MEDIUM** (batas verifikasi, bukan kerentanan).
- **Status:** **OPEN — DEPLOYMENT NOT VERIFIED.** Tidak dipindahkan ke `public/`
  atau service worker karena itu akan mengubah arsitektur yang di luar scope.

### F-10 — Penaburan katalog dapat dipanggil tanpa sesi
- **Aset:** koordinat listing hasil seed.
- **Bukti:** `ensureCatalogSeeded` menerima siapa saja dan menulis ulang `lat`/`lng`
  listing yang slunya cocok.
- **Dampak:**Someone bisa mengembalikan koordinat listing seed ke nilai awal.
  Tidak ada PII, tidak ada akses lintas pengguna. **Severity: LOW.**
- **Kenapa tidak ditutup:** aplikasi memanggilnya sendiri saat katalog kosong
  (`src/lib/catalog-store.ts:220`) sebagai bootstrap deployment baru. Menutupnya
  akan mematikan fitur produk.
- **Status:** **RISK ACCEPTED** dengan alasan tertulis. Rekomendasi: jadikan
  skrip sekali jalan di luar aplikasi pada perubahan produk berikutnya.

### F-11 — Header keamanan dan CORS belum terverifikasi
- **Aset:** respons HTTP.
- **Bukti:** probe tidak menemukan `content-security-policy`,
  `x-content-type-options`, `strict-transport-security`, `referrer-policy`,
  `x-frame-options`, maupun `permissions-policy` pada respons origin.
  Catatan: pengukuran ini dilakukan pada respons 404 router Convex, jadi
  **bukan** pengukuran final untuk halaman yang disajikan Vite.
- `/admin-gate/context` memakai `access-control-allow-origin: *` dan tidak punya
  rate limit; responsnya hanya memuat bentuk tersamar milik pemanggil sendiri
  (`ipMasked`), dan setiap baris yang dibuat kedaluwarsa dalam 5 menit lalu
  dipangkas.
- **Severity: MEDIUM.**
- **Kenapa CSP tidak ditambahkan gegabah:** kebijakan itu harus tahu sumber skrip,
  font, gambar, dan worker yang sebenarnya; preview dan toolbar platform
  berada di luar kendali repo ini. Menempelkan CSP tanpa verifikasi berisiko
  mematikan aplikasi.
- **Status:** **OPEN** — perlu pengukuran pada origin yang menyajikan frontend
  dan keputusan platform soal header.

### F-12 — `submitFeedback` tanpa rate limit
- **Bukti:** satu baris `notifications` per panggilan, tanpa sesi pun bisa.
- **Dampak:** pertumbuhan baris dan kuota I/O. **Severity: LOW.**
- **Status: OPEN** (diabaikan demi menjaga perubahan tetap kecil; perbaikannya
  mezzanine dengan pola plafon yang sama seperti F-06).

### F-13 — PII di metadata audit
- **Bukti:** `claims.submitVendorClaim` menulis `{ email, whatsappPhone }` ke
  `auditLogs.metadata`, dan `listAuditLogs` membacanya untuk pengelola.
- **Penilaian:** itu memang dibutuhkan untuk meninjau klaim, dan hanya pengelola
  yang bisa membacanya. **Severity: INFO — RISK ACCEPTED** dengan alasan
  tertulis (kegagalan tanpa jejak kontak akan membuat verifikasi klaim mustahil).

### F-14 — Staff dapat memasang `photoId` storage id mana pun
- **Bukti:** `vendors.updateVendor` menerima `photoId` dari klien untuk
  pemanggil privileged, tanpa pemeriksaan metadata blob.
- **Dampak:** secara teori pengelola bisa membuat blob privat (bukti klaim lain)
  menjadi foto publik. **Severity: LOW** (jalur privileged).
- **Status: OPEN** — tidak diubah karena hanya berlaku untuk staff/admin dan
  tidak ada jalur warga ke sini.

### F-15 — `dangerouslySetInnerHTML` pada kode mati
- **Bukti:** satu kemunculan di `src/components/ui/chart.tsx:83` (komponen
  shadcn yang tidak diimpor siapa pun), dan isinya CSS dari `ChartConfig`
  statis, bukan data pengguna.
- **Severity: INFO.** **Status: RISK ACCEPTED** (kode mati, tanpa sumber data
  tak tepercaya).

### F-16 — Token sesi di `localStorage`
- **Bukti:** `src/pages/InviteAcceptance.tsx` menulis `__convexAuthJWT`, dan
  `ConvexProviderWithAuth` melakukan hal yang sama secara default.
- **Penilaian:** konsekuensi XSS adalah pencurian token; tidak ada `<meta>` CSP
  yang memaksa `HttpOnly`. Mengganti mekanisme penyimpanan berarti mengganti
  arsitektur auth, yang di luar scope dan tidak diminta.
- **Severity: INFO — RISK ACCEPTED**, dengan catatan bahwa_
  alchemy XSS harus dianggap belum selesai.

### F-17 — Cacat test E2E dua sesi (warisan Fase 8)
- **Bukti:** `e2e/flows.spec.ts` mencari label "sandi/password", sedangkan auth
  proyek memakai OTP email. Test itu sudah dilewati dari Fase 8, bukan diperbaiki,
  karena memperbaiki auth demi menghijaukan test tidak boleh terjadi.
- **Severity: LOW.** **Status: OPEN** (perbaikan perlu kredensial uji yang tidak
  tersedia untuk agent).

---

## 9. Remediation (ringkas)

| ID | Perbaikan | File | Test |
|---|---|---|---|
| F-01 | Kunci OTP dari environment; error axios tidak pernah ikut ke pesan | `src/convex/auth/emailOtp.ts` | `otp-provider-security.test.ts` |
| F-02 | `getImageUrl` hanya untuk blob terbukti publik; indeks `byPhotoId` | `src/convex/vendors.ts`, `src/convex/schema.ts` | `security-surface.test.ts` |
| F-03 | `listPackages` memeriksa status listing | `src/convex/community.ts` | `security-surface.test.ts` |
| F-04 | Proyeksi eksplisit galeri foto | `src/convex/community.ts` | `security-surface.test.ts` |
| F-05 | Id akun tidak keluar ke pemanggil tanpa sesi | `src/convex/community.ts`, `src/lib/catalog-store.ts` | `security-surface.test.ts` |
| F-06 | Plafon global per jam untuk penghitung publik | `src/convex/vendors.ts` | `security-surface.test.ts` |
| F-07 | `ConvexError` untuk penolakan otorisasi; `getImageUrl` tidak melempar | `src/convex/access.ts`, `vendors.ts`, `community.ts` | `security-surface.test.ts` + probe |

Semua pesan penolakan **tidak diubah**, sehingga setiap test yang menolak lewat
`rejects.toThrow` tetap cocok (731 → 749 test, tidak ada yang dihapus).

---

## 10. Encryption design

**Tidak ada enkripsi field yang diterapkan di Fase 9, dan itu keputusan sadar.**

Alasannya, diuji terhadap data yang benar-benar ada di proyek:

1. Data privat yang disimpan (nomor WhatsApp warga, email, alamat usaha) **harus
   bisa dibaca server** untuk mengirim pesan, mencocokkan nomor inbound, dan
   menyetujui klaim. Enkripsi tidak akan mengurangi satu pun akses tidak sah —
   tidak ada actor yang bisa membaca tabel itu kecuali melalui jalur yang sudah
   diaudit dan ditutup.
2. Yang tidak boleh terlihat publik **sudah dihapus dari respons**, bukan
   disamarkan. `requesterId`, `moderationNote`, `moderatedBy`, dan `offeredBy`
   tidak lagi dikirim sama sekali; `moderationNote` tidak dikirim ke siapa pun di
   luar pengelola.
3. Tidak ada kebutuhan pencarian atas nilai privat yang terenkripsi. Kalau nanti
   ada (misalnya "cari warga berdasarkan nomor"), pola yang benar adalah
   `nilai terenkripsi + hash lookup berekunci`, **bukan** SHA-256 mentah atas
   nomor telepon.
4. Menambahkan kripto berarti menambah `ENCRYPTION_KEY`, `KEY_ID`, rotasi,
   migrasi, dan risiko baru — semuanya tanpa memindahkan satu pun angka pada
   tabel risiko.

Kalau keputusan produk nanti berubah menjadi "data yang tidak boleh bisa dibaca
server mana pun",ectable revisions: F-01, F-02, F-05, F-06, F-07 — dengan
urutan: environment dan rotasi kunci dulu, lalu migrasi bertahap yang
menghapus plaintext hanya setelah dekripsi diverifikasi.

---

## 11. Authorization matrix

Lihat `docs/security/AUTHORIZATION-MATRIX.md`. Ringkasan peran: anonim → warga
→ pemilik listing → staff → management viewer → admin → akun pemilik. Semua
peran dibaca server-side; tidak ada jalur yang mempercayai peran dari klien.

---

## 12. Rate-limit matrix

| Alur | Kunci | Jendela | Batas | Sumber |
|---|---|---|---|---|
| Passcode gerbang | deviceId + `ipHash` server | lockout | `MAX_ATTEMPTS` | `adminGate.attemptWindow` |
| Passcode gerbang | global | lockout | `GLOBAL_ATTEMPT_CEILING` | `adminGate.globalFailureCount` |
| Peristiwa analitik | `anonymousId` | 1 jam | 300 | `analytics.track` |
| **Pencarian** (baru) | global | 1 jam | 1.000 | `vendors.recordSearch` |
| **Klik** (baru) | global | 1 jam | 2.000 | `vendors.incrementClick` |
| Laporan warga | `reporterId` atau target | 24 jam / 1 jam | 10 / 20 | `community.createReport` |
| Ulasan anonim | per listing | 24 jam | 3 | `vendors.addReview` |
| Ulasan akun | per listing per penulis | selamanya | 1 | `vendors.addReview` |
| Interaksi | per pengguna | 5 menit | 1 | `community.recordInteraction` |
| Laporan error | global | 1 jam | 500 laporan baru | `errorReports.reportError` |
| Kiriman uji WhatsApp | per pengguna per hari | 1 hari | 1 | `whatsapp.queueWhatsappDelivery` |

Kunci berbasis identitas yang diklaim klien (`anonymousId`, `deviceId`) bukan
kontrol yang kuat terhadap penyerang yang sengaja mengubahnya. Karena itu
plafon yang ditambahkan di Fase 9 bersifat **global dan diukur server-side**:
penyerang tidak bisaombok dessen kebocoran dengan mengganti id.

---

## 13. Upload / storage controls

| Unggahan | Otorisasi | Ukuran | Jenis | Nama berkas | Download |
|---|---|---|---|---|---|
| Foto profil | `requireUser`, hanya ke `users` sendiri | `imageRejection` | `image/*` | id storage server | `myProfile` (diri sendiri) |
| Foto listing | `requireVendorManager` + `validatePhotoFile` | `imageRejection` | `image/*` | id storage server | `getImageUrl` (hanya foto publik) |
| Bukti klaim | `requireUser` + `validateEvidenceFile` | 1 MB | `image/*` | id storage server | `listPendingClaims` (pengelola) |
| Cadangan | `internal*` | - | JSON | id storage server | tidak ada jalur klien |

- Jenis dan ukuran dibaca dari **metadata `_storage`**, bukan dari `File` klien
  (`src/lib/image-upload.ts`, `community.validatePhotoFile`).
- Tidak ada nama berkas dari klien yang dipakai sebagai path.
- Tidak ada `storageId` yang wajib bersifat rahasia lagi: `getImageUrl` menolak
  apa pun yang tidak terbukti publik (F-02).
- Pembersihan blob yatim selalu mengarah ke "jangan hapus" (`storage.pruneOrphanStorage`).

---

## 14. Webhook controls

| Kontrol | Status | Bukti |
|---|---|---|
| `x-hub-signature-256` (Meta) | ada | `http.ts:80-85`, HMAC-SHA256, `sameSecret` waktu-tetap |
| `X-Twilio-Signature` (Twilio) | ada | `http.ts:53-78`, HMAC-SHA1 atas URL + parameter terurut |
| `hub.verify_token` | ada | `http.ts:161-168` |
| Gagal tertutup | ya | tanpa secret, `validMetaSignature`/`validTwilioSignature` mengembalikan `false` |
| Batas ukuran body | tidak eksplisit |_validate_ rely pada batas platform; `await request.text()` membaca penuh |
| Anti-replay | parsial | tidak ada nonce;                                                          idempoten achieved lewat `providerMessageId` |
| Endpoint hidup | **tidak** | 404 di origin yang diuji (F-09) |

Kesimpulan: signature terverifikasi **di sumber**, dan tidak dapat diverifikasi
**di deployment** karena route tidak ada di origin yang diuji.

---

## 15. Security test results

| Suite | Berkas | Test | Hasil |
|---|---:|---:|---|
| `bun run test` (sebelum Fase 9) | 51 | 731 | semua lulus |
| `bun run test` (sesudah Fase 9) | 53 | 749 | semua lulus, 0 gagal |
| `bun run test:e2e` | 4 spec | 32 lulus / 10 dilewati | 0 gagal |

Test keamanan baru:

- `src/convex/security-surface.test.ts` — 15 test (F-02 enam, F-03 tiga, F-04 dua,
  F-05 dua, F-07 satu, F-06 satu).
- `src/convex/otp-provider-security.test.ts` — 3 test (F-01).

Test lama yang tetap mengunci perilaku ini: `public-data-surface.test.ts` (6),
`realtime.test.ts` (83, termasuk security desk, passcode, pencabutan sesi, OTP),
`alert-recipient-security.test.ts` (10), `whatsapp-webhook.test.ts` (14),
`admin-passcode.test.ts`, `error-reporting.test.ts` (41), `storage.test.ts`,
`db-efficiency.test.ts`, `data-retention.test.ts`, `backup-recovery.test.ts`.

---

## 16. Remaining risks (jujur, tidak disembunyikan)

| Risiko | Status | Kenapa tidak ditutup |
|---|---|---|
| Kunci OTP lama masih hidup di penyedia sampai dirotasi | **OPEN** | butuh akses ke penyedia; agent tidak boleh menyentuh kredensial |
| `STAFF_BOOTSTRAP_EMAILS` masih aktif | **OPEN** | hanya operator yang bisa menghapus dari Keys; menutup jalur=kematian pemulihan |
| Stack trace masih terlihat di deployment dev | **OPEN (parsial)** | perilaku platform; perlu deployment produksi untuk verifikasi |
| 5 route HTTP 404 di origin uji | **OPEN** | di luar kendali repo; tidak dipindahkan karena mengubah arsitektur |
| Tidak ada CSP/header terverifikasi | **OPEN** | perlu pengukuran pada origin frontend + keputusan platform |
| Batas per perangkat untuk `recordSearch`/`incrementClick` | **OPEN (rendah)** | butuh id yang diklaim klien; plafon global sudah menutup masalah kuota |
| `submitFeedback` tanpa rate limit | **OPEN (rendah)** | perubahan kecil, ditunda agar diff tetap fokus |
| `requesterName` + koordinat di papan publik | **DECISION POINT** | keputusan produk, bukan decide) teknikal |
| Staff bisa memasang `photoId` sembarang | **OPEN (rendah)** | jalur privileged |
| Cacat test E2E dua sesi | **OPEN** | butuh kredensial uji |

Tidak ada satu pun dari risiko di atas yang IMMEDIAT exploitable tanpa
prasyarat tambahan (kontrol mailbox, akses origin, atau perubahan platform).

---

## 17. Production verification

Dipisahkan sesuai aturan: SOURCE / TEST / DEPLOYMENT / EXTERNAL.

| Level | Yang terverifikasi | Bukti |
|---|---|---|
| **SOURCE** | seluruh gate `convex dev --once` + `tsc -b --noEmit` lulus |output gerbang |
| **TEST** | 749 unit + 32 E2E lulus | `bun run test`, `bun run test:e2e` |
| **DEPLOYMENT (query)** | katalog publik 21 field tanpa field internal; `requesterId` hilang; `getImageUrl` menjawab `null`; gerbang menolak anonim | `tmp/qa-p9-public-surface-evidence.json` |
| **DEPLOYMENT (before)** | kebocoran yang sama tercatat | `tmp/qa-p9-public-surface-evidence-BEFORE.json` |
| **DEPLOYMENT (HTTP)** | **tidak terverifikasi** — 5/5 route 404 | probe yang sama |
| **DEPLOYMENT (headers)** | **tidak terverifikasi** | probe yang sama |
| **EXTERNAL** | pengiriman OTP, WhatsApp Meta/Twilio, `wa.me` | **tidak terverifikasi** (butuh kredensial) |

Probe adalah read-only: hanya `POST /api/query` dengan `header: "anonymous"`
dan `GET` ke lima route. Tidak ada mutasi, tidak ada akun uji, tidak ada data
nyata yang disentuh.

---

## 18. Release classification

**READY WITH DOCUMENTED GAPS.**

- 0 CRITICAL tersisa, 0 HIGH tersisa (syarat keluar fase ini terpenuhi).
- 1 CRITICAL memerlukan **tindakan operator** sebelum dismantle: putar
  `VLY_EMAIL_OTP_API_KEY` di Keys. Sampai itu dilakukan, login OTP gagal dengan
  pesan yang jelas.
- 1 MEDIUM terbuka yang hanya bisa ditutup operator: hapus
  `STAFF_BOOTSTRAP_EMAILS` dari Keys.
- Sisanya terdokumentasi di bagian 16, dengan batas dan alasannya.

Tidak ada klaim "aman", "tembus-proof", atau "100% sesuai OWASP" di dokumen ini.
Keamanan adalah pengurangan risiko, bukan jaminan absolut.
