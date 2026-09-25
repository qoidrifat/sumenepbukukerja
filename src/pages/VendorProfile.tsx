import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  Star,
  Store,
} from "lucide-react";
import { categoryActionLabel } from "@/lib/catalog-data";
import { landmarkLabel } from "@/lib/catalog";
import {
  useCatalogActions,
  useFavorites,
  useVendor,
  useVendorPhoto,
} from "@/lib/catalog-store";
import { generateWhatsAppLink } from "@/lib/whatsapp";
import NotFound from "./NotFound";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

function ProfileLoading() {
  return (
    <main className="flex min-h-dvh min-h-[100svh] items-center justify-center bg-[#f7f8fc] px-4">
      <div className="text-center">
        <div className="mx-auto size-12 animate-pulse rounded-xl bg-blue-200" />
        <p className="mt-4 text-base font-bold text-slate-600">Membuka catatan usaha...</p>
      </div>
    </main>
  );
}

function VendorProfileContent() {
  const { slug } = useParams();
  const vendor = useVendor(slug);
  const photoUrl = useVendorPhoto(vendor?.photoId);
  const favorites = useFavorites();
  const { click, review } = useCatalogActions();
  const [reviewName, setReviewName] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (vendor === undefined) return <ProfileLoading />;
  if (vendor === null) return <NotFound />;

  const landmark = landmarkLabel(vendor.landmark);
  const waHref = generateWhatsAppLink({
    phone: vendor.phone,
    vendorName: vendor.name,
    category: vendor.category,
    landmark,
  });
  const saved = favorites.isSaved(vendor.slug);
  const reviewItems = vendor.reviewItems ?? [];

  const trackWhatsApp = () => {
    if (vendor._id) {
      void click({ id: vendor._id as never, kind: "whatsapp" });
    }
    try {
      const key = `sumenep-buku-kerja-clicks:${vendor.slug}`;
      localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? 0) + 1));
    } catch {
      // Analytics must never block WhatsApp.
    }
  };

  const share = async () => {
    const text = `${vendor.name} — ${vendor.description}`;
    if (vendor._id) void click({ id: vendor._id as never, kind: "share" });
    const url = `${window.location.origin}/v/${vendor.slug}`;
    if (navigator.share) {
      await navigator.share({ title: vendor.name, text, url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(`${text} ${url}`);
    }
  };

  const submitReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vendor._id) return;
    if (!reviewName.trim() || !reviewBody.trim()) {
      setReviewError("Nama dan pengalaman perlu diisi.");
      return;
    }

    setSubmitting(true);
    setReviewError("");
    setReviewNotice("");
    try {
      await review({
        vendorId: vendor._id as never,
        authorName: reviewName.trim(),
        rating: reviewRating,
        body: reviewBody.trim(),
      });
      setReviewBody("");
      setReviewNotice("Terima kasih. Ulasan Anda sudah masuk.");
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "Ulasan gagal dikirim.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh min-h-[100svh] bg-[#f7f8fc] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-12">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link
            to="/#katalog"
            className={`flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-blue-50 hover:text-blue-700 ${focusRing}`}
          >
            <ArrowLeft className="size-5" />Kembali ke katalog
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={share}
              className={`flex size-12 items-center justify-center rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 ${focusRing}`}
              aria-label="Bagikan listing"
            >
              <Share2 className="size-5" />
            </button>
            <Link
              to="/"
              className={`hidden min-h-12 items-center rounded-lg px-2 text-lg font-black tracking-[-0.04em] text-slate-950 hover:bg-blue-50 sm:flex ${focusRing}`}
            >
              Sumenep <span className="text-blue-600">Buku</span> Kerja
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,.7fr)] lg:items-start lg:gap-10">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={`Foto ${vendor.name}`}
                  className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]"
                />
              ) : (
                <div
                  className={`relative aspect-[16/9] overflow-hidden bg-gradient-to-br ${vendor.accent} sm:aspect-[21/9]`}
                  role="img"
                  aria-label={`Ilustrasi ${vendor.name}`}
                >
                  <div className="absolute -right-12 -top-20 size-72 rounded-full border border-white/25" />
                  <div className="absolute -bottom-24 left-10 size-64 rounded-full border border-white/20" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-24 items-center justify-center rounded-2xl border border-white/40 bg-white/20 text-3xl font-black text-white backdrop-blur-sm sm:size-32">
                      {vendor.mark}
                    </span>
                  </div>
                </div>
              )}
              <div className="p-5 sm:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-sm font-extrabold text-blue-700">
                    {vendor.category}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-extrabold text-amber-800">
                    <Star className="size-4 fill-current" />{vendor.rating} ({vendor.reviews})
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-800">
                    {vendor.verified ? <ShieldCheck className="size-4" /> : <CheckCircle2 className="size-4" />}
                    {vendor.verified ? "Mitra terverifikasi" : "Tercatat di katalog"}
                  </span>
                </div>
                <h1 className="mt-4 text-[clamp(1.8rem,5vw,3.2rem)] font-black leading-tight tracking-[-0.05em] text-slate-950">
                  {vendor.name}
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">{vendor.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {vendor.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-8 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
                  <Info icon={MapPin} label="Alamat" value={`${vendor.address} · dekat ${landmark}`} />
                  <Info icon={Clock3} label="Jam kerja" value={vendor.hours} />
                  <Info icon={Store} label="Mulai dari" value={vendor.price} />
                  <Info icon={Phone} label="Kontak" value={vendor.phone.replace(/^62/, "0")} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Catatan warga</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">
                Pengalaman bersama {vendor.name}
              </h2>
              {reviewItems.length > 0 ? (
                <div className="mt-5 space-y-4">
                  {reviewItems.map((item) => (
                    <article key={item._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-extrabold text-slate-900">{item.authorName}</p>
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-700">
                          <Star className="size-4 fill-current" />{item.rating}/5
                        </span>
                      </div>
                      <p className="mt-2 text-base leading-7 text-slate-700">{item.body}</p>
                      <time className="mt-3 block text-xs font-semibold text-slate-500">
                        {new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(item.createdAt))}
                      </time>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-base leading-7 text-slate-600">
                  Belum ada ulasan. Jika Anda pernah memakai layanan ini, pengalaman Anda dapat membantu warga lain.
                </p>
              )}

              <form onSubmit={submitReview} className="mt-6 border-t border-slate-200 pt-6">
                <h3 className="text-lg font-black text-slate-950">Tulis ulasan</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-extrabold text-slate-800">Nama Anda</span>
                    <input
                      value={reviewName}
                      onChange={(event) => setReviewName(event.target.value)}
                      placeholder="Nama tampilan"
                      className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-extrabold text-slate-800">Rating</span>
                    <select
                      value={reviewRating}
                      onChange={(event) => setReviewRating(Number(event.target.value))}
                      className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      {[5, 4, 3, 2, 1].map((rating) => (
                        <option key={rating} value={rating}>{rating} bintang</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 sm:col-span-2">
                    <span className="text-sm font-extrabold text-slate-800">Pengalaman</span>
                    <textarea
                      value={reviewBody}
                      onChange={(event) => setReviewBody(event.target.value)}
                      placeholder="Ceritakan responsiveness, harga, dan hasil pekerjaan."
                      rows={3}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-base leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
                {reviewError ? <p className="mt-3 text-sm font-bold text-red-700">{reviewError}</p> : null}
                {reviewNotice ? <p className="mt-3 text-sm font-bold text-emerald-700">{reviewNotice}</p> : null}
                <button
                  type="submit"
                  disabled={!vendor._id || submitting}
                  className={`mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-base font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  <Send className="size-4" />
                  {submitting ? "Mengirim..." : "Kirim ulasan"}
                </button>
              </form>
            </section>
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Mulai dari sini</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Tanya langsung ke usaha ini.</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Pesan sudah disiapkan otomatis supaya Anda tidak perlu mengetik dari awal.
              </p>
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                onClick={trackWhatsApp}
                className={`mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-base font-extrabold text-[#082f1e] shadow-sm hover:shadow-md ${focusRing}`}
              >
                <MessageCircle className="size-5" />{categoryActionLabel[vendor.category]}
              </a>
              <div className="mt-3 grid grid-cols-[1fr_3rem] gap-2">
                <a
                  href={`tel:${vendor.phone}`}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-base font-extrabold text-slate-800 hover:border-blue-300 hover:bg-blue-50 ${focusRing}`}
                >
                  <Phone className="size-5 text-blue-600" />Simpan nomor
                </a>
                <button
                  type="button"
                  onClick={() => favorites.save(vendor.slug, vendor._id)}
                  className={`flex min-h-12 items-center justify-center rounded-lg border border-slate-300 hover:bg-blue-50 ${focusRing}`}
                  aria-label={saved ? "Hapus dari tersimpan" : "Simpan listing"}
                >
                  <Bookmark className={`size-5 ${saved ? "fill-blue-600 text-blue-600" : "text-slate-600"}`} />
                </button>
              </div>
              <div className="mt-5 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold leading-6 text-slate-700">
                <span className="text-lg" aria-hidden="true">✎</span>
                <span>Transaksi dan kesepakatan tetap dilakukan langsung bersama mitra.</span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-[3rem_1fr] gap-2">
          <button
            type="button"
            onClick={() => favorites.save(vendor.slug, vendor._id)}
            className={`flex min-h-12 items-center justify-center rounded-lg border border-slate-300 ${focusRing}`}
            aria-label={saved ? "Hapus dari tersimpan" : "Simpan listing"}
          >
            <Bookmark className={`size-5 ${saved ? "fill-blue-600 text-blue-600" : "text-slate-600"}`} />
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            onClick={trackWhatsApp}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-base font-extrabold text-[#082f1e] ${focusRing}`}
          >
            <MessageCircle className="size-5" />{categoryActionLabel[vendor.category]}
          </a>
        </div>
      </div>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg bg-slate-50 p-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-blue-600" />
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-slate-900">{label}</p>
        <p className="mt-1 text-base leading-6 text-slate-600">{value}</p>
      </div>
    </div>
  );
}

export default function VendorProfile() {
  return <VendorProfileContent />;
}
