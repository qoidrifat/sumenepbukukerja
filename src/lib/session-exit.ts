/*
 * Aturan transisi keluar perangkat, dipisah dari komponennya.
 *
 * ALASAN PEMISAHAN. Aturan ini murni fungsi, dan `session-revoked-guard.tsx`
 * juga mengekspor komponen. Selama keduanya tinggal di satu berkas, aturan
 * react-refresh menandainya, dan test yang menguji fungsinya ikut menyeret
 * seluruh impor React/Convex lewat mock. Di sini ia bisa diuji langsung.
 *
 * Sifat yang dijaga: satu pencabutan menghasilkan tepat satu transisi dari
 * `idle`. Render ulang, kiriman ulang dari Convex, dan sambungan kembali
 * semuanya melewati fungsi yang sama, jadi tidak ada jalan untuk memulai
 * keluarnya dua kali - dan karena itu tidak akan ada dua toast untuk satu
 * peristiwa yang sama.
 */

/** Tahap keluar perangkat. Setiap tahap hanya boleh dilalui satu kali. */
export type ExitStage = "idle" | "notified" | "signing_out" | "redirected";

/** Status sesi yang dipantau watchdog, sebagaimana bentuk di server. */
export type WatchedSessionStatus = {
  status: "none" | "untracked" | "active" | "current" | "revoked" | "expired";
  revokedAt?: number;
};

export function nextExitStage(
  stage: ExitStage,
  status: WatchedSessionStatus | undefined,
  onAuthPage: boolean,
): ExitStage {
  if (onAuthPage) return stage;
  if (status?.status !== "revoked") return stage;
  if (stage !== "idle") return stage;
  return "notified";
}
