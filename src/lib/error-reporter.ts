// Layanan pelaporan sisi klien.
//
// Satu tempat untuk: menangkap konteks peramban, menormalisasi, mengirim ke
// `errorReports`, lalu membuka popup. Tidak ada komponen yang boleh memanggil
// `api.errorReports.reportError` secara langsung -- kalau iya, sanitasi bisa
// dilewati dan laporan bisa dobel.
//
// Aturan yang dipegang di sini:
// 1. Pelaporan tidak pernah melempar error. Gagal melapor bukan alasan untuk
//    membuat halaman ikut gagal.
// 2. Error yang diharapkan (validasi, izin, auth) tidak pernah dilaporkan.
// 3. Satu dialog pada satu waktu. Laporan kedua menunggu giliran, bukan
//    menimpa laporan pertama yang belum selesai dibaca.

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getErrorDialog, getErrorDialogToken, patchErrorDialog, setErrorDialog, type RegisteredReporter } from "./error-report-bus";
import {
  ERROR_CODES,
  buildAdminAlertMessage,
  formatWib,
  normalizeErrorReport,
  redactText,
  type ErrorKind,
  type ErrorReportInput,
  type ErrorSeverity,
} from "./error-reporting";
import { buildAdminWhatsappLink } from "./admin-whatsapp";
import { rawErrorMessage } from "./whatsapp";

const FALLBACK_TITLE = "Terjadi kendala";

/** Token yang dijamin tidak pernah cocok, untuk pemanggil yang bukan pemilik dialog. */
const NOT_THE_OWNER = -1;

/* ------------------------------------------------------------------ */
/* Adapter ke Convex                                                    */
/* ------------------------------------------------------------------ */

/**
 * Satu-satunya tempat `api.errorReports.reportError` dipanggil dari
 * klien. Semua modul lain menerima reporter lewat hook ini, jadi tidak ada
 * jalan kedua yang bisa melewati sanitasi.
 */
export const useErrorReporter = (): RegisteredReporter => {
  const reportError = useMutation(api.errorReports.reportError);
  return useCallback(
    (payload) => reportError(payload as Parameters<typeof reportError>[0]),
    [reportError],
  );
};

/**
 * Daftar persis field yang boleh dikirim ke mutasi `reportError`.
 *
 * Convex menolak argumen yang punya field tak dikenal, dan pemanggil internal
 * sering membawa field tambahan seperti `caught` atau `onRetry`. Tanpa daftar
 * ini, laporan gagal disimpan karena kesalahan bentuk argumen -- bukan karena
 * tidak ada masalahnya.
 */
const REPORT_FIELDS = [
  "kind",
  "feature",
  "operation",
  "message",
  "title",
  "code",
  "severity",
  "source",
  "route",
  "component",
  "requestId",
  "provider",
  "providerCode",
  "providerMessage",
  "userId",
  "browser",
  "os",
  "stack",
  "retryable",
  "recommendedAction",
  "userMessage",
  "context",
] as const;

const pickReportFields = (input: ErrorReportInput) => {
  const output: Record<string, unknown> = {};
  for (const field of REPORT_FIELDS) {
    const value = (input as Record<string, unknown>)[field];
    if (value !== undefined) output[field] = value;
  }
  return output as ErrorReportInput;
};

/* ------------------------------------------------------------------ */
/* Konteks peramban                                                    */
/* ------------------------------------------------------------------ */

const browserName = () => {
  if (typeof navigator === "undefined" || !navigator.userAgent) return undefined;
  const agent = navigator.userAgent;
  if (/Edg\//.test(agent)) return "Edge";
  if (/OPR\//.test(agent)) return "Opera";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Safari\//.test(agent)) return "Safari";
  return "Browser lain";
};

const osName = () => {
  if (typeof navigator === "undefined" || !navigator.userAgent) return undefined;
  const agent = navigator.userAgent;
  if (/Windows NT/.test(agent)) return "Windows";
  if (/Android/.test(agent)) return "Android";
  if (/(iPhone|iPad|iPod)/.test(agent)) return "iOS";
  if (/Mac OS X/.test(agent)) return "macOS";
  if (/Linux/.test(agent)) return "Linux";
  return undefined;
};

/**
 * Pathname saat ini. Dijaga penuh karena modul ini juga dimuat di runtime
 * tepi (SSR, uji unit) yang punya `window` tapi tidak punya `location`.
 */
const currentRoute = () => {
  if (typeof window === "undefined" || !window.location) return undefined;
  return `${window.location.pathname ?? ""}${window.location.search ?? ""}`;
};

/**
 * Ringkasan teknis yang aman ditampilkan kalau pengguna memang membuka
 * bagian "detail". Sudah disanitasi, dan stack trace tidak ikut serta
 * kecuali diminta eksplisit.
 */
const technicalDetail = (input: ErrorReportInput) => {
  const parts: string[] = [];
  if (input.code) parts.push(`Kode: ${input.code}`);
  if (input.operation) parts.push(`Operasi: ${input.operation}`);
  if (input.feature) parts.push(`Fitur: ${input.feature}`);
  if (input.provider) parts.push(`Provider: ${input.provider}`);
  if (input.providerCode) parts.push(`Kode provider: ${input.providerCode}`);
  if (input.providerMessage) parts.push(`Pesan provider: ${redactText(input.providerMessage)}`);
  parts.push(`Waktu: ${formatWib(Date.now())}`);
  return parts.join("\n");
};

/* ------------------------------------------------------------------ */
/* Pelaporan                                                           */
/* ------------------------------------------------------------------ */

export type ReportOutcome = { reportId?: string; reported: boolean };

/**
 * Batas waktu satu percobaan pelaporan.
 *
 * Tanpa ini, popup bisa menggantung di "Mencatat laporan..." selamanya ketika
 * jaringan putus: klien Convex menahan mutasi, bukan menolaknya, jadi catch
 * tidak pernah dipanggil. Pengguna butuh tahu sekarang bahwa sistem gagal
 * mencatat, bukan menunggu.
 */
export const REPORT_TIMEOUT_MS = 8000;

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    work,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);

/**
 * Kirim satu laporan. Selalu mengembalikan nilai, tidak pernah melempar:
 * kegagalan pelapor tidak boleh menjadi kegagalan kedua yang lebih sulit
 * ditangani.
 */
export const reportErrorToServer = async (
  reporter: RegisteredReporter,
  input: ErrorReportInput,
): Promise<ReportOutcome> => {
  // Normalisasi lokal dulu supaya dialog dan server sepakat soal isi, dan
  // supaya kelas yang tidak layak dilaporkan tidak pernah sampai ke jaringan.
  const normalized = normalizeErrorReport(input);
  if (!normalized) return { reported: false };
  try {
    const result = await withTimeout(
      Promise.resolve(reporter(pickReportFields(input))),
      REPORT_TIMEOUT_MS,
    );
    return { reportId: result?.reportId, reported: Boolean(result?.reportId) };
  } catch {
    // Sengaja ditelan. Jaringan putus atau mutasi ditolak tidak boleh
    // menggagalkan alur pengguna.
    return { reported: false };
  }
};

export type ReportAndNotifyInput = Omit<ErrorReportInput, "message" | "browser" | "os" | "route"> & {
  caught: unknown;
  /** Kalimat ramah yang sudah tampil ke pengguna, kalau ada. */
  userMessage?: string;
  route?: string;
};

const isDialogBusy = () => {
  const current = getErrorDialog();
  return current.phase === "reporting" || current.phase === "reported";
};

/**
 * Laporkan kegagalan lalu buka popup.
 *
 * `reporter` dioper dari provider React supaya modul ini tidak perlu
 * bergantung pada `convex/react` dan bisa dipakai dari handler global.
 */
export const reportAndNotify = async (
  reporter: RegisteredReporter,
  input: ReportAndNotifyInput,
): Promise<ReportOutcome> => {
  // Pesan dikirim APA ADANYA ke server. Amplop `[CONVEX M(...)]` dan
  // `[Request ID: ...]` adalah satu-satunya petunjuk fungsi mana yang gagal;
  // membersihkannya di klien membuat server hanya menerima "Called by client"
  // (ERR-20261004-1AB3LQA). Kalimat ramah disusun server di `normalizeErrorReport`.
  const message = rawErrorMessage(input.caught) || "Terjadi kesalahan.";
  const enriched: ErrorReportInput = {
    ...input,
    message,
    route: input.route ?? currentRoute(),
    browser: browserName(),
    os: osName(),
  };

  // Validasi, izin, dan penolakan auth tetap UI biasa: tidak ada popup, tidak
  // ada laporan, tidak ada admin yang dibangunkan.
  const normalized = normalizeErrorReport(enriched);
  if (!normalized) return { reported: false };

  // Hanya pemicu yang membuka dialog yang boleh mengubahnya. Laporan yang
  // datang saat dialog sudah tampil tetap dikirim ke server, tapi tidak
  // menulis apa pun ke layar: dua dialog bertumpuk hanya membingungkan.
  const opened = !isDialogBusy();
  if (opened) {
    setErrorDialog({
      phase: "reporting",
      title: input.title ?? FALLBACK_TITLE,
      // `normalized` sudah dihitung di atas: kalimat yang tampil adalah
      // hasil normalisasi server-setara (ramah bila tersedia, normalisasi
      // bila tidak), bukan pesan mentah berisi jejak internal.
      message: normalized.userMessage ?? normalized.message,
      errorCode: input.code,
      detail: technicalDetail(enriched),
      occurredAt: Date.now(),
      canRetry: false,
      // Disimpan sekarang, dipakai nanti. Kalau pelaporan gagal, tombol
      // "Coba lagi" menjalankan ulang permintaan yang sama -- bukan membuka
      // dialog kosong.
      onRetry: () => {
        void reportAndNotify(reporter, input);
      },
    });
  }
  const token = opened ? getErrorDialogToken() : NOT_THE_OWNER;

  const outcome = await reportErrorToServer(reporter, enriched);

  if (outcome.reported) {
    patchErrorDialog(
      {
        phase: "reported",
        reportId: outcome.reportId,
        canRetry: false,
      },
      token,
    );
    // Handoff WhatsApp ke admin: pesan alert premium sudah terisi, pengguna
    // yang menekan kirim di WhatsApp-nya sendiri. Dibangun di sini (bukan di
    // komponen) karena di sinilah laporan ternormalisasi tersedia. Handoff
    // sengaja tidak memakai Cloud API: di luar jendela 24 jam Meta menolak
    // kiriman server (131008), sedangkan tautan click-to-chat tidak kena
    // batas itu. Kegagalan di sini tidak boleh merusak dialog yang laporannya
    // sudah tercatat — jadi dibungkus, bukan dilempar.
    try {
      if (outcome.reportId) {
        const now = Date.now();
        const message = buildAdminAlertMessage({
          reportId: outcome.reportId,
          severity: normalized.severity,
          errorCode: normalized.errorCode,
          title: normalized.title,
          message: normalized.message,
          userMessage: normalized.userMessage,
          feature: normalized.feature,
          operation: normalized.operation,
          route: normalized.route,
          component: normalized.component,
          source: normalized.source,
          environment:
            typeof window !== "undefined" && window.location
              ? window.location.hostname
              : "client",
          occurredAt: now,
          requestId: normalized.requestId,
          provider: normalized.provider,
          providerCode: normalized.providerCode,
          providerMessage: normalized.providerMessage,
          userRef: normalized.userRef,
          browser: normalized.browser,
          os: normalized.os,
          retryable: normalized.retryable,
          recommendedAction: normalized.recommendedAction,
          occurrences: 1,
          firstSeenAt: now,
          lastSeenAt: now,
        });
        patchErrorDialog({ adminWhatsappUrl: buildAdminWhatsappLink(message) }, token);
      }
    } catch {
      // Abaikan: tombol WA hilang, dialog + ID laporan tetap tampil.
    }
  } else {
    // Jaringan atau server menolak laporan. Teks ke pengguna sengaja generik:
    // rincian kegagalan internal tetap internal.
    patchErrorDialog({ phase: "failed", canRetry: true }, token);
  }
  return outcome;
};

/* ------------------------------------------------------------------ */
/* Pembungkus aksi                                                     */
/* ------------------------------------------------------------------ */

export type ActionContext = {
  feature: string;
  kind?: ErrorKind;
  code?: (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
  severity?: ErrorSeverity;
};

/**
 * Bungkus satu aksi Convex supaya kegagalannya dilaporkan otomatis.
 *
 * Error aslinya dilempar ulang apa adanya, jadi seluruh penanganan error yang
 * sudah ada di komponen tidak berubah sama sekali. Yang ditambahkan hanya
 * satu lapis pelaporan di sampingnya.
 */
export const withErrorReporting = <TArgs, TResult>(
  reporter: RegisteredReporter,
  operation: string,
  run: (args: TArgs) => Promise<TResult>,
  context: ActionContext,
) => {
  return (args: TArgs): Promise<TResult> =>
    run(args).catch((caught) => {
      void reportAndNotify(reporter, {
        caught,
        kind: context.kind ?? "operation",
        code: context.code,
        severity: context.severity,
        feature: context.feature,
        operation,
      });
      throw caught;
    });
};
