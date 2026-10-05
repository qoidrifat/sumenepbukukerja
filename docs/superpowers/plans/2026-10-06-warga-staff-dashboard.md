# Dashboard Warga + Dashboard Staff + AccountMenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun `/warga/dashboard`, `/staff/dashboard`, dan `AccountMenu` dropdown header publik sesuai spec yang disetujui, tanpa regresi.

**Architecture:** Ekstrak-bungkus-minimal: pindahkan `Dashboard.tsx` → `WargaDashboard.tsx` apa adanya, daftarkan 2 rute baru + redirect `/dashboard` yang mempertahankan hash, gate staff tipis di atas `currentAccess`, menu akun Radix dengan dialog profil tema-publik. Nol query/mutasi Convex baru; seluruh baca memakai query existing.

**Tech Stack:** React 19 + react-router v7 (`Navigate`, `useLocation`, `useNavigate`), Convex (`useQuery`/`useMutation` existing), Radix DropdownMenu + Dialog (shadcn wrappers di `src/components/ui/`), Tailwind v4, vitest (edge-runtime, idiom source-content test + unit murni).

**Spec:** `docs/superpowers/specs/2026-10-06-warga-staff-dashboard-design.md` — plan ini berargumen dari spec itu; eksekutor membaca keduanya.

## Global Constraints

- Tanpa dependency baru — Radix DropdownMenu/Dialog/Avatar sudah ada di `src/components/ui/`.
- File test bernama `*.test.ts` di bawah `src/` (pola `include` vitest); environment edge-runtime.
- Test komponen yang memakai hook Convex ditulis sebagai source-content test (`readFileSync` + assertion string), mengikuti `src/components/admin-profile.test.ts`; TIDAK ada render provider Convex di test.
- Logika murni yang bisa diuji (pemetaan peran → URL, peta rute → maskot) wajib tinggal di `src/lib/` sebagai fungsi murni dengan unit test gaya `src/lib/auth-redirect.test.ts`.
- Kelas tema admin (`admin-*`, `border-[#121212]`, `Warm Brutalism`) DILARANG di permukaan publik; dialog publik memakai `ui/dialog` + `focusRing` (`src/lib/focus-ring.ts`).
- Aturan react-refresh: berkas komponen hanya mengekspor komponen; tipe/helper di `src/lib/`.
- Target sentuh minimal `min-h-12`/44px; `env(safe-area-inset-*)`; hormati reduced-motion; tidak ada aksi hover-only.
- Setiap task berakhir commit yang hanya men-stage file task itu (working tree punya perubahan lain — JANGAN `git add -A`).
- Perintah verifikasi: `bunx vitest run <file>` untuk test tunggal, `bun run typecheck`, `bunx eslint <files>`, `bun run build` untuk gerbang akhir.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `src/lib/dashboard-target.ts` (baru) | Fungsi murni `dashboardTargetFor` — satu-satunya tempat pemetaan akses → URL dashboard |
| `src/lib/dashboard-target.test.ts` (baru) | Unit test fungsi murni |
| `src/hooks/use-dashboard-target.ts` (baru) | Hook tipis di atas `useCurrentAccess` + fungsi murni |
| `src/hooks/use-dashboard-target.test.ts` (baru) | Source test hook |
| `src/components/RequireStaffGate.tsx` (baru) | Gate UX: loading → skeleton; bukan staff → layar ditolak; staff → anak |
| `src/components/require-staff-gate.test.ts` (baru) | Source test gate |
| `src/pages/WargaDashboard.tsx` (pindahan dari `Dashboard.tsx`) | Dashboard warga (isi identik tahap pindah) |
| `src/pages/StaffDashboard.tsx` (baru) | Dashboard staff ringkas, read-only |
| `src/pages/staff-dashboard.test.ts` (baru) | Source test staff dashboard |
| `src/pages/dashboard-routes.test.ts` (baru) | Source test rute di `main.tsx` |
| `src/components/profile-dialog.tsx` (baru) | Dialog profil tema-publik (nama + foto, mutation existing) |
| `src/components/profile-dialog.test.ts` (baru) | Source test dialog |
| `src/components/account-menu.tsx` (baru) | Button avatar + dropdown 3 item + signOut |
| `src/components/account-menu.test.ts` (baru) | Source test menu |
| `src/components/empty-state-card.tsx` (baru) | Filled-state seragam untuk kartu kosong |
| `src/main.tsx` (ubah) | Rute `/warga/dashboard`, `/staff/dashboard`, redirect `/dashboard` |
| `src/pages/Landing.tsx` (ubah) | `TopNav` memakai `AccountMenu` saat login |
| `src/lib/mascot-loader.ts` (ubah) | Prefix `/warga` + `/staff` ikut peta maskot dashboard |
| `src/lib/sitemap.ts`, `src/convex/http.ts`, `src/lib/deploy-config.test.ts` (ubah) | Rute privat baru masuk robots/sitemap/daftar rute |
| `src/components/admin-profile.test.ts` (ubah) | Path `Dashboard.tsx` → `WargaDashboard.tsx` |
| `src/components/mascot-loader.test.ts` (ubah) | Tambah kasus `/warga/dashboard`, `/staff/dashboard` |

---

### Task 1: Fungsi murni pemetaan dashboard

**Files:**
- Create: `src/lib/dashboard-target.ts`
- Test: `src/lib/dashboard-target.test.ts`

**Interfaces:**
- Consumes: tidak ada (pure, tanpa import).
- Produces: `dashboardTargetFor(access: { canViewAdmin: boolean } | null | undefined): string | null` — dipakai Task 2. `undefined` = loading → `null`; `null` (tamu) atau `canViewAdmin: false` → `"/warga/dashboard"`; `canViewAdmin: true` → `"/staff/dashboard"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "vitest";
import { dashboardTargetFor } from "./dashboard-target";

describe("dashboardTargetFor", () => {
  test("staff (canViewAdmin) ke dashboard staff", () => {
    expect(dashboardTargetFor({ canViewAdmin: true })).toBe("/staff/dashboard");
  });
  test("warga dan tamu ke dashboard warga", () => {
    expect(dashboardTargetFor({ canViewAdmin: false })).toBe("/warga/dashboard");
    expect(dashboardTargetFor(null)).toBe("/warga/dashboard");
  });
  test("loading (undefined) belum punya tujuan", () => {
    expect(dashboardTargetFor(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/dashboard-target.test.ts`
Expected: FAIL with "Failed to resolve import ./dashboard-target"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Satu-satunya tempat yang tahu pemetaan akses → URL dashboard.
 *
 * Murni (tanpa hook/query) supaya bisa diuji unit tanpa provider Convex.
 * `undefined` berarti query akses belum menjawab — pemanggil menonaktifkan
 * item Dashboard sampai jawabannya tiba, bukan menebak tujuan.
 */
export function dashboardTargetFor(
  access: { canViewAdmin: boolean } | null | undefined,
): string | null {
  if (access === undefined) return null;
  if (access !== null && access.canViewAdmin) return "/staff/dashboard";
  return "/warga/dashboard";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/dashboard-target.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-target.ts src/lib/dashboard-target.test.ts
git commit -m "feat(dashboard): pure role-to-dashboard target mapping"
```

---

### Task 2: Hook useDashboardTarget

**Files:**
- Create: `src/hooks/use-dashboard-target.ts`
- Test: `src/hooks/use-dashboard-target.test.ts`

**Interfaces:**
- Consumes: `dashboardTargetFor` (Task 1), `useCurrentAccess` (`src/lib/catalog-store.ts:745`, mengembalikan `undefined` saat loading atau objek `{ canViewAdmin: boolean, ... }`).
- Produces: `useDashboardTarget(): string | null` — dipakai Task 9 (`AccountMenu`).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./use-dashboard-target.ts", import.meta.url), "utf8");

test("hook mendelegasikan ke fungsi murni + useCurrentAccess", () => {
  expect(src).toContain('from "@/lib/dashboard-target"');
  expect(src).toContain("dashboardTargetFor(");
  expect(src).toContain("useCurrentAccess");
  expect(src).toContain("export function useDashboardTarget");
});

test("loading diteruskan sebagai undefined, bukan ditebak", () => {
  expect(src).toContain("access === undefined ? undefined");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/hooks/use-dashboard-target.test.ts`
Expected: FAIL with ENOENT (file belum ada)

- [ ] **Step 3: Write minimal implementation**

```ts
import { useCurrentAccess } from "@/lib/catalog-store";
import { dashboardTargetFor } from "@/lib/dashboard-target";

/**
 * Tujuan item "Dashboard" untuk sesi saat ini.
 *
 * `null` = akses belum terjawab; pemanggil menonaktifkan itemnya.
 * Logika pemetaannya di `dashboardTargetFor` (unit-tested), hook ini
 * hanya menyambungkan query akses yang sudah ada.
 */
export function useDashboardTarget(): string | null {
  const access = useCurrentAccess();
  return dashboardTargetFor(
    access === undefined ? undefined : { canViewAdmin: access.canViewAdmin },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/hooks/use-dashboard-target.test.ts src/lib/dashboard-target.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-dashboard-target.ts src/hooks/use-dashboard-target.test.ts
git commit -m "feat(dashboard): role-aware dashboard target hook"
```

---

### Task 3: RequireStaffGate

**Files:**
- Create: `src/components/RequireStaffGate.tsx`
- Test: `src/components/require-staff-gate.test.ts`

**Interfaces:**
- Consumes: `useCurrentAccess` (`src/lib/catalog-store.ts:745`).
- Produces: `RequireStaffGate({ children }: { children: ReactNode })` — dipakai Task 5 di rute `/staff/dashboard`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./RequireStaffGate.tsx", import.meta.url), "utf8");

test("tiga keadaan: loading, ditolak, lolos", () => {
  expect(src).toContain("access === undefined");
  expect(src).toContain('role="status"');
  expect(src).toContain("!access.canViewAdmin");
  expect(src).toContain("export function RequireStaffGate");
});

test("layar ditolak menjelaskan + menautkan ke dashboard warga", () => {
  expect(src).toContain('to="/warga/dashboard"');
  expect(src).toContain("Halaman ini untuk staff");
  expect(src).toContain("Peran & Audit");
  expect(src).toContain('to="/"');
});

test("tidak ada mutasi — gate ini murni UX baca", () => {
  expect(src).not.toContain("useMutation");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/require-staff-gate.test.ts`
Expected: FAIL with ENOENT

- [ ] **Step 3: Write minimal implementation**

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useCurrentAccess } from "@/lib/catalog-store";
import { focusRing } from "@/lib/focus-ring";

/**
 * Gerbang UX untuk `/staff/dashboard`.
 *
 * Hanya UX: otorisasi sungguhan tetap di tiap mutation server. Warga yang
 * membuka URL ini mendapat penjelasan + jalan keluar, bukan redirect
 * diam-diam (supaya URL bisa dibagikan dan pesannya jelas — spec §7).
 */
export function RequireStaffGate({ children }: { children: ReactNode }) {
  const access = useCurrentAccess();

  if (access === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-base font-black text-slate-600" role="status">
          Memeriksa akses staff...
        </p>
      </main>
    );
  }

  if (!access.canViewAdmin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
            Akses staff
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">
            Halaman ini untuk staff
          </h1>
          <p className="mt-2 text-base leading-7 text-slate-600">
            Akun Anda belum memiliki peran staff. Peran hanya bisa diberikan oleh
            admin lewat menu Peran & Audit.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link
              to="/warga/dashboard"
              className={`flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-4 text-base font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
            >
              Ke dashboard warga
            </Link>
            <Link
              to="/"
              className={`flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-base font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}
            >
              Kembali ke katalog
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/require-staff-gate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/RequireStaffGate.tsx src/components/require-staff-gate.test.ts
git commit -m "feat(dashboard): staff-only UX gate with explicit denial screen"
```

---

### Task 4: Ekstraksi WargaDashboard (pindah file, nol perubahan logika)

**Files:**
- Move: `src/pages/Dashboard.tsx` → `src/pages/WargaDashboard.tsx` (via `git mv`)
- Modify: rename default export; `src/components/admin-profile.test.ts` (path baca `Dashboard.tsx` → `WargaDashboard.tsx`)

**Interfaces:**
- Consumes: tidak ada.
- Produces: `src/pages/WargaDashboard.tsx` dengan `export default function WargaDashboard()` — dipakai Task 5. Isi selain nama fungsi IDENTIK (diff hanya baris export).

- [ ] **Step 1: Write the failing test (tulis dulu, sebelum pindah)**

Tambahkan di akhir `src/components/admin-profile.test.ts` (ganti path baca di baris 24):

```ts
test("dashboard warga hidup di berkas kanonisnya", () => {
  const warga = readFileSync(new URL("../pages/WargaDashboard.tsx", import.meta.url), "utf8");
  expect(warga).toContain("export default function WargaDashboard");
  expect(warga).toContain("Ruang warga");
  expect(warga).toContain("OwnerListingManager");
  expect(warga).toContain("field-datetime field-datetime--public");
  expect(warga).not.toContain("field-datetime--admin");
});
```

Ubah baris 24 `admin-profile.test.ts` dari:

```ts
const dashboard = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
```

menjadi:

```ts
const dashboard = readFileSync(new URL("../pages/WargaDashboard.tsx", import.meta.url), "utf8");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/admin-profile.test.ts`
Expected: FAIL with ENOENT (`WargaDashboard.tsx` belum ada)

- [ ] **Step 3: Pindah + rename (satu-satunya ubahan isi)**

```bash
git mv src/pages/Dashboard.tsx src/pages/WargaDashboard.tsx
```

Lalu satu edit di `src/pages/WargaDashboard.tsx`:

```tsx
export default function WargaDashboard() {
```

menggantikan:

```tsx
export default function Dashboard() {
```

Verifikasi nol-perubahan-lain:

```bash
git diff HEAD -- src/pages/WargaDashboard.tsx | grep "^[+-]" | grep -v "^[+-][+-]" | grep -v "WargaDashboard" | grep -v "export default function Dashboard"
```

Expected: tidak ada output (seluruh diff hanya rename + rename path).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/admin-profile.test.ts`
Expected: PASS (seluruh suite, termasuk 3 test tanggal yang memakai `dashboard`)

- [ ] **Step 5: Commit**

```bash
git add src/pages/WargaDashboard.tsx src/components/admin-profile.test.ts
git commit -m "refactor(dashboard): move Dashboard page to WargaDashboard without logic change"
```

---

### Task 5: Rute main.tsx (2 rute baru + redirect preservasi-hash)

**Files:**
- Modify: `src/main.tsx` (import `Navigate` + `RequireStaffGate`, lazy StaffDashboard, rename lazy Dashboard → WargaDashboard, 3 rute)
- Test: `src/pages/dashboard-routes.test.ts` (baru)

**Interfaces:**
- Consumes: `WargaDashboard` (Task 4), `StaffDashboard` (Task 11 — rute didaftarkan di sini, halamannya di Task 11; urutan ini disengaja agar redirect warga bisa diverifikasi lebih dulu; Task 11 melengkapi), `RequireStaffGate` (Task 3), `RequireAuth` (existing).
- Produces: rute `/warga/dashboard`, `/staff/dashboard`, `/dashboard` (redirect). `DashboardRedirect` mempertahankan hash (`/dashboard#listing-saya` dari `community-notification-center.tsx:337` harus mendarat di section yang sama).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("tiga rute dashboard terdaftar dengan guard yang benar", () => {
  expect(main).toContain('path="/warga/dashboard"');
  expect(main).toContain("<WargaDashboard />");
  expect(main).toContain('path="/staff/dashboard"');
  expect(main).toContain("<RequireStaffGate>");
  expect(main).toContain("<StaffDashboard />");
  expect(main).toContain('path="/dashboard"');
});

test("redirect /dashboard mempertahankan hash tujuan", () => {
  expect(main).toContain("hash: location.hash");
  expect(main).toContain('pathname: "/warga/dashboard"');
  expect(main).toContain("replace");
});

test("rute lama tidak lagi me-render Dashboard langsung", () => {
  expect(main).not.toContain('import("./pages/Dashboard.tsx")');
  expect(main).toContain('import("./pages/WargaDashboard.tsx")');
});

test("auth tetap mengarah ke /dashboard (ikut redirect otomatis)", () => {
  expect(main).toContain('redirectAfterAuth="/dashboard"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/dashboard-routes.test.ts`
Expected: FAIL with ENOENT

- [ ] **Step 3: Write minimal implementation**

Di `src/main.tsx`, ubah import react-router (baris 11) menjadi:

```tsx
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
```

Tambahkan import gate (dekat import `RequireAuth`):

```tsx
import { RequireStaffGate } from "@/components/RequireStaffGate";
```

Ganti lazy Dashboard (baris 41):

```tsx
const WargaDashboard = lazy(() => import("./pages/WargaDashboard.tsx"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard.tsx"));
```

Tambahkan komponen redirect (di atas `createRoot`, dekat `RouteLoading`):

```tsx
/**
 * Backward-compat `/dashboard` → `/warga/dashboard`.
 *
 * Hash dipertahankan: tautan `/dashboard#listing-saya` (notifikasi) harus
 * mendarat di section yang sama, dan `Navigate` polos akan membuangnya.
 */
function DashboardRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/warga/dashboard", hash: location.hash }} replace />;
}
```

Ganti blok rute `/dashboard` (baris 336–343) menjadi:

```tsx
<Route path="/dashboard" element={<DashboardRedirect />} />
<Route
  path="/warga/dashboard"
  element={
    <RequireAuth>
      <WargaDashboard />
    </RequireAuth>
  }
/>
<Route
  path="/staff/dashboard"
  element={
    <RequireAuth>
      <RequireStaffGate>
        <StaffDashboard />
      </RequireStaffGate>
    </RequireAuth>
  }
/>
```

CATATAN: `StaffDashboard.tsx` belum ada sampai Task 11 — `typecheck`/`build` akan gagal
sampai Task 11 selesai. Itu disengaja dan dicatat; JANGAN membuat stub kosong (stub akan
menutupi lupa). Task 11 adalah pasangan wajib task ini.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/dashboard-routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/pages/dashboard-routes.test.ts
git commit -m "feat(dashboard): warga/staff routes plus hash-preserving dashboard redirect"
```

---

### Task 6: mascot-loader ikut prefix baru

**Files:**
- Modify: `src/lib/mascot-loader.ts` (baris 36), `src/components/mascot-loader.test.ts` (tambah kasus)

**Interfaces:**
- Consumes: `loaderRouteFor` (existing).
- Produces: `loaderRouteFor("/warga/dashboard")` dan `("/staff/dashboard")` → `{ base: "found" }`.

- [ ] **Step 1: Write the failing test**

Tambahkan ke blok `describe("peta rute ke maskot")` di `src/components/mascot-loader.test.ts`:

```ts
expect(loaderRouteFor("/warga/dashboard").base).toBe("found");
expect(loaderRouteFor("/staff/dashboard").base).toBe("found");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/mascot-loader.test.ts`
Expected: FAIL — `/staff/dashboard` jatuh ke `search` (prefix `/dashboard` tidak cocok untuk `/staff/dashboard`; `/warga/dashboard` juga `search`)

- [ ] **Step 3: Write minimal implementation**

Ubah baris 36 `src/lib/mascot-loader.ts` menjadi:

```ts
if (pathname.startsWith("/dashboard") || pathname.startsWith("/warga/") || pathname.startsWith("/staff/")) {
  return { base: "found", tone: "public", caption: "Membuka dasbor…" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/mascot-loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mascot-loader.ts src/components/mascot-loader.test.ts
git commit -m "feat(dashboard): loader mascot covers warga/staff dashboard routes"
```

---

### Task 7: Rute privat baru masuk robots/sitemap/daftar rute

**Files:**
- Modify: `src/lib/sitemap.ts` (baris 68), `src/convex/http.ts` (baris 871), `src/lib/deploy-config.test.ts` (baris 50)

**Interfaces:**
- Consumes: daftar rute dari Task 5.
- Produces: crawler tetap diblokir dari kedua dashboard baru.

- [ ] **Step 1: Write the failing test**

Ubah baris 50 `src/lib/deploy-config.test.ts` dari:

```ts
for (const rute of ["/auth", "/dashboard", "/admin", "/v/:slug", "/invite/:token"]) {
```

menjadi:

```ts
for (const rute of ["/auth", "/dashboard", "/warga/dashboard", "/staff/dashboard", "/admin", "/v/:slug", "/invite/:token"]) {
```

(Lihat isi test dulu: pola repo — test ini kemungkinan menegaskan rute privat masuk robots/sitemap. Baca testnya, ikuti polanya persis; bila test justru menegaskan daftar TERTUTUP, tambah kedua rute ke sisi yang benar.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/lib/deploy-config.test.ts`
Expected: FAIL (rute baru belum dikenal di mana pun)

- [ ] **Step 3: Write minimal implementation**

`sitemap.ts` baris 68, tambah dua baris persis di bawahnya:

```ts
"Disallow: /warga/dashboard",
"Disallow: /staff/dashboard",
```

`http.ts` baris 871, ubah array menjadi:

```ts
: ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /dashboard", "Disallow: /warga/dashboard", "Disallow: /staff/dashboard", "Disallow: /auth", ""].join("\n"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/lib/deploy-config.test.ts src/lib/listing-metadata.test.ts`
Expected: PASS (`listing-metadata.test.ts:120` menegaskan `/admin`, `/dashboard`, `/auth`, `/invite` terlarang — tidak tersentuh karena `/dashboard` tetap ada sebagai redirect)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sitemap.ts src/convex/http.ts src/lib/deploy-config.test.ts
git commit -m "feat(dashboard): keep new dashboard routes out of crawlers and sitemap"
```

---

### Task 8: ProfileDialog tema-publik

**Files:**
- Create: `src/components/profile-dialog.tsx`
- Test: `src/components/profile-dialog.test.ts`

**Interfaces:**
- Consumes: `api.users.myProfile`, `api.users.updateMyProfile`, `api.users.generateProfileUploadUrl`, `api.storage.recordUploadedBlob`, `api.storage.lookupBlobBySha`, `uploadWithDedup` + `MAX_IMAGE_LABEL` + `formatBytes` (`@/lib/image-upload`), `focusRing` (`@/lib/focus-ring`). Pola state disalin dari `AdminProfileDialog` (`src/components/admin-profile.tsx:56-186`): isi-ulang-saat-render (bukan `useEffect`), `removePhoto` sebagai niat eksplisit, `pending` storage id.
- Produces: `ProfileDialog({ open, onOpenChange })` — dipakai Task 9. Peran warga (`role: null`) tampil sebagai teks `"Warga"`.

Verifikasi prasyarat (JALANKAN DULU, tanpa mengubah apa pun):

```bash
grep -o "export function Dialog[A-Za-z]*" src/components/ui/dialog.tsx
```

Expected: `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription` (dan mungkin lain). Task ini memakai keempatnya; bila `DialogContent` tidak ada, STOP dan laporkan — jangan mengarang pengganti.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./profile-dialog.tsx", import.meta.url), "utf8");

test("dialog terkendali pemanggil + mutation profil existing", () => {
  expect(src).toContain("export function ProfileDialog");
  expect(src).toContain("open: boolean");
  expect(src).toContain("onOpenChange: (open: boolean) => void");
  expect(src).toContain("api.users.myProfile");
  expect(src).toContain("api.users.updateMyProfile");
  expect(src).toContain("uploadWithDedup(");
  expect(src).toContain("setPending(result.storageId)");
});

test("tema publik, bukan tema admin", () => {
  expect(src).toContain('from "@/components/ui/dialog"');
  expect(src).toContain("<DialogContent");
  expect(src).toContain("focusRing");
  expect(src).not.toContain("admin-dialog");
  expect(src).not.toContain("admin-input");
  expect(src).not.toContain("admin-btn");
  expect(src).not.toContain("border-[#121212]");
});

test("menghapus foto niat eksplisit; email read-only", () => {
  expect(src).toContain("removeImage: removePhoto ? true : undefined");
  expect(src).toContain("{profile?.email}");
  expect(src).toContain("Email tidak bisa diubah di sini.");
});

test("warga tanpa peran tetap punya label", () => {
  expect(src).toContain('"Warga"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/profile-dialog.test.ts`
Expected: FAIL with ENOENT

- [ ] **Step 3: Write minimal implementation**

Cerminkan `AdminProfileDialog` state-per-state (wasOpen refill, pending, shaPending + lookup skip, removePhoto, picked, error/notice/busy, fileRef, pickPhoto via `uploadWithDedup`, save via `updateProfile`), dengan perbedaan TAMPILAN berikut (dan hanya ini):

- Pembungkus: `<Dialog><DialogContent className="max-w-[calc(100%-1.5rem)] rounded-2xl border-slate-200 bg-white p-0 shadow-xl sm:max-w-md">` (mengikuti pola `error-report-dialog.tsx:152`).
- Header: eyebrow `"Akun"` + `<DialogTitle>Profil saya</DialogTitle>` + deskripsi `"Nama dan foto profil..."` + `"Email tidak bisa diubah di sini."`.
- Avatar: `size-16 rounded-xl border border-slate-200 bg-blue-50`, inisial dihitung persis seperti `admin-profile.tsx:121-126`.
- Label peran: `{profile?.role ? staffRoleLongLabel(profile.role) : "Warga"}` (import dari `@/lib/select-options`, sama seperti admin-profile).
- Input nama: `min-h-12 rounded-lg border border-slate-300 bg-white px-3` + `focusRing`, `maxLength={80}`, `aria-describedby`.
- Tombol: `Button` shadcn (`@/components/ui/button`) varian default + outline; error `role="alert"`, notice `role="status"`.
- `min-h-12` di semua tombol; `safe-area` bottom via `pb-[max(1rem,env(safe-area-inset-bottom))]` pada konten.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/profile-dialog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/profile-dialog.tsx src/components/profile-dialog.test.ts
git commit -m "feat(account): public-theme profile dialog reusing profile mutations"
```

---

### Task 9: AccountMenu (button avatar + dropdown 3 item)

**Files:**
- Create: `src/components/account-menu.tsx`
- Test: `src/components/account-menu.test.ts`

**Interfaces:**
- Consumes: `useAuth` (`@/hooks/use-auth`: `isLoading`, `isAuthenticated`, `user`, `signOut`), `useCurrentAccess` tidak langsung (lewat `useDashboardTarget`, Task 2), `ProfileDialog` (Task 8), `myProfile` via `useQuery(api.users.myProfile, {})` untuk avatar (langganan Convex yang sama dengan dialog — bukan request ganda), `focusRing`, `DropdownMenu*` (`@/components/ui/dropdown-menu`), `useNavigate` (`react-router`).
- Produces: `AccountMenu()` — dipakai Task 10. Saat anonim me-render `null` (TopNav menampilkan CTA existing).

Verifikasi prasyarat:

```bash
grep -o "export function DropdownMenu[A-Za-z]*" src/components/ui/dropdown-menu.tsx
```

Expected: memuat `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (pakai keempatnya; bila `DropdownMenuSeparator` ada, pakai sebagai pemisah sebelum Keluar; bila tidak ada, lewati — JANGAN buat sendiri).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./account-menu.tsx", import.meta.url), "utf8");

test("tepat tiga item: Dashboard, Profil, Keluar", () => {
  expect(src).toContain("<span>Dashboard</span>");
  expect(src).toContain("<span>Profil</span>");
  expect(src).toContain("<span>Keluar</span>");
  expect(src).toContain("<DropdownMenuItem");
});

test("Dashboard role-aware; loading menonaktifkan", () => {
  expect(src).toContain("useDashboardTarget()");
  expect(src).toContain("aria-label={`Menu akun");
  expect(src).toContain("disabled");
});

test("Profil membuka dialog; Keluar signOut lalu ke beranda", () => {
  expect(src).toContain("setProfileOpen(true)");
  expect(src).toContain("await signOut()");
  expect(src).toContain('navigate("/")');
});

test("dialog hidup DI LUAR DropdownMenu (pelajaran admin-profile)", () => {
  const menuEnd = src.indexOf("</DropdownMenu>");
  const dialogIndex = src.indexOf("<ProfileDialog");
  expect(menuEnd).toBeGreaterThan(-1);
  expect(dialogIndex).toBeGreaterThan(menuEnd);
});

test("tema publik + target sentuh + tanpa kelas admin", () => {
  expect(src).toContain("focusRing");
  expect(src).toContain("min-h-12");
  expect(src).not.toContain("admin-");
  expect(src).not.toContain("border-[#121212]");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/account-menu.test.ts`
Expected: FAIL with ENOENT

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useState } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardTarget } from "@/hooks/use-dashboard-target";
import { focusRing } from "@/lib/focus-ring";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileDialog } from "@/components/profile-dialog";

/**
 * Menu akun di header publik (kanan atas) untuk sesi login.
 *
 * Anonim → null (pemanggil menampilkan CTA publiknya sendiri).
 * Dialog profil dirender DI LUAR <DropdownMenu>: menutup menu tidak boleh
 * mencabut dialog (pelajaran `AdminProfileTrigger` — lihat
 * `src/components/admin-profile.tsx:329-362`).
 */
export function AccountMenu() {
  const { isLoading, isAuthenticated, user, signOut } = useAuth();
  const target = useDashboardTarget();
  const profile = useQuery(api.users.myProfile, {});
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  if (isLoading) {
    return (
      <span
        role="status"
        aria-label="Memuat menu akun"
        className="block h-12 w-12 rounded-full bg-slate-200 motion-safe:animate-pulse"
      />
    );
  }
  if (!isAuthenticated) return null;

  const displayName = profile?.name?.trim() || user?.name?.trim() || user?.email?.split("@")[0] || "Akun";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Menu akun ${displayName}`}
          className={`flex min-h-12 min-w-0 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm hover:border-blue-300 hover:bg-blue-50 ${focusRing}`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-sm font-black text-white">
            {profile?.imageUrl ? (
              <img src={profile.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              initials || <UserRound className="size-5" aria-hidden="true" />
            )}
          </span>
          <span className="hidden max-w-28 truncate text-sm font-extrabold text-slate-800 min-[420px]:inline">
            {displayName}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem disabled={target === null} asChild={target !== null}>
            {target === null ? (
              <span className="flex min-h-12 items-center gap-2"><span>Dashboard</span></span>
            ) : (
              <a href={target} className="flex min-h-12 items-center gap-2">
                <LayoutDashboard className="size-4" aria-hidden="true" />
                <span>Dashboard</span>
              </a>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setProfileOpen(true)} className="min-h-12">
            <UserRound className="size-4" aria-hidden="true" />
            <span>Profil</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleSignOut()} className="min-h-12">
            <LogOut className="size-4" aria-hidden="true" />
            <span>Keluar</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
```

CATATAN EKSEKUTOR: `asChild` + `disabled` bersamaan tidak valid di Radix — draf di atas
menanganinya via cabang kondisional (span saat loading, anchor saat siap). Bila typecheck
menolak prop `asChild` kondisional, sederhanakan: selalu render anchor, dan saat
`target === null` render `<span>` TANPA `asChild` (persis seperti cabang di atas). Jangan
menambah prop baru.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/account-menu.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/account-menu.tsx src/components/account-menu.test.ts
git commit -m "feat(account): header account menu with role-aware dashboard item"
```

---

### Task 10: TopNav memakai AccountMenu saat login

**Files:**
- Modify: `src/pages/Landing.tsx` (`TopNav`, baris 117–163: tambah import `useAuth` + `AccountMenu`, CTA jadi kondisional)
- Test: `src/pages/landing-shell.test.ts` (tambah kasus; baca dulu polanya — JANGAN ubah test existing, hanya tambah)

**Interfaces:**
- Consumes: `AccountMenu` (Task 9), `useAuth` (`@/hooks/use-auth`).
- Produces: header kanan atas = `AccountMenu` bila login, CTA "Cari jasa" bila anonim/tanpa sesi.

- [ ] **Step 1: Write the failing test**

Baca `src/pages/landing-shell.test.ts` terlebih dulu, ikuti idiomnya persis (readFileSync atas `Landing.tsx`). Tambahkan test:

```ts
test("header login memakai AccountMenu, anonim tetap CTA", () => {
  const landing = readFileSync(new URL("./Landing.tsx", import.meta.url), "utf8");
  expect(landing).toContain("<AccountMenu");
  expect(landing).toContain("useAuth()");
  expect(landing).toContain("Cari jasa");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/landing-shell.test.ts`
Expected: FAIL (Landing.tsx belum menyebut AccountMenu)

- [ ] **Step 3: Write minimal implementation**

Di `TopNav` (`Landing.tsx:117`): tambah di atas komponen:

```tsx
import { useAuth } from "@/hooks/use-auth";
import { AccountMenu } from "@/components/account-menu";
```

Di dalam `TopNav`, baris pertama badan fungsi:

```tsx
const { isAuthenticated } = useAuth();
```

Ganti blok CTA (baris 152–159, anchor `header-cta` "Cari jasa") menjadi kondisional:

```tsx
{isAuthenticated ? (
  <AccountMenu />
) : (
  <a
    href="#katalog"
    aria-label="Cari jasa"
    className="header-cta inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-base font-extrabold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 lg:px-5"
  >
    <Search className="size-4 shrink-0" aria-hidden="true" />
    <span className="hidden min-[420px]:inline">Cari jasa</span>
  </a>
)}
```

Markup CTA byte-identik dengan sebelumnya (hanya dibungkus kondisi) — anonim tidak melihat perubahan apa pun.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/landing-shell.test.ts`
Expected: PASS (test lama + baru)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Landing.tsx src/pages/landing-shell.test.ts
git commit -m "feat(account): public header shows account menu when signed in"
```

---

### Task 11: StaffDashboard (halaman ringkas, read-only)

**Files:**
- Create: `src/pages/StaffDashboard.tsx`
- Test: `src/pages/staff-dashboard.test.ts`

**Interfaces:**
- Consumes: `useCurrentAccess`, `useAdminVendors`, `useReviewQueue`, `useOpenReports`, `useCommunityMetrics` (semua di `@/lib/catalog-store`), `staffRoleLongLabel` (`@/lib/select-options`), `Card` (`@/components/ui/card`), `focusRing`. Gate `RequireStaffGate` + `RequireAuth` dipasang di rute (Task 5) — halaman mengasumsikan akses lolos, TETAP null-safe saat loading.
- Produces: default export `StaffDashboard` — melengkapi rute Task 5 (sampai task ini, `typecheck`/`build` merah; setelah task ini harus hijau).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const src = readFileSync(new URL("./StaffDashboard.tsx", import.meta.url), "utf8");

test("empat kartu ringkas seragam + tautan workspace", () => {
  expect(src).toContain("export default function StaffDashboard");
  expect(src).toContain('to="/admin"');
  expect(src).toContain("useAdminVendors");
  expect(src).toContain("useReviewQueue");
  expect(src).toContain("useOpenReports");
  expect(src).toContain("staffRoleLongLabel");
});

test("read-only: tanpa mutasi", () => {
  expect(src).not.toContain("useMutation");
  expect(src).not.toContain("useCatalogActions");
});

test("kartu h-full + tanpa kelas admin", () => {
  expect(src).toContain("h-full");
  expect(src).not.toContain("admin-");
  expect(src).not.toContain("border-[#121212]");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/staff-dashboard.test.ts`
Expected: FAIL with ENOENT

- [ ] **Step 3: Write minimal implementation**

Halaman penuh (kerangka wajib — eksekutor menulis lengkap mengikuti pola di bawah):

```tsx
import { Link } from "react-router";
import { Archive, ClipboardList, FileEdit, Inbox, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminVendors, useCommunityMetrics, useCurrentAccess, useOpenReports, useReviewQueue } from "@/lib/catalog-store";
import { staffRoleLongLabel } from "@/lib/select-options";
import { focusRing } from "@/lib/focus-ring";

const cardClass = "h-full border-slate-200 bg-white shadow-sm";
const statGrid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";

export default function StaffDashboard() {
  const access = useCurrentAccess();
  const items = useAdminVendors() ?? [];
  const reports = useOpenReports() ?? [];
  const reviewQueue = useReviewQueue();
  const metrics = useCommunityMetrics();
  // ... hitung draftItems/archivedItems dari items (status ?? "active"),
  // kartu: Draft menunggu (FileEdit), Diarsipkan (Archive), Antrean review (Inbox, reviewQueue?.length ?? skeleton), Laporan terbuka (ShieldCheck),
  // hero: "Halo, {staffRoleLongLabel(access?.role ?? 'staff')}" + tombol primer ke /admin "Buka workspace",
  // daftar perlu-tindakan maks 5 → link /admin#admin-triage,
  // loading (access === undefined atau query undefined) → skeleton seukuran kartu final.
}
```

Aturan keras: tiap kartu `Card className={cardClass + " flex flex-col"}` dengan header–body(`flex-1`)–footer; angka `0` dirender sebagai `"0"` (jangan sembunyikan kartu); skeleton memakai `role="status"` + `motion-safe:animate-pulse`; semua link `focusRing` + `min-h-12`. Setiap variabel yang dideklarasikan (termasuk `metrics`, `reviewQueue`, `access`) HARUS terpakai di render — hapus yang tidak terpakai, jangan biarkan `lint`/`typecheck` merah.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/staff-dashboard.test.ts src/pages/dashboard-routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/StaffDashboard.tsx src/pages/staff-dashboard.test.ts
git commit -m "feat(dashboard): read-only staff overview linking to admin workspace"
```

---

### Task 12: Modernisasi seragam (kartu 4-kolom + filled-state + quick access 4 item)

**Files:**
- Create: `src/components/empty-state-card.tsx` (+ tidak perlu test file sendiri — dikunci via test Task ini di bawah)
- Modify: `src/pages/WargaDashboard.tsx`, `src/pages/StaffDashboard.tsx`
- Test: `src/components/dashboard-uniformity.test.ts` (baru; membaca ketiga berkas)

**Interfaces:**
- Consumes: `Card` (ui), `BrandMascot` (`@/components/brand-mascot`: `state`, `size="xs"`, `animated={false}`), `GlassIcons` (`@/components/react-bits`), `Counter`.
- Produces: `EmptyStateCard({ title, body, actionLabel, onAction })` — bingkai `h-full` sama tinggi dengan kartu berisi.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const warga = readFileSync(new URL("../pages/WargaDashboard.tsx", import.meta.url), "utf8");
const staff = readFileSync(new URL("../pages/StaffDashboard.tsx", import.meta.url), "utf8");
const empty = readFileSync(new URL("./empty-state-card.tsx", import.meta.url), "utf8");

test("grid statistik 4 kolom di xl pada kedua dashboard", () => {
  expect(warga).toContain("sm:grid-cols-2 xl:grid-cols-4");
  expect(staff).toContain("sm:grid-cols-2 xl:grid-cols-4");
});

test("empty state memakai bingkai seragam, bukan dashed raksasa", () => {
  expect(empty).toContain("export function EmptyStateCard");
  expect(empty).toContain("h-full");
  expect(warga).toContain("<EmptyStateCard");
  expect(staff).toContain("<EmptyStateCard");
  // Dua dashed box yang diganti (string persis dari berkas saat ini):
  // favorit kosong `border-dashed border-slate-300 bg-white shadow-none`,
  // listing kosong `border border-dashed border-slate-300 bg-slate-50`.
  // Input foto owner (`border border-dashed border-slate-300 bg-white`, tanpa
  // `bg-slate-50`/`shadow-none`) SENGAJA dipertahankan — bukan empty state.
  expect(warga).not.toContain("border-dashed border-slate-300 bg-white shadow-none");
  expect(warga).not.toContain("border border-dashed border-slate-300 bg-slate-50");
});

test("quick access minimal 4 item", () => {
  const wargaItems = (warga.match(/label: "/g) ?? []).length;
  expect(wargaItems).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/dashboard-uniformity.test.ts`
Expected: FAIL with ENOENT (`empty-state-card.tsx` belum ada)

- [ ] **Step 3: Write minimal implementation**

`EmptyStateCard` (baru):

```tsx
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BrandMascot } from "@/components/brand-mascot";
import { focusRing } from "@/lib/focus-ring";

export function EmptyStateCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card className="flex h-full flex-col border-slate-200 bg-white shadow-sm">
      <CardContent className="flex flex-1 flex-col items-center py-8 text-center">
        <BrandMascot state="empty" size="xs" animated={false} className="mx-auto" />
        <p className="mt-4 text-lg font-black text-slate-950">{title}</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-600">{body}</p>
        <ButtonAction label={actionLabel} onAction={onAction} />
      </CardContent>
    </Card>
  );
}

function ButtonAction({ label, onAction }: { label: string; onAction: () => void }) {
  return (
    <button
      type="button"
      onClick={onAction}
      className={`mt-4 inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
    >
      {label}
    </button>
  );
}
```

(`ReactNode` import dihapus bila tak terpakai — JANGAN biarkan import mati; `typecheck` + `lint` Task 13 menangkapnya.)

`WargaDashboard.tsx`:

1. Grid statistik (baris ~622): `grid gap-4 sm:grid-cols-3` → `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`; kartu ke-3 ("Mulai lagi") ditulis ulang jadi kartu penuh (ikon + title + `Counter`-style angka + footer link), dan TAMBAH kartu ke-4 "Listing saya" (`useOwnerVendors().length`, footer link scroll ke `#listing-saya`). Keempat kartu: `Card className="flex h-full flex-col ..."`, body `flex-1`.
2. `GlassIcons` akses cepat: 2 item → 4 item (tambah `{ label: "Permintaan", ... onClick: scroll ke board permintaan }`, `{ label: "Favorit", ... onClick: scroll ke #favorit-saya }`); tambah `id="favorit-saya"` + `scroll-mt-6` pada section daftar tersimpan.
3. Empty favorit + empty listing owner: ganti `Card border-dashed` raksasa → `<EmptyStateCard title body actionLabel onAction={...sama dengan tombol lama} />` (aksi identik: favorit → `navigate("/#katalog")`; listing → `startNew()`).
4. Kontainer (baris ~592): `max-w-6xl` → `max-w-7xl` (mengisi layar 1280 tanpa mengorbankan keterbacaan; satu-satunya ubahan lebar).

`StaffDashboard.tsx`: terapkan pola kartu yang sama (sudah 4 kartu dari Task 11 — pastikan `flex-col` + body `flex-1` + footer selaras; empty antrean/laporan → `EmptyStateCard`).

Batasan: `BorderGlow` intensitas ≤ 0.08 ( existing 0.08 dipertahankan, yang 0.12 di kartu katalog TIDAK disentuh — itu landing, di luar scope); `ShinyText` hanya angka hero; tanpa gradient/font/paket baru.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/dashboard-uniformity.test.ts`
Expected: PASS, lalu: `bunx vitest run src/components/admin-profile.test.ts src/pages/landing-shell.test.ts` (pola lama ikut hijau)

- [ ] **Step 5: Commit**

```bash
git add src/components/empty-state-card.tsx src/components/dashboard-uniformity.test.ts src/pages/WargaDashboard.tsx src/pages/StaffDashboard.tsx
git commit -m "feat(dashboard): uniform cards, filled empty states, 4-up stats grid"
```

---

### Task 13: Gerbang verifikasi penuh (wajib hijau sebelum klaim selesai)

**Files:** tidak ada (verifikasi + laporan; COMMIT HANYA bila ada perbaikan — stage file yang diperbaiki saja).

- [ ] **Step 1: Typecheck**

Run: `bun run typecheck`
Expected: PASS, nol error. (Task 5 + 11 meninggalkan ini merah di tengah jalan — di sinilah ia harus hijau.)

- [ ] **Step 2: Lint file yang disentuh**

Run: `bunx eslint src/lib/dashboard-target.ts src/hooks/use-dashboard-target.ts src/components/RequireStaffGate.tsx src/components/account-menu.tsx src/components/profile-dialog.tsx src/components/empty-state-card.tsx src/pages/WargaDashboard.tsx src/pages/StaffDashboard.tsx src/pages/Landing.tsx src/main.tsx src/lib/mascot-loader.ts src/lib/sitemap.ts src/convex/http.ts`
Expected: PASS, nol warning/error. Perbaiki hingga hijau (itu bagian task ini).

- [ ] **Step 3: Full test suite**

Run: `bun run test`
Expected: PASS seluruh suite, nol gagal. Kegagalan di test lama = regresi → perbaiki di task ini (atau laporkan sebagai temuan, JANGAN melemahkan test existing).

- [ ] **Step 4: Production build**

Run: `bun run build`
Expected: PASS (tsc -b + vite build).

- [ ] **Step 5: Review diff + matriks manual**

Run: `git status --short` dan `git diff --stat` — pastikan HANYA file plan ini yang berubah vs baseline (plus perbaikan Task ini bila ada). Verifikasi manual di browser (bukan klaim): 320 / 360 / 390 / 768 / 1024 / 1440px, dropdown keyboard (Tab→Enter, Esc, klik-di-luar), dialog simpan nama+foto, Keluar → `/`, `/dashboard` → `/warga/dashboard`, `/dashboard#listing-saya` → section, warga di `/staff/dashboard` → ditolak eksplisit, staff → lolos, reduced-motion, kontras. Tulis hasilnya sebagai checklist di pesan final (PASS / PASS WITH DEBT / BLOCKED — jangan mengubah ketidakpastian jadi PASS).

---

## Self-Review

**1. Spec coverage:** §3 rute → Task 4+5; hash preservasi → Task 5 (dari `community-notification-center.tsx:337`); §4.1 → Task 1+2; §4.2 → Task 9+10; §4.3 → Task 8; §4.4 → Task 11 (+Task 3 gate); §5 nol query baru → ditegakkan di test Task 3/11 (`not.toContain("useMutation")` untuk gate; staff page tanpa mutation); §6.1 kartu seragam/4-kolom/filled-state/quick-access → Task 12; §6.2 token/shadow/glow → Task 12 batasan; §6.3 responsif → Task 12 + matriks Task 13; §7 edge → Task 3 (warga ditolak), Task 5 (hash), Task 8 (foto gagal); §8 testing → tiap task + Task 13; §10 non-tujuan → tidak ada task menyentuh `/admin`, auth, Convex backend. File collateral (`mascot-loader`, robots/sitemap, `admin-profile.test` path) → Task 4/6/7. Referensi `/dashboard` lain (footer, access-gate, InviteAcceptance, notification href, Landing CTA) SENGAJA tak diubah — redirect membuat semuanya tetap bekerja.

**2. Placeholder scan:** tidak ada TBD/TODO/"nanti"; tiap langkah berisi kode/perintah/asert aktual; satu-satunya cabang kondisional yang jujur adalah catatan `asChild` Task 9 (instruksi deterministik bila typecheck menolak, bukan placeholder). Asersi `border-dashed` Task 12 memakai string persis dari berkas saat ini dan pengecualian input-foto didokumentasikan.

**3. Type consistency:** `dashboardTargetFor` signature identik di Task 1 (definisi), Task 2 (pemakaian), dan test Task 1; `ProfileDialog({ open, onOpenChange })` identik di Task 8 (definisi) dan Task 9 (pemakaian + test posisi); `RequireStaffGate({ children })` identik di Task 3 dan Task 5; `EmptyStateCard({ title, body, actionLabel, onAction })` identik di Task 12 definisi dan pemakaian.
