import { Link, useNavigate } from "react-router";
import { Star } from "lucide-react";
import { useOwnerVendors, useVendor } from "@/lib/catalog-store";
import { EmptyStateCard } from "@/components/empty-state-card";
import { DashPanel, DashSection } from "@/components/dashboard-ui";
import { focusRing } from "@/lib/focus-ring";

/**
 * Satu baris ulasan per listing (bukan file baru — anak dalam berkas ini).
 *
 * Memegang `useVendor(slug)` sendiri sehingga induk tidak memanggil hook di
 * dalam loop. `undefined` = skeleton loading; `null` (slug tak dikenal atau
 * listing tidak tayang) = baris "tidak ditemukan", bukan crash.
 */
function MitraVendorReview({ slug, name }: { slug: string; name: string }) {
  const detail = useVendor(slug);

  if (detail === undefined) {
    return (
      <li role="status" className="dash-panel dash-panel--soft p-4 motion-safe:animate-pulse">
        <p className="dash-sub text-sm font-semibold">Memuat ulasan {name}...</p>
      </li>
    );
  }

  if (detail === null) {
    return (
      <li className="dash-panel dash-panel--soft p-4">
        <p className="font-extrabold tracking-[-0.01em] text-slate-950">{name}</p>
        <p className="dash-sub mt-1 text-sm">Listing tidak ditemukan di katalog.</p>
      </li>
    );
  }

  const items = (detail.reviewItems ?? []).slice(0, 3);

  return (
    <li className="dash-panel dash-panel--soft p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-extrabold tracking-[-0.01em] text-slate-950">{name}</p>
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600">
          <Star className="size-3.5 text-amber-500" aria-hidden="true" />
          {detail.reviews} ulasan
        </p>
      </div>
      {items.length === 0 ? (
        <p className="dash-sub mt-2 text-sm">Belum ada ulasan tertulis untuk listing ini.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item._id} className="rounded-xl border border-slate-200/80 bg-white p-3.5">
              <p className="text-sm font-extrabold text-slate-900">
                {item.authorName} <span className="font-bold tabular-nums text-amber-600">{item.rating} ★</span>
              </p>
              <p className="dash-sub mt-1 line-clamp-3 text-sm">{item.body}</p>
            </li>
          ))}
        </ul>
      )}
      <Link
        to={`/v/${slug}`}
        className={`mt-3 inline-flex min-h-11 items-center rounded-lg px-1 text-sm font-extrabold text-blue-700 hover:text-blue-900 ${focusRing}`}
      >
        Lihat halaman publik
      </Link>
    </li>
  );
}

function reviewCountOf(row: { reviews?: number; reviewsCount?: number }): number {
  return row.reviewsCount ?? row.reviews ?? 0;
}

/**
 * Ulasan pelanggan read-only untuk mitra: semua listing milik, ≤3 terbaru
 * per listing. Tanpa mutation; rating dirender sebagai angka + ★.
 */
export function MitraReviews() {
  const owned = useOwnerVendors();
  const navigate = useNavigate();

  if (owned === undefined) {
    return (
      <DashSection
        eyebrow="Umpan balik"
        title="Ulasan pelanggan"
        description="Apa kata warga tentang usaha Anda."
      >
        <DashPanel className="p-5 sm:p-6">
          <p role="status" className="dash-sub text-sm font-semibold motion-safe:animate-pulse">Memuat ulasan...</p>
        </DashPanel>
      </DashSection>
    );
  }

  const hasAnyReview = owned.some((row) => reviewCountOf(row) > 0);

  if (owned.length === 0 || !hasAnyReview) {
    return (
      <DashSection
        eyebrow="Umpan balik"
        title="Ulasan pelanggan"
        description="Apa kata warga tentang usaha Anda."
      >
        <EmptyStateCard
          title="Belum ada ulasan"
          body="Ulasan pelanggan akan tampil di sini setelah warga mengulas usaha Anda."
          actionLabel="Lihat katalog"
          onAction={() => navigate("/")}
        />
      </DashSection>
    );
  }

  return (
    <DashSection
      eyebrow="Umpan balik"
      title="Ulasan pelanggan"
      description="Apa kata warga tentang usaha Anda."
    >
      <ul className="space-y-3">
        {owned.map((row) =>
          reviewCountOf(row) === 0 ? (
            <li key={row._id} className="dash-panel dash-panel--soft p-4">
              <p className="font-extrabold tracking-[-0.01em] text-slate-950">{row.name}</p>
              <p className="dash-sub mt-1 text-sm">Belum ada ulasan untuk listing ini.</p>
            </li>
          ) : (
            <MitraVendorReview key={row._id} slug={row.slug} name={row.name} />
          ),
        )}
      </ul>
    </DashSection>
  );
}
