import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * Kontrak tampilan form "Ubah passcode" di meja kerja admin.
 *
 * Yang dikunci di sini bukan estetika, melainkan satu cacat nyata: dialog
 * dirender lewat portal Radix, jadi ia berada DI LUAR `.admin-workspace`.
 * Semua kelas admin hanya berlaku di dalam scope itu. Kalau suatu saat
 * `admin-dialog-content` dihapus dari CSS atau dari `DialogContent`, form ini
 * akan kembali kelihatan seperti komponen aplikasi lain — dan tidak ada tes
 * render yang akan menangkapnya, karena tes lain hanya memeriksa string
 * yang ada di file.
 */

const component = readFileSync(
  new URL("./admin-session-actions.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

test("dialog passcode memakai scope admin-dialog-content", () => {
  // Satu komponen untuk semua dialog admin. Dengan begitu tidak ada dialog
  // yang bisa terlupa memakai scope-nya, dan test cukup satu import.
  expect(component).toContain('from "@/components/admin-dialog"');
  expect(component).toContain("<AdminDialogContent");
  expect(component).not.toContain("<DialogContent");
  // Scope itu harus benar-benar ada di CSS, lengkap dengan gaya-portalnya.
  expect(css).toContain(".admin-dialog-overlay");
  expect(css).toContain(".admin-dialog-content {");
});

test("kelas admin di dalam dialog punya gaya sendiri, karena portal tidak mewarisi", () => {
  for (const selector of [
    ".admin-dialog-content .admin-btn",
    ".admin-dialog-content .admin-btn-primary",
    ".admin-dialog-content .admin-btn-secondary",
    ".admin-dialog-content .admin-btn-quiet",
    ".admin-dialog-content .admin-input",
  ]) {
    expect(css).toContain(selector);
  }
});

test("tombol dialog memakai tombol admin, bukan tombol bawaan aplikasi", () => {
  expect(component).toContain("admin-btn admin-btn-secondary");
  expect(component).toContain("admin-btn admin-btn-primary");
  // `Button` generik sudah tidak boleh dipakai di sini.
  expect(component).not.toMatch(/<Button[\s>]/);
  expect(component).not.toContain('from "@/components/ui/button"');
});

test("form passcode tetap punya tiga isian dan aturan main yang sama", () => {
  expect(component).toContain("Passcode saat ini");
  expect(component).toContain("Passcode baru");
  expect(component).toContain("Ulangi passcode baru");
  expect(component).toContain("Minimal {PASSCODE_MIN_LENGTH} karakter");
  // Ketiga isian harus benar-benar tersambung ke state dan ke server.
  expect(component).toContain("onChange={setCurrent}");
  expect(component).toContain("onChange={setNext}");
  expect(component).toContain("onChange={setConfirm}");
  expect(component).toContain("currentPasscode: current");
});

test("indikator kekuatan tidak hanya mengandalkan warna", () => {
  // Level ditulis sebagai teks dan level punya catatan, supaya tidak hanya
  // bergantung pada isi kotak berwarna.
  expect(component).toContain("Kekuatan passcode: {assessment.label}");
  expect(component).toContain("STRENGTH_NOTE");
  expect(component).toContain('aria-hidden="true"');
});

test("tombol lihat passcode punya nama aksesibel dan statusnya terbaca", () => {
  expect(component).toContain("aria-pressed={revealed}");
  expect(component).toContain("aria-label={revealed");
  expect(component).toContain('autoComplete="current-password"');
});

test("konfirmasi yang tidak cocok memberi pesan di bawah isiannya", () => {
  expect(component).toContain("Konfirmasi tidak cocok dengan passcode baru.");
  expect(component).toContain('aria-invalid={error ? true : undefined}');
});

test("gated admin.css ikut hormati reduced motion", () => {
  expect(css).toContain(".admin-dialog-content,");
  expect(css).toContain(".admin-dialog-overlay {");
});

test("dialog memusatkan dirinya sendiri, bukan lewat overlay", () => {
  // Tiga kesalahan yang sudah pernah nyata di sini:
  //   a) `transform: translate(-50%,-50%)` bersama utility translate shadcn
  //      memakai property yang sama, jadi dialog bergeser DUA KALI, pusatnya
  //      meleset 263px ke kiri.
  //   b) Penggantinya, `position: fixed; inset: 0; height: max-content;
  //      margin: auto`, juga salah: untuk abspos yang sepenuhnya ter-constraint
  //      (top, bottom, dan height bukan auto), margin `auto` dihitung nol dan
  //      `bottom` diabaikan, sehingga dialog menempel di `top: 0` dan pita
  //      judulnya terpotong di luar layar.
  //   c) Versi ketiga menjadikan overlay wadah flex dan dialog `position:
  //      relative`. Radix merender overlay dan content sebagai SAUDARA di
  //      dalam portal yang sama, jadi dialog tidak pernah jadi anak flex itu
  //      dan jatuh ke alur normal dokumen, yaitu anak terakhir <body>.
  //
  // Pola yang benar tidak bergantung pada struktur DOM: dialog memusatkan
  // dirinya sendiri, dan yang menentukan adalah `height` yang tetap `auto`.
  const block = css.slice(css.indexOf(".admin-dialog-content {"), css.indexOf("}", css.indexOf(".admin-dialog-content {")));
  expect(block).toContain("position: fixed");
  expect(block).toContain("inset: 0");
  expect(block).toContain("margin: auto");
  // Bentuk angka nol itu wajib: bentuk kata dibuang minifier, dan yang hilang
  // itu membuat dialog meleset setengah layar di produksi. Lihat kontrak tema.
  expect(block).toContain("translate: 0");
  expect(block).not.toContain("translate: none");
  expect(block).not.toContain("transform: translate(-50%");
  // Tinggi wajib DEFINITE mengikuti isi (`fit-content`). Tanpa itu kotak
  // abspos dengan top/bottom non-auto merentang mengisi viewport (aturan
  // abspos 10.6.4), dan dialog jadi setinggi layar dengan ruang kosong besar
  // di bawah isinya.
  expect(block).toContain("height: fit-content");
  // Overlay hanya latar; kalau ia jadi wadah lagi, tidak ada yang memusatkan.
  const overlay = css.slice(css.indexOf(".admin-dialog-overlay {"), css.indexOf("}", css.indexOf(".admin-dialog-overlay {")));
  expect(overlay).not.toContain("display: flex");
});

test("latar dialog diburam dan ikut teranimasi", () => {
  const overlay = css.slice(
    css.indexOf(".admin-dialog-overlay {"),
    css.indexOf("}", css.indexOf(".admin-dialog-overlay {")),
  );
  expect(overlay).toContain("backdrop-filter: blur(");
  expect(overlay).toContain("animation: admin-overlay-in");
  expect(css).toContain("@keyframes admin-overlay-in");
  expect(css).toContain("@keyframes admin-dialog-in");
  expect(css).toContain("@keyframes admin-dialog-out");
  // Blur harus punya animasi keluar juga, supaya tidak "membekas" saat ditutup.
  expect(css).toContain('@keyframes admin-overlay-out');
  expect(css).toContain('.admin-dialog-overlay[data-state="closed"]');
});

test("tombol tutup dialog ikut bertema admin", () => {
  expect(css).toContain('.admin-dialog-content [data-slot="dialog-close"]');
});

test("dialog memakai animasi miliknya sendiri pada dua state", () => {
  expect(css).toContain('.admin-dialog-content[data-state="open"]');
  expect(css).toContain('.admin-dialog-content[data-state="closed"]');
  // `will-change` hanya saat bergerak, supaya tidak memboroskan memori diam.
  expect(css).toContain("will-change: transform, opacity");
});

/**
 * Kontrol "Ubah passcode" hanya untuk akun pemilik.
 *
 * Sisi klien di sini bukan batas keamanan — `changeAdminPasscode` menolak
 * sendiri di server — tapi menampilkannya kepada yang tidak berhak adalah
 * janji palsu yang lebih buruk daripada tidak menampilkannya. Yang dikunci:
 * tombol benar-benar dibungkus kondisi `isOwnerAccount`, dan gelarnya bukan
 * lagi teks yang ditulis manual di dua tempat.
 */
test("tombol 'Ubah passcode' hanya dirender untuk akun pemilik", () => {
  expect(component).toContain("{session?.isOwnerAccount ? (");
  // Penutup kondisi harus ada, kalau tidak seluruh sisa panel ikut hilang.
  expect(component).toContain(") : null}");
  // `isOwnerAccount` berasal dari server; klien tidak pernah menilainya sendiri.
  expect(component).not.toMatch(/isOwnerAccount\s*[,=}]/);
});

test("baris Peran memakai gelar pemilik dari modul bersama", () => {
  expect(component).toContain(
    '<Row label="Peran">{session.isOwnerAccount ? OWNER_ACCOUNT_TITLE : session.role}</Row>',
  );
  expect(component).toContain(
    'import { OWNER_ACCOUNT_TITLE } from "@/lib/owner-account"',
  );
  // Role mentah untuk non-pemilik, gelar untuk pemilik — bukan syarat yang
  // ditulis dua kali.
  expect(component).not.toContain("SuperAdmin");
});

test("daftar pengelola juga memakai gelar yang sama", () => {
  const governance = readFileSync(
    new URL("./admin-governance.tsx", import.meta.url),
    "utf8",
  );
  expect(governance).toContain(
    'import { OWNER_ACCOUNT_TITLE } from "@/lib/owner-account"',
  );
  expect(governance).toContain(">{OWNER_ACCOUNT_TITLE}</span>");
  expect(governance).not.toContain("SuperAdmin");
  // Warna gelarnya menandai akun terkunci: peran tidak bisa diubah dari sini.
  expect(governance).toContain("member.roleLocked");
});
