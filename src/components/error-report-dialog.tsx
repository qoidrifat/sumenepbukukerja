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
import { AlertTriangle, CheckCircle2, LifeBuoy, Loader2, MessageCircle, ShieldAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  closeErrorDialog,
  describeErrorDialog,
  getErrorDialog,
  patchErrorDialog,
  registerErrorReporter,
  subscribeErrorDialog,
} from "@/lib/error-report-bus";
import { reportAndNotify, useErrorReporter } from "@/lib/error-reporter";

import { focusRing } from "@/lib/focus-ring";
import { dashButtonClass } from "@/lib/dash-button-class";

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

/**
 * Menyambungkan mutasi pelaporan ke seluruh aplikasi dan memasang penanganan
 * error global.
 *
 * Satu provider untuk satu aplikasi: begini cara memastikan tidak ada
 * laporan yang lolos tanpa sengaja, dan tidak ada dua salinan popup yang
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
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-slate-500 hover:text-slate-900 ${focusRing}`}
      >
        {open ? "Sembunyikan detail teknis" : "Lihat detail teknis"}
      </button>
      {open ? (
        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 font-mono text-xs leading-5 text-slate-700">
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
  // Selama tautan admin belum ditekan, dialog tidak boleh ditutup lewat
  // cara apa pun (X, Esc, klik luar): laporan harus diteruskan dulu.
  const locked = view.showWhatsapp;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : locked ? undefined : closeErrorDialog())}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (locked) event.preventDefault();
        }}
        overlayClassName="dash-dialog-overlay"
        className="dash-dialog-content max-w-[calc(100%-1.5rem)] overflow-hidden sm:max-w-md"
      >
        {/* Tanpa `pe-*`: tombol tutup di baris ini adalah elemen flex biasa
            (bukan `absolute` seperti milik primitif), jadi flexbox sendiri yang
            menjaganya tidak bertabrakan dengan judul. Cadangan ruang justru
            menyisakan celah kosong saat tombol itu disembunyikan (fase terkunci). */}
        <div className="flex items-start gap-3 border-b border-slate-200/70 px-5 py-4 sm:px-6">
          <span
            className={`dash-icon ${
              state.phase === "reported"
                ? "dash-icon--emerald"
                : state.phase === "failed"
                  ? "dash-icon--amber"
                  : "dash-icon--red"
            }`}
            aria-hidden="true"
          >
            <Icon className={`size-5 ${view.busy ? "animate-spin" : ""}`} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="dash-title text-lg">
              {state.title}
            </DialogTitle>
            {state.errorCode ? (
              <p className="dash-sub mt-1 font-mono text-xs font-bold">{state.errorCode}</p>
            ) : null}
          </div>
          {!locked ? (
            <button
              type="button"
              onClick={() => closeErrorDialog()}
              aria-label="Tutup pemberitahuan"
              className={`flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 ${focusRing}`}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="px-5 py-5 sm:px-6">
          <p className="dash-sub text-sm">{state.message}</p>

          {view.badge ? (
            <div className={`mt-3 rounded-xl border px-3.5 py-2.5 ${view.tone}`} role="status">
              <p className="text-sm font-black">{view.badge}</p>
              <p className="mt-1 text-xs leading-5 opacity-90">{view.hint}</p>
            </div>
          ) : null}

          {view.showReportId && state.reportId ? (
            <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5">
              <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-slate-500">
                ID Laporan
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-slate-900">{state.reportId}</p>
            </div>
          ) : null}

          <DetailBlock detail={state.detail ?? ""} />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200/70 bg-slate-50/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
          {!state.adminWhatsappUrl ? (
            <>
              {view.showRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className={dashButtonClass("primary", focusRing)}
                >
                  <LifeBuoy className="size-4" aria-hidden="true" />
                  Coba lagi
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => closeErrorDialog()}
                className={dashButtonClass("secondary", focusRing)}
              >
                Tutup
              </button>
            </>
          ) : null}
          {view.showWhatsapp && state.adminWhatsappUrl ? (
            <a
              href={state.adminWhatsappUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => patchErrorDialog({ adminShared: true })}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-extrabold text-emerald-800 transition-colors hover:bg-emerald-50 ${focusRing}`}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Kirim ke admin
            </a>
          ) : null}
          {view.showTutupPesan ? (
            <button
              type="button"
              onClick={() => closeErrorDialog()}
              className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white transition-colors hover:bg-emerald-800 ${focusRing}`}
            >
              Tutup Pesan
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
