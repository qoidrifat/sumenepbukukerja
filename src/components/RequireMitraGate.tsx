import type { ReactNode } from "react";
import { Link } from "react-router";
import { Plus, Store } from "lucide-react";
import { useMyClaims, useOwnerVendors } from "@/lib/catalog-store";
import { focusRing } from "@/lib/focus-ring";

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
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-base font-bold text-slate-600 motion-safe:animate-pulse" role="status">
        Memeriksa usaha Anda...
      </p>
    );
  }

  const isQualified =
    owned.length > 0 || claims.some((claim) => claim.status === "verified");

  if (!isQualified) {
    return (
      <section aria-label="Mulai sebagai mitra" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
          Ruang mitra
        </p>
        <h2 className="mt-1 text-xl font-black text-slate-950">
          Kelola usaha Anda di sini
        </h2>
        <p className="mt-2 text-base leading-7 text-slate-600">
          Daftarkan usaha pertama Anda pada formulir di bawah, atau klaim listing
          yang sudah tayang. Klaim terverifikasi admin membuka pengelolaan penuh.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
          >
            <Plus className="size-4" aria-hidden="true" />
            Tambah listing
          </button>
          <Link
            to="/#katalog"
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}
          >
            <Store className="size-4" aria-hidden="true" />
            Klaim listing
          </Link>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
