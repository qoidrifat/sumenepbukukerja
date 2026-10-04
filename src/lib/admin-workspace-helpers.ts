import { type VendorRecord } from "@/lib/catalog-store";

/*
 * Helper meja kerja admin, dipisah dari `admin-workspace.tsx`.
 *
 * ALASAN PEMISAHAN. Berkas itu mengekspor komponen (AdminHeader,
 * TimeStampLabel, Field, VendorActionArea) SEKALIGUS fungsi dan konstanta yang
 * bukan komponen. Aturan react-refresh menandai campuran itu karena Fast
 * Refresh tidak bisa menjamin batas modul saat satu berkas mengekspor
 * keduanya. Memindahkan sisi non-komponennya ke sini menyelesaikan akar
 * penyebabnya, bukan mematikan aturannya.
 *
 * Isinya tetap satu sumber: `Admin.tsx` mengimpor dari sini, dan
 * `admin-workspace.tsx` mengimpor balik satu-satunya yang masih dipakainya.
 */

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
 * Ini dipisah dari `statusFilters` karena dua hal yang berbeda. Filter status
 * di atas menjawab "seberapa dipercaya moderasi?", sementara antrean ini
 * menjawab "apa yang belum selesai?". Tanpa pemisahan itu, angka "Butuh
 * tindakan" di Ringkasan cepat tidak punya tujuan: tidak ada cara menyaring
 * meja triage ke listing yang draft, ke arsip, atau ke yang datanya belum
 * lengkap.
 */
export const queueFilters = [
  { value: "all", label: "Semua antrean" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Arsip" },
  { value: "incomplete", label: "Perlu dilengkapi" },
] as const;

export type QueueFilter = (typeof queueFilters)[number]["value"];

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
