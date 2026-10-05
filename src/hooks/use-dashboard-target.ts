import { useCurrentAccess } from "@/lib/catalog-store";
import { dashboardTargetFor } from "@/lib/dashboard-target";

/**
 * Tujuan item "Dashboard" untuk sesi saat ini.
 *
 * `null` = akses belum terjawab; pemanggil menonaktifkan itemnya.
 * Logika pemetaannya di `dashboardTargetFor` (unit-tested), hook ini
 * hanya menyambungkan query akses yang sudah ada.
 */
export function useDashboardTarget(): string | null {
  const access = useCurrentAccess();
  return dashboardTargetFor(
    access === undefined ? undefined : { canViewAdmin: access.canViewAdmin },
  );
}
