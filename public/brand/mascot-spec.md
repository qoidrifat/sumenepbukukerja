# Brand Mascot — Spesifikasi

Sumenep Buku Kerja · Phase 2 · mascot character system v1

Dokumen ini menjawab pertanyaan "apa itu maskot ini dan boleh dipakai
bagaimana". Untuk warna, clear space, dan aturan logo, lihat
[`README.md`](./README.md) dan [`usage-guide.md`](./usage-guide.md) — Phase 1
tidak berubah di Phase 2.

---

## 1. Identitas

Maskot tidak punya nama. Ia adalah **buku kerja-nya sendiri** yang bernapas:
buku terbuka Phase 1, dengan satu sudut halaman terlipat, yang sekarang punya
muka, ekspresi, dan gerak.

| | |
|---|---|
| Arti | Buku kerja digital yang menghubungkan kebutuhan warga dengan orang yang bisa mengerjakannya |
| Kepribadian | Ramah · penasaran · membantu · lokal · mumpuni |
| Nada | approachable, tenang, praktis, dipercaya, sedikit playful — tidak pernah kekanakan |
| Hubungan ke logo | Badannya **persis sama** dengan brand mark. Bukan "terinspirasi" — sama. |
| Sumber kebenaran geometri | `scripts/brand/mark.mjs` (Phase 1, beku) |

**Yang tidak pernah berubah:** bentuk buku, jarak spine 8 unit, sudut
terlipat, bahasa sudut bundar, isi rata, tanpa gradien.

**Yang boleh berubah:** warna (per tema), wajah, gestur, aksesori kecil, gerak.

### Aturan asal-usul

```
PHASE 1  Buku Terbuka + Sudut Terlipat   →  brand mark (beku)
PHASE 2  + wajah + ekspresi + gestur + aksesori + gerak
                                           →  Brand Mascot
```

Kalau ragu apakah sebuah perubahan melancholy masih "Buku Kerja", tanyakan:
apakah bentuk siluetnya masih bisa dikenali sebagai logo Phase 1? Kalau tidak,
itu bukan variasi — itu karakter lain.

---

## 2. Anatomi

Coordinate system `viewBox="0 0 96 96"` — sama persis dengan logo. Semua
angka di `src/lib/mascot-geometry.ts` dibaca dari geometri Phase 1.

### Lapisan, dari bawah ke atas

| Lapisan | Isi | Sumber |
|---|---|---|
| **Field** | Persegi bundar 4,4 88×88 rx 22 | `MASCOT_FIELD` |
| **Buku** | Halaman kiri, halaman kanan, lipatan | `BOOK_LEFT` / `BOOK_RIGHT` / `BOOK_FOLD` |
| **Wajah** | Mata, mulut, alis | `EYE*`, `MOUTHS`, `BROWS` |
| **Aksesori** | Piktogram kategori, di bawah buku | `ACCESSORIES` |
| **Dekorasi** | Kilau, tanda tanya | `SPARKLES`, `QUERY_MARK` |
| **Gerak** | `framer-motion` di `motion.div` HTML + `translate` di dalam SVG | `brand-mascot.tsx` |

### Mengapa field wajib

Jarak 8 unit di tengah spine adalah **negative space** — itulah yang membuat
dua halaman terbaca sebagai dua halaman. Tanpa field, jarak itu berwarna sama
dengan halaman putih dan buku menyatu jadi satu gumpalan. Field juga yang
membuat maskot terbaca di atas permukaan gelap.

### Zona yang dijaga

Validator `bun run mascot:validate` gagal keras kalau salah satu ini dilanggar.

| Zona | Batas | Aturan |
|---|---|---|
| Spine | x 44…52 | Tidak ada sapuan yang boleh menyeberang |
| Lipatan | x 67…80, y 27.8…40.8 | Kosong dari wajah, gestur, dan dekorasi |
| Aksesori | y 68…90 | Selalu di bawah buku, di dalam field |
| Dekorasi | tiga pojok field | Selalu di dalam field, tidak pernah di halaman |
| Simetri | x = 48 | Semua pasangan mata/mulut/alis dicerminkan |

### Jangkar

| Anchor | Koordinat | Dipakai untuk |
|---|---|---|
| `leftPage` | 30, 46 | Gelombang sapaan |
| `rightPage` | 66, 50 | Buka halaman, arahkan ke CTA |
| `centre` | 48, 46 | Napas, fokus |

### Batas minimum yang masih dikenali

- **Siluet saja** (tanpa wajah, tanpa aksesori): sudah unmistakable sebagai
  logo Phase 1.
- **Lipatan**: di `micro` berubah menjadi blok 20 unit (hasil pengukuran, bukan
  tebakan) supaya masih ada 3 piksel amber di 16px. Yang dijaga adalah
  *keberadaan lipatan*, bukan proporsinya.

---

## 3. Delapan state inti

`state` menentukan **wajah**. Gestur ikut state, tapi tidak pernah
menggantikan ekspresi.

| State | Mata | Mulut | Gestur | Kapan dipakai |
|---|---|---|---|---|
| `neutral` | open | calm | idle-bob | Default. Tenang, yakin |
| `hello` | open | smile | hello-wave | Sambutan, orientasi |
| `search` | open | uncertain | search-peek | Pencarian, menjelajah |
| `found` | wide | smile + alis | open-reveal | Jasa ketemu |
| `connect` | wide | calm | directional-point | Menuju percakapan |
| `success` | closed-happy | smile | celebration | Permintaan terkirim |
| `empty` | open | round + tanda tanya | idle-bob | Tidak ada hasil |
| `working` | narrowed | flat + alis | focus-work | Admin, moderasi |

Setiap state punya kombinasi mata/mulut yang **berbeda** — ada test yang
menjaga ini, karena dua state yang jatuh ke ekspresi sama berarti state itu
tidak bisa dibedakan.

### Etika WhatsApp

`connect` memakai gestur arah dan halaman yang terbuka. **Tidak ada** logo
WhatsApp, tidak ada hijau WhatsApp, tidak ada siluet gelembung chat. WhatsApp
adalah tujuan UI, bukan identitas.

---

## 4. Lima varian kategori

Kategori memakai **nama asli dari katalog** (`src/lib/catalog.ts`). Tidak ada
kategori karangan, tidak ada kategori yang digabung. Ada test yang membandingkan
setiap nama dengan `categoryOptions`.

| Key | Kategori | Aksesori | Karakter | Gerak aksesori | Aksen |
|---|---|---|---|---|---|
| `technical` | Servis Teknik | kunci pas | fokus, mumpuni | clank | `#2563EB` |
| `events` | Hajatan & Acara | pita | ceria | confetti | `#EC4899` |
| `culinary` | Kuliner | mangkuk + asap | hangat, mengajak | steam | `#F59E0B` |
| `transport` | Transportasi | panah + garis jalan | siap, tenang | lines | `#0EA5E9` |
| `general` | Jasa Umum | rumah + pintu | membantu | none | `#10B981` |

### Batasan aksesori

- Tidak pernah menutupi buku.
- Tidak pernah menutupi **lipatan**.
- Tidak pernah mendefinisikan ulang tubuh karakter.
- Bisa dilepas tanpa merusak karakter.
- Selalu bisa dimatikan: `size` menentukan apakah aksesori digambar, dan
  `tone` menentukan sejak level mana.
- Hanya di dalam field, selalu di bawah buku.

Aksesori **tidak mengubah warna tubuh**. Aksen kategori hidup di
`MASCOT_CATEGORIES[...].accent`, dipakai pemanggil di luar SVG — supaya satu
maskot tidak jadi lima maskot berbeda warna.

---

## 5. Sistem gerak

Dua belas perilaku, semua deterministik, semua berbasis `transform` dan
`opacity`, semua dari `framer-motion` yang sudah ada.

`role` menentukan **kapan** gestur hidup. `idle` = gestur itu napas tetap
state ini. `burst` = gestur adalah satu peristiwa; ia diputar sekali saat
state masuk, saat pointer masuk, dan saat diketuk, lalu karakter tenang.
Tanpa pemisahan ini, `hello` melambai ke pengguna sepanjang halaman hidup dan
`success` memantul tanpa henti.

| Gestur | Role | Saat diam | Saat gestur | Pemakaian |
|---|---|---|---|---|
| `idle-bob` | idle | y 1.2 unit | y 2.4 | `neutral` |
| `empty-wait` | idle | y 0.7 + mata menyapu | y 1.2 | `empty` |
| `hello-wave` | burst | y 0.8 | halaman kiri x −2, rotate 1.5° | `hello` |
| `search-peek` | idle | dua halaman x ±0.9 + mata menyapu | x 0.6 | `search` |
| `open-reveal` | burst | y 0.8 | dua halaman membuka x ±1.2 | `found` |
| `focus-work` | idle | y 0.8 + halaman x 0.3 | y 1.2 | `working`, admin |
| `directional-point` | idle | halaman kanan x 0.5 | halaman kanan x 1.8 | `connect` |
| `celebration` | burst | y 0.7 | y 2 + rotate 1.5° | `success` |
| `steam-drift` | idle | uap y 2 unit | — | kuliner |
| `motion-lines` | idle | garis x 1.4 unit | — | transportasi |
| `welcome-nod` | burst | y 1.2 | y 2 | cadangan |
| `none` | burst | 0 | 0 | beku total |

Amplitudo di atas adalah nilai pada `lg` + `public` + intensitas `normal`.
Nilai akhirnya adalah hasil kali tangga di §5b.

### Lapisan gerak — satu lapisan, satu tanggung jawab

Hanya satu lapisan boleh menggerakkan satu grup. Ini yang membuat pose dan
animasi tidak bisa saling menimpa.

| Lapisan | Elemen | Hanya boleh |
|---|---|---|
| L0 badan | `motion.div` (HTML) | `y`, `rotate` |
| L1 pose | `motion.g` | `x` = nilai pose diam, **tidak pernah** berosilasi |
| L2 osilasi | `motion.g` (anak L1) | `x` berpusat 0 |
| L3 mata | `motion.g` | `x`, maksimal `MASCOT_GAZE.maxX` |
| L4 aksesori/kilau | `motion.g`, `motion.path` | `x`, `y`, `opacity` |
| L5 kedip | `motion.g` (anak L3) | `opacity` saja |

Pose diam dipisah dari osilasi karena dua alasan. Pertama, L1 hanya punya satu
nilai, jadi framer bisa **men-tween** pose saat state berganti — tidak ada lagi
pose yang melompat saat `search` menjadi `found`. Kedua, osilasi selalu
berpusat di nol, jadi pose tidak bisa ikut tergeser oleh animasi yang sedang
berjalan. Lipatan (`BOOK_FOLD`) tetap di dalam grup halaman kanan (L2), jadi
ia tidak pernah menerima transform sendiri dan tidak bisa tertinggal.

Geometri wajah — rect mata, path mulut, path alis — **tidak pernah**
ditransformasi. Yang bergeser hanya grup pembungkus mata.

### Tiga aturan yang tidak bisa dilanggar

1. **Tidak ada `rotate`/`scale` di dalam SVG.** `transform-origin` CSS pada
   elemen SVG selalu (0,0), jadi transform kedua berputar di titik yang salah.
   Rotasi dan scaling hanya di `motion.div` HTML. Di dalam SVG hanya
   `translate` dan `opacity`.
2. **`repeat: Infinity` hanya jalan kalau** `useReducedMotion()` false **dan**
   `animated` true.
3. **Tidak ada loop JS per frame.** Tidak ada `setInterval`, tidak ada state
   yang di-set per frame, dan tidak ada `requestAnimationFrame` yang menjadwalkan
   dirinya sendiri. Satu pengecualian yang diizinkan sejak Phase 5: rAF boleh
   dipakai sebagai **coalescer sekali-jalan** untuk `pointermove` — maksimal
   satu pembacaan layout per frame — dan wajib dibatalkan saat pointer keluar
   dan saat unmount. Batas ini dijaga `mascot-animation.test.ts`.

### Hover, tekan, dan mata

Desktop, saat pointer masuk: gestur `react` diputar sekali (amplitudo lebih
besar dari gestur yang sama — bukan gestur baru), lalu karakter kembali tenang.

Sejak Phase 5 mata ikut membaca pointer: `pointermove` menggeser **satu-sumbu**
posisi mata ke arah pointer dengan pegas lembut. Batasnya dihitung dari
geometri, bukan dipilih: jarak mata terlebar ke spine adalah 3 unit, dan
`maxX` + `cadangan` = 1.5 + 1.5 = 3. Sumbu vertikal **tidak ada** — celah
antara mata dan tepi goresan mulut hanya 0.1 unit pada pasangan `empty`, jadi
gerak vertikal sekecil apa pun akan membuat mata menyentuh mulut. "Hidup"
vertikal dibawa badan (L0).

Tekan (`pointerdown`) memicu gestur yang sama, tanpa lapisan transform kedua.
`whileTap` framer sengaja tidak dipakai: framer menambahkan `tabIndex="0"`
pada elemen ber-gesture tap, dan itu membuat maskot dekoratif jadi perhentian
Tab tanpa nama — dilarang §8.

### 5b. Tangga amplitudo

Amplitudo akhir = `ukuran × intensitas × kategori × tone`.

| Ukuran | `micro` | `sm` | `md` | `lg` | `hero` |
|---|---|---|---|---|---|
| pengali | 0 | 0 | 0.8 | 1 | 1.15 |

| Intensitas | `reduced` | `normal` | `expressive` |
|---|---|---|---|
| pengali | 0.55 | 1 | 1.35 |

Kategori dan tone hanya mengubah **tempo dan energi**, tidak pernah arti
state: `hello` + kategori apa pun tetap terbaca sebagai `hello`. Tone `admin`
selalu lebih tenang dari `public` (energi 0.7, tempo 1.25).

Catatan jujur: `DETAIL_RULES[*].gesture` di `mascot-geometry.ts` (modul beku)
masih `false` untuk `medium`, dan flag itu tidak pernah dibaca siapa pun.
Phase 5 memilih §7 — 96px tetap harus membedakan state lewat gerak, dengan
amplitudo dikurangi — jadi `md` = 0.8, bukan 0. Ketidaksepakatan ini disematkan
di `mascot-animation.test.ts` supaya tidak bisa terlupakan.

### Kedip

Satu siklus panjang (8.5–13.5 detik) berisi **dua** kedip dengan jarak yang
tidak rata, plus jeda awal acak 0–3.2 detik per instance. Tujuannya satu:
dua maskot di satu halaman tidak boleh berkedip serentak, dan jedanya tidak
boleh bisa diprediksi. Jeda efektifnya 4.25–6.75 detik (§13: 3.5–7.5 detik).
State `success` tidak berkedip sama sekali — matanya sudah tertutup senang.

### Reduced motion

`useReducedMotion()` true → pose `rest` untuk **semua** layer: badan, halaman,
kedip, mata, aksesori, dan dekorasi berhenti. Pointer tidak lagi menggerakkan
mata. Ekspresi tetap terbaca karena ekspresi digambar sebagai bentuk, bukan
sebagai gerak — dan pose diam tetap digambar, jadi `hello` di 96px masih bisa
dibedakan dari `found` tanpa satu pun animasi berjalan. Tidak ada makna yang
hanya disampaikan lewat animasi.

---

## 6. Public vs admin

Identitas sama; **presentasi** berbeda.

| | Public | Admin |
|---|---|---|
| Field | Brand Blue `#2563EB` | Charcoal `#1A1A1A` |
| Halaman | Putih + `#DBEAFE` | `#F5F0E5` + `#EAE4D4` |
| Lipatan | Amber `#F59E0B` | Safety Orange `#FF5A26` |
| Aksesori | dari `large` ke atas | baru di `hero` |
| Gestur | ekspresif | `focus-work` |
| Ukuran tipikal | `md` … `lg` | `micro` … `sm` |

Admin terasa seperti **asisten sistem yang membantu**, bukan karakter kartun
di dalam dashboard. Bentuknya tidak pernah digambar ulang per tema.

---

## 7. Ukuran responsif

Lima tingkat. Tingkat detail dipilih dari **nilai prop `size`**, bukan dari
piksel terukur — ukuran responsif lewat CSS tidak diketahui saat render.

| Size | Tailwind | Detail | Wajah | Aksesori | Dekorasi |
|---|---|---|---|---|---|
| `micro` | `size-6` (24px) | buku menyatu, lipatan blok | — | — | — |
| `sm` | `size-12 xl:size-14` (48/56px) | mark penuh | — | — | — |
| `md` | `size-24 sm:size-28 xl:size-36` (96/112/144px) | + wajah penuh | ya | — | — |
| `lg` | `size-40 xl:size-52` (160/208px) | + aksesori | ya | ya | — |
| `hero` | `size-64 xl:size-80` (256/320px) | + alis, gestur, dekorasi | ya | ya | ya |

Aturan penyederhanaan:

- **Tidak semua detail ada di semua ukuran.** Wajah hilang di bawah `md`,
  aksesori di bawah `lg`, dekorasi hanya di `hero`.
- **Detail tidak pernah "muncul lalu hilang"** lagi di ukuran yang lebih
  besar — ada test yang menjaganya.
- **Peta `size → detail` eksplisit** (`MASCOT_SIZE_DETAIL`). Nama ukuran
  (`sm/md/lg`) dan nama anatomi (`small/medium/large`) sengaja berbeda; tanpa
  peta itu, `DETAIL_RULES[size]` jadi `undefined` dan komponen crash.

### Pose diam — apa yang membedakan state tanpa mengubah wajah

Tiga state ini (`hello`, `search`, `connect`) sengaja **tidak** memakai
wajah yang berbeda. Pembedaannya datang dari posisi halaman:

| State | Pose halaman | Bacaan |
|---|---|---|
| `hello` | halaman kiri terbuka ke luar (−2.2 unit) | terbuka, menyapa |
| `search` | kedua halaman bergerak berlawanan arah (∓1.2 unit) | condong ke dalam, melihat |
| `connect` | halaman kanan terbuka ke luar (+2.4 unit) | menjangkau arah tujuan |
| `found` | kedua halaman terbuka (∓0.8 unit) | buku terbuka, "ketemu" |

Nilai dalam unit viewBox, jadi 1 unit = 1 piksel pada render 96px.
Gap spine hanya 8 unit, jadi perubahan 1–2.4 unit mengubah proporsinya
cukup jelas untuk dibaca pada frame statis — termasuk di screenshot dan
saat reduced motion membekukan animasi.

Batasnya: **wajah tidak pernah ikut bergeser.** Mata tetap di tempat, badan
yang bergerak. Untuk `search` ini justru memperkuat bacaan "matanya mencari,
badannya diam".

Sudut terlipat ikut halaman kanan, tidak pernah berdiri sendiri — kalau
dipisah, lipatan akan terlepas dari sudut halaman dan itu merusak signature
Phase 1. Ada test yang menjaganya.

---

## 8. Aksesibilitas

**Bawaan: dekoratif.** Nama kategori selalu dibawa teks di sebelahnya, jadi
ilustrasi tidak boleh diumumkan dua kali.

```tsx
<BrandMascot category="culinary" size="md" />
// -> <span aria-hidden="true"> … <svg focusable="false">

<BrandMascot state="search" size="lg" label="Mencari jasa"
// -> <span role="img" aria-label="Mencari jasa"> … <title>Mencari jasa</title>
```

- Tanpa `label`: `aria-hidden="true"` + `focusable="false"`, tidak ada
  `<title>`, tidak ada `role`. **Bukan** target fokus, tidak pernah.
- Dengan `label`: `role="img"` + `aria-label` + `<title>`. Tidak ada
  `aria-hidden` di dalam — jadi maskot tidak pernah setengah terumumkan.
- Tidak ada `<text>`, tidak ada font di-embed, tidak ada `<image>`, tidak ada
  `<use>`, tidak ada base64, tidak ada URL eksternal.
- Label itu **opsional** dan dipakai hanya kalau ilustrasi adalah satu-satunya
  pembawa makna. Kalau teks di sebelahnya sudah menyebut "Kuliner", maskot
  tidak perlu mengulanginya.

---

## 8b. Placement rule — jangan taruh di atas Brand Blue

**`BrandMascot` tidak boleh diletakkan langsung di atas `#2563EB`
(Brand Blue), atau background lain yang cukup dekat dengan warna field-nya.**

Alasannya terukur, bukan stylistic: field mascot adalah `rect` opaque
`#2563EB` dengan `rx 22`. Di atas permukaan `#2563EB` yang sama, batas
field hilang sepenuhnya dan mascot terbaca sebagai gumpalan biru datar —
siluet, sudut terlipat, dan seluruh bentuk maskot lenyap bersama.
Terverifikasi di browser pada Phase 3.

Perbedaan 4 poin warna sudah cukup untuk menghancurkan silhouette:
`#2563EB` di atas `#1D4ED8` atau `#1E40AF` hampir tidak terlihat.

### Diperbolehkan

| Permukaan | Alasan |
|---|---|
| White `#FFFFFF` | kontras penuh |
| Canvas `#F7F8FC` | kontras penuh |
| Blue Soft `#DBEAFE` | kontras penuh |
| Parchment `#FAF7EE` (admin) | kontras penuh |
| Charcoal `#121212` | kontras penuh, tetap terbaca |
| `#DBEAFE`, `#E0F2FE`, `#F1F5F9` | aman |

### Kalau tidak ada pilihan lain

Jangan mengganti warna field per konteks — itu memecah identitas. Gunakan
salah satu dari:

1. **Stage** — bungkus dalam `rounded-2xl` dengan `border border-slate-200`
   di atas lantai warna apa pun. Stage-lah yang memisahkan, bukan field.
2. **Ukuran besar** — di atas 128px, book dan fold sudah cukup tebal untuk
   tetap terbaca meski field menyatu.

### Kalau tidak ada pilihan dan tidak ada stage

Jangan pakai `BrandMascot`. Kembali ke logo mark atau ke ilustrasi legacy.
Maskot yang tidak bisa dibaca lebih buruk dari tidak ada maskot.

---

## 9. API

```tsx
type BrandMascotProps = {
  state?: "neutral" | "hello" | "search" | "found"
       | "connect" | "success" | "empty" | "working";
  category?: "technical" | "events" | "culinary" | "transport" | "general";
  size?: "micro" | "sm" | "md" | "lg" | "hero";
  tone?: "public" | "admin";
  animated?: boolean;   // default true
  label?: string;       // tanpa ini = dekoratif
  className?: string;
};
```

Semua default-nya pessimistic: `neutral` + tanpa kategori + `md` + `public` +
animasi on + dekoratif.

---

## 10. Peta integrasi

### Sudah terpasang

| Permukaan | State | Ukuran | Permukaan §8b | Catatan |
|---|---|---|---|---|
| `pages/NotFound.tsx` | `empty` | `md` | White | Menggantikan ikon `BookOpen` generik |
| `pages/Landing.tsx` (hasil pencarian kosong) | `empty` | `md` | White | Menggantikan glyph `⌕` generik |
| `pages/Dashboard.tsx` (belum ada listing milik Anda) | `empty` | `md` | `#F8FAFC` (setara Canvas) | Menggantikan ikon `Store` generik |
| `pages/Dashboard.tsx` (belum ada listing tersimpan) | `hello` | `md` | White | Menggantikan tile `bg-blue-50` + ikon `Bookmark` |
| `main.tsx` `RouteLoading` | `working` | `md` | Canvas `#F7F8FC` | Teks berdenyut dipertahankan sebagai pembawa pesan |

Semuanya adalah penggantian **ikon generik dengan karakter brand** atau
penambahan pada permukaan yang kosong — bukan migrasi destruktif.

Dua catatan placement yang perlu diingat kalau permukaannya nanti diubah:

- **Listing tersimpan.** Semula tile `bg-blue-50` (`#EFF6FF`) berdiri di
  situ. Itu persis near-miss §8b: biru muda di belakang field biru.
  Tile-nya dihapus, bukan warnanya yang digeser.
- **Listing milik Anda.** Wadah `bg-slate-50` (`#F8FAFC`) sudah ada
  sebelum Phase 4. Selisihnya ke Canvas `#F7F8FC` paling besar
  2/255 per kanal, jadi diperlakukan sebagai permukaan yang sama —  Diassert di `src/lib/mascot-placement.test.ts` yang menjaga angka itu.

### Kandidat, ditolak

| Permukaan | Alasan ditolak |
|---|---|
| Hero landing (`hello`, `lg`) | Berdampingan dengan `CodedLogoOrbit`; dua karakter di satu hero saling bersaing |
| Request kosong | **Sudah ada** `PublicRequestMascot`; jangan taruh dua maskot |
| Berhasil kirim permintaan | Chip `role="status"` inline; tidak ada ruang, hierarki pesan rusak |
| Notifikasi / riwayat interaksi | Teks status satu baris; maskot jadi dekorasi |
| Error umum | Pesan error harus tetap dominan |
| Admin header / moderation kosong | **Sudah ada** `AdminEmptyMascot`; `tone="admin"` punya identitas sendiri |
| `Admin.tsx` "Katalog dalam kondisi baik" | Banner kesehatan, bukan empty state; maskot jadi noise |
| `VendorProfile.tsx` "Belum ada ulasan" | Catatan dashed inline di dalam form; konteks terlalu kecil |
| `Auth.tsx` | Sudah pakai logo brand; auth di luar lingkup Phase 4 |
| Tabel padat, CRUD row, tiap tombol | **Jangan** dipakai di sini |

### Maskot yang sudah ada sebelumnya

Ketiganya **tidak dihapus dan tidak ditulis ulang** pada Phase 2. Keduanya punya
identitas sendiri yang sudah dipakai luas:

| Komponen | Peran | Alasan tetap |
|---|---|---|
| `PublicRequestMascot` | Ilustrasi sheet+kartu untuk papan permintaan | Bentuknya bukan buku; mengubahnya = regression visual di halaman yang sudah disetujui |
| `AdminEmptyMascot` | Ilustrasi queue kosong untuk claims & foto | Terikat ke dua variant admin yang sudah jadi |
| `CategoryMascot` + `CategoryMascotStage` | Karakter kategori per kartu kategori | Punya stage/tint sendiri yang sudah jadi sistem warna kategori |

Yang benar-benar dibagikan antar ketiganya adalah **disiplin**, bukan viewBox:
inline SVG, flat fill tanpa gradien, `useReducedMotion()`, gerak hanya
`transform` dan `opacity`, dan tidak ada `rotate` di dalam SVG.

Kalau nanti maskot lama perlu disatukan, itu pekerjaan terpisah dengan
migration sendiri — bukan efek samping Phase 2.

---

## 11. Larangan

**Jangan:**

- mengganti bentuk buku, jarak spine, atau sudut terlipat;
- menggambar wajah di atas negative space spine;
- menaruh aksesori di zona lipatan;
- memakai `rotate`/`scale` di dalam SVG;
- memberi `aria-label` pada maskot yang teksnya sudah menyebut kategori;
- memakai maskot di tabel padat, tiap tombol, atau baris CRUD;
- mengubah warna tubuh per kategori (aksen hidup di luar SVG);
- memakai nama kategori yang tidak ada di `categoryOptions`;
- mengubah taksonomi kategori, query, filter, hitungan, atau routing;
- menambah dependency animasi baru.

**Boleh:**

- ganti `state` untuk mengubah ekspresi;
- ganti `category` untuk menambah aksesori;
- `size="hero"` untuk konteks besar;
- `tone="admin"` di workspace admin;
- `animated={false}` untuk konteks statis (mis. dalam daftar panjang);
- `label` kalau maskot itu satu-satunya pembawa makna.

---

## 12. Checklist QA Phase 3

Belum ada yang di bawah ini yang **terbukti lewat browser**. Yang sudah
terbukti hanya yang terukur: `bun run mascot:check` dan `bun run test`.

### Wajib dibuka

- [ ] `/__mascot` — halaman preview (dev only)
- [ ] `/` — hasil pencarian kosong
- [ ] `/halaman-yang-tidak-ada` — 404
- [ ] `/admin` — header dan queue kosong

### Ukuran

- [ ] 360 · 390 · 430 · 768 · 1024 · 1280 · 1440
- [ ] Ukuran maskot: 24 · 48 · 56 · 96 · 144 · 160 · 208 · 256 · 320

### Yang harus dilihat (tidak bisa diukur)

- [ ] Wajah terbaca di 96px? Bibir masih jelas?
- [ ] Aksesori kunci pas — masih terbaca sebagai kunci pas, bukan sebagai gumpalan biru?
- [ ] Aksesori panah + garis jalan — terasa "berjalan", tidak berlebihan?
- [ ] Uap mangkuk — apakah hilang atau jadi noise?
- [ ] Pita Hajatan — festive tanpa ramai?
- [ ] Rumah + pintu — masih terbaca sebagai "rumah" di 160px?
- [ ] Lipatan amber kontrasnya cukup di atas biru di semua ukuran?
- [ ] Silhouette `micro` 24px — masih terasa "buku"?
- [ ] Versi admin di atas parchment — kontras cukup?
- [ ] Versi public di atas `#121212` — kontras cukup?
- [ ] Tidak ada layout shift saat state/ukuran berubah
- [ ] Tidak ada horizontal overflow
- [ ] Console bersih

### Reduced motion

- [ ] DevTools → Rendering → emulate `prefers-reduced-motion: reduce`
- [ ] Semua maskot diam total
- [ ] Ekspresi tetap terbaca tanpa gerak
- [ ] Tidak ada `repeat: Infinity` yang tersisa

---

## 13. Integrasi produk (Phase 4)

Phase 4 tidak mengubah karakter. Anatomi, proporsi wajah, sistem pose,
dan verdict 96px semuanya tetap beku seperti Phase 3.1; yang berubah
hanya **tempat maskot berdiri**.

### Yang dijaga

| Kontrak | Dijaga oleh |
|---|---|
| Permukaan di allowlist §8b | `mascot-placement.test.ts` |
| Tidak ada biru-ke-biru | `mascot-placement.test.ts` |
| Karakter selalu dekoratif, pesan dibawa teks | `mascot-placement.test.ts` + `qa-surfaces.mjs` |
| Tidak ada dua maskot di satu permukaan | `mascot-placement.test.ts` |
| Tidak pernah di bawah 96px | `mascot-placement.test.ts` |
| Permukaan yang ditolak tetap ditolak | `mascot-placement.test.ts` |
| Warna benar-benar dirender sesuai §8b | `mascot:qa:surfaces` |

### Memeriksa sendiri

```bash
bun run mascot:qa:surfaces   # 114 pemeriksaan di browser
```

Script ini mengukur `background-color` yang benar-benar dirender di
belakang field, ukuran render di tiap lebar, clipping, overflow, dan
error console — bukan hanya membaca source code. Warna dinormalkan ke sRGB lewat
canvas supaya `oklch()` dari Tailwind v4 tidak lolos sebagai nilai
yang berbeda.

Kalau suatu hari permukaan baru mau ditambah, urutannya: cek §8b dulu,
tambahkan ke registry `INTEGRATED`, lalu jalankan dua perintah di atas.
Permukaan yang tidak bisa masuk ke allowlist harus ganti konteksnya,
bukan ganti maskotnya.

---

## 14. Gerak & interaksi (Phase 5)

Phase 5 **tidak mengubah satu path pun.** Body, wajah, mulut, alis, lipatan,
aksesori, pose diam, dan verdict 96px "A — MASCOT" semuanya tetap. Yang
berubah hanya kapan dan seberapa jauh sesuatu bergerak.

### Yang diperbaiki

| Sebelum | Sesudah |
|---|---|
| `hello` melambai terus-menerus (`repeat: Infinity` untuk gestur sapaan) | melambai sekali saat state masuk / hover / ketuk, lalu bernapas |
| `success` memantul tanpa henti | satu lompatan, lalu tenang |
| pose dan osilasi dihitung satu fungsi, jadi pose melompat saat state berganti | dua grup bersarang; pose di-tween 500ms, osilasi berpusat nol |
| kedip seragam: 4.4 detik, semua instance serentak | siklus 8.5-13.5 detik dengan pola tidak rata + jeda acak per instance |
| mata tidak pernah bergerak | mata mengikuti pointer, satu sumbu, dibatasi geometri |
| tidak ada reaksi tekan | `pointerdown` memicu gestur |
| amplitudo sama di 24px dan 144px | tangga amplitudo per ukuran, intensitas, kategori, tone |
| `role`/`loops`/`amplitude` di config hanya dokumentasi | `role` benar-benar dibaca komponen; `amplitude` diperbarui ke nilai nyata |

### Yang dijaga

| Kontrak | Dijaga oleh |
|---|---|
| Gestur burst tidak pernah jadi loop | `mascot-animation.test.ts` |
| Burst selalu lebih besar dari napas state itu | `mascot-animation.test.ts` |
| Pose diam tidak dikalikan tangga amplitudo | `mascot-animation.test.ts` |
| Tangga ukuran/ intensitas / kategori / tone | `mascot-animation.test.ts` |
| Batas gerak mata dihitung ulang dari geometri | `mascot-animation.test.ts` |
| Kedip tidak metronomis, jeda di rentang 3.5-7.5s | `mascot-animation.test.ts` |
| Kedip punya siklus 8.5-13.5s, tidak bisa sinkron | `mascot-animation.test.ts` |
| Semua durasi di rentang bahasa gerak §5 | `mascot-animation.test.ts` |
| Lipatan menempel di SEMUA state, bukan hanya `connect` | `mascot-animation.test.ts` |
| Tidak ada listener/timer/rAF yang bocor | `mascot-animation.test.ts` + `mascot:qa:motion` |
| Maskot tetap tidak fokusable (tidak ada `tabindex`) | `mascot-animation.test.ts` + `mascot:qa:motion` |
| Perilaku sungguhan di browser: burst, mata, tekan, beku | `mascot:qa:motion` |
| Tidak ada satu pun piksel yang berubah saat reduced motion | `mascot:qa:behaviour` |

### Memeriksa sendiri

```bash
bun run mascot:qa:behaviour   # 17 pemeriksaan gerak & aksesibilitas
bun run mascot:qa:motion      # perilaku Phase 5 di browser
bun run mascot:qa             # tangkapan 96px per state & kategori
```

Studio `/__mascot` (dev saja) punya kontrol **Motion** (reduced / normal /
expressive) dan **Interaction** (simulate hover, simulate tap, replay state).
Tombol simulate mengirim event pointer sungguhan ke elemen maskot, bukan
memanggil handler langsung — jadi yang dilihat reviewer adalah jalur kode yang
sama dengan jalur pengguna. Panel "Gerak" di bawah kontrol membaca
`MASCOT_STATES` dan `MASCOT_BEHAVIOURS` apa adanya, jadi tidak ada deskripsi
kedua yang bisa basi.

Aturan untuk fase berikutnya: kalau sebuah gerak tidak bisa dijawab dengan
"kenapa maskot bergerak sekarang?", gerak itu tidak ditambahkan. Bentuk
karakter sudah disetujui — yang boleh diperbaiki hanya hidupnya.
