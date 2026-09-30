import { type ElementType, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Inbox,
  MessageCircle,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type VendorRecord } from "@/lib/catalog-store";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { AdminProfile } from "@/components/admin-profile";

/*
 * Tiga panel (paket, metrik, tinjauan laporan) sudah pindah ke berkasnya
 * sendiri pada Fase 9.1 Pekerjaan 6, dan `Admin.tsx` mengimpornya langsung
 * dari sana. File ini sengaja TIDAK menjadi barrel untuk ketiganya: barrel
 * membuat "isi file ini" selalu sama dengan "isi semua panel", dan persis
 * itulah yang membuat 950 baris sulit dibaca.
 */

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

/**
 * Antrean kerja: status draft/arsip dan data yang belum lengkap.
 *
 * Ini dipisah dari `statusFilters` karena dua hal yang berbeda. Filter status di
 * atas menjawab "seberapa dipercaya moderasi?", sementara antrean ini menjawab "apa yang
 * belum selesai?". Tanpa pemisahan itu, angka "Butuh tindakan" di Ringkasan
 * cepat tidak punya tujuan: tidak ada cara menyaring meja triage ke listing
 * yang draft, ke arsip, atau ke yang datanya belum lengkap.
 */
export const queueFilters = [
  { value: "all", label: "Semua antrean" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Arsip" },
  { value: "incomplete", label: "Perlu dilengkapi" },
] as const;

export type QueueFilter = (typeof queueFilters)[number]["value"];
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

/** Waktu absolut + relatif, dibungkus <time> supaya bisa di-sort dan dibaca screen reader. */
export function TimeStampLabel({
  timestamp,
  fallback = "Belum ada",
  withSeconds = false,
  className,
}: {
  timestamp?: number;
  fallback?: string;
  withSeconds?: boolean;
  className?: string;
}) {
  if (!timestamp) {
    return <span className={className}>{fallback}</span>;
  }
  return (
    <time
      dateTime={new Date(timestamp).toISOString()}
      title={formatDateTime(timestamp, true)}
      className={className}
    >
      {formatDateTime(timestamp, withSeconds)}
      <span className="font-bold text-[#525252]"> · {formatRelativeTime(timestamp)}</span>
    </time>
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
        {/* Ikon orang untuk pengaturan profil, persis di sebelah label peran.
            `shrink-0` dipakai karena header ini `justify-between`: tanpa itu,
            tombol ini ikut gepeng dan target sentuhnya mengecil — persis di
            layar yang paling sering dipakai, yaitu ponsel. */}
        <AdminProfile />
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
  min,
  className,
  hint,
  hintId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  min?: string;
  className?: string;
  hint?: string;
  hintId?: string;
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
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-describedby={hintId}
        className={cn(inputClass, className)}
      />
      {hint ? (
        <span id={hintId} className="text-sm font-bold text-[#525252]">
          {hint}
        </span>
      ) : null}
    </label>
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

/**
 * Area aksi kartu vendor di Meja kerja listing.
 *
 * Setiap baris memakai CSS grid, bukan `flex-wrap`, supaya tombol selalu mengisi
 * lebar kolomnya. Dengan `flex-wrap` lebar tombol ikut panjang teks, jadi baris
 * berakhir dengan ruang kosong yang tidak rata — persis masalah yang membuat
 * area aksi terasa mengambang.
 *
 * .mobile: dua kolom (Cek WA / Setujui, Tolak melebar penuh), lalu toggle +
 *          Lihat / Sunting + hapus ikon, lalu tombol unggulan melebar penuh
 * .sm+   : tiga kolom untuk moderasi dan satu baris empat untuk navigasi,
 *          jarak dan ukuran huruf tombol ikut naik
 *
 * Komponen ini murni presentasi: handler, disabled state, dan urutan tombol
 * datang dari halaman Admin sehingga logika mutasi tetap satu sumber.
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
  /** Sama dengan return type `whatsappHref`: `undefined` bila nomor tidak valid. */
  waHref: ReturnType<typeof whatsappHref>;
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
      {/* Baris 1 — moderasi. Di bawah `sm` tiga tombol bertumpuk jadi dua kolom
          dengan tombol ketiga melebar penuh, karena 360px tidak cukup untuk icon
          + teks di tiga kolom. Di `lg` (kolom aksi kartu sempit) tombol tengah
          memakai track `1fr` sementara dua lainnya ikut konten, jadi "Setujui"
          yang paling lebar dapat sisa ruang tanpa membungkus teks. */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
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
          className="admin-btn admin-btn-danger col-span-2 w-full min-w-0 px-2 sm:col-span-1 sm:px-3"
        >
          <X className="size-4 shrink-0" />
          Tolak
        </button>
      </div>

      {/* Baris 2 — navigasi + status listing.

          Dua layout, dipilih dari lebar area aksi yang benar-benar tersedia:
          - sempit (mobile <640 dan kolom aksi kartu di `lg+`): DUA baris —
            toggle + Lihat/status, lalu Sunting + hapus. Label "Tidak tayang"
            duduk di track `auto` (ikut konten) sehingga tidak pernah tertekan
            jadi dua baris, berapa pun lebarnya kolom.
          - luas (`sm`–`lg`, saat area aksi memakai lebar penuh kartu): SATU
            baris empat — toggle sesuai lebar naturalnya, tombol hapis ikon
            tetap 48px di kanan, Lihat + Sunting membagi sisa ruang. */}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-1.5 border-t-2 border-[#121212] pt-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <label className="inline-flex min-h-12 items-center gap-2 border-2 border-[#121212] bg-[#F5F0E5] px-2">
          <span className="text-xs font-black sm:text-sm">Aktif</span>
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
        {isActive ? (
          <Link
            to={`/v/${item.slug}`}
            className="admin-btn admin-btn-secondary w-full min-w-0 gap-1 px-2 text-sm sm:gap-2 sm:px-3 sm:text-base"
          >
            <ArrowUpRight className="hidden size-4 shrink-0 sm:block" />
            Lihat
          </Link>
        ) : (
          <span className="inline-flex min-h-12 w-full items-center justify-center border-2 border-[#121212] bg-[#E7E5E4] px-2 text-center text-sm font-black text-[#525252]">
            Tidak tayang
          </span>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="admin-btn admin-btn-secondary w-full min-w-0 gap-1 px-2 text-sm sm:gap-2 sm:px-3 sm:text-base"
        >
          <Pencil className="hidden size-4 shrink-0 sm:block" />
          Sunting
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

      {/* Baris 3 — status unggulan. Sendiri di bawah, melebar penuh. */}
      <div className="mt-2">
        <button
          type="button"
          onClick={onToggleFeatured}
          disabled={busyAction === `${itemBusyPrefix}featured`}
          className={`admin-btn w-full gap-2 px-2 sm:px-3 ${item.featured ? "admin-btn-highlight" : "admin-btn-secondary"}`}
        >
          <Sparkles className="size-4 shrink-0" />
          {item.featured ? "Jadikan biasa" : "Jadikan unggulan"}
        </button>
      </div>
    </>
  );
}

