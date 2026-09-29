## Overview

This project uses the following tech stack:
- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Convex (for backend & database)
- Convex Auth (for authentication)
- Framer Motion (for animations)
- Three js (for 3d models)

All relevant files live in the 'src' directory.

Use bun for the package manager.

## Setup

This project is set up already and running on a cloud environment, as well as a convex development in the sandbox.

## Environment Variables

The project is set up with project specific CONVEX_DEPLOYMENT and VITE_CONVEX_URL environment variables on the client side.

The convex server has a separate set of environment variables that are accessible by the convex backend.

Currently, these variables include auth-specific keys: JWKS, JWT_PRIVATE_KEY, and SITE_URL.


# Using Authentication (Important!)

You must follow these conventions when using authentication.

## Auth is already set up.

All convex authentication functions are already set up. The auth currently uses email OTP and anonymous users, but can support more.

The email OTP configuration is defined in `src/convex/auth/emailOtp.ts`. DO NOT MODIFY THIS FILE.

Also, DO NOT MODIFY THESE AUTH FILES: `src/convex/auth.config.ts` and `src/convex/auth.ts`.

## Using Convex Auth on the backend

On the `src/convex/users.ts` file, you can use the `getCurrentUser` function to get the current user's data.

## Using Convex Auth on the frontend

The `/auth` page is already set up to use auth. Navigate to `/auth` for all log in / sign up sequences.

You MUST use this hook to get user data. Never do this yourself without the hook:
```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

## Protected Routes

The starter `/dashboard` route is protected with `RequireAuth`. Extend that page
for the product's authenticated experience, and reuse `RequireAuth` when adding
another protected route — do NOT hand-roll a redirect to `/auth`, since landing
on a bare sign-in form with no explanation of what was blocked is confusing.

`RequireAuth` states the block on the page the visitor asked for and sends them
to `/auth?returnTo=<current route>` when they choose to sign in, so they come
back to it. Pass `title` and `description` to say what the page is:

```tsx
<Route
  path="/dashboard"
  element={
    <RequireAuth
      title="Sign in to view your dashboard"
      description="Your projects and settings live here."
    >
      <Dashboard />
    </RequireAuth>
  }
/>
```

Pass `redirectImmediately` for a route where bouncing straight to `/auth` really
is better.

## Auth Page

The auth page is defined in `src/pages/Auth.tsx`. Send sign-in and sign-up actions
to `/auth`.

## Authorization

You can perform authorization checks on the frontend and backend.

On the frontend, you can use the `useAuth` hook to get the current user's data and authentication state.

You should also be protecting queries, mutations, and actions at the base level, checking for authorization securely.

## Adding a redirect after auth

The `/auth` route in `src/main.tsx` redirects to `/dashboard` by default. If the
product's main authenticated route is different, update `redirectAfterAuth` to
that route. A validated same-origin `returnTo` query parameter takes priority so
users can resume the protected page they originally requested. Never leave an
authenticated product redirecting back to the public landing page.

## Complete authenticated products

When the requested product implies accounts, a workspace, a dashboard, or other
signed-in functionality, the task is not complete with only a landing page and
auth form. Build the main authenticated experience, protect its route, and verify
that signing in reaches it.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.


## Landing Pages

You must always create good-looking designer-level styles to your application. 
- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.


### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.


## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. 

# Using the Convex backend

You will be implementing the convex backend. Follow your knowledge of convex and the documentation to implement the backend.

## The Convex Schema

You must correctly follow the convex schema implementation.

The schema is defined in `src/convex/schema.ts`.

Do not include the `_id` and `_creationTime` fields in your queries (it is included by default for each table).
Do not index `_creationTime` as it is indexed for you. Never have duplicate indexes.


## Convex Actions: Using CRUD operations

When running anything that involves external connections, you must use a convex action with "use node" at the top of the file.

You cannot have queries or mutations in the same file as a "use node" action file. Thus, you must use pre-built queries and mutations in other files.

You can also use the pre-installed internal crud functions for the database:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.ts";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
```


## Common Convex Mistakes To Avoid

When using convex, make sure:
- Document IDs are referenced as `_id` field, not `id`.
- Document ID types are referenced as `Id<"TableName">`, not `string`.
- Document object types are referenced as `Doc<"TableName">`.
- Keep schemaValidation to false in the schema file.
- You must correctly type your code so that it passes the type checker.
- You must handle null / undefined cases of your convex queries for both frontend and backend, or else it will throw an error that your data could be null or undefined.
- Always use the `@/folder` path, with `@/convex/folder/file.ts` syntax for importing convex files.

---

## Cadangan Data & Pemulihan

Retensi di `src/convex/dataRetention.ts` menghapus data secara rutin — itu
keputusan yang benar, tetapi berarti "data lama sudah hilang" adalah
keadaan normal, bukan kegagalan. Karena itu ada cadangan mingguan otomatis.

### Di mana cadangannya

- Satu dokumen JSON per minggu di Convex **file storage** (PRIVATE — tidak ada
  URL publik yang dibagikan).
- Metadata setiap cadangan ada di tabel `backupRuns`: kunci minggu ISO
  (`2026-W38`), `storageId`, jumlah baris per tabel, ukuran byte, dan status
  (`ok` atau `partial`).
- Jadwal: cron Kamis 01:00 UTC (`src/convex/crons.ts`, "cadangan data
  mingguan"). Idempoten per minggu — jalan ulang di minggu yang sama tidak
  membuat dokumen kedua.

### Cara menemukan cadangan terbaru

```bash
# Tanpa GUI: jalankan internal query dari dashboard Convex
# internal.storage.latestBackupRuns  -> 5 cadangan terakhir
```

Di dashboard: **Tables → backupRuns**, urut `byWeek` menurun. Ambil `storageId`
teratas, lalu unduh lewat dashboard Convex → Storage.

### Isi cadangan

`vendors`, `reports`, `auditLogs`, `reviews`, `serviceRequests`, `errorReports`.
Satu baris = satu dokumen `{ weekKey, generatedAt, vendors: [...], ... }`.

**Tidak termasuk (sengaja):** akun, sesi, token, refresh token, passcode
admin, dan metadata `_storage`. Kalau dokumen cadangan ikut dicadangkan, satu
backup yang bocor berarti membocorkan seluruh riwayat backup.

### Cara memulihkan

1. Unduh dokumen JSON dari storage.
2. Untuk tiap tabel di dalamnya, sisipkan kembali dokumen dengan `_id` yang SAMA
   (bukan `_generation`) lewat skrip admin Convex atau `npx convex data` +
   import tooling. Memakai id yang sama menjaga semua `entityId`, `vendorId`,
   dan `actorId` yang menunjuk ke dokumen itu tetap hidup.
3. Setelah impor, jalankan:
   - `internal.storage.backfillAnalyticsCounters` — supaya angka dashboard
     kembali sesuai,
   - `internal.storage.backfillWhatsappStats` — supaya status pengiriman
     kembali sesuai isi tabel.

### Batasan yang harus diketahui

- Setiap tabel dipotong pada **5.000 baris** per cadangan. Tabel yang lebih
  besar ditandai `partial` dan ditandai `"<tabel>_truncated": true` di dalam
  JSON — isinya bukan jumlah keseluruhan.
- Cadangan bertipe snapshot, bukan log perubahan: perubahan yang terjadi
  SESUDAH cadangan diambil tidak ada di dalamnya.
- Hanya berjalan bila deployment aktif. Kalau cron berhenti (deployment
  di-nonaktifkan), tidak ada cadangan baru; cek `backupRuns` untuk melihat
  tanggal terakhir.

### Pemeliharaan storage (terkait)

- `internal.storage.pruneOrphanStorage` (harian, jam 05:00 UTC) menghapus blob
  tanpa rujukan yang **lebih tua dari 24 jam**, dan TIDAK PERNAH menghapus
  blob yang masih terpetakan di `uploadedBlobs`, dirujuk `vendorPhotos` atau
  `users.profileImageStorageId`, atau dipakai dokumen cadangan.
- Unggahan foto memakai dedup sha256 di peramban: berkas identik tidak pernah
  diunggah dua kali (lihat `src/lib/image-upload.ts`).

#### Apa yang sudah terbukti, dan apa yang belum

Kedua hal ini sengaja dibedakan karena sumber buktinya berbeda:

- **Keamanan produksi sudah terverifikasi.** Cron benar-benar berjalan di
  deployment dan tidak salah menghapus. Eksekusi sungguhan terhadap data
  produksi melaporkan `scanned: 0, deleted: 0` karena semua blob yang ada
  masih di bawah masa tenggang 24 jam. Yang terbukti adalah bahwa Persyaratan
  sudah benar, bukan bahwa ada berkas yang benar-benar terhapus.
- **Jalur penghapusan sudah terverifikasi lewat tes otomatis.** Berkas
  `src/convex/storage-race.test.ts` membuat blob yatim dengan umur yang
  dipalsukan (>24 jam) lalu memastikan `deleted: 1`. Tes yang sama memastikan
  blob yang masih muda tidak dihapus, blob yang masih dirujuk tidak dihapus,
  dan eksekusi kedua tidak menghapus apa pun (idempoten).

Belum ada bukti produksi bahwa penghapusan sungguhan terjadi. Untuk itu
diperlukan satu blob yatim asli yang sudah melewati masa tenggang. Jangan
mencatat "production deletion observed" sebelum itu terlihat.

## Utang teknis yang disengaja (Fase 2, Juli 2026)

Tiga berkas masih besar. Ini dicatat, bukan diperbaiki:

| Berkas | Baris |
|---|---|
| `src/pages/Admin.tsx` | 1.537 |
| `src/convex/adminGate.ts` | 1.549 |
| `src/convex/community.ts` | 1.388 |

Ekstraksi pertama sudah dilakukan dan berhasil (`admin-workspace-hero.tsx`),
tapi sisa monolith **ditunda**, bukan diselesaikan. Alasannya teknis, bukan
waktu: memindahkan fungsi Convex mengubah nama referensinya
(`api.community.createReport` → `api.reports.createReport`), dan setiap
penggantian nama itu adalah perubahan API yang bisa menjatuhkan klien lama yang
masih memakai versi deploy sebelumnya. Memindahkannya butuh strategi
kompatibilitas yang sadar-migrasi — alias satu versi, atau nama fungsi
berversi — dan itu pekerjaan tersendiri yang harus punya tujuannya sendiri.

Yang sudah diekstraksi (bukti bahwa jalurnya bekerja):

- `src/components/admin-workspace-hero.tsx` — hero ruang kerja admin.

Yang dilakukan sebagai gantinya: pengujian di `Admin.tsx` dipindah mengikuti
kodenya, dan batas file dikunci agar tidak tumbuh lagi tanpa alasan.

## Landing dirender satu kali (Fase 3)

Dulu `Landing` membungkus `DirectoryContent` dengan DUA shell: satu `lg:hidden`
untuk mobile dan satu `hidden lg:block` untuk desktop, padahal isinya identik.
Akibatnya:

- setiap `id` jadi ganda di DOM, jadi HTML-nya tidak valid;
- `getElementById` dan navigasi fragment browser selalu mendarat di salinan
  PERTAMA, yaitu shell mobile yang `display:none` di lebar desktop;
- akibat konkretnya, di desktop SEMUA anchor dalam halaman (`#katalog`,
  `#permintaan`, `#cara-pakai`) dan tombol hero "Mulai cari jasa" tidak
  melakukan apa-apa.

Perbaikannya satu shell, dengan selisih padding `pb-safe-nav` dipindah ke
media query `lg` di `src/index.css`. Terukur di Chromium:

```text
#katalog       : 2 -> 1
node DOM       : 2525 -> 1280
scrollY CTA    : 0 -> 894 (sebelumnya tidak bergerak)
```

Regresi dikunci di `src/pages/landing-shell.test.ts` (sumber) dan
`e2e/main-flow.spec.ts` (perilaku di peramban sungguhan).

## Performa katalog (Fase 4)

Definisi **catalog-ready**: kartu listing pertama terlihat DAN kolom cari bisa diketik. Tidak menunggu gambar selesai atau seluruh halaman ter-hidrasi.

Benchmark: `bun run perf:catalog [jumlahSampel]` (butuh Chromium Playwright). Backup hasilnya: median, min, max, jumlah sampel, mode build, dan peramban.

### Angka terukur (build produksi, 9 sampel, sequential)

| Tahap | median |
|---|---:|
| responseEnd (HTML) | 4 ms |
| first contentful paint | 400 ms |
| domContentLoaded | 314 ms |
| T_js (responseEnd → DCL) | 311 ms |
| `#katalog` terpasang | 804 ms |
| **catalog-ready** | **923 ms** (min 820, max 1018) |
| perjalanan data Convex (kartu − shell) | **113 ms** |

### Dua koreksi penting atas catatan sebelumnya

1. **Angka "6,3–7,0 detik" dari Fase 3 adalah artefak kontensi, bukan latensi
   satu pengguna.** Angka itu diukur dengan empat konteks dingin dibuka
   BERSAMAAN. Diuji ulang:

   | Kondisi | shell | kartu | perjalanan data |
   |---|---:|---:|---:|
   | 1 pengguna (sequential) | 1.087 ms | 1.202 ms | 113 ms |
   | 4 bersamaan | 4.698 ms | 5.200 ms | 502 ms |

   Keduanya membesar ~4,4×, jadi degradasinya adalah saturasi CPU/bandwidth
   dan koneksi, bukan sesuatu yang khas pada katalog. Angka produksi yang
   jujur untuk satu pengguna adalah **~0,9 detik**.

2. **Database bukan bottleneck.** Perjalanan data (`listActive` sampai kartu
   tampil) cuma 113 ms dari total 923 ms - sekitar 12%. Sisanya (~90%) adalah
   unduh dan eksekusi JavaScript di peramban.

### Optimasi yang diuji lalu DIKEMBALIKAN

`html2canvas-pro.min.js` (56 kB, 15% dari seluruh JS) ikut terunduh di jalur
kritis setiap halaman karena `@zumer/snapdom` yang diimpor toolbar pratinjau.
Toolbar dimuat saat sibuk untuk mengeluarkannya dari bundel kritis.

Hasilnya: bundel indeks turun 538 → 407 kB (gzip 169 → 127 kB), TAPI
catalog-ready tidak bergerak (923 → 917 ms, rentang beririsan penuh) dan
`load` justru naik 608 → 1.089 ms. Karena bukti tidak mendukungnya,
perubahan dikembalikan. Berkas `vly-toolbar-readonly.tsx` tidak pernah diubah.

### Skala katalog (bukti untuk keputusan paginasi ditunda)

`src/convex/catalog-scale.test.ts` mengukur `vendors:listActive` di 6 / 100 /
300 / 500 vendor aktif:

| Vendor | ms | ms/vendor | Muatan |
|---:|---:|---:|---:|
| 6 | 1 | 0,167 | - |
| 100 | 6 | 0,060 | - |
| 300 | 10 | 0,033 | - |
| 500 | 16 | 0,032 | 266 KB |

Data tumbuh 83×, latensi hanya 16× - **sublinear, tanpa cliff**, dan biaya
per vendor justru turun. Di ambang 500 vendor, query memakan 16 ms. Keputusan
menunda paginasi karena itu terbukti oleh ukuran, bukan tebakan.

## Catatan SEO

Metadata listing publik (`title`, `description`, Open Graph, canonical,
JSON-LD `LocalBusiness`) ditulis di peramban lewat `useEffect` pada
`src/lib/use-listing-metadata.ts`.

### Yang sudah ada

- `index.html` sekarang membawa Open Graph dasar situs (`og:title`,
  `og:description`, `og:type`, `og:site_name`, `twitter:card`), sehingga
  crawler tanpa JavaScript tidak lagi menerima `<head>` yang kosong sama
  sekali. Tag ini ditimpa per-listing setelah hidrasi.
- Sitemap XML (`/sitemap.xml`) dan `/robots.txt` tersedia di router HTTP
  Convex, jadi mesin pencari tetap punya peta URL yang benar, dan URL itu
  sama dengan yang dirender peramban. Rute privat (`/admin`, `/dashboard`,
  `/auth`, `/invite/*`) tidak pernah masuk sitemap.

### Yang BELUM ada, dan kenapa ditunda

Bukti terukur terhadap build produksi untuk `/v/<slug>`:

```text
title       : judul generik situs
canonical   : tidak ada
og:*        : tidak ada
JSON-LD     : tidak ada
nama listing: tidak ada di HTML
```

Artinya ketujuh target metadata (title, description, canonical, OG title,
OG description, OG image, LocalBusiness JSON-LD) BELUM ada di HTML awal.

**Keputusan: `DEFERRED BY DESIGN - REQUIRES HOST/BUILD PRERENDER ARCHITECTURE`.**

Empat opsi yang diperiksa:

| Opsi | Kenapa tidak diambil |
|---|---|
| A. Prerender saat build | Listing bisa berubah saat runtime (terbit, diarsipkan, diedit). Prerender build memotret data dan menghasilkan konten basi; listing baru tidak punya halaman sampai deploy ulang. |
| B. Server HTML per rute | Tidak ada server aplikasi; aplikasi adalah SPA statis. |
| C. HTML dari router Convex | Route HTTP Convex hanya hidup di origin `*.convex.site`, sedangkan aplikasi dilayani host lain. Tidak ada reverse proxy di repo yang memetakan domain aplikasi ke sana. |
| D. Prerender tingkat host | Butuh konfigurasi host di luar repo, tidak bisa diverifikasi dari sini. |

Yang perlu disiapkan bila someday dikerjakan: siklus build ulang (agar tidak
basi), konfirmasi bahwa host mengutamakan berkas statis sebelum fallback SPA,
dan `og:image` yang butuh URL absolut.

- This includes importing generated files like `@/convex/_generated/server`, `@/convex/_generated/api`
- Remember to import functions like useQuery, useMutation, useAction, etc. from `convex/react`
- NEVER have return type validators.
