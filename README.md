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

## Batas data publik (Fase 5)

Prinsipnya: **skema database bukan skema API publik.** Query publik memilih
field per field di sisi server; tidak ada lagi `return { ...vendor }` pada
endpoint yang bisa dibaca tanpa akun.

`vendors:listActive` dan `vendors:getBySlug` memakai proyeksi eksplisit
(`toPublicCatalogVendor` di `src/convex/vendors.ts`). Field yang TIDAK keluar:

| Field | Alasan |
|---|---|
| `ownerId` | pengenal user internal |
| `businessId` | pengenal bisnis Meta |
| `subscriptionTier` | informasi komersial |
| `whatsappClicks`, `shareClicks`, `searchImpressions` | metrik analitik internal |
| `status` | metadata internal; katalog publik hanya berisi listing aktif |
| `createdAt`, `updatedAt`, `_creationTime` | metadata internal |

`photoId` sengaja tetap ada **hanya** di `getBySlug`, karena halaman profil
memakainya untuk meminta URL gambar - dan gambar itu memang ditampilkan
publik. Jadi itu pengenal, bukan rahasia; di katalog kartu tidak memakainya dan
field-nya dihilangkan.

Diukur pada 500 listing aktif: muatan JSON turun dari **447.952 ke 245.781
byte (−45,1%)**, jumlah field per listing dari **37 ke 21**. Di 6 listing:
5.345 ke 2.929 byte, gzip 403 byte.

Angka di atas diukur ulang pada 29 September 2026 (Fase 6). Nilai sebelumnya
yang tertulis di sini (240.281 byte) sudah usang; angka baselinenya 447.952
tetap sama karena diukur dari bentuk dokumen penuh sebelum proyeksi.

Pengunci: `src/convex/public-data-surface.test.ts` (7 test) - memastikan field
internal tidak bocor, field publik tetap ada, katalog tetap bisa dibaca tanpa
akun, dan pengguna terautentikasi tidak mendapat field tambahan.

> **Dua angka muatan yang berbeda itu disengaja, bukan pertentangan.**
> `public-data-surface.test.ts` memakai fixture dengan deskripsi panjang
> ("Deskripsi usaha yang cukup panjang untuk menguji beban") sehingga keluar
> **245.781 byte**, sedangkan `catalog-scale.test.ts` memakai fixture lebih
> pendek sehingga keluar **213.281 byte** pada 500 vendor. Yang dibandingkan
> dengan baseline 447.952 selalu angka yang pertama, karena hanya itu yang
> diukur sebelum-dan-sesudah pada fixture yang sama.

### Yang sengaja dibiarkan

`community:listRequests` (publik) masih mengembalikan `requesterName`. Papan
permintaan tanpa nama pembuat kehilangan gunanya. Nama itu sudah melewati
`resolvePublicName` (koreksi pengguna, lalu tebakan dari email, lalu fallback),
dan `email` mentah tidak pernah ikut keluar.

> **CATATAN VERSI.** Sampai Fase 3, `requesterId` dan `offeredBy` sengaja
> dibiarkan keluar ke pembaca yang punya sesi. Itu **tidak lagi berlaku**: dua
> pengenal akun internal itu sekarang tidak punya jalan keluar sama sekali.
> Jawaban papan dibentuk daftar putih di `src/lib/request-dto.ts`, dan
> kebutuhan UI digantikan tiga boolean yang dihitung server: `isMine`,
> `canManage`, `canOffer`. Jangan menambahkan kembali `requesterId`/
> `offeredBy` ke DTO - test regresi di `src/lib/request-dto.test.ts` akan
> menolaknya. Lihat `docs/security/SECURITY-HARDENING-REPORT.md` bagian 2.1.

### Hardening keamanan (Fase 0-6)

Ringkasan lengkapnya beserta sisa risiko ada di
`docs/security/SECURITY-HARDENING-REPORT.md`. Yang sudah tayang di kode:

| Perubahan | Bukti |
|---|---|
| `requesterId`/`offeredBy` tidak lagi keluar dari papan permintaan; diganti `isMine`/`canManage`/`canOffer` | `src/lib/request-dto.ts` + 13 test |
| Otorisasi terpusat - lima salinan aturan di `community.ts` dan `vendors.ts` dihapus | `src/convex/revoked-session-coverage.test.ts` (10 test) |
| Sesi yang dicabut ditolak di seluruh pintu pengelola, termasuk dua berkas yang dulu melewatkannya | idem |
| `ensureCatalogSeeded` berhenti menulis ke baris milik orang lain; penyelarasan koordinat jadi `internalMutation` | idem |
| Tabel `securityIncidents` + sembilan aturan deteksi + panel Security Desk + cron retensi | `src/lib/security-rules.ts`, `src/convex/securityIncidents.ts` (21 + 21 test) |
| Token undangan yang ditebak berulang tercatat sebagai insiden (`invite_token_invalid`) | `src/convex/access-denial-contract.test.ts` (10 test) |
| `bun audit`: 46 -> 15 kerentanan, 0 critical, 0 dependensi langsung rentan; `axios` tak terpakai dihapus; satu lockfile | bagian 8 laporan |
| Telemetri rute tidak lagi memakai penanda bintang `postMessage` | `src/lib/postmessage-origin.test.ts` (6 test) |
| Panel "Sesi Anda" tidak lagi menampilkan angka yang diklaim peramban | `src/convex/session-context-authority.test.ts` (8 test) |
| Route konteks ditutup saat allowlist kosong, dan dibatasi 30 permintaan/menit per IP | `src/convex/context-route-hardening.test.ts` (11 test) |
| `.gitignore` memblokir `.env.keys` dan seluruh dump rahasia | `.gitignore` |
| Unggahan hanya menerima format raster allowlist; `image/svg+xml` ditolak | `src/lib/image-upload.ts` + `src/convex/storage.test.ts` |
| Peta blob ikut menegakkan batas ukuran, jadi sampah besar tidak pernah dipangkas | idem |
| Enam permukaan baca publik dipotong di server (notifikasi, interaksi, laporan, ulasan anonim) | `src/convex/reviews-notifications.test.ts` + bagian 2.11 laporan |
| `vendors.listActive` dan `community.listRequests` punya plafon pemindaian | bagian 2.12 laporan |

> **CATATAN VERSI, Fase 6.** `POST /admin-gate/context` sebelumnya menjawab
> `access-control-allow-origin: *` setiap kali allowlist origin kosong, jadi
> situs mana pun bisa membaca masked IP, kota, dan token konteks milik
> pengunjung dari perambannya. Sekarang allowlist kosong berarti **tidak ada**
> header izin sama sekali. Agar panel "Sesi Anda" tetap menampilkan IP di
> produksi, isi `ADMIN_CONTEXT_ALLOWED_ORIGINS` di tab Keys/API keys:
>
> ```
> ADMIN_CONTEXT_ALLOWED_ORIGINS=https://sumenepbukukerja.freebuff.app
> ```
>
> Jangan pakai `SITE_URL` untuk itu: pada deployment yang diuji, `SITE_URL`
> menunjuk origin `.convex.site` itu sendiri, bukan origin frontend. Wildcard
> lama masih bisa diminta secara eksplisit lewat
> `ADMIN_CONTEXT_ALLOW_WILDCARD_CORS=true`, tapi tidak disarankan.

**Yang BELUM selesai dan tidak boleh dianggap selesai:** rotasi rahasia dan
pemindaian riwayat Git (bagian 6 laporan), privasi nomor WhatsApp (bagian
5.2), security header (bagian 9.3), dan lima dari sembilan pemicu deteksi
(bagian 5.1).

> **CATATAN VERSI, Fase 10-11.** Aturan unggahan foto berubah dari "awalan
> MIME `image/`" menjadi allowlist format raster. Kalau produk nanti perlu
> menerima format lain (misalnya `image/tiff` hasil pindai), tambahkan ke
> `ALLOWED_IMAGE_TYPES` di `src/lib/image-upload.ts` - **jangan** kembalikan ke
> `startsWith("image/")`, karena itu menerima SVG yang bisa menjalankan skrip
> dari origin storage. Tiga gerbang membaca aturan yang sama: peta blob
> (`storage.recordUploadedBlob`) sekarang juga menolak berkas melebihi 1 MB,
> dan itu disengaja - peta membuat `pruneOrphanStorage` menganggap blob itu
> "pernah dipakai", jadi tanpa batas ukuran satu unggahan raksasa jadi sampah
> permanen.

> **CATATAN VERSI, Fase 16.** `@convex-dev/auth` naik ke 0.0.96 dan
> `@auth/core` kini jadi dependensi langsung di 0.41.3. Keduanya satu paket:
> `@auth/core` adalah *peer dependency* yang versinya kita kendalikan, dan
> 0.0.96 adalah versi yang memperlebar peer ke `^0.41.1` - bukan dinaikkan paksa
> sendiri. `package-lock.json` juga dihapus: `bun.lock` sekarang satu-satunya
> lockfile, dan `bun install --frozen-lockfile` lulus tanpa perubahan.

> **CATATAN VERSI, Fase 10.** Dua aturan deteksi lain - pola penolakan hak
> khusus dan storage id yang disisir - **tidak bisa** dipasang dari dalam
> gerbang yang melempar. Mutation Convex bersifat atomik: ketika handler
> melempar, bukti yang ditulis sebelumnya ikut hilang. Percobaannya dibuat,
> diuji, lalu ditarik kembali, dan alasannya dikunci test di
> `src/convex/access-denial-contract.test.ts`. Jangan menuliskan "catat lalu
> tolak" di dalam mutation; buktinya selalu hilang tanpa error apa pun.

## Backlog 17 requirement (Fase 1-6)

Ini **backlog kanonik**. Penomoran di bawah adalah penomoran asli sejak awal
proyek dan tidak boleh diubah. Laporan fase yang menyusun ulang nomor - dengan
mencampur requirement asli dan temuan baru seperti "public data minimization"
atau "runtime integrity" - tidak bisa dibandingkan dengan histori audit.
Karena itu tabel ini yang jadi acuan, bukan ringkasan per fase.

Status hanya boleh salah satu dari: `PASS`, `PARTIAL - DEFERRED BY DESIGN`,
`IMPLEMENTED - EXTERNAL VERIFICATION PENDING`, `DEFERRED BY DESIGN`, `BLOCKED`,
`FAILED`. Tidak ada "hampir selesai", "100%", atau "seharusnya jalan".

### Tabel status (per 29 September 2026, akhir Fase 7)

| # | Requirement | Sumber | Test | Produksi | Status |
|---:|---|---|---|---|---|
| 1 | WhatsApp | ya | ya | handoff verified; pengiriman server-side tidak ada lagi | `IMPLEMENTATION CHANGED - REQUIREMENT SEMANTICS REVIEW REQUIRED` |
| 2 | Two-session / staff bootstrap | ya | ya | tidak dijalankan | `BLOCKED` |
| 3 | Server-side IP context | ya | ya | ya | `PASS` |
| 4 | SHA-256 dedup | ya | ya | ya | `PASS` |
| 5 | Orphan cleanup | ya | ya | `deleted=0` | `IMPLEMENTED - EXTERNAL VERIFICATION PENDING` |
| 6 | Image downscale | ya | ya | ya | `PASS` |
| 7 | Analytics throttle | ya | ya | ya | `PASS` |
| 8 | Bundle | ya | ya | ya | `PASS` |
| 9 | SEO | sebagian | ya | sebagian | `PARTIAL - DEFERRED BY DESIGN` |
| 10 | Reviews | ya | ya | ya | `PASS` |
| 11 | Daily admin summary | ya | ya (15 test) | tautan handoff siap; tidak dikirim otomatis | `NOT REPLACED BY wa.me (bagian otomatis)` |
| 12 | Notifications | ya | ya | terkirim belum terbukti | `PASS` |
| 13 | Decomposition | sebagian | - | - | `DEFERRED BY DESIGN` |
| 14 | Playwright E2E | ya | ya | 0 gagal / 8 skip | `IMPLEMENTED - EXTERNAL VERIFICATION PENDING` |
| 15 | Backup | ya | ya | ya | `PASS` |
| 16 | Error aggregation | ya | ya | ya | `PASS` |
| 17 | Pagination | sengaja tidak | ya (bukti) | - | `DEFERRED BY DESIGN` |

**Rekap: `PASS` 9 · `IMPLEMENTED - EXTERNAL VERIFICATION PENDING` 4 · `BLOCKED` 1 · `PARTIAL - DEFERRED BY DESIGN` 1 · `DEFERRED BY DESIGN` 2 = 17.**

Sumber per item: #1/#12 `src/convex/whatsapp.ts` · #2 `e2e/flows.spec.ts:116` ·
#3 `src/convex/adminGate.ts:31-157` · #4 `src/convex/errorReports.ts:129-222` ·
#5 `src/convex/dataRetention.ts` · #6 `src/lib/image-upload.ts` ·
#7 `src/convex/analytics.ts:33` · #8 hasil `vite build` · #9 `src/lib/use-listing-metadata.ts` +
`src/lib/sitemap.ts` · #10 `src/convex/vendors.ts:740` · #11 `src/convex/whatsapp.ts:1050,1088` ·
#13 lihat "Utang teknis yang disengaja" · #14 `e2e/` · #15 `src/convex/storage.ts` ·
#16 `src/convex/errorReports.ts` · #17 `src/convex/catalog-scale.test.ts`.

### Temuan Fase 5-6 (bukan requirement baru - jangan diberi nomor)

Temuan-temuan ini nyata dan diverifikasi, tapi bukan bagian dari 17 backlog.
Memberinya nomor sendiri membuat hitungan jadi menyesatkan, jadi statusnya
dicatat terpisah di sini.

| Temuan | Sumber | Test | Produksi | Status |
|---|---|---|---|---|
| Public data minimization | `src/convex/vendors.ts:159-213` | ya | ya (21 field, live) | `PASS` |
| Runtime integrity | `src/pages/Landing.tsx` | ya | ya | `PASS` |
| Listing discovery `/v/:slug` | `e2e/discovery.spec.ts` | ya | ya | `PASS` |
| Sitemap/robots di deployment | `src/convex/http.ts:413-414` | ya | **404 di origin** | `BLOCKED` |
| Proyeksi data publik regresi | `src/convex/public-data-surface.test.ts` | ya | ya | `PASS` |
| `community:listRequests` `requesterId` | `src/lib/request-dto.ts` | ya (13 test) | diperbaiki di Fase 3 | `RESOLVED - NO LONGER DEFERRED` |

### Item 11 - gap test yang ditutup di Fase 7

Sampai akhir Fase 6, `adminDailySummaryCounts` (`src/convex/whatsapp.ts:1050`),
`sendAdminDailySummary` (`:1088`), dan registrasi cron-nya **tidak punya satu
pun test**. (Fungsi itu sudah diganti `prepareAdminDailySummary` di Fase 8.)
Kegagalan di sana adalah keheningan: ringkasan bisa diam-diam
mengirim angka nol, melewatkan admin, atau melaporkan "terkirim" padahal
provider menolaknya.

`src/convex/admin-daily-summary.test.ts` (15 test) menutupnya TANPA kredensial
apa pun. Yang dikunci:

- angka `openErrorReports` / `newRequests` / `activeAdminSessions` dihitung
  dari tabelnya masing-masing, dengan hanya `status: "open"` yang dihitung;
- jendela 24 jam untuk permintaan dan 15 menit untuk sesi admin aktif;
- `deliveryKey` beruffix tanggal WIB membuat dua kali jalan pada hari yang
  sama tidak menghasilkan kiriman kedua;
- cron terdaftar dan tidak diarahkan ke `api.*`.

Sejak **Fase 8** isi berkas ini ditulis ulang untuk semantik handoff: baris
ditandai `handoff` (bukan `sent`/`delivered`), penghitung `handoff` terpisah
dari empat angka pengiriman, dan tidak ada lagi `providerMessageId`. Kronya
tetap sama: 07:00 WIB, idempoten per tanggal.

Yang TIDAK dibuktikan berkas ini: pesan benar-benar sampai ke recipient.
`wa.me` tidak punya mekanisme yang bisa membuktikannya, jadi statusnya tidak
naik ke `PASS`.

### Fase 8 - handoff WhatsApp admin lewat `wa.me`

Komunikasi **admin** tidak lagi memakai WhatsApp Cloud API. Server tidak
memanggil Meta, tidak punya token untuk jalur itu, dan tidak bisa mengklaim
bukti pengiriman apa pun. Yang dilakukan adalah menyiapkan tautan click-to-chat:

```
https://wa.me/<nomor tujuan admin>?text=<pesan ter-encode>
```

Nomor tujuannya sengaja tidak ditulis di sini. Satu-satunya tempat yang memuatnya
adalah `src/lib/admin-whatsapp.ts`; kalau README ikut memuat, cepat atau lambat
nomor itu akan ikut tersalin ke komponen, tes, dan komentar - persis hal yang
paling ingin dihindari.

| | Sebelum (Fase 1-7) | Sesudah (Fase 8) |
|---|---|---|
| Transport | Cloud API / Twilio, dipanggil server | Tidak ada; `wa.me` |
| Pemicu | cron + scheduler | cron + scheduler (tetap) |
| Status baris | `sent` / `delivered` | `handoff` (status baru) |
| Bukti | message ID dari provider | hanya URL + isi ter-encode |
| Tujuan | env `ERROR_ALERT_WHATSAPP` | konstanta tunggal di `src/lib/admin-whatsapp.ts` |

Batas yang tidak boleh dilanggar: kata `sent` dan `delivered` **tidak pernah**
dipakai untuk jalur admin. `markWhatsappSent` dan `markWhatsappFailed` menolak
baris berstatus `handoff`, jadi tidak ada jalan yang bisa menaikkan handoff
menjadi "terkirim".

Sumber kebenaran tunggal ada di `src/lib/admin-whatsapp.ts`:
`ADMIN_WHATSAPP_NUMBER`, `buildAdminDailySummaryMessage`,
`buildAdminHandoffMessage`, `buildAdminWhatsappLink`, dan
`ADMIN_HANDOFF_EVIDENCE`. Nomor itu **bukan secret** - yang tidak boleh bocor
adalah isi pesannya, bukan nomor tujuan.

Notifikasi **warga** tidak berubah sama sekali: `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_PHONE_NUMBER_ID`, dan `TWILIO_*` tetap
dipakai. `ERROR_ALERT_WHATSAPP` sekarang **obsolete** (tidak ada consumer-nya
lagi) dan boleh dihapus dari Keys.

Bukti yang tersedia sekarang:

- `HANDOFF VERIFIED` - URL dibangun benar, penerima valid, isi ter-encode dan
  pulih utuh, deterministik (`src/lib/admin-whatsapp.test.ts`, test A-E);
- `EXTERNAL WHATSAPP DELIVERY NOT VERIFIED` - aplikasi WhatsApp tidak pernah
  dibuka oleh environment pengujian, jadi tidak ada bukti pengiriman.

### Item 14 - nondeterminisme E2E yang ditutup di Fase 7

Laporan Fase 6 mencatat 31 passed / 9 skipped, sementara baseline yang
disebutkan adalah 32 / 8. Penyebabnya sudah ditelusuri, bukan diasumsikan:

`e2e/flows.spec.ts:170` ("passcode salah ditolak") memakai
`test.skip((await passcodeField.count()) === 0, ...)`. Pengecekan itu dilakukan
**seketika setelah `goto`**, padahal gerbang dirender di dalam
`AnimatedContent` (Framer Motion) yang belum sempat me-mount. Di Desktop
elemennya sudah ada, di Pixel 5 belum - jadi test yang sama **PASS di satu
perangkat dan SKIP di perangkat lain**. Akibatnya seluruh pemeriksaan gerbang
admin di mobile hilang dari laporan tanpa ada yang gagal.

Skip itu tidak sah: `needsPasscode = adminGateRequired && passcodeGranted ===
null` (`src/pages/Auth.tsx:78`) hanya bergantung URL, dan pengunjung yang
belum masuk tidak punya tiket passcode. Jadi di konteks peramban yang bersih
gerbang itu **wajib** muncul.

Test sekarang menunggu gerbangnya (field + tombol "Verifikasi passcode",
timeout 15 detik). Kalau gerbang benar-benar tidak muncul, test **gagal keras**
- bukan menghilang dari laporan. Ini menambah pemeriksaan, tidak menguranginya.

Hasil dua kali berturut-turut (identik, jadi deterministik):

```text
run 1 : 40 test - 32 passed - 8 skipped - 0 failed
run 2 : 40 test - 32 passed - 8 skipped - 0 failed
        passcode desktop 2,7s · passcode mobile 3,7s / 3,9s
```

Sisa 8 skip semuanya sah: 4 kredensial (login + two-session) dan 4 lingkungan
(sitemap/robots, karena origin deployment tidak menyajikan XML).

### Prasyarat yang belum terpenuhi (kenapa 5 item belum PASS)

Empat item tidak `PASS` bukan karena kodenya belum ada, melainkan karena
bukti eksternal belum bisa diperoleh. Dicatat di sini supaya tidak dibaca
sebagai kemalasan:

| Item | Prasyarat | Diberikan oleh |
|---|---|---|
| 1 WhatsApp (warga) | `WHATSAPP_TEMPLATE_NAME` disetujui | Keys + WhatsApp Manager |
| 2 Two-session | `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `STAFF_BOOTSTRAP_EMAILS` | Keys |
| 11 Daily summary | bukti pengiriman nyata (`delivered >= 1`) | bergantung item 1 |
| 1 Handoff admin | akun pengelola + passcode untuk membuka `/admin` | Keys |

Item 11 naik dari `BLOCKED` ke `IMPLEMENTED - EXTERNAL VERIFICATION PENDING`
karena gap internalnya sudah ditutup (lihat catatan di bawah). Yang tersisa
hanya bukti pengiriman nyata, dan itu bergantung item 1.
| 14 E2E | kredensial di atas, supaya 4 skip kredensial jadi dieksekusi | Keys |

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

Dukur ulang Fase 6 (29 September 2026, 5 sampel, build produksi, Chromium)
memberi: catalog-ready median **921 ms** (min 736, max 1045), FCP **396 ms**,
first paint **208 ms**, domContentLoaded **313 ms**, JS **364.954 byte / 15
permintaan**, 6 kartu. Rentang beririsan penuh dengan tabel di atas, jadi
tidak ada regresi performa setelah Fase 5 dan 6.

Angka-angka ini **selalu build lokal**, bukan latensi internet produksi. Jangan
dibaca sebagai SLA.

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
| 6 | 2 | 0,333 | - |
| 100 | 8 | 0,080 | - |
| 300 | 13 | 0,043 | - |
| 500 | 16 | 0,032 | 213.281 byte |

Data tumbuh 83,3×, latensi hanya 8× - **sublinear, tanpa cliff**, dan biaya
per vendor justru turun. Di ambang 500 vendor, query memakan 16 ms. Keputusan
menunda paginasi karena itu terbukti oleh ukuran, bukan tebakan.

Angka tabel ini diukur ulang pada 29 September 2026. Kolom "Muatan" memakai
fixture milik `catalog-scale.test.ts` sendiri, jadi angkanya **213.281 byte**,
bukan angka fixture panjang milik `public-data-surface.test.ts` (245.781 byte)
dan bukan lagi "266 KB" yang tertinggal dari masa sebelum proyeksi data publik.
Rasio per-vendor sedikit naik di sizes kecil karena fixture-nya pendek, bukan
karena query membesar - di 500 vendor justru tetap turun.

## Catatan SEO

Metadata listing publik (`title`, `description`, Open Graph, canonical,
JSON-LD `LocalBusiness`) ditulis di peramban lewat `useEffect` pada
`src/lib/use-listing-metadata.ts`.

### Yang sudah ada

- `index.html` sekarang membawa Open Graph dasar situs (`og:title`,
  `og:description`, `og:type`, `og:site_name`, `twitter:card`), sehingga
  crawler tanpa JavaScript tidak lagi menerima `<head>` yang kosong sama
  sekali. Tag ini ditimpa per-listing setelah hidrasi.
- Sitemap XML (`/sitemap.xml`) dan `/robots.txt` **terdaftar** di router HTTP
  Convex (`src/convex/http.ts:413-414`), jadi mesin pencari punya peta URL yang
  benar, dan URL itu sama dengan yang dirender peramban. Rute privat
  (`/admin`, `/dashboard`, `/auth`, `/invite/*`) tidak pernah masuk sitemap.
  Logika buildup sitemapnya terverifikasi di `src/lib/listing-metadata.test.ts`.

  > **PENTING - status di deployment (Fase 6, 29 September 2026):**
  > ketiga route HTTP tersebut **mengembalikan 404 di origin deployment yang
  > diuji**, begitu juga `/webhook/whatsapp` dan `/admin-security-context` -
  > 5 dari 5 route, sementara `/api/query` di host yang sama tetap sehat.
  > Jadi "terdaftar" di atas berarti benar di level KODE, **belum berarti
  > dapat diakses pengguna**. Status item ini `BLOCKED`, bukan `PASS`; lihat
  > "Backlog 17 requirement" item 9 dan catatan di bawah. Akar penyebabnya
  > belum diatribusikan (mode deployment, domain/origin, proxy, environment,
  > atau konfigurasi platform) - yang terbukti hanya route HTTP tidak
  > tersaji pada origin itu. Tidak ada perilaku aplikasi yang diubah untuk
  > menutupi ini.

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
