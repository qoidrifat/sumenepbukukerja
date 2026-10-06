import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const src = readFileSync(new URL("./sync-indicator.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const widgets = readFileSync(new URL("./community-widgets.tsx", import.meta.url), "utf8");
const warga = readFileSync(new URL("../pages/WargaDashboard.tsx", import.meta.url), "utf8");

describe("SyncIndicator memakai sistem antrean nyata", () => {
  test("memakai syncNow + useOfflineQueue + formatLastSync", () => {
    expect(src).toContain("syncNow");
    expect(src).toContain("useOfflineQueue");
    expect(src).toContain("formatLastSync");
  });

  test("aria-label tombol + role=status teks", () => {
    expect(src).toContain("Segarkan sinkronisasi");
    expect(src).toContain('role="status"');
  });

  test("kelas spin kustom + guard reduced-motion pada keyframes", () => {
    expect(src).toContain("sync-indicator-spin");
    expect(css).toContain("sync-indicator-rotate");
    expect(css).toContain("prefers-reduced-motion");
  });

  test("JUJUR: tanpa timer palsu", () => {
    expect(src).not.toContain("setTimeout");
    expect(src).not.toContain("setInterval");
  });

  test("tema publik + target sentuh + tanpa kelas admin", () => {
    expect(src).toContain("focusRing");
    expect(src).toContain("size-11");
    expect(src).not.toContain("admin-");
  });
});

describe("penempatan di header warga", () => {
  test("SyncIndicator di KIRI AccountMenu dalam header yang sama", () => {
    const indicatorIndex = warga.indexOf("<SyncIndicator");
    const menuIndex = warga.indexOf("<AccountMenu");
    expect(indicatorIndex).toBeGreaterThan(-1);
    expect(menuIndex).toBeGreaterThan(-1);
    expect(indicatorIndex).toBeLessThan(menuIndex);
    const headerStart = warga.indexOf("<header");
    const headerEnd = warga.indexOf("</header>", headerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(headerEnd).toBeGreaterThan(headerStart);
    expect(indicatorIndex).toBeGreaterThan(headerStart);
    expect(menuIndex).toBeLessThan(headerEnd);
  });
});

describe("section PwaControls informatif", () => {
  test("memuat last-sync + tombol Pasang/Perbarui tetap", () => {
    expect(widgets).toContain("formatLastSync(");
    expect(widgets).toContain("Terakhir diperbarui");
    expect(widgets).toContain("Pasang aplikasi");
    expect(widgets).toContain("Perbarui aplikasi");
  });

  test("lubang div kosong lama hilang", () => {
    expect(widgets).not.toContain('mt-3 flex flex-wrap gap-2"></div>');
  });
});
