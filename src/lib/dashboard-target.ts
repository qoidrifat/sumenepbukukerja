/**
 * Satu-satunya tempat yang tahu pemetaan akses → URL dashboard.
 *
 * Murni (tanpa hook/query) supaya bisa diuji unit tanpa provider Convex.
 * `undefined` berarti query akses belum menjawab — pemanggil menonaktifkan
 * item Dashboard sampai jawabannya tiba, bukan menebak tujuan.
 */
export function dashboardTargetFor(
  access: { canViewAdmin: boolean } | null | undefined,
): string | null {
  if (access === undefined) return null;
  if (access !== null && access.canViewAdmin) return "/staff/dashboard";
  return "/warga/dashboard";
}
