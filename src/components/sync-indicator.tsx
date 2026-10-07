import { useState } from "react";
import { Cloud, RefreshCw, WifiOff } from "lucide-react";
import { formatLastSync, syncNow, useOfflineQueue } from "@/lib/offline-queue";
import { reportSyncStart } from "@/lib/connection-status";
import { focusRing } from "@/lib/focus-ring";

/**
 * Indikator sinkronisasi realtime di header warga, di kiri AccountMenu.
 *
 * JUJUR: putaran ikon hidup HANYA selama promise `syncNow()` berjalan dan
 * berhenti saat promise selesai; timestamp dibaca dari waktu flush sukses
 * betulan (`lastSyncAt`). Tanpa timer, tanpa angka tebakan. Tombol tidak
 * pernah `disabled`: saat offline ia menjelaskan bahwa antrean aman di
 * perangkat, bukan mati tanpa kabar.
 */
export function SyncIndicator() {
  const { online, pendingCount, lastSyncAt } = useOfflineQueue();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    if (!online) {
      setMessage("Masih offline — antrean tersimpan aman di perangkat");
      return;
    }
    if (syncing) return;
    setSyncing(true);
    // Satu-satunya instrumentasi manual-sync task ini: tandai awal sync
    // agar watchdog (useConnectionStatus) bisa menaikkan `silent` bila
    // operasi tertunda > SILENT_TIMEOUT_MS padahal online.
    const finishSyncTrack = reportSyncStart();
    try {
      const result = await syncNow();
      setMessage(result.remaining > 0 ? `${result.remaining} perubahan tertunda` : null);
    } finally {
      finishSyncTrack();
      setSyncing(false);
    }
  };

  const iconColor = !online ? "text-slate-400" : pendingCount > 0 ? "text-amber-600" : "text-emerald-600";
  const dotColor = !online
    ? "bg-slate-300"
    : pendingCount > 0
      ? "bg-amber-500 motion-safe:animate-pulse"
      : "bg-emerald-500";

  return (
    <div className="inline-flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void refresh()}
        aria-label="Segarkan sinkronisasi"
        className={`flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm hover:border-blue-300 hover:bg-blue-50 ${focusRing}`}
      >
        <RefreshCw className={`size-5 ${iconColor}${syncing ? " sync-indicator-spin" : ""}`} aria-hidden="true" />
      </button>
      <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 shadow-sm">
        <span className={`size-2.5 rounded-full ${dotColor}`} aria-hidden="true" />
        {!online ? (
          <WifiOff className="size-4 text-slate-400" aria-hidden="true" />
        ) : (
          <Cloud className={`size-4 ${pendingCount > 0 ? "text-amber-600" : "text-emerald-600"}`} aria-hidden="true" />
        )}
        {!online ? "Offline" : pendingCount > 0 ? `${pendingCount} tertunda` : "Tersinkron"}
      </span>
      <span className="hidden max-w-44 truncate text-xs font-bold text-slate-500 min-[420px]:inline">
        Terakhir diperbarui {formatLastSync(lastSyncAt)}
      </span>
      {message ? (
        <span role="status" className="hidden text-xs font-bold text-slate-600 min-[420px]:inline">
          {message}
        </span>
      ) : null}
    </div>
  );
}
