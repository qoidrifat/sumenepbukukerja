# PHASE 9.1 — Status Closure Per Temuan

Dokumen ini adalah sumber status satu-satuannya untuk 17 temuan Fase 9.
Setiap baris memisahkan tiga hal yang sering tercampur: **kode sudah
diperbaiki**, **sudah terverifikasi di deployment**, dan **sudah ditutup
secara operasional**. Ketiganya tidak sama, dan tidak boleh diringkas jadi satu
status.

Status yang dipakai:

| Status | Arti |
|---|---|
| `CLOSED` | Perbaikan kode ada, test mengunci, dan tidak ada langkah operator yang tertunda. |
| `CLOSED — OPERATOR VERIFIED` | Perbaikan kode ada **dan** operator sudah membuktikan langkahnya. |
| `MITIGATED` | Risiko dikurangi, ada bagian yang masih tersisa dan tercatat. |
| `OPEN` | Belum diperbaiki, dengan alasan. |
| `BLOCKED` | Tidak bisa dikerjakan agent dan tidak bisa ditutup tanpa pihak lain. |
| `RISK ACCEPTED` | Diterima dengan alasan tertulis; bukan "aman". |
| `DECISION REQUIRED` | Butuh keputusan pemilik produk, bukan keputusan teknis. |

Level bukti yang dipakai di dokumen ini:

- **SOURCE VERIFIED** - dibaca langsung dari kode repo ini.
- **TEST VERIFIED** - ada regression test yang lulus.
- **DEPLOYMENT VERIFIED** - perilaku pada deployment yang diuji dicatat dari
  probe read-only.
- **OPERATOR VERIFIED** - hanya operator yang bisa membuktikannya.
- **NOT VERIFIED** - belum ada bukti yang cukup.

---

## Ringkasan

| Temuan | Severity Fase 9 | Kode | Deployment | Operasi | Status |
|---|---|---|---|---|---|
| F-01 Kunci OTP | CRITICAL | FIXED | VERIFIED | n/a (bukan milik proyek) | `RISK ACCEPTED` |
| F-02 `getImageUrl` tanpa otorisasi | HIGH | FIXED | VERIFIED | n/a | `CLOSED` |
| F-03 Paket draft bocor | MEDIUM | FIXED | VERIFIED | n/a | `CLOSED` |
| F-04 Metadata moderasi bocor | MEDIUM | FIXED | VERIFIED | n/a | `CLOSED` |
| F-05 Papan publik mengirim id akun | MEDIUM | MITIGATED | VERIFIED | n/a | `DECISION REQUIRED` |
| F-06 Penghitung publik tanpa batas | MEDIUM | FIXED | VERIFIED | n/a | `MITIGATED` |
| F-07 Error server bocor ke publik | MEDIUM | FIXED (sebagian) | TERBUKTI ADA DI DEV | n/a | `MITIGATED` |
| F-08 Pemulihan admin aktif | MEDIUM | TIDAK DIUBAH (sengaja) | VERIFIED (ditutup) | SUDAH | `CLOSED — OPERATOR VERIFIED` |
| F-09 Route HTTP 404 | MEDIUM | TIDAK DIUBAH (sengaja) | VERIFIED (salah ukur di Fase 9) | n/a | `CLOSED` |
| F-10 Penaburan katalog anonim | LOW | TIDAK DIUBAH (sengaja) | n/a | n/a | `RISK ACCEPTED` |
| F-11 Header keamanan & CORS | MEDIUM | DIBATASI (bagian route) | FRONTEND NOT VERIFIED | BELUM | `MITIGATED` |
| F-12 `submitFeedback` tanpa batas | LOW | FIXED | n/a | n/a | `CLOSED` |
| F-13 PII di metadata audit | INFO | TIDAK DIUBAH | n/a | n/a | `RISK ACCEPTED` |
| F-14 `photoId` storage id bebas | LOW | FIXED | n/a | n/a | `CLOSED` |
| F-15 `dangerouslySetInnerHTML` mati | INFO | FIXED (Fase 9.2) | VERIFIED | n/a | `CLOSED` |
| F-16 Token di `localStorage` | INFO | TIDAK DIUBAH | n/a | n/a | `RISK ACCEPTED` |
| F-17 Test E2E dua sesi rusak | LOW | TIDAK DIUBAH | n/a | BELUM | `OPEN — TEST INFRASTRUCTURE GAP` |

Severity Fase 9 tidak diubah oleh Fase 9.1: 1 CRITICAL, 1 HIGH, 8 MEDIUM,
4 LOW, 3 INFO, total 17. Yang berubah adalah **status**, bukan bobot temuan.

---

## F-01 — Kunci API penyedia OTP

- **Temuan sebelumnya:** kunci ditulis literal di `src/convex/auth/emailOtp.ts`
  dan bocor lewat `JSON.stringify(error)` yang menyalin header `x-api-key` ke
  pesan yang kembali ke pemanggil `auth:signIn` tanpa sesi.
- **Kode sekarang:** FIXED. Kunci hanya dibaca dari `VLY_EMAIL_OTP_API_KEY`.
  Env kosong membuat pengiriman gagal dengan pesan yang jelas, bukan diam-diam
  memakai nilai bawaan. Objek error dari penyedia tidak pernah ikut ke pesan;
  yang dicatat ke log server hanya kode status.
- **Bukti:** SOURCE VERIFIED (`src/convex/auth/emailOtp.ts`),
  TEST VERIFIED (`src/convex/otp-provider-security.test.ts`), dan sweep
  kredensial di `src/`, `e2e/`, `docs/`, `tmp/`, serta `dist/` tidak menemukan
  literal kredensial di luar nilai sintetis pada test.
- **KEPOSISIAN YANG BERUBAH (Fase 9.2, 2026-09-30):** nilai
  `VLY_EMAIL_OTP_API_KEY` adalah kredensial **bawaan platform Freebuff**, bukan
  kunci privat proyek ini. Dikonfirmasi oleh tim Freebuff lewat kanal komunitas
  resmi atas nama deployer platform. Konsekuensinya untuk audit ini:
  - **Tidak ada rotasi yang bisa dilakukan, oleh siapa pun di proyek ini.**
    Tidak ada dasbor penyedia yang dimiliki operator untuk mencabut kunci itu.
    Menandainya `OPEN - OPERATOR ACTION REQUIRED` (P0) berarti menunggu
    tindakan yang mustahil, dan P0 yang tak bisa ditutup melatih semua orang
    untuk mengabaikan P0.
  - Yang bocor bukan rahasia proyek, melainkan nilai default yang dipakai
    bersama. Risiko sisanya adalah penyalahgunaan kuota penyedia milik
    platform, bukan takeover akun.
  - **Inti temuan yang sebenarnya adalah jalur kebocorannya**, yaitu
    `JSON.stringify(error)` yang menyalin header `x-api-key` ke respons
    pemanggil anonim. Jalur itu sudah ditutup di kode dan dikunci test.
- **Mengapa perbaikan kode tetap dipertahankan:** membaca dari env berarti
  repository tidak memuat nilai literal, dan bila Freebuff suatu saat
  menggantinya, proyek mengambil nilai baru tanpa perubahan kode.
- **Sisa yang jujur:** nilai masih dapat dibaca siapa pun yang punya akses
  repository. Rewrite sejarah Git tetap tidak direkomendasikan: risikonya lebih
  besar dari nilai kuncinya sendiri.
- **Status:** `RISK ACCEPTED - PLATFORM MANAGED` (bukan `CLOSED`: nilai masih
  ada di riwayat Git; bukan `OPEN`: tidak ada tindakan tersisa yang bisa
  dikerjakan).

## F-02 — `vendors:getImageUrl` membaca blob storage apa pun

- **Kode sekarang:** FIXED di Fase 9. `storageId` hanya dilayani kalau server
  bisa membuktikan blob itu foto yang tayang: `photoId` dari listing `active`,
  atau baris `vendorPhotos` yang aktif dan disetujui. Selain itu jawabannya
  `null`, bukan error.
- **Verifikasi ulang Fase 9.1:** DEPLOYMENT VERIFIED.
  `tmp/qa-p91-closure-evidence.json` ->
  `publicSurface.unknownStorageId = {status: 200, value: null}` untuk storage id
  sintetis yang tidak ada.
- **Status:** `CLOSED`.

## F-03 — Paket listing draft terbaca siapa pun

- **Kode sekarang:** FIXED di Fase 9. `community:listPackages` hanya
  mengembalikan paket untuk listing `active` atau pemanggil yang berhak.
- **Verifikasi ulang:** TEST VERIFIED (`security-surface.test.ts`),
  DEPLOYMENT VERIFIED (permintaan paket untuk listing aktif tidak membocorkan
  draft di probe).
- **Status:** `CLOSED`.

## F-04 — Metadata moderasi bocor ke pembaca anonim

- **Kode sekarang:** FIXED di Fase 9. `moderationNote`, `moderatedBy`,
  `moderationStatus`, dan `storageId` tidak lagi ikut pada
  `community:listVendorPhotos` untuk pembaca tanpa sesi.
- **Verifikasi:** TEST VERIFIED, dan `public-data-surface.test.ts` mengunci
  bentuk field yang dikirim.
- **Status:** `CLOSED`.

## F-05 — Papan permintaan publik mengirim pengenal akun warga

- **Kode sekarang:** MITIGATED. `requesterId` hanya ikut kalau pemanggil punya
  sesi, dan `offeredBy` tidak lagi ikut pada papan publik. Bukti:
  `publicSurface.requestBoard.exposesRequesterId = false` pada probe.
- **Sisa yang jujur:** `requesterName` dan koordinat listing masih publik, dan
  itu **keputusan produk**, bukan cacat teknis. Nama pemohon yang tampil tanpa
  persetujuan adalah paparan yang nyata.
- **Tindakan:** `docs/security/PII-DECISION-REGISTER.md` R-1 dan R-2. Agent
  tidak memilih jawabannya; mengubahnya tanpa keputusan akan mengubah semantik
  produk secara diam-diam.
- **Status:** `DECISION REQUIRED`.

## F-06 — Penghitung publik dapat dipanggil tanpa batas

- **Kode sekarang:** FIXED. `incrementClick` dan `recordSearch` punya plafon
  global per jam yang diukur dari indeks `analyticsEvents.byEvent`, bukan dari
  pengenal kiriman. `analytics.track` punya plafon per perangkat.
- **Bukti:** TEST VERIFIED (`security-surface.test.ts` mengunci bahwa panggilan
  setelah plafon tidak menambah hitungan).
- **Dampak ke pengguna, diverifikasi dari kode:** nol. Saat plafon terlampaui,
  `incrementClick` mengembalikan `undefined` (`:788`) dan `recordSearch`
  mengembalikan `0` (`:816`) - keduanya tanpa melempar error, jadi tidak ada
  spinner, toast, atau "coba lagi nanti" di layar. Kotak pencarian tetap
  menyaring dan tombol WhatsApp tetap membuka `wa.me`. Yang berhenti hanya
  **pencatatan**; `searchImpressions` dan `whatsappClicks` adalah metrik
  internal (`vendors.ts:151`) dan tidak pernah tampil di katalog publik.
- **Sisa yang jujur:** angka di dasbor managerial bisa dibekukan oleh skrip
  yang memanggil kedua mutasi itu berulang. Sisa kuota pemanggilan fungsi juga
  tetap bisa dikonsumsi, karena setiap panggilan tetap melakukan satu
  `ctx.db.get` dan satu pembacaan indeks. Itu ketersediaan, bukan kerahasiaan.
- **Status:** `MITIGATED` - batas yang diminta sudah ada dan teruji, dan
  sisa risikonya adalah pembekuan metrik, bukan penolakan layanan.

## F-07 — Pesan error ke pemublik memuat detail server

- **Kode sekarang:** FIXED sebagian. Semua penolakan yang bisa dipanggil
  pemanggil anonim memakai `ConvexError` lewat `denied()`, sehingga field
  `errorData` hanya berisi kalimat yang memang ditujukan untuk pemanggil.
- **Bukti baru Fase 9.1 (DEPLOYMENT VERIFIED, hasil negatif):**
  `tmp/qa-p91-closure-evidence.json` ->
  `errorDisclosure.errorDataIsPublicSafe = true`, tetapi
  `errorMessageMentionsSourcePath = true` dan
  `errorMessageMentionsStackFrames = true`. Bentuk respons pada deployment
  dev masih memuat `../../src/convex/access.ts:32:0` di field
  `errorMessage`. Klien yang jujur hanya boleh membaca `errorData`.
- **Mengapa tidak ditutup:** `errorMessage` diisi oleh lapisan platform, bukan
  oleh kode aplikasi. Tidak ada kode aplikasi yang mengosongkannya. Perilaku
  deployment produksi tidak bisa diuji karena tidak ada origin produksi yang
  otoritatif di repositori.
- **Status:** `MITIGATED` - `FIXED IN CODE — DEPLOYMENT NOT VERIFIED` untuk
  produksi, dan `DEPLOYED — EKSPOSUR TERBUKTI MASIH ADA DI DEV` untuk yang
  terukur.

## F-08 — Jalur pemulihan admin sudah dimatikan

- **Kode sekarang:** SENGAJA TIDAK DIUBAH. `users.bootstrapAdministrator` dan
  test pemulihannya harus tetap ada; menghapusnya demi membuat status terlihat
  bersih akan menghapus kemampuan pemulihan proyek. Yang dimatikan adalah
  allowlist di environment, bukan kemampuannya.
- **Bukti sebelum (DEPLOYMENT VERIFIED):** `tmp/qa-p91-closure-evidence.json` ->
  `bootstrap.available.body.value = {"available": true}` dan
  `bootstrap.setupStatus.body.value.staffCount = 3`,
  `hasAnyStaff = true`. Jalur pemulihan aktif, dan tidak lagi dibutuhkan karena
  sudah ada tiga pengelola.
- **Tindakan:** hapus `STAFF_BOOTSTRAP_EMAILS` dari Keys. Prosedur lengkap di
  `PHASE-9.1-OPERATOR-RUNBOOK.md` bagian F-08.
- **Bukti sesudah (OPERATOR VERIFIED):** operator menghapus variabel tersebut,
  lalu `node tmp/qa-p91-closure-probe.mjs` mengukur ulang pada 2026-09-30T19:16:22Z:

  ```
  bootstrap available : {"available":false}
  staff count         : 3 | hasAnyStaff: true
  PROBE_EXIT=0
  ```

  Dua hal dibuktikan sekaligus, dan keduanya penting. Allowlist benar-benar
  hilang (`available: false`), dan tiga pengelola **tetap ada** (`staffCount: 3`)
  - pengeuwapan di runbook tidak terpicu, jadi variabelnya tidak perlu
  dikembalikan. Kalau `staffCount` turun ke 0, langkah itu akan berarti
  allowlist itu yang membuat ketiga pengelola eksis, dan variabelnya harus
  dikembalikan.
- **Yang TIDAK berubah:** `users.bootstrapAdministrator` dan test
  pemulihannya. `bun run test` tetap hijau, jadi kemampuan memulihkan akses
  admin kalau semua pengelola hilang masih utuh.
- **Status:** `CLOSED — OPERATOR VERIFIED` (termasuk hitungan `CLOSED` di
  "Ringkasan Angka" pada `PHASE-9.1-SECURITY-CLOSURE-REPORT.md`).

## F-09 — Route HTTP tidak tersedia pada origin yang diuji

- **Koreksi Fase 9.1 (DEPLOYMENT VERIFIED):** temuan ini salah mengukur.
  Route HTTP Convex dilayani di origin `.convex.site`, bukan `.convex.cloud`.
  Probe `tmp/qa-p91-closure-probe.mjs` mengukur keenam route di kedua origin:
  - `.convex.cloud`: `/sitemap.xml` 404, `/robots.txt` 404,
    `/admin-gate/context` 404. Ini **EXPECTED 404 AT THIS ORIGIN**.
  - `.convex.site`: `/sitemap.xml` 200, `/robots.txt` 200,
    `/admin-gate/context` GET 405 dan POST 200, `/webhook/whatsapp` 405,
    `/twilio/status` POST 403 (gagal tertutup, signature tidak dikonfigurasi).
- **Arsitektur tidak diubah.** Tidak ada route yang dipindahkan, tidak ada
  service worker, tidak ada fallback SPA. Yang diperbaiki adalah klaim di
  laporan: route hidup, dan itu sudah lama terdokumentasi di
  `src/lib/admin-gate-client.ts`.
- **Verifikasi webhook (DEPLOYMENT VERIFIED):** tanpa signature 403, signature
  salah 403, verify token salah 403, Twilio signature salah 403. Tidak ada
  kegagalan yang membuka pintu.
- **Sisa yang jujur:** origin produksi belum diuji. Status produksi untuk
  temuan ini adalah `DEPLOYED — EXTERNAL VERIFICATION PENDING`.
- **Status:** `CLOSED` untuk deployment yang diuji.

## F-10 — Penaburan katalog dapat dipanggil tanpa sesi

- **Kode sekarang:** SENGAJA TIDAK DIUBAH. `ensureCatalogSeeded` adalah bootstrap
  deployment pertama. Mengubahnya ke mekanisme internal berisiko merusak
  deployment baru tanpa mencegah dampak keamanan yang nyata: fungsi ini hanya
  menulis baris katalog seed yang isinya sudah ada di repo.
- **Alasan penerimaan risiko:** tidak ada PII, tidak ada akses lintas pengguna,
  dampaknya paling buruk adalah data seed tertulis ulang.
- **Status:** `RISK ACCEPTED`.

## F-11 — Header keamanan dan CORS belum terverifikasi

- **Kode sekarang (bagian yang bisa dikerjakan):**
  - Route `/admin-gate/context` sekarang selalu mengirim `vary: Origin` dan
    `x-content-type-options: nosniff`. DEPLOYMENT VERIFIED di probe: keduanya
    terlihat pada respons 204 dan 200.
  - Route webhook tidak mengirim header CORS apa pun.
  - Tidak ada route yang mengirim `access-control-allow-credentials`.
  - CORS dapat dipersempit ke daftar origin eksplisit melalui
    `ADMIN_CONTEXT_ALLOWED_ORIGINS`. Selama kosong, wildcard tanpa credentials
    tetap dipakai, supaya Security Desk tidak kehilangan metadata IP.
- **Percobaan yang gagal dan alasannya:** `SITE_URL` sempat dicoba sebagai
  allowlist. Probe `tmp/qa-p91-cors-allowlist-evidence.json` membuktikan pada
  deployment yang diuji `SITE_URL` menunjuk origin `.convex.site` itu sendiri,
  bukan frontend. Memakainya membuat beacon kehilangan akses. `SITE_URL` kini
  sama sekali tidak menyentuh kode CORS, dan ada regression test yang mengunci
  hal itu.
- **Bagian yang tidak bisa dikerjakan agent:** header pada origin frontend.
  Origin frontend produksi tidak ada di repositori, dan tidak ada
  `vercel.json`/konfigurasi header di repo. Kebijakan CSP yang sudah disusun dari
  inventaris sumber ada di runbook, lengkap dengan catatan apa yang belum boleh
  diketatkan (`unsafe-eval`) dan apa yang kemungkinan masih perlu dilonggarkan
  (`style-src 'unsafe-inline'`).
- **Status:** `MITIGATED` untuk route milik aplikasi;
  `BLOCKED — NO AUTHORITATIVE PRODUCTION FRONTEND ORIGIN` untuk header frontend.

## F-12 — `submitFeedback` tanpa rate limit

- **Kode sekarang:** FIXED di Fase 9.1.
  - Batas per akun: 5 masukan per jam, dihitung dari baris `users` milik sesi.
  - Plafon global: 200 masukan per jam untuk sisanya, dihitung dari indeks
    `notifications.byKindCreatedAt`.
  - Batas isi: judul 3-160 karakter, isi 10-2.000 karakter, email dipotong 200.
  - Fungsi **tidak menerima argumen identitas apa pun**, jadi tidak ada yang
    bisa memalsukan atau merotasi hitungan. Bukti: test menolak
    `userId`, `anonymousId`, dan `kind` di lapisan validasi.
  - Penolakan memakai `denied()`, jadi tidak pernah jadi "Server Error" dengan
    stack trace.
- **Bukti bahwa test mengunci perbaikan:** dengan batasnya dinonaktifkan
  sementara, 3 test gagal; dengan batas aktif, semuanya lulus.
- **Status:** `CLOSED`.

## F-13 — PII di metadata audit

- **Kode sekarang:** SENGAJA TIDAK DIUBAH. Metadata audit menyimpan cukup
  konteks untuk menyelidiki insiden. Dipangkas atau dihapus, jejaknya jadi tidak
  berguna.
- **Mitigasi yang sudah ada:** metadata audit hanya terbaca oleh peran pengaudit,
  dan nilai sensitif di dalam pesan error disanitasi oleh
  `src/lib/error-reporting.ts` (`redactText`), yang punya test sendiri.
- **Status:** `RISK ACCEPTED`.

## F-14 — Pengelola dapat memasang `photoId` storage id mana pun

- **Kode sekarang:** FIXED di Fase 9.1. `requireAssignablePhoto` di
  `src/convex/access.ts` menolak storage id yang:
  1. tidak ada di storage,
  2. bukan gambar atau melebihi batas ukuran,
  3. adalah bukti klaim (`listingClaims.byEvidenceStorageId`),
  4. adalah dokumen cadangan (`backupRuns.byStorageId`),
  5. adalah foto profil (`users.byProfileImageStorageId`).
  Dijalankan di `vendors.createVendor`, `vendors.updateVendor`, dan
  `community.createVendorPhoto` - jalur galeri juga berakhir jadi foto publik,
  jadi aturan yang sama wajib berlaku di sana.
- **Tiga indeks baru ditambahkan** (`byEvidenceStorageId`,
  `byProfileImageStorageId`, `byKindCreatedAt`) supaya ketiga pemeriksaan itu
  satu pembacaan indeks, bukan pemindaian tabel. Penambahan indeks bersifat
  aditif dan tidak mengubah data.
- **Yang tidak diperiksa dan alasannya:** "apakah pemanggil mengunggah blob ini
  sendiri". Blob foto listing tidak punya tabel kepemilikan, jadi aturan itu
  hanya akan jadi tebakan, dan tebakan yang terlalu ketat akan memotong alur
  moderasi yang sah. Aturan yang dipakai adalah "boleh ditayangkan".
- **Bukti bahwa test mengunci perbaikan:** dengan helper dinonaktifkan
  sementara, 5 test gagal (bukti klaim, cadangan, foto profil, id karangan,
  galeri); dengan helper aktif, semuanya lulus.
- **Status:** `CLOSED`.

## F-15 — `dangerouslySetInnerHTML` pada kode mati

- **Verifikasi (SOURCE VERIFIED):** satu-satunya kemunculan
  `dangerouslySetInnerHTML` di repo ada di `src/components/ui/chart.tsx`.
  Tidak ada berkas aplikasi yang mengimpor berkas itu. Rujukannya ada dua,
  dan keduanya harus disebut apa adanya:
  - `src/components/ui/index.ts:90` - **re-export yang AKTIF**:
    `export { ... } from "./chart"`.
  - `src/components/ui/index.ts:116` - komentar contoh lazy loading.

  Catatan koreksi: versi dokumen sebelumnya menyebut satu-satunya rujukan ada
  di dalam komentar. Itu tidak tepat - baris 90 adalah re-export nyata, hanya
  tidak terpakai karena tidak ada berkas aplikasi yang mengimpor barrel
  `@/components/ui`. Yang membuat jalur ini mati adalah ketiadaan pemakai
  barrel, bukan tidak adanya re-export.
- **Bukti pendukung (BUILD VERIFIED):** `recharts` memiliki 0 kemunculan di
  seluruh chunk `dist/assets/`, dan pencarian
  `from "@/components/ui"` di `src/` hanya menemukan baris di dalam
  `index.ts` itu sendiri.
- **Kesimpulan:** tidak ada sumber data yang mengalir ke sink itu, jadi tidak
  ada payload yang bisa sampai ke sana. Tidak ada XSS yang bisa dieksploitasi
  melalui jalur ini.
- **Eksekusi Fase 9.2 (Tier 4 - SOURCE + BUILD VERIFIED):** `chart.tsx`
  dihapus, re-export di `src/components/ui/index.ts:90` dibuang, entri
  `'charts': ['recharts']` di `vite.config.ts` dihapus, dan dependensi
  `recharts` dicabut dari `package.json` lalu lockfile diperbarui.
  `grep -rl recharts dist/` = **0 berkas**.
- **Pagar yang ditambahkan:** `eslint.config.js` sekarang punya
  `no-restricted-imports` yang menolak `@/components/ui` (path maupun pola).
  Aturan ini **dibuktikan bekerja**: impor barrel yang disengaja membuat
  `bun run lint` gagal dengan pesan yang menyebut F-15, dan dihilangkan begitu
  berkas dikembalikan. Impor per komponen (`@/components/ui/button`) tetap
  boleh - itu bentuk yang dipakai seluruh repo.
- **Status:** `CLOSED`. Tidak ada lagi `dangerouslySetInnerHTML` di repo.

## F-16 — Token sesi di `localStorage`

- **Penilaian Fase 9.1 (SOURCE VERIFIED):** tidak ditemukan XSS yang dapat
  dieksploitasi. Yang diperiksa:
  - `dangerouslySetInnerHTML`: hanya kode mati (F-15).
  - `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`:
    tidak ada di `src/`.
  - Tidak ada pustaka markdown/HTML yang merender konten pengguna.
  - `?returnTo=` dari URL: dibaca oleh `resolveRedirectAfterAuth` yang hanya
    menerima nilai yang diawali `/` dan bukan `//`, lalu dipakai lewat
    `navigate()` React Router, bukan `href` mentah. Ini menutup open redirect
    dan tidak pernah jadi HTML.
  - `RequireAuth` menyusun ulang `returnTo` dengan `encodeURIComponent`.
  - React meng-escape teks secara default; tidak ada titik keluar dari itu.
- **Kesimpulan:** mengganti arsitektur penyimpanan token berarti mengganti
  arsitektur auth, dan tidak ada XSS yang membenarkan pertukaran itu. Dibiarkan,
dengan catatan bahwa mitigasi XSS **belum** dianggap selesai: tidak ada CSP
di origin frontend, dan CSP adalah pengaman yang paling berharga untuk menutup
risiko token di `localStorage`.
- **Status:** `RISK ACCEPTED`.

## F-17 — Cacat test E2E dua sesi

- **Temuan sebelumnya:** `e2e/flows.spec.ts` mencari label "sandi/password",
  sedangkan auth proyek memakai OTP email. Test itu dilewati, bukan diperbaiki.
- **Posisi Fase 9.1:** tidak menambahkan autentikasi password. Memperbaiki
  arsitektur auth demi menghijaukan test adalah perubahan semantik yang
  dilarang. Yang perlu adalah infrastruktur test: mailbox uji yang menangkap
  OTP, atau penyedia khusus test. Keduanya butuh kredensial dan environment
  yang tidak dimiliki agent.
- **Status:** `OPEN — TEST INFRASTRUCTURE GAP`.

---

## Yang tidak berubah dan sengaja tidak disentuh

- Arsitektur WhatsApp Fase 8: admin memakai handoff `wa.me`, status handoff
  tidak pernah menjadi `sent` atau `delivered`, `ADMIN_WHATSAPP_NUMBER` tetap
  satu sumber nomor, dan `handoffUrl` tetap tidak masuk query publik.
- Integrasi WhatsApp warga lewat penyedia tetap berjalan dan tidak diubah.
- Notifikasi warga, arsitektur pagination, mascot, brand, dan SEO tidak
  disentuh; tidak ada regresi keamanan yang membenarkan sentuhan ke sana.
