import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

/**
 * Uji render statis untuk panel "Percobaan masuk ruang admin".
 *
 * Environment proyek memakai edge-runtime tanpa DOM, jadi yang diuji adalah
 * markup hasil render (static) — cukup untuk mengunci kontrak yang paling
 * berisiko: hierarki badge, Invariant penyamaran, dan ketahanan baris legacy
 * yang field barunya kosong. Interaksi klik (buka detail) diuji manual lewat
 * preview, bukan di file ini.
 */

const state = vi.hoisted(() => ({
  events: null as unknown,
  summary: null as unknown,
  ips: [] as unknown[],
  session: null as unknown,
}));

vi.mock("@/lib/catalog-store", () => ({
  useAdminSecurityEvents: () => state.events,
  useAdminSecuritySummary: () => state.summary,
  useAdminIpActivity: () => state.ips,
  useCurrentAdminSession: () => state.session,
}));

const { AdminSecurityLog } = await import("./admin-security-log");

const CREATED_AT = Date.UTC(2026, 8, 27, 6, 16, 7);

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  _id: "evt1",
  outcome: "success" as const,
  failureReason: null,
  emailMasked: null,
  ipMasked: null,
  ipSource: null,
  country: null,
  region: null,
  city: null,
  networkType: null,
  userAgent: null,
  browser: null,
  browserVersion: null,
  os: null,
  osVersion: null,
  deviceType: null,
  timezone: null,
  locale: null,
  platform: null,
  viewport: null,
  devicePixelRatio: null,
  touchPoints: null,
  route: null,
  returnTo: null,
  referrer: null,
  acceptLanguage: null,
  sessionFingerprint: null,
  requestId: null,
  attemptNumber: null,
  createdAt: CREATED_AT,
  attemptsInWindow: 1,
  failedInWindow: 0,
  successfulInWindow: 1,
  status: "Normal",
  sessionLive: false,
  previousSuccessAt: null,
  sameIpAsPrevious: null,
  sameDeviceAsPrevious: null,
  ...overrides,
});

const fullEvent = makeEvent({
  outcome: "success",
  ipMasked: "103.21.44.xxx",
  ipSource: "x-forwarded-for",
  country: "Indonesia",
  region: "Jawa Timur",
  city: "Sumenep",
  os: "Windows",
  osVersion: "10/11",
  browser: "Chrome",
  browserVersion: "154",
  deviceType: "Desktop",
  timezone: "Asia/Jakarta",
  locale: "id-ID",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154",
  platform: "Win32",
  viewport: "1440x900",
  devicePixelRatio: 2,
  touchPoints: 0,
  acceptLanguage: "id-ID,id;q=0.9",
  sessionFingerprint: "••••cdef",
  requestId: "req_7f4••••92a1",
  route: "/admin-gate/verify",
  returnTo: "/admin",
  referrer: "https://contoh.id/auth",
  emailMasked: "a****@contoh.id",
  attemptNumber: 1,
  sessionLive: true,
});

const render = (events: unknown[], summary: unknown = null) => {
  state.events = { events, nextCursor: null, total: events.length };
  state.summary = summary;
  return renderToStaticMarkup(createElement(AdminSecurityLog));
};

test("event sukses: status, waktu, perangkat, dan lokasi terbaca tanpa membuka detail", () => {
  const html = render([fullEvent]);

  expect(html).toContain("Berhasil");
  expect(html).toContain("Aktif sekarang");
  expect(html).toContain("Windows 10/11 · Chrome 154 · Desktop");
  expect(html).toContain("Asia/Jakarta · id-ID");
  expect(html).toContain("IP 103.21.44.xxx");
  expect(html).toContain("Sumenep, Jawa Timur, Indonesia");
  // Status "Normal" bukan informasi, jadi tidak naik ke level 1.
  expect(html).not.toContain(">Normal<");
  // Disclosure punya aria-expanded + aria-controls yang saling terkait.
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-controls="security-detail-evt1"');
  expect(html).toContain("Lihat detail keamanan");
});

test("metadata teknis tetap disembunyikan sampai detail dibuka", () => {
  const html = render([fullEvent]);

  for (const technical of [
    "Mozilla/5.0",
    "1440x900",
    "Win32",
    "id-ID,id;q=0.9",
    "••••cdef",
    "req_7f4••••92a1",
    "/admin-gate/verify",
  ]) {
    expect(html).not.toContain(technical);
  }
});

test("percobaan gagal dengan rate limit menampilkan dua badge terpisah", () => {
  const html = render([
    makeEvent({
      _id: "evt2",
      outcome: "failed",
      status: "Rate limited",
      failureReason: "wrong_passcode",
      failedInWindow: 4,
      attemptsInWindow: 5,
      attemptNumber: 4,
    }),
  ]);

  expect(html).toContain("Gagal");
  expect(html).toContain("Rate limited");
  expect(html).toContain("percobaan ke-4");
  // Alasan kegagalan milik detail, bukan level 1.
  expect(html).not.toContain("Passcode salah");
});

test("hasil terkunci tidak mengulang badge Blocked", () => {
  const html = render([makeEvent({ _id: "evt3", outcome: "locked", status: "Blocked" })]);

  expect(html).toContain("Terkunci");
  expect(html).not.toContain(">Blocked<");
});

test("perubahan perangkat dan IP tampil sebagai chip kontekstual", () => {
  const html = render([
    makeEvent({ _id: "evt4", sameIpAsPrevious: false, sameDeviceAsPrevious: false }),
  ]);

  expect(html).toContain("Perangkat berbeda");
  expect(html).toContain("IP berbeda");
  // Istilah faktual, bukan bahasa menghakimi.
  expect(html).not.toMatch(/hacker|attacker|malicious|compromised/i);
});

test("beberapa kegagalan setelah login berhasil tetap terlihat", () => {
  const html = render([
    makeEvent({ _id: "evt5", status: "Normal", failedInWindow: 2, attemptsInWindow: 3 }),
  ]);

  expect(html).toContain("2× gagal sebelumnya");
});

test("baris legacy tanpa field baru tetap utuh dan tidak bocor undefined", () => {
  const html = render([makeEvent({ _id: "evt6", outcome: "failed" })]);

  expect(html).toContain("Gagal");
  expect(html).toContain("Tidak terdeteksi");
  expect(html).not.toMatch(/undefined|null|NaN/);
  // Lokasi kosong harus tampil muted, bukan dianggap error.
  expect(html).toContain("Lokasi Tidak terdeteksi");
});

test("ringkasan memakai angka 24 jam dan memisahkan total tercatat", () => {
  const html = render([fullEvent], {
    total: 40,
    last24h: 27,
    succeeded24h: 21,
    failed24h: 4,
    locked24h: 2,
    lastEventAt: CREATED_AT,
  });

  expect(html).toContain("24 jam terakhir");
  expect(html).toContain("Total tercatat 40 percobaan");
  expect(html).toContain("Percobaan");
  expect(html).toContain("Berhasil");
  expect(html).toContain("Terkunci");
});

test("empty state menjelaskan apa yang akan muncul, bukan tabel kosong", () => {
  const html = render([], { total: 0, last24h: 0, succeeded24h: 0, failed24h: 0, locked24h: 0, lastEventAt: null });

  expect(html).toContain("Belum ada percobaan masuk.");
  expect(html).toContain("Aktivitas akses admin akan muncul di sini.");
  expect(html).not.toContain("Lihat detail keamanan");
});
