import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak tema ruang pengelola.
 *
 * Test ini lahir dari audit, bukan dari tebakan. Temuannya: sebagian fitur di
 * meja kerja admin terlihat seperti sisipan dari aplikasi lain, dan penyebabnya
 * hanya ada dua -
 *
 *  1. Portal Radix. Dialog dan konfirmasi dirender ke `document.body`, jadi
 *     berada DI LUAR `.admin-workspace` dan kehilangan seluruh token admin.
 *     Gejalanya nyata: dialog "Cabut akses sesi" menampilkan tombol merah dan
 *     tombol batal tanpa gaya admin sama sekali, dengan kotak melengkung di
 *     tengah panel kuning.
 *  2. Penulisan ulang warna dan sudut secara ad-hoc. Sebagian komponen memakai
 *     palet aplikasi (`text-red-700`, `rounded-lg`) atau menyalin hex admin di
 *     tempat yang berbeda-beda, sehingga warna yang "seharusnya sama" punya
 *     beberapa versi.
 *
 * Yang dikunci di sini adalah batas yang bisa diuji dari teks sumber. Tidak
 * ada yang diukur dari browser; itu tetap butuh pemeriksaan visual.
 */

const ADMIN_SOURCES = [
  "../components/admin-access-gate.tsx",
  "../components/admin-audit-log.tsx",
  "../components/admin-empty-mascot.tsx",
  "../components/admin-error-reports.tsx",
  "../components/admin-governance.tsx",
  "../components/admin-invite-link.tsx",
  "../components/admin-loading-skeleton.tsx",
  "../components/admin-metrics-board.tsx",
  "../components/admin-package-manager.tsx",
  "../components/admin-profile.tsx",
  "../components/admin-report-review.tsx",
  "../components/admin-security-log.tsx",
  "../components/admin-session-actions.tsx",
  "../components/admin-session-revoke.tsx",
  "../components/admin-workspace-hero.tsx",
  "../components/admin-workspace.tsx",
  "../pages/Admin.tsx",
];

const source = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const css = source("../index.css");

/**
 * Sudut yang TIDAK boleh muncul. `rounded-full` dikecualikan: bentuk pil
 * dipakai untuk titik status dan pil peran, itu bahasa bentuknya sendiri,
 * bukan sisa gaya aplikasi.
 */
const APP_ROUNDING = /rounded-(lg|xl|2xl|3xl)\b/;

/**
 * Palet Tailwind bawaan. Satu-satunya pengecualian yang sah adalah gradien
 * aksen kartu listing di `Admin.tsx`, karena itu data listing yang sedang
 * dipratinjau, bukan gaya meja kerja.
 */
const APP_PALETTE =
  /\b(?:slate|gray|zinc|neutral|stone|indigo|blue|red|green|emerald|amber|yellow|purple|violet|cyan|sky)-\d{2,3}\b/g;

test("tidak ada sudut membulat gaya aplikasi di ruang pengelola", () => {
  const offenders = ADMIN_SOURCES.filter((file) => APP_ROUNDING.test(source(file)));
  expect(offenders).toEqual([]);
});

test("tidak ada warna palet aplikasi di ruang pengelola", () => {
  const offenders: string[] = [];
  for (const file of ADMIN_SOURCES) {
    for (const line of source(file).split("\n")) {
      // Aksen kartu listing adalah data, bukan gaya.
      if (line.includes("from-blue-600 to-cyan-400")) continue;
      const found = line.match(APP_PALETTE);
      if (found) offenders.push(`${file}: ${found.join(", ")}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("hex yang dipakai di luar palet admin sudah habis", () => {
  // Palet Warm Brutalism yang sah. Satu-satunya warna di luar daftar ini
  // pernah muncul adalah Hijau/Oranye turunan yang tidak punya padanan.
  const allowed = new Set([
    "121212", "525252", "1A1A1A", "FFE662", "7C2D12", "FF5A26", "F1EDE3",
    "24533A", "DCEBD7", "F5F0E5", "E9B4A7", "FAF7EE", "D6D3D1", "E7E5E4",
    "EDEAE0", "FDFBF7", "FFFCF5", "FFFFFF",
  ]);
  const offenders: string[] = [];
  for (const file of ADMIN_SOURCES) {
    for (const match of source(file).matchAll(/#[0-9A-Fa-f]{6}/g)) {
      const hex = match[0].slice(1).toUpperCase();
      if (!allowed.has(hex)) offenders.push(`${file}: #${hex}`);
    }
  }
  expect(offenders).toEqual([]);
});

test("semua dialog admin berada di dalam scope tema admin", () => {
  // Dialog tanpa `admin-dialog-content` adalah temuan audit yang paling jelas:
  // isinya berada di luar `.admin-workspace`, jadi setiap kelas admin di
  // dalamnya tidak punya aturan yang berlaku.
  for (const file of ADMIN_SOURCES) {
    const text = source(file);
    const dialogs = text.match(/<DialogContent\b/g) ?? [];
    if (dialogs.length === 0) continue;
    expect(text, file).toContain("admin-dialog-content");
    expect(text, file).toContain("admin-dialog-overlay");
  }
});

test("scope portal membawa token dan primitive yang sebelumnya hilang", () => {
  // Tanpa blok ini, dialog kehilangan `--admin-*` dan `admin-btn-danger`.
  for (const scope of [".admin-dialog-overlay", ".admin-dialog-content", ".admin-confirm-overlay", ".admin-confirm-content"]) {
    expect(css).toContain(`${scope},`);
  }
  expect(css).toContain(".admin-dialog-content .admin-btn-danger");
  expect(css).toContain(".admin-confirm-content .admin-input");
  // Status pill dipakai di dalam dialog juga.
  expect(css).toContain(".admin-dialog-content .admin-status");
});

test("dialog admin dipusatkan tanpa transform, bukan dengan translate-50%", () => {
  const block = css.slice(
    css.indexOf(".admin-dialog-content {"),
    css.indexOf("}", css.indexOf(".admin-dialog-content {")),
  );
  expect(block).toContain("inset: 0");
  expect(block).toContain("margin: auto");
  expect(block).toContain("translate: none");
  expect(block).not.toContain("transform: translate(-50%");
});

test("token baru dipakai di markup, bukan hanya ada di CSS", () => {
  // Token yang hanya ada di stylesheet tidak memperbaiki apa pun.
  const governance = source("../components/admin-governance.tsx");
  expect(governance).toContain("admin-btn-success");
  expect(governance).toContain("admin-btn-highlight");
  expect(governance).toContain("admin-link");
  expect(governance).toContain("admin-disclosure");
  // Peran pengelola hanya untuk akun pemilik.
  expect(governance).toContain("{access.isOwner ? (");
});

test("tombol keluar dari daftar undangan memakai tombol admin, bukan tautan merah", () => {
  const governance = source("../components/admin-governance.tsx");
  expect(governance).toContain(
    'className="admin-btn admin-btn-danger px-2 py-1 text-xs"',
  );
  expect(governance).not.toContain("text-red-700");
});

test("dialog cabut sesi memakai tema admin, termasuk tombol Bahal", () => {
  const revoke = source("../components/admin-session-revoke.tsx");
  expect(revoke).toContain('className="admin-dialog-content mx-auto"');
  expect(revoke).toContain('overlayClassName="admin-dialog-overlay"');
  expect(revoke).toContain("showCloseButton={false}");
  // Detail perangkat tidak boleh memakai kotak melengkung gaya aplikasi.
  expect(revoke).not.toContain("rounded-xl");
});

test("halaman akses ditolak memakai admin, bukan gaya aplikasi", () => {
  const gate = source("../components/admin-access-gate.tsx");
  expect(gate).not.toContain("rounded-lg");
  expect(gate).not.toContain("rounded-2xl");
  expect(gate).not.toContain("text-red-700");
});

test("menu header punya isi yang lengkap dan bisa diakses", () => {
  const workspace = source("../components/admin-workspace.tsx");
  // Tombol Beranda tidak lagi memenuhi header: ia pindah ke menu.
  expect(workspace).not.toContain("Kembali ke katalog");
  expect(workspace).toContain('role="menu"');
  expect(workspace).toContain('role="menuitem"');
  expect(workspace).toContain('aria-haspopup="menu"');
  expect(workspace).toContain("aria-expanded={menuOpen}");
  expect(workspace).toContain('id="admin-workspace-menu"');
  for (const label of ["Beranda", "Profil", "Keluar"]) {
    expect(workspace, label).toContain(label);
  }
  // Ketiganya harus punya ikon, dan Keluar harus memakai ikon pintu keluar.
  expect(workspace).toContain("<LogOut");
  expect(workspace).toContain("<ArrowLeft");
  // Ikon digambar sendiri, bukan aset eksternal.
  expect(workspace).toContain("admin-menu-icon");
  expect(workspace).not.toMatch(/https?:\/\/[^"']*menu[^"']*\.(svg|png)/);
  // Keluar lewat modul bersama, bukan implementasi kedua.
  expect(workspace).toContain("useAdminLogout");
});

test("alur keluar punya satu implementasi saja", () => {
  const sessionActions = source("../components/admin-session-actions.tsx");
  const logoutModule = source("../lib/admin-logout.ts");
  // Hanya modul bersama yang boleh menyentuh `logoutAdmin`.
  expect(sessionActions).toContain("useAdminLogout");
  expect(sessionActions).not.toContain("api.adminGate.logoutAdmin");
  expect(logoutModule).toContain("api.adminGate.logoutAdmin");
});

test("gelar pemilik hanya boleh ditulis di modulnya", () => {
  // Aturan ini sudah ada; di sini dijaga ulang karena header baru memakai
  // gelar singkat yang berbeda dan bisa ditulis ulang di tempat lain.
  for (const file of ADMIN_SOURCES) {
    if (file.includes("owner-account")) continue;
    expect(source(file), file).not.toContain("SuperAdmin");
  }
  const ownerModule = source("../lib/owner-account.ts");
  expect(ownerModule).toContain("OWNER_SHORT_TITLE");
});