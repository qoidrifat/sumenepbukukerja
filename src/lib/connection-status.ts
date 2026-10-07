// Reducer murni status konektivitas: tanpa DOM, tanpa timer, tanpa efek.
//
// Reducer ini hanya memetakan (prev, event) -> next. Fakta jaringan
// (`navigator.onLine`) dibaca pemanggil (hook Task S2), jendela grace
// (`RECONNECT_GRACE_MS`) dan batas diam (`SILENT_TIMEOUT_MS`) dihitung
// pemanggil; reducer hanya menerima event yang sudah matang.
//
// TABEL TRANSISI (sumber kebenaran untuk reviewer):
//
// | prev          | went-offline | went-online   | grace-elapsed | timeout-elapsed |
// |---------------|--------------|---------------|---------------|-----------------|
// | online        | offline      | online        | online        | silent          |
// | offline       | offline      | reconnecting  | offline       | offline         |
// | reconnecting  | offline      | reconnecting  | online        | reconnecting    |
// | silent        | offline      | silent        | silent        | silent          |
//
// - `offline`: fakta jaringan (`!navigator.onLine`), event-driven, eksak.
// - `reconnecting`: transisi offline->online selama jendela grace — klaim
//   transisional, bukan klaim server.
// - `silent`: operasi kritis pending > SILENT_TIMEOUT_MS padahal online.
// - Tidak ada state "bug" di mesin ini: bug = laporan error (jalur existing,
//   error-report-bus). Status konektivitas adalah concern TERPISAH.

export type ConnectionStatus = "online" | "offline" | "reconnecting" | "silent";
export type ConnectionEvent = "went-offline" | "went-online" | "grace-elapsed" | "timeout-elapsed";
export const RECONNECT_GRACE_MS = 8_000;
export const SILENT_TIMEOUT_MS = 12_000;

export function nextConnectionState(prev: ConnectionStatus, event: ConnectionEvent): ConnectionStatus {
  switch (event) {
    case "went-offline":
      return "offline";
    case "went-online":
      return prev === "offline" ? "reconnecting" : prev;
    case "grace-elapsed":
      return prev === "reconnecting" ? "online" : prev;
    case "timeout-elapsed":
      return prev === "online" ? "silent" : prev;
  }
}

/* ------------------------------------------------------------------ */
/* Pelacakan manual-sync (Task S2)                                     */
/* ------------------------------------------------------------------ */

// Waktu mulai (Date.now) sinkronisasi manual yang sedang berjalan, atau
// null bila tidak ada. Pola bus repo: module state + listener set — sama
// seperti error-report-bus (satu nilai, emit ke listener, tanpa dependensi).
// SATU-SATUNYA penulis adalah SyncIndicator yang memanggil reportSyncStart
// mengelilingi syncNow. Auth/OTP TAK tersentuh di task ini — cakupan silent
// alur auth adalah follow-up eksplisit, bukan diam-diam.

let manualSyncStartAt: number | null = null;
const syncListeners = new Set<() => void>();

const emitSync = () => {
  for (const listener of syncListeners) listener();
};

export function subscribeManualSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function getManualSyncStart(): number | null {
  return manualSyncStartAt;
}

/**
 * Tandai awal sinkronisasi manual; kembalikan cleanup yang menutupnya.
 * Cleanup idempoten: dipanggil dua kali tetap satu emit tutup.
 */
export function reportSyncStart(): () => void {
  manualSyncStartAt = Date.now();
  emitSync();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    manualSyncStartAt = null;
    emitSync();
  };
}

/* ------------------------------------------------------------------ */
/* Resolver varian dialog (pindah dari status-dialog.tsx: fungsi murni */
/* tak boleh tinggal di file komponen — react-refresh/only-export-     */
/* components. Signature inline "admin" | "warga" agar tanpa siklus    */
/* import; DialogVariant di status-dialog adalah alias yang sama —     */
/* satu-satunya sumber string literal adalah fungsi ini.)              */
/* ------------------------------------------------------------------ */

/**
 * Varian diputus murni dari pathname: /admin* -> admin, sisanya warga.
 * Mount global di luar BrowserRouter (main.tsx), jadi useLocation tak
 * tersedia — pemanggil membaca pathname SEKALI saat dialog dibuka lalu
 * meneruskannya ke sini.
 */
export function resolveDialogVariant(pathname: string): "admin" | "warga" {
  return pathname.startsWith("/admin") ? "admin" : "warga";
}
