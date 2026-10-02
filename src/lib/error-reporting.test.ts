import { describe, expect, test } from "vitest";
import {
  ALERT_COOLDOWN_MS,
  ALERT_OCCURRENCE_MILESTONES,
  DEDUPE_WINDOW_MS,
  ERROR_CODES,
  buildAdminAlertMessage,
  convexErrorEnvelope,
  errorFingerprint,
  formatUtc,
  formatWib,
  formatWibLong,
  isExpectedMessage,
  normalizeErrorReport,
  redactStack,
  redactText,
  redactValue,
  reportIdFor,
  resolveEnvironment,
  safeUserRef,
  shouldAlert,
  whatsappRecommendedAction,
} from "./error-reporting";

describe("redactText", () => {
  test("menyembunyikan token akses Meta", () => {
    expect(redactText("token: EAAGZx0123456789abcdefghijklmnopqrstuvwxyz")).toContain("[redacted]");
    expect(redactText("token: EAAGZx0123456789abcdefghijklmnopqrstuvwxyz")).not.toMatch(/EAAGZx/);
  });

  test("menyembunyikan header Authorization dan Bearer", () => {
    expect(redactText("Authorization: Bearer abc123def456ghi789")).not.toContain("abc123def456");
    expect(redactText("authorization: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij")).not.toContain("eyJ");
  });

  test("menyembunyikan cookie", () => {
    expect(redactText("Cookie: session=super-secret-value")).not.toContain("super-secret-value");
  });

  test("menyembunyikan parameter query yang namanya berarti rahasia", () => {
    const cleaned = redactText("https://api.example.com/cb?token=abcd1234&page=2&signature=zzz");
    expect(cleaned).not.toContain("abcd1234");
    expect(cleaned).not.toContain("zzz");
    expect(cleaned).toContain("page=2");
  });

  test("menyembunyikan assignment dari dump environment", () => {
    expect(redactText("WHATSAPP_ACCESS_TOKEN=EAAGZxsecretvalue1234")).not.toContain("EAAGZx");
    expect(redactText('client_secret: "hunter2hunter2"')).not.toContain("hunter2hunter2");
  });

  test("menyembunyikan blob opaque panjang", () => {
    const blob = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
    expect(redactText(`hash ${blob}`)).not.toContain(blob);
  });

  test("menyamarkan email dan nomor telepon, bukan menghapus", () => {
    const cleaned = redactText("kontak warga@gmail.com lewat 0812337753394");
    expect(cleaned).toContain("w***@gmail.com");
    expect(cleaned).not.toContain("0812337753394");
    expect(cleaned).toContain("3394");
  });

  test("membiarkan teks biasa apa adanya", () => {
    const text = "Meta menolak pesan teks di luar jendela layanan 24 jam.";
    expect(redactText(text)).toBe(text);
  });
});

describe("redactValue", () => {
  test("membuang isi kunci sensitif dan menyamarkan string", () => {
    const cleaned = redactValue({
      access_token: "EAAGZx0123456789abcdefghijk",
      nested: { authorization: "Bearer abcdefghij", note: "kontak warga@gmail.com" },
      phone: "6282337753394",
    }) as Record<string, Record<string, unknown>>;
    expect(cleaned.access_token).toBe("[redacted]");
    expect(cleaned.nested?.authorization).toBe("[redacted]");
    expect(cleaned.nested?.note).toContain("w***@gmail.com");
    expect(cleaned.phone).toBe("62****3394");
  });

  test("memotong array dan objek yang terlalu dalam", () => {
    const cleaned = redactValue({ list: new Array(40).fill("x") }) as { list: unknown[] };
    expect(cleaned.list).toHaveLength(10);
    expect(redactValue({ a: { b: { c: { d: { e: "deep" } } } } })).toEqual({
      a: { b: { c: { d: { e: "[redacted]" } } } },
    });
  });

  test("nilai primitif diteruskan apa adanya", () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBeNull();
  });
});

describe("redactStack", () => {
  test("memotong stack trace panjang dan menyanitasi isinya", () => {
    const stack = `Error: gagal\n    at handler (${"a".repeat(3000)}) token=abcdefghij1234567890`;
    const cleaned = redactStack(stack);
    expect(cleaned?.length).toBeLessThanOrEqual(2000);
    expect(cleaned).not.toContain("abcdefghij1234567890");
    expect(redactStack("")).toBeUndefined();
    expect(redactStack(undefined)).toBeUndefined();
  });
});

describe("safeUserRef", () => {
  test("tidak pernah mengirim email, nama, atau nomor", () => {
    expect(safeUserRef("k7h2m9ab12cd34")).toBe("user:k7h2m9ab12cd");
    expect(safeUserRef(undefined)).toBeUndefined();
    expect(safeUserRef(null)).toBeUndefined();
  });
});

describe("errorFingerprint", () => {
  const base = {
    errorCode: "WHATSAPP_SEND_FAILED",
    feature: "WhatsApp Notification Settings",
    operation: "whatsapp.sendTestWhatsapp",
    providerCode: "131008",
    message: "Meta menolak pesan teks di luar jendela layanan 24 jam.",
  };

  test("dua kegagalan dengan bentuk sama mendapat sidik jari sama", () => {
    expect(errorFingerprint(base)).toBe(errorFingerprint({ ...base }));
  });

  test("nilai yang berubah-ubah tidak ikut dihitung", () => {
    const a = errorFingerprint({ ...base, message: "Gagal pada 2026-09-28 request e290dd5a16ba593c." });
    const b = errorFingerprint({ ...base, message: "Gagal pada 2026-10-01 request 1122334455abcd." });
    expect(a).toBe(b);
  });

  test("bentuk yang berbeda mendapat sidik jari berbeda", () => {
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, providerCode: "190" }));
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, operation: "whatsapp.deliver" }));
  });
});

describe("reportIdFor", () => {
  test("memakai tanggal UTC dan sidik jari", () => {
    const at = Date.UTC(2026, 8, 28, 3, 32, 14);
    expect(reportIdFor(at, "ABC1234")).toBe("ERR-20260928-ABC1234");
  });

  test("suffiks naik untuk sidik jari yang dipakai ulang", () => {
    const at = Date.UTC(2026, 8, 28);
    expect(reportIdFor(at, "ABC1234", 0)).toBe("ERR-20260928-ABC1234");
    expect(reportIdFor(at, "ABC1234", 1)).toBe("ERR-20260928-ABC1234-2");
  });
});

describe("waktu", () => {
  const at = Date.UTC(2026, 8, 28, 3, 32, 14);
  test("UTC dan WIB memakai detik yang sama", () => {
    expect(formatUtc(at)).toBe("2026-09-28 03:32:14 UTC");
    expect(formatWib(at)).toBe("2026-09-28 10:32:14 WIB");
  });
  test("format panjang memakai nama bulan Indonesia", () => {
    expect(formatWibLong(at)).toBe("28 September 2026 10.32 WIB");
  });
});

describe("isExpectedMessage", () => {
  test("menangkap error yang diharapkan", () => {
    expect(isExpectedMessage("Masuk untuk menggunakan fitur Buku Kerja")).toBe(true);
    expect(isExpectedMessage("Hanya pemilik listing atau pengelola yang dapat mengubah data ini")).toBe(true);
    expect(isExpectedMessage("Masukkan nomor WhatsApp yang valid sebelum mengaktifkan notifikasi")).toBe(true);
    expect(isExpectedMessage("Viewer hanya dapat melihat data")).toBe(true);
  });

  test("tidak menangkap kegagalan integrasi", () => {
    expect(isExpectedMessage("Meta menolak pesan teks di luar jendela layanan 24 jam.")).toBe(false);
    expect(isExpectedMessage("Server tidak dapat menghubungi provider WhatsApp.")).toBe(false);
  });
});

/**
 * Pesan error server yang sudah diredaksi Convex di produksi.
 *
 * Dua laporan produksi nyata (ERR-20261001-0O72S0A dan ERR-20261002-0O72S0A)
 * berisi persis bentuk ini, dan keduanya menggumpal jadi satu laporan karena
 * pesan yang tersisa sama-sama "Called by client". Nama fungsi dan Request ID
 * di bawah ini disalin apa adanya dari laporan tersebut.
 */
const REDACTED_VENDORS =
  "ConvexError: [CONVEX Q(vendors:listForAdmin)] [Request ID: fdef7197fd99914a] Server Error\n  Called by client";
const REDACTED_ADMIN_GATE =
  "ConvexError: [CONVEX Q(adminGate:currentAdminSession)] [Request ID: 0941b51b1a88c5ed] Server Error\n  Called by client";

describe("convexErrorEnvelope", () => {
  test("mengambil nama fungsi dan Request ID dari amplop Convex", () => {
    expect(convexErrorEnvelope(REDACTED_VENDORS)).toEqual({
      udf: "vendors:listForAdmin",
      requestId: "fdef7197fd99914a",
    });
  });

  test("tidak mengarang isi untuk pesan biasa", () => {
    expect(convexErrorEnvelope("Koneksi terputus")).toEqual({ udf: undefined, requestId: undefined });
  });
});

describe("resolveEnvironment", () => {
  test("APP_ENV menang atas tebakan apa pun", () => {
    expect(resolveEnvironment({ APP_ENV: "staging", CONVEX_DEPLOYMENT: "prod:focused-lemur-389" })).toBe("staging");
  });

  test("awalan CONVEX_DEPLOYMENT diterjemahkan", () => {
    expect(resolveEnvironment({ CONVEX_DEPLOYMENT: "prod:focused-lemur-389" })).toBe("production");
    expect(resolveEnvironment({ CONVEX_DEPLOYMENT: "dev:quirky-otter-123" })).toBe("development");
    expect(resolveEnvironment({ CONVEX_DEPLOYMENT: "local:local-qoid_rif_at-sumenepbukukerja_fdbe7" })).toBe("development");
  });

  test("deployment produksi Convex dikenali dari CONVEX_SITE_URL", () => {
    // Inilah kasus yang dulu salah: di produksi CONVEX_DEPLOYMENT tidak diset,
    // jadi semua laporan produksi dicap "development".
    expect(resolveEnvironment({ CONVEX_SITE_URL: "https://focused-lemur-389.convex.site" })).toBe("production");
    expect(resolveEnvironment({ CONVEX_SITE_URL: "http://127.0.0.1:3211" })).toBe("development");
    expect(resolveEnvironment({ CONVEX_SITE_URL: "http://localhost:3211" })).toBe("development");
  });

  test("tidak menebak \"development\" ketika tidak ada petunjuk", () => {
    expect(resolveEnvironment({})).toBe("unknown");
    expect(resolveEnvironment({ CONVEX_SITE_URL: "https://contoh.test" })).toBe("unknown");
  });
});

describe("laporan error server yang diredaksi Convex", () => {
  const input = {
    kind: "critical" as const,
    feature: "Application Shell",
    operation: "RootErrorBoundary",
    severity: "critical" as const,
    source: "client" as const,
    message: REDACTED_VENDORS,
  };

  test("pesannya menyebut fungsi yang gagal, bukan hanya \"Called by client\"", () => {
    const report = normalizeErrorReport(input);
    expect(report).not.toBeNull();
    expect(report?.message).not.toBe("Called by client");
    expect(report?.message).toContain("vendors:listForAdmin");
    expect(report?.message).toContain("fdef7197fd99914a");
    // Kalimatnya harus terbaca, bukan amplop mentah yang disalin apa adanya.
    expect(report?.message).not.toContain("ConvexError:");
    expect(report?.message).not.toContain("[CONVEX");
  });

  test("Request ID ikut tersimpan sebagai field sendiri", () => {
    expect(normalizeErrorReport(input)?.requestId).toBe("fdef7197fd99914a");
  });

  test("Request ID dari pemanggil tidak ditimpa amplop", () => {
    const report = normalizeErrorReport({ ...input, requestId: "req-dari-klien" });
    expect(report?.requestId).toBe("req-dari-klien");
  });

  test("dua fungsi yang gagal tidak lagi menggumpal jadi satu laporan", () => {
    const vendors = normalizeErrorReport(input);
    const adminGate = normalizeErrorReport({ ...input, message: REDACTED_ADMIN_GATE });
    expect(vendors?.fingerprint).not.toBe(adminGate?.fingerprint);
  });

  test("pesan asli yang utuh tidak ikut diubah", () => {
    const utuh = normalizeErrorReport({
      ...input,
      kind: "integration",
      message: "Meta menolak pesan teks di luar jendela layanan 24 jam.",
    });
    expect(utuh?.message).toBe("Meta menolak pesan teks di luar jendela layanan 24 jam.");
  });
});

describe("normalizeErrorReport", () => {
  const operation = {
    kind: "integration" as const,
    feature: "WhatsApp Notification Settings",
    operation: "whatsapp.sendTestWhatsapp",
    message: "Meta menolak pesan teks di luar jendela layanan 24 jam.",
  };

  test("kegagalan integrasi menjadi laporan severity error", () => {
    const report = normalizeErrorReport(operation);
    expect(report).not.toBeNull();
    expect(report?.severity).toBe("error");
    expect(report?.errorCode).toBe(ERROR_CODES.convex);
    expect(report?.status).toBe("open");
    expect(report?.source).toBe("client");
  });

  test("kelas yang tidak layak dilaporkan selalu mengembalikan null", () => {
    for (const kind of ["validation", "permission", "auth", "notFound"] as const) {
      expect(normalizeErrorReport({ ...operation, kind, message: "Isi semua kolom yang wajib." })).toBeNull();
    }
  });

  test("jaring pengaman teks menahan laporan yang salah klasifikasi", () => {
    const report = normalizeErrorReport({ ...operation, message: "Masuk untuk menguji notifikasi WhatsApp" });
    expect(report).toBeNull();
  });

  test("judul dan pesan dibersihkan dari pembungkus Convex", () => {
    const report = normalizeErrorReport({
      ...operation,
      message:
        "Uncaught Error: Meta menolak pesan. Kode 131008 at handler (../src/convex/whatsapp.ts:700:12) Called by client",
    });
    expect(report?.message).toBe("Meta menolak pesan. Kode 131008");
  });

  test("kode provider diteruskan dan ikut membentuk sidik jari", () => {
    const withCode = normalizeErrorReport({ ...operation, provider: "meta", providerCode: "131008" });
    const without = normalizeErrorReport({ ...operation });
    expect(withCode?.providerCode).toBe("131008");
    expect(withCode?.fingerprint).not.toBe(without?.fingerprint);
  });

  test("tindakan yang disarankan terisi otomatis", () => {
    const report = normalizeErrorReport({ ...operation, code: ERROR_CODES.whatsappSend });
    expect(report?.recommendedAction).toContain("WHATSAPP_TEMPLATE_NAME");
  });

  test("context disanitasi sebelum ikut tersimpan", () => {
    const report = normalizeErrorReport({
      ...operation,
      context: { access_token: "EAAGZx0123456789abcdefghijk", stage: "send" },
    });
    expect(report?.context?.access_token).toBe("[redacted]");
    expect(report?.context?.stage).toBe("send");
  });

  test("pesan panjang dipotong dan dirapatkan", () => {
    const report = normalizeErrorReport({ ...operation, message: `${"a b ".repeat(400)}` });
    expect(report?.message.length).toBeLessThanOrEqual(500);
  });
});

describe("shouldAlert", () => {
  const now = 1_800_000_000_000;
  test("info dan warning tidak pernah dialer", () => {
    expect(shouldAlert({ severity: "info", occurrences: 1, now })).toBe(false);
    expect(shouldAlert({ severity: "warning", occurrences: 999, now })).toBe(false);
  });

  test("error dan critical dialer saat sidik jari baru muncul", () => {
    expect(shouldAlert({ severity: "error", occurrences: 1, now })).toBe(true);
    expect(shouldAlert({ severity: "critical", occurrences: 1, now })).toBe(true);
  });

  test("dalam masa pendinginan tidak ada alert kedua", () => {
    expect(
      shouldAlert({
        severity: "error",
        occurrences: 3,
        lastAlertAt: now - ALERT_COOLDOWN_MS + 1000,
        now,
      }),
    ).toBe(false);
  });

  test("setelah masa pendinginan, hanya ambang kejadian yang memicu", () => {
    const after = now - ALERT_COOLDOWN_MS - 1;
    expect(shouldAlert({ severity: "error", occurrences: 3, lastAlertAt: after, now })).toBe(false);
    for (const milestone of ALERT_OCCURRENCE_MILESTONES) {
      expect(shouldAlert({ severity: "error", occurrences: milestone, lastAlertAt: after, now })).toBe(true);
    }
  });
});

describe("buildAdminAlertMessage", () => {
  const report = {
    reportId: "ERR-20260928-A7F3K9",
    severity: "error" as const,
    errorCode: "WHATSAPP_SEND_FAILED",
    title: "Terjadi kendala",
    message: "Meta menolak pesan teks di luar jendela layanan 24 jam.",
    userMessage: "Meta menolak pesan teks di luar jendela layanan 24 jam. Kode 131008.",
    feature: "WhatsApp Notification Settings",
    operation: "whatsapp.sendTestWhatsapp",
    route: "/dashboard",
    component: "NotificationCenter",
    source: "server",
    environment: "prod:rare-scorpion",
    occurredAt: Date.UTC(2026, 8, 28, 3, 32, 14),
    requestId: "e290dd5a16ba593c",
    provider: "meta",
    providerCode: "131008",
    providerMessage: "Re-engagement message",
    userRef: "user:k7h2m9ab",
    browser: "Chrome",
    os: "Windows",
    retryable: true,
    recommendedAction: "Periksa template WhatsApp Utility.",
    occurrences: 1,
    firstSeenAt: Date.UTC(2026, 8, 28, 3, 32, 14),
    lastSeenAt: Date.UTC(2026, 8, 28, 3, 32, 14),
  };

  test("memuat seluruh bagian yang dibutuhkan operator", () => {
    const text = buildAdminAlertMessage(report);
    for (const expected of [
      "🚨 SYSTEM ERROR REPORT",
      "🟠 ERROR",
      "WhatsApp Notification Settings",
      "WHATSAPP_SEND_FAILED",
      "ERR-20260928-A7F3K9",
      "28 September 2026 10.32 WIB",
      "prod:rare-scorpion",
      "/dashboard",
      "whatsapp.sendTestWhatsapp",
      "Meta WhatsApp Cloud API",
      "131008",
      "Re-engagement message",
      "e290dd5a16ba593c",
      "user:k7h2m9ab",
      "Chrome / Windows",
      "Periksa template WhatsApp Utility.",
      "OPEN",
    ]) {
      expect(text).toContain(expected);
    }
  });

  test("kejadian berulang diringkas jadi satu blok", () => {
    const text = buildAdminAlertMessage({
      ...report,
      occurrences: 17,
      lastSeenAt: report.occurredAt + 600_000,
    });
    expect(text).toContain("17× · first 28 September 2026 10.32 WIB · last 28 September 2026 10.42 WIB");
  });

  test("tidak pernah membocorkan nilai rahasia", () => {
    const text = buildAdminAlertMessage({
      ...report,
      providerMessage: "token EAAGZx0123456789abcdefghijk ditolak",
    });
    expect(text).not.toContain("EAAGZx0123456789abcdefghijk");
  });
});

describe("whatsappRecommendedAction", () => {
  test("menyarankan template ketika template belum ada", () => {
    const action = whatsappRecommendedAction({ templateConfigured: false });
    expect(action).toContain("WHATSAPP_TEMPLATE_NAME");
    expect(action).toContain("131008");
  });

  test("menunjuk masalah provider kalau ada", () => {
    const action = whatsappRecommendedAction({
      templateConfigured: true,
      providerIssue: "Kredensial Twilio belum lengkap.",
    });
    expect(action).toContain("Kredensial Twilio belum lengkap.");
    expect(action).toContain("tidak dapat dikirim");
  });

  test("fallback generik ketika semua konfigurasi sehat", () => {
    expect(whatsappRecommendedAction({ templateConfigured: true })).toContain("dokumentasi provider");
  });
});

describe("konstanta jendela", () => {
  test("jendela dedup dan pendinginan alert sepuluh menit", () => {
    expect(DEDUPE_WINDOW_MS).toBe(600_000);
    expect(ALERT_COOLDOWN_MS).toBe(600_000);
  });
});
