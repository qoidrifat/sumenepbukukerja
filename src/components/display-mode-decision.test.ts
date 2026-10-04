/// <reference types="vite/client" />
/**
 * KEPUTUSAN MODE TAMPILAN.
 *
 * Berkas ini mengunci keputusan, bukan sekadar mencatat apa yang kebetulan ada. Aturannya jelas:
 * keputusan yang berubah harus diubah DI SINI dengan sengaja, lengkap dengan
 * alasannya, bukan ditembus diam-diam oleh penghapusan kode.
 *
 * Yang dikunci di sini:
 *
 * 1. APLIKASI TIDAK MENAWARKAN DARK MODE. Dan itu disengaja.
 * 2. Override CSS untuk dua mode aksesibilitas (`data-large-text`,
 *    `data-high-contrast`) tidak boleh hilang, karena override itu yang
 *    membuat preferensi yang sudah tersimpan tetap berarti.
 * 3. SEJAK 2026-10-04, tombol "Teks besar" dan "Kontras" DIHAPUS dari
 *    antarmuka. Ini keputusan produk yang diminta, dan test di bawah yang
 *    menjaga agar penghapusannya benar-benar total: tidak ada tombol dengan
 *    label itu yang lolos di halaman mana pun, dan tidak ada komponen
 *    display-controls yang tersisa untuk memakainya lagi.
 * 4. Menghapus tombol tidak berarti membuang preferensi. Nilai yang sudah
 *    tersimpan di localStorage masih diterapkan ke `<html>` sebelum render
 *    pertama, di `src/main.tsx`. Kalau baris itu ikut terhapus, pengguna yang
 *    pernah menyalakan "teks besar" akan kehilangan pengatannya tanpa diberi
 *    tahu - itu kehilangan data preferensi, bukan sekadar perubahan gaya.
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
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const css = read("../index.css");
const main = read("../main.tsx");
const focusRingModule = read("../lib/focus-ring.ts");

/** Halaman yang pernah memuat tombol aksesibilitas. */
const HALAMAN = [
  "../pages/Landing.tsx",
  "../pages/Dashboard.tsx",
  "../pages/VendorProfile.tsx",
];

/**
 * Semua modul yang memakai cincin fokus. Daftar ini grewuh: satu berkas
 * yang luput dari sini tetap bisa saja mendefinisikan cincin fokusnya sendiri
 * dan build tetap hijau. Karena itu setiap entri diperiksa dua arah - ia WAJIB
 * mengimpor dari modul bersama, dan ia TIDAK BOLEH punya salinan lokal.
 */
const IMPORTIR_FOCUS_RING = [
  "./community-widgets.tsx",
  "./community-notification-center.tsx",
  "./display-name-field.tsx",
  "./error-report-dialog.tsx",
  "./site-footer.tsx",
  "../pages/Landing.tsx",
  "../pages/VendorProfile.tsx",
];

describe("Fase 9.1: keputusan mode tampilan", () => {
  test("tidak ada blok token .dark di index.css", () => {
    expect(css, "dark mode harus tetap nonaktif sampai ada token yang benar").not.toMatch(
      /^\s*\.dark\s*\{/m,
    );
  });

  test("tidak ada kode aplikasi yang memasang kelas .dark", () => {
    for (const file of [
      "./community-widgets.tsx",
      "./community-notification-center.tsx",
      "../main.tsx",
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
      "./community-widgets.tsx",
      "./community-notification-center.tsx",
      "./admin-workspace.tsx",
      "../main.tsx",
      ...HALAMAN,
      "../pages/Admin.tsx",
    ]) {
      const code = stripComments(read(file));
      const matches = code.match(/\bdark:[a-z0-9:[\].-]+/g) ?? [];
      expect(matches, `${file} memakai varian dark: di kode aplikasi`).toEqual([]);
    }
  });

  test("override mode aksesibilitas masih ada di index.css", () => {
    // Override ini tetap hidup karena preferensi yang sudah tersimpan masih
    // diterapkan di main.tsx. Menghapusnya berarti menghilangkan efeknya bagi orang
    // yang menyalakannya di masa lalu.
    expect(css).toContain('@custom-variant dark (&:is(.dark *));');
    expect(css).toMatch(/html\[data-high-contrast="true"\]\s*\{/);
    expect(css).toMatch(/html\[data-large-text="true"\]\s*\{/);
  });
});

describe("2026-10-04: tombol Teks besar dan Kontras dihapus dari antarmuka", () => {
  test("komponen display-controls sudah tidak ada", () => {
    expect(
      existsSync(fileURLToPath(new URL("./display-controls.tsx", import.meta.url))),
      "berkas komponennya harus hilang, bukan jadi tempat yang tidak diimpor",
    ).toBe(false);
  });

  test("tidak ada satu pun halaman yang masih menampilkannya", () => {
    for (const file of HALAMAN) {
      const kode = read(file);
      expect(kode, `${file} masih mengimpor AccessibilityControls`).not.toContain(
        "AccessibilityControls",
      );
      expect(kode, `${file} masih punya tombol "Teks besar"`).not.toContain("Teks besar");
      expect(kode, `${file} masih punya tombol "Kontras"`).not.toContain("Kontras");
    }
  });

  test("label kelompok mode tampilan tidak ada di halaman mana pun", () => {
    // `aria-pressed` sendiri masih dipakai sah di aplikasi ini - filter jarak di
    // katalog, tombol favorit, bintang rating - jadi yang dijaga di sini adalah
    // LABEL kelompok yang dibawa komponen yang dihapus, bukan atributnya secara
    // umum.
    for (const file of HALAMAN) {
      expect(read(file), `${file} masih menandai kelompok "Mode tampilan"`).not.toContain(
        'aria-label="Mode tampilan"',
      );
    }
  });

  test("preferensi yang sudah tersimpan tetap diterapkan tanpa tombol", () => {
    // Ini yang membedakan "tombol dihapus" dari "kemampuan dibuang".
    expect(main, "key localStorage teks besar tidak boleh berubah").toContain(
      '"sumenep-large-text"',
    );
    expect(main, "key localStorage kontras tinggi tidak boleh berubah").toContain(
      '"sumenep-high-contrast"',
    );
    expect(main).toContain("document.documentElement.dataset");
    // Dipanggil sebelum render pertama: kalau hanya di dalam komponen, nilainya
    // baru berlaku setelah mount dan muncul kedipan layout.
    expect(main).toMatch(/applyStoredDisplayPreferences\(\)\s*;/);
  });

  test("cincin fokus dipusatkan di satu modul, tanpa salinan lokal", () => {
    // Berkas display-controls exporting focusRing sebelum dihapus. Kalau
    // pemindahan ini tidak lengkap, modul yang memakainya akan kehilangan
    // penanda fokus - dan tidak ada error build yang akan memberi tahu.
    expect(focusRingModule).toContain("export const focusRing");
    expect(focusRingModule).toContain("focus-visible:ring-2");
    // Varian permukaan gelap milik footer juga tinggal di satu tempat.
    expect(focusRingModule).toContain("export const focusRingGelap");

    for (const file of IMPORTIR_FOCUS_RING) {
      const kode = stripComments(read(file));
      expect(kode, `${file} tidak lagi memakai satu sumber cincin fokus`).toContain(
        'from "@/lib/focus-ring"',
      );
      // Salinan lokal build tetap hijau. akibatnya justru yang buruk: cincin
      // fokus di satu sudut lebih tipis dari yang di sudut lain, dan tidak ada
      // yang memberi tahu.
      expect(kode, `${file} mendefinisikan cincin fokusnya sendiri`).not.toMatch(
        /^\s*const focusRing(Gelap)?\s*=/m,
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