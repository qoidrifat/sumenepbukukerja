# Brief Modernisasi UI - Sumenep Buku Kerja

Tanggal analisis: 2026-09-30. Dasar analisis: codebase repo ini, bukan
penilaian dari luar. Semua angka di bawah bisa dicek ulang dengan perintah yang
dicantumkan di bagian 1.

---

## 1. Analisis mendalam: kondisi UI saat ini

### 1.1 Temuan utama

Project ini punya komponen shadcn yang **sudah terpasang tapi nol dipakai**,
sementara halaman-halamannya menulis ulang sendiri apa yang komponen itu sudah
menyediakan.

Komponen `src/components/ui/` yang terpasang tapi tidak dipakai satu pun file
aplikasi (0 importer di luar folder `ui/`):

```
command      field       form        table       pagination
drawer       sheet       sidebar     resizable   carousel
calendar     empty       item        skeleton    spinner
input-group  button-group kbd
```

Hanya 6 dari 22 komponen itu yang benar-benar terpakai: `dialog` (5 file),
`input-otp` (1 file), `sonner` (1 file), `collapsible` (1 file), plus
`themed-select` (wrapper lokal).

### 1.2 Bukti: halaman menulis ulang apa yang sudah ada

| Yang diulang manual | Lokasi | Komponen yang sudah terpasang |
|---|---|---|
| `<input>` mentah, 15 buah | `src/pages/Dashboard.tsx` | `input`, `field`, `input-group`, `label` |
| `<input>` mentah, 10 buah | `src/components/community-widgets.tsx` | idem |
| `<input>` mentah, 5 buah | `src/pages/Admin.tsx` | idem |
| Tabel HTML manual | `src/components/admin-security-log.tsx` | `table` |
| Kotak OTP sendiri | `src/pages/Auth.tsx` | `input-otp` |
| Kotak pencarian | `src/pages/Landing.tsx`, `VendorProfile.tsx` | `command` |
| State "memuat" inline | beberapa halaman | `skeleton`, `spinner` |
| Panel kosong | beberapa | `empty` |
| Notifikasi inline string | `Admin.tsx`, `community-widgets.tsx` | `sonner` |

Perintah untuk memverifikasi ulang:

```bash
cd src && for c in command field form table pagination drawer sheet sidebar \
  resizable empty item skeleton spinner input-group button-group kbd; do
  printf "%-14s %s\n" "$c" "$(grep -rl "ui/$c\"" --include=*.tsx . | grep -v components/ui | wc -l)"
done
```

### 1.3 Titik berat yang harus dipecah

Empat file besar yang mencampur pengambilan data, form, dan tampilan sekaligus:

| File | Baris | Masalah |
|---|---|---|
| `src/pages/Admin.tsx` | 1537 | Semua panel admin dalam satu file |
| `src/components/community-widgets.tsx` | 1131 | Board permintaan + galeri + paket |
| `src/components/admin-workspace.tsx` | 949 | Shell + form listing + tabel |
| `src/components/admin-security-log.tsx` | 750 | Tabel log keamanan manual |

Empat file itu berjumlah 4367 baris, sekitar 10 persen seluruh baris `src/`.
Perubahan UI di area ini mahal dan berisiko karena satu file menyentuh banyak
alur sekaligus.

### 1.4 Kode mati yang sudah teridentifikasi

`src/components/ui/chart.tsx` (1055 baris di `brand-mascot.tsx` berbeda;
`chart.tsx` sendiri) tidak diimpor siapa pun. `recharts` hanya dirujuk oleh
berkas itu. Ini juga satu-satunya `dangerouslySetInnerHTML` di seluruh `src/`
(lihat F-15 di `docs/security/PHASE-9.1-SECURITY-CLOSURE.md`).

### 1.5 Batasan yang harus dijaga

Modernisasi UI tidak boleh:

- merusak gerbang passcode admin (`src/components/admin-access-gate.tsx`,
  `src/lib/admin-gate-client.ts`),
- mengubah semantik handoff WhatsApp Fase 8 (`src/lib/admin-whatsapp.ts`),
- menghapus atau melemahkan test keamanan (54 berkas, 770 test),
- mengubah alur unggah gambar (`src/lib/image-upload.ts`),
- menyentuh CSP atau konfigurasi header (belum ada, lihat F-11),
- merusak `bun run brand:check` dan `bun run mascot:validate`,
- menambah dependensi runtime baru tanpa alasan yang ditulis.

---

## 2. Jawaban: mana yang tetap Top S Tierlist

### 2.1 Yang berubah penilaiannya setelah lihat kodenya

Sumber di daftar yangimedeskripsikan sebagai "pengganti shadcn" atau
"pengganti primitive" **tidak boleh** dipakai di project ini. Alasannya bukan
selera, tapi dua fakta yang sudah terukur:

1. Primitive sudah lengkap. `command`, `table`, `form`, `field`, `pagination`,
   `drawer`, `resizable`, `input-otp` semuanya sudah ada di repo dan gratis. Menambah vendor kedua berarti
   menjalankan tepat risiko yang disebut Kobra sendiri: dua library yang
   memasok `Button`/`Input`/`Dialog` yang berbeda.
2. Yang benar-benar kurang adalah **pemakaian**, bukan komponen.

### 2.2 Peringkat yang saya pakai untuk project ini

| Sumber | Peran di project ini | Alasan |
|---|---|---|
| shadcn/ui (yang sudah ada) | **Prioritas 1** | 22 komponen terpasang, 16 belum dipakai. Nol dependensi baru, nol risiko vendor ganda. |
| Kobra Systems | **Prioritas 3** | Relevan secara konseptual untuk panel operasional, tapi overlap tinggi dengan yang sudah ada. Pakai hanya kalau butuh pola yang benar-benar tidak ada, satu per satu lewat registry. |
| COSS UI (dulu OriginUI) | **Prioritas 4** | Overlap paling besar dengan komponen yang sudah terpasang. Tidak ada alasan teknis untuk menambah. |
| SmoothUI | **Prioritas 3** | Cocok untuk motion, tapi `framer-motion` sudah dipakai di 10 file dan `react-bits.tsx` sudah jadi lapisan motion lokal. |
| Motion Primitives | **Prioritas 2** | Motion primitives yang bisa diambil lewat shadcn registry, dan project ini sudah punya `react-bits.tsx` yang menulis ulang pola yang sama (`ScrollReveal`, `AnimatedContent`, `ShinyText`). Kandidat paling masuk akal untuk **menggantikan** `react-bits.tsx`, bukan layering di atasnya. |
| shadcn/ui (21st.dev, UIAble, Component Gallery) | **Prioritas 2** | Ini bukan library, ini sumber komponen. Dipakai untuk mengisi celah yang terukur, bukan untuk ganti primitive. |
| Scrolltide, Aceternity, Magic UI, Liquid Glass, Kinetics, Spline, Unicorn Studio | **Prioritas 5** | Tidak relevan. Halaman ini adalah direktori usaha kecil untuk warga, bukan studio kreatif. Menambah motion spektakuler di sini hanya menambah ukuran bundel dan memperburuk aksesibilitas tanpa nilai produk. |
| Theatre.js, Anime.js | **Prioritas 5** | `framer-motion` sudah menutup kebutuhan ini. |
| 3Dicons, mapcn, MicroKit, Uiverse, Navbar Gallery, CSS Text Effects | **Prioritas 5** | Di luar scope. |

**Jawaban singkat: yang tetap Top S untuk project ini adalah shadcn/ui yang
sudah ada ( untapped), lalu Motion Primitives untuk mengganti `react-bits.tsx`.
Kobra dan SmoothUI turun ke prioritas 3, COSS UI ke 4, dan sisanya keluar dari
pertimbangan.**

### 2.3 Satu resource dari daftar tambahan yang layak masuk daftar

- **Magic UI** dan **21st.dev** layak dipakai sebagai sumber komponen secara
  sporadik lewat `npx shadcn add`, bukan sebagai dependensi.

### 2.4 Catatan verifikasi

Situs yang disebut di daftar belum saya verifikasi satu per satu pada tanggal
analisis ini, dan nama seperti "OriginUI sudah redirect ke COSS UI" adalah
informasi dari sumber kedua. Sebeluminionti menambah apa pun dari daftar itu,
verifikasi dulu: (a) lisensinya, (b) apakah kodenya benar-benar bisa di-copy
lewat registry, (c) apakah dependensi barunya bisa diterima di
`vite.config.ts` tanpa merusak pembagian manual chunks. Rekomendasi di atas
bergantung pada struktur repo, bukan pada klaim sebuah situs.

---

## 3. Prompt untuk Freebuff coding agent

Salin blok di bawah ke agent. Isinya sudah menunjuk file dan urutan kerjaknya.

---

### PROMPT

```
Kamu akan melakukan modernisasi lapisan UI project Vite + React + Convex di
/home/daytona/codebase (nama produk: Sumenep Buku Kerja).

## Konteks wajib dibaca dulu
- Analisis dan alasannya: docs/ui/UI-MODERNIZATION-BRIEF.md
- Kontrak keamanan yang tidak boleh dilanggar:
  docs/security/PHASE-9.1-SECURITY-CLOSURE.md

## Prinsip
1. Tanpa dependensi runtime baru di tahap ini. Semua komponen yang dipakai
   harus sudah ada di src/components/ui/ atau ditulis lokal.
2. Satu file satu tujuan. Jangan menambah file baru kalau bisa mengpecah file
   yang ada.
3. Setiap tahap harus selesai dengan `bunx tsc -b --noEmit` dan
   `bun run test` hijau. Kalau merah, perbaiki sebelum lanjut.
4. Jangan menyentuh: src/lib/admin-whatsapp.ts, src/convex/**, src/lib/image-upload.ts,
   src/components/admin-access-gate.tsx, src/lib/admin-gate-client.ts,
   src/components/brand-mascot.tsx ( Except cleaning task 5 yang dis Listed),
   scripts/brand/**, scripts/mascot/**.
5. Jangan mengubah warna, font, radius, atau token warna di src/index.css
   kecuali diminta eksplisit pada tahap tertentu.
6. Jangan pakai dangerouslySetInnerHTML di mana pun.

## Tahap 1 - Pemakaian komponen yang sudah terpasang
Ganti markup manual dengan komponen yang sudah ada. Tanpa mengubah tampilan,
tanpa mengubah perilaku.
- src/pages/Dashboard.tsx: 15 <input> mentah -> komponen Input + Label +
  Field dari src/components/ui/field.tsx. Bungkus tiap group dengan Field
  supaya label, deskripsi, dan pesan error terpasang konsisten.
- src/components/community-widgets.tsx: 10 <input> mentah, sama seperti di atas.
- src/pages/Admin.tsx: 5 <input> mentah, sama seperti di atas.
- src/components/admin-security-log.tsx: tabel manual -> src/components/ui/table.tsx
  (Table, TableHeader, TableBody, TableRow, TableCell). Pertahankan urutan kolom
  dan teks sel persis seperti sekarang.
- src/pages/Auth.tsx: ganti kotak OTP buatan sendiri dengan
  src/components/ui/input-otp.tsx. Pastikan alur kirim ulang kode dan pesan
  error tetap sama, dan autofocus tetap jalan.
- Ganti notifikasi string inline di Admin.tsx dan community-widgets.tsx dengan
  toast dari src/components/ui/sonner.tsx. Jangan ganti pesan teksnya.

## Tahap 2 - State muat dan keadaan kosong
- Tambahkan skeleton dari src/components/ui/skeleton.tsx untuk daftar katalog,
  papan permintaan, dan antrean admin. Ganti spinner penuh yang sekarang
  memblokir interaksi.
- Pakai src/components/ui/empty.tsx untuk daftar kosong, dan pertahankan
  komponen maskot kosong yang sudah ada di src/components/admin-empty-mascot.tsx
  sebagai-isinya.

## Tahap 3 - Pencarian sebagai command menu
- src/pages/Landing.tsx dan src/pages/VendorProfile.tsx: pertahankan input
  pencarian yang ada sebagai write-out, lalu tambahkan command menu dari
  src/components/ui/command.tsx (Command + CommandInput + CommandList +
  CommandItem) yang menampilkan hasil katalog saat pengguna menekan Ctrl/Cmd+K.
- Command menu harus bisa dibuka dan ditutup dengan keyboard penuh, punya
  aria-label, dan tidak boleh mengubah query yang sedang berjalan.

## Tahap 4 - Pecah file besar
Pecah tanpa mengubah perilaku dan tanpa memindahkan logika ke server.
- src/pages/Admin.tsx (1537 baris) -> pecah per panel ke
  src/components/admin-*.tsx yang sudah ada polanya
  (lihat admin-security-log.tsx, admin-invite-link.tsx, admin-profile.tsx
  sebagai contoh bentuk berkas).
- src/components/admin-workspace.tsx (949 baris) -> pecah shell, form listing,
  dan tabel ke berkas terpisah.
- src/components/community-widgets.tsx (1131 baris) -> pecah papan permintaan,
  galeri, dan paket ke berkas terpisah.
- src/components/admin-security-log.tsx (750 baris) ->pecah tabel, filter, dan
  panel ringkasan.
- Aturan pemecahan: satu file punya satu export default, tidak ada circular
  import, dan tidak ada perubahan pada nama hook atau query yang dipanggil.

## Tahap 5 - Bersihkan kode mati
- src/components/ui/chart.tsx tidak diimpor siapa pun. Hapus berkasnya.
- Hapus "charts": ["recharts"] dari manualChunks di vite.config.ts bagian
  rollupOptions.output, dan hapus recharts dari package.json dependencies
  kalau tidak ada berkas lain yang memakainya (verifikasi dengan grep dulu).
- Pastikan `bun run build` tetap lulus setelahnya.

## Tahap 6 - Motion
- src/components/react-bits.tsx adalah lapisan motion lokal. Evaluasi penggantian
  dengan Motion Primitives (motion-primitives.com) lewat shadcn registry, satu
  komponen pada satu waktu, hanya untuk: ScrollReveal, AnimatedContent,
  ShinyText. Jangan menambah library baru kalau bisa menulis ulang lokal.
- Semua motion wajib menghormati prefers-reduced-motion.
- Jangan menyentuh animasi maskot; ada geometri dan validasi yang mengunci
  posisi dan warnanya.

## Gerbang yang wajib hijau di setiap tahap
bunx convex dev --once
bunx tsc -b --noEmit
bun run test
bun run build
bun run lint
bun run brand:check
bun run mascot:validate

## Yang harus dikembalikan
- Daftar file yang berubah per tahap, dengan alasan singkat.
- Angka test sebelum dan sesudah.
- Sisa pekerjaan yang sengaja ditunda, dengan alasannya.
- Jangan mengklaim selesai kalau ada gerbang yang merah.
```

---

## 4. Urutan yang disarankan

| Urutan | Pekerjaan | Alasan |
|---|---|---|
| 1 | Tahap 5 (kode mati) | Paling murah, mengurangi `recharts` dan satu-satunya `dangerouslySetInnerHTML`. |
| 2 | Tahap 1 (pakai komponen yang ada) | Dampak UX terbesar per baris yang diubah, nol dependensi baru. |
| 3 | Tahap 2 (skeleton dan empty) | Menghilangkan spinner yang memblokir interaksi. |
| 4 | Tahap 4 (pecah file besar) | Wajib sebelum Tahap 3, supaya pencarian tidak diubah di file 1537 baris. |
| 5 | Tahap 3 (command menu) | Nilai tinggi, tapi menyentuh alur pencarian yang sudah punya E2E. |
| 6 | Tahap 6 (motion) | Paling subjective, paling rendah risiko teknis, lakukan terakhir. |

Urutan ini sengaja menaruh penambahan dependensi paling besar di akhir, supaya
kalau nanti dibatalkan, tidak ada yang harus dibongkar.
