/// <reference types="vite/client" />
/**
 * FASE 9.1 - PEKERJAAN 4: mengunci skema field form bersama.
 *
 * Yang dikunci test ini bukan tampilan, melainkan dua hal yang hilang begitu
 * ada refactor berikutnya:
 *
 * 1. LABEL HARUS TERHUBUNG KE KONTROLNYA lewat `htmlFor` + `id`. Sebelumnya
 *    tiap form menulis ulang `<label><span>Nama</span><input/></label>` dengan
 *    sendirinya, dan separuh dari itu bergantung pada asosiasi implisit - yang
 *    hilang begitu markup-nya dirapikan sedikit saja.
 * 2. TIDAK ADA FIELD YANG LABELNYA HANYA PLACEHOLDER. Kolom paket di dua
 *    file berbeda punya nama yang berbeda ("Cakupan area paket" vs "Area
 *    layanan paket") dan hanya `aria-label` tanpa teks yang terlihat.
 *
 * `e2e/main-flow.spec.ts` mencari "Judul kebutuhan" dan "Ceritakan
 * kebutuhan" lewat `getByLabel`, jadi nama aksesibel form warga adalah kontrak
 * yang tidak boleh diganti diam-diam.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const formField = read("./form-field.tsx");
const dashboard = read("../pages/Dashboard.tsx");
const community = read("./community-widgets.tsx");

test("modul bersama membangkitkan id dan menyambungkan label ke kontrol", () => {
  const code = stripComments(formField);
  // Satu sumber id untuk label dan kontrol. Tanpa ini, `htmlFor` menulis
  // string yang tidak pernah dipadeni ke id kontrol.
  expect(code).toContain("useId()");
  expect(code).toMatch(/<label[\s\S]{0,200}htmlFor=\{id\}/);
  // Kontrol teks memakai id yang dibangkitkan itu, baik input maupun textarea.
  expect(code).toMatch(/<input[\s\S]{0,400}id=\{id\}/);
  expect(code).toMatch(/<textarea[\s\S]{0,400}id=\{id\}/);
});

test("keterangan field selalu terikat lewat aria-describedby", () => {
  const code = stripComments(formField);
  // Sebelumnya cuma dua field dari dua puluh yang punya `aria-describedby`,
  // dan keduanya menulis id-nya sendiri di tempat yang berbeda.
  expect(code).toContain("aria-describedby={describedBy}");
  // Id keterangan dibangkitkan dari id field yang sama, lalu dipakai dua kali:
  // dirujuk oleh kontrol dan dipasang pada elemen keterangannya.
  expect(code).toMatch(/const hintId = hint \? `\$\{id\}-hint` : undefined/);
  expect(code).toMatch(/<span id=\{hintId\}/);
});

test("gaya input tetap milik pemanggil, bukan milik modul", () => {
  const code = stripComments(formField);
  // Modul ini mengatur tata letak. Palet fokus tiap area tidak boleh
  // ikut pindah ke sini, karena `ownerInputClass` dan `inputClass` punya
  // warna fokus yang sudah disetujui.
  expect(code).not.toContain("focus:border-blue-500");
  expect(code).not.toContain("focus:ring-blue-100");
  expect(code).toContain("controlClassName");
});

test("area warga memakai skema bersama, bukan menulis ulang label sendiri", () => {
  for (const [name, code] of [
    ["Dashboard.tsx", dashboard],
    ["community-widgets.tsx", community],
  ] as const) {
    const bare = stripComments(code);
    expect(bare, `${name} masih menulis ulang markup label sendiri`).not.toMatch(
      /<label[^>]*>\s*<span className="text-sm font-extrabold text-slate-800"/,
    );
    expect(bare, `${name} belum mengimpor skema bersama`).toMatch(
      /from "@\/components\/form-field"/,
    );
    // <label> yang membungkus tombol bukan lagi asosiasi label, itu pemicu
    // klik ganda: menekan tombol ikut memfokuskan kolom yang tidak
    // disentuh pengguna.
    expect(bare, `${name} masih membungkus kontrol non-teks di dalam label`).not.toMatch(
      /<label[^>]*>[\s\S]{0,900}?<button/,
    );
  }
});

test("tidak ada lagi isian yang labelnya hanya placeholder", () => {
  for (const [name, code] of [
    ["Dashboard.tsx", dashboard],
    ["community-widgets.tsx", community],
  ] as const) {
    const bare = stripComments(code);
    // `aria-label` tanpa teks yang terlihat = placeholder yang hilang begitu
    // pengguna mengetik. Form paket di kedua file kena masalah ini. Yang
    // dikecualikan hanya `aria-label` pada tombol, select, dan section:
    // Kontrol non-teks memang tidak punya label terlihat.
    expect(bare, `${name} masih punya isian tanpa label terlihat`).not.toMatch(
      /<input aria-label=/,
    );
    expect(bare, `${name} masih punya textarea tanpa label terlihat`).not.toMatch(
      /<textarea aria-label=/,
    );
  }
});

test("nama aksesibel form warga yang dipakai E2E tetap utuh", () => {
  // `e2e/main-flow.spec.ts:94-95` mengisi dua field ini lewat `getByLabel`.
  // Mengubah teksnya sama dengan E2E pecah, jadi harus jadi keputusan
  // eksplisit.
  for (const label of ["Judul kebutuhan", "Ceritakan kebutuhan"]) {
    expect(community).toContain(`label="${label}"`);
  }
});

test("penanda opsional ditulis dengan satu komponen", () => {
  const bare = stripComments(community);
  // Dua bentuk berbeda dalam satu berkas: "Anggaran singkat (opsional)" lewat
  // span di dalam label, "Gunakan lokasi saya ... (opsional)" lewat teks
  // polos. Baris kedua bukan field opsional, dia kotak centang, jadi
  // penjelasannya tidak boleh jadi penanda field.
  expect(bare).toContain("<OptionalNote />");
  expect(bare).not.toMatch(/font-medium text-slate-500">\(opsional\)/);
  expect(bare).toContain("Gunakan lokasi saya untuk pencocokan jarak (opsional)");
});

test("teks batas ukuran foto diambil dari modul yang sama dengan server", () => {
  // Teks ini sebelumnya berbunyi "maks. 1 MBeach": dua string yang salah
  // disambung oleh JSX. Batas server 1.000.000 byte, jadi angka di UI harus
  // datang dari satu sumber, bukan ditulis ulang.
  const bare = stripComments(community);
  expect(bare).toContain("MAX_IMAGE_LABEL");
  expect(bare).not.toMatch(/maks\. \d/);
});

test("varian field tanggal publik tidak berubah jadi varian admin", () => {
  // `admin-profile.test.ts` juga menahan ini; diulang supaya bentuk baru
  // lewat modul bersama tidak bisa menjatuhkan kelasnya.
  expect(community).toContain("field-date field-date--public");
  expect(community).not.toContain("field-date--admin");
  expect(dashboard).toContain("field-datetime field-datetime--public");
});
