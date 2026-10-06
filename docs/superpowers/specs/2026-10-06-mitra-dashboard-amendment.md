# Amendment: /mitra/dashboard untuk Pemilik Usaha (pivot dari /staff/dashboard)

Tanggal: 2026-10-06 · Status: menunggu review user
Skill: brainstorming (amendment) → writing-plans → subagent-driven-development
Mengamendemen: `docs/superpowers/specs/2026-10-06-warga-staff-dashboard-design.md`
PR terdampak: `feat/warga-staff-dashboard` → `main` (OPEN, belum merge — pivot masih murah)

## 1. Latar & keputusan pivot

Definisi `staff` di spec dasar (staf internal `staffMembers`) bertabrakan dengan kebutuhan
riil: "staff" yang dimaksud user adalah **pemilik usaha**, sedangkan `/admin` tetap untuk
pengelola internal (developer + staf tepercaya). Evidence:

- `staffMembers` + alur `staff invite` (`users.createStaffInvite`) memberi akses INTERNAL —
  pemilik usaha tidak boleh lewat jalur ini (risiko nyata, bukan soal nama).
- Section owner di dashboard existing sudah berlabel "Ruang mitra" — istilah mitra sudah
  hidup di produk untuk pemilik usaha.
- Keputusan user (bertahap, disetujui eksplisit): pilih A (rename + redefinisi), setuju
  daftar fitur 1–8, setuju peta skills + urutan eksekusi (langkah 1 = amendment ini).

## 2. Definisi peran final (menggantikan §"staff" spec dasar)

| Peran | Kriteria | Rumah |
|---|---|---|
| Warga | terautentikasi, tanpa kualifikasi lain | `/warga/dashboard` |
| Mitra | punya ≥1 listing (`ownerId` miliknya) ATAU ≥1 klaim terverifikasi | `/mitra/dashboard` |
| Internal | baris `staffMembers` (`admin`/`staff`/`viewer`) | `/admin` (tak berubah) |

## 3. Rute final (menggantikan §3 spec dasar)

- `GET /mitra/dashboard` → `<RequireAuth><RequireMitraGate><MitraDashboard /></RequireAuth>`.
- `GET /warga/dashboard` → tetap (dipoles modernisasi, fitur dikurangi pindahan).
- `GET /dashboard` → redirect preservasi-hash ke `/warga/dashboard` (tetap).
- `/staff/dashboard` + `RequireStaffGate` + pemetaan staff DIHAPUS dari PR (bukan deprecated,
  karena belum pernah rilis — hapus bersih, tanpa redirect).
- `/admin`, `/auth`, `/auth/email`, `/invite/:token`, `/v/:slug` tidak berubah.

## 4. RequireMitraGate (menggantikan RequireStaffGate)

Tiga keadaan (bukan penolakan keras — semua warga bisa menjadi mitra):

- Loading (`owner rows`/`claims` belum terjawab) → skeleton seukuran kartu final.
- Qualified (punya listing ATAU klaim terverifikasi) → dashboard penuh.
- Belum-mitra (termasuk klaim pending saja) → onboarding: hero filled-state + CTA
  "Tambah listing" / "Klaim listing" + penjelasan klaim terverifikasi + pelacak status
  klaim (butir 7).
- Kualifikasi dibaca dari query existing: `listForOwner` (rows milik sendiri) +
  `listMyClaims` (status). Nol query baru.

## 5. dashboardTargetFor v2 (menggantikan §4.1 spec dasar)

- `canViewAdmin` → `/admin` (staf internal tidak punya dashboard terpisah; workspace
  `/admin` sudah permission-aware per-role termasuk viewer read-only).
- Qualified mitra (owner rows > 0 ATAU verified claim) → `/mitra/dashboard`.
- Selain itu → `/warga/dashboard`; loading → `null` (item disabled).
- Fungsi tetap murni + unit-tested; hook membaca `listForOwner`/`listMyClaims` di
  samping `currentAccess` (bacaan klien saja, otorisasi tetap server).

## 6. Fitur /mitra/dashboard (final, disetujui user)

Semua butir 1–7 jalan di atas query/mutation existing; butir 8 = fase 2.

1. **Ringkasan**: 4 kartu (Listing tayang, Dilihat Σ`searchImpressions`, Dihubungi
   Σ`whatsappClicks`, Request cocok terbuka) + **tabel per-listing**
   (nama, status, dilihat, dihubungi, dibagikan Σ`shareClicks`). `listForOwner`
   mengembalikan baris milik sendiri utuh (`vendors.ts:430`) — sah dipakai.
2. **Kelola usaha** (pindah dari warga): `OwnerListingManager` utuh + **Mode libur cepat**
   (satu tombol `availability:"closed"`+note ke semua listing aktif + "Buka kembali";
   mutation existing yang sama) + `OwnerPackageEditor`, `OwnerGalleryManager`,
   `OwnerListingHistory`.
3. **Skor kelengkapan**: `profileCompleteness` + `qualityIssues` + `duplicateScore`
   (`catalog-data.ts`, dipakai admin) per listing milik sendiri + aksi konkret.
4. **Request & tawaran** (pindah `OwnerRequestWorkspace` apa adanya).
5. **Klaim & verifikasi**: pelacak `listMyClaims` + CTA; entry point klaim existing tak diubah.
6. **Ulasan pelanggan** (read-only): `reviewsCount` per listing + ≤3 ulasan terbaru via
   query publik existing per slug (dibatasi N listing) + link halaman publik.
   Balas ulasan TIDAK termasuk (butuh mutation+skema baru).
7. **Notifikasi + PWA** (revisi keputusan spec dasar): `NotificationCenter` tampil di
   KEDUA dashboard (user-scoped, role-agnostic); `PwaControls` ikut di mitra
   (offline-queue availability memang sudah terkabel di `OwnerListingManager`).
8. **Fase 2 (eksplisit di luar scope)**: laporan terhadap listing saya (1 query scoped
   baru — `listReports` saat ini untuk pengelola) + balas ulasan (1 mutation + field).

## 7. Peta pindah komponen (final)

- PINDAH warga→mitra: `OwnerListingManager` (+paket, galeri, riwayat), `OwnerRequestWorkspace`.
- TETAP di warga: favorit tersimpan, `MyRequestHistory`, `InteractionHistory`.
- DI KEDUANYA: `NotificationCenter`, `PwaControls`.
- `AccountMenu` item Dashboard memakai pemetaan v2 (§5); item Profil/Keluar tak berubah.

## 8. Modernisasi UI + responsif (scope dikunci)

- Halaman yang dimodernisasi: `/warga/dashboard` (polish pasca-pindahan) + `/mitra/dashboard`
  (baru langsung modern). `/admin`, landing, katalog: TIDAK disentuh.
- Sistem kartu seragam (§6.1 spec dasar, berlaku identik di kedua dashboard): slot
  header–body(`flex-1`)–footer, `h-full`, grid `1→2→3→4` (`sm/md/xl`), `EmptyStateCard`
  (`size="md"` = 96px terverifikasi — ruling tercatat, bukan `sm`), maskot terdaftar di
  audit `mascot-placement` bila call-site baru muncul.
- Bahasa visual (§6.2 spec dasar): token existing, satu tingkat shadow, `rounded-2xl`,
  `BorderGlow`/`ShinyText` hanya angka hero, tanpa dep/gradient/font baru.
- Responsif (§6.3 spec dasar): 320/360/390/768/1024/1440/1600+, sentuh ≥44px, safe-area,
  fallback `dvh`/`svh` + `backdrop-filter`, tanpa aksi hover-only, reduced-motion.
  Verifikasi: screenshot multi-viewport (`webapp-testing`) + checklist perangkat.

## 9. Dampak ke PR terbuka (untuk rencana rework langkah 2)

- Hapus: rute `/staff/dashboard`, `RequireStaffGate(.tsx,.test)`, pemetaan staff di
  `dashboard-target` (+test), prefix `/staff/` di mascot-loader/robots/sitemap/deploy-config.
- Baru: rute `/mitra/dashboard`, `RequireMitraGate`, `MitraDashboard.tsx`, target mapping v2,
  prefix `/mitra/`, tabel per-listing, mode libur, skor kelengkapan, ulasan read-only,
  pelacak klaim, pindahan komponen (7), `EmptyStateCard` dipakai ulang.
- Dipertahankan dari PR: `AccountMenu`, `ProfileDialog`, `useDashboardTarget` (diperluas),
  `/warga/dashboard` + redirect, pola test + gates.
- Perkiraan kasar: ~6 commit tersentuh ulang + task baru; detail di rencana rework.

## 10. Peta skills eksekusi (disetujui user, dirujuk dari analisis)

`redesign-existing-projects` + `frontend-design` + `anti-ui-slop` (inti visual);
`better-layout/ui/typography/colors` (checklist polish); `better-accessibility` +
`web-design-guidelines` (A11y); `architecture` (gate/rute); `senior-frontend`
(implementasi); `test-driven-development` (regresi); `design-review` (visual QA);
`webapp-testing` (screenshot responsif); `clean-code` + `verification-before-completion`
(gate); `writing-plans` + `subagent-driven-development` (orkestrasi).
Tidak dipakai: pola native mobile (web responsif cukup), `senior-backend` (standby fase 2).

## 11. Self-review amendment

- [x] Placeholder: nihil TBD/TODO; semua komponen/query/rute bernama konkret.
- [x] Konsistensi: §2↔§4↔§5 (kualifikasi mitra satu definisi); §6 butir 8 fase-2 konsisten
  dengan "nol backend baru" butir 1–7; §7 (notifikasi di keduanya) konsisten merevisi
  spec dasar secara eksplisit, bukan diam-diam; `size="md"` konsisten lantai 96px.
- [x] Scope: satu siklus amendment→rework→implement; backend butir 8 dan redesign
  landing/katalog di luar scope.
- [x] Ambiguitas: "qualified" = punya listing ATAU klaim verified (pending saja =
  onboarding + tracker, bukan penuh); "staff internal" = `staffMembers` apa pun perannya.
