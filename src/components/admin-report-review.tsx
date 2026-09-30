/**
 * Panel "Laporan perlu ditinjau" di Ruang pengelola.
 *
 * Dipisah pada Fase 9.1 Pekerjaan 6. Logika moderasi laporan tidak menambah
 * bobot pada file Meja kerja, dan file ini tidak boleh mengimpor apa pun dari
 * sana kecuali token tombol.
 */
import { AlertTriangle } from "lucide-react";

import { SectionHeading } from "./admin-workspace";

export type AdminReport = {
  _id: string;
  reason: string;
  details: string;
  status: string;
};

/**
 * Panel "Laporan perlu ditinjau" di Ruang pengelola. Dipisah dari halaman
 * supaya logic moderasi laporan tidak menambah bobot pada file Meja kerja.
 */
export function AdminReportReview({
  reports,
  busyAction,
  onUpdateStatus,
}: {
  reports: AdminReport[];
  busyAction: string | null;
  onUpdateStatus: (
    id: string,
    status: "reviewing" | "resolved" | "dismissed",
  ) => Promise<void>;
}) {
  return (
    <section className="admin-panel mt-8 overflow-hidden">
      <SectionHeading
        eyebrow="Moderasi warga"
        title="Laporan perlu ditinjau"
        description="Periksa alasan, detail, dan tetapkan status laporan tanpa mengubah data listing."
        icon={AlertTriangle}
      />
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
        {reports.map((report) => (
          <article key={report._id} className="border-2 border-[#121212] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-black text-[#1A1A1A]">{report.reason}</p>
                <p className="mt-1 text-sm leading-6 text-[#525252]">{report.details}</p>
              </div>
              <span className="admin-status admin-status-inactive">{report.status}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={busyAction === `report:${report._id}`}
                onClick={() => void onUpdateStatus(report._id, "reviewing")}
                className="admin-btn admin-btn-highlight px-3"
              >
                Tandai ditinjau
              </button>
              <button
                type="button"
                disabled={busyAction === `report:${report._id}`}
                onClick={() => void onUpdateStatus(report._id, "resolved")}
                className="admin-btn bg-[#DCEBD7] px-3 text-[#24533A]"
              >
                Selesaikan
              </button>
              <button
                type="button"
                disabled={busyAction === `report:${report._id}`}
                onClick={() => void onUpdateStatus(report._id, "dismissed")}
                className="admin-btn admin-btn-secondary px-3"
              >
                Abaikan
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
