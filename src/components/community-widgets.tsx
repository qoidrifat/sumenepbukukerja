import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Cloud,
  Download,
  ImagePlus,
  MapPin,
  RefreshCw,
  Package,
  Send,
  ShieldCheck,
  Star,
  WifiOff,
  X,
} from "lucide-react";
import { landmarkLabel, type Category, type Vendor } from "@/lib/catalog";
import { CategoryMascot } from "@/components/category-mascot";
import { distanceLabel } from "@/lib/catalog-data";
import {
  useCatalogActions,
  useImageUpload,
  useCatalogVendors,
  useOwnerVendors,
  useMyInteractions,
  useOwnerRequests,
  useServiceRequests,
  useVendorPackages,
  useVendorPhotos,
  useVendorClaims,
  useListingHistory,
  type ServiceRequest,
} from "@/lib/catalog-store";
import { useAuth } from "@/hooks/use-auth";
import { generateWhatsAppLink } from "@/lib/whatsapp";
import { AnimatedContent, ScrollReveal } from "@/components/react-bits";
import { PublicRequestMascot } from "@/components/public-request-mascot";
import { ThemedSelect } from "@/components/ui/themed-select";
import { CheckField, FormField, OptionalNote, TextField } from "@/components/form-field";
import {
  areaSelectOptions,
  categorySelectOptions,
  interactionStatusSelectOptions,
  reportReasonSelectOptions,
} from "@/lib/select-options";
import { useOfflineQueue } from "@/lib/offline-queue";

import { focusRing } from "@/components/display-controls";
import { MAX_IMAGE_LABEL } from "@/lib/image-upload";
import { publicInputClass as inputClass } from "@/lib/public-field-classes";

function formatRequestDate(timestamp: number) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(timestamp));
}

/**
 * Batas bawah field tanggal: hari ini, dalam bentuk yang dipahami `<input
 * type="date">`.
 *
 * `toISOString()` TIDAK boleh dipakai di sini: ia menghasilkan tanggal UTC, dan
 * di zona waktu GMT+7 WIB pukul 08.00 ke bawah ia akan menghasilkan tanggal
 * kemarin. Field "dibutuhkan kapan" yang tidak bisa dipilih sebelum hari ini
 * jauh lebih membingungkan daripada batas yang satu hari meleset.
 */
function todayISODate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Tanggal pilihan pengguna, ditulis balik dalam bahasa Indonesia.
 *
 * Kontrol `date` digambar browser memakai lokalitas PERANGKAT, bukan `id-ID`.
 * Artinya isian `09/10/2026` bisa dibaca 9 Oktober oleh satu orang dan 10
 * September oleh orang lain di perangkat yang sama. Baris ini menutup celah
 * itu tanpa mengubah perilaku kontrol aslinya.
 */
function formatNeededAt(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function AvailabilityBadge({ vendor }: { vendor: Vendor }) {
  const availability = vendor.availability ?? "available";
  const labels = {
    available: { label: "Tersedia", tone: "border-emerald-200 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
    busy: { label: "Sedang sibuk", tone: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
    closed: { label: "Tutup sementara", tone: "border-slate-200 bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  }[availability];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-extrabold ${labels.tone}`}>
      <span className={`size-2 rounded-full ${labels.dot}`} aria-hidden="true" />
      {labels.label}
    </span>
  );
}

export function PackageList({ vendorId }: { vendorId?: string }) {
  const packages = useVendorPackages(vendorId);
  if (!packages || packages.length === 0) return null;
  return (
    <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby="package-list-title">
      <div className="flex items-center gap-2">
        <Package className="size-5 text-blue-600" aria-hidden="true" />
        <h2 id="package-list-title" className="text-lg font-black text-slate-950">Paket layanan</h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {packages.map((item) => (
          <div key={item._id} className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-extrabold text-slate-950">{item.name}</h3>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-sm font-black text-blue-700">{item.price}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
              {item.duration ? <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{item.duration}</span> : null}
              {item.area ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{item.area}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RequestForm({ onCreated }: { onCreated: () => void }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { createRequest } = useCatalogActions();
  const categoryFieldId = useId();
  const areaFieldId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("Servis Teknik");
  const [landmark, setLandmark] = useState("all");
  const [budget, setBudget] = useState("");
  const [neededAt, setNeededAt] = useState("");
  const [useLocation, setUseLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAuthenticated) {
      navigate(`/auth?returnTo=${encodeURIComponent("/#permintaan")}`);
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (useLocation && typeof navigator !== "undefined" && navigator.geolocation) {
        const position = await new Promise<GeolocationPosition | null>((resolve) => navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 3500, maximumAge: 60_000 }));
        lat = position?.coords.latitude;
        lng = position?.coords.longitude;
      }
      await createRequest({
        title,
        description,
        category,
        landmark,
        lat,
        lng,
        budget: budget || undefined,
        neededAt: neededAt ? new Date(`${neededAt}T12:00:00`).getTime() : undefined,
      });
      setTitle("");
      setDescription("");
      setBudget("");
      setNeededAt("");
      setSuccess("Permintaan tayang. Penyedia di sekitar area tersebut bisa membantu.");
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Permintaan belum dapat diposting.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Papan kebutuhan warga</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Butuh bantuan?</h3>
        </div>
        <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Send className="size-5" aria-hidden="true" /></span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">Tulis kebutuhan sekali, lalu biarkan usaha yang cocok segera menawarinya via WhatsApp.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextField label="Judul kebutuhan" value={title} onValueChange={setTitle} controlClassName={inputClass} placeholder="Contoh: Butuh tukang listrik dekat Kalianget" className="sm:col-span-2" required minLength={5} maxLength={100} />
        <FormField label="Kategori" control={() => <ThemedSelect id={categoryFieldId} value={category} onValueChange={(value) => setCategory(value as Category)} options={categorySelectOptions} />} />
        <FormField label="Area" control={() => <ThemedSelect id={areaFieldId} value={landmark} onValueChange={setLandmark} options={areaSelectOptions} />} />
        <TextField label={<>Anggaran singkat <OptionalNote /></>} value={budget} onValueChange={setBudget} controlClassName={inputClass} placeholder="Contoh: Rp100.000-an" />
        <TextField
          type="date"
          label={<>Dibutuhkan kapan <OptionalNote /></>}
          value={neededAt}
          onValueChange={setNeededAt}
          controlClassName={inputClass}
          controlClassNameExtra="field-date field-date--public"
          // Tanpa batas bawah, tanggal lampau bisa dipilih untuk "dibutuhkan
          // kapan": permintaan yang mustahil dipenuhi dan hanya menambah
          // pekerjaan untuk mitra yang membacanya.
          min={todayISODate()}
          hint={neededAt ? `Dipilih: ${formatNeededAt(neededAt)}` : "Format mengikuti kalender perangkat Anda."}
        />
        <CheckField
          label="Gunakan lokasi saya untuk pencocokan jarak (opsional)"
          checked={useLocation}
          onCheckedChange={setUseLocation}
          span
        />
        <TextField
          as="textarea"
          rows={3}
          label="Ceritakan kebutuhan"
          value={description}
          onValueChange={setDescription}
          controlClassName={inputClass}
          controlClassNameExtra="min-h-28 py-3 leading-6"
          className="sm:col-span-2"
          required
          minLength={10}
          maxLength={1000}
          placeholder="Contoh: RC turun malam ini, mohon diberi tahu harga dan estimasi datang."
        />
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      {success ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{success}</p> : null}
      <button type="submit" disabled={submitting} className={`mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-base font-extrabold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}>
        <Send className="size-4" />
        {!isAuthenticated ? "Masuk untuk memposting" : submitting ? "Memposting..." : "Posting kebutuhan"}
      </button>
    </form>
  );
}

type RequestWithExpiry = Omit<ServiceRequest, "status"> & {
  status: ServiceRequest["status"] | "expired";
};

function RequestCard({ request }: { request: RequestWithExpiry }) {
  const vendors = useCatalogVendors();
  const ownedVendors = useOwnerVendors() ?? [];
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { claimRequest, acceptOffer, click, interaction } = useCatalogActions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const matches = vendors
    .filter((vendor) => vendor.category === request.category && (request.landmark === "all" || vendor.landmark === request.landmark))
    .slice(0, 3);
  const vendorSlug = request.vendorId ? vendors.find((vendor) => vendor._id === request.vendorId)?.slug : undefined;
  const isRequester = Boolean(user?._id && user._id === request.requesterId);

  const accept = async (offerId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await acceptOffer({ requestId: request._id as never, offerId: offerId as never });
      setMessage("Tawaran diterima. Mitra akan diberi tahu.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Tawaran belum dapat diterima.");
    } finally {
      setBusy(false);
    }
  };

  const offer = async (vendor: Vendor) => {
    if (!isAuthenticated) {
      navigate(`/auth?returnTo=${encodeURIComponent("/#permintaan")}`);
      return;
    }
    if (!vendor._id) {
      setMessage("Data mitra sedang dimuat. Coba lagi sebentar.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await claimRequest({ requestId: request._id as never, vendorId: vendor._id as never });
      setMessage(`Permintaan ditawari ke ${vendor.name}.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Permintaan belum dapat ditawari.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-extrabold text-blue-700">
              <CategoryMascot category={request.category} size="xs" animated={false} />
              {request.category}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><MapPin className="size-3.5" />{landmarkLabel(request.landmark)}</span>
          </div>
          <h3 className="mt-2 text-lg font-black text-slate-950">{request.title}</h3>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${request.status === "open" ? "bg-emerald-50 text-emerald-700" : request.status === "claimed" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
          {request.status === "open" ? "Butuh bantuan" : request.status === "claimed" ? `Ditawari ${request.vendorName ?? "mitra"}` : request.status === "completed" ? "Selesai" : request.status === "expired" ? "Kedaluwarsa" : "Dibatalkan"}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{request.description}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
        <span>oleh {request.requesterName}</span>
        {request.budget ? <span>Anggaran {request.budget}</span> : null}
        {request.neededAt ? <span>Diperlukan {formatRequestDate(request.neededAt)}</span> : null}
      </div>
      {isRequester && request.offers?.some((item) => item.status === "offered") ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-800">Tawaran masuk</p><div className="mt-2 space-y-2">{request.offers.filter((item) => item.status === "offered").map((item) => <div key={item._id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-bold text-slate-800">{item.vendorName}</span><button type="button" disabled={busy} onClick={() => void accept(item._id)} className={`min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:opacity-50 ${focusRing}`}>Terima tawaran</button></div>)}</div></div> : null}
      {request.status === "open" && matches.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Usaha yang cocok</p>
          <div className="mt-2 space-y-2">
            {matches.map((vendor) => {
              const whatsappHref = generateWhatsAppLink({
                phone: vendor.phone,
                vendorName: vendor.name,
                category: vendor.category,
                landmark: landmarkLabel(vendor.landmark),
                intent: "request",
                reference: request.title,
              });
              return (
                <div key={vendor.slug} className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-extrabold text-slate-900">{vendor.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {!isRequester && vendor._id && ownedVendors.some((owned) => owned._id === vendor._id) ? (
                      <button type="button" disabled={busy} onClick={() => void offer(vendor)} className={`min-h-12 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 hover:bg-blue-50 disabled:opacity-50 ${focusRing}`}>
                        {busy ? "Mengirim..." : "Tawarkan bantuan"}
                      </button>
                    ) : null}
                    <a href={whatsappHref} target="_blank" rel="noreferrer" onClick={() => { if (vendor._id) { void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); } }} className={`inline-flex min-h-12 items-center rounded-lg bg-[#25D366] px-3 text-sm font-extrabold text-[#082f1e] ${focusRing}`}>Tanya via WhatsApp</a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {request.vendorId && vendorSlug ? (
        <Link to={`/v/${vendorSlug}`} className={`mt-4 inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}>Lihat usaha yang menawarkan <ArrowRight className="size-4" /></Link>
      ) : request.status === "claimed" ? (
        <p className="mt-4 text-sm font-bold text-amber-800">Penawaran sudah masuk. Hubungi mitra melalui WhatsApp dari daftar usaha.</p>
      ) : null}
      {message ? <p className="mt-3 text-sm font-bold text-blue-700" role="status">{message}</p> : null}
    </article>
  );
}

export function RequestBoard() {
  const [area, setArea] = useState("all");
  const areaFilterId = useId();
  const requests = useServiceRequests({ status: "open", landmark: area === "all" ? undefined : area, limit: 20 });
  return (
    <section id="permintaan" className="relative z-10 scroll-mt-16 border-y border-slate-200 bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <ScrollReveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Papan warga</p>
              <h2 className="mt-2 text-[clamp(1.7rem,3.5vw,2.6rem)] font-black tracking-[-0.045em] text-slate-950">Ada yang butuh, ada yang bisa membantu.</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">Permintaan lokal dibuat agar warga dan penyedia bisa saling menemukan tanpa perlu aplikasi chat tambahan.</p>
            </div>
            <div className="flex min-h-12 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-700 shadow-sm sm:px-3">
              <span className="shrink-0" id={`${areaFilterId}-label`}>Area</span>
              <ThemedSelect
                id={areaFilterId}
                aria-labelledby={`${areaFilterId}-label`}
                variant="ghost"
                value={area}
                onValueChange={setArea}
                options={areaSelectOptions}
                className="min-w-[8.5rem] flex-1"
              />
            </div>
          </div>
        </ScrollReveal>
        <div className="mt-8 grid gap-6 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
          <RequestForm onCreated={() => undefined} />
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-slate-950">Kebutuhan terbaru</h3>
              <span className="text-sm font-bold text-slate-500">Realtime dari warga</span>
            </div>
            <AnimatedContent animationKey={`${area}-${requests?.length ?? 0}`} className="mt-4">
              {requests === undefined ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">Memuat kebutuhan warga...</div> : requests.length > 0 ? <div className="space-y-3">{requests.map((request) => <RequestCard key={request._id} request={request} />)}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center sm:p-8"><div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6 sm:text-left"><div className="min-w-0"><p className="font-black text-slate-950">Belum ada permintaan di area ini</p><p className="mt-2 text-sm leading-6 text-slate-600">Coba posting kebutuhan pertama atau pilih area lain.</p></div><PublicRequestMascot /></div></div>}
            </AnimatedContent>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MyRequestHistory() {
  const requests = useServiceRequests({ mine: true, limit: 100 });
  const { updateRequest, reopenRequest } = useCatalogActions();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const ownRequests = requests ?? [];
  const update = async (id: string, status: "completed" | "cancelled") => {
    setUpdatingId(id);
    setNotice("");
    try {
      const reason = status === "cancelled" ? window.prompt("Alasan pembatalan (minimal 5 karakter)") : undefined;
      if (status === "cancelled" && (!reason || reason.trim().length < 5)) {
        setNotice("Alasan pembatalan belum diisi.");
        return;
      }
      await updateRequest({ requestId: id as never, status, reason: reason || undefined });
      setNotice(status === "completed" ? "Permintaan ditandai selesai." : "Permintaan dibatalkan.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Status permintaan belum dapat diperbarui.");
    } finally {
      setUpdatingId(null);
    }
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Send className="size-5" /></span><div><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Permintaan saya</p><h2 className="mt-1 text-xl font-black text-slate-950">Pantau kebutuhan</h2></div></div>{ownRequests.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">Belum ada permintaan yang Anda posting.</p> : <div className="mt-4 space-y-3">{ownRequests.map((request) => <div key={request._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-extrabold text-slate-950">{request.title}</p><p className="mt-1 text-sm text-slate-600">{request.status === "open" ? "Menunggu penawaran" : request.status === "claimed" ? `Ditawari ${request.vendorName ?? "mitra"}` : request.status === "completed" ? "Sudah selesai" : request.status === "expired" ? "Kedaluwarsa" : "Dibatalkan"}</p></div><span className="text-xs font-bold text-slate-500">{formatRequestDate(request.createdAt)}</span></div>{request.status === "open" || request.status === "claimed" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={updatingId === request._id} onClick={() => void update(request._id, "completed")} className={`min-h-12 rounded-lg border border-emerald-200 px-3 text-sm font-extrabold text-emerald-700 disabled:opacity-50 ${focusRing}`}>Tandai selesai</button><button type="button" disabled={updatingId === request._id} onClick={() => void update(request._id, "cancelled")} className={`min-h-12 rounded-lg border border-slate-300 px-3 text-sm font-extrabold text-slate-700 disabled:opacity-50 ${focusRing}`}>Batalkan</button></div> : null}{request.status === "cancelled" || request.status === "expired" ? <div className="mt-3"><button type="button" disabled={updatingId === request._id} onClick={() => { setUpdatingId(request._id); void reopenRequest({ requestId: request._id as never }).then(() => setNotice("Permintaan dibuka kembali.")).catch((caught) => setNotice(caught instanceof Error ? caught.message : "Permintaan belum dapat dibuka.")); }} className={`min-h-11 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 disabled:opacity-50 ${focusRing}`}>Buka kembali</button></div> : null}</div>)}</div>}{notice ? <p className="mt-3 text-sm font-bold text-blue-700" role="status">{notice}</p> : null}</section>;
}

export function InteractionHistory() {
  const interactions = useMyInteractions();
  const { updateInteraction } = useCatalogActions();
  const update = async (id: string, status: "opened" | "waiting" | "completed" | "dismissed") => {
    await updateInteraction({ id: id as never, status });
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Riwayat interaksi</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Lanjutkan percakapan</h2>
        </div>
        <Clock3 className="size-5 text-blue-600" aria-hidden="true" />
      </div>
      {interactions === undefined ? <p className="mt-4 text-sm font-bold text-slate-500">Memuat riwayat...</p> : interactions.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">Kontak yang Anda buka akan muncul di sini. Tandai status agar mudah diingat.</p> : <div className="mt-4 space-y-3">{interactions.slice(0, 8).map((item) => <div key={item._id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{item.vendorName}</p><p className="mt-1 text-sm text-slate-600">{item.kind === "whatsapp" ? "WhatsApp dibuka" : item.kind === "share" ? "Listing dibagikan" : item.kind === "call" ? "Nomor ditelepon" : item.kind === "view" ? "Listing dibuka" : "Permintaan dibantu"}</p></div><div className="flex items-center gap-2"><ThemedSelect aria-label={`Status interaksi ${item.vendorName}`} size="sm" className="w-auto min-w-[9.5rem]" value={item.status} onValueChange={(value) => void update(item._id, value as "opened" | "waiting" | "completed" | "dismissed")} options={interactionStatusSelectOptions} />{item.vendorSlug ? <Link to={`/v/${item.vendorSlug}`} className={`flex min-h-10 items-center rounded-lg border border-blue-200 px-3 text-sm font-extrabold text-blue-700 ${focusRing}`}>Buka</Link> : null}</div></div>)}</div>}
    </section>
  );
}


export function ClaimListingPanel({ vendorId, vendorName, phone, address, ownedByMe = false, returnTo }: { vendorId: string; vendorName: string; phone: string; address: string; ownedByMe?: boolean; returnTo?: string }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const claims = useVendorClaims(isAuthenticated ? vendorId : undefined);
  const { submitClaim, generateUploadUrl } = useCatalogActions();
  const uploadImageFile = useImageUpload();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState(phone);
  const [businessAddress, setBusinessAddress] = useState(address);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      let evidenceStorageId: string | undefined;
      if (evidence) {
        // Jalur sama dengan foto profil dan galeri: downscale bila perlu, cek
        // peta blob, unggah hanya kalau belum ada. Aturan ukuran/jenis tetap
        // satu sumber di `@/lib/image-upload`, tidak ditulis ulang di sini.
        const uploaded = await uploadImageFile(evidence, () => generateUploadUrl());
        evidenceStorageId = uploaded.storageId;
      }
      await submitClaim({ vendorId: vendorId as never, email, whatsappPhone, businessAddress, evidenceStorageId });
      setStatus("pending");
      setMessage("Klaim terkirim dan menunggu pemeriksaan pengelola.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Klaim belum dapat dikirim.");
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthenticated) {
    const destination = returnTo ?? `/v/${window.location.pathname.split("/").pop() ?? ""}`;
    return <button type="button" onClick={() => navigate(`/auth?returnTo=${encodeURIComponent(destination)}`)} className={`mt-6 min-h-12 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-extrabold text-blue-700 ${focusRing}`}>Masuk untuk mengklaim usaha ini</button>;
  }
  if (status === "pending" || claims?.some((claim) => claim.status === "pending")) {
    return <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800" role="status">Klaim {vendorName} sedang diverifikasi oleh pengelola.</p>;
  }
  if (claims?.some((claim) => claim.status === "verified")) {
    return <p className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{vendorName} sudah diverifikasi. Anda boleh mengelola listing.</span></p>;
  }
  if (claims?.some((claim) => claim.status === "rejected")) {
    return <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">Klaim sebelumnya ditolak. Periksa bukti dan hubungi pengelola bila perlu.</p>;
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`mt-6 min-h-12 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-extrabold text-blue-700 ${focusRing}`}>{ownedByMe ? "Verifikasikan usaha ini" : "Ini usaha saya — klaim listing"}</button>;
  return <form onSubmit={submit} className="mt-6 rounded-xl border border-blue-200 bg-blue-50/70 p-4"><p className="font-extrabold text-slate-950">Klaim {vendorName}</p><p className="mt-1 text-sm leading-6 text-slate-600">Masukkan data yang bisa diverifikasi. Pemilik baru ditetapkan setelah admin menyetujui.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><TextField label="Email terverifikasi" type="email" value={email} onValueChange={setEmail} controlClassName={inputClass} className="sm:col-span-2" required /><TextField label="Nomor WhatsApp" type="tel" value={whatsappPhone} onValueChange={setWhatsappPhone} controlClassName={inputClass} required /><TextField label="Alamat usaha" value={businessAddress} onValueChange={setBusinessAddress} controlClassName={inputClass} required /><FormField label={<>Foto bukti <OptionalNote /></>} className="sm:col-span-2" control={({ id }) => <input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />} /></div>{message ? <p className="mt-3 text-sm font-bold text-red-700" role="alert">{message}</p> : null}<div className="mt-3 flex gap-2"><button type="submit" disabled={busy} className={`min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-extrabold text-white disabled:opacity-50 ${focusRing}`}>{busy ? "Mengirim..." : "Kirim klaim"}</button><button type="button" onClick={() => setOpen(false)} className={`min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold text-slate-700 ${focusRing}`}>Batal</button></div></form>;
}

export function OwnerGalleryManager({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const photos = useVendorPhotos(vendorId) ?? [];
  const { generateUploadUrl, createPhoto, removePhoto } = useCatalogActions();
  const uploadImageFile = useImageUpload();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMessage("");
    let uploaded = 0;
    let resized = 0;
    try {
      for (const file of Array.from(files).slice(0, 12)) {
        if (photos.length + uploaded >= 12) {
          setMessage("Maksimal 12 foto per listing.");
          break;
        }
        // Downscale + dedup: foto 3 MB dari kamera ponsel diperkecil sebelum
        // menyentuh jaringan, dan foto identik yang sudah ada di server tidak
        // diunggah dua kali. Kesalahan per berkas tidak menghentikan sisa antrean.
        try {
          const result = await uploadImageFile(file, () => generateUploadUrl());
          await createPhoto({ vendorId: vendorId as never, storageId: result.storageId, caption: file.name.slice(0, 120) });
          uploaded += 1;
          if (result.resized) resized += 1;
        } catch (caught) {
          setMessage(caught instanceof Error ? caught.message : "Foto belum dapat diunggah.");
        }
      }
      if (resized > 0) setMessage(`${uploaded} foto masuk antrean moderasi · ${resized} diperkecil otomatis.`);
      if (uploaded > 0 && resized === 0) setMessage(`${uploaded} foto masuk antrean moderasi.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Foto belum dapat diunggah.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-extrabold text-slate-800 ${focusRing}`}>
        <span className="inline-flex items-center gap-2"><ImagePlus className="size-4 text-blue-600" />Galeri foto ({photos.length}/12)</span>
        <span className="text-xs text-slate-500">Kelola</span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <figure key={photo._id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img src={photo.url ?? ""} alt={photo.caption || `Foto ${vendorName}`} className="aspect-square w-full object-cover" loading="lazy" />
              <figcaption className="flex items-center justify-between gap-1 px-2 py-1 text-[11px] text-slate-600">
                <span>{photo.moderationStatus === "pending" ? "Menunggu moderasi" : photo.moderationStatus === "rejected" ? "Ditolak" : "Tampil"}</span>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm("Hapus foto ini?")) void removePhoto({ id: photo._id as never }).catch((caught) => setMessage(caught instanceof Error ? caught.message : "Foto belum dapat dihapus.")); }} className={`font-black text-red-700 ${focusRing}`} aria-label={`Hapus foto ${vendorName}`}>Hapus</button>
              </figcaption>
            </figure>
          ))}
        </div>
        <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 text-sm font-extrabold text-blue-700 hover:bg-blue-100 focus-within:ring-2 focus-within:ring-blue-600">
          <ImagePlus className="size-5" aria-hidden="true" />
          {busy ? "Mengunggah..." : `Pilih beberapa foto (maks. ${MAX_IMAGE_LABEL} masing-masing)`}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={busy} onChange={(event) => void upload(event.target.files)} />
        </label>
        {message ? <p className="text-sm font-bold text-blue-700" role="status">{message}</p> : null}
      </div>
    </details>
  );
}

export function OwnerListingHistory({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const history = useListingHistory(vendorId) ?? [];
  return (
    <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <summary className={`min-h-11 cursor-pointer font-extrabold text-slate-800 ${focusRing}`}>Riwayat perubahan · {vendorName}</summary>
      {history.length === 0 ? <p className="mt-3 text-sm text-slate-600">Belum ada perubahan yang tercatat.</p> : <div className="mt-3 max-h-56 space-y-2 overflow-auto">{history.map((entry) => <article key={entry._id} className="border-b border-slate-100 pb-2 text-sm"><p className="font-bold text-slate-800">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</p>{entry.changes.map((change) => <p key={`${entry._id}-${change.field}`} className="mt-1 text-slate-600"><span className="font-bold">{change.field}</span>: {change.oldValue ?? "—"} → {change.newValue ?? "—"}</p>)}</article>)}</div>}
    </details>
  );
}

export function OwnerRequestWorkspace() {
  const requests = useOwnerRequests() ?? [];
  const { claimRequest, offerRequest, withdrawOffer } = useCatalogActions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const act = async (requestId: string, vendorId: string, action: "claim" | "offer" | "withdraw", offerId?: string) => {
    setBusyId(requestId);
    setMessage("");
    try {
      if (action === "claim") await claimRequest({ requestId: requestId as never, vendorId: vendorId as never });
      if (action === "offer") await offerRequest({ requestId: requestId as never, vendorId: vendorId as never });
      if (action === "withdraw" && offerId) await withdrawOffer({ offerId: offerId as never });
      setMessage(action === "claim" ? "Permintaan diklaim. Resident bisa melihat Freelance Anda." : action === "offer" ? "Tawaran dicatat dan masuk riwayat request." : "Tawaran ditarik.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Aksi request belum dapat diselesaikan.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="owner-request-title">
      <div className="flex items-start gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Send className="size-5" aria-hidden="true" /></span>
        <div><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Ruang pemilik</p><h2 id="owner-request-title" className="mt-1 text-xl font-black text-slate-950">Request yang cocok</h2><p className="mt-1 text-sm leading-6 text-slate-600">Diurutkan dari jarak, area layanan, dan kecepatan respons listing Anda.</p></div>
      </div>
      {requests.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">Belum ada request yang cocok dengan listing Anda.</p> : <div className="mt-4 space-y-3">{requests.map((request) => {
        const firstMatch = request.vendorMatches?.[0];
        const ownOffer = request.offers?.find((offer) => offer.vendorId === firstMatch?.vendorId);
        return <article key={request._id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-extrabold text-slate-950">{request.title}</p><p className="mt-1 text-sm text-slate-600">{request.category} · {landmarkLabel(request.landmark)} · {request.requesterName}</p></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-800">{request.status}</span></div><div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-slate-500"><span>Jarak {firstMatch?.distanceKm !== undefined ? `${firstMatch.distanceKm.toFixed(1)} km` : "area"}</span>{request.neededAt ? <span>Dibutuhkan {formatRequestDate(request.neededAt)}</span> : null}{request.budget ? <span>Anggaran {request.budget}</span> : null}</div><div className="mt-3 flex flex-wrap gap-2">{request.status === "open" && firstMatch ? <><button type="button" disabled={busyId === request._id} onClick={() => void act(request._id, firstMatch.vendorId, "claim")} className={`min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-extrabold text-white disabled:opacity-50 ${focusRing}`}>Saya bisa membantu</button><button type="button" disabled={busyId === request._id} onClick={() => void act(request._id, firstMatch.vendorId, ownOffer ? "withdraw" : "offer", ownOffer?._id)} className={`min-h-11 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 disabled:opacity-50 ${focusRing}`}>{ownOffer ? "Tarik tawaran" : "Catat tawaran"}</button></> : null}</div>{request.offers?.length ? <details className="mt-2 text-sm text-slate-600"><summary className={`cursor-pointer font-bold ${focusRing}`}>Riwayat tawaran ({request.offers.length})</summary><ul className="mt-2 space-y-1">{request.offers.map((offer) => <li key={offer._id}>{offer.vendorName ?? "Listing"} · {offer.status}</li>)}</ul></details> : null}</article>;
      })}</div>}
      {message ? <p className="mt-3 text-sm font-bold text-blue-700" role="status">{message}</p> : null}
    </section>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const { online, pendingCount } = useOfflineQueue();

  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined;
    let onUpdateFound: (() => void) | undefined;
    const hadController = Boolean(navigator.serviceWorker?.controller);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_READY") setUpdateReady(true);
    };
    const onControllerChange = () => {
      if (hadController) window.location.reload();
    };
    const watchRegistration = (next: ServiceWorkerRegistration | undefined) => {
      registration = next;
      if (registration?.waiting) setUpdateReady(true);
      onUpdateFound = () => {
        const installing = registration?.installing;
        if (!installing) {
          setUpdateReady(true);
          return;
        }
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
        }, { once: true });
      };
      registration?.addEventListener("updatefound", onUpdateFound);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    if (navigator.serviceWorker) {
      void navigator.serviceWorker.getRegistration().then(watchRegistration);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      if (registration && onUpdateFound) registration.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  const update = async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return;
    await registration.update();
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    setUpdateReady(false);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Status aplikasi dan sinkronisasi">
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700">
        {online ? <Cloud className="size-5 text-emerald-600" aria-hidden="true" /> : <WifiOff className="size-5 text-amber-600" aria-hidden="true" />}
        <span role="status">{online ? (pendingCount > 0 ? `${pendingCount} perubahan menunggu koneksi` : "Data tersinkron") : "Mode offline — perubahan disimpan di perangkat"}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {installPrompt ? (
          <button type="button" onClick={() => void installPrompt.prompt().then(() => setInstallPrompt(null))} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-extrabold text-blue-700 ${focusRing}`}>
            <Download className="size-4" aria-hidden="true" />Pasang aplikasi
          </button>
        ) : null}
        {updateReady ? (
          <button type="button" onClick={() => void update()} className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-extrabold text-white ${focusRing}`}>
            <RefreshCw className="size-4" aria-hidden="true" />Perbarui aplikasi
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ReportListingButton({ vendorId }: { vendorId?: string }) {
  const { createReport } = useCatalogActions();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Informasi tidak akurat");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createReport({ vendorId: vendorId as never, reason, details });
      setStatus("Laporan terkirim ke pengelola.");
      setDetails("");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Laporan belum terkirim.");
    }
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`inline-flex min-h-12 items-center gap-2 rounded-lg px-3 text-sm font-extrabold text-slate-600 hover:bg-slate-100 hover:text-red-700 ${focusRing}`}><AlertTriangle className="size-4" />Laporkan listing</button>;
  return <form onSubmit={submit} className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="font-extrabold text-red-900">Ada informasi yang kurang tepat?</p><FormField label="Alasan laporan" className="mt-3" control={() => <ThemedSelect aria-label="Alasan laporan" value={reason} onValueChange={setReason} options={reportReasonSelectOptions} />} /><TextField as="textarea" rows={3} label="Detail laporan" value={details} onValueChange={setDetails} controlClassName={inputClass} className="mt-2" placeholder="Ceritakan detailnya" required minLength={5} /><div className="mt-2 flex gap-2"><button type="submit" className={`min-h-12 rounded-lg bg-red-700 px-3 text-sm font-extrabold text-white ${focusRing}`}>Kirim</button><button type="button" onClick={() => setOpen(false)} className={`min-h-12 rounded-lg px-3 text-sm font-extrabold text-slate-700 ${focusRing}`}>Batal</button></div>{status ? <p className="mt-2 text-sm font-bold text-red-800" role="status">{status}</p> : null}</form>;
}

export function PackageManager({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const packages = useVendorPackages(vendorId);
  const { createPackage, removePackage } = useCatalogActions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    try {
      await createPackage({ vendorId: vendorId as never, name, description, price, duration: duration || undefined, area: area || undefined });
      setName(""); setDescription(""); setPrice(""); setDuration(""); setArea("");
      setMessage("Paket baru ditambahkan.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Paket belum dapat ditambahkan.");
    }
  };
  return <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className={`min-h-12 cursor-pointer py-3 text-sm font-extrabold text-slate-800 ${focusRing}`}>Kelola paket {vendorName}</summary><div className="mt-3 space-y-3">{packages?.map((item) => <div key={item._id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3"><div><p className="font-extrabold text-slate-900">{item.name} · {item.price}</p><p className="mt-1 text-sm text-slate-600">{item.description}</p></div><button type="button" onClick={() => void removePackage({ id: item._id as never })} className={`flex min-h-10 items-center rounded-lg px-2 text-sm font-extrabold text-red-700 hover:bg-red-50 ${focusRing}`} aria-label={`Hapus paket ${item.name}`}><X className="size-4" /></button></div>)}<form onSubmit={submit} className="grid gap-2 sm:grid-cols-2"><TextField label="Nama paket" value={name} onValueChange={setName} controlClassName={inputClass} placeholder="Nama paket" required /><TextField label="Harga paket" value={price} onValueChange={setPrice} controlClassName={inputClass} placeholder="Harga" required /><TextField as="textarea" rows={2} label="Deskripsi paket" value={description} onValueChange={setDescription} controlClassName={inputClass} className="sm:col-span-2" required /><TextField label="Estimasi durasi paket" value={duration} onValueChange={setDuration} controlClassName={inputClass} placeholder="Estimasi durasi" /><TextField label="Area layanan paket" value={area} onValueChange={setArea} controlClassName={inputClass} placeholder="Area layanan" /><button type="submit" className={`min-h-12 rounded-lg bg-blue-600 px-3 text-sm font-extrabold text-white sm:col-span-2 ${focusRing}`}>Simpan paket</button></form>{message ? <p className="text-sm font-bold text-blue-700" role="status">{message}</p> : null}</div></details>;
}

export function CompareTray({ vendors, selected, onRemove, onClear }: { vendors: Vendor[]; selected: string[]; onRemove: (slug: string) => void; onClear: () => void }) {
  const { click, interaction } = useCatalogActions();
  const selectedVendors = vendors.filter((vendor) => selected.includes(vendor.slug));
  if (selectedVendors.length === 0) return null;
  const trackWhatsApp = (vendor: Vendor) => {
    if (!vendor._id) return;
    void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined);
    void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => undefined);
  };
  return (
    <section className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5" aria-labelledby="compare-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-700">Bandingkan listing</p><h2 id="compare-title" className="mt-1 text-lg font-black text-slate-950">Pilih yang paling pas</h2></div><button type="button" onClick={onClear} className={`min-h-12 rounded-lg px-3 text-sm font-extrabold text-blue-700 hover:bg-white ${focusRing}`}>Bersihkan</button></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{selectedVendors.map((vendor) => <div key={vendor.slug} className="rounded-xl border border-blue-100 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-extrabold text-blue-700">{vendor.category}</p><h3 className="mt-1 font-black text-slate-950">{vendor.name}</h3></div><button type="button" onClick={() => onRemove(vendor.slug)} className={`flex size-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 ${focusRing}`} aria-label={`Hapus ${vendor.name} dari perbandingan`}><X className="size-4" /></button></div><div className="mt-4 space-y-2 text-sm"><p className="flex items-center gap-2"><MapPin className="size-4 text-blue-600" />{landmarkLabel(vendor.landmark)}{vendor.distanceKm !== undefined ? ` · ${distanceLabel(vendor.distanceKm)}` : ""}</p><p className="flex items-center gap-2"><Clock3 className="size-4 text-blue-600" />{vendor.hours}</p><p className="flex items-center gap-2"><Star className="size-4 fill-amber-500 text-amber-500" />{vendor.rating} · {vendor.reviews} ulasan</p><p className="flex items-center gap-2"><Clock3 className="size-4 text-blue-600" />{vendor.responseMinutes ? `Rata-rata membalas ${vendor.responseMinutes} menit` : "Waktu balas belum diisi"}</p><p className="flex items-center gap-2"><ShieldCheck className="size-4 text-blue-600" />{vendor.verified ? "Terverifikasi" : "Belum diverifikasi"}</p><p className="font-black text-slate-900">{vendor.price}</p></div><a href={generateWhatsAppLink({ phone: vendor.phone, vendorName: vendor.name, category: vendor.category, landmark: landmarkLabel(vendor.landmark), intent: "availability" })} target="_blank" rel="noreferrer" onClick={() => trackWhatsApp(vendor)} className={`mt-4 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 text-sm font-extrabold text-[#082f1e] ${focusRing}`}>Tanya ketersediaan</a></div>)}</div>
    </section>
  );
}
