import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * Kontrak FASE 9 - telemetri rute tidak boleh dikirim ke induk mana pun.
 *
 * KENAPA BERKAS INI MEMBACA SUMBER, BUKAN MENJALANKAN KODE.
 *
 * `main.tsx` me-mount aplikasi saat modulnya dievaluasi, jadi mengimpornya di
 * dalam test berarti menjalankan seluruh aplikasi. Yang diuji di sini juga
 * bukan perilaku runtime sebuah fungsi, melainkan SATU keputusan yang harus
 * tetap ada: ke mana pesan boleh pergi. Keputusan itu terlihat di sumber, dan
 * pola pemeriksaan seperti ini sudah dipakai berkas kontrak lain di repo ini
 * (`admin-theme-contract.test.ts`).
 *
 * KOMENTAR DIBUANG DULU, DAN ITU DISENGAJA.
 *
 * Dokumen di `main.tsx` sengaja MENULISKAN panggilan lamanya apa adanya -
 * `postMessage(..., "*")` - supaya orang yang membacanya tahu persis apa yang
 * diperbaiki. Kalau pemindai ini membaca seluruh berkas, ia akan menemukan
 * bintang itu di dalam komentar dan gagal pada kode yang sudah benar. Yang
 * diperiksa adalah kode, bukan dokumentasinya.
 *
 * Yang dijaga:
 *
 *  1. Penanda bintang tidak boleh kembali ke `postMessage`. Ini bukan soal
 *     gaya: penanda bintang berarti situs mana pun yang memasang aplikasi ini
 *     di dalam iframe menerima SELURUH jejak navigasi pengunjung - termasuk
 *     rute profil listing yang sedang dibuka dan rute undangan sebelum
 *     tautannya dikonsumsi.
 *
 *  2. Origin harus datang dari daftar putih, bukan dari sesuatu yang bisa
 *     ditentukan induk saat itu juga (misalnya `event.origin` yang dipantulkan
 *     kembali, atau `document.referrer`).
 *
 *  3. Perintah navigasi masuk harus memeriksa `event.source` DAN origin.
 *     Tanpa `event.source`, jendela mana pun yang memegang referensi ke
 *     jendela ini bisa menggeser riwayat pengguna.
 */

const raw = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

/** Kode tanpa komentar blok. Komentar baris tidak memuat penanda bintang. */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, "");

describe("FASE 9 - postMessage tidak memakai penanda bintang", () => {
  test("komentar lama memang masih menjelaskan panggilan lamanya", () => {
    // Penjaga untuk penjaga: kalau suatu saat dokumennya dihapus, tidak ada
    // lagi yang memberi tahu pembaca apa yang diperbaiki - dan itu harus
    // ketahuan lewat test, bukan lewat ingatan.
    //
    // CATATAN: `source` TIDAK boleh diperiksa melawan '"*"' secara umum.
    // `main.tsx` memakai `path="*"` untuk rute 404, dan itu bintang yang sah.
    // Karena itu pemeriksaan yang bermakna adalah per-panggilan (test di
    // bawah), bukan per-berkas.
    const comments = raw.match(/\/\*[\s\S]*?\*\//g) ?? [];
    const menjelaskan = comments.some(
      (block) => block.includes("postMessage(") && block.includes('"*"'),
    );
    expect(menjelaskan, "dokumentasi panggilan lama harus tetap ada").toBe(true);
  });

  test("tidak ada satu pun panggilan postMessage yang memakai bintang", () => {
    // Semua panggilan `postMessage(...)` diambil utuh, lalu diperiksa
    // argumennya.
    const calls = source.match(/\.postMessage\([\s\S]*?\);/g) ?? [];
    expect(calls.length, "postMessage harus tetap ada, bukan dihapus").toBeGreaterThan(0);
    for (const call of calls) {
      expect(
        call.includes('"*"') || call.includes("'*'"),
        `postMessage dengan penanda bintang ditemukan:\n${call}`,
      ).toBe(false);
    }
  });

  test("origin berasal dari daftar putih eksplisit", () => {
    expect(source).toContain("trustedParentOrigins");
    expect(source).toContain("VITE_PREVIEW_PARENT_ORIGIN");
    // Nilai yang diturunkan dari pengirim tidak boleh dipakai sebagai tujuan:
    // itu memantulkan pesan ke siapa pun yang bertanya.
    expect(source, "event.origin tidak boleh dipakai sebagai tujuan kirim").not.toMatch(
      /postMessage\([\s\S]{0,200}event\.origin/,
    );
    expect(source, "document.referrer tidak boleh menjadi tujuan kirim").not.toMatch(
      /postMessage\([\s\S]{0,200}document\.referrer/,
    );
  });

  test("halaman yang tidak berada di dalam iframe tidak mengirim apa pun", () => {
    expect(source).toContain("window.parent === window");
  });

  test("perintah navigasi masuk memeriksa sumber DAN originnya", () => {
    expect(source, "event.source harus diperiksa").toContain(
      "event.source !== window.parent",
    );
    expect(source, "origin pengirim harus diperiksa terhadap daftar putih").toMatch(
      /allowed\.includes\(event\.origin\)/,
    );
  });

  test("daftar putih kosong berarti tidak ada pesan yang keluar", () => {
    // Di PROD tanpa `VITE_PREVIEW_PARENT_ORIGIN`, fungsi ini mengembalikan
    // daftar kosong - dan itu harus berarti "tidak mengirim", bukan "kirim ke
    // bintang sebagai gantinya".
    expect(source).toMatch(/allowed\.length === 0\)\s*return;/);
  });
});
