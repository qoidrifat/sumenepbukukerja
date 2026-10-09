import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * Uji render statis untuk panel "Percobaan masuk ruang admin".
 *
 * Environment proyek memakai edge-runtime tanpa DOM, jadi yang diuji adalah
 * markup hasil render (static) — cukup untuk mengunci kontrak yang paling
 * berisiko: hierarki badge, Invariant penyamaran, dan ketahanan baris legacy
 * yang field barunya kosong. Interaksi klik (buka detail) diuji manual lewat
 * preview, bukan di file ini.
 */

const { state, mockUseAdminSecurityEvents, mockUseAdminSecuritySummary, mockUseAdminIpActivity } =
  vi.hoisted(() => {
    const state = {
      events: null as unknown,
      summary: null as unknown,
      // Kontrak `listAdminIpActivity`: objek `{ rows, truncated }`, bukan larik.
      ips: { rows: [], truncated: false } as unknown,
      session: null as unknown,
    };
    // `vi.fn` membungkus nilai yang sama seperti pola mock sebelumnya, supaya
    // pemanggilan hook bisa diasersi (aturan visibilitas langganan).
    const mockUseAdminSecurityEvents = vi.fn((...args: unknown[]) => {
      void args;
      return state.events;
    });
    const mockUseAdminSecuritySummary = vi.fn((...args: unknown[]) => {
      void args;
      return state.summary;
    });
    const mockUseAdminIpActivity = vi.fn((...args: unknown[]) => {
      void args;
      return state.ips;
    });
    return { state, mockUseAdminSecurityEvents, mockUseAdminSecuritySummary, mockUseAdminIpActivity };
  });

vi.mock("@/lib/catalog-store", () => ({
  useAdminSecurityEvents: (...args: unknown[]) => mockUseAdminSecurityEvents(...args),
  useAdminSecuritySummary: (...args: unknown[]) => mockUseAdminSecuritySummary(...args),
  useAdminIpActivity: (...args: unknown[]) => mockUseAdminIpActivity(...args),
  useCurrentAdminSession: () => state.session,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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

type RenderOpts = {
  /** Hilangkan `total` halaman, seperti backend saat truncated (total diomit). */
  omitPageTotal?: boolean;
  /** Tandai halaman terpotong (`truncated: true`). */
  pageTruncated?: boolean;
  /** Tandai aktivitas IP terpotong. */
  ipTruncated?: boolean;
};

const render = (events: unknown[], summary: unknown = null, opts: RenderOpts = {}) => {
  state.events = {
    events,
    nextCursor: null,
    ...(opts.omitPageTotal ? {} : { total: events.length }),
    ...(opts.pageTruncated ? { truncated: true } : {}),
  };
  // `summary` dipakai apa adanya supaya pemanggil bisa menyertakan
  // `truncated: true` TANPA `total`, persis bentuk backend saat memangkas.
  state.summary = summary;
  state.ips = { rows: [], truncated: Boolean(opts.ipTruncated) };
  return renderToStaticMarkup(createElement(AdminSecurityLog, {}));
};

const renderSecuritySection = ({ open = true }: { open?: boolean } = {}) => {
  state.events = { events: [], nextCursor: null, total: 0 };
  state.summary = null;
  state.ips = { rows: [], truncated: false };
  return renderToStaticMarkup(createElement(AdminSecurityLog, { open }));
};

test("section tertutup mem-skip langganan security", () => {
  renderSecuritySection({ open: false });
  expect(mockUseAdminSecurityEvents).toHaveBeenCalledWith(25, undefined, false);
  expect(mockUseAdminSecuritySummary).toHaveBeenCalledWith(24, false);
  expect(mockUseAdminIpActivity).toHaveBeenCalledWith(12, false);
});

test("section terbuka tetap melanggan security", () => {
  renderSecuritySection({ open: true });
  expect(mockUseAdminSecurityEvents).toHaveBeenCalledWith(25, undefined, true);
  expect(mockUseAdminSecuritySummary).toHaveBeenCalledWith(24, true);
  expect(mockUseAdminIpActivity).toHaveBeenCalledWith(12, true);
});

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

test("badge \"Percobaan terakhir\" boleh menyusut dan membungkus", () => {
  const html = render([fullEvent], {
    total: 40,
    last24h: 27,
    succeeded24h: 21,
    failed24h: 4,
    locked24h: 2,
    lastEventAt: CREATED_AT,
  });

  // Badge ini duduk di baris `justify-between` di samping judul kartu.
  // Dengan `shrink-0` lebarnya selalu max-content, jadi di layar ponsel ia
  // meluber keluar kartu alih-alih ikut menyusut.
  const textAt = html.indexOf("Percobaan terakhir");
  expect(textAt).toBeGreaterThan(-1);
  const badge = html.slice(html.lastIndexOf("<span class=", textAt), textAt);

  expect(badge).toContain("flex-wrap");
  expect(badge).toContain("min-w-0");
  expect(badge).not.toContain("shrink-0");
});

test("empty state menjelaskan apa yang akan muncul, bukan tabel kosong", () => {
  const html = render([], { total: 0, last24h: 0, succeeded24h: 0, failed24h: 0, locked24h: 0, lastEventAt: null });

  expect(html).toContain("Belum ada percobaan masuk.");
  expect(html).toContain("Aktivitas akses admin akan muncul di sini.");
  expect(html).not.toContain("Lihat detail keamanan");
});

test("total disembunyikan dan badge sampled tampil saat backend memangkas", () => {
  const html = render(
    [fullEvent],
    {
      last24h: 27,
      succeeded24h: 21,
      failed24h: 4,
      locked24h: 2,
      lastEventAt: CREATED_AT,
      truncated: true,
      // `total` sengaja absen: backend mengomitnya saat truncated.
    },
    { omitPageTotal: true, pageTruncated: true },
  );

  expect(html).not.toContain("Total tercatat");
  expect(html).not.toContain("dari 0 percobaan");
  expect(html).not.toMatch(/undefined/);
  expect(html).toContain("Data sampled — angka adalah batas bawah");
  // Data asli tetap tampil.
  expect(html).toContain("Berhasil");
});

test("badge sampled tampil bila hanya aktivitas IP yang terpotong", () => {
  const html = render(
    [fullEvent],
    {
      total: 40,
      last24h: 27,
      succeeded24h: 21,
      failed24h: 4,
      locked24h: 2,
      lastEventAt: CREATED_AT,
    },
    { ipTruncated: true },
  );

  // Total yang eksak tetap tampil; hanya badge yang bertambah.
  expect(html).toContain("Total tercatat 40 percobaan");
  expect(html).toContain("Menampilkan 1 dari 1 percobaan");
  expect(html).toContain("Data sampled — angka adalah batas bawah");
});

test("empty state tak-diketahui-total tidak mengklaim kekosongan", () => {
  const html = render([], null, { omitPageTotal: true, pageTruncated: true });

  expect(html).not.toContain("Belum ada percobaan masuk.");
  expect(html).toContain("Tidak ada percobaan yang cocok dengan filter ini.");
  expect(html).toContain("Data sampled — angka adalah batas bawah");
});

test("aktivitas IP berbentuk larik lama (backend tertinggal) tidak menjatuhkan halaman", () => {
  // Produksi bisa menjalankan frontend yang lebih baru dari backend Convex
  // (deploy manual). Selama selisih versi, `listAdminIpActivity` masih
  // mengembalikan larik telanjang — bentuk yang dulu dipakai sebelum berubah
  // jadi `{ rows, truncated }`. Peramban tidak boleh crash hanya karena satu
  // seksi kehilangan field barunya.
  state.events = { events: [], nextCursor: null, total: 0 };
  state.summary = null;
  state.ips = [
    {
      ipHash: "hash1",
      ipMasked: "103.21.44.xxx",
      ipFamily: "IPv4",
      proxyDetected: null,
      attempts: 3,
      success: 1,
      failed: 2,
      lastSeenAt: CREATED_AT,
      isNew: true,
    },
  ];

  const html = renderToStaticMarkup(createElement(AdminSecurityLog, {}));

  expect(html).toContain("Aktivitas berdasarkan IP");
  expect(html).toContain("103.21.44.xxx");
  expect(html).toContain("IP baru");
});

test("keterangan alamat IP dibungkus satu elemen, tidak dipecah jadi beberapa flex item", () => {
  const html = render([fullEvent]);
  const start = html.indexOf('class="mt-3 flex items-start gap-2 text-xs leading-6 text-[#525252]"');
  expect(start).toBeGreaterThan(-1);
  const kalimat = html.slice(start, html.indexOf("</p>", start));

  // Kalimat ini memuat `<code>` di tengahnya. Di kontainer `flex` tanpa
  // `flex-wrap`, teks sebelum dan sesudah `<code>` jadi flex item terpisah,
  // sehingga lebar minimumnya = jumlah kata terpanjang tiap potongan, bukan
  // satu kata terpanjang. Di ponsel sempit itu membuat teksnya keluar dari
  // kotak. Karena itu seluruh kalimat harus berada dalam satu elemen.
  expect(kalimat).toMatch(/<\/svg><span class="min-w-0">/);
  expect(kalimat).toContain("Tidak terdeteksi");
  expect(kalimat).not.toMatch(/<\/svg>[^<]*Alamat IP/);
});
