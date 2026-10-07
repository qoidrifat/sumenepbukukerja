import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getManualSyncStart,
  nextConnectionState,
  RECONNECT_GRACE_MS,
  SILENT_TIMEOUT_MS,
  subscribeManualSync,
  type ConnectionStatus,
} from "@/lib/connection-status";

/**
 * Status konektivitas untuk host dialog.
 *
 * - Fakta jaringan dari `navigator.onLine` + listener `online`/`offline`
 *   (event-driven, eksak).
 * - `reconnecting`: transisi offline->online selama jendela grace
 *   RECONNECT_GRACE_MS — klaim transisional, bukan klaim server.
 * - `silent`: online && manual-sync pending (state yang ditulis
 *   `reportSyncStart` di `connection-status.ts`) lebih lama dari
 *   SILENT_TIMEOUT_MS padahal online.
 *
 * Timer: SATU `setTimeout` sisa waktu (pola mascot-loader: bukan interval,
 * cleanup membatalkan yang tertunda). Tanpa animasi kustom di sini;
 * reduced-motion dihormati di lapisan animasi (CSS existing).
 *
 * @param pendingSince override waktu mulai sync (Date.now) untuk uji;
 * bila undefined, dibaca dari store manual-sync.
 */
export function useConnectionStatus(pendingSince?: number | null): {
  status: ConnectionStatus;
  pendingSince: number | null;
} {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    typeof navigator === "undefined" || navigator.onLine ? "online" : "offline",
  );
  const storedStart = useSyncExternalStore(subscribeManualSync, getManualSyncStart, getManualSyncStart);
  const effectivePending = pendingSince !== undefined ? pendingSince : storedStart;

  useEffect(() => {
    const goOffline = () => {
      setStatus((prev) => nextConnectionState(prev, "went-offline"));
    };
    const goOnline = () => {
      setStatus((prev) => nextConnectionState(prev, "went-online"));
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Satu rantai timeout (bukan interval): tiap perubahan status/pending
  // menjadwalkan SATU timeout sisa waktu; cleanup membatalkan yang tertunda.
  useEffect(() => {
    let delay: number | null = null;
    let event: "grace-elapsed" | "timeout-elapsed" | null = null;
    if (status === "reconnecting") {
      delay = RECONNECT_GRACE_MS;
      event = "grace-elapsed";
    } else if (status === "online" && effectivePending) {
      const remaining = SILENT_TIMEOUT_MS - (Date.now() - effectivePending);
      // Sudah lewat batas: jadwalkan timeout 0ms agar transisi tetap lewat
      // callback async (bukan setState sinkron di badan efek).
      delay = remaining <= 0 ? 0 : remaining;
      event = "timeout-elapsed";
    }
    if (delay === null || event === null) return;
    const next = event;
    const timer = window.setTimeout(() => {
      setStatus((prev) => nextConnectionState(prev, next));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [status, effectivePending]);

  return { status, pendingSince: effectivePending };
}
