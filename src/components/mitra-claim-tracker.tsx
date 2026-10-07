import { useMyClaims } from "@/lib/catalog-store";
import { EmptyStateCard } from "@/components/empty-state-card";
import { DashPanel, DashPill, DashSection } from "@/components/dashboard-ui";

function scrollToUsaha() {
  document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function statusTone(status: string): "green" | "red" | "amber" {
  if (status === "verified") return "green";
  if (status === "rejected") return "red";
  return "amber";
}

function statusLabel(status: string): string {
  if (status === "verified") return "Terverifikasi";
  if (status === "rejected") return "Ditolak";
  return "Menunggu verifikasi";
}

/**
 * Pelacak klaim listing read-only untuk mitra.
 *
 * Tiap klaim = satu baris: nama listing (`vendorName ?? "Listing"`), badge
 * status, dan tanggal pengajuan. `reviewNote` hanya dirender bila ada
 * (khusus penolakan yang diberi catatan admin). Tanpa mutation.
 */
export function MitraClaimTracker() {
  const claims = useMyClaims();

  return (
    <DashSection
      eyebrow="Klaim"
      title="Status klaim"
      description="Pantau pengajuan klaim listing Anda sampai terverifikasi admin."
    >
      {claims === undefined ? (
        <DashPanel className="p-5 sm:p-6">
          <p role="status" className="dash-sub text-sm font-semibold motion-safe:animate-pulse">Memuat status klaim...</p>
        </DashPanel>
      ) : claims.length === 0 ? (
        <EmptyStateCard
          title="Belum ada klaim"
          body="Klaim listing yang sudah tayang untuk mengelolanya."
          actionLabel="Tambah listing"
          onAction={scrollToUsaha}
        />
      ) : (
        <DashPanel className="p-5 sm:p-6">
          <ul className="divide-y divide-slate-100">
            {claims.map((claim) => (
              <li key={claim._id} className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="font-extrabold tracking-[-0.01em] text-slate-950">{claim.vendorName ?? "Listing"}</p>
                  {claim.status === "rejected" && claim.reviewNote ? (
                    <p className="dash-sub mt-1 text-sm">{claim.reviewNote}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
                  <p className="text-sm font-semibold tabular-nums text-slate-500">
                    {new Date(claim.createdAt).toLocaleDateString("id-ID")}
                  </p>
                  <DashPill tone={statusTone(claim.status)}>{statusLabel(claim.status)}</DashPill>
                </div>
              </li>
            ))}
          </ul>
        </DashPanel>
      )}
    </DashSection>
  );
}
