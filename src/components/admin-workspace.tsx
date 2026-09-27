import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useState, type ElementType, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  Inbox,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useCatalogActions,
  useVendorPackages,
  type VendorPackage,
  type VendorRecord,
} from "@/lib/catalog-store";
import { landmarkLabel } from "@/lib/catalog";

export const inputClass = "admin-input";
export const secondaryButtonClass = "admin-btn admin-btn-secondary";
export const quietButtonClass = "admin-btn admin-btn-quiet";

export const statusFilters = [
  { value: "all", label: "Semua" },
  { value: "unclaimed", label: "Belum klaim" },
  { value: "confirmed", label: "Terkonfirmasi" },
  { value: "verified", label: "Terverifikasi" },
  { value: "inactive", label: "Nonaktif" },
] as const;

export type ModerationFilter = (typeof statusFilters)[number]["value"];
export type PendingConfirmation = {
  kind: "reject" | "delete";
  vendor: VendorRecord;
} | null;

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "Nomor belum diisi";
  const international = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits.startsWith("62")
      ? digits
      : `62${digits}`;
  return international.replace(/(\d{3,4})(\d{3,4})(\d{3,6})/, "$1 $2 $3");
}

export function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  const international = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits.startsWith("62")
      ? digits
      : `62${digits}`;
  return `https://wa.me/${international}`;
}

export function formatDate(timestamp?: number) {
  if (!timestamp) return "Belum ada";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
    new Date(timestamp),
  );
}

export function statusInfo(vendor: VendorRecord) {
  if ((vendor.status ?? "active") === "archived") {
    return {
      key: "inactive" as const,
      label: "Nonaktif",
      hint: "Tidak tampil di katalog",
    };
  }
  if (vendor.verified) {
    return {
      key: "verified" as const,
      label: "Terverifikasi",
      hint: "Moderasi selesai",
    };
  }
  if (vendor.ownerId || vendor.businessId) {
    return {
      key: "confirmed" as const,
      label: "Terkonfirmasi",
      hint: "Pemilik sudah terhubung",
    };
  }
  return {
    key: "unclaimed" as const,
    label: "Belum Klaim",
    hint: "Perlu pemeriksaan admin",
  };
}

export function vendorUpdatePayload(
  vendor: VendorRecord,
  changes: Partial<VendorRecord> = {},
) {
  const next = { ...vendor, ...changes };
  return {
    name: next.name.trim(),
    category: next.category,
    description: next.description.trim(),
    address: next.address.trim(),
    landmark: next.landmark,
    lat: next.lat,
    lng: next.lng,
    price: next.price.trim(),
    hours: next.hours.trim(),
    phone: next.phone.replace(/\D/g, ""),
    rating: next.rating,
    accent: next.accent,
    mark: next.mark || next.name.slice(0, 2).toUpperCase(),
    tags: next.tags.length ? next.tags : [next.category],
    status: next.status ?? "active",
    featured: next.featured ?? false,
    verified: next.verified ?? false,
    photoId: next.photoId,
    availability: next.availability ?? "available",
    availabilityNote: next.availabilityNote,
    nextAvailableAt: next.nextAvailableAt,
    responseMinutes: next.responseMinutes,
    serviceRadiusKm: next.serviceRadiusKm,
  };
}

export function AdminHeader({
  role = "admin",
  reviewQueue,
}: {
  role?: string;
  reviewQueue?: { claims: number; photos: number; reports: number; total: number };
}) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-[#121212] bg-[#FAF7EE] pt-[env(safe-area-inset-top)]">
      <div className="admin-shell-frame mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-6 lg:px-10">
        <Link
          to="/"
          className="admin-btn admin-btn-secondary min-h-12 shrink-0 px-3 sm:px-4"
          aria-label="Kembali ke katalog publik"
        >
          <ArrowLeft className="size-5 shrink-0" />
          <span className="hidden sm:inline">Kembali ke katalog</span>
          <span className="sm:hidden">Beranda</span>
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-3 text-right">
          <img
            src="/brand/logo-mark.svg"
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-lg border-2 border-[#121212] bg-white object-contain shadow-[2px_2px_0_#121212]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate text-base font-black uppercase tracking-[-0.035em] text-[#1A1A1A] sm:text-lg">
              Sumenep Buku Kerja
            </p>
            <p className="mt-0.5 text-sm font-bold text-[#525252]">Ruang pengelola</p>
          </div>
        </div>

        <span className="admin-status admin-status-confirmed shrink-0">
          <span className="mr-1.5 size-2 rounded-full bg-[#1A1A1A]" />
          {role === "admin" ? "Admin" : role === "staff" ? "Staff" : "Viewer"}
        </span>
        {reviewQueue && reviewQueue.total > 0 ? (
          <a
            href="#governance-title"
            aria-label="Lompat ke panel Role & Audit untuk menangani antrean review"
            className="admin-status shrink-0 border-[#121212] bg-[#FF5A26] text-white"
            title={`${reviewQueue.claims} klaim · ${reviewQueue.photos} foto · ${reviewQueue.reports} laporan menunggu ditinjau`}
          >
            <Inbox className="mr-1.5 size-4" aria-hidden="true" />
            {reviewQueue.total} perlu direview
            <span className="sr-only">
              : {reviewQueue.claims} klaim listing, {reviewQueue.photos} foto,{" "}
              {reviewQueue.reports} laporan
            </span>
          </a>
        ) : null}
      </div>
      <div
        className="h-2 border-t-2 border-[#121212] bg-[linear-gradient(90deg,#FF5A26_0_38%,#FFE662_38%_72%,#121212_72%_100%)]"
        aria-hidden="true"
      />
    </header>
  );
}


export function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon: ElementType;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b-2 border-[#121212] p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center border-2 border-[#121212] bg-[#FFE662] shadow-[2px_2px_0_#121212]">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-[clamp(1.25rem,2vw,1.75rem)] font-black tracking-[-0.035em] text-[#1A1A1A]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-base leading-7 text-[#525252]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-base font-black text-[#1A1A1A]">
        {label}
        {required ? <span className="ml-1 text-[#FF5A26]">*</span> : null}
      </span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

export function AdminPackageManager({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const packages = useVendorPackages(vendorId);
  const { createPackage, removePackage } = useCatalogActions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<VendorPackage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    try {
      await createPackage({
        vendorId: vendorId as never,
        name,
        description,
        price,
        duration: duration || undefined,
        area: area || undefined,
      });
      setName("");
      setDescription("");
      setPrice("");
      setDuration("");
      setArea("");
      setMessage("Paket baru ditambahkan.");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Paket belum dapat ditambahkan.",
      );
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removePackage({ id: pendingDelete._id as never });
      setMessage(`Paket ${pendingDelete.name} dihapus.`);
      setPendingDelete(null);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Paket belum dapat dihapus.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <details className="mt-3 border-2 border-[#121212] bg-[#F5F0E5]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-base font-black text-[#1A1A1A] hover:bg-[#FFE662]">
          <span className="inline-flex items-center gap-2">
            <Package className="size-5" />
            Kelola paket {vendorName}
          </span>
          <span className="text-sm font-bold text-[#525252]">
            {packages?.length ?? 0} paket
          </span>
        </summary>

        <div className="space-y-3 border-t-2 border-[#121212] p-3 sm:p-4">
          {packages?.map((item) => (
            <div
              key={item._id}
              className="flex items-start justify-between gap-3 border-2 border-[#121212] bg-white p-3"
            >
              <div className="min-w-0">
                <p className="font-black text-[#1A1A1A]">
                  {item.name} · {item.price}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#525252]">
                  {item.description}
                </p>
                <p className="mt-1 text-sm font-bold text-[#525252]">
                  {[item.duration, item.area].filter(Boolean).join(" · ") ||
                    "Cakupan belum dicantumkan"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(item)}
                className="admin-icon-btn shrink-0"
                aria-label={`Hapus paket ${item.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama paket"
              className={inputClass}
              required
            />
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Harga, contoh: Rp75.000"
              className={inputClass}
              required
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Deskripsi paket"
              rows={2}
              className={`${inputClass} sm:col-span-2`}
              required
            />
            <input
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="Estimasi durasi"
              className={inputClass}
            />
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="Area layanan"
              className={inputClass}
            />
            <button
              type="submit"
              className="admin-btn admin-btn-primary sm:col-span-2"
            >
              <Plus className="size-5" />
              Simpan paket
            </button>
          </form>

          {message ? (
            <p className="text-sm font-bold text-[#1A1A1A]" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </details>

      <AlertDialogPrimitive.Root
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="admin-confirm-overlay" />
          <AlertDialogPrimitive.Content className="admin-confirm-content">
            <div className="border-b-2 border-[#121212] bg-[#FFE662] p-5">
              <AlertDialogPrimitive.Title className="text-[clamp(1.25rem,3vw,1.75rem)] font-black tracking-[-0.03em] text-[#1A1A1A]">
                Hapus paket ini?
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-2 text-base leading-7 text-[#1A1A1A]">
                Paket <strong>{pendingDelete?.name}</strong> akan dihapus dari
                listing {vendorName}. Tindakan ini tidak dapat dibatalkan.
              </AlertDialogPrimitive.Description>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <AlertDialogPrimitive.Cancel
                disabled={deleting}
                className="admin-btn admin-btn-secondary"
              >
                Batalkan
              </AlertDialogPrimitive.Cancel>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="admin-btn bg-[#E9B4A7] text-[#7C2D12]"
              >
                <Trash2 className="size-5" />
                {deleting ? "Menghapus..." : "Ya, hapus paket"}
              </button>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </>
  );
}

export type VendorActionItem = {
  _id: string;
  name: string;
  slug: string;
  phone: string;
  featured?: boolean;
  status?: string;
};

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
                  className="border-2 border-[#121212] bg-white px-3 py-2 text-sm font-black"
                >
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
                <span className="text-sm font-bold text-[#525252]">Memuat data area...</span>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

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

/**
 * Area aksi kartu vendor di Meja kerja listing.
 *
 * Setiap baris memakai CSS grid, bukan `flex-wrap`, supaya tombol selalu mengisi
 * lebar kolomnya. Dengan `flex-wrap` lebar tombol ikut panjang teks, jadi baris
 * berakhir dengan ruang kosong yang tidak rata — persis masalah yang membuat
 * area aksi terasa mengambang.
 *
 *.mobile: dua kolom, tombol ketiga melebar penuh
 * .xl   : tiga kolom sejajar saat kolom aksinya cukup lega
 *
 * Handler, disabled state, dan urutan tombol tidak berubah sama sekali.
 */
export function VendorActionArea({
  item,
  waHref,
  isActive,
  busyAction,
  itemBusyPrefix,
  onApprove,
  onToggleActive,
  onToggleFeatured,
  onRequestDestructive,
  onEdit,
}: {
  item: VendorActionItem;
  waHref: string | null;
  isActive: boolean;
  busyAction: string | null;
  itemBusyPrefix: string;
  onApprove: () => void;
  onToggleActive: () => void;
  onToggleFeatured: () => void;
  onRequestDestructive: (kind: "reject" | "delete") => void;
  onEdit: () => void;
}) {
  return (
    <>
      {/* Baris 1 — moderasi. `col-span-2` supaya baris kedua penuh, bukan
          setengah kosong. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="admin-btn admin-btn-secondary w-full min-w-0 px-2 sm:px-3"
          >
            <MessageCircle className="size-4 shrink-0" />
            Cek WA
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="admin-btn admin-btn-secondary w-full min-w-0 px-2 sm:px-3"
          >
            <MessageCircle className="size-4 shrink-0" />
            Cek WA
          </button>
        )}
        <button
          type="button"
          disabled={!item.phone.trim() || busyAction === `${itemBusyPrefix}approve`}
          onClick={onApprove}
          className="admin-btn admin-btn-primary w-full min-w-0 px-2 sm:px-3"
        >
          <Check className="size-4 shrink-0" />
          Setujui
        </button>
        <button
          type="button"
          onClick={() => onRequestDestructive("reject")}
          className="admin-btn admin-btn-danger w-full min-w-0 px-2 sm:px-3"
        >
          <X className="size-4 shrink-0" />
          Tolak
        </button>
      </div>

      {/* Baris 2 — status listing. Toggle dan ikon hapus mengikuti lebar
          natural-nya, tombol unggulan mengisi sisa ruang. */}
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-stretch gap-2 border-t-2 border-[#121212] pt-3">
        <label className="inline-flex min-h-12 items-center gap-2 border-2 border-[#121212] bg-[#F5F0E5] px-3">
          <span className="text-sm font-black">Aktif</span>
          <Switch
            checked={isActive}
            disabled={
              busyAction === `${itemBusyPrefix}archive` ||
              busyAction === `${itemBusyPrefix}activate`
            }
            onCheckedChange={onToggleActive}
            className="admin-switch"
            aria-label={`${isActive ? "Nonaktifkan" : "Aktifkan"} ${item.name}`}
          />
        </label>
        <button
          type="button"
          onClick={onToggleFeatured}
          disabled={busyAction === `${itemBusyPrefix}featured`}
          className={`admin-btn w-full px-3 ${item.featured ? "admin-btn-highlight" : "admin-btn-secondary"}`}
        >
          <Sparkles className="size-4 shrink-0" />
          {item.featured ? "Jadikan biasa" : "Jadikan unggulan"}
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onRequestDestructive("delete")}
              className="admin-icon-btn"
              aria-label={`Hapus ${item.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Hapus listing {item.name}</TooltipContent>
        </Tooltip>
      </div>

      {/* Baris 3 — navigasi. Dua tombol sama lebar, jadi tidak ada yang
          terlihat "nyempil" di sebelah temannya. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {isActive ? (
          <Link to={`/v/${item.slug}`} className="admin-btn admin-btn-secondary w-full px-3">
            <ArrowUpRight className="size-4 shrink-0" />
            Lihat
          </Link>
        ) : (
          <span className="inline-flex min-h-12 items-center justify-center border-2 border-[#121212] bg-[#E7E5E4] px-3 text-center text-sm font-black text-[#525252]">
            Tidak tayang
          </span>
        )}
        <button type="button" onClick={onEdit} className="admin-btn admin-btn-secondary w-full px-3">
          <Pencil className="size-4 shrink-0" />
          Sunting
        </button>
      </div>
    </>
  );
}

