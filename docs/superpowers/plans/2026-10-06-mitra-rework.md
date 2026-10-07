# Mitra Dashboard PR Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merombak PR branch `feat/warga-staff-dashboard` dari konsep staff-internal menjadi `/mitra/dashboard` untuk pemilik usaha, sesuai amendment yang disetujui.

**Architecture:** Pivot di tempat (branch yang sama, commit lanjutan — riwayat staff menjadi arkeologi yang jujur): pemetaan target v2 berbasis kualifikasi owner, gate mitra 3-keadaan, ekstraksi manajer listing ke komponen mitra, halaman mitra komposisi ulang-pakai, warga dirampingkan ke peran konsumen + cross-link, jejak `/staff/` dihapus bersih.

**Tech Stack:** Sama dengan plan dasar (React 19, react-router v7, Convex query existing, Radix, Tailwind v4, vitest edge-runtime, idiom source-content test).

**Spec:** `docs/superpowers/specs/2026-10-06-warga-staff-dashboard-design.md` (dasar, bagian yang tidak diamendemen tetap berlaku: AccountMenu, ProfileDialog, TopNav, sistem kartu, tokens, responsif) + `docs/superpowers/specs/2026-10-06-mitra-dashboard-amendment.md` (otoritas untuk semua yang berubah; bila konflik dengan plan/rework ini, amendment menang).

## Global Constraints

- Nol query/mutasi Convex baru; otorisasi tetap server; gate klien hanya UX.
- Butir 8 amendment (laporan scoped, balas ulasan) FASE 2 — task apa pun yang menyentuhnya DITOLAK.
- CRUD tanpa hapus permanen (mutation tidak ada); arsip = keadaan akhir.
- Standar ikon amendment §6-butir-2 mengikat (Plus/Pencil/Archive/RotateCcw/Eye/ImagePlus/Package/Power/Trash2-hanya-foto-paket, size-4 tombol/size-5 header, aria-hidden + label).
- Test `*.test.ts`; source-content idiom untuk komponen Convex; fungsi murni unit-tested.
- Tema publik saja di permukaan warga/mitra (larang `admin-*`, `border-[#121212]`).
- BrandMascot literal BARU dilarang — pakai ulang `EmptyStateCard` (sudah terdaftar di audit `mascot-placement`); bila terpaksa nambah literal, amendemen registry + patuhi lantai 96px dalam task yang sama.
- Setiap task berakhir commit yang hanya men-stage file task itu; JANGAN `git add -A`.
- Verifikasi per task: focused test + `bun run typecheck` + `bunx eslint` file task + full suite sekali sebelum commit.
- Perintah: `bunx vitest run <file>`, `bun run typecheck`, `bunx eslint <files>`, `bun run build` (gerbang akhir).

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `src/lib/dashboard-target.ts` (rewrite) | `dashboardTargetFor(access, mitra)` murni v2 |
| `src/lib/dashboard-target.test.ts` (rewrite) | Unit test v2 |
| `src/hooks/use-dashboard-target.ts` (rewrite) | Hook v2: akses + owner + klaim |
| `src/hooks/use-dashboard-target.test.ts` (rewrite) | Source test v2 |
| `src/components/RequireMitraGate.tsx` (baru) | Gate 3-keadaan |
| `src/components/require-mitra-gate.test.ts` (baru) | Source test gate |
| `src/components/RequireStaffGate.tsx` + test (HAPUS via `git rm`) | Jejak staff dihapus |
| `src/components/mitra-listing-manager.tsx` (baru, pindahan) | CRUD usaha + mode libur |
| `src/components/mitra-claim-tracker.tsx` (baru) | Pelacak klaim |
| `src/components/mitra-reviews.tsx` (baru) | Ulasan read-only |
| `src/components/mitra-stats.tsx` (baru) | 4 kartu + tabel per-listing + skor |
| `src/pages/MitraDashboard.tsx` (baru) | Komposisi halaman mitra |
| `src/pages/mitra-dashboard.test.ts` (baru) | Source test halaman |
| `src/pages/StaffDashboard.tsx` + test (HAPUS via `git rm`) | Diganti mitra |
| `src/pages/WargaDashboard.tsx` (slim) | Warga konsumen + cross-link |
| `src/main.tsx` (rute swap) | `/mitra`, hapus `/staff` |
| `src/pages/dashboard-routes.test.ts` (rewrite) | Rute v2 |
| `src/components/dashboard-uniformity.test.ts` (update) | Asertasi warga-revisi + mitra |
| `src/lib/mascot-loader.ts` + test, `src/lib/sitemap.ts`, `src/convex/http.ts`, `src/lib/deploy-config.test.ts`, `src/lib/robots-exclusion.test.ts` (sweep) | Prefix `/staff/` → `/mitra/` |

---

### Task R1: Target mapping v2 (murni + hook)

**Files:**
- Rewrite: `src/lib/dashboard-target.ts`, `src/lib/dashboard-target.test.ts`
- Rewrite: `src/hooks/use-dashboard-target.ts`, `src/hooks/use-dashboard-target.test.ts`

**Interfaces:**
- Consumes: `useCurrentAccess` (`{canViewAdmin}`), `useOwnerVendors()` (`VendorRecord[]|undefined`), `useMyClaims()` (`ListingClaim[]|undefined` dengan `status: "pending"|"verified"|"rejected"`).
- Produces: `dashboardTargetFor(access: {canViewAdmin:boolean}|null|undefined, mitra: {qualified:boolean}|null|undefined): string|null` — `undefined` (mana pun) → `null`; `canViewAdmin` → `"/admin"`; `mitra.qualified` → `"/mitra/dashboard"`; selain itu → `"/warga/dashboard"`. `useDashboardTarget(): string|null` (tanda tangan hook TIDAK berubah — Task 9/10 tak tersentuh).

- [ ] **Step 1: Tulis test murni v2 dulu**

```ts
import { describe, expect, test } from "vitest";
import { dashboardTargetFor } from "./dashboard-target";

describe("dashboardTargetFor v2", () => {
  test("internal ke /admin apa pun status mitranya", () => {
    expect(dashboardTargetFor({ canViewAdmin: true }, { qualified: true })).toBe("/admin");
    expect(dashboardTargetFor({ canViewAdmin: true }, { qualified: false })).toBe("/admin");
    expect(dashboardTargetFor({ canViewAdmin: true }, null)).toBe("/admin");
  });
  test("mitra qualified ke /mitra/dashboard", () => {
    expect(dashboardTargetFor({ canViewAdmin: false }, { qualified: true })).toBe("/mitra/dashboard");
    expect(dashboardTargetFor(null, { qualified: true })).toBe("/mitra/dashboard");
  });
  test("warga biasa ke /warga/dashboard", () => {
    expect(dashboardTargetFor({ canViewAdmin: false }, { qualified: false })).toBe("/warga/dashboard");
    expect(dashboardTargetFor(null, null)).toBe("/warga/dashboard");
  });
  test("loading di sisi mana pun → null", () => {
    expect(dashboardTargetFor(undefined, { qualified: true })).toBeNull();
    expect(dashboardTargetFor({ canViewAdmin: false }, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, harapkan FAIL (perilaku baru belum ada)**

Run: `bunx vitest run src/lib/dashboard-target.test.ts`
Expected: FAIL (mapping lama tak cocok)

- [ ] **Step 3: Implementasi**

```ts
/**
 * Pemetaan akses + kualifikasi mitra → URL dashboard (v2: pivot mitra).
 *
 * Prioritas: internal dulu (staf tidak pernah diarahkan ke ruang eksternal),
 * lalu mitra qualified, lalu warga. `undefined` di sisi mana pun = loading.
 */
export function dashboardTargetFor(
  access: { canViewAdmin: boolean } | null | undefined,
  mitra: { qualified: boolean } | null | undefined,
): string | null {
  if (access === undefined || mitra === undefined) return null;
  if (access !== null && access.canViewAdmin) return "/admin";
  if (mitra !== null && mitra.qualified) return "/mitra/dashboard";
  return "/warga/dashboard";
}
```

Hook (`src/hooks/use-dashboard-target.ts`), ganti total:

```ts
import { useMyClaims, useCurrentAccess, useOwnerVendors } from "@/lib/catalog-store";
import { dashboardTargetFor } from "@/lib/dashboard-target";

/**
 * Tujuan item "Dashboard" v2: internal → /admin, mitra qualified → /mitra,
 * warga → /warga. Qualified = punya listing ATAU klaim terverifikasi.
 * Tanda tangan kembaliannya TIDAK berubah (string|null) — pemanggil tak tersentuh.
 */
export function useDashboardTarget(): string | null {
  const access = useCurrentAccess();
  const owned = useOwnerVendors();
  const claims = useMyClaims();
  if (access === undefined || owned === undefined || claims === undefined) return null;
  const qualified =
    owned.length > 0 || claims.some((claim) => claim.status === "verified");
  return dashboardTargetFor(
    access === null ? null : { canViewAdmin: access.canViewAdmin },
    { qualified },
  );
}
```

CATATAN: `useCurrentAccess` tak pernah `null` (query selalu objek saat loaded) —
cabang `access === null` hanya untuk ketahanan tipe; JANGAN hapus (typecheck butuh).

Source test hook: samakan pola Task 2, ganti asersi menjadi:

```ts
expect(src).toContain("useOwnerVendors");
expect(src).toContain("useMyClaims");
expect(src).toContain('"/mitra/dashboard"'.slice(1, 7) === "/mitra" ? "/mitra/dashboard" : "");
```

DILARANG trik slice di atas — tulis langsung:

```ts
expect(src).toContain("/mitra/dashboard");
expect(src).toContain('"/admin"');
expect(src).toContain("status === \"verified\"");
```

- [ ] **Step 4: Run hijau**

Run: `bunx vitest run src/lib/dashboard-target.test.ts src/hooks/use-dashboard-target.test.ts`
Expected: PASS. Lalu full suite sekali + typecheck + eslint 4 file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-target.ts src/lib/dashboard-target.test.ts src/hooks/use-dashboard-target.ts src/hooks/use-dashboard-target.test.ts
git commit -m "feat(mitra): role-aware target v2 (internal/admin, owner/mitra, warga)"
```

---

### Task R2: RequireMitraGate + hapus RequireStaffGate

**Files:**
- Create: `src/components/RequireMitraGate.tsx`, `src/components/require-mitra-gate.test.ts`
- Delete: `src/components/RequireStaffGate.tsx`, `src/components/require-staff-gate.test.ts` (via `git rm`)

**Interfaces:**
- Consumes: `useOwnerVendors()`, `useMyClaims()`; `focusRing`.
- Produces: `RequireMitraGate({children:{children:ReactNode}})` — dipakai DI DALAM
  `MitraDashboard` (bukan di rute; rute hanya `RequireAuth`). Membungkus
  section khusus-qualified; manager + notifikasi + PWA hidup di luarnya.
- Struktur halaman final (R4): hero → manager (#usaha-saya, selalu) →
  gate(stats, klaim, ulasan, workspace) → notifikasi + PWA (selalu).
  Alasan: belum-mitra harus mencapai formulir tambah + notifikasi klaim pending;
  gate full-page akan memblokir keduanya.

- [ ] **Step 1: Test gate dulu**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./RequireMitraGate.tsx", import.meta.url), "utf8");

test("tiga keadaan: loading, onboarding, lolos", () => {
  expect(src).toContain("export function RequireMitraGate");
  expect(src).toContain('role="status"');
  expect(src).toContain("isQualified");
  expect(src).toContain("usaha-saya");
});

test("onboarding INLINE (bukan full-page) berisi dua CTA + penjelasan klaim", () => {
  expect(src).toContain("Tambah listing");
  expect(src).toContain("Klaim listing");
  expect(src).toContain("terverifikasi");
  expect(src).toContain("useMyClaims");
  expect(src).toContain("useOwnerVendors");
  expect(src).not.toContain("<main");
});

test("murni UX baca + tema publik", () => {
  expect(src).not.toContain("useMutation");
  expect(src).not.toContain("admin-");
});
```

- [ ] **Step 2: Run, harapkan FAIL (ENOENT)**

Run: `bunx vitest run src/components/require-mitra-gate.test.ts`
Expected: FAIL with ENOENT

- [ ] **Step 3: Implementasi**

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Plus, Store } from "lucide-react";
import { useMyClaims, useOwnerVendors } from "@/lib/catalog-store";
import { focusRing } from "@/lib/focus-ring";

/**
 * Gerbang UX inline untuk section khusus-qualified di MitraDashboard
 * (menggantikan RequireStaffGate yang dihapus).
 *
 * Bukan penolakan dan BUKAN full-page: gate ini dirender DI DALAM halaman,
 * di antara manager (selalu tampil) dan section qualified. Belum-mitra mendapat
 * kartu onboarding + penjelasan klaim terverifikasi; formulir tambah + notifikasi
 * tetap terjangkau karena hidup di luar gate. Otorisasi sungguhan tetap di
 * tiap mutation server.
 */
export function RequireMitraGate({ children }: { children: ReactNode }) {
  const owned = useOwnerVendors();
  const claims = useMyClaims();

  if (owned === undefined || claims === undefined) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-base font-bold text-slate-600 motion-safe:animate-pulse" role="status">
        Memeriksa usaha Anda...
      </p>
    );
  }

  const isQualified =
    owned.length > 0 || claims.some((claim) => claim.status === "verified");

  if (!isQualified) {
    return (
      <section aria-label="Mulai sebagai mitra" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
          Ruang mitra
        </p>
        <h2 className="mt-1 text-xl font-black text-slate-950">
          Kelola usaha Anda di sini
        </h2>
        <p className="mt-2 text-base leading-7 text-slate-600">
          Daftarkan usaha pertama Anda pada formulir di bawah, atau klaim listing
          yang sudah tayang. Klaim terverifikasi admin membuka pengelolaan penuh.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
          >
            <Plus className="size-4" aria-hidden="true" />
            Tambah listing
          </button>
          <Link
            to="/#katalog"
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}
          >
            <Store className="size-4" aria-hidden="true" />
            Klaim listing
          </Link>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
```

Hapus jejak staff: `git rm src/components/RequireStaffGate.tsx src/components/require-staff-gate.test.ts` (dalam commit yang sama).

- [ ] **Step 4: Run hijau**

Run: `bunx vitest run src/components/require-mitra-gate.test.ts` → PASS; full suite; typecheck (masih merah StaffDashboard — ekspektasian sampai R4); eslint.

- [ ] **Step 5: Commit**

```bash
git add src/components/RequireMitraGate.tsx src/components/require-mitra-gate.test.ts
git rm src/components/RequireStaffGate.tsx src/components/require-staff-gate.test.ts
git commit -m "feat(mitra): onboarding gate replacing staff gate"
```

---

### Task R3: Ekstraksi manajer listing ke komponen mitra

**Files:**
- Create: `src/components/mitra-listing-manager.tsx`
- Modify: `src/pages/WargaDashboard.tsx` (HAPUS definisi pindahan + usage-nya; rapikan import mati)
- Test: tidak ada file test baru (terkunci oleh test R4/R6: `<MitraListingManager` di mitra, `not.toContain("OwnerListingManager")` di warga)

**Interfaces:**
- Consumes: semua hook/mutation yang dipakai `OwnerListingManager` + `OwnerPackageEditor` saat ini (pindah verbatim).
- Produces: `MitraListingManager()` + `OwnerPackageEditor` internal — dipakai Task R4. Nama `OwnerListingManager` TIDAK dipertahankan (satu nama satu rumah; test R6 menegaskan hilangnya dari warga).

- [ ] **Step 1: Pindah verbatim (belum ada test baru — R4/R6 mengunci)**

1. Baca `WargaDashboard.tsx`: blok `OwnerPackageEditor` + `OwnerListingManager` + helper
   modulnya (`OwnerAvailability`, `OwnerDraft`, `ownerInputClass`,
   `minAvailableAtLocal`, `formatDraftAvailability`, `ownerStatusSelectOptions`,
   `emptyOwnerDraft`, `toDateTimeInput`, `ownerDraftFromVendor`, `ownerListingPayload`).
2. Buat `src/components/mitra-listing-manager.tsx` berisi SALINAN PERSIS blok-blok itu,
   dengan DUA rename mekanis: `OwnerPackageEditor` → `MitraPackageEditor`,
   `OwnerListingManager` → `MitraListingManager`; export KEDUANYA? TIDAK — hanya
   `MitraListingManager` (package editor tetap internal file, seperti semula).
   Komentar `//` penjelas pola ikut tersalin; JANGAN tulis ulang logika.
3. Di `WargaDashboard.tsx`: HAPUS definisi + `<OwnerListingManager />` usage +
   `<OwnerRequestWorkspace />` usage (pindah R4); hapus import yang jadi mati
   (TUNTASKAN via `bunx eslint` + `bun run typecheck` — nol unused).
   `useOwnerVendors` di komponen utama: PERTAHANKAN bila kartu "Listing saya" masih
   memakainya (keputusan final di R6; Task ini JANGAN ubah kartu).

- [ ] **Step 2: Verifikasi**

Run: `bunx vitest run src/pages/dashboard-routes.test.ts` (rute warga masih render —
  halaman warga tetap kompilasi walau seksinya berkurang) → PASS.
Run: `bun run typecheck` → merah HANYA StaffDashboard (R4) + `MitraListingManager`
  belum dipakai di mana pun? TIDAK — file tak terpakai tidak bikin merah. Ekspektasi:
  hanya error StaffDashboard yang sudah ada.
Run: `bunx eslint src/components/mitra-listing-manager.tsx src/pages/WargaDashboard.tsx` → bersih.

- [ ] **Step 3: Commit**

```bash
git add src/components/mitra-listing-manager.tsx src/pages/WargaDashboard.tsx
git commit -m "refactor(mitra): extract listing manager to mitra component"
```

---

### Task R4: Halaman + rute mitra (shell, stats, gate, routes test)

**Files:**
- Create: `src/pages/MitraDashboard.tsx`, `src/pages/mitra-dashboard.test.ts`
- Create: `src/components/mitra-stats.tsx` (4 kartu + tabel per-listing + skor)
- Modify: `src/main.tsx` (lazy MitraDashboard; rute `/mitra/dashboard` RequireAuth saja — gate hidup di dalam halaman; HAPUS rute `/staff/dashboard` + lazy StaffDashboard)
- Delete: `src/pages/StaffDashboard.tsx`, `src/pages/staff-dashboard.test.ts` (via `git rm`)
- Rewrite: `src/pages/dashboard-routes.test.ts` (rute v2)

**Interfaces:**
- Consumes: `RequireMitraGate` (R2 — dipakai DI DALAM halaman, bukan di rute),
  `MitraListingManager` (R3), `OwnerRequestWorkspace`, `NotificationCenter`,
  `PwaControls` (existing, reuse), `MitraStats` (baru task ini).
- Produces: default export `MitraDashboard`; rute kanonis `<RequireAuth>` SAJA.
  Struktur halaman: hero → manager `#usaha-saya` (selalu) → gate(stats, [R5:
  reviews], workspace) → notifikasi + PWA (selalu, user-scoped). Alasan: gate di
  rute akan memblokir belum-mitra dari formulir tambah + notifikasi klaim pending.
- Otorisasi `createVendor` untuk belum-mitra: BACA handler `vendors.createVendor`
  DULU; bila server menolak tanpa klaim, error inline existing yang bicara —
  JANGAN mengarang alur, catat temuan faktual di report.

- [ ] **Step 1: Test halaman + rute dulu**

`mitra-dashboard.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./MitraDashboard.tsx", import.meta.url), "utf8");

test("komposisi mitra: manager selalu, gate di dalam, notifikasi di luar", () => {
  expect(src).toContain("export default function MitraDashboard");
  expect(src).toContain("<MitraListingManager");
  expect(src).toContain("<RequireMitraGate");
  expect(src).toContain("<OwnerRequestWorkspace");
  expect(src).toContain("<NotificationCenter");
  expect(src).toContain("Ruang mitra");
});

test("urutan: manager di atas gate, notifikasi di bawah gate", () => {
  const manager = src.indexOf("<MitraListingManager");
  const gate = src.indexOf("<RequireMitraGate");
  const gateEnd = src.indexOf("</RequireMitraGate>");
  const notif = src.indexOf("<NotificationCenter");
  expect(manager).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(manager);
  expect(gateEnd).toBeGreaterThan(gate);
  expect(notif).toBeGreaterThan(gateEnd);
});

test("read-only guard halaman: tanpa mutation langsung", () => {
  expect(src).not.toContain("useMutation");
});

test("tanpa kelas admin, tanpa maskot literal baru", () => {
  expect(src).not.toContain("border-[#121212]");
  expect(src).not.toContain("<BrandMascot");
  for (const marker of ["admin-btn", "admin-card", "admin-input", "admin-dialog", "admin-workspace", "admin-status", "admin-menu", "admin-check"]) {
    expect(src, `tanpa kelas tema ${marker}`).not.toContain(marker);
  }
});
```

CATATAN: `<MitraClaimTracker` + `<MitraReviews` dibuat di Task R5 — R5 MENYISIPKAN
keduanya (tracker SETELAH manager SEBELUM gate; reviews anak PERTAMA di dalam
gate) + MEMPERLUAS test ini dengan 2 asersi (edit test file R4 diizinkan eksplisit
di R5). R4 tidak mengacu keduanya.

`dashboard-routes.test.ts` (rewrite total):

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("rute mitra terdaftar; gate hidup di dalam halaman", () => {
  expect(main).toContain('path="/mitra/dashboard"');
  expect(main).toContain("<MitraDashboard />");
  expect(main).toContain('path="/dashboard"');
  expect(main).toContain('path="/warga/dashboard"');
  expect(main).not.toContain("RequireMitraGate");
});

test("jejak staff hilang total", () => {
  expect(main).not.toContain("/staff/dashboard");
  expect(main).not.toContain("StaffDashboard");
  expect(main).not.toContain("RequireStaffGate");
});

test("redirect preservasi-hash tetap", () => {
  expect(main).toContain("hash: location.hash");
});
```

- [ ] **Step 2: Run, harapkan FAIL (ENOENT + staff masih ada)**

Run: `bunx vitest run src/pages/mitra-dashboard.test.ts src/pages/dashboard-routes.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementasi**

`mitra-stats.tsx` (baru, SEMUA data dari `useOwnerVendors()` rows + `useOwnerRequests()`):

```tsx
import { Link } from "react-router";
import { Eye, MessageCircle, Package, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerRequests, useOwnerVendors } from "@/lib/catalog-store";
import { profileCompleteness, qualityIssues } from "@/lib/catalog-data";
import { focusRing } from "@/lib/focus-ring";

// VERIFIKASI DULU: signature profileCompleteness/qualityIssues di catalog-data.ts
// (dipakai Admin.tsx — contoh: profileCompleteness(draft), qualityIssues(item as Vendor)).
// Kolom tabel: Listing | Status | Dilihat | Dihubungi | Dibagikan | Kelengkapan.
// Angka dari row.whatsappClicks/searchImpressions/shareClicks (ada di VendorRecord).
// Kelengkapan: `${profileCompleteness(row)}%` + issues.length ? ` (${issues.length} perlu dilengkapi)` : "".
// Sembunyikan kolom Dihubungi/Dibagikan < md via `hidden md:table-cell` (responsif tabel).
```

4 kartu: Tayang (Store; active count) · Dilihat (Eye; Σ searchImpressions) ·
Dihubungi (MessageCircle; Σ whatsappClicks) · Request cocok (Package? — Package =
paket layanan di standar ikon... PAKAI `Inbox` untuk request; JANGAN Package.
Ikon kartu: Store, Eye, MessageCircle, Inbox — semua SUDAH diimpor di halaman
staff lama; di file BARU ini impor yang dipakai SAJA).
Footer tiap kartu: link ke section (`#usaha-saya`, `#usaha-saya`, `#permintaan-mitra`,
`#permintaan-mitra`) pola scrollIntoView.
Skeleton `role="status"` saat `undefined`; `0` dirender.

`MitraDashboard.tsx` (komposisi — gate DI DALAM halaman):

```tsx
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { MitraListingManager } from "@/components/mitra-listing-manager";
import { MitraStats } from "@/components/mitra-stats";
import { RequireMitraGate } from "@/components/RequireMitraGate";
import { NotificationCenter } from "@/components/community-notification-center";
import { OwnerRequestWorkspace } from "@/components/community-widgets";
import { PwaControls } from "@/components/community-widgets";
import { focusRing } from "@/lib/focus-ring";

export default function MitraDashboard() {
  const scrollToUsaha = () => document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <main className="min-h-dvh bg-[#f7f8fc] px-4 py-6 text-foreground sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 sm:gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Ruang mitra</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">Kelola usaha Anda.</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">Listing, ketersediaan, paket, permintaan, dan ulasan — dari satu tempat.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={scrollToUsaha} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}>
              <Plus className="size-4" aria-hidden="true" />Tambah listing
            </button>
            <Link to="/" className={`inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}>
              Lihat katalog
            </Link>
          </div>
        </header>
        <div id="usaha-saya" className="scroll-mt-6"><MitraListingManager /></div>
        <RequireMitraGate>
          <MitraStats />
          <div id="permintaan-mitra" className="scroll-mt-6"><OwnerRequestWorkspace /></div>
        </RequireMitraGate>
        <NotificationCenter />
        <PwaControls />
      </div>
    </main>
  );
}
```

`main.tsx`: lazy `MitraDashboard` (ganti baris StaffDashboard); rute
`<Route path="/mitra/dashboard" element={<RequireAuth><MitraDashboard /></RequireAuth>} />`
(gate TIDAK di rute — hidup di dalam halaman); HAPUS rute `/staff/dashboard` +
lazy StaffDashboard + import gate staff; `git rm` 2 file staff dalam commit sama.
Otorisasi `createVendor` untuk belum-mitra: BACA handler-nya DULU; copy faktual,
catat di report, JANGAN mengarang.

- [ ] **Step 4: Run hijau**

Run: focused (2 file) + full suite + typecheck HIJAU PENUH (debt StaffDashboard
tertutup di sini) + eslint.

- [ ] **Step 5: Commit**

```bash
git add src/pages/MitraDashboard.tsx src/pages/mitra-dashboard.test.ts src/components/mitra-stats.tsx src/main.tsx src/pages/dashboard-routes.test.ts
git rm src/pages/StaffDashboard.tsx src/pages/staff-dashboard.test.ts
git commit -m "feat(mitra): mitra dashboard page, stats and routes replacing staff"
```

---

### Task R5: Pelacak klaim + ulasan read-only

**Files:**
- Create: `src/components/mitra-claim-tracker.tsx`, `src/components/mitra-reviews.tsx`
- Modify: `src/pages/MitraDashboard.tsx` (sisipkan 2 section), `src/pages/mitra-dashboard.test.ts` (TAMBAH 2 asersi — edit file R4 diizinkan eksplisit di sini)

**Interfaces:**
- Consumes: `useMyClaims()` (`{vendorName?, status, reviewNote?, createdAt}` — VERIFIKASI field di `catalog-store.ts:77` SEBELUM pakai; `vendorName` opsional → fallback "Listing"); `useOwnerVendors()` + `useVendor(slug)` per listing untuk ulasan (`{reviews, reviewItems: [{authorName, rating, body}]}` — batasi render ≤3 terbaru per listing, ≤N listing pertama? Tampilkan SEMUA listing milik (N kecil di praktik); skeleton saat `undefined`).
- Produces: `MitraClaimTracker()`, `MitraReviews()` — tanpa mutation, tanpa maskot literal, tanpa kelas admin.

- [ ] **Step 1: Perluas test halaman (tulis dulu)**

Tambahkan ke `mitra-dashboard.test.ts`:

```ts
test("pelacak klaim + ulasan terpasang", () => {
  expect(src).toContain("<MitraClaimTracker");
  expect(src).toContain("<MitraReviews");
});
```

- [ ] **Step 2: Run, harapkan FAIL**

Run: `bunx vitest run src/pages/mitra-dashboard.test.ts`
Expected: FAIL (komponen belum ada)

- [ ] **Step 3: Implementasi**

`mitra-claim-tracker.tsx`: section `aria-label="Status klaim"`; tiap klaim = baris
(status badge: pending = amber "Menunggu verifikasi", verified = emerald
"Terverifikasi", rejected = red "Ditolak" + `reviewNote` bila ada); kosong →
`<EmptyStateCard title="Belum ada klaim" body="..." actionLabel="Tambah listing"
onAction={scroll #usaha-saya} />` (EmptyStateCard SUDAH terdaftar di audit —
pakai ulang, JANGAN maskot literal).

`mitra-reviews.tsx`: section `aria-label="Ulasan pelanggan"`; per listing milik:
nama + `reviews` count + ≤3 `reviewItems` (nama penulis, rating, body) + Link
`Lihat halaman publik` → `/v/{slug}`; listing tanpa ulasan → satu baris teks
(bukan kartu kosong); kosong semua → `EmptyStateCard` (action → `/v/{slug}`?
TIDAK — actionLabel "Lihat katalog", onAction navigate("/")). Butuh `useNavigate`
(react-router) — impor dan pakai, JANGAN biarkan mati.

Sisipkan di `MitraDashboard.tsx`: `<MitraClaimTracker />` SETELAH div `#usaha-saya`
SEBELUM `<RequireMitraGate>` (pelacak relevan juga untuk klaim-pending yang melihat
onboarding); `<MitraReviews />` sebagai anak PERTAMA di dalam `<RequireMitraGate>`
(sebelum `<MitraStats />`). Urutan akhir: hero → manager → tracker → gate(stats?
TIDAK — urutan dalam gate: reviews → stats → workspace. ALASAN: klaim/ulasan adalah
konteks identitas; angka menyusul. Perbarui test urutan R4? Test R4 hanya menegaskan
manager < gate < notif — tetap hijau. Tambahkan asersi posisi di test R5:
`indexOf("<MitraClaimTracker") < indexOf("<RequireMitraGate")` dan
`indexOf("<MitraReviews") > indexOf("<RequireMitraGate")`.

- [ ] **Step 4: Run hijau** (focused + full + typecheck + eslint)

- [ ] **Step 5: Commit**

```bash
git add src/components/mitra-claim-tracker.tsx src/components/mitra-reviews.tsx src/pages/MitraDashboard.tsx src/pages/mitra-dashboard.test.ts
git commit -m "feat(mitra): claim tracker and read-only reviews"
```

---

### Task R6: Warga slim-down + uniformity v2

**Files:**
- Modify: `src/pages/WargaDashboard.tsx` (hapus sisa owner? — R3 sudah; redefinisi kartu 3-4 + quick-access + ids)
- Rewrite: `src/components/dashboard-uniformity.test.ts` (warga-revisi + mitra)

**Interfaces:**
- Consumes: `useServiceRequests({mine:true})` (SUDAH dipakai kartu "Permintaan"? — Task 12 menambahkannya; VERIFIKASI nama variabelnya DULU di file), `useMyInteractions()` (TAMBAH import + `const interactions = useMyInteractions();` — VERIFIKASI return array|undefined di `catalog-store.ts` DULU, tangani aktualnya).
- Produces: warga = Katalog · Tersimpan · Permintaan saya · Interaksi; quick-access 4: Cari usaha · Favorit · Permintaan · Kelola usaha→`/mitra/dashboard`.

- [ ] **Step 1: Tulis ulang test uniformity**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const warga = readFileSync(new URL("../pages/WargaDashboard.tsx", import.meta.url), "utf8");
const mitra = readFileSync(new URL("../pages/MitraDashboard.tsx", import.meta.url), "utf8");
const empty = readFileSync(new URL("./empty-state-card.tsx", import.meta.url), "utf8");

test("grid 4 kolom di xl pada warga + mitra", () => {
  expect(warga).toContain("sm:grid-cols-2 xl:grid-cols-4");
  expect(mitra).toContain("sm:grid-cols-2 xl:grid-cols-4");
});

test("warga bebas sisa owner; mitra memakai bingkai seragam", () => {
  expect(warga).not.toContain("MitraListingManager");
  expect(warga).not.toContain("OwnerListingManager");
  expect(warga).not.toContain("OwnerRequestWorkspace");
  expect(mitra).toContain("<EmptyStateCard");
  expect(warga).toContain("<EmptyStateCard");
  expect(warga).not.toContain("border-dashed border-slate-300 bg-white shadow-none");
});

test("warga: kartu konsumen + quick-access 4 dengan cross-link mitra", () => {
  expect(warga).toContain("Permintaan saya");
  expect(warga).toContain("Interaksi");
  expect(warga).toContain('to="/mitra/dashboard"');
  const wargaItems = (warga.match(/label: "/g) ?? []).length;
  expect(wargaItems).toBeGreaterThanOrEqual(4);
});
```

PERINGATAN: `expect(warga).toContain("Interaksi")` — kata "Interaksi" MUNGKIN sudah
muncul di tempat lain (InteractionHistory). Itu TIDAK masalah (test hanya butuh
keberadaan); TAPI pastikan KARTU-nya ada: tambah `expect(warga).toContain("Aktivitas")`?
TIDAK — putuskan dari file aktual: beri judul kartu persis "Interaksi" dan
asersi itu menguncinya. Bila judulnya "Interaksi", hapus baris ambigu? TIDAK
BOLEH hapus asersi lemah diam-diam —标题 kartu WAJIB "Interaksi" (satu kata,
persis), sehingga asersi itu mengunci kartu.

- [ ] **Step 2: Run, harapkan FAIL**

Run: `bunx vitest run src/components/dashboard-uniformity.test.ts`
Expected: FAIL (kartu warga masih versi Task 12)

- [ ] **Step 3: Implementasi (WargaDashboard.tsx SAJA)**

1. Kartu 3 "Listing saya" → GANTI jadi "Permintaan saya": ikon `ClipboardList`
   (impor TETAP — dipakai quick-access juga), value `myRequests?.length ?? skeleton`
   (`myRequests` dari `useServiceRequests({ mine: true })` — SUDAH ADA dari Task 12;
   bila nama variabelnya berbeda, PAKAI yang ada, JANGAN deklarasi ganda),
   caption "permintaan yang Anda buat", footer scroll `#permintaan-saya` (wrapper
   TETAP ADA).
2. Kartu 4 "Permintaan" (Task 12) → GANTI jadi "Interaksi": ikon `MessageCircle`
   (impor tetap), value `interactions?.length ?? skeleton`
   (`const interactions = useMyInteractions();` TAMBAH di komponen utama +
   `useMyInteractions` ke import catalog-store), caption "chatting & kunjungan
   terakhir Anda", footer scroll ke grid interaksi — TAMBAH `id="aktivitas-saya"`
   + `scroll-mt-6` pada `<div className="grid gap-6 lg:grid-cols-2">` itu.
3. Quick-access: item "Kelola listing" (scroll `#listing-saya` — section SUDAH
   PINDAH, id mati!) → GANTI jadi `{ label: "Kelola usaha", icon: <Store
   className="size-5" />, color: <warna-valid-4>, onClick: () => navigate("/mitra/dashboard") }`
   (`Store` SUDAH diimpor; `navigate` SUDAH ada; `color`: pakai nilai union valid —
   baca tipe GlassIcons DULU).
   Item Favorit + Permintaan: PERTAHANKAN (scroll id masing-masing tetap ada).
   Total item TETAP 4 (Cari usaha, Favorit, Permintaan, Kelola usaha).
4. `id="favorit-saya"` + wrapper `#permintaan-saya`: PERTAHANKAN.
5. `useOwnerVendors` di komponen utama: HAPUS bila tak terpakai lagi (cek via
   typecheck+eslint; JANGAN sisakan unused).
6. JANGAN sentuh: EmptyStateCard favorit, PwaControls, NotificationCenter,
   MyRequestHistory, InteractionHistory, hero, container.

- [ ] **Step 4: Run hijau** (uniformity + admin-profile + landing-shell + full + typecheck + eslint)

- [ ] **Step 5: Commit**

```bash
git add src/pages/WargaDashboard.tsx src/components/dashboard-uniformity.test.ts
git commit -m "refactor(warga): consumer-only cards with mitra cross-link"
```

---

### Task R7: Sweep prefix /staff/ → /mitra/

**Files:**
- Modify: `src/lib/mascot-loader.ts`, `src/components/mascot-loader.test.ts`, `src/lib/sitemap.ts`, `src/convex/http.ts`, `src/lib/deploy-config.test.ts`, `src/lib/robots-exclusion.test.ts`

**Interfaces:** Tak ada (string sweeps + test updates). `dashboard-routes` tak tersentuh.

- [ ] **Step 1: Tulis ekspektasi dulu (edit 3 test)**

- `mascot-loader.test.ts`: DUA baris `/staff/dashboard` → `/mitra/dashboard`
  (ekspektasi `found` TETAP; baris `/dashboard` + `/warga/dashboard` TETAP).
- `deploy-config.test.ts`: array rute: HAPUS `"/staff/dashboard"`, TAMBAH
  `"/mitra/dashboard"` (urutan: `..., "/dashboard", "/warga/dashboard",
  "/mitra/dashboard", "/admin", ...`).
- `robots-exclusion.test.ts`: daftar rute: HAPUS `"/staff/dashboard"`, TAMBAH
  `"/mitra/dashboard"`.

- [ ] **Step 2: Run, harapkan FAIL (3 file, implementasi masih /staff/)**

Run: `bunx vitest run src/components/mascot-loader.test.ts src/lib/deploy-config.test.ts src/lib/robots-exclusion.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementasi (3 file non-test)**

- `mascot-loader.ts`: kondisi → `pathname.startsWith("/dashboard") ||
  pathname.startsWith("/warga/") || pathname.startsWith("/mitra/")`.
- `sitemap.ts` + `http.ts`: `"Disallow: /staff/dashboard"` →
  `"Disallow: /mitra/dashboard"` (satu baris tiap file; JANGAN ubah legal-docs
  hunks).
- Sweep verifikasi: `grep -rn "staff/dashboard\|/staff/" src/ --include="*.ts*" | grep -v staffMembers | grep -v "staff invite" | grep -v StaffGate` → HARAPKAN NOL (istilah `staff` yang sah: `staffMembers`, staff invite, `staffRoleLongLabel`, peran). Bila sisa di luar daftar sah → laporkan BLOCKED, JANGAN sentuh.

- [ ] **Step 4: Run hijau** (3 file + full + typecheck + eslint)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mascot-loader.ts src/components/mascot-loader.test.ts src/lib/sitemap.ts src/convex/http.ts src/lib/deploy-config.test.ts src/lib/robots-exclusion.test.ts
git commit -m "chore(mitra): retarget crawler and loader prefixes from staff to mitra"
```

---

### Task R8: Gerbang verifikasi rework (wajib hijau)

**Files:** tidak ada (verifikasi + laporan; COMMIT HANYA bila ada perbaikan).

- [ ] **Step 1: Typecheck** — Run: `bun run typecheck` — Expected: PASS nol error.
- [ ] **Step 2: Lint tersentuh rework** — Run: `bunx eslint` SEMUA file R1–R7 (daftar dari `git diff main..HEAD --name-only`, filter `*.tsx?` yang diubah rework) — Expected: PASS.
- [ ] **Step 3: Full suite** — Run: `bun run test` — Expected: PASS semua; kegagalan = regresi → perbaiki pekerjaan rework (atau BLOCKED berbukti bila penyebab luar).
- [ ] **Step 4: Build** — Run: `bun run build` — Expected: PASS.
- [ ] **Step 5: Diff rework review** — Run: `git status --short`, `git diff --stat main..HEAD` — pastikan HANYA file rework + sisa PR dasar; TIDAK ADA file baru tak dikenal; TIDAK ADA sisa string `/staff/dashboard` (grep Step R7 diulang); matriks browser DINYATAKAN UNVERIFIED (checklist seperti Task 13, untuk manusia).
- [ ] **Step 6 (laporan, bukan kode):** tulis `.superpowers/sdd/2026-10-06-mitra-rework/task-r8-report.md` — gunakan workspace BARU `2026-10-06-mitra-rework` (ledger terpisah; JANGAN campur ledger plan dasar).

---

## Self-Review

**1. Spec coverage:** Amendment §3 rute → R4+R7; §4 gate → R2 (inline di halaman; manager + notifikasi di luar gate agar belum-mitra mencapai formulir + notif klaim); §5 mapping → R1 (+konsumen AccountMenu otomatis); §6 butir 1 tabel+skor → R4 `mitra-stats`; butir 2 CRUD+ikon+libur → R3+R4 (ikon: `Power` dipakai tombol libur — DITEGASKAN di sini karena brief R3 pindahan verbatim belum punya tombol libur; R4 MENAMBAH tombol libur di MitraDashboard dengan ikon `Power`, `min-h-12`, `focusRing`); butir 3 skor → R4; butir 4 workspace → R3/R4 pindah; butir 5 klaim → R5; butir 6 ulasan → R5; butir 7 notif+PWA → R4 reuse; butir 8 fase-2 → TANPA task (benar tidak ada); §7 peta pindah → R3+R4+R6; §8 UI/responsif → R4+R6 (sistem kartu) + R8 UNVERIFIED browser.

**2. Placeholder scan:** R4 memuat SATU titik jujur (otorisasi `createVendor` untuk belum-mitra — implementer WAJIB baca handler + tulis copy faktual, dilarang mengarang). R6 memuat SATU fallback terkondisi (nama variabel Task 12 — verifikasi-dulu, bukan tebakan). Keduanya deterministik, bukan placeholder.

**3. Type consistency:** `dashboardTargetFor(access, mitra)` identik R1 def/test/hook; `RequireMitraGate({children})` R2→R4; `MitraListingManager()` R3→R4; `MitraClaimTracker()/MitraReviews()/MitraStats()` R5/R4→test; `triageTo` TIDAK dipakai ulang (anchor admin tak relevan di mitra — R4 footer memakai scroll id lokal, BUKAN `/admin#`; test R4 tidak menyebut admin anchor); `EmptyStateCard({title,body,actionLabel,onAction})` konsisten R4/R5/R6.
