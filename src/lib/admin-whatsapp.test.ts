/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import {
  ADMIN_HANDOFF_EVIDENCE,
  ADMIN_WHATSAPP_BASE_URL,
  ADMIN_WHATSAPP_NUMBER,
  buildAdminDailySummaryMessage,
  buildAdminHandoffMessage,
  buildAdminWhatsappLink,
  buildStatusHandoffMessage,
  isValidAdminNumber,
  maskAdminNumber,
} from "./admin-whatsapp";

/**
 * Kontrak tautan handoff admin.
 *
 * `wa.me` BUKAN WhatsApp Cloud API. Membuka tautan tidak membuktikan apa pun
 * tentang pengiriman: tidak ada message ID, tidak ada status, tidak ada
 * webhook balasan. Yang boleh diklaim hanya lima hal yang diuji di sini --
 * penerima benar, URL dasar benar, isi ter-encode dengan benar, tidak ada
 * kebocoran rahasia, dan hasilnya deterministik.
 *
 * Kalau tes ini perlu dilonggarkan agar migrasi terlihat berhasil, berarti
 * ada yang mengorbankan bukti. Jangan.
 */

/* ------------------------------------------------------------------ */
/* Test A - penerima                                                   */
/* ------------------------------------------------------------------ */

describe("Test A - penerima", () => {
  test("nomor tujuan adalah satu konstanta dengan bentuk internasional", () => {
    expect(ADMIN_WHATSAPP_NUMBER).toBe("6287869512332");
  });

  test("tanpa tanda +, spasi, tanda hubung, kurung, atau nol di depan", () => {
    expect(ADMIN_WHATSAPP_NUMBER).toMatch(/^62\d{9,13}$/);
    expect(ADMIN_WHATSAPP_NUMBER).not.toMatch(/[\s+\-()]/);
    expect(ADMIN_WHATSAPP_NUMBER.startsWith("0")).toBe(false);
  });

  test("bentuk sah diverifikasi, bentuk lain ditolak", () => {
    expect(isValidAdminNumber(ADMIN_WHATSAPP_NUMBER)).toBe(true);
    // Bentuk yang paling sering salah diketik di Indonesia.
    expect(isValidAdminNumber("+6287869512332")).toBe(false);
    expect(isValidAdminNumber("0812 3456 7890")).toBe(false);
    expect(isValidAdminNumber("628-7869-512332")).toBe(false);
    expect(isValidAdminNumber("(6287) 8695 12332")).toBe(false);
    expect(isValidAdminNumber("07869512332")).toBe(false);
    expect(isValidAdminNumber("")).toBe(false);
  });

  test("nomor ditampilkan tersamar, empat digit terakhir saja", () => {
    const masked = maskAdminNumber(ADMIN_WHATSAPP_NUMBER);
    expect(masked).not.toBe(ADMIN_WHATSAPP_NUMBER);
    expect(masked.endsWith("2332")).toBe(true);
    // Panjang tidak berubah supaya panel tidak membocorkan berapa digit
    // nomor tujuan punya; hanya empat digit terakhir yang terbaca.
    expect(masked).toHaveLength(ADMIN_WHATSAPP_NUMBER.length);
    expect(masked.replace(/\D/g, "")).toHaveLength(4);
  });
});

/* ------------------------------------------------------------------ */
/* Test B - URL dasar                                                 */
/* ------------------------------------------------------------------ */

describe("Test B - URL dasar", () => {
  test("URL dasar persis wa.me dengan nomor tujuan", () => {
    expect(ADMIN_WHATSAPP_BASE_URL).toBe("https://wa.me/6287869512332");
  });

  test("tanpa pesan, tautan tetap URL dasar yang valid", () => {
    expect(buildAdminWhatsappLink()).toBe(ADMIN_WHATSAPP_BASE_URL);
    expect(buildAdminWhatsappLink("")).toBe(ADMIN_WHATSAPP_BASE_URL);
    expect(buildAdminWhatsappLink("   \n  ")).toBe(ADMIN_WHATSAPP_BASE_URL);
  });

  test("URL hasil bangun benar-benar bisa diurai dan mengarah ke wa.me", () => {
    const url = new URL(buildAdminWhatsappLink("Halo"));
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("wa.me");
    expect(url.pathname).toBe(`/6287869512332`);
    expect(url.searchParams.get("text")).toBe("Halo");
  });
});

/* ------------------------------------------------------------------ */
/* Test C - isi ter-encode                                            */
/* ------------------------------------------------------------------ */

describe("Test C - pesan ter-encode dengan benar", () => {
  const message = "Halo & selamat pagi\nkapan? 100% #1";

  test("karakter khusus ter-encode, tidak pernah bocor ke query string", () => {
    const link = buildAdminWhatsappLink(message);
    // Spasi jadi %20, bukan "+" (URLSearchParams menulis "+", yang sah untuk
    // form-urlencoded tetapi bukan untuk komponen query RFC 3986).
    expect(link).toContain("%20");
    expect(link.split("?text=")[1]).not.toContain("+");
    expect(link).toContain("%26"); // &
    expect(link).toContain("%3F"); // ?
    expect(link).toContain("%23"); // #
    expect(link).toContain("%25"); // %
    // Baris baru tidak boleh menjadi baris baru di URL.
    expect(link).not.toContain("\n");
  });

  test("isi pulih utuh setelah di-decode", () => {
    const decoded = new URL(buildAdminWhatsappLink(message)).searchParams.get("text");
    expect(decoded).toBe(message);
  });

  test("yang ter-decode adalah pesan yang sudah dirapikan, apa adanya", () => {
    const messy = "  \n Judul \n\n\n Isi  ";
    const decoded = new URL(buildAdminWhatsappLink(messy)).searchParams.get("text");
    expect(decoded).toBe("Judul \n\n\n Isi");
  });

  test("pesan multibahasa tetap utuh", () => {
    const unicode = "Ringkasan 1 —_encode_ \"juga\" & ทดสอบ";
    expect(new URL(buildAdminWhatsappLink(unicode)).searchParams.get("text")).toBe(unicode);
  });

  test("pesan ringkasan harian memuat konteks, waktu, dan angka", () => {
    const text = buildAdminDailySummaryMessage({
      date: "2026-09-29",
      openErrorReports: 2,
      newRequests: 5,
      activeAdminSessions: 1,
    });
    expect(text).toContain("2026-09-29");
    expect(text).toContain("ringkasan harian");
    expect(text).toContain("2");
    expect(text).toContain("5");
    // Tidak perlu ada jam: pesan ini harus bisa dibandingkan antar hari.
    expect(text).not.toMatch(/\d{2}:\d{2}/);
  });

  test("pesan handoff umum menaruh konteks di baris pertama", () => {
    expect(buildAdminHandoffMessage({ title: " Judul ", body: "\n Isi \n" })).toBe("Judul\n\nIsi");
  });
});

/* ------------------------------------------------------------------ */
/* Test D - tidak ada kebocoran                                       */
/* ------------------------------------------------------------------ */

describe("Test D - tidak ada kebocoran rahasia atau data privat", () => {
  const FORBIDDEN = [
    "WHATSAPP_ACCESS_TOKEN",
    "EAAG", // awalan access token Meta
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
    "TWILIO_AUTH_TOKEN",
    "otp",
    "OTP",
    "password",
    "sandi",
    "secret",
    "ownerId",
    "businessId",
    "storageId",
    "subscriptionTier",
  ];

  test("pesan handoff tidak memuat akses, token, atau identitas internal", () => {
    const text = buildAdminHandoffMessage({
      title: "CRITICAL WHATSAPP_SEND_FAILED",
      body: buildAdminDailySummaryMessage({
        date: "2026-09-29",
        openErrorReports: 1,
        newRequests: 0,
        activeAdminSessions: 1,
      }),
    });
    for (const needle of FORBIDDEN) expect(text).not.toContain(needle);
  });

  test("URL handoff tidak pernah memakai provider lain", () => {
    const link = buildAdminWhatsappLink("uji");
    expect(link).not.toContain("graph.facebook.com");
    expect(link).not.toContain("api.twilio.com");
    expect(link.startsWith("https://wa.me/")).toBe(true);
  });

  test("isi pesan berstatus handoff tidak menambah apa pun di luar isinya", () => {
    // Build AdminHandoffMessage hanya menempelkan judul dan isi. Tidak ada
    // metadata yang diam-diam ikut: itulah yang membuat modul ini bisa
    // diuji tanpa database.
    expect(buildAdminHandoffMessage({ title: "A", body: "B" })).toBe("A\n\nB");
  });

  test("batas bukti yang ditampilkan panel tidak pernah menyebut terkirim", () => {
    const text = Object.values(ADMIN_HANDOFF_EVIDENCE).join(" ");
    expect(text).not.toMatch(/\b(sent|delivered|terkirim)\b/i);
    expect(ADMIN_HANDOFF_EVIDENCE.boundary).toBe(
      "handoff verified; external WhatsApp delivery unverified",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Test E - deterministik                                             */
/* ------------------------------------------------------------------ */

describe("Test E - hasil deterministik", () => {
  test("input yang sama menghasilkan URL yang persis sama", () => {
    const input = {
      title: "Ringkasan harian Buku Kerja",
      body: buildAdminDailySummaryMessage({
        date: "2026-09-29",
        openErrorReports: 3,
        newRequests: 7,
        activeAdminSessions: 2,
      }),
    };
    const first = buildAdminWhatsappLink(buildAdminHandoffMessage(input));
    for (let i = 0; i < 25; i += 1) {
      expect(buildAdminWhatsappLink(buildAdminHandoffMessage(input))).toBe(first);
    }
  });

  test("pesan ringkasan tanpa jam, tanpa locale, tanpa zone-dependent", () => {
    const input = {
      date: "2026-01-01",
      openErrorReports: 0,
      newRequests: 0,
      activeAdminSessions: 0,
    };
    const reference = buildAdminDailySummaryMessage(input);
    for (let i = 0; i < 25; i += 1) {
      expect(buildAdminDailySummaryMessage(input)).toBe(reference);
    }
  });

  test("perubahan input hanya mengubah bagian yang memang berubah", () => {
    const base = {
      date: "2026-09-29",
      openErrorReports: 1,
      newRequests: 1,
      activeAdminSessions: 1,
    };
    const changed = buildAdminDailySummaryMessage({ ...base, newRequests: 2 });
    expect(changed).not.toBe(buildAdminDailySummaryMessage(base));
    expect(buildAdminDailySummaryMessage(base)).toBe(buildAdminDailySummaryMessage({ ...base }));
  });
});

/* ------------------------------------------------------------------ */
/* Test F - handoff status koneksi                                     */
/* ------------------------------------------------------------------ */

describe("Test F - pesan handoff status koneksi", () => {
  const FORBIDDEN = [
    "WHATSAPP_ACCESS_TOKEN",
    "EAAG", // awalan access token Meta
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
    "TWILIO_AUTH_TOKEN",
    "otp",
    "OTP",
    "password",
    "sandi",
    "secret",
    "ownerId",
    "businessId",
    "storageId",
    "subscriptionTier",
  ];

  test("deterministik: input sama menghasilkan string yang persis sama", () => {
    const input = { status: "silent" as const, detail: "Antrean kirim macet", date: "2026-10-07" };
    const first = buildStatusHandoffMessage(input);
    for (let i = 0; i < 25; i += 1) {
      expect(buildStatusHandoffMessage(input)).toBe(first);
    }
  });

  test("konteks di baris pertama, tanpa jam dan tanpa timestamp generated", () => {
    for (const status of ["silent", "offline", "reconnecting"] as const) {
      const text = buildStatusHandoffMessage({ status, detail: "uji", date: "2026-10-07" });
      expect(text.split("\n")[0]).toBe("Buku Kerja - Status koneksi 2026-10-07");
      expect(text).not.toMatch(/\d{2}:\d{2}/);
    }
  });

  test("label jenis event jujur per status", () => {
    expect(
      buildStatusHandoffMessage({ status: "silent", detail: "uji", date: "2026-10-07" }),
    ).toContain("Jenis event: Sistem tidak merespons");
    expect(
      buildStatusHandoffMessage({ status: "offline", detail: "uji", date: "2026-10-07" }),
    ).toContain("Jenis event: Perangkat offline");
    expect(
      buildStatusHandoffMessage({ status: "reconnecting", detail: "uji", date: "2026-10-07" }),
    ).toContain("Jenis event: Menyambung ulang");
  });

  test("detail disanitasi minimal: trim + collapse whitespace + potong 500 char", () => {
    const messy = "  antrean\n\nmacet   berat\tsekali  ";
    const text = buildStatusHandoffMessage({ status: "silent", detail: messy, date: "2026-10-07" });
    expect(text).toContain("Detail: antrean macet berat sekali");
    expect(text).not.toContain("  ");
    expect(text).not.toContain("\t");

    const long = "x".repeat(600);
    const truncated = buildStatusHandoffMessage({ status: "silent", detail: long, date: "2026-10-07" });
    const detailLine = truncated.split("\n").find((line) => line.startsWith("Detail:"));
    expect(detailLine).toBe(`Detail: ${"x".repeat(500)}`);
  });

  test("pesan status tidak memuat akses, token, atau identitas internal", () => {
    for (const status of ["silent", "offline", "reconnecting"] as const) {
      const text = buildStatusHandoffMessage({
        status,
        detail: "Antrean kirim macet",
        date: "2026-10-07",
      });
      for (const needle of FORBIDDEN) expect(text).not.toContain(needle);
    }
  });

  test("tautan handoff status valid wa.me dan isi pulih utuh", () => {
    const message = buildStatusHandoffMessage({
      status: "offline",
      detail: "Sinyal hilang",
      date: "2026-10-07",
    });
    const link = buildAdminWhatsappLink(message);
    expect(link.startsWith("https://wa.me/")).toBe(true);
    const url = new URL(link);
    expect(url.host).toBe("wa.me");
    expect(url.searchParams.get("text")).toBe(message);
  });
});
