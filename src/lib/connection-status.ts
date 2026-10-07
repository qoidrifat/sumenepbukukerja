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
