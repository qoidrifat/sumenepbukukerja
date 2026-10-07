import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Star } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOwnerVendors, useVendor, type VendorReview } from "@/lib/catalog-store";
import { EmptyStateCard } from "@/components/empty-state-card";
import { DashPanel, DashSection } from "@/components/dashboard-ui";
import { focusRing } from "@/lib/focus-ring";

/**
 * Balasan pemilik atas satu ulasan (bukan file baru — anak dalam berkas ini).
 *
 * Tanpa reply: textarea + tombol "Balas". Sudah ada reply: tampilkan +
 * tombol "Ubah" yang mengisi textarea untuk edit. Sukses tidak memakai
 * refetch manual — `useVendor(slug)` di induk bersifat reaktif, jadi balasan
 * yang tersimpan langsung tampil lewat query yang sama.
 */
function MitraReviewReplyForm({ item }: { item: VendorReview }) {
  const replyReview = useMutation(api.vendors.replyReview);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await replyReview({ reviewId: item._id as never, body });
      setDraft("");
      setEditing(false);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Balasan gagal dikirim.");
    } finally {
      setBusy(false);
    }
  };

  if (item.reply && !editing) {
    return (
      <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700">
          Tanggapan Anda
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-700">{item.reply.body}</p>
        <button
          type="button"
          onClick={() => {
            setDraft(item.reply?.body ?? "");
            setEditing(true);
            setSaved(false);
            setError("");
          }}
          className={`mt-2 inline-flex min-h-12 items-center rounded-lg px-3 text-sm font-extrabold text-blue-700 hover:text-blue-900 ${focusRing}`}
        >
          Ubah
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2">
      <label className="flex flex-col gap-2">
        <span className="text-xs font-extrabold text-slate-700">
          {item.reply ? "Ubah tanggapan" : "Tanggapi ulasan ini"}
        </span>
        <textarea
          aria-label={`Balas ulasan dari ${item.authorName}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tulis tanggapan singkat (maksimal 500 karakter)."
          rows={3}
          maxLength={500}
          className={`min-h-12 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${focusRing}`}
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          Balasan tersimpan.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className={`inline-flex min-h-12 items-center rounded-lg bg-blue-700 px-4 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
        >
          Balas
        </button>
        {item.reply && editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft("");
              setError("");
            }}
            className={`inline-flex min-h-12 items-center rounded-lg px-3 text-sm font-extrabold text-slate-600 hover:text-slate-900 ${focusRing}`}
          >
            Batal
          </button>
        ) : null}
      </div>
    </form>
  );
}

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
              <MitraReviewReplyForm item={item} />
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
 * Ulasan pelanggan untuk mitra: semua listing milik, ≤3 terbaru per listing,
 * plus hak jawab pemilik per ulasan. Rating dirender sebagai angka + ★.
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
