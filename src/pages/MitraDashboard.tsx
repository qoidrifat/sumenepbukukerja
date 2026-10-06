import { Link } from "react-router";
import { Plus } from "lucide-react";
import { MitraListingManager } from "@/components/mitra-listing-manager";
import { MitraStats } from "@/components/mitra-stats";
import { RequireMitraGate } from "@/components/RequireMitraGate";
import { NotificationCenter } from "@/components/community-notification-center";
import { OwnerRequestWorkspace } from "@/components/community-widgets";
import { PwaControls } from "@/components/community-widgets";
import { focusRing } from "@/lib/focus-ring";

export default function MitraDashboard() {
  const scrollToUsaha = () => document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <main className="min-h-dvh bg-[#f7f8fc] px-4 py-6 text-foreground sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 sm:gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Ruang mitra</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">Kelola usaha Anda.</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">Listing, ketersediaan, paket, permintaan, dan ulasan — dari satu tempat.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={scrollToUsaha} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 ${focusRing}`}>
              <Plus className="size-4" aria-hidden="true" />Tambah listing
            </button>
            <Link to="/" className={`inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}>
              Lihat katalog
            </Link>
          </div>
        </header>
        <div id="usaha-saya" className="scroll-mt-6"><MitraListingManager /></div>
        <RequireMitraGate>
          <MitraStats />
          <div id="permintaan-mitra" className="scroll-mt-6"><OwnerRequestWorkspace /></div>
        </RequireMitraGate>
        <NotificationCenter />
        <PwaControls />
      </div>
    </main>
  );
}
