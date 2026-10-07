import { Eye, Inbox, MessageCircle, Store } from "lucide-react";
import { useOwnerRequests, useOwnerVendors } from "@/lib/catalog-store";
import { profileCompleteness, qualityIssues } from "@/lib/catalog-data";
import type { Vendor } from "@/lib/catalog";
import { DashPanel, DashPill, DashSection, DashStat } from "@/components/dashboard-ui";
import { focusRing } from "@/lib/focus-ring";

const statGrid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
const footerLinkClass = `inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-extrabold text-blue-700 hover:text-blue-900 ${focusRing}`;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function statusLabel(status: string): string {
  if (status === "active") return "Tayang";
  if (status === "draft") return "Draft";
  return "Nonaktif";
}

/**
 * Ringkasan read-only untuk mitra: empat angka + tabel performa per listing.
 *
 * Semua data dari `useOwnerVendors()` rows (+`useOwnerRequests()` untuk kartu
 * request). Tanpa mutation; angka `0` dirender apa adanya, kerangka
 * `role="status"` saat query loading.
 */
export function MitraStats() {
  const owned = useOwnerVendors();
  const requests = useOwnerRequests();

  const rows = owned ?? [];
  const activeCount = rows.filter((row) => (row.status ?? "active") === "active").length;
  const seenTotal = rows.reduce((sum, row) => sum + (row.searchImpressions ?? 0), 0);
  const contactedTotal = rows.reduce((sum, row) => sum + (row.whatsappClicks ?? 0), 0);
  const openRequestCount = (requests ?? []).filter((request) => request.status === "open").length;

  return (
    <div className="flex flex-col gap-8">
      <DashSection
        eyebrow="Performa"
        title="Angka usaha Anda"
        description="Dihitung dari listing yang sudah tayang dan permintaan terbuka yang cocok dengan area layanan Anda."
        grid={statGrid}
      >
        <DashStat
          index={0}
          icon={<Store className="size-5" />}
          tone="blue"
          label="Tayang"
          value={owned === undefined ? undefined : activeCount}
          hint="listing tampil di katalog"
          action={
            <button type="button" onClick={() => scrollToSection("usaha-saya")} className={footerLinkClass}>
              Kelola listing
            </button>
          }
        />
        <DashStat
          index={1}
          icon={<Eye className="size-5" />}
          tone="slate"
          label="Dilihat"
          value={owned === undefined ? undefined : seenTotal}
          hint="tayangan di hasil pencarian"
          action={
            <button type="button" onClick={() => scrollToSection("usaha-saya")} className={footerLinkClass}>
              Lihat listing
            </button>
          }
        />
        <DashStat
          index={2}
          icon={<MessageCircle className="size-5" />}
          tone="emerald"
          label="Dihubungi"
          value={owned === undefined ? undefined : contactedTotal}
          hint="ketuk hubungi via WhatsApp"
          action={
            <button type="button" onClick={() => scrollToSection("permintaan-mitra")} className={footerLinkClass}>
              Lihat permintaan
            </button>
          }
        />
        <DashStat
          index={3}
          icon={<Inbox className="size-5" />}
          tone="amber"
          label="Request cocok"
          value={requests === undefined ? undefined : openRequestCount}
          hint="permintaan terbuka untuk Anda"
          action={
            <button type="button" onClick={() => scrollToSection("permintaan-mitra")} className={footerLinkClass}>
              Tanggapi request
            </button>
          }
        />
      </DashSection>

      <DashSection
        eyebrow="Rincian"
        title="Performa per listing"
        description="Tayangan, kontak, bagikan, dan kelengkapan tiap usaha Anda."
      >
        <DashPanel className="overflow-hidden">
          {owned === undefined ? (
            <p role="status" className="dash-sub p-5 text-sm font-semibold motion-safe:animate-pulse sm:px-6">
              Memuat performa listing...
            </p>
          ) : rows.length === 0 ? (
            <p className="dash-sub p-5 text-sm sm:px-6">Belum ada listing. Tambahkan usaha pertama Anda pada formulir di atas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                    <th scope="col" className="px-5 py-3.5 sm:px-6">Listing</th>
                    <th scope="col" className="px-3 py-3.5">Status</th>
                    <th scope="col" className="px-3 py-3.5 text-right">Dilihat</th>
                    <th scope="col" className="hidden px-3 py-3.5 text-right md:table-cell">Dihubungi</th>
                    <th scope="col" className="hidden px-3 py-3.5 text-right md:table-cell">Dibagikan</th>
                    <th scope="col" className="px-5 py-3.5 sm:px-6">Kelengkapan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const issues = qualityIssues(row as Vendor);
                    const completeness = profileCompleteness(row);
                    return (
                      <tr key={row._id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-3.5 font-extrabold tracking-[-0.01em] text-slate-950 sm:px-6">{row.name}</td>
                        <td className="px-3 py-3.5">
                          <DashPill tone={(row.status ?? "active") === "active" ? "green" : "neutral"}>
                            {statusLabel(row.status ?? "active")}
                          </DashPill>
                        </td>
                        <td className="dash-num px-3 py-3.5 text-right text-slate-800">{String(row.searchImpressions ?? 0)}</td>
                        <td className="dash-num hidden px-3 py-3.5 text-right text-slate-800 md:table-cell">{String(row.whatsappClicks ?? 0)}</td>
                        <td className="dash-num hidden px-3 py-3.5 text-right text-slate-800 md:table-cell">{String(row.shareClicks ?? 0)}</td>
                        <td className="px-5 py-3.5 sm:px-6">
                          <span className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-16 flex-none overflow-hidden rounded-full bg-slate-200"
                            >
                              <span
                                className={`block h-full rounded-full ${issues.length > 0 ? "bg-amber-500" : "bg-emerald-600"}`}
                                style={{ width: `${Math.max(4, Math.min(100, completeness))}%` }}
                              />
                            </span>
                            <span className="dash-sub text-sm">
                              {completeness}%{issues.length > 0 ? ` · ${issues.length} perlu dilengkapi` : ""}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashPanel>
      </DashSection>
    </div>
  );
}
