import { useState } from "react";
import { AlertTriangle, MessageCircle, RefreshCw, WifiOff, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminDialogContent } from "@/components/admin-dialog";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { buildAdminWhatsappLink, buildStatusHandoffMessage } from "@/lib/admin-whatsapp";
import { resolveDialogVariant } from "@/lib/connection-status";
import { focusRing } from "@/lib/focus-ring";
import { dashButtonClass } from "@/lib/dash-button-class";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Varian tema                                                          */
/* ------------------------------------------------------------------ */

export type DialogVariant = "admin" | "warga";

type DialogShellProps = React.ComponentProps<typeof DialogContent> & {
  variant: DialogVariant;
};

/**
 * SATU shell komposisi — jangan duplikat dialog per tema.
 * Admin -> AdminDialogContent + kelas admin; warga -> ui DialogContent +
 * kelas publik + focusRing di tombol (lihat StatusDialog). Fokus ikut Radix
 * default (tanpa custom trap); Esc dihormati per locked masing-masing dialog.
 */
export function DialogShell({ variant, className, overlayClassName, ...props }: DialogShellProps) {
  if (variant === "admin") {
    return (
      <AdminDialogContent
        className={className}
        overlayClassName={overlayClassName}
        {...props}
      />
    );
  }
  return (
    <DialogContent
      overlayClassName={overlayClassName ?? "dash-dialog-overlay"}
      className={cn("dash-dialog-content max-w-[calc(100%-1.5rem)] overflow-hidden sm:max-w-md", className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* StatusDialog                                                         */
/* ------------------------------------------------------------------ */

export type StatusKind = "offline" | "reconnecting" | "silent";

const STATUS_COPY: Record<StatusKind, { title: string; body: string; badge: string; hint: string }> = {
  offline: {
    title: "Perangkat offline",
    body: "Koneksi terputus. Perubahan tersimpan aman di perangkat dan akan dikirim saat online.",
    badge: "Offline — antrean aman di perangkat",
    hint: "Tombol segarkan di header menjelaskan hal yang sama; tidak ada data yang hilang.",
  },
  reconnecting: {
    title: "Menyambung ulang",
    body: "Koneksi kembali. Sistem memeriksa antrean sebelum menandai tersinkron.",
    badge: "Menyambung ulang — klaim transisional",
    hint: "Bukan klaim server: hanya jeda grace setelah offline ke online.",
  },
  silent: {
    title: "Sistem tidak merespons",
    body: "Operasi tertunda lebih dari 12 detik padahal perangkat online. Teruskan ke pengelola bila perlu.",
    badge: "Sistem diam padahal online",
    hint: "Perlu tindak lanjut manual — laporan harus diteruskan dulu sebelum ditutup.",
  },
};

/**
 * Dialog status koneksi bertema.
 *
 * DOKTRIN HANDOFF (cermin admin-whatsapp): membuka tautan `wa.me` BUKAN
 * bukti terkirim — tidak ada message ID, tidak ada status kiriman, tidak
 * ada webhook balasan. Klik = niat kirim, bukan bukti terkirim. Dialog
 * kritis (silent) membuka kunci tutup HANYA sesudah tap WA; teks di bawah
 * menegaskan bahwa pengelola-lah yang menekan kirim.
 */
export function StatusDialog({
  status,
  variant,
  detail,
  date,
  onClose,
}: {
  status: StatusKind;
  variant: DialogVariant;
  detail?: string;
  date?: string;
  onClose?: () => void;
}) {
  const [statusShared, setStatusShared] = useState(false);
  const copy = STATUS_COPY[status];
  const isCritical = status === "silent";
  const locked = isCritical && !statusShared;
  const bodyId = `status-dialog-body-${status}`;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const message = buildStatusHandoffMessage({ status, detail: detail ?? "", date: day });
  const whatsappUrl = buildAdminWhatsappLink(message);
  const showWhatsapp = !isCritical || !statusShared;
  const showTutupPesan = isCritical && statusShared;

  const close = () => {
    if (locked) return;
    onClose?.();
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogShell
        variant={variant}
        showCloseButton={false}
        aria-describedby={bodyId}
        onEscapeKeyDown={(event) => {
          if (locked) event.preventDefault();
        }}
      >
        <div
          className={
            variant === "admin"
              ? "border-b-2 border-[#121212] bg-[#FFE662] px-4 py-4 sm:px-5"
              : "flex items-start gap-3 border-b border-slate-200/70 px-5 py-4 sm:px-6"
          }
        >
          <span
            className={
              variant === "admin"
                ? "admin-icon"
                : "dash-icon dash-icon--amber"
            }
            aria-hidden="true"
          >
            {status === "offline" ? (
              <WifiOff className="size-5" />
            ) : status === "reconnecting" ? (
              <RefreshCw className="size-5" />
            ) : (
              <AlertTriangle className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle
              className={variant === "admin" ? "mt-1 text-xl font-black text-[#121212]" : "dash-title text-lg"}
            >
              {copy.title}
            </DialogTitle>
          </div>
          {!locked ? (
            <button
              type="button"
              onClick={close}
              aria-label="Tutup pemberitahuan"
              className={
                variant === "admin"
                  ? `admin-btn admin-btn-quiet inline-flex min-h-12 size-11 shrink-0 items-center justify-center ${focusRing}`
                  : `flex min-h-12 size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 ${focusRing}`
              }
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className={variant === "admin" ? "space-y-3 px-4 py-4 sm:px-5" : "px-5 py-5 sm:px-6"}>
          <p id={bodyId} className={variant === "admin" ? "text-sm leading-6 text-[#1A1A1A]" : "dash-sub text-sm"}>
            {copy.body}
          </p>
          <div
            role="status"
            className={
              variant === "admin"
                ? "admin-status"
                : "mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-900"
            }
          >
            <p className="text-sm font-black">{copy.badge}</p>
            <p className="mt-1 text-xs leading-5 opacity-90">{copy.hint}</p>
          </div>
          <p className={variant === "admin" ? "text-xs leading-5 text-[#525252]" : "mt-3 text-xs leading-5 text-slate-500"}>
            Pesan disiapkan otomatis; pengelola yang menekan kirim.
          </p>
        </div>

        <div
          className={
            variant === "admin"
              ? "flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:justify-end sm:px-5"
              : "flex flex-col-reverse gap-2 border-t border-slate-200/70 bg-slate-50/70 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6"
          }
        >
          {!isCritical ? (
            <button
              type="button"
              onClick={close}
              className={
                variant === "admin"
                  ? `admin-btn admin-btn-secondary min-h-12 w-full sm:w-auto ${focusRing}`
                  : dashButtonClass("secondary", `min-h-12 ${focusRing}`)
              }
            >
              Tutup
            </button>
          ) : null}
          {showWhatsapp ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setStatusShared(true)}
              className={
                variant === "admin"
                  ? `admin-btn admin-btn-primary inline-flex min-h-12 items-center justify-center gap-2 ${focusRing}`
                  : `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-extrabold text-emerald-800 transition-colors hover:bg-emerald-50 ${focusRing}`
              }
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Kirim ke admin
            </a>
          ) : null}
          {showTutupPesan ? (
            <button
              type="button"
              onClick={close}
              className={
                variant === "admin"
                  ? `admin-btn admin-btn-primary min-h-12 w-full ${focusRing}`
                  : `inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white transition-colors hover:bg-emerald-800 ${focusRing}`
              }
            >
              Tutup Pesan
            </button>
          ) : null}
        </div>
      </DialogShell>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Host global                                                          */
/* ------------------------------------------------------------------ */

/**
 * Host global di main.tsx tepat di sebelah <ErrorReportDialog />.
 * Menampilkan dialog untuk offline / reconnecting / silent manual-sync.
 * Error/bug tetap milik ErrorReportDialog (tanpa tumpang tindih).
 */
export function StatusDialogHost() {
  const { status } = useConnectionStatus();
  const [dismissed, setDismissed] = useState<StatusKind | null>(null);

  // Dismissed dibersihkan tepat saat status KEMBALI online. BUKAN useEffect:
  // render membandingkan status dengan nilai sebelumnya (pola wasOpen
  // ProfileDialog), tanpa efek dan tanpa render berjenjang.
  const [wasStatus, setWasStatus] = useState(status);
  if (status !== wasStatus) {
    setWasStatus(status);
    if (status === "online") setDismissed(null);
  }

  if (status === "online") return null;
  if (dismissed === status) return null;
  const variant = resolveDialogVariant(
    typeof window !== "undefined" && window.location ? window.location.pathname : "/",
  );
  return <StatusDialog status={status} variant={variant} onClose={() => setDismissed(status)} />;
}
