import type { ReactNode } from "react";
import { Link } from "react-router";
import { useCurrentAccess } from "@/lib/catalog-store";
import { focusRing } from "@/lib/focus-ring";

/**
 * Gerbang UX untuk `/staff/dashboard`.
 *
 * Hanya UX: otorisasi sungguhan tetap di tiap mutation server. Warga yang
 * membuka URL ini mendapat penjelasan + jalan keluar, bukan redirect
 * diam-diam (supaya URL bisa dibagikan dan pesannya jelas — spec §7).
 */
export function RequireStaffGate({ children }: { children: ReactNode }) {
  const access = useCurrentAccess();

  if (access === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-base font-black text-slate-600" role="status">
          Memeriksa akses staff...
        </p>
      </main>
    );
  }

  if (!access.canViewAdmin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
            Akses staff
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">
            Halaman ini untuk staff
          </h1>
          <p className="mt-2 text-base leading-7 text-slate-600">
            Akun Anda belum memiliki peran staff. Peran hanya bisa diberikan oleh
            admin lewat menu Peran & Audit.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link
              to="/warga/dashboard"
              className={`flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-4 text-base font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
            >
              Ke dashboard warga
            </Link>
            <Link
              to="/"
              className={`flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-base font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}
            >
              Kembali ke katalog
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
