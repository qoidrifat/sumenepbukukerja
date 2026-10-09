# Admin Sidebar Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pecah halaman `/admin` yang monolit menjadi 5 halaman per section di bawah sidebar baru, tanpa mengubah tema, authz, maupun perilaku tiap panel.

**Architecture:** `AdminGate` tetap di route induk `/admin`; children route me-render `AdminShell` (sidebar + `<Outlet/>`); tiap halaman memanggil hook data `catalog-store` yang sudah ada langsung (tidak lewat `Admin.tsx`); komponen panel dipindah tanpa diubah isinya.

**Tech Stack:** React 19, React Router (nested routes + `Outlet`, `NavLink`), Convex (`convex/react`), Vitest source-content tests, Tailwind + token admin (`.admin-*`).

**Spec:** Persetujuan pemilik 2026-10-08 — IA 5 halaman (Ringkasan, Katalog, Moderasi, Keamanan, Sistem); tema tidak berubah; migrasi satu section per commit; `/admin` tetap sebagai overview; authz tetap server-side. Bukti repo dirujuk per task.

## Global Constraints

- Tema admin TIDAK berubah: hanya token `.admin-*` dan palet yang dikunci `admin-theme-contract.test.ts`; tidak ada warna/border/shadow baru.
- Sidebar dibuat kustom dengan token admin; JANGAN pakai `src/components/ui/sidebar.tsx` (shadcn, tidak terpakai di `src/`, style default-nya di luar kontrak tema).
- Authz tetap server-side; sidebar hanya menyembunyikan menu (UX), tidak menggantikan guard.
- Satu section per commit; tiap task menghasilkan halaman yang bisa dibuka dan diuji sendiri.
- TDD: test gagal dulu, saksikan gagal, implementasi minimal, saksikan lolos.
- Setiap route baru didaftarkan di test kontrak rute yang sudah ada; tidak ada rute tanpa test.
- Verifikasi akhir: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` — semua segar.

## IA yang dikunci

| Route | Isi (komponen existing, dipindah utuh) | Data (hook existing) |
|---|---|---|
| `/admin` | Ringkasan: `AdminWorkspaceHero`, papan aksi, catatan terakhir | `useAdminVendors`, `useOpenReports`, `useCommunityMetrics` |
| `/admin/katalog` | Triase vendor + editor + `AdminPackageManager` | `useAdminVendors`, `useCatalogActions`, `useImageUpload` |
| `/admin/moderasi` | Antrean review + `AdminReportReview` | `useReviewQueue`, `useOpenReports` |
| `/admin/keamanan` | `AdminSessionActions`, `AdminSecurityLog`, `AdminErrorReports`, `AdminAuditLog` | hook `catalog-store` security (sudah ada, `enabled` per visibility) |
| `/admin/sistem` | `AdminMetricsBoard`, peran + invite (`AdminGovernance` bagian peran) | `useCommunityMetrics`, `useCurrentAccess` |

---

## File Structure

- Create: `src/pages/admin/AdminShell.tsx` — layout sidebar + `<Outlet/>`, satu-satunya komponen visual baru; memakai `AdminHeader` yang sudah ada di atasnya.
- Create: `src/pages/admin/OverviewPage.tsx`, `KatalogPage.tsx`, `ModerasiPage.tsx`, `KeamananPage.tsx`, `SistemPage.tsx` — komposisi ulang komponen existing + hook data per halaman.
- Create: `src/components/admin-sidebar.tsx` — item navigasi (`NavLink`, token admin, `aria-current="page"`).
- Create: `src/pages/admin/admin-routes.test.ts` — kontrak IA: setiap route me-render halaman yang benar, sidebar memuat 5 item, item peran hanya untuk owner.
- Modify: `src/main.tsx:366-369` — nested routes di bawah `/admin` (parent tetap `<Admin />` = gate).
- Modify: `src/lib/deploy-config.test.ts:50` — tambah 4 route baru ke daftar.
- Modify: `src/pages/dashboard-routes.test.ts` — tambah route baru.
- Modify: `src/components/admin-theme-contract.test.ts` — tambah file baru ke `ADMIN_SOURCES`.
- Modify: `src/pages/Admin.tsx` — susut menjadi gate + redirect kompatibilitas (anchor lama `#governance-title` → `/admin/moderasi`).

---

### Task 1: Shell + sidebar + halaman Sistem (vertical slice pertama)

**Files:**
- Create: `src/components/admin-sidebar.tsx`
- Create: `src/pages/admin/AdminShell.tsx`
- Create: `src/pages/admin/SistemPage.tsx`
- Create: `src/pages/admin/admin-routes.test.ts`
- Modify: `src/main.tsx:366-369`
- Modify: `src/lib/deploy-config.test.ts:50`
- Test: `src/pages/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: `AdminHeader` (`src/components/admin-workspace.tsx:91`), `AdminMetricsBoard` (`src/components/admin-metrics-board.tsx`), `useCommunityMetrics` + `useCurrentAccess` (`src/lib/catalog-store.ts`), `ADMIN_SOURCES` (`admin-theme-contract.test.ts`).
- Produces: `AdminSidebar({items}: {items: Array<{to: string; label: string; icon: LucideIcon; visible: boolean}>})`; `AdminShell` me-render `<div className="admin-workspace">` + `<AdminSidebar/>` + `<Outlet/>`; route `/admin/sistem` aktif dan menampilkan metrik. `visible` untuk item Peran dihitung dari `useCurrentAccess().canManageRoles` — sembunyi = UX saja, guard tetap server.

- [ ] **Step 1: Write the failing test**

```typescript
test("route /admin/sistem terdaftar dan sidebar memuat 5 item", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="sistem"');
  const shell = readFileSync("src/pages/admin/AdminShell.tsx", "utf8");
  for (const label of ["Ringkasan", "Katalog", "Moderasi", "Keamanan", "Sistem"]) {
    expect(shell).toContain(label);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: FAIL with "no such file" (file belum ada).

- [ ] **Step 3: Write minimal implementation**

Buat `admin-sidebar.tsx` (nav + `NavLink` + `aria-current`), `AdminShell.tsx` (div `.admin-workspace` + sidebar + Outlet), `SistemPage.tsx` (pindahkan blok `AdminMetricsBoard` + hook metrik dari `Admin.tsx:858-864` apa adanya). Daftarkan nested routes di `main.tsx` di bawah `path="/admin"`. Tambah `/admin/sistem` ke daftar `deploy-config.test.ts:50`. Tambah ketiga file baru ke `ADMIN_SOURCES` di theme-contract test.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin-sidebar.tsx src/pages/admin/ src/main.tsx src/lib/deploy-config.test.ts src/components/admin-theme-contract.test.ts
git commit -m "feat(admin): sidebar shell and /admin/sistem page"
```

### Task 2: Halaman Keamanan (pindah utuh)

**Files:**
- Create: `src/pages/admin/KeamananPage.tsx`
- Modify: `src/pages/admin/admin-routes.test.ts`
- Modify: `src/lib/deploy-config.test.ts:50`
- Test: `src/pages/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: `AdminSessionActions`, `AdminSecurityLog open={...}`, `AdminErrorReports`, `AdminAuditLog` + hook security `catalog-store` (pola `open`/`enabled` dari Task 1 dan `admin-governance.tsx:294-307` — perilaku visibility gating TIDAK berubah).
- Produces: route `/admin/keamanan` menampilkan keempat panel dengan langganan yang sama persis seperti sekarang.

- [ ] **Step 1: Write the failing test**

```typescript
test("route /admin/keamanan me-render panel sesi, security log, error, dan audit", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="keamanan"');
  const page = readFileSync("src/pages/admin/KeamananPage.tsx", "utf8");
  for (const name of ["AdminSessionActions", "AdminSecurityLog", "AdminErrorReports", "AdminAuditLog"]) {
    expect(page).toContain(name);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: FAIL with "no such file".

- [ ] **Step 3: Write minimal implementation**

Pindahkan blok governance bagian keamanan dari `admin-governance.tsx:271-307` ke `KeamananPage.tsx` tanpa mengubah logika hook; pertahankan state `securityOpen` dan teruskan `open` ke `AdminSecurityLog`. Daftarkan route + update daftar deploy-config.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/KeamananPage.tsx src/pages/admin/admin-routes.test.ts src/lib/deploy-config.test.ts
git commit -m "feat(admin): move security panels to /admin/keamanan"
```

### Task 3: Halaman Moderasi (pindah utuh)

**Files:**
- Create: `src/pages/admin/ModerasiPage.tsx`
- Modify: `src/pages/admin/admin-routes.test.ts`
- Modify: `src/lib/deploy-config.test.ts:50`
- Test: `src/pages/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: `AdminReportReview` (`Admin.tsx:949-955`), `useReviewQueue`, `useOpenReports`, `updateReportStatus` + `busyAction` (pola dari `Admin.tsx` — pindahkan hook-nya ke halaman, jangan duplikasi logika).
- Produces: route `/admin/moderasi` dengan antrean + review laporan yang berfungsi identik.

- [ ] **Step 1: Write the failing test**

```typescript
test("route /admin/moderasi me-render antrean review dan review laporan", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="moderasi"');
  const page = readFileSync("src/pages/admin/ModerasiPage.tsx", "utf8");
  expect(page).toContain("AdminReportReview");
  expect(page).toContain("useReviewQueue");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: FAIL with "no such file".

- [ ] **Step 3: Write minimal implementation**

Pindahkan blok antrean + `AdminReportReview` ke `ModerasiPage.tsx` beserta hook datanya. Badge antrean di `AdminHeader` (`reviewQueue` prop) tetap dihitung di shell agar terlihat di semua halaman — teruskan dari `AdminShell`, bukan per halaman.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/ModerasiPage.tsx src/pages/admin/admin-routes.test.ts src/lib/deploy-config.test.ts
git commit -m "feat(admin): move moderation queue to /admin/moderasi"
```

### Task 4: Halaman Katalog (pindah besar) + Ringkasan ramping

**Files:**
- Create: `src/pages/admin/KatalogPage.tsx`
- Create: `src/pages/admin/OverviewPage.tsx`
- Modify: `src/pages/Admin.tsx` (susut: gate + overview composition + redirect kompatibilitas)
- Modify: `src/pages/admin/admin-routes.test.ts`, `src/lib/deploy-config.test.ts:50`
- Test: `src/pages/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: seluruh blok vendor/triase/editor dari `Admin.tsx:237-260, 866-1572` (state `draft`, `photo`, `notice`, `error`, `saving`, handler `startNew`, `updateVendor`, dst. — pindah utuh, jangan refactor isinya).
- Produces: `/admin/katalog` = triase + editor + `AdminPackageManager` yang berfungsi identik; `/admin` = `AdminWorkspaceHero` + papan aksi + catatan; anchor lama `#governance-title` di-redirect ke `/admin/moderasi`.

- [ ] **Step 1: Write the failing test**

```typescript
test("route /admin/katalog dan overview terdaftar dengan isi yang benar", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  expect(main).toContain('path="katalog"');
  expect(readFileSync("src/pages/admin/KatalogPage.tsx", "utf8")).toContain("AdminPackageManager");
  expect(readFileSync("src/pages/admin/OverviewPage.tsx", "utf8")).toContain("AdminWorkspaceHero");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: FAIL with "no such file".

- [ ] **Step 3: Write minimal implementation**

Pindahkan blok triase/editor ke `KatalogPage.tsx`; susutkan `Admin.tsx` menjadi gate + `OverviewPage`. Redirect kompatibilitas: link badge antrean di `AdminHeader` yang tadinya `href="#governance-title"` (`admin-workspace.tsx:207`) menjadi `to="/admin/moderasi"`. DILARANG mengubah logika editor/validasi di task ini — murni pindah.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/KatalogPage.tsx src/pages/admin/OverviewPage.tsx src/pages/Admin.tsx src/components/admin-workspace.tsx src/pages/admin/admin-routes.test.ts src/lib/deploy-config.test.ts
git commit -m "feat(admin): move catalog triage to /admin/katalog, slim overview"
```

### Task 5: Mobile sidebar + keyboard + final verification

**Files:**
- Modify: `src/components/admin-sidebar.tsx` (responsif)
- Modify: `src/pages/admin/admin-routes.test.ts` (asersi pola responsif + aria)
- Test: `src/pages/admin/admin-routes.test.ts`

**Interfaces:**
- Consumes: pola mobile repo (grid `grid-cols-1`, `min-w-0`) dan `useIsMobile` (`src/hooks/use-mobile.ts`, sudah dipakai `ui/sidebar.tsx`).
- Produces: di bawah `sm`, sidebar menjadi drawer/hamburger dengan `aria-expanded`, fokus kembali ke pemicu saat tutup (pola `admin-workspace.tsx:137-166`); semua item tetap `<NavLink>` (keyboard-native, tanpa handler klik kustom).

- [ ] **Step 1: Write the failing test**

```typescript
test("sidebar responsif dan aksesibel", () => {
  const sidebar = readFileSync("src/components/admin-sidebar.tsx", "utf8");
  expect(sidebar).toContain("aria-expanded");
  expect(sidebar).toContain("NavLink");
  // Item navigasi = link asli (keyboard-native); hanya tombol hamburger
  // yang boleh punya onClick, dan ia wajib berpasangan dengan aria-expanded.
  expect(sidebar).toContain("<button");
  const navBlock = sidebar.slice(sidebar.indexOf("<nav"), sidebar.indexOf("</nav>"));
  expect(navBlock).not.toContain("onClick");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: FAIL — `aria-expanded` belum ada.

- [ ] **Step 3: Write minimal implementation**

Tambah perilaku drawer mobile + `aria-expanded` + kembalikan fokus; tanpa mengubah tampilan desktop.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/pages/admin/admin-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Final verification + commit**

Run: `bun run test` (0 gagal), `bun run typecheck` (exit 0), `bun run lint` (0 error), `bun run build` (exit 0) — semua segar berurutan.

```bash
git add src/components/admin-sidebar.tsx src/pages/admin/admin-routes.test.ts
git commit -m "feat(admin): responsive accessible sidebar drawer"
```

## Self-Review

- Cakupan: Task 1 → shell/sidebar/sistem + kontrak rute/tema; Task 2 → keamanan; Task 3 → moderasi; Task 4 → katalog + overview + redirect; Task 5 → mobile/a11y + verifikasi akhir. IA 5 halaman terpetakan semua; tema/authz/TDD/verifikasi ada di Global Constraints dan dipakai tiap task.
- Placeholder: tidak ada TBD/TODO; setiap langkah punya file, kode, perintah, dan ekspektasi konkret.
- Konsistensi tipe: `AdminSidebar({items})` dengan `{to, label, icon, visible}` dipakai Task 1 dan tidak berubah di task lain; nama route `sistem/keamanan/moderasi/katalog` konsisten di test dan `main.tsx`; hook signature `catalog-store` tidak diubah di task mana pun.
