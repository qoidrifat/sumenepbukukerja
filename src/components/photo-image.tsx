import { useVendorPhoto } from "@/lib/catalog-store";

/**
 * Gambar galeri yang URL-nya di-resolve di detail (aturan 12).
 *
 * Daftar (`listVendorPhotos`, `listPhotosForModeration`) hanya membawa
 * `storageId`; URL bertanda tangan di-resolve di sini, per foto yang
 * benar-benar tampil, lewat resolver yang sama dengan foto sampul
 * (`vendors.getImageUrl`). Galeri yang belum dibuka tidak memakan pemanggilan
 * storage sama sekali.
 */
export function PhotoImage({ storageId, alt, className }: { storageId: string; alt: string; className?: string }) {
  const url = useVendorPhoto(storageId);
  return <img src={url ?? ""} alt={alt} className={className} loading="lazy" />;
}
