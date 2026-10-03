import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Kontrak footer situs.
 *
 * Footer yang diganti sebelumnya hanya berisi dua kalimat dan tidak punya
 * navigasi sama sekali. Test di sini mengunci hal-hal yang paling mudah
 * hilang diam-diam di kemudian hari.
 *
 * Yang paling penting justru yang paling sederhana: tahun hak cipta tidak
 * boleh ditulis mati. Versi lama menulis `2025` secara literal, jadi setiap
 * tahun berikutnya situs menampilkan tahun yang basi tanpa ada yang gagal
 * build dan tanpa ada test yang merah.
 */

const baca = (relatif: string) =>
  readFileSync(fileURLToPath(new URL(relatif, import.meta.url)), "utf8");

const footerSource = baca("./site-footer.tsx");
const landingSource = baca("../pages/Landing.tsx");
// Section `#permintaan` berada di berkas lain, jadi keduanya harus ikut
// diperiksa. Hanya membaca Landing.tsx akan membuat jangkar yang sah
// terlihat seperti tautan mati.
const widgetSource = baca("./community-widgets.tsx");
const routerSource = baca("../main.tsx");
const sumberSection = landingSource + widgetSource;

/**
 * Kode tanpa baris komentar.
 *
 * Docblock komponen ini memuat contoh `href="#id"` sebagai penjelasan. Tanpa
 * penyaringan ini pola penarikan tautan ikut menghitungnya sebagai jangkar
 * sungguhan, dan test gagal karena tidak ada section dengan id "id".
 */
const kode = (sumber: string) =>
  sumber
    .split("\n")
    .filter((b) => !b.trim().startsWith("*") && !b.trim().startsWith("//"))
    .join("\n");

const footerKode = kode(footerSource);

/**
 * Tautan muncul dalam dua bentuk dan keduanya harus diperiksa.
 *
 * Bentuk pertama adalah literal `href="#id"` pada tombol ajakan. Bentuk kedua
 * berasal dari larik data untuk kolom navigasi, dan dirender lewat
 * `href={`#${id}`}` - jadi pola yang hanya mencari literal tidak pernah
 * melihatnya. terdeteksi sama dengan tautan mati yang lolos dari test.
 */
const jangkar = [
  ...[...footerKode.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]),
  ...[...footerKode.matchAll(/\{ label: "[^"]+", id: "([a-z-]+)" \}/g)].map((m) => m[1]),
];

/** Sama seperti di atas, tapi untuk rute: literal `to="/x"` dan larik data. */
const rute = [
  ...[...footerKode.matchAll(/to="(\/[^"]*)"/g)].map((m) => m[1]),
  ...[...footerKode.matchAll(/\{ label: "[^"]+", to: "(\/[^"]*)" \}/g)].map((m) => m[1]),
];

describe("tahun hak cipta", () => {
  test("tidak ditulis mati sebagai angka tahun", () => {
    expect(footerSource).toMatch(/new Date\(\)\.getFullYear\(\)/);
    expect(footerSource).not.toMatch(/©\s*20\d\d/);
  });

  test("tahun dirender di dalam elemen yang bisa dibaca", () => {
    expect(footerSource).toMatch(/<p>© \{TAHUN\} Sumenep Buku Kerja<\/p>/);
  });
});

describe("penggunaan di halaman landing", () => {
  test("landing memakai komponen footer, bukan footer sebaris", () => {
    expect(landingSource).toContain("<SiteFooter />");
    // Footer lama pernah berupa satu baris JSX panjang di dalam Landing.
    expect(landingSource).not.toMatch(/function Footer\(\)/);
    expect(landingSource).not.toMatch(/<footer/);
  });

  test("hanya ada satu elemen footer di seluruh halaman", () => {
    expect((landingSource.match(/<SiteFooter \/>/g) ?? []).length).toBe(1);
  });
});

describe("tautan footer", () => {
  test("tidak ada tautan placeholder", () => {
    // `href="#"` adalah tanda tautan palsu yang paling sering lolos.
    expect(footerSource).not.toMatch(/href="#"/);
    expect(footerSource).not.toMatch(/to="#"/);
  });

  test("tautan yang dirender benar-benar ada", () => {
    // Kalau daftar ini kosong, semua test di blok ini tidak memeriksa apa pun
    // dan tetap hijau - jadi keberadaannya ikut dijaga.
    expect(jangkar.length).toBeGreaterThanOrEqual(4);
    expect(rute.length).toBeGreaterThanOrEqual(2);
  });

  test("setiap jangkar benar-benar ada di halaman", () => {
    for (const id of [...new Set(jangkar)]) {
      expect(
        sumberSection.includes(`id="${id}"`),
        `jangkar #${id} tidak punya section dengan id itu`,
      ).toBe(true);
    }
  });

  test("setiap rute benar-benar terdaftar di router", () => {
    for (const to of [...new Set(rute)]) {
      expect(routerSource.includes(`path="${to}"`), `rute ${to} tidak ada di router`).toBe(true);
    }
  });

  test("tidak mengarang halaman hukum, sosial, atau kontak", () => {
    // Tidak ada route hukum di proyek ini. Menampilkannya sebagai tautan
    // akan jadi janji yang tidak bisa ditepati.
    const daftarPath = [...routerSource.matchAll(/path="([^"]*)"/g)].map((m) => m[1]);
    for (const p of daftarPath) {
      expect(p).not.toMatch(/privasi|privacy|syarat|terms|kebijakan|cookie|bantuan|hubungi/i);
    }
    for (const karangan of [
      "Kebijakan Privasi",
      "Syarat dan Ketentuan",
      "Kebijakan Cookie",
      "Hubungi Kami",
      "Pusat Bantuan",
    ]) {
      expect(footerSource).not.toContain(karangan);
    }
  });
});

describe("struktur dan aksesibilitas", () => {
  test("pakai elemen footer semantik", () => {
    expect(footerSource).toContain("<footer");
    expect(footerSource).toContain("</footer>");
  });

  test("setiap nav punya label yang bisa dibaca pembaca layar", () => {
    const nav = [...footerSource.matchAll(/<nav aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(nav.length).toBeGreaterThanOrEqual(2);
    for (const label of nav) expect(label.trim().length).toBeGreaterThan(0);
  });

  test("ilustrasi siluet disembunyikan dari pembaca layar", () => {
    // Yang diperiksa blok <svg>-nya, bukan sekadar keberadaan teks
    // `aria-hidden` di mana saja dalam berkas.
    const awal = footerSource.indexOf("<svg");
    const blok = footerSource.slice(awal, awal + 400);
    expect(awal).toBeGreaterThan(-1);
    expect(blok).toContain('aria-hidden="true"');
    expect(blok).toContain('focusable="false"');
  });

  test("setiap tautan punya nama yang bisa dibaca pembaca layar", () => {
    const tanpaNama = [...footerKode.matchAll(/<(a|Link)\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => !/aria-label=/.test(tag));
    // Tautan brand memakai aria-label; sisanya memakai teks di dalam.
    expect(tanpaNama.length).toBeGreaterThan(0);
    expect(footerSource).toContain('aria-label="Sumenep Buku Kerja, ke beranda"');
  });

  test("gambar logo punya dimensi eksplisit agar tidak bergeser", () => {
    expect(footerSource).toMatch(/<img[\s\S]*?width=\{40\}/);
    expect(footerSource).toMatch(/<img[\s\S]*?height=\{40\}/);
  });

  test("setiap tautan memakai utilitas cincin fokus", () => {
    const jangkarBaru = (footerSource.match(/<(a|Link)\b/g) ?? []).length;
    const fokus = (footerSource.match(/focusRing(Gelap)?/g) ?? []).length;
    expect(jangkarBaru).toBeGreaterThan(0);
    // Dua utilitas: satu untuk pita terang, satu untuk panel gelap.
    expect(footerSource).toContain("focus-visible:ring-2");
    expect(footerSource).toMatch(/focusRingGelap\s*=/);
    expect(fokus).toBeGreaterThanOrEqual(2);
  });
});

describe("ruang untuk navigasi bawah di layar kecil", () => {
  test("padding bawah melampaui tinggi navigasi bawah yang menempel", () => {
    // Navigasi bawah punya tinggi 4rem (h-16) ditambah safe area. Tanpa
    // padding yang melampaui itu, baris hak cipta tertutup navigasi - yang
    // memang terjadi di situs sebelum footer ini diganti, terukur 37px
    // tertutup pada lebar 390px.
    expect(footerSource).toMatch(/pb-\[calc\([^)]*env\(safe-area-inset-bottom\)[^)]*\)\]/);
  });

  test("padding bawah dikembalikan menjadi normal di layar lebar", () => {
    expect(footerSource).toMatch(/lg:pb-1[0-9]/);
  });
});

describe("kontras", () => {
  test("tidak memakai abu-abu yang gagal ambang WCAG AA di panel gelap", () => {
    // slate-400 di atas slate-950 hanya 4,4:1 pada ukuran 16px, di bawah
    // ambang 4,5:1. Terukur di peramban, bukan diperkirakan.
    expect(footerSource).not.toContain("text-slate-400");
  });

  test("tombol utama memakai biru yang kontrasnya cukup di atas putih", () => {
    // blue-600 di atas putih hanya 4,4:1; blue-700 mencapai 5,4:1.
    expect(footerSource).not.toContain("bg-blue-600");
    expect(footerSource).toContain("bg-blue-700");
  });
});