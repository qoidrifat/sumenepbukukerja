// Riwayat laporan error untuk pengelola.
//
// Ini kotak masuk operasional, bukan lampiran: apa yang gagal, di mana, kapan,
// berapa kali, dan apakah tautan handoff WhatsApp-nya sudah disiapkan. Semua
// isi sudah disanitasi saat pelaporan, jadi tidak ada yang perlu disembunyikan
// lagi di lapisan tampilan.
//
// Kolom alert sengaja tidak pernah menampilkan "Terkirim" untuk jalur admin.
// Handoff admin sekarang click-to-chat `wa.me`: tautannya dibuat, isinya
// ter-encode, dan pengelola yang menekan kirim.
//
// Query `listErrorReports` melempar untuk akun biasa, jadi komponen ini hanya
// pernah dirender di dalam ruang admin yang sudah dijaga server.

import { useState } from "react";
import { AlertTriangle, Bug, CircleAlert, ExternalLink, OctagonAlert, ShieldCheck } from "lucide-react";
import {
  useErrorReportActions,
  useErrorReportSummary,
  useErrorReports,
  type AdminErrorReport,
} from "@/lib/catalog-store";
import { ThemedSelect } from "@/components/ui/themed-select";
import { SectionHeading, TimeStampLabel } from "./admin-workspace";
import { errorReportStatusSelectOptions } from "@/lib/select-options";

const SEVERITY_STYLE: Record<string, { label: string; className: string; icon: typeof Bug }> = {
  info: { label: "Info", className: "bg-[#F1EDE3] text-[#525252]", icon: Bug },
  warning: { label: "Warning", className: "bg-[#FFE662] text-[#1A1A1A]", icon: CircleAlert },
  error: { label: "Error", className: "bg-[#FFD9A8] text-[#7C2D12]", icon: AlertTriangle },
  critical: { label: "Critical", className: "bg-[#E9B4A7] text-[#7C2D12]", icon: OctagonAlert },
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-[#FFE662] text-[#1A1A1A]",
  acknowledged: "bg-[#DBEAFE] text-[#1E3A8A]",
  resolved: "bg-[#DCEBD7] text-[#24533A]",
  ignored: "bg-[#F1EDE3] text-[#525252]",
};

function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info!;
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 border-2 border-[#121212] px-2 py-0.5 text-xs font-black ${style.className}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {style.label}
    </span>
  );
}

function AlertCell({ report }: { report: AdminErrorReport }) {
  // `handoff` berarti tautan `wa.me` sudah disiapkan, BUKAN bahwa pesan
  // terkirim. `wa.me` tidak punya endpoint, tidak punya balasan, dan tidak
  // punya webhook, jadi tidak ada bukti apa pun yang bisa ditampilkan di sini.
  if (report.alertStatus === "handoff") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-black text-[#1E3A8A]">
        <ExternalLink className="size-3.5" aria-hidden="true" /> Siap dibuka
        {report.alertAt ? <TimeStampLabel timestamp={report.alertAt} withSeconds /> : null}
        <span className="block font-bold text-[#525252]">
          Tautan handoff disiapkan. Pesan belum dikirim dari server.
        </span>
      </span>
    );
  }
  if (report.alertStatus === "sent") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-black text-[#24533A]">
        <ShieldCheck className="size-3.5" aria-hidden="true" /> Terkirim
        {report.alertAt ? <TimeStampLabel timestamp={report.alertAt} withSeconds /> : null}
      </span>
    );
  }
  const label =
    report.alertStatus === "blocked"
      ? "Diblokir"
      : report.alertStatus === "failed"
        ? "Gagal"
        : report.alertStatus === "queued"
          ? "Dijadwalkan"
          : "Tidak dikirim";
  return (
    <span className="text-xs font-black text-[#7C2D12]">
      {label}
      {report.alertReason ? <span className="block font-bold text-[#525252]">{report.alertReason}</span> : null}
    </span>
  );
}

export function AdminErrorReports() {
  const reports = useErrorReports();
  const summary = useErrorReportSummary();
  const { setStatus } = useErrorReportActions();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const run = async (id: string, next: "acknowledged" | "resolved" | "ignored") => {
    setBusy(id);
    try {
      await setStatus(id, next);
    } finally {
      setBusy("");
    }
  };

  const rows = reports ?? [];

  return (
    <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
      <SectionHeading
        eyebrow="Sistem"
        title="Laporan error"
        description="Setiap kegagalan yang tercatat, dikelompokkan per bentuk masalah. Alert WhatsApp hanya terkirim saat policy mengizinkan, dan statusnya terlihat di sini walau provider memblokir."
        icon={Bug}
        action={
          <div className="flex flex-wrap gap-2 text-sm font-black">
            <span className="border-2 border-[#121212] bg-[#FFE662] px-2 py-1">
              Terbuka {summary?.open ?? 0}
            </span>
            <span className="border-2 border-[#121212] bg-[#E9B4A7] px-2 py-1">
              Critical {summary?.critical ?? 0}
            </span>
            <span className="border-2 border-[#121212] bg-[#F1EDE3] px-2 py-1">
              Alert bermasalah {summary?.blocked ?? 0}
            </span>
          </div>
        }
      />

      {reports === undefined ? (
        <p className="mt-4 text-sm text-[#525252]">Memuat laporan error...</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-[#525252]">
          Belum ada laporan error. Kalau ada kegagalan yang tercatat, grup dan
          waktunya akan muncul di sini.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((report) => {
            const expanded = openId === report._id;
            return (
              <div key={report._id} className="border-2 border-[#121212] bg-[#F5F0E5]">
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : report._id)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-start justify-between gap-3 p-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={report.severity} />
                      <span className="font-mono text-xs font-bold text-[#525252]">{report.reportId}</span>
                      <span
                        className={`px-1.5 py-0.5 text-xs font-black ${STATUS_STYLE[report.status] ?? STATUS_STYLE.open}`}
                      >
                        {report.status}
                      </span>
                    </span>
                    <span className="mt-1 block font-black text-[#1A1A1A]">{report.title}</span>
                    <span className="mt-0.5 block text-sm text-[#525252]">
                      {report.feature} · {report.operation}
                      {report.occurrences > 1 ? ` · ${report.occurrences}× terjadi` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <TimeStampLabel timestamp={report.lastSeenAt} withSeconds />
                    <AlertCell report={report} />
                  </span>
                </button>

                {expanded ? (
                  <div className="border-t-2 border-[#121212] bg-white p-3">
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      {(
                        [
                          ["Error code", report.errorCode],
                          ["Sumber", report.source],
                          ["Route", report.route],
                          ["Request ID", report.requestId],
                          ["Provider", report.provider],
                          ["Kode provider", report.providerCode],
                          ["Pesan provider", report.providerMessage],
                          ["Pengguna", report.userRef],
                          ["Perangkat", [report.browser, report.os].filter(Boolean).join(" / ")],
                          ["Lingkungan", report.environment],
                          ["Muncul pertama", formatFull(report.firstSeenAt)],
                          ["Muncul terakhir", formatFull(report.lastSeenAt)],
                        ] as const
                      )
                        .filter(([, value]) => Boolean(value))
                        .map(([label, value]) => (
                          <div key={label} className="border border-[#D6D3D1] bg-[#F5F0E5] p-2">
                            <dt className="text-xs font-bold uppercase tracking-[0.1em] text-[#525252]">
                              {label}
                            </dt>
                            <dd className="mt-0.5 break-words font-mono text-xs text-[#1A1A1A]">
                              {value}
                            </dd>
                          </div>
                        ))}
                    </dl>

                    <p className="mt-3 text-sm font-bold text-[#525252]">Pesan tercatat</p>
                    <p className="mt-1 break-words text-sm text-[#1A1A1A]">{report.message}</p>
                    {report.userMessage ? (
                      <>
                        <p className="mt-2 text-sm font-bold text-[#525252]">Pesan yang dilihat pengguna</p>
                        <p className="mt-1 break-words text-sm text-[#1A1A1A]">{report.userMessage}</p>
                      </>
                    ) : null}

                    <p className="mt-3 text-sm font-bold text-[#525252]">Tindakan yang disarankan</p>
                    <p className="mt-1 text-sm leading-6 text-[#1A1A1A]">{report.recommendedAction}</p>

                    {report.stack ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-black text-[#525252]">
                          Stack trace (terbatas untuk pengelola)
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words border-2 border-[#121212] bg-[#F5F0E5] p-2 font-mono text-xs">
                          {report.stack}
                        </pre>
                      </details>
                    ) : null}

                    {summary?.canModerate ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <ThemedSelect
                          variant="admin"
                          size="sm"
                          aria-label={`Ubah status ${report.reportId}`}
                          className="w-auto min-w-[11rem]"
                          value={report.status}
                          disabled={busy === report._id}
                          onValueChange={(value) =>
                            void run(report._id, value as "acknowledged" | "resolved" | "ignored")
                          }
                          options={errorReportStatusSelectOptions}
                        />
                        {report.status === "open" ? (
                          <button
                            type="button"
                            disabled={busy === report._id}
                            onClick={() => void run(report._id, "acknowledged")}
                            className="admin-btn admin-btn-secondary text-xs"
                          >
                            Tandai ditangani
                          </button>
                        ) : null}
                        {report.status !== "resolved" ? (
                          <button
                            type="button"
                            disabled={busy === report._id}
                            onClick={() => void run(report._id, "resolved")}
                            className="admin-btn admin-btn-primary text-xs"
                          >
                            Tandai selesai
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

const formatFull = (epochMs: number) => {
  const shifted = new Date(epochMs + 7 * 60 * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())} WIB`
  );
};
