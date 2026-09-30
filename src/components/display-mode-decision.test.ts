/// <reference types="vite/client" />
/**
 * FASE 9.1 - PEKERJAAN 1 dan 2: mengunci keputusan mode tampilan.
 *
 * Dua hal yang dikunci test ini, dan keduanya adalah KEPUTUSAN, bukan
 * kebetulan:
 *
 * 1. APLIKASI TIDAK MENAWARKAN DARK MODE. Dan itu disengaja.
 * 2. Preferensi aksesibilitas (teks besar, kontras tinggi) tidak boleh
 *    berubah nama, karena nama itu yang menyimpan pilihan pengguna.
 *
 * Kenapa dark mode sengaja tidak ada:
 *  - Tidak ada blok token `.dark`, dan tidak ada kode yang memasang kelas
 *    itu. Kalau kelas itu dipasang sekarang, `dark:bg-slate-900`
 *    akan gelap sementara `dark:bg-background` tetap terang, karena token
 *    `--background` tidak pernah di-override. Hasilnya campuran, bukan tema.
 *  - Kode aplikasi sendiri tidak memakai kelas `dark:` sama sekali. Yang
 *    memakainya cuma berkas shadcn bawaan dan dua objek warna framer-motion
 *    di `react-bits.tsx`.
 *  - Palet maskot (krem, kuning, oranye) diuji geometrinya dan warnanya dikunci
 *    oleh `bun run mascot:validate`. Memaksa tema gelap berarti mengubah
 *    brand yang sudah lolos validasi, bukan sekadar mengganti token.
 *  - Mode yang benar-benar dipakai aplikasi adalah dua mode aksesibilitas
 *    berbasis atribut di atas dasar terang. Itu model yang sudah berjalan
 *    dan sudah dipakai pengguna.
 *
 * Kalau suatu saat dark mode benar-benar selesai, test ini harus DIUBAH
 * dengan sengaja, bukan diam-diam ditembus.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const css = read("../index.css");
const controls = read("./display-controls.tsx");

describe("Fase 9.1: keputusan mode tampilan", () => {
  test("tidak ada blok token .dark di index.css", () => {
    expect(css, "dark mode harus tetap nonaktif sampai ada token yang benar").not.toMatch(
      /^\s*\.dark\s*\{/m,
    );
  });

  test("tidak ada kode aplikasi yang memasang kelas .dark", () => {
    for (const file of [
      "./display-controls.tsx",
      "./community-widgets.tsx",
      "./community-notification-center.tsx",
      "../pages/Landing.tsx",
      "../pages/Dashboard.tsx",
      "../pages/VendorProfile.tsx",
      "../pages/Admin.tsx",
    ]) {
      const code = stripComments(read(file));
      expect(
        code,
        `${file} memasang kelas .dark; kalau dark mode selesai, hapus test ini dengan sengaja`,
      ).not.toMatch(/classList\.(add|toggle)\(\s*["']dark["']/);
    }
  });

  test("kode aplikasi sendiri tidak bergantung pada varian dark", () => {
    // shadcn bawaan boleh, karena itu kode vendor yang datang lewat registry.
    for (const file of [
      "./display-controls.tsx",
      "./community-widgets.tsx",
      "./community-notification-center.tsx",
      "./admin-workspace.tsx",
      "../pages/Landing.tsx",
      "../pages/Dashboard.tsx",
      "../pages/VendorProfile.tsx",
      "../pages/Admin.tsx",
    ]) {
      const code = stripComments(read(file));
      const matches = code.match(/\bdark:[a-z0-9:[\].-]+/g) ?? [];
      expect(matches, `${file} memakai varian dark: di kode aplikasi`).toEqual([]);
    }
  });

  test("override mode aksesibilitas masih ada di index.css", () => {
    // Dua mode yang benar-benar dipakai. Kalau ini hilang, preferensi yang
    // sudah tersimpan tidak lagi melakukan apa pun.
    expect(css).toContain('@custom-variant dark (&:is(.dark *));');
    expect(css).toMatch(/html\[data-high-contrast="true"\]\s*\{/);
    expect(css).toMatch(/html\[data-large-text="true"\]\s*\{/);
  });
});

describe("Fase 9.1: preferensi tampilan tidak boleh hilang diam-diam", () => {
  test("key localStorage tidak berubah", () => {
    // Mengubah string di sini membuang pilihan setiap pengguna yang sudah
    // menyimpannya. Itu kehilangan data, bukan perubahan gaya.
    expect(controls).toContain('"sumenep-large-text"');
    expect(controls).toContain('"sumenep-high-contrast"');
  });

  test("atribut yang diterapkan ke elemen html tidak berubah", () => {
    expect(controls).toContain("document.documentElement.dataset.largeText");
    expect(controls).toContain("document.documentElement.dataset.highContrast");
  });

  test("tombol tetap punya aria-pressed dan target sentuh min-h-12", () => {
    const pressedCount = (controls.match(/aria-pressed=/g) ?? []).length;
    expect(pressedCount, "dua toggle, masing-masing harus punya aria-pressed").toBe(2);
    const minHeightCount = (controls.match(/min-h-12/g) ?? []).length;
    expect(minHeightCount, "target sentuh di bawah 44px merusak pengguna keyboard dan motor").toBeGreaterThanOrEqual(2);
    expect(controls).toContain('aria-label="Mode tampilan"');
  });

  test("kontrol tersedia di halaman yang bisa dibuka langsung", () => {
    // PEKERJAAN 2: jangan balik lagi ke "harus cari di widget komunitas".
    for (const file of [
      "../pages/Landing.tsx",
      "../pages/Dashboard.tsx",
      "../pages/VendorProfile.tsx",
    ]) {
      expect(read(file), `${file} belum menampilkan kontrol aksesibilitas`).toContain(
        "<AccessibilityControls",
      );
    }
  });
});

describe("Fase 9.1: sinyal kepercayaan ada di permukaan penemuan", () => {
  test("kartu katalog menampilkan status verifikasi dengan ikon dan teks", () => {
    const landing = read("../pages/Landing.tsx");
    // Warna sendirian tidak cukup: pengguna buta warna harus bisa membacanya.
    expect(landing).toContain("ShieldCheck");
    expect(landing).toContain("Terverifikasi");
    expect(landing).toContain("Belum diverifikasi");
  });

  test("penyamaan istilah dengan halaman profil", () => {
    const profile = read("../pages/VendorProfile.tsx");
    expect(profile).toContain("Mitra terverifikasi");
    expect(profile).toContain("Tercatat di katalog");
  });
});
