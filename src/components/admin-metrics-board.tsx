/**
 * Papan metrik operasional + dampak komunitas di Ruang pengelola.
 *
 * Dipisah pada Fase 9.1 Pekerjaan 6. Semua yang dipakai di sini adalah
 * presentasi: angka dan ikon disusun di halaman, komponen ini hanya
 * menampilkannya. Keeping it here means the moderation queue never has to be
 * read to understand what a metric card looks like.
 */
import { BarChart3, type LucideIcon } from "lucide-react";
import { CategoryMascot } from "@/components/category-mascot";
import { AdminLoadingSkeleton } from "@/components/admin-loading-skeleton";
import { landmarkLabel } from "@/lib/catalog";

import { SectionHeading } from "./admin-workspace";

export type AdminMetric = {
  label: string;
  value: number;
  note: string;
  icon: LucideIcon;
  tone: "orange" | "yellow" | "white" | "mint" | "stone" | "terracotta";
};

export type AdminImpactMetric = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
};

const adminMetricTone: Record<AdminMetric["tone"], string> = {
  orange: "bg-[#FF5A26] text-white",
  yellow: "bg-[#FFE662] text-[#1A1A1A]",
  white: "bg-white text-[#1A1A1A]",
  mint: "bg-[#DCEBD7] text-[#24533A]",
  stone: "bg-[#E7E5E4] text-[#44403C]",
  terracotta: "bg-[#E9B4A7] text-[#7C2D12]",
};

/**
 * Papan metrik operasional + dampak komunitas di Ruang pengelola. Presentasi
 * murni, jadi angka dan ikon tetap disusun di halaman agar sumbernya jelas.
 */
export function AdminMetricsBoard({
  metrics,
  impactMetrics,
  categoryCounts,
  areaCounts,
  loadingBreakdown,
}: {
  metrics: AdminMetric[];
  impactMetrics: AdminImpactMetric[];
  categoryCounts: Record<string, number>;
  areaCounts: Record<string, number>;
  loadingBreakdown: boolean;
}) {
  return (
    <>
      <section className="mt-8" aria-labelledby="operational-metrics-title">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">
              Papan numerator
            </p>
            <h2
              id="operational-metrics-title"
              className="mt-1 text-[clamp(1.5rem,3vw,2.25rem)] font-black tracking-[-0.04em]"
            >
              7 metrik operasional
            </h2>
          </div>
          <p className="inline-flex items-center gap-2 text-sm font-bold text-[#525252]">
            <span className="admin-sync-dot" aria-hidden="true" />
            Reaktif terhadap query Convex
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <article
                key={metric.label}
                className={`admin-metric admin-metric-lg flex min-h-40 flex-col justify-between p-4 ${
                  index === 0
                    ? "bg-[#FF5A26] text-white"
                    : index === 1
                      ? "bg-[#FFE662] text-[#1A1A1A]"
                      : "bg-[#FDFBF7] text-[#1A1A1A]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-black leading-5">{metric.label}</p>
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center border-2 border-[#121212] ${
                      index === 0
                        ? "bg-[#FFE662] text-[#1A1A1A]"
                        : index === 1
                          ? "bg-[#FF5A26] text-white"
                          : adminMetricTone[metric.tone]
                    }`}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                </div>
                <div>
                  <p className="text-[clamp(2rem,4vw,3rem)] font-black leading-none tracking-[-0.06em]">
                    {metric.value.toLocaleString("id-ID")}
                  </p>
                  <p
                    className={`mt-2 text-sm font-bold ${
                      index === 0 ? "text-white" : "text-[#525252]"
                    }`}
                  >
                    {metric.note}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="community-impact-title">
        <SectionHeading
          eyebrow="Dampak komunitas"
          title="Metrik warga"
          description="Angka dihitung reaktif dari pencarian, klik WhatsApp, permintaan, favorit, dan kelengkapan listing."
          icon={BarChart3}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          {impactMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.label} className="admin-metric min-h-36 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base font-black leading-5">{metric.label}</p>
                  <span className="flex size-10 shrink-0 items-center justify-center border-2 border-[#121212] bg-[#FFE662]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-5 text-3xl font-black tracking-[-0.06em]">{metric.value}</p>
                <p className="mt-1 text-sm font-bold text-[#525252]">{metric.note}</p>
              </article>
            );
          })}
        </div>
        <div className="grid gap-4 border-t-2 border-[#121212] p-4 sm:p-6 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-black">Listing aktif per kategori</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(categoryCounts).map(([category, count]) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-1.5 border-2 border-[#121212] bg-white px-3 py-2 text-sm font-black"
                >
                  {/* Statis supaya papan metrik admin tetap padat dan ringan. */}
                  <CategoryMascot category={category} size="xs" context="admin" animated={false} />
                  {category}: {count}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-black">Listing aktif per area</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(areaCounts).map(([area, count]) => (
                <span
                  key={area}
                  className="border-2 border-[#121212] bg-white px-3 py-2 text-sm font-black"
                >
                  {landmarkLabel(area)}: {count}
                </span>
              ))}
              {loadingBreakdown ? (
                <AdminLoadingSkeleton label="Memuat data area..." rows={2} className="w-full" />
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
