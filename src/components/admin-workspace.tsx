import { type ElementType, type ReactNode, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Pencil,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Link, NavLink } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type VendorRecord } from "@/lib/catalog-store";
import { whatsappHref } from "@/lib/admin-workspace-helpers";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { AdminProfileDialog, AdminProfileTrigger } from "@/components/admin-profile";
import { AdminLogoutConfirm } from "@/components/admin-logout-button";
import {
  LiquidNav,
  LiquidItems,
  LiquidItem,
  LiquidDivider,
  useIsMobileLiquid,
} from "@/components/liquid-nav";
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

export type PendingConfirmation = {
  kind: "reject" | "delete";
  vendor: VendorRecord;
} | null;

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

/**
 * Header ruang pengelola — Liquid Glass Navigation.
 *
 * Desktop: floating pill di puncak viewport (mentok atas, jarak ~50px ke
 * konten). 5 fitur NavLink inline dengan sliding active pill; akun di ujung
 * kanan.
 *
 * Mobile (≤767px): bar FIX di BOTTOM layar (seperti BottomNav publik),
 * ikon + label kecil, safe-area aware. Akun tetap bisa diakses.
 *
 * Menu dropdown (Beranda · Profil · Keluar) tetap di dalam header, bukan
 * portal, supaya tema admin berlaku otomatis.
 */
export function AdminHeader({
  role = "admin",
  isOwner = false,
  accountName,
  accountImageUrl,
  reviewQueue,
}: {
  role?: string;
  isOwner?: boolean;
  accountName?: string | null;
  accountImageUrl?: string | null;
  reviewQueue?: { claims: number; photos: number; reports: number; total: number };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemsRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  const accountInitials = (accountName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (target instanceof Element && target.closest("[data-admin-dialog]")) {
        return;
      }
      if (!menuRef.current?.contains(target)) setMenuOpen(false);
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

  const featureNav = [
    { to: "/admin", label: "Ringkasan", icon: LayoutDashboard, end: true },
    { to: "/admin/katalog", label: "Katalog", icon: Store, end: false },
    { to: "/admin/moderasi", label: "Moderasi", icon: Inbox, end: false },
    { to: "/admin/keamanan", label: "Keamanan", icon: ShieldCheck, end: false },
    { to: "/admin/sistem", label: "Sistem", icon: BarChart3, end: false },
  ] as const;

  const modQueueBadge =
    reviewQueue && reviewQueue.total > 0 ? reviewQueue.total : undefined;

  const isMobile = useIsMobileLiquid();

  return (
    <>
      {/* Desktop (≥721px): floating pill sticky di puncak, tengah horizontal.
          Mobile (≤720px): fixed di BOTTOM layar, lebar penuh, safe-area. */}
      <header className="liquid-bottom-wrap sticky top-0 z-40 flex justify-center px-3 pt-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] max-[720px]:fixed max-[720px]:inset-x-0 max-[720px]:bottom-0 max-[720px]:top-auto max-[720px]:px-2 max-[720px]:pt-1">
        <LiquidNav ariaLabel="Navigasi ruang pengelola" className="relative w-full max-w-[640px]">
          <LiquidItems containerRef={itemsRef}>
            {featureNav.map((item) => {
              const Icon = item.icon;
              const badge = item.to === "/admin/moderasi" ? modQueueBadge : undefined;
              return (
                <LiquidItem
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  icon={Icon}
                  label={item.label}
                  badge={badge}
                  title={item.label}
                />
              );
            })}
          </LiquidItems>

          <LiquidDivider />

          {/* Trigger akun + dropdown/dropup */}
          <div className="liquid-dropdown-wrap" ref={menuRef}>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="liquid-acct"
              aria-label={menuOpen ? "Tutup menu akun" : "Buka menu akun"}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls="admin-workspace-menu"
            >
              <span className="liquid-avatar">
                {accountImageUrl ? (
                  <img src={accountImageUrl} alt="" />
                ) : (
                  accountInitials || <UserRound className="size-4" aria-hidden />
                )}
              </span>
              {!isMobile && (
                <span className="liquid-acct-name">{accountName || roleLabel}</span>
              )}
              <svg
                className="liquid-chev"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <AnimatePresence>
              {menuOpen ? (
                <motion.div
                  id="admin-workspace-menu"
                  role="menu"
                  aria-label="Menu akun"
                  className={`liquid-dropdown${isMobile ? " liquid-dropdown--up" : ""}`}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: isMobile ? 6 : -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: isMobile ? 4 : -4 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 32, mass: 0.7 }
                  }
                >
                  <p className="liquid-dd-head">
                    {isOwner ? OWNER_SHORT_TITLE : roleLabel}
                    {accountName ? ` · ${accountName}` : ""}
                  </p>
                  {featureNav.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        role="menuitem"
                        className="liquid-dd-item"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Icon aria-hidden />
                        {item.label}
                      </NavLink>
                    );
                  })}
                  <div className="liquid-dd-sep" aria-hidden="true" />
                  <Link
                    to="/"
                    role="menuitem"
                    className="liquid-dd-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <ArrowLeft aria-hidden />
                    Beranda
                  </Link>
                  <AdminProfileTrigger
                    variant="menu"
                    onOpen={() => {
                      setMenuOpen(false);
                      setProfileOpen(true);
                    }}
                  />
                  <div className="liquid-dd-sep" aria-hidden="true" />
                  <button
                    type="button"
                    role="menuitem"
                    className="liquid-dd-item liquid-dd-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      setLogoutOpen(true);
                    }}
                  >
                    <LogOut aria-hidden />
                    Keluar
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </LiquidNav>
      </header>

      <AdminProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <AdminLogoutConfirm open={logoutOpen} onOpenChange={setLogoutOpen} />
    </>
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

