import { useMyClaims } from "@/lib/catalog-store";
import { EmptyStateCard } from "@/components/empty-state-card";

function scrollToUsaha() {
  document.getElementById("usaha-saya")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function statusBadgeClass(status: string): string {
  if (status === "verified") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "rejected") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
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
    <section aria-label="Status klaim" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-black text-slate-950">Status klaim</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Pantau pengajuan klaim listing Anda sampai terverifikasi admin.</p>
      {claims === undefined ? (
        <p role="status" className="mt-4 text-sm font-semibold text-slate-600 motion-safe:animate-pulse">Memuat status klaim...</p>
      ) : claims.length === 0 ? (
        <div className="mt-4">
          <EmptyStateCard
            title="Belum ada klaim"
            body="Klaim listing yang sudah tayang untuk mengelolanya."
            actionLabel="Tambah listing"
            onAction={scrollToUsaha}
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {claims.map((claim) => (
            <li key={claim._id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="font-extrabold text-slate-950">{claim.vendorName ?? "Listing"}</p>
                {claim.status === "rejected" && claim.reviewNote ? (
                  <p className="mt-1 text-sm leading-6 text-slate-600">{claim.reviewNote}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className="text-sm text-slate-500">{new Date(claim.createdAt).toLocaleDateString("id-ID")}</p>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ring-inset ${statusBadgeClass(claim.status)}`}>
                  {statusLabel(claim.status)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
