import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

/**
 * Panel "Laporan error" — kontrak lebar barisnya.
 *
 * Baris laporan pernah terpotong di layar ponsel. Penyebabnya bukan panjang
 * teks, tetapi kelas flex yang mengunci lebar:
 *
 *  - kolom kanan memakai `shrink-0`, jadi lebarnya selalu max-content dan tidak
 *    pernah boleh menyusut. Di kartu selebar ~244px, kolom itu memaksa seluruh
 *    baris melebar keluar kartu lalu dipotong oleh `overflow-hidden` induknya.
 *  - status handoff memakai `inline-flex` TANPA `flex-wrap`, jadi ikon, label,
 *    waktu, dan kalimat alasan dijejerkan satu baris dan tidak bisa turun.
 *
 * Keduanya tidak kelihatan di desktop — di sana ruangnya cukup, jadi markupnya
 * tampak benar. Yang mengunci perilakunya adalah kelas di bawah, dan itulah
 * yang diuji di sini.
 */

const state = vi.hoisted(() => ({ reports: [] as unknown }));

vi.mock("@/lib/catalog-store", () => ({
  useErrorReports: () => state.reports,
  useErrorReportSummary: () => ({ open: 1, critical: 1, blocked: 0 }),
  useErrorReportActions: () => ({ setStatus: async () => undefined }),
}));

const { AdminErrorReports } = await import("./admin-error-reports");

const HANDOFF_REPORT = {
  _id: "err1",
  reportId: "ERR-20261001-0GTXIGT",
  severity: "critical",
  status: "open",
  title: "Gangguan sistem",
  feature: "handoff",
  operation: "kirim pesan admin",
  occurrences: 1,
  lastSeenAt: Date.UTC(2026, 9, 1, 13, 24, 4),
  firstSeenAt: Date.UTC(2026, 9, 1, 13, 24, 4),
  alertStatus: "handoff",
  alertAt: Date.UTC(2026, 9, 1, 13, 24, 5),
  alertReason: null,
  errorCode: "E_HANDOFF",
  source: "client",
  route: "/admin",
  requestId: "req_1",
  provider: "meta",
  providerCode: null,
  providerMessage: null,
  userRef: null,
  browser: "Chrome",
  os: "Android",
  environment: "production",
  message: "Tautan handoff gagal disiapkan.",
  userMessage: null,
  recommendedAction: "Periksa konfigurasi handoff.",
  stack: null,
};

const render = (reports: unknown) => {
  state.reports = reports;
  return renderToStaticMarkup(createElement(AdminErrorReports));
};

test("kolom kanan baris laporan boleh menyusut, bukan dikunci shrink-0", () => {
  const html = render([HANDOFF_REPORT]);

  expect(html).toContain("min-w-0 flex-col items-end gap-1 text-right");
  // `shrink-0` membuat kolom selalu selebar max-content; di ponsel itu yang
  // mendorong baris keluar kartu sampai terpotong.
  expect(html).not.toContain("shrink-0 flex-col items-end");
});

test("status handoff membungkus teksnya alih-alih memaksa satu baris", () => {
  const html = render([HANDOFF_REPORT]);

  // Ikon + label + waktu + kalimat alasan harus boleh turun baris.
  expect(html).toContain(
    "flex flex-wrap items-center justify-end gap-1 text-xs font-black text-[#FF5A26]",
  );
  // Kalimat alasannya bukan `block` lagi: di dalam kontainer flex, `block`
  // tidak pernah membuat baris baru, jadi nilainya hanya menyesatkan.
  expect(html).toContain('class="font-bold text-[#525252]"');
  expect(html).toContain(
    "Tautan handoff disiapkan. Pesan belum dikirim dari server.",
  );
});

test("isi laporan tetap utuh setelah pembungkusnya diubah", () => {
  const html = render([HANDOFF_REPORT]);

  expect(html).toContain("ERR-20261001-0GTXIGT");
  expect(html).toContain("Gangguan sistem");
  expect(html).toContain("Critical");
  expect(html).toContain("Siap dibuka");
});
