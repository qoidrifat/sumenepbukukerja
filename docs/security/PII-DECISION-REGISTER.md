# Register Keputusan PII

Status: **R-1 dan R-5 SELESAI. R-2, R-3, R-4 masih DECISION REQUIRED.**

Dokumen ini sengaja **tidak** memilih jawaban. Tiga field di bawah masih
memakai eksposur yang sekarang, dan tidak ada yang bisa diputuskan dari kode:
keputusan "apakah nama pemohon boleh tampil di papan publik" adalah keputusan
produk dan kebijakan privasi, bukan keputusan teknis.

Yang dilakukan di sini:

1. Mencatat kondisi sekarang dengan bukti, bukan dengan asumsi.
2. Menuliskan opsi beserta konsekuensi teknis masing-masing.
3. Menandai siapa yang memutuskan dan kapan.

Kalau tidak ada keputusan, eksposur sekarang tetap berlaku. Itu bukan
rekomendasi; itu status.

---

## R-1 — `requesterName` pada papan permintaan publik

| Kolom | Isi |
|---|---|
| Field | `serviceRequests.requesterName` (string, wajib) |
| Eksposur sekarang | Publik. Dikembalikan `community:listRequests` untuk pembaca tanpa sesi. |
| Bukti | `tmp/qa-p91-closure-evidence.json` -> `publicSurface.requestBoard.exposesRequesterName = true` pada dua origin dan dua waktu ukur. |
| Tujuan bisnis | Papan permintaan gratis: warga menawar jasa tanpa harus membuat akun dulu. Nama di papan membuat satu sama lain saling mengenali dan mengurangi pesan tak berbalas. |
| Risiko privasi | Nama orang nyata tampil tanpa persetujuan eksplisit di halaman yang bisa diindeks dan dibagikan. Rate of disclosure lebih tinggi daripada nomor telepon. |
| Opsi | (a) Tetap publik apa adanya. (b) Inisial saja, misalnya "S." + nama belakang. (c) Alias otomatis per permintaan, misalnya "Warga 4A2C". (d) Publik hanya bila pemohon menyetujui lewat checkbox; default-nya alias. |
| Konsekuensi teknis | (b) dan (c) gratis: bentuknya dihitung saat query, tanpa skema baru. (d) memerlukan satu kolom boolean baru plus alur persetujuan di UI, dan perlu keputusan tentang permintaan lama yang belum pernah ditanyakan. |
| Yang TIDAK boleh dilakukan | Menyembunyikan field di CSS, atau mengirim nama lalu memfilter di frontend. Keduanya bukan pengaman privasi. |
| Pemilik keputusan | Product owner, dengan nilai privasi |
| Keputusan | **(a) Tetap publik apa adanya.** 2026-09-30. Alasan yang dicatat: papan permintaan gratis adalah produk; nama membuat warga saling mengenali dan mengurangi pesan tak berbalas, dan nilainya untuk moderasi. Eksposur diterima dengan sadar, bukan diabaikan. |
| Tanggal keputusan | 2026-09-30 |
| Dampak kode | **NOL perubahan.** `community:listRequests` sudah tidak mengirim `requesterId` (Fase 9) dan nama yang dikirim berasal dari `publicName` turunan, bukan `users.name` maupun email (Fase 9.2 Tier 5). Opsi (a) tidak menambah beban baru. |
| Catatan Tier 5 | Kolom koreksi "Nama Anda di papan permintaan" (`src/components/display-name-field.tsx`) tetap ada dan tetap publik. Jadi pengguna bisa memilih apa yang dilihat orang lain - ini membuat opsi (a) lebih baik daripada bentuk (a) yang asli, karena eksposurnya sekarang bisa disetel sendiri oleh pemiliknya. |
| Sisa risiko yang diterima | Nama orang nyata tampil tanpa persetujuan eksplisit di halaman yang bisa diindeks. Rate of disclosure lebih tinggi dari nomor telepon. Mitigasi yang tersedia: kolom koreksi sekali, dan keputusan tidak menutup kemungkinan ada permintaan penghapusan nama di kemudian hari. |

---

## R-2 — `lat` / `lng` pada listing dan permintaan

| Kolom | Isi |
|---|---|
| Field | `vendors.lat`, `vendors.lng` (number, opsional) |
| Eksposur sekarang | Publik di katalog dan profil listing. `serviceRequests` tidak lagi mengirim koordinat presisi ke pembaca publik (perbaikan Fase 9). |
| Bukti | `tmp/qa-p91-closure-evidence.json` -> `publicSurface.catalogInternalFieldsLeaked = []` dan `requestBoard.exposesPreciseCoordinates = false`. `public-data-surface.test.ts` mengunci keduanya. |
| Tujuan bisnis | Urutan "terdekat" dan tampilan jarak untuk pengguna yang membuka katalog. |
| Risiko privasi | Koordinat presisi memungkinkan menyimpulkan lokasi rumah untuk listing yang beralamat rumah, bukan toko. Untuk usaha, risikonya rendah; untuk listing yang beralamat rumah, risikonya nyata. |
| Opsi | (a) Tetap publik. (b) Bulatkan sebelum dikirim (misalnya 3 desimal ~ 110 m), hitung jarak dari nilai asli di server. (c) Kirim jarak relatif saja, tanpa koordinat. (d) Publik hanya untuk listing yang sudah diverifikasi. |
| Konsekuensi teknis | (b) memerlukan pembulatan di proyeksi query; `lat`/`lng` asli tetap di database untuk perhitungan jarak, jadi tidak ada kehilangan data. (c) memerlukan perubahan bentuk respons dan penyesuaian UI. (d) memerlukan pembacaan status verifikasi di query, sudah tersedia. |
| Yang TIDAK boleh dilakukan | Menghapus koordinat dari database, atau menyimpannya dalam bentuk yang tidak bisa dihitung ulang tanpa sengaja. |
| Pemilik keputusan | Product owner |
| Keputusan | (kosong) |
| Tanggal keputusan | (kosong) |

---

## R-3 — Nomor WhatsApp listing

| Kolom | Isi |
|---|---|
| Field | `vendors.phone` (string, wajib) |
| Eksposur sekarang | Publik di katalog. Ini adalah **produk**: seluruh nilai dan fungsi katalog adalah "hubungi via WhatsApp". |
| Bukti | `public-data-surface.test.ts` secara eksplisit mengharapkan `phone` ada di katalog publik, dan `src/convex/alert-recipient-security.test.ts` menjaga nomor tujuan admin tetap di satu berkas. |
| Tujuan bisnis | Nomor adalah kontak yang dicari pengguna. Menyingkirkannya menghapus nilai produk. |
| Risiko privasi | Nomor usaha publik adalah normal di direktori bisnis. Nomor pribadi yang dipakai pemilik listing memiliki risiko scraper lebih tinggi. |
| Opsi | (a) Status quo. (b) Nomor hanya untuk listing terverifikasi; listing belum terverifikasi memakai tombol "Hubungi lewat platform". (c) Nomor ditampilkan apa adanya dengan catatan aturan main yang disetujui pemilik listing. |
| Konsekuensi teknis | (b) memerlukan field penanda "nomor milik usaha" atau memakai `verified`, dan penyesuaian komponen katalog. Tidak ada obstacle teknis yang berarti. |
| Yang TIDAK boleh dilakukan | Mengirim nomor lalu menutupinya dengan `display: none`, atau mengaburkan sebagian lalu tetap mengirim angka penuh di payload. |
| Pemilik keputusan | Product owner |
| Keputusan | (kosong) |
| Tanggal keputusan | (kosong) |

---

## R-4 — Nama dan lokasi pada data moderasi internal

| Kolom | Isi |
|---|---|
| Field | `listingClaims.requesterId`, `whatsappPhone`, `email`, `businessAddress`; `moderationNote`, `moderatedBy` pada `vendorPhotos` |
| Eksposur sekarang | Terotorisasi. Hanya terlihat oleh pengelola lewat `requireManagementViewer` atau `requireStaff`. Tidak pernah keluar ke pembaca publik. |
| Bukti | `security-surface.test.ts` mengunci bahwa `moderatedBy`, `moderationNote`, `moderationStatus`, dan `storageId` tidak ada di `community:listVendorPhotos` untuk pembaca tanpa sesi. |
| Tujuan bisnis | Moderasi klaim butuh data bukti. Moderator memang harus melihat nomor dan alamat pemohon. |
| Risiko privasi | Rendah pada peran yang benar; tinggi kalau ada pengelola yang menyalahgunakan akses. |
| Opsi | (a) Status quo dengan audit log yang sudah ada. (b) Tambahkan expiry khusus data klaim lebih cepat daripada data bisnis lain. |
| Konsekuensi teknis | (a) tidak ada perubahan. (b) penyesuaian di `data-retention.ts` dan perlu keputusan berapa lama bukti klaim disimpan. |
| Pemilik keputusan | Product owner + admin proyek |
| Keputusan | (kosong) |
| Tanggal keputusan | (kosong) |

---

## R-5 — Jalur lupa sandi dan penghapusan jalur OTP

| Kolom | Isi |
|---|---|
| Field | `users.email` (alamat masuk warga), akun Firebase yang menyimpan kata sandi |
| Eksposur sekarang | Tidak ada yang membedakan email terdaftar dari email tidak terdaftar di layar reset. Pesan suksesnya sama persis untuk keduanya, dan kode `auth/user-not-found` ditelan sebelum sempat sampai ke peramban. |
| Bukti | `src/lib/firebase-client.ts` (`requestPasswordReset`, `RESET_SENT_MESSAGE`), `src/pages/Auth.tsx` (`RESET_SENT`), dan `src/pages/auth-password-reset.test.ts` yang mengunci kedua kalimat itu identik. |
| Tujuan bisnis | Warga yang lupa kata sandi tidak boleh buntu permanen. Keadaan sebelumnya: satu-satunya jalan masuk adalah kode OTP, dan kunci pengirimnya tidak bisa dibuat ulang di akun pemilik. |
| Risiko privasi | Kalau layar reset membedakan email terdaftar dan tidak, `/auth` berubah jadi alat pemetaan: siapa pun bisa mengetes apakah seorang warga punya akun di aplikasi ini, satu per satu. |
| Opsi | (a) Satu pesan untuk semua orang. (b) Bedakan secara eksplisit. (c) Tambahkan verifikasi Captcha untuk membatasi laju. |
| Konsekuensi teknis | (a) tanpa perubahan, sudah dikerjakan. (b) tidak boleh. (c) memerlukan layanan pihak ketiga baru dan hanya membatasi laju tebakan, bukan enumerasinya. |
| Yang TIDAK boleh dilakukan | Menampilkan "email tidak terdaftar" dari kode Firebase apa pun, lewat halaman ini maupun lewat pesan error lain. |
| Pemilik keputusan | Product owner |
| Keputusan | **(a) satu pesan untuk semua orang, sekalian menghapus jalur OTP.** 2026-10-01. Dua hal diputuskan bersama: provider `email-otp` dihapus karena kuncinya tidak bisa dibuat ulang dan jalur yang terdaftar tapi pasti gagal lebih buruk daripada tidak ada; lupa sandi diisi memakai email Firebase sendiri dengan kuota 1.000/hari, tanpa menambah layanan baru. |
| Tanggal keputusan | 2026-10-01 |
| Langkah berikutnya | Kalau data menunjukkan banyak warga tanpa akun Google, langkah berikutnya adalah magic link lewat Resend - sebagai tambahan, bukan pengganti, dan hanya setelah keadaan sekarang stabil. |
| Dampak kode | `requestPasswordReset` dan `completePasswordReset` di `src/lib/firebase-client.ts`, `src/components/reset-password-form.tsx`, dan cabang `oobCode` di `src/pages/Auth.tsx`. |

---

## Aturan yang berlaku sampai ada keputusan

- Tidak ada perubahan kode pada R-1 sampai R-3 tanpa keputusan tertulis di
  tabel di atas.
- Kalau keputusan diambil, perubahannya harus disertai regression test di
  `security-surface.test.ts` atau `public-data-surface.test.ts` yang mengunci
  bentuk baru, dan diukur ulang dampaknya ke `bun run test` dan
  `bun run test:e2e`.
- Enkripsi field **tidak** adalah jawaban untuk R-1 sampai R-3. Data ini harus
  tetap terbaca server untuk fitur yang berjalan; yang menentukan paparan adalah
  batas akses dan bentuk data, bukan enkripsi at rest.
- R-5 SUDAH punya keputusan tertulis. Aturan yang mengikat: pesan reset sandi
  tidak boleh pernah membedakan email terdaftar dan tidak, di halaman maupun di
  modul klien. Kalau suatu saat perlu diubah, ikut sertakan test yang mengunci
  bentuk barunya.
