import { afterEach, describe, expect, test, vi } from "vitest";
import {
  closeErrorDialog,
  describeErrorDialog,
  getErrorDialog,
  getErrorReporter,
  registerErrorReporter,
  subscribeErrorDialog,
  type ErrorDialogState,
} from "./error-report-bus";
import { reportAndNotify, reportErrorToServer, withErrorReporting } from "./error-reporter";
import { ERROR_CODES, type ErrorReportInput } from "./error-reporting";

const reporterOk = (reportId = "ERR-20260928-A7F3K9") =>
  vi.fn(async (payload: ErrorReportInput) => ({ reportId, echo: payload.kind }));
const reporterThrows = vi.fn(async () => {
  throw new Error("network down");
});

const baseInput = {
  kind: "integration" as const,
  code: ERROR_CODES.whatsappSend,
  feature: "WhatsApp Notification Settings",
  operation: "whatsapp.sendTestWhatsapp",
  message: "Meta menolak pesan teks di luar jendela layanan 24 jam. Kode 131008.",
};

afterEach(() => {
  closeErrorDialog();
  registerErrorReporter(null);
});

describe("reportErrorToServer", () => {
  test("kegagalan yang tidak layak dilaporkan tidak pernah sampai ke jaringan", async () => {
    const reporter = reporterOk();
    const outcome = await reportErrorToServer(reporter, {
      ...baseInput,
      kind: "validation",
      message: "Masukkan nomor WhatsApp yang valid.",
    });
    expect(outcome.reported).toBe(false);
    expect(reporter).not.toHaveBeenCalled();
  });

  test("laporan yang gagal terkirim tidak pernah melempar ke pemanggil", async () => {
    const outcome = await reportErrorToServer(reporterThrows, baseInput);
    expect(outcome).toEqual({ reported: false });
  });

  test("berhasil mengembalikan ID laporan", async () => {
    const outcome = await reportErrorToServer(reporterOk("ERR-1"), baseInput);
    expect(outcome).toEqual({ reportId: "ERR-1", reported: true });
  });
});

describe("reportAndNotify", () => {
  test("membuka popup pada fase mencatat lalu menutup pada fase berhasil", async () => {
    const states: ErrorDialogState[] = [];
    const unsubscribe = subscribeErrorDialog(() => states.push({ ...getErrorDialog() }));

    const pending = reportAndNotify(reporterOk(), { caught: new Error(baseInput.message), ...baseInput });
    expect(getErrorDialog().phase).toBe("reporting");
    expect(getErrorDialog().canRetry).toBe(false);

    await pending;
    expect(getErrorDialog().phase).toBe("reported");
    expect(getErrorDialog().reportId).toBe("ERR-20260928-A7F3K9");
    unsubscribe();
  });

  test("popup menjelaskan kegagalan pelaporan tanpa membuka detail internal", async () => {
    await reportAndNotify(reporterThrows, { caught: new Error(baseInput.message), ...baseInput });
    const state = getErrorDialog();
    expect(state.phase).toBe("failed");
    expect(state.canRetry).toBe(true);
    expect(state.reportId).toBeUndefined();
    expect(state.message).toBe(baseInput.message);
  });

  test("error yang diharapkan tidak membuka popup sama sekali", async () => {
    const reporter = reporterOk();
    const outcome = await reportAndNotify(reporter, {
      caught: new Error("Masuk untuk menguji notifikasi WhatsApp"),
      ...baseInput,
    });
    expect(outcome.reported).toBe(false);
    expect(getErrorDialog().phase).toBe("idle");
    expect(reporter).not.toHaveBeenCalled();
  });

  test("laporan kedua tidak menimpa dialog yang sedang berjalan", async () => {
    const first = reportAndNotify(reporterOk("ERR-A"), {
      caught: new Error(baseInput.message),
      ...baseInput,
    });
    const second = reportAndNotify(reporterOk("ERR-B"), {
      caught: new Error(baseInput.message),
      ...baseInput,
    });
    await Promise.all([first, second]);
    expect(getErrorDialog().reportId).toBe("ERR-A");
  });

  test("pesan Convex dibersihkan dari jejak handler sebelum tampil", async () => {
    await reportAndNotify(reporterThrows, {
      caught: new Error(
        "Uncaught Error: Integrasi WhatsApp belum dapat mengirim pesan uji at handler (../src/convex/whatsapp.ts:634:4) Called by client",
      ),
      ...baseInput,
    });
    expect(getErrorDialog().message).toBe("Integrasi WhatsApp belum dapat mengirim pesan uji");
  });
});

describe("withErrorReporting", () => {
  test("error asli diteruskan apa adanya agar penanganan lama tidak berubah", async () => {
    const reporter = reporterOk();
    const failure = new Error("Hanya pemilik listing yang dapat mengubah data ini");
    const run = withErrorReporting(reporter, "vendors.updateVendor", () => Promise.reject(failure), {
      feature: "Listing Management",
    });
    await expect(run({})).rejects.toBe(failure);
    // Pesan ini milik expected-error, jadi tidak ada laporan.
    expect(reporter).not.toHaveBeenCalled();
  });

  test("kegagalan tak terduga dilaporkan lalu tetap dilempar ke pemanggil", async () => {
    const reporter = reporterOk("ERR-C");
    const failure = new Error("Server tidak dapat menghubungi provider WhatsApp.");
    const run = withErrorReporting(
      reporter,
      "whatsapp.sendTestWhatsapp",
      () => Promise.reject(failure),
      { feature: "WhatsApp Notification Settings", kind: "integration", code: ERROR_CODES.whatsappSend },
    );
    await expect(run({})).rejects.toBe(failure);
    await Promise.resolve();
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter.mock.calls[0]?.[0]).toMatchObject({
      operation: "whatsapp.sendTestWhatsapp",
      code: ERROR_CODES.whatsappSend,
      feature: "WhatsApp Notification Settings",
    });
  });

  test("hasil sukses tidak pernah memicu pelaporan", async () => {
    const reporter = reporterOk();
    const run = withErrorReporting(reporter, "vendors.createVendor", () => Promise.resolve("ok"), {
      feature: "Listing Management",
    });
    await expect(run({})).resolves.toBe("ok");
    expect(reporter).not.toHaveBeenCalled();
  });
});

describe("describeErrorDialog", () => {
  const base = {
    title: "Terjadi kendala",
    message: "Permintaan belum dapat diproses.",
    occurredAt: 0,
  };

  test("idle tidak pernah merender apa pun", () => {
    const view = describeErrorDialog({ ...base, phase: "idle", canRetry: false });
    expect(view.open).toBe(false);
    expect(view.badge).toBeUndefined();
  });

  test("fase mencatat menampilkan spinner tanpa tombol coba lagi", () => {
    const view = describeErrorDialog({ ...base, phase: "reporting", canRetry: false });
    expect(view.open).toBe(true);
    expect(view.busy).toBe(true);
    expect(view.badge).toBe("Mencatat laporan...");
    expect(view.showReportId).toBe(false);
    expect(view.showRetry).toBe(false);
  });

  test("fase berhasil menampilkan ID laporan dan menutup akses ke detail", () => {
    const view = describeErrorDialog({
      ...base,
      phase: "reported",
      reportId: "ERR-20260928-A7F3K9",
      detail: "Kode: WHATSAPP_SEND_FAILED",
      canRetry: false,
    });
    expect(view.badge).toBe("Laporan berhasil dicatat");
    expect(view.showReportId).toBe(true);
    expect(view.showDetail).toBe(true);
    expect(view.showRetry).toBe(false);
  });

  test("fase gagal menawarkan coba lagi tanpa ID laporan", () => {
    const view = describeErrorDialog({ ...base, phase: "failed", canRetry: true });
    expect(view.badge).toBe("Laporan belum dapat disimpan");
    expect(view.showRetry).toBe(true);
    expect(view.showReportId).toBe(false);
    expect(view.tone).toContain("amber");
  });
});

describe("registerErrorReporter", () => {
  test("pelepas hanya melepas reporter yang didaftarkan dirinya sendiri", () => {
    const reporter = reporterOk();
    const release = registerErrorReporter(reporter);
    expect(getErrorReporter()).toBe(reporter);
    registerErrorReporter(reporterOk("ERR-LAIN"));
    release();
    expect(getErrorReporter()).not.toBeUndefined();
  });
});
