import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

/**
 * Footer dialog error: tombol handoff WhatsApp ke admin.
 *
 * State (URL siap pakai) dikunci di `error-reporter.test.ts`. Radix Dialog
 * tidak merender kontennya di render statis (mount terjadi di efek), jadi
 * yang dikunci di sini: (1) mock bus benar-benar dipakai dialog, dan
 * (2) sumber dialog mengandung jangkar `wa.me` berlabel "Kirim ke admin"
 * yang membuka tab baru dan hanya tampil bila tautan handoff siap.
 */

const dialogState = vi.hoisted(() => ({
  current: {
    phase: "reported" as const,
    title: "Terjadi kendala",
    message: "Gangguan.",
    occurredAt: 0,
    canRetry: false,
    reportId: "ERR-WA-DIALOG",
    adminWhatsappUrl: "https://wa.me/6287869512332?text=SYSTEM%20ERROR%20REPORT%20ERR-WA-DIALOG",
  },
}));

vi.mock("@/lib/error-report-bus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/error-report-bus")>();
  return {
    ...actual,
    subscribeErrorDialog: () => () => undefined,
    getErrorDialog: () => dialogState.current,
  };
});

import { describeErrorDialog, getErrorDialog } from "@/lib/error-report-bus";

const dialogSource = readFileSync(new URL("./error-report-dialog.tsx", import.meta.url), "utf8");

describe("tombol Kirim ke admin", () => {
  test("mock bus benar-benar dipakai dialog", () => {
    expect(getErrorDialog()).toBe(dialogState.current);
    expect(describeErrorDialog(dialogState.current).open).toBe(true);
    expect(describeErrorDialog(dialogState.current).showWhatsapp).toBe(true);
  });

  test("jangkar wa.me ter-render dengan tab baru dan hanya bila tautan siap", () => {
    expect(dialogSource).toContain("Kirim ke admin");
    expect(dialogSource).toContain("view.showWhatsapp && state.adminWhatsappUrl");
    expect(dialogSource).toContain('target="_blank"');
    expect(dialogSource).toContain('rel="noreferrer"');
  });

  test("terkunci sampai laporan diteruskan, lalu Tutup Pesan selebar penuh", () => {
    // X, Esc, dan klik-luar diblokir selama tautan belum ditekan.
    expect(dialogSource).toContain("!locked");
    expect(dialogSource).toContain("onEscapeKeyDown");
    expect(dialogSource).toContain("patchErrorDialog({ adminShared: true })");
    // Setelah diteruskan: tombol WA hilang, "Tutup Pesan" w-full.
    expect(dialogSource).toContain("Tutup Pesan");
    expect(dialogSource).toContain("showTutupPesan");
    expect(dialogSource).toContain("w-full");
  });
});
