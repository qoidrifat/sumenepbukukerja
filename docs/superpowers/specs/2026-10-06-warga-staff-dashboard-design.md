# Desain: Dashboard Warga (/warga/dashboard) + Dashboard Staff (/staff/dashboard) + AccountMenu Header Publik

Tanggal: 2026-10-06 · Status: disetujui user (pendekatan A + update A–D), menunggu review spec
Skill: brainstorming (process) → writing-plans (terminal state, setelah spec direview)

## 1. Latar & keputusan yang disepakati

Kondisi existing (evidence):

- `/dashboard` = `RequireAuth` → `src/pages/Dashboard.tsx:570` ("Ruang warga": favorit tersimpan,
  kelola listing milik sendiri, workspace permintaan, riwayat interaksi, notifikasi). Satu halaman
  untuk semua peran.
- `/admin` = workspace penuh peran `admin`/`staff`/`viewer` (gate `currentAccess.canViewAdmin` +
  passcode, `src/pages/Admin.tsx:174`). Tidak diubah oleh spec ini.
- Header publik `TopNav` (`src/pages/Landing.tsx:117`) hanya punya CTA "Cari jasa"; belum ada
  button profil akun untuk pengguna login.
- Peran server: `staffMembers` (`admin`/`staff`/`viewer`) via `getStaffAccess`
  (`src/convex/access.ts:68`); warga = pengguna terautentikasi tanpa baris `staffMembers`.
  Profil: `myProfile` + `updateMyProfile` + `generateProfileUploadUrl` (`src/convex/users.ts:66,95,116`).

Keputusan user (ditanya satu per satu, semua dijawab):

1. `/staff/dashboard` = halaman ringkas baru; `/admin` tetap sebagai workspace penuh.
2. `/warga/dashboard` = pindahan isi `Dashboard.tsx`; `/dashboard` lama jadi redirect
   backward-compat ke `/warga/dashboard`.
3. Item "Profil" di dropdown = dialog edit profil (opsi A), bukan halaman baru.
4. Item "Dashboard" di dropdown = role-aware (opsi A): warga → `/warga/dashboard`,
   staff/admin/viewer → `/staff/dashboard`, via `currentAccess`.
5. Tambahan: modernisasi premium–minimalis, kartu berukuran/komposisi seragam, halaman terasa
   penuh (hilangkan kesan kosong), responsif desktop + Android (lawas & baru) + iOS (lawas & baru).

## 2. Tujuan & kriteria sukses

- Warga login punya halaman khusus `/warga/dashboard`; staff (termasuk admin/viewer) punya
  halaman ringkas `/staff/dashboard`; link lama `/dashboard` tidak mati (redirect).
- Di halaman publik, pengguna login melihat button profil akun di kanan atas header; klik
  membuka dropdown berisi tepat tiga item: Dashboard (role-aware), Profil (dialog), Keluar.
- Tidak ada regresi: perilaku favorit, klaim listing, request, notifikasi, dan seluruh workspace
  `/admin` tetap sama.
- Kriteria: redirect `/dashboard` → `/warga/dashboard` bekerja; warga yang membuka
  `/staff/dashboard` mendapat layar akses-ditolak + tautan ke dashboardnya (bukan blank/error
  generik); anonim yang membuka kedua dashboard mendapat layar `RequireAuth` existing;
  dropdown tertutup rapat via keyboard (Esc, panah, Tab) dan klik-di-luar; foto/nama profil
  tersimpan via mutation existing; 0 test regresi gagal; kontras AA; reduced-motion dihormati.

## 3. Arsitektur rute (Pendekatan A: ekstrak + bungkus ulang minimal)

Perubahan di `src/main.tsx` (area `Routes`, sekitar baris 327–343):

- `GET /warga/dashboard` → `<RequireAuth><WargaDashboard /></RequireAuth>`.
- `GET /staff/dashboard` → `<RequireAuth><RequireStaffGate><StaffDashboard /></RequireStaffGate>`.
  `RequireStaffGate` baru: baca `useCurrentAccess()`; `undefined` → skeleton; `canViewAdmin`
  false → layar akses-ditolak (judul, penjelasan peran diberikan admin via menu Peran & Audit,
  tombol ke `/warga/dashboard` + kembali ke katalog). True → render anak.
- `GET /dashboard` → `<Navigate to="/warga/dashboard" replace />` (backward-compat; semua
  `returnTo=/dashboard` lama dan `redirectAfterAuth="/dashboard"` otomatis ikut tanpa ubahan).
- `/admin`, `/auth`, `/auth/email`, `/invite/:token`, `/v/:slug` tidak berubah.

`WargaDashboard` = isi `src/pages/Dashboard.tsx` yang dipindah apa adanya pada tahap 1
(fungsi `Dashboard`, `OwnerListingManager`, `OwnerPackageEditor` + helper draft dipindah ke
`src/pages/WargaDashboard.tsx` atau komponen `warga-dashboard/`; `Dashboard.tsx` lama dihapus
atau dijadikan re-export sementara lalu dihapus dalam PR yang sama — keputusan final saat plan).
Tidak ada perubahan logika bisnis pada tahap pindah; modernisasi UI (lihat §6) diaplikasikan
sebagai lapisan kedua di atas komponen yang sudah pindah, file per file.

## 4. Komponen

### 4.1 `useDashboardTarget()` (hook baru, `src/hooks/use-dashboard-target.ts`)

- Baca `useCurrentAccess()`; kembalikan `/staff/dashboard` bila `canViewAdmin`, selain itu
  `/warga/dashboard`; saat loading kembalikan `null` (pemanggil menonaktifkan item Dashboard).
- Satu-satunya tempat yang tahu pemetaan peran → tujuan dashboard.

### 4.2 `AccountMenu` (baru, dipakai `TopNav` Landing; dirancang reusable untuk header lain)

- Belum login: render CTA existing ("Cari jasa") — tidak ada perubahan visual untuk anonim.
- Sudah login (`useAuth()`): button profil di kanan atas berisi avatar (`myProfile.imageUrl`,
  fallback inisial nama) + nama (truncate, `max-w` agar tidak mendorong CTA di 320px).
- Dropdown via `@radix-ui/react-dropdown-menu` (dep sudah ada, tanpa dep baru), tepat tiga item:
  1. `Dashboard` → `href = useDashboardTarget()` (role-aware).
  2. `Profil` → membuka `ProfileDialog` (lihat §4.3), bukan navigasi.
  3. `Keluar` → `await signOut(); navigate("/")`.
- A11y: trigger `aria-label="Menu akun <nama>"`, item `min-h-12`, fokus visible via `focusRing`
  (`src/lib/focus-ring.ts`), Esc/mouse-outside bawaan Radix, tidak bergantung hover.

### 4.3 `ProfileDialog` (baru)

- Radix `Dialog`; isi awal dari `myProfile` (nama, `imageUrl`, `hasImage`); simpan via
  `updateMyProfile` (nama trim, min 2 char, max 80 — validasi server yang dipakai ulang);
  ganti foto via `generateProfileUploadUrl` + alur unggah existing (`useImageUpload`,
  aturan `imageRejection`); hapus foto via `removeImage: true`.
- Email read-only (tidak bisa diubah — aturan server §users.ts:112-114); peran ditampilkan
  read-only dari `myProfile.role`.
- Error inline dekat field + `role="alert"`; sukses menutup dialog + toast existing (`sonner`).

### 4.4 `StaffDashboard` (halaman baru, read-only + navigasi)

- Hero ringkas: sapaan + peran (`Admin`/`Pengelola`/`Viewer` dari `currentAccess.role`,
  label via pola `admin-audit-log.tsx:61`) + tombol primer ke `/admin` ("Buka workspace").
- Kartu ringkasan seragam (slot identik dengan kartu warga, lihat §6.1) dari query existing
  tanpa query baru: draft count + archived count (`listForAdmin`), antrean review
  (`listReviewQueue`), laporan terbuka (`listReports`), metrik komunitas
  (`listCommunityMetrics`, bila `undefined` tampil skeleton).
- Daftar "perlu tindakan" (maks 5, link ke anchor `/admin#admin-triage`): draft menunggu,
  laporan terbuka, listing tanpa nomor. Viewer: seluruh halaman read-only (tidak ada tombol
  mutasi — halaman ini memang tidak punya mutasi).
- Tidak ada form create/update di sini; semua mutasi tetap di `/admin` atau dashboard warga.

## 5. Data flow

- Semua baca memakai query existing (`currentAccess`, `myProfile`, `listForAdmin`,
  `listReviewQueue`, `listReports`, `listCommunityMetrics`, `listFavorites`,
  `listForOwner`, dsb). Nol query/mutasi Convex baru.
- Guard server tidak berubah; gate klien (`RequireAuth`, `RequireStaffGate`) hanya UX —
  otorisasi tetap ditegakkan tiap mutation di backend.
- `signOut` via `useAuthActions` (`src/hooks/use-auth.ts:8`); setelah keluar, `AccountMenu`
  kembali ke CTA anonim tanpa reload.

## 6. Modernisasi UI + kartu seragam + responsif (tambahan yang disetujui)

Temuan yang diperbaiki (evidence):

- `Dashboard.tsx:622`: kartu ke-3 ("Mulai lagi") tipis vs dua kartu counter → timpang.
- Empty state ganda berurutan (`:511` belum punya listing, `:712` belum ada favorit) → dua
  "lubang" vertikal.
- Lebar `max-w-6xl` (`:592`) vs landing `max-w-[1600px]` → gutter besar di monitor lebar.
- `GlassIcons` hanya 2 item (`:613`) → baris jarang.

### 6.1 Sistem kartu seragam (berlaku identik di warga & staff)

- Satu pola: `Card` (`rounded-2xl border-slate-200 bg-white shadow-sm`) + `h-full flex flex-col`;
  slot wajib: header (ikon 44px + eyebrow + title, tinggi terkunci), body (`flex-1`,
  `min-h` sama per baris grid), footer (aksi selaras ke baseline). Tidak ada kartu "tipis".
- Grid statistik: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` (warga: Katalog, Tersimpan,
  Listing saya, Aktivitas; staff: Draft, Arsip, Antrean review, Laporan terbuka). Empat kartu
  selalu terisi angka (0 ditampilkan sebagai "0", bukan disembunyikan) agar baris penuh nyata.
- Empty → filled state: bingkai sama tinggi dengan kartu berisi; maskot kecil (`size="xs"`,
  `animated={false}`) + 1 kalimat + 1 tombol primer. Dashed box raksasa dihapus.
- Quick access: minimal 4 item (warga: Cari usaha, Kelola listing, Permintaan, Favorit;
  staff: Workspace admin, Antrean review, Laporan, Tambah listing) agar baris terasa penuh.

### 6.2 Bahasa visual premium–minimalis (dikunci, tanpa dep baru)

- Token existing saja: `--primary #2563eb`, `--background #f7f8fc`, amber seperlunya untuk
  sorotan; radius `rounded-2xl` konsisten; satu tingkat shadow (`shadow-sm`, `shadow-md`
  hanya hover); tipografi `clamp` mengikuti landing.
- `BorderGlow` intensitas ≤ 0.08 dan `ShinyText` hanya untuk angka hero; kartu biasa flat.
  Tidak ada gradient baru, tidak ada font baru, tidak ada paket animasi baru.
- Ritme: section `gap-6/8`, padding kartu `p-5 sm:p-6`, eyebrow `uppercase tracking-[0.14em]`
  konsisten dengan landing.

### 6.3 Responsif: desktop + Android lawas/baru + iOS lawas/baru (web responsif)

- Baseline repo yang dipakai ulang (terverifikasi ada): `min-h-dvh` + `min-h-[100svh]`,
  `env(safe-area-inset-*)`, `supports-[backdrop-filter]` fallback, `-webkit-overflow-scrolling`,
  target sentuh `min-h-12`/44px, `html -webkit-text-size-adjust:100%`, komentar 320px di header.
- Aturan baru: grid `1 → 2 → 3 → 4` bertahap (`sm/md/xl`); header menu tidak mendorong CTA
  (`min-w-0`, truncate, label disembunyikan < 420px mengikuti pola `.header-cta` landing);
  tidak ada aksi hover-only; `motion-reduce` mematikan glow/shine; dialog `max-w-[calc(100%-1.5rem)]`
  mengikuti pola `error-report-dialog.tsx:152`.
- Matriks uji manual: 320 (SE lama), 360 (Android lawas umum), 390 (iPhone), 768, 1024, 1440,
  1600+. Tidak ada cabang kode per-OS/per-merek — murni viewport + capability query.

## 7. Error & edge cases

- Query `undefined` → skeleton seukuran kartu final (bukan layout shift); query error → kartu
  menampilkan pesan + tombol "Coba lagi" (refetch Convex otomatis; tanpa toast berulang).
- `useDashboardTarget()` null (loading) → item Dashboard disabled dengan spinner kecil.
- Warga buka `/staff/dashboard` → akses-ditolak + CTA ke `/warga/dashboard` (bukan redirect
  diam-diam, supaya URL bisa dibagikan dan pesannya jelas).
- Sesi dicabut (`SESSION_REVOKED`) → perilaku existing (`SessionRevokedGuard`) tidak diubah.
- Foto profil gagal unggah → pesan dari `imageRejection`, file lama dipertahankan.

## 8. Testing

- Unit (`vitest`): `resolveRedirectAfterAuth` tetap; `useDashboardTarget` (staff→staff URL,
  warga→warga URL, loading→null); guard `RequireStaffGate` (warga ditolak, staff lolos,
  anonim ke auth); `AccountMenu` (anonim = CTA; login = 3 item; href Dashboard role-aware;
  klik Profil membuka dialog; klik Keluar memanggil `signOut` + navigate `/`).
- Rute: `/dashboard` redirect ke `/warga/dashboard` (test router); `/warga/dashboard` anonim
  → layar auth; `/staff/dashboard` warga → ditolak; staff → lolos.
- Visual/responsif manual per matriks §6.3 + cek `prefers-reduced-motion` + kontras AA;
  tidak ada screenshot-test otomatis baru (mengikuti pola repo: QA visual manual).
- Quality gates yang dipertahankan: `lint`, `typecheck`, `test`, `build`.

## 9. Rencana pemakaian skills (belum di-invoke — menunggu tahap eksekusi)

| Kebutuhan | Skill | Kapan |
|---|---|---|
| Audit kekosongan + upgrade tanpa merusak fungsi | `redesign-existing-projects` | eksekusi UI |
| Arah premium-minimalis, anti generik | `frontend-design` + `anti-ui-slop` | eksekusi UI |
| Kartu seragam, ritme, tipografi | `better-layout`, `better-ui`, `better-typography` | checklist eksekusi |
| Review A11y + responsif | `web-design-guidelines` | checklist eksekusi |
| Rute + guard | `architecture` | saat writing-plans |
| Implementasi React | `senior-frontend` | eksekusi |
| Regression test | `test-driven-development` | test dulu |
| Standar kode | `clean-code` | review diff |
| Gerbang akhir | `verification-before-completion` | sebelum klaim selesai |
| Tidak dipakai | `mobile-android-design`, `mobile-ios-design` (native; ini web responsif), `systematic-debugging` (bukan bug) | — |

## 10. Non-tujuan (tidak disentuh)

- Logika Convex/auth/backend; workspace `/admin` (selain ditautkan); alur `/auth`,
  `/auth/email`, invite, klaim, request, notifikasi; dependency baru; migrasi TypeScript;
  redesign landing/katalog.

## 11. Self-review spec (diisi penulis sebelum review user)

- [x] Placeholder scan: tidak ada TBD/TODO; semua rute/komponen/query bernama konkret.
- [x] Konsistensi: §3 (§dashboard→warga) konsisten dengan §4.1 (target default warga) dan
  §7 (warga di staff = ditolak eksplisit, bukan redirect). §4.4 read-only konsisten dengan
  §10 (mutasi tetap di /admin).
- [x] Scope: satu plan implementasi (rute + menu + dialog + 2 dashboard + test); tidak butuh
  dekomposisi lebih jauh. Modernisasi dibatasi §6 agar tidak melebar ke landing/katalog.
- [x] Ambiguitas: "staff" = `canViewAdmin` (admin/staff/viewer) — didefinisikan eksplisit di
  §3 dan §4.1, bukan hanya role `"staff"`. "Penuh nyata" = empat kartu terisi + filled state
  (§6.1), bukan klaim subjektif.
