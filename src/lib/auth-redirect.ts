/**
 * Tujuan kembali setelah masuk, dari parameter `returnTo`.
 *
 * Hanya path absolut lokal (`/dashboard`, bukan `//evil.com`) yang
 * diteruskan; sisanya jatuh ke fallback. Dipakai `/auth` dan `/auth/email`
 * supaya keduanya sepakat tanpa menduplikasi logika (dan supaya berkas
 * halaman tetap hanya mengekspor komponen — aturan react-refresh).
 */
export function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
): string {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}
