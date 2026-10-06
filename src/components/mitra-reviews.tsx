import { Link, useNavigate } from "react-router";
import { useOwnerVendors, useVendor } from "@/lib/catalog-store";
import { EmptyStateCard } from "@/components/empty-state-card";
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
      <li role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 motion-safe:animate-pulse">
        <p className="text-sm font-semibold text-slate-600">Memuat ulasan {name}...</p>
      </li>
    );
  }

  if (detail === null) {
    return (
      <li className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="font-extrabold text-slate-950">{name}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">Listing tidak ditemukan di katalog.</p>
      </li>
    );
  }

  const items = (detail.reviewItems ?? []).slice(0, 3);

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-extrabold text-slate-950">{name}</p>
        <p className="text-sm font-bold text-slate-600">{detail.reviews} ulasan</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">Belum ada ulasan tertulis untuk listing ini.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item._id} className="rounded-lg bg-white p-3 ring-1 ring-inset ring-slate-200">
              <p className="text-sm font-extrabold text-slate-900">
                {item.authorName} <span className="font-bold text-slate-500">{item.rating} ★</span>
              </p>
              <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-600">{item.body}</p>
            </li>
          ))}
        </ul>
      )}
      <Link
        to={`/v/${slug}`}
        className={`mt-3 inline-flex min-h-12 items-center rounded-lg px-1 text-sm font-extrabold text-blue-700 hover:bg-blue-50 ${focusRing}`}
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
      <section aria-label="Ulasan pelanggan" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-black text-slate-950">Ulasan pelanggan</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Apa kata warga tentang usaha Anda.</p>
        <p role="status" className="mt-4 text-sm font-semibold text-slate-600 motion-safe:animate-pulse">Memuat ulasan...</p>
      </section>
    );
  }

  const hasAnyReview = owned.some((row) => reviewCountOf(row) > 0);

  if (owned.length === 0 || !hasAnyReview) {
    return (
      <section aria-label="Ulasan pelanggan" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-black text-slate-950">Ulasan pelanggan</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">Apa kata warga tentang usaha Anda.</p>
        <div className="mt-4">
          <EmptyStateCard
            title="Belum ada ulasan"
            body="Ulasan pelanggan akan tampil di sini setelah warga mengulas usaha Anda."
            actionLabel="Lihat katalog"
            onAction={() => navigate("/")}
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Ulasan pelanggan" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-black text-slate-950">Ulasan pelanggan</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Apa kata warga tentang usaha Anda.</p>
      <ul className="mt-4 space-y-3">
        {owned.map((row) =>
          reviewCountOf(row) === 0 ? (
            <li key={row._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-extrabold text-slate-950">{row.name}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">Belum ada ulasan untuk listing ini.</p>
            </li>
          ) : (
            <MitraVendorReview key={row._id} slug={row.slug} name={row.name} />
          ),
        )}
      </ul>
    </section>
  );
}
