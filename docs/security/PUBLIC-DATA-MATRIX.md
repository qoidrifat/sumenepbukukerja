# Matriks Data Publik — Fase 9

Audit Public PII & Security Hardening, 30 September 2026.
Semua isi dokumen ini diturunkan dari kode sumber yang sedang berjalan
(`src/convex/*.ts`, `src/lib/*.ts`, `src/components/*.tsx`, `public/sw.js`),
dibuktikan dengan probe read-only ke deployment dan regression test.

Legenda:

- **Ya** = field benar-benar sampai ke pihak yang disebut.
- **Tidak** = field tidak pernah dikirim ke pihak itu.
- **Saja** = hanya untuk pihak itu, tanpa pihak lain.
- **plaintext** / **hash** / **redacted** = bentuk penyimpanan di database.
- **Tidak dipakai** = field ada di skema tetapi tidak pernah keluar ke mana pun.

---

## 1. Akses per peran

| Data | Anonim | Warga | Staff | Management | Admin | Penyimpanan |
|---|---:|---:|---:|---:|---:|---|
| Nama usaha, kategori, deskripsi | Ya | Ya | Ya | Ya | Ya | plaintext |
| Alamat & patokan wilayah usaha | Ya | Ya | Ya | Ya | Ya | plaintext |
| Nomor WhatsApp **usaha** | Ya | Ya | Ya | Ya | Ya | plaintext |
| Harga, jam buka, rating, tag | Ya | Ya | Ya | Ya | Ya | plaintext |
| Koordinat listing (lat/lng) | Ya | Ya | Ya | Ya | Ya | plaintext |
| Foto listing aktif | Ya | Ya | Ya | Ya | Ya | storage bertanda tangan |
| Foto listing draft / terpending | Tidak | Saja (pemilik) | Ya | Ya | Ya | storage bertanda tangan |
| `ownerId` listing | Tidak | Saja (pemilik) | Ya | Ya | Ya | plaintext |
| `businessId`, `subscriptionTier` | Tidak | Saja (pemilik) | Ya | Ya | Ya | plaintext |
| `whatsappClicks`, `shareClicks`, `searchImpressions` | Tidak | Saja (pemilik) | Ya | Ya | Ya | plaintext |
| Nama pembuat permintaan warga | Ya | Ya | Ya | Ya | Ya | plaintext |
| `requesterId` permintaan | **Tidak** (sejak Fase 9) | Ya (punya sesi) | Ya | Ya | Ya | plaintext |
| `offeredBy` pada tawaran | **Tidak** (sejak Fase 9) | Ya (punya sesi) | Ya | Ya | Ya | plaintext |
| Koordinat permintaan warga | Ya | Ya | Ya | Ya | Ya | plaintext |
| Paket listing **aktif** | Ya | Ya | Ya | Ya | Ya | plaintext |
| Paket listing **draft/arsip** | **Tidak** (sejak Fase 9) | Saja (pemilik) | Ya | Ya | Ya | plaintext |
| Catatan moderasi foto (`moderationNote`) | **Tidak** (sejak Fase 9) | Saja (pemilik) | Ya | Ya | Ya | plaintext |
| Id pengelola pemoderasi (`moderatedBy`) | **Tidak** (sejak Fase 9) | Saja (pemilik) | Ya | Ya | Ya | plaintext |
| Bukti usaha klaim (`evidenceStorageId`) | **Tidak** | Saja (pemilik) | Ya | Ya | Ya | storage bertanda tangan |
| Laporan terhadap listing sendiri (`listMyVendorReports`, tanpa identitas pelapor) | **Tidak** | Saja (pemilik listing) | Ya | Ya | Ya | proyeksi query (identitas pelapor dibuang sebelum respons) |
| Dokumen cadangan mingguan | **Tidak** | **Tidak** | **Tidak** | **Tidak** | **Tidak** | storage privat |
| Email warga | **Tidak** | Saja (diri sendiri) | Tidak | Tidak | Saja (panel pengelola) | plaintext |
| Email pengelola | **Tidak** | **Tidak** | Tidak | Ya (audit log) | Ya | plaintext + snapshot audit |
| Nomor WhatsApp warga (preferensi notifikasi) | **Tidak** | Saja (diri sendiri) | Tidak | Ya | Ya | plaintext |
| Nomor WhatsApp pada `whatsappThreads` | **Tidak** | Saja (diri sendiri) | Ya | Ya | Ya | plaintext |
| Foto profil pengelola | **Tidak** | Saja (diri sendiri) | Ya | Ya | Ya | storage bertanda tangan |
| Hash passcode, salt, hash tiket undangan | **Tidak** | **Tidak** | **Tidak** | **Tidak** | Ya (hash saja) | hash |
| Kredensial penyedia (token WhatsApp) | **Tidak** | **Tidak** | **Tidak** | **Tidak** | **Tidak** | environment |
| IP mentah | **Tidak** | **Tidak** | **Tidak** | **Tidak** | **Tidak** | tidak pernah disimpan |
| Data lokasi peramban | **Tidak** | **Tidak** | **Tidak** | **Tidak** | **Tidak** | tidak pernah dikirim |

---

## 2. Klasifikasi PII per field

| Field | Sumber | Klasifikasi | Permukaan publik | Catatan keputusan |
|---|---|---|---|---|
| `vendors.phone` | DB | **P0** (kontak usaha) | `listActive`, `getBySlug` | Produk ini adalah direktori WhatsApp; nomor usaha adalah isi produknya, bukan kebocoran. Tidak diubah. |
| `vendors.address` | DB | **P0** | `listActive`, `getBySlug` | Alamat usaha yang tercetak di katalog. |
| `serviceRequests.requesterName` | DB `users.name` | **P2** | `listRequests` | **Decision point.** Papan permintaan memang menampilkan nama pembuat. Tidak dihapus di Fase 9 karena itu keputusan produk; lihat dokumen audit bagian 8 (F-05). |
| `serviceRequests.requesterId` | DB | **P3** | dihapus di Fase 9 | Pengenal akun internal; tidak dibutuhkan papan publik. |
| `serviceRequests.lat/lng` | DB | **P2** | `listRequests` | Lokasi presisi tempat warga posted. Tidak diubah: produk memang memmatchkan Mitra berdasarkan jarak. |
| `requestOffers.offeredBy` | DB | **P3** | dihapus di Fase 9 | Sama seperti `requesterId`. |
| `vendorPhotos.moderationNote` | DB | **P3** | dihapus di Fase 9 | Catatan internal pengelola. |
| `vendorPhotos.moderatedBy` | DB | **P3** | dihapus di Fase 9 | Id akun pengelola. |
| `listingClaims.evidenceStorageId` | storage | **P3** | tidak pernah (sebelum & sesudah Fase 9) | Bukti usaha warga. Pra-Fase 9 masih bisa dibaca lewat `getImageUrl` bila id-nya diketahui; sekarang tidak. |
| `backupRuns.storageId` | storage | **P3** | tidak pernah | Isi: `vendors`, `reports`, `auditLogs`, `reviews`, `serviceRequests`, `errorReports`. Pra-Fase 9 bisa dibaca lewat `getImageUrl` bila id-nya diketahui; sekarang tidak. |
| `users.email` | DB | **P2** | tidak pernah | Hanya `myProfile` (diri sendiri) dan panel pengelola. |
| `users.profileImageStorageId` | storage | **P2** | tidak pernah | Hanya `myProfile` (diri sendiri). |
| `notificationPreferences.whatsappPhone` | DB | **P2** | tidak pernah | Hanya `getNotificationPreferences` (diri sendiri) dan jalur pengiriman internal. |
| `whatsappThreads.phone` | DB | **P2** | tidak pernah | Hanya pengelola; pembacaan status memakai identitas pemanggil. |
| `staffMembers.role` | DB | **P3** | `currentAccess` (diri sendiri) | Tidak pernah diekspos untuk orang lain. |
| `adminPasscodeConfig.hash` | DB | **P4** | tidak pernah | Hanya lewat `internalQuery` yang tidak bisa dipanggil klien. |
| `staffInvites.tokenHash` | DB | **P4** | tidak pernah | `getInviteDetails` hanya menerima token dan mengembalikan valid/tidak, bukan hash. |
| `vendor.photoId` | DB | **P3** | `getBySlug` | Pengenal storage, bukan rahasia; kini hanya berguna bersama `getImageUrl` yang sudah dibatasi. |

---

## 3. Bentuk penyimpanan (ringkas)

| Data | Bentuk | Alasan |
|---|---|---|
| Nomor WhatsApp usaha & warga | plaintext | Harus dibaca server untuk mengirim pesan dan membentuk tautan. Penyesuaian hanya dilakukan pada **permukaan**, bukan pada penyimpanan. |
| Email | plaintext | Dipakai sebagai identitas akun dan untuk invoked auth. |
| IP address | **tidak disimpan**; hanya `ipHash` (SHA-256) + `ipMasked` | `adminPasscodeAttempts`, `adminPresence`, `adminSecurityContexts` semuanya memakai bentuk tersamar. |
| Passcode admin | PBKDF2 + salt, perbandingan waktu-tetap | `src/lib/admin-passcode.ts`. |
| Tiket gerbang & undangan | SHA-256 dari token, bukan tokennya | `adminPasscodeTickets.tokenHash`, `staffInvites.tokenHash`. |
| Sesi | `sessionReference` = SHA-256 dari id sesi | Id sesi asli tidak pernah keluar ke UI. |
| Kredensial penyedia | environment saja | Setelah Fase 9 tidak ada kredensial yang ditulis literal di sumber. |

Tidak ada field yang dienkripsi di Fase 9. Alasannya ada di bagian 13 dokumen audit:
tidak ada data privat yang perlu disimpan tetapi tidak perlu dibaca server, sehingga
enkripsi akan menambah kunci dan rotasi tanpa mengurangi satu pun risiko nyata.

---

## 4. Jejak data yang diperiksa manual

```
database -> query -> response -> store klien -> komponen -> DOM
```

- **Katalog** (`listActive`, `getBySlug`): proyeksi eksplisit `toPublicCatalogVendor`,
  tidak pernah `...vendor`. Diuji `public-data-surface.test.ts` (A, A2, B, C, D, E).
- **Permintaan** (`listRequests`): formerly `...request`; sekarang `requesterId`
  dibuang sebelum dikirim, `requesterName` dipertahankan (P2, decision point).
- **Galeri** (`listVendorPhotos`): formerly `...photo`; sekarang field dipilih satu per satu.
- **Paket** (`listPackages`): dokumen utuh, tapi sudah difilter status listing.
- **Browser store**: `localStorage` hanya memuat id perangkat, id anonim analitik,
  cache katalog publik, preferensi tampilan, dan antrean offline
  (`favorites`/`availability`/`interaction`). Tidak ada token, nomor, atau email
  di `localStorage`/`sessionStorage` (`grep` di `src/`).
- **Service worker** (`public/sw.js`): tidak menangani `/api/` maupun `/convex/`,
  jadi respons query Convex tidak pernah masuk cache. Hanya shell, aset statis,
  dan gambar ber-cache.
