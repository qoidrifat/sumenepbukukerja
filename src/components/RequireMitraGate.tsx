import type { ReactNode } from "react";
import { Link } from "react-router";
import { Plus, Store } from "lucide-react";
import { useMyClaims, useOwnerVendors } from "@/lib/catalog-store";
import { DashPanel } from "@/components/dashboard-ui";
import { dashButtonClass } from "@/lib/dash-button-class";

/**
 * Gerbang UX inline untuk section khusus-qualified di MitraDashboard
 * (menggantikan RequireStaffGate yang dihapus).
 *
 * Bukan penolakan dan BUKAN full-page: gate ini dirender DI DALAM halaman,
 * di antara manager (selalu tampil) dan section qualified. Belum-mitra mendapat
 * kartu onboarding + penjelasan klaim terverifikasi; formulir tambah + notifikasi
 * tetap terjangkau karena hidup di luar gate. Otorisasi sungguhan tetap di
 * tiap mutation server.
 */
export function RequireMitraGate({ children }: { children: ReactNode }) {
  const owned = useOwnerVendors();
  const claims = useMyClaims();

  if (owned === undefined || claims === undefined) {
    return (
      <DashPanel className="p-5 sm:p-6">
        <p className="dash-sub text-base font-bold motion-safe:animate-pulse" role="status">
          Memeriksa usaha Anda...
        </p>
      </DashPanel>
    );
  }

  const isQualified =
    owned.length > 0 || claims.some((claim) => claim.status === "verified");

  if (!isQualified) {
    return (
      <DashPanel className="p-5 sm:p-8">
        <section aria-label="Mulai sebagai mitra">
          <p className="dash-eyebrow">Ruang mitra</p>
          <h2 className="dash-title mt-3 text-xl sm:text-2xl">Kelola usaha Anda di sini</h2>
          <p className="dash-sub mt-2 max-w-2xl text-base">
            Daftarkan usaha pertama Anda pada formulir di bawah, atau klaim listing
            yang sudah tayang. Klaim terverifikasi admin membuka pengelolaan penuh.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={dashButtonClass("primary")}
            >
              <Plus className="size-4" aria-hidden="true" />
              Tambah listing
            </button>
            <Link to="/#katalog" className={dashButtonClass("secondary")}>
              <Store className="size-4" aria-hidden="true" />
              Klaim listing
            </Link>
          </div>
        </section>
      </DashPanel>
    );
  }

  return <>{children}</>;
}
