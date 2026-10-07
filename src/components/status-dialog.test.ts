import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { resolveDialogVariant } from "@/lib/connection-status";

/**
 * Dialog status bertema + host koneksi (Task S2).
 *
 * SATU shell komposisi DialogShell({variant, children}): admin memakai
 * AdminDialogContent, warga memakai ui DialogContent. Varian diputus murni
 * dari pathname (mount global di luar BrowserRouter, jadi baca
 * window.location.pathname saat dialog dibuka). Dialog kritis (silent)
 * membuka kunci tutup HANYA sesudah tap WA (cermin showTutupPesan error
 * dialog); non-kritis punya tombol Tutup biasa + WA opsional.
 *
 * A11y: Radix sudah role=dialog + aria-modal + focus-trap + Esc; tambah
 * aria-describedby ke body + status role=status; fokus ikut Radix default
 * (tanpa custom trap); semua tombol min-h-12 + focusRing.
 */

const dialogSource = readFileSync(new URL("./status-dialog.tsx", import.meta.url), "utf8");

describe("resolveDialogVariant murni dari pathname", () => {
  test('"/admin" menjadi admin', () => {
    expect(resolveDialogVariant("/admin")).toBe("admin");
  });

  test('"/warga/dashboard" menjadi warga', () => {
    expect(resolveDialogVariant("/warga/dashboard")).toBe("warga");
  });

  test('"/" menjadi warga', () => {
    expect(resolveDialogVariant("/")).toBe("warga");
  });
});

describe("shell komposisi tunggal, bukan duplikat dialog", () => {
  test("DialogShell diekspor dan bercabang per varian", () => {
    expect(dialogSource).toContain("DialogShell");
    expect(dialogSource).toContain("<AdminDialogContent");
    expect(dialogSource).toContain("<DialogContent");
  });

  test("host merender StatusDialog dan meneruskan varian dari resolveDialogVariant", () => {
    expect(dialogSource).toContain("<StatusDialog");
    expect(dialogSource).toContain("variant={");
    expect(dialogSource).toContain("resolveDialogVariant(");
  });

  test("window.location.pathname tidak disebar — satu titik baca", () => {
    const reads = (dialogSource.match(/window\.location\.pathname/g) ?? []).length;
    expect(reads).toBe(1);
  });
});

describe("alur WA jujur + kunci tutup kritis", () => {
  test("WA memakai buildStatusHandoffMessage + buildAdminWhatsappLink", () => {
    expect(dialogSource).toContain("buildStatusHandoffMessage");
    expect(dialogSource).toContain("buildAdminWhatsappLink");
  });

  test("kritis (silent) terkunci sampai tap WA, lalu Tutup Pesan selebar penuh", () => {
    expect(dialogSource).toContain("statusShared");
    expect(dialogSource).toContain("setStatusShared(true)");
    expect(dialogSource).toContain("Tutup Pesan");
    expect(dialogSource).toContain("w-full");
    expect(dialogSource).toContain("onEscapeKeyDown");
  });

  test("non-kritis punya tombol Tutup biasa", () => {
    expect(dialogSource).toContain("Tutup");
  });

  test("state shared milik modul baru, bukan bus error", () => {
    expect(dialogSource).not.toContain("patchErrorDialog");
    expect(dialogSource).not.toContain("error-report-bus");
  });
});

describe("a11y kontrak", () => {
  test("status role=status + aria-describedby ke body", () => {
    expect(dialogSource).toContain('role="status"');
    expect(dialogSource).toContain("aria-describedby");
  });

  test("semua tombol min-h-12 + focusRing, tanpa custom focus trap", () => {
    expect(dialogSource).toContain("min-h-12");
    expect(dialogSource).toContain("focusRing");
    expect(dialogSource).not.toContain("onOpenAutoFocus");
  });
});
