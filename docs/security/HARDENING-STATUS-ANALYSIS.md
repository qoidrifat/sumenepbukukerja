# Analisis Mendalam Status Hardening — Sumenep Buku Kerja

Tanggal audit: 2 Oktober 2026
Commit diuji: `2dd57c77884348cdcae8745518f3b1296202feb2` (162 commit, HEAD `main`)
Draft sumber: [SECURITY-HARDENING-REPORT.md](SECURITY-HARDENING-REPORT.md)

> **Tujuan dokumen ini.** Draft laporan sebelumnya menandai lima pekerjaan
> sebagai `TERBLOKIR`, `BELUM`, atau `Terbukti mustahil`. Analisis ini menguji
> ulang kelima klaim itu terhadap keadaan repo yang sebenarnya. Hasilnya:
> **empat dari lima klaim salah**, dan satu di antaranya menyembunyikan
> kebocoran rahasia yang sudah berlangsung selama 8 hari di repositori publik.
>
> Tidak ada yang diperbaiki secara diam-diam. Yang dipulihkan hanya yang
> terbukti tidak merusak (baseline test), dan sisanya ditulis sebagai rencana
> dengan titik keputusan yang jelas.

---

## 1. Ringkasan Eksekutif

### 1.1 Baseline sejati (semua diukur ulang, bukan Carry-over)

| Perintah | Klaim draft | Hasil nyata | Status |
|---|---|---|---|
| `npx convex dev --once` | `ready` | **GAGAL** (`VLY_CONVEX_AUTH_ISSUER` belum diisi) | ❌ dikoreksi |
| `bun run test` | 1027 lulus / 74 berkas | **517 lulus / 37 dari 74 berkas gagal import** | ❌ dikoreksi |
| `./node_modules/.bin/tsc -b --noEmit` | 0 error | 0 error | ✅ benar |
| `bun run lint` | 0 error / 26 warning | 0 error / 26 warning | ✅ benar |
| `bun audit` | 15 kerentanan, 0 critical | 15 kerentanan (4 high, 7 moderate, 4 low), 0 critical | ✅ benar |

Setelah perbaikan lingkungan (§4.2), baseline **1027 lulus / 74 berkas** dapat
direproduksi persis. Jadi kode healthiestnya memang baik; yang rusak adalah
kemampuan memverifikasinya.

### 1.2 Lima temuan yang mengubah prioritas

| # | Temuan | Dampak draft |
|---|---|---|
| **F1** | `.env.keys` berisi kunci privat Dotenvx **ter-commit di HEAD dan repo GitHub bersifat publik** | Langkah 00 "terblokir" → justru **P0 terbuka** |
| **F2** | Baseline test sebenarnya **rusak**: 37 dari 74 berkas gagal import | Verifikasi "✅ 1027 lulus" tidak dapat direproduksi |
| **F3** | Git **tidak** diblokir platform; seluruh riwayat bisa dipindai | Langkah 00 & 22 bisa dikerjakan di sini |
| **F4** | Playwright (chromium + webkit) **terpasang**, `e2e/` berisi 4 spec, Vite melayani HTTP 200 | Langkah 12/13/14 "tidak ada peramban" → **bisa** |
| **F5** | Runbook migrasi memakai path `internal/phoneMigration:*` yang **tidak ada** | Langkah 16/17 gagal di perintah pertama |

---

## 2. F1 — Kunci privat terpublikasi di repositori publik (P0)

### 2.1 Bukti

```
$ git ls-tree -r HEAD --name-only | grep -E '^\.env|deploy-prod'
.env.example
.env.keys          <-- TER-TRACK DI HEAD
deploy-prod.env    <-- TER-TRACK DI HEAD

$ git ls-files --error-unmatch .env.keys
.env.keys

$ git log --all --format='%H|%ad' --diff-filter=A -- .env.keys
30dc347ccf5480c86b60b9b1b104343f15856efc|2026-09-25 05:36:57 +0000
```

Nilai kuncinya **tidak pernah ditampilkan** dalam dokumen ini. Yang dihitung
hanya sidik jarinya:

```
md5(nilai di commit HEAD : .env.keys) = 68283efa615e
md5(nilai di .env.keys  : disk)      = 68283efa615e
>>> KUNCI YANG SAMA AKTIF DI DISK DAN SUDAH TERPUBLIKASI DI GITHUB
```

Remote: `https://github.com/qoidrifat/sumenepbukukerja.git`. Halaman repo
mengembalikan **HTTP 200 tanpa autentikasi** — repositori publik.

### 2.2 Mengapa `.gitignore` yang sudah diperketat tidak menolong

[.gitignore](.gitignore) sudah punya aturan yang benar (baris 21-28: `.env`,
`.env.*`, `.env.keys`, `.env.keys.*`). Tapi:

```
$ git check-ignore -v .env.keys ; echo $?
1        # tidak diabaikan
$ git ls-files .env.keys
.env.keys   # tetap terlacak
```

**`.gitignore` hanya berlaku pada berkas yang belum terlacak.** Begitu sebuah
berkas masuk `index`, aturannya tidak berlaku lagi dan baris `git rm` yang
pernah dilakukan tidak mengeluarkannya. Aturan yang ada sekarang mencegah
*pengulangan*, dan itu memang bernilai — tetapi tidak pernah menghapus
*eksposur yang sudah terjadi*.

### 2.3 Sebaiknya seberapa serius

`.env.keys` memuat `DOTENV_PRIVATE_KEY_LOCAL` — kunci privat **dekripsi
Dotenvx**. Kunci ini, bila `.env.production` terenkripsi pernah ada, cukup untuk
membuka seluruh isinya tanpa batas.

Dua pembatas yang harus dinyatakan jujur:

- `.env.production` **tidak ada** di disk lokal saat audit ini, jadi tidak
  dapat ditunjukkan bahwa ada terenkripsi di bawah kunci itu.
- `deploy-prod.env` yang juga ter-track hanya berisi `CONVEX_DEPLOYMENT`
  (nama deployment, bukan rahasia). Jadi jejak eksposur yang terbukti adalah
  kunci private saja — bukan seluruh environment production.

Tetap P0, karena kunci privat yang bocor tidak bisa dinilai "tidak berbahaya"
dengan asumsi: yang tidak terlihat hari ini bisa ada di environment lain yang
memakai kunci yang sama.

### 2.4 Yang terpengaruh

| Area | Impact |
|---|---|
| Kredensial apa pun yang pernah terenkripsi Dotenvx | Bisa didekripsi siapa pun yang membaca repo |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` auth (disebut di README) | Jika dienkripsi dengan kunci sama → sesi bisa dipalsukan |
| `WHATSAPP_APP_SECRET` | Jika bocor → webhook dapat ditandatangani ulang |
| Integritas histori Git | 8 commit dan 162 commit terpublikasi bersama kunci |
| `.gitignore` | Terlihat benar, tapi tidak berlaku untuk berkas terlacak |

---

## 3. F2 — Baseline verifikasi sebenarnya rusak

### 3.1 Gejala

```
Error: Cannot find module './_generated/api'
  imported from src/convex/security-surface.test.ts
Error: Cannot find package '@/convex/_generated/api'
  imported from src/lib/admin-gate-client.ts

Test Files  37 failed | 37 passed (74)
     Tests  517 passed (517)
```

Klaim draft "1027 lulus / 74 berkas" **tidak dapat direproduksi** pada keadaan
repo apa adanya. Yang berjalan hanya 517 test — sekitar separuh.

### 3.2 Akar penyebab (dua lapis)

1. `src/convex/_generated/` diabaikan [.gitignore:4](.gitignore#L4) dan tidak
   ada di working tree. Itu memang benar secara desain (hasil codegen).
2. Codegen tidak bisa jalan: [src/convex/auth.config.ts:9](src/convex/auth.config.ts#L9)
   memakai `process.env.VLY_CONVEX_AUTH_ISSUER ?? "https://freebuff.com"`.
   **Convex mensyaratkan variabel auth-config benar-benar diisi di backend.**
   Operator `??` di dalam kode tetap dianggap kosong oleh analyzer, sehingga
   `convex dev --once` berhenti sebelum selesai.

Efeknya berantai: tanpa `_generated`, setiap berkas test yang menyentuh API
Convex gagal saat import — termasuk audit permukaan publik, enkripsi nomor,
handoff kontak, dan pemicu deteksi. Artinya **test keamanan yang paling penting
tidak dijalankan sama sekali** tanpa perbaikan ini.

---

## 4. Perbaikan yang sudah dijalankan pada audit ini

### 4.1 F2 — Codegen dipulihkan (selesai, terverifikasi)

Perbaikan dilakukan pada deployment lokal anonim, **tidak menyentuh produksi**:

```bash
npx convex env set VLY_CONVEX_AUTH_ISSUER https://freebuff.com
npx convex dev --once          # -> Convex functions ready!
```

Nilai yang ditambahkan ke [.env.local](.env.local) adalah nilai fallback yang
sudah ada di kode, bukan rahasia.

Hasil setelah perbaikan:

```
Test Files  74 passed (74)
     Tests  1027 passed (1027)
```

Baseline draft sekarang **terbukti benar**, bukan sekadar diklaim.

### 4.2 Catatan penting untuk langkah wajib berikutnya

Perbaikan ini **tidak permanen**. `.env.local` tidak masuk Git, dan deployment
lokal anonim adalah milik mesin ini. Clone baru atau mesin CI akan
mengulang kegagalan yang sama. Yang permanen harus berupa:

- `VLY_CONVEX_AUTH_ISSUER` masuk [`.env.example`](.env.example) dan
  [README](README.md); dan
- sebuah skrip bootstrap yang menjalankan codegen sebelum test.

Selama ini belum ada, maka **verifikasi keamanan bisa gagal diam-diam** — dan
itu persis modus kegagalan yang paling mahal: laporan keamanan yang terlihat hijau
padahal separuh test-nya tidak pernah jalan.

---

## 5. F3 — Git tidak diblokir; langkah 00 dan 22 bisa dikerjakan

Draft menyatakan pada §1.3 dan §11: *"Perintah `git` diblokir platform
(`Git and GitHub commands are blocked`)"*. Pengujian langsung:

```
$ git log --oneline -5        # berhasil
$ git ls-tree -r HEAD         # berhasil
$ git rev-list --count HEAD   # 162
$ git log --all -p            # berhasil
$ git ls-remote               # (remote https://github.com/...)
```

Semua operasi baca berhasil, termasuk pemindaian seluruh 162 commit.

### 5.1 Hasil pemindaian riwayat (nilai tidak pernah ditampilkan)

Berkas berbasis environment yang pernah masuk histori:

| Berkas | Commit |-status | Rahasia? |
|---|---|---|---|
| `.env.keys` | `30dc347` (25 Sep 2026) | **masih ada di HEAD** | **Ya — kunci privat Dotenvx** |
| `deploy-prod.env` | `29ee5fb` | masih ada di HEAD | Tidak (`CONVEX_DEPLOYMENT` saja) |
| `.env.example` | — | masih ada di HEAD | Tidak (harus ada) |

Pencarian `SECRET|PRIVATE_KEY|API_KEY|TOKEN|PASSWORD|JWT` pada seluruh diff
histori **tidak menemukan nama variabel lain**. Jadi jejak eksposur terbatas dan
dapat dinyatakan secara tegas: **hanya satu kunci privat**.

---

## 6. F4 — Steps 12, 13, 14 bisa dijalankan

Draft menyatakan lingkungan ini tidak memiliki peramban dan `e2e/` kosong.
Keduanya salah.

```
$ ls e2e/
discovery.spec.ts   flows.spec.ts   main-flow.spec.ts   seo.spec.ts

$ ls ~/AppData/Local/ms-playwright/
chromium-1228  chromium-1243  chromium_headless_shell-1228
chromium_headless_shell-1243  ffmpeg-1011  webkit-2311  winldd-1007

$ npx vite --port 5199 --host 127.0.0.1
VITE v7.3.6  ready in 3460 ms     -> HTTP 200
```

Aplikasi juga **berhasil dirender penuh** di peramban (landing page, tombol
Teks besar/Kontras, CTA utama, navigasi bawah). Jadi:

| Langkah | Status nyata |
|---|---|
| 12 QA responsif | **Bisa dijalankan** — chromium + webkit tersedia |
| 13 Integritas tombol | **Bisa dijalankan** — Vite melayani + peramban hidup |
| 14 Sinkronisasi rute | **Bisa dijalankan** — 4 spec e2e sudah ada |

Konsekuensi: tiga checkbox `TIDAK DIVERIFIKASI` di §11 bisa ditutup, dan
alasan "tidak bisa diverifikasi tanpa peramban" yang dipakai untuk menolak
beberapa perubahan (§2.9, §2.7 CORS produksi) hilang.

---

## 7. F5 — Runbook migrasi salah path (berdampak pada langkah yang tidak bisa dibatalkan)

### 7.1 Bukti empiris

```
$ npx convex run internal/phoneMigration:report
• whatsapp:sendRequestStatusNotification
• whatsapp:sendTestWhatsapp
...            <-- fungsi TIDAK ditemukan; CLI mencetak daftar fungsi

$ npx convex run phoneMigration:report
{
  "keyConfigured": ...,
  "notificationPreferences": {...},
  "listingClaims": {...},
  "whatsappThreads": { "encrypted": 0, "legacy": 0 }
}
```

Tidak ada direktori `src/convex/internal/`. Fungsi berada di
[src/convex/phoneMigration.ts](src/convex/phoneMigration.ts), sehingga path CLI
yang benar adalah `phoneMigration:*` — persis seperti yang tertulis di header
komentar berkas itu sendiri.

### 7.2 Mengapa ini serius, bukan sekadar typo

Path salah muncul di **dua** tempat yang justru jadi rujukan operator:

- [SECURITY-HARDENING-REPORT.md:1346-1351](SECURITY-HARDENING-REPORT.md#L1346-L1351)
- [README.md:634-637](README.md#L634-L637)

Langkah 6 runbook tersebut adalah `clearLegacyPlainPhones` — **satu-satunya
operasi yang tidak bisa dibatalkan**, karena nomor warga yang sudah dihapus kolom
polosnya hanya ada di backup mingguan. Pedoman yang salah pada langkah 1
mendorong operator berimprovisasi di sekitar langkah yang paling berbahaya.

Tambahan: `.env.example` **tidak menyebut `PHONE_DATA_KEY`** (hasil pencarian =
0), padahal README menyebutkannya. Clone baru tidak punya templatenya.

---

## 8. §2.9 — Koreksi terhadap "terbukti mustahil"

### 8.1 Yang benar dan tetap berlaku

Bukti rollback di [src/convex/access-denial-contract.test.ts](src/convex/access-denial-contract.test.ts)
**valid**. `noteSecurityDenial` di
[src/convex/securitySignal.ts:294](src/convex/securitySignal.ts#L294) adalah
fungsi biasa yang menerima `ctx`, jadi ia menulis di transaksi yang sama. Melempar
=`ctx.db` rollback = jejak hilang. `privileged_call_denied` dan
`storage_reference_invalid` memang **tidak bisa dicatat dari dalam gerbang yang
melempar**. Kesimpulan itu benar dan sebaiknya tidak dibuka lagi.

### 8.2 Yang salah: penolakan atas opsi kedua

Draft §2.9/§5.1 menolak opsi "laporkan dari transaksi lain" dengan alasan:

> *"Butuh wiring klien di provider Convex; tidak bisa diverifikasi tanpa
> peramban."*

**Kedua alasan itu tidak berlaku.**

1. **Tidak butuh wiring klien.** Convex `action` bersifat non-transaksional dan
   bisa memanggil `ctx.runMutation(...)`. Polanya:

   ```ts
   export const someGuarded = action(async (ctx, args) => {
     try {
       return await ctx.runMutation(internal.someGuardedImpl, args);
     } catch (e) {
       await ctx.runMutation(internal.noteDenial, { rule, subject, at: Date.now() });
       throw e;   // pemanggil tetap menerima ConvexError yang sama
     }
   });
   ```

   `runMutation` pertama rollback saat melempar; `runMutation` kedua adalah
   transaksi **terpisah** yang tetap commit. Kontrak pemanggil tidak berubah
   sama sekali.

2. **Tidak butuh peramban untuk verifikasi.** Pola ini dapat diuji dengan
   `convex-test` seperti seluruh test Convex yang sudah ada — termasuk
   pengujian "jejak tetap ada setelah mutation melempar", yang persis
   kebalikan dari bukti rollback yang mengunci §2.9.

Biayanya nyata dan harus disebut: latency lebih tinggi, tiap fungsi bergerbang
menjadi pasangan action+mutation, dan validator args terduplikasi.

### 8.3 Rekomendasi

Langkah 07 turun dari "terbukti mustahil" menjadi **"belum dikerjakan, dengan
jalur yang sudah diketahui dan satu bukti rollback yang tetap terkunci."** Itu
perbedaan besar, karena "mustahil" menutup pekerjaan secara permanen, sementara
"belum dikerjakan" menutupnya hanya sampai hari ini.

---

## 9. Langkah wajib, berurutan

### P0 — Kerjakan hari ini

#### L1. Putuskan nasib kunci privat yang sudah bocor

**Sebelum apa pun: rotasi.** Menghapus berkas dari Git tidak akan
menginvalidasi kuncinya.

1. `dotenvx rotate` atau buat ulang kunci privat → kunci lama harus dianggap
   mati aunque masih ada di repo.
2. Rotasi semua rahasia yang pernah terenkripsi dengan kunci itu. Kandidat dari
   README: `JWT_PRIVATE_KEY`, `WHATSAPP_APP_SECRET`, `CONVEX_AUTH_SECRET`,
   `VLY_EMAIL_OTP_API_KEY`.
3. **Berkas yang terdampak:** `.env.keys`, `.env.production` (jika ada di
   tempat lain), dan semua placeholder yang memegang kunci lama.

> **Titik keputusan pemilik.** Mengganti kunci membuat ciphertext lama tak
> terbaca. Lakukan **setelah** ensuring ada backup `.env.production` yang
> sudah ter-decrypt di tempat aman.

#### L2. Keluarkan berkas dari index Git

```bash
git rm --cached .env.keys deploy-prod.env
```

Ini menghentikan eksposur pada commit berikutnya. Tidak menyentuh histori.

> **Jangan** menambahkan kembali `.env.keys` sebagai "contoh" — isinya kunci asli.

#### L3. Tulis ulang histori (PERLU PERSETUJUAN PEMILIK)

L2 tidak cukup: kunci masih terbaca di commit `30dc347`.

```bash
# Windows: pasang git-filter-repo terlebih dahulu
pip install git-filter-repo
git filter-repo --invert-paths --path .env.keys --path deploy-prod.env
```

Setelah itu **force-push** diperlukan. Ini merusak untuk semua collaborator.

**Ini tidak dijalankan tanpa persetujuan.** Convensi proyek: jangan commit,
push, atau membuka PR kecuali diminta.

**Yang bisa-owner kerjakan tanpa risiko apa pun:** mengubah repo menjadi
private sementara, lalu memutar semua kunci (L1). Kalau repo memang publik
disengaja, biayanya tetap rotasi — hanya urutan yang berbeda.

#### L4. Perbaiki `.env.example`

Tambahkan `PHONE_DATA_KEY`, `VLY_CONVEX_AUTH_ISSUER`,
`ADMIN_CONTEXT_ALLOWED_ORIGINS`, `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS`
(tercantum di §9.1 draft, tapi belum masuk templatenya).

### P1 — Kerjakan minggu ini

#### L5. Perbaiki path runbook migrasi

Ganti `internal/phoneMigration:` menjadi `phoneMigration:` di:

- [SECURITY-HARDENING-REPORT.md:1346-1351](SECURITY-HARDENING-REPORT.md#L1346-L1351)
- [README.md:634-637](README.md#L634-L637)

Perubahan satu baris, risiko rendah, mencegah operator salah di vicinity
`clearLegacyPlainPhones`.

#### L6. Jaga codegen agar tidak bisa gagal diam-diam

Tambahkan skrip bootstrap yang menjalankan codegen sebelum test, dan masukkan
`VLY_CONVEX_AUTH_ISSUER` ke `.env.example`.

**Dasar:** tanpa ini, 510 test keamanan tidak pernah jalan dan tidak ada yang
memberi tahu.

#### L7. Tutup langkah 12, 13, 14 dengan bukti

Jalankan `bun run test:e2e` (4 spec sudah ada) dan QA responsif dengan
chromium + webkit di beberapa lebar layar. Dengan ini bagian §11 "Responsif"
dan tiga checkbox "TIDAK DIVERIFIKASI" bisa ditutup dengan bukti.

### P2 — Setelah P0/P1 stabil

#### L8. Jalankan migrasi nomor (langkah 16/17)

 Setelah L1 selesai (kunci baru terpasang) **dan** L5 selesai (path benar):

1. `phoneMigration:report`
2. `migratePreferences` → ulangi sampai `migrated: 0`
3. `migrateClaims` → ulangi sampai `migrated: 0`
4. `migrateThreads` → ulangi sampai `migrated: 0`
5. `phoneMigration:report` → `remainingLegacy` harus `0`
6. `clearLegacyPlainPhones`

Jangan lewati langkah 5. Penjaga di
[src/convex/phoneMigration.ts](src/convex/phoneMigration.ts) menolak jalan
selama masih ada baris polos — itu benar dan harus-dihormati.

#### L9. Ambil §2.9 opsi kedua (jika aturan 7 masih dikehendaki)

Wrapper action + mutation internal, dengan test `convex-test` yang membuktikan
jejak penolakan bertahan setelah mutation melempar.

#### L10. Security header (langkah 11)

Masih butuh lapisan deployment. Tidak ada `vercel.json` / `_headers` di repo —
satu-satunya file konfigurasi adalah `convex.json`, yang tidak punya bidang
header. Jika platform Freebuff menyediakan konfigurasi header, itu jalur yang
benar; kalau tidak, perlu file config khusus.

#### L11. Sisa langkah 15 (paginasi UI)

Plafon pemindaian sudah ada; pagination antarmuka dan agregat dashboard admin
masalah terbuka (§2.14).

### Langkah yang tetap butuh akses di luar workspace

| Langkah | Yang dibutuhkan |
|---|---|
| 01 Penetapan environment produksi | Akses dashboard Convex prod |
| 02 Deploy hardening | `npx convex deploy` ke prod |
| 22 Verifikasi produksi | Akses runtime prod |
| 11 Security header | Lapisan deployment/hosting |

---

## 10. Ringkasan berkas yang relevan

### Prioritas P0

| Berkas | Isi | Tindakan |
|---|---|---|
| [.env.keys](.env.keys) | Kunci privat Dotenvx, ter-track di HEAD | Rotasi (L1), `git rm --cached` (L2) |
| [deploy-prod.env](deploy-prod.env) | `CONVEX_DEPLOYMENT`, ter-track | `git rm --cached` (L2) |
| [.gitignore](.gitignore#L21-L28) | Aturan sudah benar tapi tak berlaku ke berkas terlacak | Tetap pertahankan (anti-pengulangan) |
| [src/convex/auth.config.ts:9](src/convex/auth.config.ts#L9) | Fallback yang dianggap kosong oleh analyzer | Nilai default didokumentasikan di `.env.example` |

### Prioritas P1

| Berkas | Isi | Tindakan |
|---|---|---|
| [SECURITY-HARDENING-REPORT.md:1346-1351](SECURITY-HARDENING-REPORT.md#L1346-L1351) | Path migrasi salah | `internal/phoneMigration` → `phoneMigration` |
| [README.md:634-637](README.md#L634-L637) | Path migrasi salah | Sama |
| [.env.example](.env.example) | Tidak menyebut `PHONE_DATA_KEY` | Lengkapi (L4) |
| [.env.local](.env.local) | Codegen blocker | Sudah diperbaiki, perlu dibuat permanen (L6) |
| [src/convex/phoneMigration.ts](src/convex/phoneMigration.ts) | Runbook di dalamnya sudah benar; dokumen yang salah | Tidak diubah; referensi |
| [package.json](package.json#L6-L23) | `test:e2e` sudah ada | Dipakai untuk L7 |

### Konteks arsitektur

| Berkas | Isi |
|---|---|
| [src/convex/access.ts:58-59](src/convex/access.ts#L58-L59) | `denied()` melempar → rollback (bukti §2.9) |
| [src/convex/securitySignal.ts:294](src/convex/securitySignal.ts#L294) | `noteSecurityDenial` menulis di transaksi yang sama |
| [src/convex/access-denial-contract.test.ts](src/convex/access-denial-contract.test.ts) | Bukti rollback yang sah dan harus dipertahankan |
| [e2e/](e2e/) | 4 spec yang belum pernah dijalankan |

---

## 11. Yang sengaja tidak dikerjakan pada audit ini

- **Tidak ada commit, push, rewrite histori, atau PR.** Sesuai instruksi.
- **Tidak ada rotasi kunci.** Butuh keputusan pemilik soal urutan dan backup.
- **Tidak ada perubahan kode aplikasi.** Baseline dipulihkan hanya pada
  lingkungan (`.env.local` + env deployment lokal), dan dampaknya terbukti
  nol pada kode.

---

## 12. Pelajaran yang lebih besar dari temuan mana pun

Draft laporan ini sangat kuat pada apa yang **tidak** diklaim: ia menolak
mengerjakan `privileged_call_denied` setelah membuktikan bahwa cara yang ia
coba tidak bisa bekerja. Itu disiplin yang benar dan jarang.

Aturan yang sama ternyata tidak diterapkan pada klaim "tidak bisa dilakukan"
yang lain, dan hasilnya berbeda: **"git diblokir" tidak diuji, "tidak ada
peramban" tidak diuji, dan "baseline hijau" tidak diuji ulang.** Tiga hal yang
paling berbahaya justru tidak diuji, karena label "terblokir" dan "selesai"
semuanya berhenti meminta bukti.

Rekomendasi proses: setiap baris `✅ Selesai` dan setiap baris `❌ Terblokir`
dalam laporan keamanan harus disertai **satu perintah verifikasi yang dijalankan
pada commit itu sendiri**. Kalau tidak bisa dijalankan ulang hari ini, statusnya
harus `TIDAK DIVERIFIKASI`, bukan `SELESAI` atau `TERBLOKIR`.
