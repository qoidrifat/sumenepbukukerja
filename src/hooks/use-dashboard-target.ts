import { useMyClaims, useCurrentAccess, useOwnerVendors } from "@/lib/catalog-store";
import { dashboardTargetFor } from "@/lib/dashboard-target";

/**
 * Tujuan item "Dashboard" untuk sesi saat ini.
 *
 * `null` = salah satu query belum terjawab; pemanggil menonaktifkan itemnya.
 * Logika pemetaannya di `dashboardTargetFor` (unit-tested), hook ini
 * hanya menyambungkan query yang sudah ada: akses + listing milik sendiri
 * + klaim saya. Qualified = punya ≥1 listing ATAU ≥1 klaim terverifikasi.
 * Target didelegasikan ke `dashboardTargetFor`: "/admin" untuk internal,
 * "/mitra/dashboard" untuk mitra qualified, "/warga/dashboard" untuk warga.
 */
export function useDashboardTarget(): string | null {
  const access = useCurrentAccess();
  const owned = useOwnerVendors();
  const claims = useMyClaims();
  if (access === undefined || owned === undefined || claims === undefined) return null;
  const qualified =
    owned.length > 0 || claims.some((claim) => claim.status === "verified");
  return dashboardTargetFor(
    access === null ? null : { canViewAdmin: access.canViewAdmin },
    { qualified },
  );
}
