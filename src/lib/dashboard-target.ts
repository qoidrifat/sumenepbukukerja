/**
 * Satu-satunya tempat yang tahu pemetaan akses → URL dashboard (v2: mitra).
 *
 * Murni (tanpa hook/query) supaya bisa diuji unit tanpa provider Convex.
 * `undefined` di sisi mana pun berarti query terkait belum menjawab —
 * pemanggil menonaktifkan item Dashboard sampai jawabannya tiba,
 * bukan menebak tujuan.
 */
export function dashboardTargetFor(
  access: { canViewAdmin: boolean } | null | undefined,
  mitra: { qualified: boolean } | null | undefined,
): string | null {
  if (access === undefined || mitra === undefined) return null;
  if (access !== null && access.canViewAdmin) return "/admin";
  if (mitra !== null && mitra.qualified) return "/mitra/dashboard";
  return "/warga/dashboard";
}
