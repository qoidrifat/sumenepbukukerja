import { type ElementType, type ReactNode, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Inbox,
  LogOut,
  MessageCircle,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type VendorRecord } from "@/lib/catalog-store";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { AdminProfile } from "@/components/admin-profile";
import { AdminLogoutConfirm } from "@/components/admin-logout-button";
import { OWNER_SHORT_TITLE } from "@/lib/owner-account";

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

/**
 * Header ruang pengelola.
 *
 * Bentuknya ditentukan oleh layar yang paling sempit, bukan yang paling
 * lebar. Di Android, header lama berisi lima hal sekaligus: tombol kembali
 * ke katalog yang selebar separuh layar, logo, dua baris judul, kotak peran,
 * dan tombol profil. Semuanya berebut ruang yang sama, jadi yang
 * pertama terpangkas adalah kotak peran - informasi yang justru paling
 * penting untuk pengelola tahu hak aksesnya apa.
 *
 * Tiga aturan yang dipakai di sini:
 *  1. hanya ada dua kelompok: identitas di kiri (logo, judul, peran) dan
 *     kendali di kanan (antrean review, menu). Tidak ada tombol Beranda di
 *     header; ia pindah ke menu, karena satu tombol selebar setengah layar
 *     untuk satu tujuan saja adalah tempat yang paling mahal.
 *  2. Kotak peran memakai `shrink-0` supaya tidak pernah gepeng, dan judul
 *     yang boleh dipangkas - dia punya `truncate`, kotak peran tidak.
 *  3. Menu dirender DI DALAM header, bukan lewat portal. Portal berada di
 *     luar `.admin-workspace`, jadi panel di dalamnya harus dicakup satu
 *     per satu; dengan tetap di dalam, seluruh tema admin berlaku otomatis.
 */
export function AdminHeader({
  role = "admin",
  isOwner = false,
  accountName,
  reviewQueue,
}: {
  role?: string;
  /** Dari `users.currentAccess`, bukan ditebak di klien. */
  isOwner?: boolean;
  accountName?: string | null;
  reviewQueue?: { claims: number; photos: number; reports: number; total: number };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Konfirmasi keluar hidup di luar `AnimatePresence`. Panel menu harus dilepas
  // begitu item dipilih supaya tidak menutupi dialog, dan kalau dialognya ikut
  // terpasang di dalam panel itu, konfirmasi tidak akan pernah terlihat.
  const [logoutOpen, setLogoutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const reduceMotion = useReducedMotion();

  // Panel menutup saat diklik di luar dan saat Escape, dengan fokus dikembalikan
  // ke pemicunya. Tanpa dua hal itu, menu yang terbuka di ponsel tetap
  // menggantung di layar dan menutupi isi panel tanpa ada yang memicunya.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const roleLabel = isOwner
    ? OWNER_SHORT_TITLE
    : role === "admin"
      ? "Admin"
      : role === "staff"
        ? "Staff"
        : "Viewer";

  return (
    <header className="sticky top-0 z-40 border-b-2 border-[#121212] bg-[#FAF7EE] pt-[env(safe-area-inset-top)]">
      <div className="admin-shell-frame mx-auto flex min-h-16 max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-10">
        {/* Identitas: semua orang menumpuk ke sisi kiri. */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <img
            src="/brand/logo-mark.svg"
            alt=""
            width={40}
            height={40}
            className="size-9 shrink-0 rounded-[2px] border-2 border-[#121212] bg-white object-contain shadow-[2px_2px_0_#121212] sm:size-10"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase tracking-[-0.035em] text-[#1A1A1A] sm:text-lg">
              Sumenep Buku Kerja
            </p>
            <p className="truncate text-xs font-bold text-[#525252] sm:text-sm">
              Ruang pengelola
            </p>
          </div>
          <span className="admin-status admin-status-confirmed ml-1 shrink-0 text-xs sm:text-sm">
            <span className="mr-1.5 size-2 rounded-full bg-[#1A1A1A]" aria-hidden="true" />
            {roleLabel}
          </span>
        </div>

        {/* Kendali: satu kelompok, tidak ditulis ke seluruh lebar. */}
        <div className="relative flex shrink-0 items-center gap-2" ref={menuRef}>
          {reviewQueue && reviewQueue.total > 0 ? (
            <a
              href="#governance-title"
              aria-label="Lompat ke panel Governance untuk menangani antrean review"
              className="admin-status shrink-0 border-[#121212] bg-[#FF5A26] text-xs text-white sm:text-sm"
              title={`${reviewQueue.claims} klaim · ${reviewQueue.photos} foto · ${reviewQueue.reports} laporan menunggu ditinjau`}
            >
              <Inbox className="mr-1.5 size-4" aria-hidden="true" />
              {reviewQueue.total}
              <span className="hidden sm:inline"> perlu direview</span>
              <span className="sr-only">
                : {reviewQueue.claims} klaim listing, {reviewQueue.photos} foto,{" "}
                {reviewQueue.reports} laporan
              </span>
            </a>
          ) : null}

          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="admin-icon-btn"
            aria-label={menuOpen ? "Tutup menu ruang pengelola" : "Buka menu ruang pengelola"}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="admin-workspace-menu"
          >
            <span className="admin-menu-icon" data-open={menuOpen} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                id="admin-workspace-menu"
                role="menu"
                aria-label="Menu ruang pengelola"
                className="admin-menu"
                initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 32, mass: 0.7 }
                }
              >
                <p className="admin-menu-head">
                  {isOwner ? OWNER_SHORT_TITLE : roleLabel}
                  {accountName ? ` · ${accountName}` : ""}
                </p>
                <Link
                  to="/"
                  role="menuitem"
                  className="admin-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <ArrowLeft className="size-5 shrink-0" aria-hidden="true" />
                  Beranda
                </Link>
                <AdminProfile variant="menu" onOpenChange={setMenuOpen} />
                <div className="admin-menu-separator" aria-hidden="true" />
                <button
                  type="button"
                  role="menuitem"
                  className="admin-menu-item admin-menu-item-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setLogoutOpen(true);
                  }}
                >
                  <LogOut className="size-5 shrink-0" aria-hidden="true" />
                  Keluar
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <AdminLogoutConfirm open={logoutOpen} onOpenChange={setLogoutOpen} />
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

