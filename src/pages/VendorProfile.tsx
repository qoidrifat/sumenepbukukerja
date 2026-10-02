import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useParams } from "react-router";
import {
  AlertTriangle,
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
  useVendorPhotos,
} from "@/lib/catalog-store";
import { useContactHandoff } from "@/lib/contact-handoff";
import type { WhatsAppIntent } from "@/lib/whatsapp";
import { useListingMetadata } from "@/lib/use-listing-metadata";
import { BlurText, GlassSurface, ScrollReveal } from "@/components/react-bits";
import { AvailabilityBadge, ClaimListingPanel, PackageList, ReportListingButton } from "@/components/community-widgets";
import { AccessibilityControls } from "@/components/display-controls";
import { enqueueOfflineMutation, flushOfflineQueue, registerOfflineHandlers, useOfflineQueue } from "@/lib/offline-queue";
import NotFound from "./NotFound";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

type CtaNotice = {
  tone: "success" | "error";
  text: string;
};

function formatNextAvailable(timestamp: number) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function CtaFeedback({
  notice,
  reduceMotion,
  className = "",
}: {
  notice: CtaNotice | null;
  reduceMotion: boolean;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {notice ? (
        <motion.div
          key={`${notice.tone}-${notice.text}`}
          role={notice.tone === "error" ? "alert" : "status"}
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-bold leading-5 ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"} ${className}`}
        >
          {notice.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span>{notice.text}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

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
  // Metadata publik per listing: judul, deskripsi, Open Graph, kanonik, dan
  // JSON-LD LocalBusiness. Ditulis saat data sudah ada, bukan saat render —
  // sehingga yang tampil di head adalah data listing yang sedang dibuka.
  useListingMetadata(
    vendor
      ? {
          slug: vendor.slug,
          name: vendor.name,
          category: vendor.category,
          description: vendor.description,
          hours: vendor.hours,
          address: vendor.address,
          landmark: vendor.landmark,
          phone: vendor.phone,
          rating: vendor.rating,
          reviewsCount: vendor.reviewsCount,
        }
      : null,
    photoUrl,
  );
  const photos = useVendorPhotos(vendor?._id);
  const favorites = useFavorites();
  const { click, review, interaction, track } = useCatalogActions();
  const analyticsId = (() => {
    if (typeof window === "undefined") return undefined;
    const key = "sumenep-buku-kerja-anonymous-id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  })();
  const [reviewName, setReviewName] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ctaNotice, setCtaNotice] = useState<CtaNotice | null>(null);
  const viewedVendorId = useRef<string | undefined>(undefined);
  const reduceMotion = useReducedMotion() ?? false;
  const { online } = useOfflineQueue();

  useEffect(() => {
    if (!online) return;
    const handlers = {
      interaction: async (payload: Record<string, unknown>) => {
        if (typeof payload.vendorId !== "string" || typeof payload.kind !== "string") return;
        await interaction({
          vendorId: payload.vendorId as never,
          kind: payload.kind as "view" | "whatsapp" | "share" | "call" | "request",
          status: typeof payload.status === "string" ? payload.status as "opened" | "waiting" | "completed" | "dismissed" : undefined,
          requestId: typeof payload.requestId === "string" ? payload.requestId as never : undefined,
        });
      },
    };
    registerOfflineHandlers(handlers);
    void flushOfflineQueue(handlers);
  }, [interaction, online]);

  useEffect(() => {
    const vendorId = vendor?._id;
    // React StrictMode intentionally runs effects twice in development. Do not
    // turn that into duplicate "view" rows in the resident interaction history.
    if (!vendorId || viewedVendorId.current === vendorId) return;
    viewedVendorId.current = vendorId;
    void interaction({ vendorId: vendorId as never, kind: "view" }).catch(() => {
      enqueueOfflineMutation("interaction", { vendorId, kind: "view", status: "opened" });
    });
    void track({ event: "listing_opened", vendorId: vendorId as never, anonymousId: analyticsId }).catch(() => undefined);
  }, [analyticsId, interaction, track, vendor?._id]);

  useEffect(() => {
    if (!ctaNotice) return;
    const timeout = window.setTimeout(() => setCtaNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [ctaNotice]);

  // FASE 10: profil publik tidak pernah menerima nomor mentah. Tiga tombol
  // WhatsApp di bawah semuanya memakai `contactRef` yang sama; server menyusun
  // URL-nya sendiri setelah memeriksa listing, kuota, dan mencatat jejak.
  //
  // Hook ini HARUS di sini, di atas `return` loading/404. Meletakkannya di
  // bawah early return membuat jumlah hook berbeda antar render - render
  // pertama memuat data, render berikutnya tidak - dan React melempar
  // "Rendered fewer hooks than expected". Aturan react-hooks menangkap ini.
  const { openContactWithFeedback, callContact } = useContactHandoff();

  if (vendor === undefined) return <ProfileLoading />;
  if (vendor === null) return <NotFound />;

  const landmark = landmarkLabel(vendor.landmark);
  const saved = favorites.isSaved(vendor.slug);
  const reviewItems = vendor.reviewItems ?? [];

  const trackWhatsApp = () => {
    if (vendor._id) {
      void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined);
      void track({ event: "whatsapp_clicked", vendorId: vendor._id as never, anonymousId: analyticsId }).catch(() => undefined);
      void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => {
        enqueueOfflineMutation("interaction", { vendorId: vendor._id, kind: "whatsapp", status: "opened" });
      });
    }
    try {
      const key = `sumenep-buku-kerja-clicks:${vendor.slug}`;
      localStorage.setItem(key, String(Number(localStorage.getItem(key) ?? 0) + 1));
    } catch {
      // Analytics must never block WhatsApp.
    }
    setCtaNotice({ tone: "success", text: "WhatsApp siap dibuka. Lihat tab atau aplikasi WhatsApp Anda." });
  };

  // FASE 10: satu pintasan untuk ketiga tombol WhatsApp di halaman ini.
  // Analytics tetap jalan seperti sebelumnya; yang berubah hanya dari mana
  // URL-nya datang - sekarang dari server lewat handoff yang dibatasi kuota.
  const openWhatsApp = (intent: WhatsAppIntent) => {
    trackWhatsApp();
    openContactWithFeedback({ contactRef: vendor.contactRef, intent });
  };

  const trackCall = () => {
    if (vendor._id) {
      void track({ event: "call_clicked", vendorId: vendor._id as never, anonymousId: analyticsId }).catch(() => undefined);
      void interaction({ vendorId: vendor._id as never, kind: "call" }).catch(() => {
        enqueueOfflineMutation("interaction", { vendorId: vendor._id, kind: "call", status: "opened" });
      });
    }
  };

  const share = async () => {
    const text = `${vendor.name} — ${vendor.description}`;
    if (vendor._id) {
      void click({ id: vendor._id as never, kind: "share" }).catch(() => undefined);
      void track({ event: "share_clicked", vendorId: vendor._id as never, anonymousId: analyticsId }).catch(() => undefined);
      void interaction({ vendorId: vendor._id as never, kind: "share" }).catch(() => {
        enqueueOfflineMutation("interaction", { vendorId: vendor._id, kind: "share", status: "opened" });
      });
    }
    const url = `${window.location.origin}/v/${vendor.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: vendor.name, text, url });
        setCtaNotice({ tone: "success", text: "Tautan siap dibagikan." });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCtaNotice({ tone: "success", text: "Tautan listing disalin ke clipboard." });
      } else {
        setCtaNotice({ tone: "error", text: "Browser belum mendukung menyalin tautan." });
      }
    } catch {
      setCtaNotice({ tone: "error", text: "Tautan belum dibagikan. Coba lagi sebentar lagi." });
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
    <div className="min-h-dvh min-h-[100svh] overflow-x-hidden bg-[#f7f8fc] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-12">
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm"
      >
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link
            to="/#katalog"
            className={`flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-blue-50 hover:text-blue-700 ${focusRing}`}
          >
            <ArrowLeft className="size-5" />Kembali ke katalog
          </Link>
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={share}
              whileHover={reduceMotion ? undefined : { y: -2, scale: 1.04 }}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              className={`flex size-12 items-center justify-center rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-700 ${focusRing}`}
              aria-label="Bagikan listing"
              title="Bagikan listing"
            >
              <motion.span
                whileHover={reduceMotion ? undefined : { rotate: 14 }}
                className="inline-flex"
              >
                <Share2 className="size-5" />
              </motion.span>
            </motion.button>
            <Link
              to="/"
              className={`hidden min-h-12 items-center rounded-lg px-2 text-lg font-black tracking-[-0.04em] text-slate-950 hover:bg-blue-50 sm:flex ${focusRing}`}
            >
              Sumenep <span className="text-blue-600">Buku</span> Kerja
            </Link>
          </div>
        </div>
      </motion.header>

      <main className="relative z-10 mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,.7fr)] lg:items-start lg:gap-10">
          <div className="space-y-6">
            <ScrollReveal>
            <motion.section
              whileHover={reduceMotion ? undefined : { y: -2 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              {photoUrl ? (
                <motion.img
                  src={photoUrl}
                  alt={`Foto ${vendor.name}`}
                  initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={reduceMotion ? undefined : { scale: 1.025 }}
                  transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                  className="aspect-[16/9] w-full object-cover sm:aspect-[21/9]"
                />
              ) : (
                <motion.div
                  className={`relative aspect-[16/9] overflow-hidden bg-gradient-to-br ${vendor.accent} sm:aspect-[21/9]`}
                  role="img"
                  aria-label={`Ilustrasi ${vendor.name}`}
                  whileHover={reduceMotion ? undefined : { scale: 1.01 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="absolute -right-12 -top-20 size-72 rounded-full border border-white/25" />
                  <div className="absolute -bottom-24 left-10 size-64 rounded-full border border-white/20" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.span
                      whileHover={reduceMotion ? undefined : { scale: 1.04, y: -3 }}
                      transition={{ duration: 0.2 }}
                      className="flex size-24 items-center justify-center rounded-2xl border border-white/40 bg-white/20 text-3xl font-black text-white backdrop-blur-sm sm:size-32"
                    >
                      {vendor.mark}
                    </motion.span>
                  </div>
                </motion.div>
              )}
              <div className="p-5 sm:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-sm font-extrabold text-blue-700">
                    {vendor.category}
                  </span>
                  <AvailabilityBadge vendor={vendor} />
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-extrabold text-amber-800">
                    <Star className="size-4 fill-current" />{vendor.rating} ({vendor.reviews})
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-800">
                    {vendor.verified ? <ShieldCheck className="size-4" /> : <CheckCircle2 className="size-4" />}
                    {vendor.verified ? "Mitra terverifikasi" : "Tercatat di katalog"}
                  </span>
                </div>
                <BlurText
                  as="h1"
                  text={vendor.name}
                  className="mt-4 text-[clamp(1.8rem,5vw,3.2rem)] font-black leading-tight tracking-[-0.05em] text-slate-950"
                />
                <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">{vendor.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {vendor.tags.map((tag) => (
                    <motion.span
                      key={tag}
                      whileHover={reduceMotion ? undefined : { y: -2, scale: 1.02 }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700"
                    >
                      {tag}
                    </motion.span>
                  ))}
                </div>
                <div className="mt-8 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
                  <Info reduceMotion={reduceMotion} icon={MapPin} label="Alamat" value={`${vendor.address} · dekat ${landmark}`} />
                  <Info reduceMotion={reduceMotion} icon={Clock3} label="Jam kerja" value={vendor.hours} />
                  <Info reduceMotion={reduceMotion} icon={Store} label="Mulai dari" value={vendor.price} />
                  {/* FASE 10: yang ditampilkan hanya bentuk tersamar. Angka penuhnya hanya
                    lahir di server saat pengguna menekan tombol di atas. */}
                  <Info reduceMotion={reduceMotion} icon={Phone} label="Kontak" value={vendor.phoneMasked ?? "Belum diisi"} />
                </div>
                {vendor.availabilityNote ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-900">{vendor.availabilityNote}</p> : null}
                {vendor.nextAvailableAt ? <p className="mt-3 text-sm font-bold text-slate-700">Perkiraan tersedia lagi: {formatNextAvailable(vendor.nextAvailableAt)}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-slate-600">
                  {vendor.responseMinutes ? <span className="rounded-full bg-slate-50 px-3 py-1.5">Rata-rata membalas {vendor.responseMinutes} menit</span> : null}
                  {vendor.serviceRadiusKm ? <span className="rounded-full bg-slate-50 px-3 py-1.5">Area layanan {vendor.serviceRadiusKm} km</span> : null}
                </div>
                {photos && photos.length > 0 ? (
                  <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="vendor-gallery-title">
                    <h2 id="vendor-gallery-title" className="text-lg font-black text-slate-950">Galeri hasil pekerjaan</h2>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {photos.map((photo) => (
                        <figure key={photo._id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          <img src={photo.url ?? ""} alt={photo.caption ?? `Foto hasil pekerjaan ${vendor.name}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                          {photo.caption ? <figcaption className="px-3 py-2 text-xs font-semibold text-slate-600">{photo.caption}</figcaption> : null}
                        </figure>
                      ))}
                    </div>
                  </section>
                ) : null}
                <PackageList vendorId={vendor._id} />
                {/* Formulir klaim diisi KOSONG dengan sengaja. Claimant harus mengetik
                    nomornya sendiri: itulah bukti bahwa dia menguasai nomor itu.
                    Mengisi otomatis dari listing justru membatalkan bukti itu -
                    dan juga berarti server harus mengirim nomor ke anonim. */}
                {vendor._id && !vendor.ownerId ? <ClaimListingPanel vendorId={vendor._id} vendorName={vendor.name} phone="" address={vendor.address} /> : null}
                <div className="mt-5"><ReportListingButton vendorId={vendor._id} /></div>
              </div>
            </motion.section>
            </ScrollReveal>

            <ScrollReveal>
            <motion.section
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.12 }}
              transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
            >
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Catatan warga</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">
                Pengalaman bersama {vendor.name}
              </h2>
              {reviewItems.length > 0 ? (
                <div className="mt-5 space-y-4">
                  {reviewItems.map((item) => (
                    <motion.article
                      key={item._id}
                      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
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
                    </motion.article>
                  ))}
                </div>
              ) : (
                <motion.p
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: reduceMotion ? 0 : 0.4 }}
                  className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-base leading-7 text-slate-600"
                >
                  Belum ada ulasan. Jika Anda pernah memakai layanan ini, pengalaman Anda dapat membantu warga lain.
                </motion.p>
              )}

              <motion.form
                onSubmit={submitReview}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : 0.08 }}
                className="mt-6 border-t border-slate-200 pt-6"
              >
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
                  <div className="flex flex-col gap-2">
                    <span id="rating-label" className="text-sm font-extrabold text-slate-800">Rating</span>
                    <RatingPicker
                      value={reviewRating}
                      onChange={setReviewRating}
                      reduceMotion={reduceMotion}
                    />
                    <span className="text-xs font-semibold text-slate-500">{reviewRating} dari 5 bintang</span>
                  </div>
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
                <AnimatePresence initial={false} mode="wait">
                  {reviewError ? (
                    <motion.p
                      key="review-error"
                      role="alert"
                      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                      className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
                    >
                      {reviewError}
                    </motion.p>
                  ) : null}
                  {reviewNotice ? (
                    <motion.p
                      key="review-notice"
                      role="status"
                      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                      className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"
                    >
                      {reviewNotice}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
                <motion.button
                  type="submit"
                  disabled={!vendor._id || submitting}
                  whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  className={`mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-base font-extrabold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  <motion.span
                    animate={submitting && !reduceMotion ? { rotate: 360 } : { rotate: 0 }}
                    transition={submitting && !reduceMotion ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
                    className="inline-flex"
                  >
                    <Send className="size-4" />
                  </motion.span>
                  {submitting ? "Mengirim..." : "Kirim ulasan"}
                </motion.button>
              </motion.form>
            </motion.section>
            </ScrollReveal>
          </div>

          <motion.aside
            initial={reduceMotion ? false : { opacity: 0, x: 18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="lg:sticky lg:top-24"
          >
            <GlassSurface tint="blue" className="rounded-xl p-5 shadow-sm sm:p-6">
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Mulai dari sini</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Tanya langsung ke usaha ini.</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Pesan sudah disiapkan otomatis supaya Anda tidak perlu mengetik dari awal.
              </p>
              <motion.button
                type="button"
                disabled={!vendor.contactRef}
                onClick={() => openWhatsApp("availability")}
                whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                className={`mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-base font-extrabold text-[#082f1e] shadow-sm hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${focusRing}`}
              >
                <motion.span
                  whileHover={reduceMotion ? undefined : { scale: 1.12, rotate: -6 }}
                  className="inline-flex"
                >
                  <MessageCircle className="size-5" />
                </motion.span>
                {categoryActionLabel[vendor.category]}
              </motion.button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <motion.button type="button" disabled={!vendor.contactRef} onClick={() => openWhatsApp("price")} whileHover={reduceMotion ? undefined : { y: -2 }} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}><span>💰</span>Tanya harga</motion.button>
                <motion.button type="button" disabled={!vendor.contactRef} onClick={() => openWhatsApp("estimate")} whileHover={reduceMotion ? undefined : { y: -2 }} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}><Clock3 className="size-4" />Tanya estimasi</motion.button>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_3rem] gap-2">
                <motion.button
                  type="button"
                  disabled={!vendor.contactRef}
                  onClick={() => {
                    trackCall();
                    callContact({ contactRef: vendor.contactRef });
                  }}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-base font-extrabold text-slate-800 hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
                >
                  <Phone className="size-5 text-blue-600" />Telepon mitra
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => favorites.save(vendor.slug, vendor._id)}
                  whileHover={reduceMotion ? undefined : { y: -2, scale: 1.04 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                  animate={reduceMotion ? undefined : { scale: saved ? [1, 1.14, 1] : 1 }}
                  transition={{ duration: 0.28 }}
                  className={`flex min-h-12 items-center justify-center rounded-lg border border-slate-300 hover:bg-blue-50 ${focusRing}`}
                  aria-label={saved ? "Hapus dari tersimpan" : "Simpan listing"}
                  aria-pressed={saved}
                >
                  <Bookmark className={`size-5 ${saved ? "fill-blue-600 text-blue-600" : "text-slate-600"}`} />
                </motion.button>
              </div>
              <div className="hidden lg:block">
                <CtaFeedback notice={ctaNotice} reduceMotion={reduceMotion} className="mt-4" />
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-sm font-extrabold text-slate-800">Simpan ke koleksi</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Untuk rumah", "Biasanya pesan", "Minggu ini", "Mendesak"].map((collection) => <button key={collection} type="button" onClick={() => favorites.setCollection(vendor.slug, vendor._id, collection)} className={`min-h-12 rounded-lg border px-3 text-sm font-extrabold ${favorites.collectionFor(vendor.slug) === collection ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50"} ${focusRing}`}>{collection}</button>)}
                </div>
              </div>
              <div className="mt-5 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold leading-6 text-slate-700">
                <span className="text-lg" aria-hidden="true">✎</span>
                <span>Transaksi dan kesepakatan tetap dilakukan langsung bersama mitra.</span>
              </div>
            </GlassSurface>
          </motion.aside>
        </div>
        {/*
          FASE 9.1 - PEKERJAAN 2: kontrol aksesibilitas harus bisa diakses
          mana saja. Sebelumnya hanya ada di beranda dan dasbor, jadi warga yang
          butuh "teks besar" atau kontras tinggi harus balik ke beranda dulu
          sebelum membuka profil mitra. Sekarang ikut di halaman yang mereka
          sedang baca.
        */}
        <div className="mx-auto mt-8 max-w-[1600px] px-4 sm:px-6 lg:px-10">
          <AccessibilityControls />
        </div>
      </main>

      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] z-[60] lg:hidden">
        <CtaFeedback notice={ctaNotice} reduceMotion={reduceMotion} className="mx-auto max-w-md" />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-[3rem_1fr] gap-2">
          <motion.button
            type="button"
            onClick={() => favorites.save(vendor.slug, vendor._id)}
            whileHover={reduceMotion ? undefined : { y: -2, scale: 1.04 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            animate={reduceMotion ? undefined : { scale: saved ? [1, 1.14, 1] : 1 }}
            transition={{ duration: 0.28 }}
            className={`flex min-h-12 items-center justify-center rounded-lg border border-slate-300 ${focusRing}`}
            aria-label={saved ? "Hapus dari tersimpan" : "Simpan listing"}
            aria-pressed={saved}
          >
            <Bookmark className={`size-5 ${saved ? "fill-blue-600 text-blue-600" : "text-slate-600"}`} />
          </motion.button>
          <motion.button
            type="button"
            disabled={!vendor.contactRef}
            onClick={() => openWhatsApp("availability")}
            whileHover={reduceMotion ? undefined : { scale: 1.01 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-base font-extrabold text-[#082f1e] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 ${focusRing}`}
          >
            <motion.span whileHover={reduceMotion ? undefined : { scale: 1.12 }} className="inline-flex">
              <MessageCircle className="size-5" />
            </motion.span>
            {categoryActionLabel[vendor.category]}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function RatingPicker({
  value,
  onChange,
  reduceMotion,
}: {
  value: number;
  onChange: (value: number) => void;
  reduceMotion: boolean;
}) {
  return (
    <div
      role="group"
      aria-labelledby="rating-label"
      className="flex min-h-12 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1"
    >
      {[1, 2, 3, 4, 5].map((rating) => (
        <motion.button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          whileHover={reduceMotion ? undefined : { y: -2, scale: 1.1 }}
          whileTap={reduceMotion ? undefined : { scale: 0.9 }}
          animate={reduceMotion ? undefined : { scale: value >= rating ? [1, 1.14, 1] : 1 }}
          transition={{ duration: 0.24 }}
          className={`flex min-h-10 min-w-10 items-center justify-center rounded-md ${focusRing} ${value >= rating ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
          aria-label={`${rating} bintang`}
          aria-pressed={value === rating}
        >
          <Star className="size-5 fill-current" />
        </motion.button>
      ))}
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  reduceMotion,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { x: 2 }}
      transition={{ duration: 0.18 }}
      className="flex min-w-0 items-start gap-3 rounded-lg bg-slate-50 p-3"
    >
      <motion.span
        whileHover={reduceMotion ? undefined : { rotate: -8, scale: 1.08 }}
        className="mt-0.5 inline-flex shrink-0"
      >
        <Icon className="size-5 text-blue-600" />
      </motion.span>
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-slate-900">{label}</p>
        <p className="mt-1 text-base leading-6 text-slate-600">{value}</p>
      </div>
    </motion.div>
  );
}

export default function VendorProfile() {
  return <VendorProfileContent />;
}
