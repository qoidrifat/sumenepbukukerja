# Matriks Otorisasi — Fase 9

Audit Public PII & Security Hardening, 30 September 2026.
Matriks ini **dihasilkan dari kode**, bukan dari asumsi. Setiap baris menunjuk
fungsi nyata di `src/convex/` beserta gerbang yang dipanggilnya.

Legenda: **R** baca, **W** tulis, **-** ditolak, **n/a** tidak ada permukaan.

---

## 1. Fungsi gerbang

| Fungsi | Lokasi | Peran yang dibolehkan | Catatan |
|---|---|---|---|
| `requireUser` | `src/convex/access.ts:61` | siapa pun dengan sesi | menolak sesi yang sudah dicabut (`revokedAdminSessions`) |
| `requireStaff(ctx, "staff")` | `access.ts:88` | admin, staff | menolak viewer dan warga |
| `requireStaff(ctx, "admin")` | `access.ts:88` | admin | mengatur peran, undangan, passcode |
| `requireManagementViewer` | `access.ts:97` | admin, staff, viewer | baca data operasional |
| `requireVendorManager` | `access.ts:104` | pemilik listing, admin, staff | menolak viewer |
| `requireProvenIdentity` | `access.ts:138` | pengelola, pemilik draft, atau klaim terverifikasi | mengelola listing yang tayang |
| `denied` | `access.ts:27` | - | melempar `ConvexError` (Fase 9) |

Semua peran dibaca dari `staffMembers` (server-side). Peran yang dikirim klien tidak
pernah dipakai; `currentAccess` hanya melaporkan hasil pembacaan server.

---

## 2. Matriks sumber daya

| Sumber daya | Anonim | Warga | Staff | Management (viewer) | Admin |
|---|---|---|---|---|---|
| Katalog listing aktif (`vendors:listActive`) | R | R | R | R | R |
| Profil listing aktif (`vendors:getBySlug`) | R | R | R | R | R |
| Foto listing aktif (`vendors:getImageUrl`) | R | R | R | R | R |
| Foto listing draft / terpending | - | R (pemilik) | R | R | R |
| Foto galeri listing aktif (`community:listVendorPhotos`) | R | R | R | R | R |
| Paket listing aktif (`community:listPackages`) | R | R | R | R | R |
| Paket listing draft | - | R (pemilik) | R | R | R |
| Papan permintaan warga (`community:listRequests`) | R | R | R | R | R |
| `requesterId` pada papan publik | - | R (punya sesi) | R | R | R |
| Permintaan milik sendiri (`listRequests` `mine: true`) | - | R/W | R | R | R |
| Penawaran pada permintaan | - | R (pembuat permintaan atau penawar) | R | R | R |
| Ulasan listing | W (anonim, kuota harian) | W (satu per listing) | W | R | W |
| Notifikasi & preferensi warga | - | R/W sendiri | - | - | - |
| Riwayat interaksi | - | R/W sendiri | - | - | - |
| Data akun sendiri (`users:myProfile`, `currentUser`) | - | R/W sendiri | R/W sendiri | R/W sendiri | R/W sendiri |
| Upload URL foto profil | - | W | W | W | W |
| Upload URL foto listing | - | W | W | W | W |
| **Listing milik orang lain** (`updateVendor`, `archiveVendor`) | - | - | W | - (viewer) | W |
| **Buat listing sendiri** | - | W (draft) | W | - (viewer) | W |
| **Paket listing orang lain** | - | - | W | - (viewer) | W |
| **Permintaan milik orang lain** (`updateRequestStatus`, `reopenRequest`) | - | - | W | - | W |
| **Klaim listing** (`submitVendorClaim`) | - | W (jika tanpa pemilik) | W | W | W |
| **Verifikasi klaim** (`reviewVendorClaim`) | - | - | W | - (viewer) | W |
| Moderasi foto listing | - | - | W | R | W |
| Moderasi laporan warga (`updateReport`) | - | - | W | R | W |
| Daftar pengelola (`users:listStaff`) | - | - | - | - | R |
| Ubah peran pengelola | - | - | - | - | W |
| Undangan pengelola (buat/daftar/cabut) | - | - | - | - | W |
| Detail undangan (`getInviteDetails`) | R (token) | R (token) | R (token) | R (token) | R (token) |
| Terima undangan (`acceptStaffInvite`) | - | W (token) | W | W | W |
| Audit log | - | - | - | R | R |
| Riwayat perubahan listing | - | R (pemilik) | R | R | R |
| Laporan error (`listErrorReports`, `getErrorReport`) | - | - | - | R | R |
| Ubah status laporan error | - | - | W | - | W |
| Metrik komunitas & analitik | - | - | - | R | R |
| Security Desk, audit IP, presence | - | - | - | R | R |
| Preview handoff WhatsApp admin (`adminHandoffPreview`) | - | - | - | R | R |
| Ganti passcode admin | - | - | - | - | W (akun pemilik saja) |
| Cabut sesi lain | - | - | - | - | W |
| Daftar suggesi admin, handoff harian, ulang kirim | - | - | W | R | W |
| Cadangan mingguan, pangkas retensi, agregasi | - | - | - | - | hanya `internal*` |

---

## 3. Funksi tanpa sesi (permukaan publik yang disengaja)

| Fungsi | Jenis | Data yang keluar | Batas |
|---|---|---|---|
| `vendors:listActive` | query | proyeksi katalog 21 field | hanya `status: active` |
| `vendors:getBySlug` | query | proyeksi katalog + `photoId` | hanya `status: active` |
| `vendors:getImageUrl` | query | URL foto publik | hanya blob yang terbukti publik (Fase 9) |
| `community:listRequests` | query | papan permintaan | `limit` 1-100, tanpa `requesterId` untuk pemanggil tanpa sesi |
| `community:listPackages` | query | paket listing aktif | listing non-aktif dikembalikan kosong |
| `community:listVendorPhotos` | query | foto galeri aktif & disetujui | tanpa `moderationNote`/`moderatedBy` |
| `users:adminSetupStatus` | query | status setup + email akun sendiri | hanya tentang pemanggil |
| `users:bootstrapAdministratorAvailable` | query | satu boolean | tidak memuat data sensitif |
| `users:getInviteDetails` | query | validitas undangan | jawaban seragam untuk semua kegagalan |
| `adminGate:currentAdminSessionStatus` | query | status sesi sendiri | hanya tentang pemanggil |
| `vendors:ensureCatalogSeeded` | mutation | jumlah listing tersemai | perlu oleh bootstrap deployment kosong (lihat F-10) |
| `vendors:incrementClick` | mutation | - | hanya listing aktif, plafon per jam |
| `vendors:recordSearch` | mutation | jumlah vendor terhitung | maks 24 vendor per panggilan, plafon per jam |
| `vendors:addReview` | mutation | id ulasan | 1 ulasan per akun per listing; 3/hari untuk anonim |
| `community:createReport` | mutation | id laporan | duplikat 6 jam, 10 laporan/24 jam |
| `community:recordInteraction` | mutation | id interaksi | 1 per 5 menit per kombinasi |
| `vendors:submitFeedback` | mutation | id notifikasi | tidak ada batas (lihat F-14) |
| `analytics:track` | mutation | id peristiwa | 300 peristiwa/jam per perangkat |
| `errorReports:reportError` | mutation | reportId | 500 laporan baru per jam |
| `adminGate:verifyAdminPasscode` | action | tiket gerbang atau alasannya | rate limit per perangkat + plafon global |
| `adminGate:verifyAdminTicket` | action | status tiket | tiket sekali pakai, 10 menit |
| `otpEmail:status` | query | satu boolean ada/tidaknya kunci Resend | tidak memuat data, tidak membocorkan kunci |
| `otpEmail:requestCode` | action | status kiriman generik | respons seragam anti-enumeration; plafon 5/jam + cooldown 60 dtk per email |
| `vendors:ensureCatalogSeeded` | mutation | jumlah listing tersemai | **sudah ikut** `public_mutation_rate`; lihat catatan di bawah |

Sembilan baris terakhir adalah SATU-SATUNYA permukaan publik tanpa gerbang
otorisasi. Semuanya disengaja, dan setiap alasannya tertulis di test yang
menjaga daftar ini - bukan hanya di dokumen.


## 3b. Audit ini tidak bisa basi

Daftar di atas adalah dokumen. Dokumen tidak gagal ketika ada `export const`
baru yang ditambahkan tanpa gerbang. Karena itu pemindaiannya dipindah ke
`src/convex/public-surface-audit.test.ts`, yang memindai `src/convex/*.ts`
**pada saat test jalan** dan mensyaratkan setiap fungsi publik untuk
menyentuh gerbang yang dikenal ATAU ada di daftar pengecualian yang
alasannya ditulis di dalam test.

Hasil pemindaian terakhir: **115 fungsi publik**, 106 bergerbang, 9
pengecualian (sembilan baris terakhir di bagian 3).

Empat pengaman di test tersebut:

1. **Daftar basi ditolak.** Pengecualian untuk fungsi yang sudah dihapus
   akan menggagalkan test, karena entri basi membuat angka audit terlihat
   benar padahal permukaannya sudah berubah.
2. **Alasan kosong ditolak.** Setiap pengecualian wajib punya penjelasan
   nyata, bukan "kebetulan".
3. **Mutasi publik wajib menyebut batasnya.** "Publik" untuk baca saja
   wajar; "publik" tanpa batas adalah anonymous write primitive.
4. **Audit diuji terhadap dirinya sendiri.** Menambahkan satu mutasi
   publik sementara membuat test gagal dengan nama fungsi, jenis, berkas,
   dan langkah pemulihannya.

Jadi menambah endpoint publik tanpa memutuskan auditorsinya tidak akan menunggu
temuan audit berikutnya - akan langsung menggagalkan CI.

---

## 4. Pola yang dijaga di seluruh aplikasi

1. **Peran hanya dari server.** `getStaffAccess` membaca `staffMembers`; tidak ada
   jalur yang mempercayai peran dari klien atau dari URL.
2. **Kepemilikan selalu diperiksa,** bukan hanya "sudah masuk":
   `updateRequestStatus`, `reopenRequest`, `updateInteraction`, `withdrawOffer`,
   `acceptRequestOffer`, `listRequestOffers`, `listListingHistory`,
   `listVendorClaims`.
3. **Viewer tidak bisa menulis.** `requireVendorManager` menolak viewer secara
   eksplisit; `requireStaff("staff")` juga menolak viewer.
4. **Id opaque bukan otorisasi.** Setelah Fase 9, `getImageUrl` tidak lagi
   memakai "kamu tahu id-nya" sebagai alasannya, dan `listPackages` tidak lagi
   memakai "kamu punya id listing" untuk membaca konten draft.
5. **Sesi bisa dicabut seketika.** Setiap `requireUser` mengecek
   `revokedAdminSessions`, jadi JWT yang sudah terbit tidak cukup untuk melewati
   pencabutan.
6. **UI bukan pengaman.** Tombol admin disembunyikan di UI, tetapi setiap
   mutasi yang sensitif tetap menolak pemanggilan langsung — diuji di
   `realtime.test.ts` dan `security-surface.test.ts`.
