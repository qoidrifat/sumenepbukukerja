# Brand — Sumenep Buku Kerja

> Jasa dekat, tanpa ribet.

Identitas visual ini adalah **evolusi** dari sistem yang sudah ada, bukan
penggantian. Semua asset dibangun dari satu sumber geometry
(`scripts/brand/mark.mjs`) dengan alat lokal (`scripts/brand/raster.mjs`), jadi
tidak ada asset yang bisa berbeda satu piksel dari yang lain, dan tidak ada
dependensi baru.

> **Mascot character system ada di
> [`mascot-spec.md`](./mascot-spec.md).** Logo dan maskot memakai geometri
> yang sama; bedanya, maskot menambah wajah, ekspresi, aksesori, dan gerak.
> `bun run mascot:check` menjaga agar badan maskot tidak pernah menyimpang dari
> `mark.mjs`.

## Konsep

**Buku terbuka dengan satu sudut halaman terlipat.**

Buku terbuka = katalog, catatan, buku kerja. Sudut terlipat = halaman yang
kamu cari. Sudut itu duduk di kanan atas, posisi yang sama dengan badge `?` di
`PublicRequestMascot` dan kilau/`z` di `AdminEmptyMascot` — jadi symbol ini
berasal dari keluarga maskot yang sama, bukan aset yang dijatuhkan.

Yang **dibuang** dan alasannya: pin lokasi. Pin adalah penanda "peta" paling
generik yang ada, dan produk ini bukan aplikasi peta. Versi lamanya juga
tabrakan secara geometris dengan halaman kanan (132 unit²) dan titiknya
hilang total di 16px.

## Varian logo

| File | Pemakaian | Background |
|---|---|---|
| `logo-primary.svg` | navbar, header, dokumen | putih / canvas |
| `logo-primary-dark.svg` | lockup di atas gelap | `#0F172A` / `slate-950` |
| `logo-stacked.svg` | centered, splash, presentasi | putih / canvas |
| `logo-mark.svg` | avatar, navbar, admin, favicon | semua |
| `logo-wordmark.svg` | hanya nama | semua |
| `logo-mono-black.svg` | cetak satu warna, background terang | putih / parchment |
| `logo-mono-white.svg` | cetak satu warna, background gelap | `#121212` |
| `logo-mono-navy.svg` | satu warna brand | putih |

Symbol (`logo-mark.svg`) adalah **parent identity**. Lockup hanya menambahkan
wordmark dan tagline di atas symbol itu - tidak pernah menggantinya.

## Warna

| Token | Hex | Pemakaian |
|---|---|---|
| Brand Blue | `#2563EB` | field symbol, aksen wordmark |
| Brand Blue Dark | `#1D4ED8` | varian mono navy |
| Blue Light | `#93C5FD` | aksen wordmark di background gelap |
| Blue Soft | `#DBEAFE` | halaman kanan |
| Charcoal | `#121212` | mono hitam, admin |
| Text | `#0F172A` | wordmark di terang |
| Warm Accent | `#F59E0B` | sudut terlipat — satu-satunya aksen |
| Canvas | `#F7F8FC` | background aplikasi |
| Parchment | `#FAF7EE` | background admin |

**Gradient tidak pernah jadi struktur.** Hilangkan warnanya dan bentuknya
tetap utuh; `#2563EB → solid` menghasilkan logo yang sama.

## Clear space

Sekitar symbol harus kosong sebesar **12 unit** pada viewBox 96 — setara
sekitar 12% dari sisi symbol. Teks, ikon, dan bentuk lain tidak boleh masuk
area ini.

## Ukuran minimum

| Aset | Minimum | Catatan |
|---|---|---|
| `logo-mark.svg` | 16px | di bawah 16px pakai varian `icon-16.svg` yang sudah disederhanakan |
| Varian mono | 24px | viewBox-nya rapat, tidak ada ruang terbuang |
| `logo-primary.svg` | 180px lebar | di bawah itu pakai stacked |
| `logo-stacked.svg` | 96px lebar | |
| `logo-wordmark.svg` | 120px lebar | |

Di 16px, sudut terlipat sengaja dibuat **blok 20 unit** (3.3px). Itu hasil
sweep, bukan tebakan: kaki 10 dan 12 unit menghasilkan 0 dan 1 piksel amber
di 16px. Varian 16px juga menghilangkan jarak tengah antar halaman karena
celah 8 unit hanya jadi 1.33px dan cuma mengencerkan silhouette.

## Background

- **Terang** (`#FFFFFF`, `#F7F8FC`) — `logo-primary.svg`, `logo-mark.svg`.
- **Gelap** (`#121212`, `#0F172A`) — `logo-primary-dark.svg`, `logo-mono-white.svg`.
- **Parchment / admin** (`#FAF7EE`) — `logo-mark.svg` di tile putih, atau `logo-mono-black.svg`.
- **Foto** — selalu taruh di atas panel solid atau netral. Jangan menaruh
  logo langsung di atas foto yang ramai.

Varian mono tetap punya **negative space 8 unit** di antara dua halaman.
Jangan pernah menggantinya dengan garis pembatas — itulah yang membuat versi
mono lama menjadi satu gumpalan solid.

## Ikon aplikasi

| File | Ukuran | Purpose |
|---|---|---|
| `favicon.svg` / `favicon.ico` | 16/32/48 | favicon |
| `icon-16/32/48/64.svg` + `.png` | — | launcher |
| `apple-touch-icon.png` | 180 | iOS **wajib PNG** |
| `icon-192/512.png` | 192/512 | manifest, `purpose: any` |
| `icon-maskable-512.png` | 512 | `purpose: maskable` |

Ikon maskable memakai artwork **284px** di kanvas 512 (inset 22.3% per sisi)
supaya sudutnya tetap di dalam lingkaran aman Android berdiameter 80%.
Background-nya full-bleed `#2563EB`, tidak transparan. Versi lama hanya
memakai 18.75% kanvas sehingga hampir tak terlihat setelah dipotong.

## Dilarang

Jangan:

- meregangkan, memipihkan, atau memiringkan
- mengganti warna di luar token di atas
- menambah gradient, outline, atau bayangan pada logo
- memisahkan field dari buku, atau menukar sisi halaman
- memindahkan atau menghapus sudut terlipat
- menambahkan logo, warna, atau pin WhatsApp
- menambahkan aksesori kategori (kunci, mangkuk, pita) ke symbol
- memakai mascot penuh sebagai logo
- menaruh logo di background berkontras rendah
- memakai lockup sebagai `<text>` yang bisa di-inline ke layout

WhatsApp di produk ini adalah **tujuan handoff**, bukan identitas. Warna
hijau dan pin WhatsApp tidak boleh masuk ke logo.

## Typography wordmark

Wordmark memakai `<text>` dengan font stack yang **persis sama** dengan
Tailwind default project:

```
ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif
```

`index.html` tidak memuat font eksternal, jadi lockup yang menaruh `Inter`
di depan selalu jatuh ke `system-ui` — hasilnya wordmark yang tidak pernah
sama dengan situs. Di dalam aplikasi, wordmark adalah **HTML live**
(`Brand` di `Landing.tsx`, header di `admin-workspace.tsx`), jadi tipografi
selalu ikut situs. SVG lockup untuk keperluan distribusi/cetak.

## Membangun ulang

```bash
bun run brand:build     # tulis ulang SVG + PNG + .ico dari mark.mjs
bun run brand:check     # selfcheck rasterizer + ukur mark + validasi asset
```

Lalu jalankan `bun run brand:build` lagi bila perlu. Outputnya deterministik:
dua kali build menghasilkan file yang identik.
