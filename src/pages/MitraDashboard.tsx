import { Link } from "react-router";
import { Plus, Store } from "lucide-react";
import { MitraListingManager } from "@/components/mitra-listing-manager";
import { MitraClaimTracker } from "@/components/mitra-claim-tracker";
import { MitraReports } from "@/components/mitra-reports";
import { MitraReviews } from "@/components/mitra-reviews";
import { MitraStats } from "@/components/mitra-stats";
import { RequireMitraGate } from "@/components/RequireMitraGate";
import { NotificationCenter } from "@/components/community-notification-center";
import { OwnerRequestWorkspace } from "@/components/community-widgets";
import { PwaControls } from "@/components/community-widgets";
import { DashBar, DashBody, DashHero, DashShell } from "@/components/dashboard-ui";
import { dashButtonClass } from "@/lib/dash-button-class";

export default function MitraDashboard() {
  const scrollToUsaha = () => document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <DashShell>
      <DashBar label="Ruang mitra" hint="Sumenep Buku Kerja">
        <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-extrabold text-blue-700 hover:bg-blue-50">
          <Store className="size-4" aria-hidden="true" />
          Katalog
        </Link>
      </DashBar>

      <DashBody>
        <DashHero
          eyebrow="Ruang mitra"
          title="Kelola usaha Anda."
          description="Listing, ketersediaan, paket, permintaan, dan ulasan — dari satu tempat."
          actions={
            <>
              <button type="button" onClick={scrollToUsaha} className={dashButtonClass("primary")}>
                <Plus className="size-4" aria-hidden="true" />
                Tambah listing
              </button>
              <Link to="/" className={dashButtonClass("secondary")}>
                Lihat katalog
              </Link>
            </>
          }
        />

        <PwaControls />

        {/* Urutan section bukan selera: formulir usaha harus selalu terjangkau
            (manager hidup di luar gate), lalu pelacak klaim memberi tahu status
            verifikasi sebelum pengguna menabrak gerbangnya, dan hanya section
            khusus-qualified yang berada DI DALAM gate. Notifikasi sengaja di
            luar gate supaya pengguna yang belum terverifikasi tetap menerima
            kabar klaimnya. */}
        <div id="usaha-saya" className="scroll-mt-20"><MitraListingManager /></div>

        <MitraClaimTracker />

        <MitraReports />

        <RequireMitraGate>
          <MitraReviews />
          <MitraStats />
          <div id="permintaan-mitra" className="scroll-mt-20"><OwnerRequestWorkspace /></div>
        </RequireMitraGate>

        <NotificationCenter />
      </DashBody>
    </DashShell>
  );
}
