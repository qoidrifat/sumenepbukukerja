import { useState } from "react";
import { AdminNotice } from "@/components/admin-workspace-hero";
import { AdminReportReview } from "@/components/admin-report-review";
import {
  useCatalogActions,
  useCurrentAccess,
  useOpenReports,
  useReviewQueue,
} from "@/lib/catalog-store";

/**
 * Halaman Moderasi di `/admin/moderasi`.
 *
 * Isinya PINDAHAN verbatim dari `Admin.tsx` (blok antrean review +
 * `AdminReportReview` di `Admin.tsx:949-955` beserta hook datanya
 * `useReviewQueue`/`useOpenReports` dan `updateReportStatus` +
 * `busyAction` di `Admin.tsx:512-534`): langganan hook, penjagaan
 * `canModerate`, kunci `busyAction` per laporan, dan pesan notice/error
 * tidak diubah — hanya tempatnya yang pindah ke rute bertingkat supaya
 * dirender di dalam `<Outlet/>` milik `AdminShell`.
 */
export function ModerasiPage() {
  const access = useCurrentAccess();
  const reviewQueue = useReviewQueue();
  const reports = useOpenReports() ?? [];
  const { updateReport } = useCatalogActions();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const updateReportStatus = async (
    id: string,
    status: "reviewing" | "resolved" | "dismissed",
  ) => {
    if (!access?.canModerate) {
      setError("Viewer tidak dapat memperbarui laporan.");
      return;
    }
    setBusyAction(`report:${id}`);
    setError("");
    try {
      await updateReport({ id: id as never, status });
      setNotice("Status laporan warga diperbarui.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Laporan belum dapat diperbarui.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  if (access === undefined) return null;

  return (
    <main className="admin-shell-frame mx-auto max-w-[1600px] px-3 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10">
      {notice ? (
        <AdminNotice notice={notice} onDismiss={() => setNotice("")} />
      ) : null}

      {error ? (
        <div
          className="mt-5 flex items-start gap-3 border-2 border-[#121212] bg-[#E9B4A7] px-4 py-3 text-[#7C2D12] shadow-[3px_3px_0_#121212]"
          role="alert"
        >
          <p className="text-base font-black">{error}</p>
        </div>
      ) : null}

      <section className="admin-panel overflow-hidden" aria-labelledby="moderasi-title">
        <div className="border-b-2 border-[#121212] bg-[#FFE662] p-4 sm:p-6">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">Moderasi</p>
          <h2 id="moderasi-title" className="mt-1 text-2xl font-black text-[#1A1A1A]">Antrean review</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#525252]">Klaim listing, foto, dan laporan warga yang menunggu ditindak. Angka yang sama menggerakkan lonceng di header ruang pengelola.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-4 [&>*]:min-w-0">
          <div className="border-2 border-[#121212] bg-[#FF5A26] p-4 text-white">
            <p className="text-sm font-bold">Klaim listing</p>
            <p className="mt-1 text-4xl font-black tracking-[-0.06em]">{reviewQueue?.claims ?? "…"}</p>
          </div>
          <div className="border-2 border-[#121212] bg-white p-4 text-[#1A1A1A]">
            <p className="text-sm font-bold">Foto menunggu</p>
            <p className="mt-1 text-4xl font-black tracking-[-0.06em]">{reviewQueue?.photos ?? "…"}</p>
          </div>
          <div className="border-2 border-[#121212] bg-white p-4 text-[#1A1A1A]">
            <p className="text-sm font-bold">Laporan warga</p>
            <p className="mt-1 text-4xl font-black tracking-[-0.06em]">{reviewQueue?.reports ?? "…"}</p>
          </div>
          <div className="border-2 border-[#121212] bg-[#DCEBD7] p-4 text-[#24533A]">
            <p className="text-sm font-bold">Total antrean</p>
            <p className="mt-1 text-4xl font-black tracking-[-0.06em]">{reviewQueue?.total ?? "…"}</p>
          </div>
        </div>
      </section>

      {reports.length > 0 ? (
        <AdminReportReview
          reports={reports}
          busyAction={busyAction}
          onUpdateStatus={updateReportStatus}
        />
      ) : null}
    </main>
  );
}
