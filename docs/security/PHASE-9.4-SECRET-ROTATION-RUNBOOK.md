# PHASE 9.4 — Runbook Rotasi Rahasia Relay & Hash IP

Dokumen ini adalah prosedur untuk **mengganti nilai** dua rahasia produksi:

| Nama | Tipe di Vercel (terverifikasi 2026-10-04) | Target |
|---|---|---|
| `ADMIN_CONTEXT_RELAY_SECRET` | `encrypted` | production |
| `SERVER_IP_HASH_SECRET` | `encrypted` | production |

Status dokumen: **BELUM DIJALANKAN.** Tidak ada rotasi yang sudah dieksekusi.
Dokumen ini prosedur, bukan bukti. Setelah dijalankan, hasilnya dicatat di
bagian 8 — bukan di dokumen ini tanpa tanggal dan angka.

Aturan yang berlaku untuk seluruh prosedur:

- **Jangan pernah mencetak nilai rahasia** ke terminal, log, tiket, chat, atau
  pesan ke coding agent. Yang boleh dilaporkan hanya: ada/tidak, sama/beda,
  lulus/gagal.
- **Jangan menaruh nilai di argumen perintah.** Nilai selalu lewat `stdin`.
  `vercel env add --value` dan `convex env set NAMA nilai` sama-sama
  meninggalkan jejak di daftar proses dan riwayat shell.
- **Satu rahasia per sesi.** Jangan merotasi dua kredensial sekaligus; kalau
  ada yang gagal, penyebabnya harus bisa ditunjuk.
- Setiap langkah punya cara verifikasi yang bisa dijalankan ulang orang lain.
  Kalau tidak bisa diverifikasi, tulis `NOT VERIFIED`, jangan `PASS`.

---

## 1. Kenapa rotasi ini ada

Repository ini pernah publik dan `.env.keys` pernah ter-track di Git. Nilai apa
pun yang pernah berada di sana harus dianggap bocor sampai dibuktikan
sebaliknya (`HARDENING-STATUS-ANALYSIS.md`, L1). Dua kunci di dokumen ini
sekarang dipakai di produksi, jadi keduanya masuk daftar kandidat rotasi.

Alasan tambahan yang spesifik untuk keduanya: pada 2026-10-04 keduanya
dipindahkan dari tipe `sensitive` ke `encrypted` **justru supaya bisa
dibaca ulang dan dibuktikan identik lintas platform** oleh
`npm run verify:prod` (gate `rahasia.cocok.*`). Konsekuensi yang dicatat jujur:
pemilik proyek bisa membaca nilainya lewat CLI. Itu harga agar kesamaan
terbukti; `VITE_CONVEX_URL` tetap `sensitive` dan tidak ikut aturan ini.

Rotasi **tidak** memperbaiki bug, dan **tidak** diperlukan kalau kedua nilai
belum pernah bocor. Ia menutup satu skenario saja: nilai lama yang sudah
terbaca pihak lain tidak lagi berlaku.

## 2. Peta konsumen rahasia

| Rahasia | Dipakai di Vercel | Dipakai di Convex | Aturan lintas platform |
|---|---|---|---|
| `ADMIN_CONTEXT_RELAY_SECRET` | `api/admin-context.ts` menandatangani permintaan relay (HMAC-SHA-256, header `x-admin-relay-signature`) | `http.ts` route `/admin-gate/context-relay` memverifikasi tanda tangan | **Harus sama persis** di kedua platform |
| `SERVER_IP_HASH_SECRET` | belum dibaca kode edge saat ini; keberadaannya disyaratkan gate | `src/lib/admin-ip-hash.ts` menghitung `ipHash` (HMAC-SHA-256) | **Harus sama persis**; **wajib berbeda** dari relay secret |

Konsekuensi rotasi yang harus dipahami sebelum mulai:

- **Relay secret.** Selama satu sisi masih memakai nilai lama dan sisi lain
  sudah memakai nilai baru, semua permintaan relay ditolak dan relay
  **tertutup** — bukan terbuka. Efeknya hanya telemetri: Security Desk
  mencatat `telemetryStatus: failed` dan `relay: unavailable`. Masuk ruang
  pengelola **tidak** terpengaruh.
- **Hash secret.** `ipHash` dihitung dengan kunci; setelah rotasi, IP yang sama
  menghasilkan hash berbeda. Baris lama tidak bisa dicocokkan dengan baris baru
  memakai kunci baru. Simpan kunci lama selama masih ada baris dalam masa
  retensi (bawaan `ADMIN_SECURITY_RETENTION_DAYS = 30`).
- **Deploy Vercel wajib.** Perubahan env Vercel hanya berlaku pada deployment
  baru. Mengubah nilainya di dashboard tanpa deploy ulang membuat deployment
  yang berjalan tetap memakai nilai lama.
- **Convex tidak perlu deploy ulang.** Fungsi membaca `process.env` saat
  berjalan. Kalau seluruh prosedur selesai tetapi `rahasia.cocok.*` masih
  gagal, deploy ulang Convex adalah langkah pemulihan, bukan langkah rutin.

## 3. Prasyarat

Yang sudah terverifikasi di mesin operator pada 2026-10-04:

- Vercel CLI 54.21.1 (Node v24.15.0), user `qoidrifat-2003`.
- Convex CLI 1.46.0 lewat `./node_modules/.bin/convex.exe`.
- Kedua rahasia ada di Vercel production dengan tipe `encrypted`
  (`vercel env ls --format json`; hanya nama/target/tipe yang dibaca).
- Convex production terdaftar sebagai `focused-lemur-389`.

Jebakan yang sudah terbukti dan harus dihindari:

1. **Shim `vercel` di Windows rusak.** `vercel` tanpa ekstensi adalah skrip
   shell; `spawnSync` gagal. Selalu panggil
   `node "$APPDATA/npm/node_modules/vercel/dist/vc.js"`.
2. **Convex CLI butuh `CONVEX_DEPLOYMENT`.** `.env.local` sudah dihapus, jadi
   tanpa variabel itu CLI berhenti dengan
   `No CONVEX_DEPLOYMENT set, run npx convex dev`. Nilai yang dipakai:
   `prod:focused-lemur-389` (nama deployment, bukan rahasia).
3. **`vercel link` menimpa `.env.local`.** Jangan menjalankan `vercel link`
   di repo ini tanpa alasan.

Siapkan sesi (git bash):

```bash
cd /d/Workspace/projects/sumenepbukukerja
VC() { node "$APPDATA/npm/node_modules/vercel/dist/vc.js" "$@"; }
export CONVEX_DEPLOYMENT=prod:focused-lemur-389
KC=./node_modules/.bin/convex.exe
```

## 4. Urutan rotasi

Urutan wajib:

1. baseline hijau,
2. `SERVER_IP_HASH_SECRET` dulu (nol dampak relay),
3. baru `ADMIN_CONTEXT_RELAY_SECRET` (ada jeda telemetri selama deploy).

### 4.0 Baseline sebelum menyentuh apa pun

```bash
npm run verify:prod | tail -30
```

Yang diharapkan: seluruh gate hijau dengan verdict `READY` dan exit 0 (terakhir
terukur 2026-10-04: 36 lulus / 0 gagal / 0 unverifiable). Kalau baseline sudah
merah, **jangan lanjut** — perbaiki dulu, karena sesudah rotasi tidak ada cara
membedakan kegagalan lama dari kegagalan rotasi.

Simpan nilai lama supaya rollback mungkin, **tanpa menampilkannya**. Cara yang
aman: salin ke clipboard, tempel ke password manager, lalu kosongkan clipboard.

```bash
$KC env get SERVER_IP_HASH_SECRET --prod | clip   # tempel ke password manager
printf '' | clip                                   # kosongkan clipboard
```

Ulangi untuk `ADMIN_CONTEXT_RELAY_SECRET`. Kalau nilai lama tidak disimpan,
"salah satu sisi masih nilai lama" dan "mulai dari nol" jadi tidak bisa
dibedakan, dan rollback berubah jadi rotasi kedua.

### 4.1 Rotasi `SERVER_IP_HASH_SECRET`

**Langkah 1 — buat nilai baru dan set di Convex, nilai hanya lewat stdin:**

```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" \
  | $KC env set SERVER_IP_HASH_SECRET --prod
```

`convex env set` dengan nilai dikosongkan memang membaca dari stdin (tertulis
di `--help`-nya). Nilainya tidak pernah muncul di argv maupun layar.

**Langkah 2 — salin nilai yang sama persis ke Vercel** (Convex jadi sumber
tunggal, jadi tidak ada pengetikan ulang dan tidak ada risiko salah salin):

```bash
$KC env get SERVER_IP_HASH_SECRET --prod \
  | node -e "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(s.replace(/[\r\n]+$/,'')));" \
  | VC env add SERVER_IP_HASH_SECRET production --no-sensitive --force --yes --non-interactive
```

`--no-sensitive` wajib: tanpa itu Vercel menyimpan tipe `sensitive`, nilainya
ditahan platform, dan gate kesamaan berubah jadi `UNVERIFIABLE` — prosedur ini
dianggap gagal pada langkah verifikasi.

`--force` menimpa variabel yang sudah ada untuk target yang sama. Kalau CLI
menolak karena alasan interaktif, ganti dengan urutan hapus lalu tambah, dan
jalankan keduanya sebagai satu rantai supaya jeda kosongnya hanya hitungan
detik:

```bash
VC env rm SERVER_IP_HASH_SECRET production --yes --non-interactive \
  && $KC env get SERVER_IP_HASH_SECRET --prod \
     | node -e "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(s.replace(/[\r\n]+$/,'')));" \
     | VC env add SERVER_IP_HASH_SECRET production --no-sensitive --force --yes --non-interactive
```

**Langkah 3 — pastikan tipe penyimpanannya masih `encrypted`** (hanya
nama/target/tipe yang dicetak, tidak ada nilai):

```bash
VC env ls --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const e of JSON.parse(s).envs)if(/SECRET\$/.test(e.key))console.log(e.key+' | '+e.target.join(',')+' | '+e.type);});"
```

**Langkah 4 — verifikasi.** Jalankan bagian 5. Tidak ada deploy Vercel yang
diperlukan untuk rahasia ini, karena kode edge tidak membacanya; yang berubah
hanya nilai yang dibaca Convex dan yang dibandingkan verifier.

### 4.2 Rotasi `ADMIN_CONTEXT_RELAY_SECRET`

**Langkah 1 — baseline ulang.** Bagian 4.0 dan 5 harus hijau sebelum mulai,
karena sesudah langkah berikut relay sengaja mati sampai deployment baru
selesai. Simpan nilai lama ke password manager (perintah yang sama).

**Langkah 2 — set nilai baru di Convex:**

```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" \
  | $KC env set ADMIN_CONTEXT_RELAY_SECRET --prod
```

Mulai titik ini setiap percobaan masuk ruang pengelola tercatat dengan
`telemetryStatus: failed`, `relay: unavailable`, dan `ipHashMethod` tetap
`hmac-sha256` (hash secret tidak ikut berubah). Ini **perilaku fail-closed yang
benar**, bukan kerusakan.

**Langkah 3 — salin nilai yang sama ke Vercel, lalu deploy produksi baru.**
Keduanya harus berurutan tanpa jeda panjang:

```bash
$KC env get ADMIN_CONTEXT_RELAY_SECRET --prod \
  | node -e "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(s.replace(/[\r\n]+$/,'')));" \
  | VC env add ADMIN_CONTEXT_RELAY_SECRET production --no-sensitive --force --yes --non-interactive \
  && VC deploy --prod --yes --non-interactive
```

Deploy harus dijalankan dari root repo, pada worktree bersih, di commit yang
memang ingin tayang. Deployment lama tetap memakai nilai lama sampai alias
dipindahkan; jeda telemetri berakhir saat deployment baru menerima trafik.

**Langkah 4 — tunggu `Ready` dan alias pindah.** Deployment yang selesai bukan
bukti isinya benar (gap `ed65ed0` sudah pernah terjadi di proyek ini). Yang
membuktikan adalah gate `drift.*` di verifier, yang membandingkan aset yang
benar-benar dilayani produksi dengan build lokal HEAD.

**Langkah 5 — verifikasi.** Bagian 5, lalu checklist bagian 6.

## 5. Verifikasi kesamaan lintas platform

Verifikasi resmi ada di verifier, bukan di mata operator:

```bash
npm run verify:prod
```

Gate yang harus dibaca satu per satu:

| Gate | Lulus berarti |
|---|---|
| `rahasia.tersedia.ADMIN_CONTEXT_RELAY_SECRET` | ada dan tidak kosong di Vercel dan Convex |
| `rahasia.cocok.ADMIN_CONTEXT_RELAY_SECRET` | nilai **identik** di kedua platform |
| `rahasia.tersedia.SERVER_IP_HASH_SECRET` | ada dan tidak kosong di kedua platform |
| `rahasia.cocok.SERVER_IP_HASH_SECRET` | nilai **identik** di kedua platform |
| `rahasia.berbeda.Vercel` / `rahasia.berbeda.Convex` | kedua rahasia **bukan nilai yang sama** di platform itu |
| `relay.hidup` | `GET /api/admin-context` dijawab `405` JSON — fungsi hidup, bukan 500 dan bukan HTML |

Verifier membaca nilai dari kedua sisi lalu membandingkannya tanpa pernah
mencetaknya. Kalau sebuah nilai bertipe `sensitive`, hasilnya
`UNVERIFIABLE` — karena itu langkah `--no-sensitive` tidak boleh dilewatkan.
Verdict akhir yang diharapkan: `READY`, exit 0, 0 gagal, 0 unverifiable.

`relay.hidup` perlu build lokal yang segar, karena gate `drift.*` yang menemaninya
membandingkan produksi dengan `dist/` HEAD:

```bash
rm -rf dist && VITE_CONVEX_URL=https://focused-lemur-389.convex.cloud VITE_CONVEX_SITE_URL=https://focused-lemur-389.convex.site ./node_modules/.bin/vite build
```

Pemeriksaan keberadaan tanpa mencetak nilai (opsional, hanya nama yang terlihat):

```bash
KC=./node_modules/.bin/convex.exe
CONVEX_DEPLOYMENT=prod:focused-lemur-389 $KC env list --prod --names-only | grep -E 'ADMIN_CONTEXT_RELAY_SECRET|SERVER_IP_HASH_SECRET'
VC env ls --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const e of JSON.parse(s).envs)console.log(e.key+' | '+e.target.join(',')+' | '+e.type);});"
```

Bukti fungsional dari sisi yang dilihat pengguna (bukan tambahan opsional;
ini bagian dari definisi selesai):

1. Masuk `/admin`, lakukan satu percobaan passcode.
2. DevTools → Network → `POST /api/admin-context`. Balasan harus punya
   `ipSource: "Vercel Edge"` dan `ipMasked` terisi.
3. Security Desk: baris terbaru harus `telemetryStatus: Lengkap`,
   `ipHashMethod: hmac-sha256` (bukan `hmac-sha256-fallback`, bukan
   `missing-in-production`), dengan `eventId` dan `relayTraceId` yang bisa
   disebut dalam laporan.
4. Log terstruktur `type: "security_telemetry"` bisa dicari lewat
   `relayTraceId` itu.

## 6. Checklist deploy pasca-rotasi

1. Nilai baru terpasang di **Convex** dan **Vercel** production dengan tipe
   `encrypted`.
2. Vercel production di-deploy ulang (`VC deploy --prod`), status `Ready`,
   alias `sumenepbukukerja.com` menunjuk deployment baru.
3. `npm run verify:prod` → `READY`, exit 0; keenam gate di bagian 5 dibaca,
   bukan hanya verdict akhirnya.
4. Security Desk satu percobaan baru: `telemetryStatus: Lengkap`,
   `ipHashMethod: hmac-sha256`, `ipSource: Vercel Edge`.
5. Tidak ada nilai rahasia di riwayat shell, log CLI, berkas, atau chat.
6. Nilai lama masih tersimpan di password manager (belum dihapus).
7. Setelah retensi habis (bawaan 30 hari) dan tidak ada baris lama yang masih
   dibutuhkan, baru nilai lama dihapus.

## 7. Rollback

Rollback dikerjakan dengan urutan yang sama seperti rotasi, memakai nilai lama
dari password manager:

1. Set nilai lama di Convex (stdin).
2. Salin ke Vercel (`--no-sensitive --force`).
3. Deploy ulang Vercel.
4. `npm run verify:prod` → `READY`.

Aturan yang tidak boleh dilanggar saat rollback:

- Jangan set hanya satu sisi lalu berhenti. Satu sisi lama + satu sisi baru
  lebih buruk daripada dua sisi baru: relay mati dan verifier merah, dan tidak
  ada yang tahu sisi mana yang salah baca.
- Jangan hapus nilai baru sebelum rollback terverifikasi.
- Kalau `relay.hidup` gagal dengan `500` dan bukan `unavailable`, itu bukan
  masalah nilai: periksa log fungsi Vercel. 500 berarti fungsinya gagal dimuat
  atau melempar, bukan menolak tanda tangan.

## 8. Bukti yang wajib dicatat setelah rotasi

Catat di `PHASE-9.1-OPERATOR-CLOSURE.md` (bagian baru, bertanggal):

- tanggal/waktu, operator, rahasia mana yang dirotasi;
- hasil `npm run verify:prod`: jumlah lulus/gagal/unverifiable dan verdict;
- id deployment baru + alias yang menunjuk padanya;
- satu kode event Security Desk (`ADM-YYYYMMDD-XXXXXX`) dari percobaan
  pasca-deploy beserta `ipSource` dan `ipHashMethod`-nya.

Yang **tidak** dicatat: nilai baru, nilai lama, potongannya, atau hash-nya.

## 9. Yang sengaja tidak dilakukan

- **Tidak ada rotasi otomatis berjadwal.** Rotasi yang tidak diverifikasi sama
  dengan tidak ada rotasi. Prosedur ini dijalankan manusia dan ditutup bukti.
- **Tidak ada dukungan dua kunci aktif.** Relay menerima satu nilai; rotasi
  tanpa jendela nol memang tidak bisa dengan desain sekarang. Jendela itu
  diterima karena dampaknya hanya telemetri, dan ditutup dengan deploy cepat.
- **Tidak menyamakan kedua rahasia** demi menyederhanakan rotasi. Satu
  kebocoran akan membuka dua tugas sekaligus, dan tidak ada cara mengetahui
  kunci mana yang bocor. Gate `rahasia.berbeda.*` menjaga ini.
- **Tidak menaruh nilai di berkas `.env`.** Berkas seperti itu pernah tertimpa
  dan dihapus di proyek ini; password manager adalah tempatnya, bukan repo.
