// Pusat observability di sisi server.
//
// Semua sumber error -- klien, mutasi, action, webhook -- masuk ke sini lewat
// `reportError` (dari klien) atau `recordServerError` (dari server). Tidak ada
// modul lain yang mengirim pesan alert sendiri; itulah yang membuat sistem ini
// tidak berteriak, tidak menggandakan diri, dan tidak pernah memanggil dirinya
// sendiri.
//
// Alur satu laporan:
//
//   error -> normalizeErrorReport (classify + sanitize + fingerprint)
//          -> dedup per sidik jari dalam jendela 10 menit
//          -> simpan di `errorReports`
//          -> JIKA policy alert mengizinkan, jadwalkan `deliverAdminAlert`
//          -> `deliverAdminAlert` mengecek deliverability provider
//          -> kirim lewat `internal.whatsapp.sendAdminAlert`
//
// Kegagalan pada langkah terakhir hanya ditulis ke baris laporan. Tidak ada
// panggilan balik ke `recordServerError` dari sini: itu batas anti-rekursi.

import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireManagementViewer, requireStaff } from "./access";
import { resolveAuditActor } from "./audit";
import {
  DEDUPE_WINDOW_MS,
  REPORT_REUSE_WINDOW_MS,
  buildAdminAlertMessage,
  normalizeErrorReport,
  reportIdFor,
  shouldAlert,
  type ErrorAlertStatus,
  type ErrorReportInput,
  type ErrorReportStatus,
  type ErrorSeverity,
} from "../lib/error-reporting";

/**
 * Tujuan alert bug.
 *
 * Tidak ada nomor yang dibaca dari environment lagi. Tujuan alert admin
 * sekarang satu konstanta di `src/lib/admin-whatsapp.ts` — satu sumber
 * kebenaran untuk seluruh aplikasi, bukan satu per fitur.
 *
 * Env var nomor tujuan alert sudah tidak lagi punya consumer: jalur admin
 * tidak pernah memanggil provider, jadi "ke mana alert dikirim" bukan lagi
 * pertanyaan runtime. Tautannya dibentuk sebagai click-to-chat `wa.me` dan
 * whoever membuka panel admin yang menekan kirim.
 *
 * Konsekuensinya `alertStatus = "blocked"` dengan alasan "tujuan tidak bisa
 * dibuat" tetap mungkin terjadi kalau bentuk nomornya tidak valid — tapi tidak
 * ada lagi keadaan "nomor belum diisi", karena nomornya sudah tetap.
 */

/** Pengaman anti-spam kalau ada klien yang salah atau penyerang. */
const MAX_NEW_REPORTS_PER_HOUR = 500;

const environment = () => process.env.CONVEX_DEPLOYMENT ?? "development";

type ReportDocument = DataModel["errorReports"]["document"];

/* ------------------------------------------------------------------ */
/* Validasi argumen                                                    */
/* ------------------------------------------------------------------ */

const reportArgs = {
  kind: v.union(
    v.literal("validation"),
    v.literal("permission"),
    v.literal("auth"),
    v.literal("notFound"),
    v.literal("operation"),
    v.literal("integration"),
    v.literal("critical"),
  ),
  feature: v.string(),
  operation: v.string(),
  message: v.string(),
  title: v.optional(v.string()),
  code: v.optional(v.string()),
  severity: v.optional(
    v.union(v.literal("info"), v.literal("warning"), v.literal("error"), v.literal("critical")),
  ),
  source: v.optional(v.union(v.literal("client"), v.literal("server"), v.literal("webhook"))),
  route: v.optional(v.string()),
  component: v.optional(v.string()),
  requestId: v.optional(v.string()),
  provider: v.optional(v.string()),
  providerCode: v.optional(v.string()),
  providerMessage: v.optional(v.string()),
  userId: v.optional(v.string()),
  browser: v.optional(v.string()),
  os: v.optional(v.string()),
  stack: v.optional(v.string()),
  retryable: v.optional(v.boolean()),
  recommendedAction: v.optional(v.string()),
  userMessage: v.optional(v.string()),
  context: v.optional(v.any()),
} as const;

const asInput = (args: Record<string, unknown>): ErrorReportInput =>
  args as unknown as ErrorReportInput;

/* ------------------------------------------------------------------ */
/* Penyimpanan + dedup                                                 */
/* ------------------------------------------------------------------ */

/**
 * Laporan terakhir dengan sidik jari yang sama.
 *
 * `byFingerprint` dipakai, jadi ini bukan pemindaian tabel. Baris yang
 * ditemukan boleh masih di dalam jendela dedup (kemudian dihitung sebagai
 * kejadian berulang) atau sudah kedaluwarsa (kemudian menjadi laporan baru
 * dengan ID bersufiks).
 */
const latestByFingerprint = async (
  ctx: GenericMutationCtx<DataModel>,
  fingerprint: string,
): Promise<ReportDocument | undefined> => {
  const rows = await ctx.db
    .query("errorReports")
    .withIndex("byFingerprint", (q) => q.eq("fingerprint", fingerprint))
    .order("desc")
    .take(1);
  return rows[0];
};

type RecordOutcome = {
  reportId: string;
  id: string;
  occurrences: number;
  alertScheduled: boolean;
};

/**
 * Tentukan apakah laporan ini deserves alert, lalu jadwalkan bila iya.
 * Jadwal lewat `ctx.scheduler` supaya pengiriman tidak menahan mutasi, dan
 * supaya kegagalan pengiriman tidak bisa menggagalkan pencatatan laporan.
 */
const alertDecision = (
  report: Pick<ReportDocument, "severity" | "alertAt">,
  occurrences: number,
  now: number,
) =>
  shouldAlert({
    severity: report.severity,
    occurrences,
    lastAlertAt: report.alertAt,
    now,
  });

const scheduleAlert = (
  ctx: GenericMutationCtx<DataModel>,
  reportId: DataModel["errorReports"]["document"]["_id"],
): void => {
  void ctx.scheduler.runAfter(0, internal.errorReports.prepareAdminErrorAlert, { reportId });
};

/**
 * Satu-satunya tempat laporan dibuat atau digabung. Dipakai oleh
 * `reportError` (publik) dan `recordServerError` (internal).
 */
const recordReport = async (
  ctx: GenericMutationCtx<DataModel>,
  input: ErrorReportInput,
): Promise<RecordOutcome | null> => {
  const now = Date.now();
  const report = normalizeErrorReport(input, now);
  if (!report) return null;

  const previous = await latestByFingerprint(ctx, report.fingerprint);

  if (previous && now - previous.lastSeenAt < DEDUPE_WINDOW_MS) {
    const occurrences = previous.occurrences + 1;
    const alertScheduled = alertDecision(previous, occurrences, now);
    if (alertScheduled) scheduleAlert(ctx, previous._id);
    await ctx.db.patch(previous._id, {
      occurrences,
      lastSeenAt: now,
      // Pesan terbaru ditulis ulang supaya laporan selalu menunjukkan
      // kegagalan terakhir, bukan yang paling lama.
      message: report.message,
      userMessage: report.userMessage ?? previous.userMessage,
      providerMessage: report.providerMessage ?? previous.providerMessage,
      providerCode: report.providerCode ?? previous.providerCode,
      requestId: report.requestId ?? previous.requestId,
      context: report.context ?? previous.context,
      severity: report.severity,
      ...(alertScheduled ? { alertStatus: "queued" as const } : {}),
      updatedAt: now,
    });
    return { reportId: previous.reportId, id: previous._id, occurrences, alertScheduled };
  }

  // Pengaman anti-spam. Query ini memakai `byLastSeenAt`; batangnya sudah
  // dibatasi MAX_NEW_REPORTS_PER_HOUR, jadi tidak pernah memindai tabel penuh.
  const recent = await ctx.db
    .query("errorReports")
    .withIndex("byLastSeenAt", (q) => q.gte("lastSeenAt", now - 60 * 60_000))
    .take(MAX_NEW_REPORTS_PER_HOUR + 1);
  if (recent.length >= MAX_NEW_REPORTS_PER_HOUR) return null;

  // Sidik jari sama tapi sudah lewat jendela dedup. ID lama tidak boleh
  // dipakai ulang, jadi nomornya naik satu tingkat.
  let sequence = 0;
  if (previous && now - previous.lastSeenAt < REPORT_REUSE_WINDOW_MS) {
    const siblings = await ctx.db
      .query("errorReports")
      .withIndex("byFingerprint", (q) => q.eq("fingerprint", report.fingerprint))
      .collect();
    const base = reportIdFor(now, report.fingerprint);
    sequence = siblings.filter((row) => row.reportId === base || row.reportId.startsWith(`${base}-`)).length;
  }

  const alertScheduled = alertDecision(
    { severity: report.severity, alertAt: undefined },
    1,
    now,
  );
  const id = await ctx.db.insert("errorReports", {
    ...report,
    reportId: reportIdFor(now, report.fingerprint, sequence),
    environment: environment(),
    occurrences: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    alertStatus: alertScheduled ? "queued" : "skipped",
    createdAt: now,
    updatedAt: now,
  });
  if (alertScheduled) scheduleAlert(ctx, id);
  await ctx.db.insert("auditLogs", {
    action: "error_report.created",
    // Laporan error bisa datang dari klien yang sedang crash, jadi pelaku
    // sering memang tidak ada. `resolveAuditActor` tetap mencoba membaca
    // sesi supaya jejaknya tidak hilang sepenuhnya.
    ...(await resolveAuditActor(ctx)),
    entityId: report.reportId,
    metadata: {
      severity: report.severity,
      errorCode: report.errorCode,
      feature: report.feature,
      operation: report.operation,
      fingerprint: report.fingerprint,
      occurrences: 1,
    },
    createdAt: now,
  });
  return { reportId: report.reportId, id, occurrences: 1, alertScheduled };
};

/* ------------------------------------------------------------------ */
/* API pelaporan                                                       */
/* ------------------------------------------------------------------ */

/**
 * Titik masuk tunggal dari klien. Input dinormalisasi ulang di server --
 * klien tidak pernah menentukan isi laporan yang tersimpan, karena setiap
 * field bisa berisi data yang tidak aman.
 */
export const reportError = mutation({
  args: reportArgs,
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    const outcome = await recordReport(ctx, asInput({ ...args, userId: authUserId }));
    if (!outcome) return { reported: false as const, reportId: undefined };
    return {
      reported: true as const,
      reportId: outcome.reportId,
      occurrences: outcome.occurrences,
    };
  },
});

/** Dipakai dari server (mutasi, action, webhook) tanpa melewati klien. */
export const recordServerError = internalMutation({
  args: { ...reportArgs, actorId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const outcome = await recordReport(ctx, asInput({ ...args, userId: args.actorId }));
    if (!outcome) return { reported: false as const, reportId: undefined };
    return {
      reported: true as const,
      reportId: outcome.reportId,
      occurrences: outcome.occurrences,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Pengiriman alert                                                    */
/* ------------------------------------------------------------------ */

/**
 * Siapkan satu tautan handoff alert ke admin, atau tandai kenapa tidak bisa.
 *
 * PERUBAHAN SEMANTIK. Versi lama memanggil WhatsApp Cloud API lalu menandai
 * barisnya `sent` beserta `messageId` dari provider. `wa.me` tidak punya
 * kemampuan itu, jadi nama lama `deliverAdminAlert` tidak lagi jujur dan
 * digantikan oleh `prepareAdminErrorAlert`. Yang dikembalikan hanya
 * `handoff: true` dan URL-nya.
 *
 * Tiga aturan yang tetap dipegang:
 * 1. Kalau laporan sudah pernah dialertering dan masih dalam cooldown,
 *    berhenti -- tidak ada tautan kedua untuk masalah yang sama.
 * 2. Kalau tautan tidak bisa dibuat (bentuk nomor tidak valid), tandai
 *    `blocked` lalu berhenti. Laporan tetap utuh dan tetap terlihat di panel
 *    pengelola.
 * 3. Kegagalan hanya dicatat di baris laporan. Tidak pernah memanggil
 *    `recordServerError` -- itu yang mencegah rekursi tak berujung.
 */
export const prepareAdminErrorAlert = internalAction({
  args: { reportId: v.id("errorReports") },
  // Tipe ditulis eksplisit: tanpa ini TypeScript mengarang tipe dari isi
  // handler, sementara handler itu memanggil fungsi lain di berkas yang sama --
  // dan menghasilkan tipe rekursif yang tidak bisa diinferensi.
  handler: async (
    ctx,
    args,
  ): Promise<{ handoff: boolean; reason?: string; url?: string }> => {
    const report = await ctx.runQuery(internal.errorReports.reportForAlert, {
      id: args.reportId,
    });
    if (!report) return { handoff: false as const, reason: "tidak ditemukan" };

    const now = Date.now();
    if (
      !shouldAlert({
        severity: report.severity,
        occurrences: report.occurrences,
        lastAlertAt: report.alertAt,
        now,
      })
    ) {
      return { handoff: false as const, reason: "dilewati policy" };
    }

    const body = buildAdminAlertMessage({
      reportId: report.reportId,
      severity: report.severity,
      errorCode: report.errorCode,
      title: report.title,
      message: report.message,
      userMessage: report.userMessage,
      feature: report.feature,
      operation: report.operation,
      route: report.route,
      component: report.component,
      source: report.source,
      environment: report.environment,
      occurredAt: report.firstSeenAt,
      requestId: report.requestId,
      provider: report.provider,
      providerCode: report.providerCode,
      providerMessage: report.providerMessage,
      userRef: report.userRef,
      browser: report.browser,
      os: report.os,
      retryable: report.retryable,
      recommendedAction: report.recommendedAction,
      occurrences: report.occurrences,
      firstSeenAt: report.firstSeenAt,
      lastSeenAt: report.lastSeenAt,
    });

    try {
      const result = await ctx.runAction(internal.whatsapp.createAdminHandoff, {
        deliveryKey: `system:error-alert:${report.reportId}`,
        title: `${report.severity.toUpperCase()} ${report.errorCode} ${report.reportId}`,
        body,
      });
      if (!result.handoff) {
        await ctx.runMutation(internal.errorReports.markAlert, {
          id: args.reportId,
          alertStatus: "blocked",
          reason: result.reason ?? "tautan handoff tidak bisa disiapkan.",
        });
        return { handoff: false as const, reason: result.reason ?? "handoff" };
      }
      await ctx.runMutation(internal.errorReports.markAlert, {
        id: args.reportId,
        alertStatus: "handoff",
        at: Date.now(),
      });
      // `url` dikembalikan untuk keperluan audit, bukan untuk ditampilkan
      // sebagai bukti pengiriman. Membuka tautannya tetap urusan pengelola.
      return { handoff: true as const, url: result.url };
    } catch (error) {
      // Batas rekursi. Error di sini tidak pernah dilaporkan lewat jalur yang
      // sama; ia hanya menjadi angka di panel pengelola.
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "handoff_failed";
      await ctx.runMutation(internal.errorReports.markAlert, {
        id: args.reportId,
        alertStatus: "failed",
        reason: code,
      });
      return { handoff: false as const, reason: code };
    }
  },
});

/* ------------------------------------------------------------------ */
/* Mutasi internal                                                     */
/* ------------------------------------------------------------------ */

export const reportForAlert = internalQuery({
  args: { id: v.id("errorReports") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const markAlert = internalMutation({
  args: {
    id: v.id("errorReports"),
    alertStatus: v.union(
      v.literal("skipped"),
      v.literal("queued"),
      v.literal("handoff"),
      v.literal("sent"),
      v.literal("blocked"),
      v.literal("failed"),
    ),
    reason: v.optional(v.string()),
    code: v.optional(v.string()),
    at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) return false;
    const now = Date.now();
    await ctx.db.patch(args.id, {
      alertStatus: args.alertStatus,
      alertReason: args.reason ?? (args.alertStatus === "sent" ? undefined : current.alertReason),
      alertCode: args.code ?? current.alertCode,
      // `alertAt` dicatat saat tautan handoff disiapkan. Itu waktu penyiapan,
      // bukan waktu pesan sampai: `wa.me` tidak memberi bukti pengiriman.
      alertAt: args.at ?? (args.alertStatus === "sent" || args.alertStatus === "handoff" ? now : current.alertAt),
      updatedAt: now,
    });
    return true;
  },
});

/* ------------------------------------------------------------------ */
/* API pengelola                                                       */
/* ------------------------------------------------------------------ */

const adminView = (report: ReportDocument) => ({
  _id: report._id,
  reportId: report.reportId,
  severity: report.severity as ErrorSeverity,
  status: report.status as ErrorReportStatus,
  errorCode: report.errorCode,
  title: report.title,
  message: report.message,
  userMessage: report.userMessage,
  feature: report.feature,
  operation: report.operation,
  source: report.source,
  route: report.route,
  component: report.component,
  requestId: report.requestId,
  provider: report.provider,
  providerCode: report.providerCode,
  providerMessage: report.providerMessage,
  userRef: report.userRef,
  browser: report.browser,
  os: report.os,
  stack: report.stack,
  context: report.context,
  retryable: report.retryable,
  recommendedAction: report.recommendedAction,
  occurrences: report.occurrences,
  firstSeenAt: report.firstSeenAt,
  lastSeenAt: report.lastSeenAt,
  alertStatus: report.alertStatus as ErrorAlertStatus,
  alertReason: report.alertReason,
  alertCode: report.alertCode,
  alertAt: report.alertAt,
  environment: report.environment,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
});

/**
 * Daftar laporan. `requireManagementViewer` melempar untuk akun biasa, jadi
 * isi tabel ini tidak pernah bocor ke pembacaan publik.
 */
export const listErrorReports = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("acknowledged"),
        v.literal("resolved"),
        v.literal("ignored"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const status = args.status;
    if (status === undefined) {
      const rows = await ctx.db
        .query("errorReports")
        .withIndex("byLastSeenAt")
        .order("desc")
        .take(limit);
      return rows.map(adminView);
    }
    // Convex hanya mengizinkan satu rentang indeks per query, jadi penyaring
    // status dilakukan di memori. Satu himpunan status di instalasi ini kecil
    // karena dedup menahan baris baru per bentuk kegagalan.
    const rows = await ctx.db
      .query("errorReports")
      .withIndex("byStatus", (q) => q.eq("status", status))
      .collect();
    return rows
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, limit)
      .map(adminView);
  },
});

export const getErrorReport = query({
  args: { id: v.id("errorReports") },
  handler: async (ctx, args) => {
    await requireManagementViewer(ctx);
    const report = await ctx.db.get(args.id);
    return report ? adminView(report) : null;
  },
});

/** Ringkasan untuk lencana di header panel. */
export const errorReportSummary = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireManagementViewer(ctx);
    const open = await ctx.db
      .query("errorReports")
      .withIndex("byStatus", (q) => q.eq("status", "open"))
      .collect();
    return {
      open: open.length,
      critical: open.filter((row) => row.severity === "critical").length,
      blocked: open.filter(
        (row) => row.alertStatus === "blocked" || row.alertStatus === "failed",
      ).length,
      canModerate: access.role !== "viewer",
    };
  },
});

export const setErrorReportStatus = mutation({
  args: {
    id: v.id("errorReports"),
    status: v.union(
      v.literal("open"),
      v.literal("acknowledged"),
      v.literal("resolved"),
      v.literal("ignored"),
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireStaff(ctx);
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("Laporan tidak ditemukan");
    const now = Date.now();
    await ctx.db.patch(args.id, { status: args.status, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      action: "error_report.status",
      ...(await resolveAuditActor(ctx, access.userId)),
      entityId: current.reportId,
      metadata: { from: current.status, to: args.status },
      createdAt: now,
    });
    return true;
  },
});
