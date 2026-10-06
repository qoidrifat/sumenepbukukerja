import { Eye, Inbox, MessageCircle, Store } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerRequests, useOwnerVendors } from "@/lib/catalog-store";
import { profileCompleteness, qualityIssues } from "@/lib/catalog-data";
import type { Vendor } from "@/lib/catalog";
import { focusRing } from "@/lib/focus-ring";

const cardClass = "flex h-full flex-col border-slate-200 bg-white shadow-sm";
const statGrid = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
const footerButtonClass = `inline-flex min-h-12 items-center gap-1.5 rounded-lg px-1 text-sm font-extrabold text-blue-700 hover:bg-blue-50 ${focusRing}`;

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
 * request). Tanpa mutation; angka `0` dirender apa adanya, skeleton
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
    <div className="flex flex-col gap-6">
      <section aria-label="Ringkasan usaha" className={statGrid}>
        <Card className={cardClass}>
          <CardHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Store className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">Tayang</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {owned === undefined ? (
              <span role="status" aria-label="Memuat jumlah listing tayang" className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-slate-950">{String(activeCount)}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">listing tampil di katalog</p>
          </CardContent>
          <CardFooter>
            <button type="button" onClick={() => scrollToSection("usaha-saya")} className={footerButtonClass}>
              Kelola listing
            </button>
          </CardFooter>
        </Card>

        <Card className={cardClass}>
          <CardHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Eye className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">Dilihat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {owned === undefined ? (
              <span role="status" aria-label="Memuat jumlah tayangan" className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-slate-950">{String(seenTotal)}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">tayangan di hasil pencarian</p>
          </CardContent>
          <CardFooter>
            <button type="button" onClick={() => scrollToSection("usaha-saya")} className={footerButtonClass}>
              Lihat listing
            </button>
          </CardFooter>
        </Card>

        <Card className={cardClass}>
          <CardHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <MessageCircle className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">Dihubungi</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {owned === undefined ? (
              <span role="status" aria-label="Memuat jumlah kontak" className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-slate-950">{String(contactedTotal)}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">ketuk hubungi via WhatsApp</p>
          </CardContent>
          <CardFooter>
            <button type="button" onClick={() => scrollToSection("permintaan-mitra")} className={footerButtonClass}>
              Lihat permintaan
            </button>
          </CardFooter>
        </Card>

        <Card className={cardClass}>
          <CardHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Inbox className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-lg">Request cocok</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {requests === undefined ? (
              <span role="status" aria-label="Memuat jumlah request cocok" className="block h-9 w-20 rounded bg-slate-200 motion-safe:animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-slate-950">{String(openRequestCount)}</p>
            )}
            <p className="mt-1 text-sm text-slate-600">permintaan terbuka untuk Anda</p>
          </CardContent>
          <CardFooter>
            <button type="button" onClick={() => scrollToSection("permintaan-mitra")} className={footerButtonClass}>
              Tanggapi request
            </button>
          </CardFooter>
        </Card>
      </section>

      <section aria-label="Performa per listing" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5 sm:px-6">
          <h2 className="text-xl font-black text-slate-950">Performa per listing</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Tayangan, kontak, bagikan, dan kelengkapan tiap usaha Anda.</p>
        </div>
        {owned === undefined ? (
          <p role="status" className="p-5 text-sm font-semibold text-slate-600 motion-safe:animate-pulse sm:px-6">Memuat performa listing...</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm leading-6 text-slate-600 sm:px-6">Belum ada listing. Tambahkan usaha pertama Anda pada formulir di atas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">
                  <th scope="col" className="px-5 py-3 sm:px-6">Listing</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Dilihat</th>
                  <th scope="col" className="hidden px-3 py-3 md:table-cell">Dihubungi</th>
                  <th scope="col" className="hidden px-3 py-3 md:table-cell">Dibagikan</th>
                  <th scope="col" className="px-5 py-3 sm:px-6">Kelengkapan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const issues = qualityIssues(row as Vendor);
                  const completeness = profileCompleteness(row);
                  return (
                    <tr key={row._id}>
                      <td className="px-5 py-3 font-extrabold text-slate-950 sm:px-6">{row.name}</td>
                      <td className="px-3 py-3 text-slate-600">{statusLabel(row.status ?? "active")}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">{String(row.searchImpressions ?? 0)}</td>
                      <td className="hidden px-3 py-3 font-bold text-slate-800 md:table-cell">{String(row.whatsappClicks ?? 0)}</td>
                      <td className="hidden px-3 py-3 font-bold text-slate-800 md:table-cell">{String(row.shareClicks ?? 0)}</td>
                      <td className="px-5 py-3 text-slate-600 sm:px-6">
                        {completeness}%{issues.length > 0 ? ` · ${issues.length} perlu dilengkapi` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
