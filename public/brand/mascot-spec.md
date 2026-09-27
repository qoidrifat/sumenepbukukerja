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

Sepuluh perilaku, semua deterministik, semua berbasis `transform` dan
`opacity`, semua dari `framer-motion` yang sudah ada.

| Gestur | Amplitudo | Loop | Pemakaian |
|---|---|---|---|
| `idle-bob` | y 1.2 unit | ya | default, kosong, hero |
| `hello-wave` | x 2 unit, halaman kiri | ya | `hello` |
| `search-peek` | y 0.6 unit | ya | `search` |
| `open-reveal` | x 1.6 unit, dua halaman | ya | `found` |
| `focus-work` | y 0.8 unit | ya | `working`, admin |
| `directional-point` | x 1.8 unit, halaman kanan | ya | `connect` |
| `celebration` | y 2 unit + rotasi 2° | ya | `success` |
| `steam-drift` | uap y 2 unit | ya | kuliner |
| `motion-lines` | x 1.4 unit | ya | transportasi |
| `welcome-nod` | y 1.2 unit | ya | jasa umum |
| `none` | 0 | tidak | beku total |

### Tiga aturan yang tidak bisa dilanggar

1. **Tidak ada `rotate`/`scale` di dalam SVG.** `transform-origin` CSS pada
   elemen SVG selalu (0,0), jadi transform kedua berputar di titik yang salah.
   Rotasi dan scaling hanya di `motion.div` HTML. Di dalam SVG hanya
   `translate` dan `opacity`.
2. **`repeat: Infinity` hanya jalan kalau** `useReducedMotion()` false **dan**
   `animated` true.
3. **Tidak ada React render loop.** Tidak ada `setInterval`, tidak ada
   `requestAnimationFrame`, tidak ada state yang di-set per frame.

### Hover

Desktop: `idle → react → idle`. Reaksi adalah amplitudo yang lebih besar dari
gestur yang sama — bukan gestur baru. Tidak ada bounce besar, rotate 360°,
shake, atau flash.

### Reduced motion

`useReducedMotion()` true → pose `rest` untuk **semua** layer: badan, halaman,
kedip, dan dekorasi berhenti. Ekspresi tetap terbaca karena ekspresi
digambar sebagai bentuk, bukan sebagai gerak. Tidak ada makna yang hanya
disampaikan lewat animasi.

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

| Permukaan | State | Ukuran | Catatan |
|---|---|---|---|
| `pages/NotFound.tsx` | `empty` | `md` | Menggantikan ikon `BookOpen` generik |
| `pages/Landing.tsx` (hasil pencarian kosong) | `empty` | `md` | Menggantikan glyph `⌕` generik |

Keduanya adalah penggantian **ikon generik dengan karakter brand** — bukan
migrasi destruktif.

### Kandidat, belum dipasang

| Permukaan | State | Ukuran | Catatan |
|---|---|---|---|
| Hero landing | `hello` | `lg` | Berdtsama dengan `CodedLogoOrbit` yang sudah ada — hati-hati competition |
| Request kosong | `empty` | `md` | **Sudah ada** `PublicRequestMascot`; jangan taruh dua mascot |
| Berhasil kirim permintaan | `success` | `md` | Setelah mutasi sukses, belum ada ilustrasi |
| Loading katalog | `working` | `sm` | `RouteLoading` sekarang teks berdenyut |
| Error umum | `working` | `sm` | Pesan error harus tetap dominan |
| Admin header | `neutral` | `micro` | Opsional; `tone="admin"` |
| Admin moderation kosong | `working` | `md` | **Sudah ada** `AdminEmptyMascot`; jangan duplikasi |
| Tabel padat, CRUD row, tiap tombol | — | — | **Jangan** dipakai di sini |

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
