// Popup pelaporan error.
//
// Ini bukan `alert()` dan bukan crash screen. Tampilannya berupa dialog yang
// muncul di atas halaman yang sedang bekerja, menjelaskan apa yang terjadi
// dalam bahasa biasa, memberi ID laporan, dan menawarkan jalan keluar.
//
// Yang tidak pernah muncul di sini: stack trace mentah, token, header
// otentikasi, atau isi database. Detail teknis yang ditampilkan sudah
// disanitasi oleh `lib/error-reporting` sebelum sampai ke layar.

import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, LifeBuoy, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  closeErrorDialog,
  describeErrorDialog,
  getErrorDialog,
  registerErrorReporter,
  subscribeErrorDialog,
} from "@/lib/error-report-bus";
import { reportAndNotify, useErrorReporter } from "@/lib/error-reporter";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

/**
 * Menyambungkan mutasi pelaporan ke seluruh aplikasi dan memasang penanganan
 * error global.
 *
 * Satu provider untuk satu aplikasi: begini cara memastikan tidak ada
 * طلب yang lolos tanpa pelaporan, dan tidak ada dua salinan popup yang
 * berebut layar.
 */
export function ErrorReportProvider({ children }: { children: React.ReactNode }) {
  const reportError = useErrorReporter();

  useEffect(() => {
    const release = registerErrorReporter(reportError);
    return () => {
      registerErrorReporter(null);
      release();
    };
  }, [reportError]);

  useEffect(() => {
    if (typeof window === "undefined") return;    // `error` (sinkron) dan `unhandledrejection` (promise) adalah dua    // jalur yang sering terlewat. Tanpa keduanya, banyak kegagalan runtime
    // tidak pernah terlihat sama sekali.
    const onError = (event: ErrorEvent) => {
      void reportAndNotify(reportError, {
        caught: event.error ?? event.message,
        kind: "operation",
        code: "RUNTIME_ERROR",
        severity: "error",
        feature: "Unhandled runtime error",
        operation: `window.onerror@${event.filename ? "unknown" : "unknown"}`,
        context: { source: "window.onerror", line: event.lineno },
        userMessage: "Halaman ini mengalami gangguan yang tidak terduga.",
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      void reportAndNotify(reportError, {
        caught: event.reason,
        kind: "operation",
        code: "RUNTIME_ERROR",
        severity: "error",
        feature: "Unhandled promise rejection",
        operation: "unhandledrejection",
        userMessage: "Sebagian pekerjaan gagal di latar belakang.",
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [reportError]);

  return <>{children}</>;
}

/* ------------------------------------------------------------------ */
/* Popup                                                               */
/* ------------------------------------------------------------------ */

const PHASE_ICON = {
  idle: AlertTriangle,
  reporting: Loader2,
  reported: CheckCircle2,
  failed: ShieldAlert,
} as const;

function DetailBlock({ detail }: { detail: string }) {
  const [open, setOpen] = useState(false);
  if (!detail) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500 hover:text-slate-800 ${focusRing}`}
      >
        {open ? "Sembunyikan detail teknis" : "Lihat detail teknis"}
      </button>
      {open ? (
        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700">
          {detail}
        </pre>
      ) : null}
    </div>
  );
}

export function ErrorReportDialog() {
  const state = useSyncExternalStore(subscribeErrorDialog, getErrorDialog, getErrorDialog);
  const view = describeErrorDialog(state);
  const open = view.open;

  /**
   * Fase dialog hanya boleh diubah oleh `reportAndNotify`. Tombol ini
   * tidak boleh menambal fase "reporting" sendiri: kalau ia melakukannya,
   * `reportAndNotify` akan melihat dialog sudah sibuk, menganggap dialog itu
   * bukan miliknya sendiri, dan hasil retry tidak pernah tampil.
   */
  const onRetry = () => {
    if (!state.onRetry) {
      closeErrorDialog();
      return;
    }
    state.onRetry();
  };

  if (!open) return null;
  const Icon = PHASE_ICON[state.phase];

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeErrorDialog())}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-1.5rem)] gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-xl sm:max-w-md"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              state.phase === "reported"
                ? "bg-emerald-50 text-emerald-700"
                : state.phase === "failed"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-red-50 text-red-700"
            }`}
            aria-hidden="true"
          >
            <Icon className={`size-5 ${view.busy ? "animate-spin" : ""}`} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black tracking-[-0.02em] text-slate-950">
              {state.title}
            </DialogTitle>
            {state.errorCode ? (
              <p className="mt-1 font-mono text-xs font-bold text-slate-500">{state.errorCode}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => closeErrorDialog()}
            aria-label="Tutup pemberitahuan"
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4 sm:px-6">
          <p className="text-sm leading-6 text-slate-700">{state.message}</p>

          {view.badge ? (
            <div className={`mt-3 rounded-xl border px-3 py-2.5 ${view.tone}`} role="status">
              <p className="text-sm font-black">{view.badge}</p>
              <p className="mt-1 text-xs leading-5 opacity-90">{view.hint}</p>
            </div>
          ) : null}

          {view.showReportId && state.reportId ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                ID Laporan
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-slate-900">{state.reportId}</p>
            </div>
          ) : null}

          <DetailBlock detail={state.detail ?? ""} />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
          {view.showRetry ? (
            <Button
              type="button"
              onClick={onRetry}
              className={`min-h-11 rounded-lg bg-blue-600 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
            >
              <LifeBuoy className="size-4" />
              Coba lagi
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => closeErrorDialog()}
            className={`min-h-11 rounded-lg border-slate-300 text-sm font-extrabold text-slate-700 ${focusRing}`}
          >
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
