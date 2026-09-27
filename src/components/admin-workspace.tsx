import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useState, type ElementType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Inbox, Package, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";
import {
  useCatalogActions,
  useVendorPackages,
  type VendorPackage,
  type VendorRecord,
} from "@/lib/catalog-store";

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

