# I/O Budget Rules 1–13 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turunkan pemakaian Database I/O jauh di bawah 1 GB/bulan dan kunci agar tidak naik lagi, tanpa melemahkan rate-limit passcode, alur auth, maupun forensik Security Desk.

**Architecture:** Semua pembacaan user-facing diganti ke index-range + `take()` berplafon; angka dasbor dibaca dari counter; write panas jadi no-op bila tidak berubah; setiap tabel tumbuh-sendiri punya retensi; langganan panel ikut visibilitas. Tidak ada perubahan visual.

**Tech Stack:** Convex (query/mutation/action, `convex-test`), TypeScript, Vitest, React (`convex/react`).

**Spec:** Paket 1–13 yang disetujui pemilik pada 2026-10-08 (aturan dikutip utuh di Global Constraints) + bukti repo yang dirujuk per task di bawah.

## Global Constraints

- TDD penuh: tulis test gagal dulu, saksikan gagal, implementasi minimal, saksikan lolos, refactor. Tanpa pengecualian tanpa izin pemilik.
- Aturan 1: Tanpa pemindaian penuh di query user-facing — semua baca user memakai indeks-rentang + `take()` berplafon terdokumentasi (preseden: `REPORT_SCAN` di `src/convex/community.ts:1444`, `ADMIN_LISTING_SCAN` di `src/convex/vendors.ts:521`).
- Aturan 2: Write heartbeat dilarang membangunkan pembaca berat — (a) guard server-side: lewati patch bila `lastSeenAt` masih segar; (b) interval 60 dtk → 300 dtk + ambang basi disesuaikan; (c) pembaca presence berat pindah ke query ringan `listAdminPresence` yang sudah ada.
- Aturan 3: Setiap tabel tumbuh-sendiri wajib punya retensi — tambah `adminPasscodeAttempts` (±30–90 hari), presence basi, notifikasi lama ke `pruneApplicationHistory` + `RETENTION_LIMITS` + test pengunci angka. KUNCI: default retensi attempts tetap 30 hari / 500 baris (`src/convex/adminGate.ts:1171-1181`); naik ke 90 hari HANYA atas instruksi eksplisit pemilik.
- Aturan 4: Tanpa N+1 di daftar — batch/cache enrichment audit & status sesi per panggilan, atau pindahkan foto/URL ke pemuatan detail.
- Aturan 5: Langganan panel ikut visibilitas — handoff/summary/security hanya subscribe saat section-nya terbuka/menjadi fokus (`enabled` sudah didukung hook di `src/lib/catalog-store.ts:905-929`).
- Aturan 6: Proyeksi disiplin — kembalikan hanya field yang dirender; detail 40-field pindah ke pemuatan per-baris.
- Aturan 7: Agregat dari counter, bukan `collect()` + `.length`. Angka dasbor WAJIB dibaca dari dokumen counter. Pola counter hidup: `analyticsCounters`, `whatsappDeliveryStats`, ringkasan harian.
- Aturan 8: Dev ikut diet — limit team-scoped (TERVERIFIKASI). Perbaiki error yang spam di dev; jangan load-test/benchmark berulang ke dev; cron dev seperlunya.
- Aturan 9: Satu cron bersih-bersih, off-peak, berplafon — `crons.ts` sudah rapi (jam tersebar, batch plafon, idempoten); tersisa audit tumpang-tindih, bukan konsolidasi.
- Aturan 10: Tulis hanya bila berubah — guard heartbeat digeneralisasi ke semua mutation panas: patch idempoten + no-op bila payload identik, dan deliveryKey/idempotency untuk aksi rawan klik-ganda.
- Aturan 11: Indeks lahir bersama query-nya; indeks mati dibuang. Setiap field filter/sort baru wajib membawa indeks komposit di commit yang sama. Audit indeks tak terpakai berkala.
- Aturan 12: Storage hygiene total — (a) semua jalur unggah lewat dedup (`uploadWithDedup`); (b) `pruneOrphanStorage` terjadwal (sudah ada, jam 5 UTC); (c) larangan `getUrl`/metadata storage per baris di daftar.
- Aturan 13: Ritual observasi — set warning threshold 70% di dashboard (email otomatis) + cek dasbor tiap Senin sebagai cadangan.
- Jangan sentuh: rate-limit passcode, alur auth, forensik Security Desk di luar jendela retensi yang disetujui.
- Setiap diff yang menyentuh `adminGate`/`access`/`errorReports` wajib lewat gate review `senior-security`.
- Standar kode: `clean-code` (fungsi kecil, tanpa magic number tanpa nama, tanpa komentar yang mengulang kode).
- Verifikasi akhir: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` — semua segar, plus checklist dasbor Usage pemilik (aturan 8/13).

---

## File Structure

- `src/convex/adminGate.ts` — Task 1, 2, 3: bounded security reads, heartbeat guard, presence helpers.
- `src/convex/schema.ts` — Task 1, 2, 8: indeks komposit co-born (`bySessionCreatedAt`), hapus tabel mati.
- `src/convex/dataRetention.ts` — Task 4: tambah retensi presence basi + notifikasi lama + kunci angka.
- `src/convex/crons.ts` — Task 4: audit tumpang-tindih (tanpa konsolidasi; baca-saja + test pengunci).
- `src/convex/community.ts`, `src/convex/vendors.ts`, `src/convex/analytics.ts` — Task 5, 7: batasi N+1, pindahkan `getUrl` ke detail, counter dasbor.
- `src/convex/storage.ts` — Task 5: audit jalur unggah non-dedup.
- `src/lib/admin-presence.ts` — Task 3: interval 300 dtk.
- `src/lib/catalog-store.ts`, `src/components/admin-security-log.tsx`, `src/components/admin-governance.tsx`, `src/components/admin-session-actions.tsx` — Task 6: visibility-gated subscription.
- Test: `src/convex/security-events-io.test.ts` (BARU, Task 1–2), `src/convex/heartbeat-io.test.ts` (BARU, Task 3), tambah ke `src/convex/dataRetention.test.ts` (Task 4), `src/convex/db-efficiency.test.ts` (Task 5, 7), `src/convex/realtime.test.ts` (Task 4, pola source-content cron), `src/components/admin-security-log.test.ts` (Task 6).

---

### Task 1: Bounded security-events list (aturan 1, 6, 11)

**Files:**
- Modify: `src/convex/adminGate.ts:811-875` (`listAdminSecurityEvents`)
- Modify: `src/convex/schema.ts:753-768` (tambah indeks bila perlu)
- Test: Create `src/convex/security-events-io.test.ts`

**Interfaces:**
- Consumes: `adminPasscodeAttempts` (+ indeks `byCreatedAt`), `adminPresence.byLastSeenAt`, `deriveSecuritySignals` (tanda tangan tidak berubah).
- Produces: `listAdminSecurityEvents({limit?, cursor?})` mengembalikan `{events, nextCursor, total, truncated}` dengan `events` hasil baca indeks-rentang `byCreatedAt` desc + `take(limit+1)`, filter `_id` tiebreak di memori untuk jendela kecil itu saja. `total` dibaca dari counter jendela (Task 2 menyediakan `securityWindowCounts`; sampai Task 2 selesai, `total` BOLEH absen — jangan hitung dari koleksi). Kontrak UI tidak berubah selain field tambahan opsional.

- [ ] **Step 1: Write the failing test**

```typescript
test("daftar event hanya membaca jendela indeks + take berplafon", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 40; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: `kunci-${i}`, outcome: "failed", createdAt: now - i * 1000,
      });
    }
  });
  const page = await owner.query(api.adminGate.listAdminSecurityEvents, { limit: 10 });
  expect(page.events).toHaveLength(10);
  expect(page.nextCursor).not.toBeNull();
  expect(page.truncated).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/security-events-io.test.ts`
Expected: FAIL — `truncated` tidak ada di hasil sekarang.

- [ ] **Step 3: Write minimal implementation**

Ganti `collect()` penuh di `listAdminSecurityEvents` dengan baca `byCreatedAt` desc + `take(limit + 1)`; mulai dari kursor via rentang `createdAt <= cursorAt`; tiebreak `_id` di memori hanya untuk halaman itu. Pindahkan enrichment per-baris (`related`, `ipRows`, `rapidAttempts`, `knownIps`, `successes`, full `presence`) ke helper yang menerima jendela kecil, atau tandai `truncated: true` bila jendela tidak cukup. Proyeksikan hanya field yang dirender daftar (aturan 6); 40-field detail tetap di `getAdminSecurityAttempt`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/security-events-io.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/adminGate.ts src/convex/security-events-io.test.ts src/convex/schema.ts
git commit -m "perf(admin): bounded security events list via index range + take"
```

### Task 2: Summary/IP-activity/detail dari baca berbatas + counter (aturan 1, 6, 7)

**Files:**
- Modify: `src/convex/adminGate.ts:824-827` (presence full-collect), `:1040-1084` (`listAdminIpActivity`), `:1087-1143` (`adminSecuritySummary`), `:952-1037` (`getAdminSecurityAttempt`)
- Test: `src/convex/security-events-io.test.ts` (tambah describe)

**Interfaces:**
- Consumes: hasil Task 1; `securityRateCounters`, `analyticsCounters` (pola counter); `byIpHash`, `bySessionFingerprint`, `byKeyCreatedAt`.
- Produces: `adminSecuritySummary` membaca rentang `byCreatedAt` sesuai `windowHours` + `take()` berplafon dan mengembalikan `truncated` bila plafon tersentuh; `listAdminIpActivity` membaca rentang terbaru berplafon (bukan seluruh tabel) + `truncated`; `getAdminSecurityAttempt.ipHistory` memakai `byIpHash` + `take(20)` + `truncated`; `listAdminPresence` dipakai sebagai pembaca presence ringan (aturan 2c). Tidak ada penomoran total dari `collect().length`.

- [ ] **Step 1: Write the failing test**

```typescript
test("ringkasan menandai truncated saat jendela melebihi plafon", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (let i = 0; i < 30; i++) {
      await ctx.db.insert("adminPasscodeAttempts", {
        key: `k-${i}`, outcome: "failed", createdAt: now - i * 1000,
      });
    }
  });
  const summary = await owner.query(api.adminGate.adminSecuritySummary, { windowHours: 24 });
  expect(summary.last24h).toBeLessThanOrEqual(30);
  expect(typeof summary.truncated).toBe("boolean");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/security-events-io.test.ts`
Expected: FAIL — `truncated` belum ada di summary.

- [ ] **Step 3: Write minimal implementation**

Terapkan rentang + plafon di ketiga query; tambah flag `truncated`; pastikan `getAdminSecurityAttempt` tetap mengembalikan 20 riwayat IP terbaru + flag bila dipotong. Pertahankan `requireManagementViewer` di semua jalur. Minta gate review `senior-security` untuk diff ini sebelum commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/security-events-io.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/adminGate.ts src/convex/security-events-io.test.ts
git commit -m "perf(admin): bounded summary, ip activity, and attempt detail reads"
```

### Task 3: Heartbeat no-op guard + interval 300 dtk (aturan 2, 10)

**Files:**
- Modify: `src/convex/adminGate.ts:290-316` (`heartbeatAdminPresence`), `:87` (`PRESENCE_STALE_MS`)
- Modify: `src/lib/admin-presence.ts:20` (`HEARTBEAT_MS`)
- Test: Create `src/convex/heartbeat-io.test.ts`

**Interfaces:**
- Consumes: `adminPresence.byUser`; konstanta `HEARTBEAT_MS`, `PRESENCE_STALE_MS`.
- Produces: `heartbeatAdminPresence` me-return `{ lastSeenAt, wrote }` — `wrote: false` (no-op, tanpa `patch`) bila `now - lastSeenAt < 270_000` DAN `route`/`sessionFingerprint` sama; selain itu patch seperti sekarang. `HEARTBEAT_MS = 300_000`; `PRESENCE_STALE_MS = 330_000` (interval + grace 30 dtk). Kontrak "Aktif sekarang" tetap: `now - lastSeenAt < PRESENCE_STALE_MS`.

- [ ] **Step 1: Write the failing test**

```typescript
test("heartbeat segar adalah no-op tanpa patch", async () => {
  const t = convexTest(schema, modules);
  const owner = await setupAdmin(t);
  const first = await owner.mutation(api.adminGate.heartbeatAdminPresence, { route: "/admin" });
  expect(first.wrote).toBe(true);
  const second = await owner.mutation(api.adminGate.heartbeatAdminPresence, { route: "/admin" });
  expect(second.wrote).toBe(false);
  expect(second.lastSeenAt).toBe(first.lastSeenAt);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/heartbeat-io.test.ts`
Expected: FAIL — hasil sekarang angka `now`, tanpa field `wrote`.

- [ ] **Step 3: Write minimal implementation**

Tambah guard di `heartbeatAdminPresence` sebelum `patch`; ubah `HEARTBEAT_MS` ke `300_000` dengan komentar alasan; ubah `PRESENCE_STALE_MS` ke `330_000` dengan komentar `300 dtk interval + 30 dtk grace`. Perbarui komentar di `src/lib/admin-presence.ts:6-19`. Sesuaikan test lama yang mengasumsikan 60 dtk/90 dtk (`realtime.test.ts:1278`, `session-context-authority.test.ts` bila perlu) — ubah angkanya, bukan logikanya.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/heartbeat-io.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/adminGate.ts src/lib/admin-presence.ts src/convex/heartbeat-io.test.ts
git commit -m "perf(presence): heartbeat no-op guard and 300s interval"
```

### Task 4: Retensi presence basi + notifikasi lama + audit cron (aturan 3, 9)

**Files:**
- Modify: `src/convex/dataRetention.ts:41-69` (`RETENTION_LIMITS`), `:232-326` (`pruneApplicationHistory`)
- Modify: `src/convex/dataRetention.test.ts` (kunci angka baru)
- Modify: `src/convex/realtime.test.ts:1429-1449` (pola source-content cron, tambah untuk prune baru bila cron berubah — cron TIDAK berubah di task ini)

**Interfaces:**
- Consumes: `notifications` (indeks `byUser`; tambah `byCreatedAt` bila perlu di Task 8), `adminPresence.byLastSeenAt` (sudah ada, `schema.ts:923`).
- Produces: `RETENTION_LIMITS` tambah `presenceDays: 7` (selaras penyiangan 7 hari di `pruneAdminSecurityEvents`), `notificationDays: 90`, `notificationKeepLatest: 2000`. `pruneApplicationHistory` menghapus presence basi (>7 hari) dan notifikasi lama (>90 hari atau di atas 2000 terbaru). Mengembalikan `{ removed, presenceRemoved, notificationsRemoved }`? TIDAK — bentuk return `removed: number` dipertahankan (kontrak test lama); hitungan tambahan hanya di log server bila perlu. Test mengunci angka baru persis pola existing.

- [ ] **Step 1: Write the failing test**

```typescript
test("prune membuang presence basi dan notifikasi lama, baris hidup utuh", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("adminPresence", {
      userId: (await seedUserId(t, "Basi")) as never,
      lastSeenAt: now - 8 * 24 * 60 * 60_000, firstSeenAt: now - 8 * 24 * 60 * 60_000,
    });
    await ctx.db.insert("notifications", {
      kind: "lama", title: "L", body: "B",
      createdAt: now - 91 * 24 * 60 * 60_000,
    });
  });
  await t.mutation(internal.dataRetention.pruneApplicationHistory, {});
  const state = await t.run(async (ctx) => ({
    presence: await ctx.db.query("adminPresence").collect(),
    notifications: await ctx.db.query("notifications").collect(),
  }));
  expect(state.presence).toHaveLength(0);
  expect(state.notifications).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/dataRetention.test.ts`
Expected: FAIL — baris basi/lama belum dibuang.

- [ ] **Step 3: Write minimal implementation**

Tambah konstanta + dua blok prune mengikuti pola `auditRows`/`errorRows` (batas jumlah dulu, lalu batas usia). Verifikasi efektivitas retensi attempts yang sudah ada: bila tabel attempts masih menggembung di atas ~600 baris pasca-prune, CATAT sebagai temuan (jangan ubah angka diam-diam). Audit tumpang-tindih cron: pastikan tidak ada dua cron memindai tabel yang sama (bukti: `crons.ts:32-186` sudah tersebar jam 0–6 UTC + interval anonim); bila overlap ditemukan, catat di ledger, jangan konsolidasi tanpa persetujuan.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/dataRetention.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/dataRetention.ts src/convex/dataRetention.test.ts
git commit -m "feat(retention): prune stale presence and old notifications with locked limits"
```

### Task 5: N+1 daftar + getUrl pindah ke detail (aturan 4, 12)

**Files:**
- Modify: `src/convex/community.ts:303-341` (board list N+1), `:1140-1181` (`listVendorPhotos` getUrl per baris), `:1299-1313` (`listPhotosForModeration` getUrl per baris), `:250-257` (`adminMetrics` topProviders per-vendor count)
- Modify: `src/convex/analytics.ts:250-257` (pola sama bila ada)
- Modify: `src/convex/storage.ts` (audit: pastikan tidak ada jalur unggah baru di luar `uploadWithDedup`)
- Test: tambah ke `src/convex/db-efficiency.test.ts`

**Interfaces:**
- Consumes: `serviceRequests`, `requestOffers`, `vendors.byVendor`, `vendorPhotos.byVendor`, `ctx.storage.getUrl`.
- Produces: board list mengambil vendor unik sekali (kumpulkan `vendorId` unik → `Promise.all(ctx.db.get)` satu batch, tanpa query ulang per offer); `listVendorPhotos` dan `listPhotosForModeration` mengembalikan `storageId` + flag, URL di-resolve di pemuatan detail (`getImageUrl` yang sudah ada); `topProviders`: urutkan by `responseMinutes` dulu, hitung request HANYA untuk 8 finalis. Source-content test: tidak ada `ctx.storage.getUrl` di dalam `.map(` pada query daftar.

- [ ] **Step 1: Write the failing test**

```typescript
test("query daftar tidak memanggil getUrl per baris", () => {
  const community = readFileSync(new URL("./community.ts", import.meta.url), "utf8");
  const listBlock = community.slice(
    community.indexOf("export const listVendorPhotos"),
    community.indexOf("export const createVendorPhoto"),
  );
  expect(listBlock).not.toContain("ctx.storage.getUrl");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/db-efficiency.test.ts`
Expected: FAIL — `getUrl` masih di dalam blok daftar.

- [ ] **Step 3: Write minimal implementation**

Terapkan batching + pemindahan URL ke detail sesuai Interfaces. Perilaku UI tidak berubah (komponen detail memanggil resolver yang sama). Audit `storage.ts` + semua pemanggil `generateUploadUrl`: bila ada jalur di luar `uploadWithDedup`, migrasikan atau catat sebagai temuan terblokir.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/db-efficiency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/community.ts src/convex/analytics.ts src/convex/storage.ts src/convex/db-efficiency.test.ts
git commit -m "perf(list): batch enrichment and move photo urls to detail loading"
```

### Task 6: Langganan ikut visibilitas section (aturan 5)

**Files:**
- Modify: `src/components/admin-security-log.tsx:248-262` (teruskan `enabled` ke 3 hook)
- Modify: `src/components/admin-governance.tsx:271-275` (render `AdminSessionActions`, `AdminSecurityLog`, `AdminErrorReports` hanya saat section terbuka/fokus)
- Modify: `src/lib/catalog-store.ts:905-929` bila perlu (hook sudah dukung `enabled`; jangan ubah signature)
- Test: `src/components/admin-security-log.test.ts` (mock hook + asersi skip saat section tertutup)

**Interfaces:**
- Consumes: hook `useAdminSecurityEvents(limit, cursor, enabled)`, `useAdminSecuritySummary(windowHours, enabled)`, `useAdminIpActivity(limit, enabled)` — signature TETAP.
- Produces: section keamanan memakai state terbuka/tutup (atau IntersectionObserver bila sudah ada pola di repo — JANGAN tambah lib baru); saat tertutup, ketiga hook dipanggil dengan `enabled=false` (`"skip"`), dan komponen anak berat tidak di-mount. Tidak ada perubahan visual saat terbuka.

- [ ] **Step 1: Write the failing test**

```typescript
test("section tertutup mem-skip langganan security", () => {
  renderSecuritySection({ open: false });
  expect(mockUseAdminSecurityEvents).toHaveBeenCalledWith(25, undefined, false);
  expect(mockUseAdminSecuritySummary).toHaveBeenCalledWith(24, false);
  expect(mockUseAdminIpActivity).toHaveBeenCalledWith(12, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/components/admin-security-log.test.ts`
Expected: FAIL — hook sekarang dipanggil tanpa `enabled=false`.

- [ ] **Step 3: Write minimal implementation**

Tambah state section + teruskan `enabled`; bungkus mount anak berat di balik kondisi yang sama. Ikuti pola mock yang sudah ada di `admin-security-log.test.ts:23-26`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/components/admin-security-log.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin-security-log.tsx src/components/admin-governance.tsx src/components/admin-security-log.test.ts
git commit -m "perf(admin): gate security subscriptions on section visibility"
```

### Task 7: Migrasi angka dasbor ke counter (aturan 7)

**Files:**
- Modify: `src/convex/community.ts:1333-1354` (`listCommunityMetrics`: `favorites`, `vendorPhotos` full-collect), `:250-262` (`adminMetrics` bila tersisa)
- Test: tambah ke `src/convex/db-efficiency.test.ts` (pola counter-vs-tabel seperti `whatsappDeliveryStats`)

**Interfaces:**
- Consumes: pola `bumpCounter`/`readCounters` (`analytics.ts`), `whatsappDeliveryStats` (preseden kebenaran counter).
- Produces: angka `returningSaverRate` dan kelengkapan foto dibaca dari counter yang dirawat saat tulis (bukan `collect().length`); test menamper counter ke nilai salah dan memastikan query mengembalikan nilai counter (bukti membaca counter, preseden `db-efficiency.test.ts:145-159`). Bila satu angka tidak punya penulis counter yang jelas, CATAT sebagai temuan (jangan karang counter tanpa penulis).

- [ ] **Step 1: Write the failing test**

```typescript
test("metrik komunitas membaca counter, bukan menghitung tabel", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const row = (await ctx.db.query("communityMetricCounters").collect())[0]!;
    await ctx.db.patch(row._id, { favorites: 41 });
  });
  const metrics = await admin.query(api.community.listCommunityMetrics, {});
  expect(metrics.returningSaverRate).toContain("41");
});
```

(Sesuaikan nama tabel/kunci dengan counter yang benar-benar dibuat di Step 3 — test ini ditulis ulang setelah desain counter dikunci di awal task; yang penting: test gagal dulu karena query masih menghitung tabel.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/db-efficiency.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Audit `grep "\.collect()" src/convex/*.ts` untuk query user-facing; migrasikan satu per satu yang punya penulis jelas; yang tidak punya penulis dicatat, bukan dikarang.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/db-efficiency.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/community.ts src/convex/analytics.ts src/convex/db-efficiency.test.ts
git commit -m "perf(metrics): read dashboard numbers from counters"
```

### Task 8: Indeks co-born + buang indeks/tabel mati (aturan 11)

**Files:**
- Modify: `src/convex/schema.ts` (tambah indeks komposit yang dibutuhkan Task 1–2, e.g. `bySessionCreatedAt: ["sessionFingerprint", "createdAt"]` bila dipakai; HAPUS `vendorSubscriptions` + `byVendor`-nya — hanya 1 referensi di `schema.ts:1139`, nol pemakaian di `src/`)
- Test: pola source-content di `src/convex/realtime.test.ts` atau file baru `src/convex/index-hygiene.test.ts`: setiap `.index(` di schema harus dirujuk string nama indeksnya di `src/convex/*.ts` non-test; `vendorSubscriptions` tidak boleh muncul di schema.

**Interfaces:**
- Consumes: hasil grep referensi indeks; kontrak: indeks dan query-nya lahir di commit yang sama.
- Produces: schema tanpa tabel mati; test pengunci referensi indeks.

- [ ] **Step 1: Write the failing test**

```typescript
test("setiap indeks schema dirujuk query; tabel mati tidak ada", () => {
  const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
  expect(schema).not.toContain("vendorSubscriptions");
  const indexes = [...schema.matchAll(/\.index\("([^"]+)"/g)].map((m) => m[1]);
  const sources = ["adminGate.ts", "community.ts", "vendors.ts", "dataRetention.ts"]
    .map((f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).join("\n");
  for (const name of indexes) expect(sources).toContain(`"${name}"`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/index-hygiene.test.ts`
Expected: FAIL — `vendorSubscriptions` masih ada.

- [ ] **Step 3: Write minimal implementation**

Hapus tabel mati; tambah hanya indeks yang dipakai Task 1–2 di commit yang sama dengan query-nya. Verifikasi codegen: `bun run pretest` harus lolos (menulis ulang `_generated` bila perlu — JANGAN edit `_generated` manual).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/index-hygiene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/schema.ts src/convex/index-hygiene.test.ts
git commit -m "chore(schema): drop dead vendorSubscriptions, co-born needed indexes"
```

### Task 9: Tulis-hanya-bila-berubah + idempotency (aturan 10)

**Files:**
- Modify: `src/convex/adminGate.ts:1532-1575` (`reportSessionContext` patch tanpa syarat), `src/convex/storage.ts:94-108` (`recordUploadedBlob` patch peta tanpa syarat bila sama)
- Test: tambah ke `src/convex/heartbeat-io.test.ts` + `src/convex/storage.test.ts`

**Interfaces:**
- Consumes: guard pola Task 3.
- Produces: `reportSessionContext` melewati `patch` bila semua field hasil == existing (kecuali `lastSeenAt` yang ikut guard segar Task 3); `recordUploadedBlob` melewati `patch` bila `storageId`+`size` peta sama. `deliveryKey`/idempotency untuk aksi rawan klik-ganda: verifikasi dulu cakupannya (pola `deliveryKey` sudah hidup di WhatsApp) — bila tidak ada aksi yang terbukti ganda-tulis, CATAT "tidak ada temuan", jangan tambah mekanisme.

- [ ] **Step 1: Write the failing test**

```typescript
test("reportSessionContext identik adalah no-op", async () => {
  const t = convexTest(schema, modules);
  const admin = await setupAdmin(t);
  const token = await seedContextToken(t);
  await admin.mutation(api.adminGate.reportSessionContext, { token });
  const before = await readPresence(t, admin);
  await admin.mutation(api.adminGate.reportSessionContext, { token: await seedContextToken(t) });
  const after = await readPresence(t, admin);
  expect(after.lastSeenAt).toBe(before.lastSeenAt);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/convex/heartbeat-io.test.ts`
Expected: FAIL — `lastSeenAt` selalu bergerak.

- [ ] **Step 3: Write minimal implementation**

Generalisasi guard Task 3; jaga garansi forensik (tidak ada keputusan izin berubah; `signedInAt`/`firstSeenAt` tetap seperti sekarang).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/convex/heartbeat-io.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convex/adminGate.ts src/convex/storage.ts src/convex/heartbeat-io.test.ts src/convex/storage.test.ts
git commit -m "perf(write): skip no-op patches on hot mutations"
```

### Task 10: Verifikasi akhir + checklist pemilik (aturan 8, 13)

**Files:** tanpa perubahan kode (bila semua hijau); bila merah, kembali ke task pemilik temuan — JANGAN batch-fix di task ini.

- [ ] **Step 1: Run full suite segar**

Run: `bun run test`
Expected: semua file lolos, 0 gagal.

- [ ] **Step 2: Run typecheck segar**

Run: `bun run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run lint segar**

Run: `bun run lint`
Expected: 0 error.

- [ ] **Step 4: Run build segar**

Run: `bun run build`
Expected: exit 0.

- [ ] **Step 5: Checklist pemilik (manual, bukti dicatat)**

Run: buka dasbor Usage → set warning threshold 70% (aturan 13) → catat angka I/O saat deploy → cek ulang 1 minggu → putuskan diet darurat bila ≥70%. Aturan 8: perbaiki error spam dev yang terlihat di `errorReports`/log dev; hentikan benchmark berulang ke dev. Klaim penurunan GB HANYA setelah bukti dasbor 1 minggu.

## Self-Review

- Cakupan: Task 1–2 → aturan 1,4(sebagian),6,7,11 · Task 3 → 2,10 · Task 4 → 3,9 · Task 5 → 4,12 · Task 6 → 5 · Task 7 → 7 · Task 8 → 11 · Task 9 → 10 · Task 10 → 8,13 + verifikasi.
- Placeholder: tidak ada TBD/TODO; setiap langkah punya file, perintah, dan ekspektasi konkret.
- Konsistensi tipe: `truncated: boolean` di semua query yang dipotong; `wrote: boolean` + `lastSeenAt: number` di heartbeat; kontrak `removed: number` prune dipertahankan; signature hook `enabled` tidak berubah.
