import { useNavigate } from "react-router";
import { useVendorReports } from "@/lib/catalog-store";
import { EmptyStateCard } from "@/components/empty-state-card";
import { DashPanel, DashSection } from "@/components/dashboard-ui";

const statusBadge: Record<string, { label: string; tone: string }> = {
  open: { label: "Terbuka", tone: "bg-amber-100 text-amber-800" },
  reviewing: { label: "Ditinjau", tone: "bg-blue-100 text-blue-800" },
  resolved: { label: "Selesai", tone: "bg-emerald-100 text-emerald-800" },
  dismissed: { label: "Ditutup", tone: "bg-slate-200 text-slate-600" },
};

function badgeFor(status: string) {
  return statusBadge[status] ?? { label: status, tone: "bg-slate-200 text-slate-600" };
}

/**
 * Laporan warga terhadap listing milik mitra (read-only).
 *
 * Hanya alasan, rincian, status, dan tanggal yang tampil — identitas
 * pelapor tidak pernah dikirim server lewat query ini, jadi tidak ada
 * yang perlu disembunyikan di sini. Tanpa mutation.
 */
export function MitraReports() {
  const reports = useVendorReports();
  const navigate = useNavigate();

  if (reports === undefined) {
    return (
      <DashSection
        eyebrow="Masukan warga"
        title="Laporan terhadap listing"
        description="Laporan warga atas usaha Anda dan status penanganannya."
      >
        <DashPanel className="p-5 sm:p-6">
          <p role="status" className="dash-sub text-sm font-semibold motion-safe:animate-pulse">Memuat laporan...</p>
        </DashPanel>
      </DashSection>
    );
  }

  if (reports.length === 0) {
    return (
      <DashSection
        eyebrow="Masukan warga"
        title="Laporan terhadap listing"
        description="Laporan warga atas usaha Anda dan status penanganannya."
      >
        <EmptyStateCard
          title="Belum ada laporan"
          body="Laporan warga terhadap listing Anda akan tampil di sini setelah ada yang masuk."
          actionLabel="Lihat katalog"
          onAction={() => navigate("/")}
        />
      </DashSection>
    );
  }

  return (
    <DashSection
      eyebrow="Masukan warga"
      title="Laporan terhadap listing"
      description="Laporan warga atas usaha Anda dan status penanganannya."
    >
      <ul aria-label="Laporan terhadap listing" className="space-y-3">
        {reports.map((row) => {
          const badge = badgeFor(row.status);
          return (
            <li key={row._id} className="dash-panel dash-panel--soft p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-extrabold tracking-[-0.01em] text-slate-950">{row.vendorName}</p>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ${badge.tone}`}>
                  {badge.label}
                </span>
              </div>
              <p className="mt-2 text-sm font-extrabold text-slate-900">{row.reason}</p>
              <p className="dash-sub mt-1 line-clamp-3 text-sm">{row.details}</p>
              <p className="dash-sub mt-2 text-xs tabular-nums">
                {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(row.createdAt))}
              </p>
            </li>
          );
        })}
      </ul>
    </DashSection>
  );
}
