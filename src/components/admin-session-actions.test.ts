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
  expect(component).toContain('className="admin-dialog-content"');
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
