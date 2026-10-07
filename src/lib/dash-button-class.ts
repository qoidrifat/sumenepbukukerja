import { cn } from "@/lib/utils";

/**
 * Kelas tombol premium untuk Ruang Warga dan Ruang Mitra.
 *
 * Kenapa di `src/lib`, bukan diekspor dari `dashboard-ui.tsx`: berkas itu
 * hanya berisi komponen, dan satu export fungsi di dalamnya mematikan
 * Fast Refresh untuk seluruh berkas - setiap suntingan pada panel atau
 * kartu metrik akan memuat ulang halaman alih-alih memperbarui komponennya.
 * Pola yang sama sudah dipakai `focus-ring.ts`.
 *
 * Varian ini ada supaya tautan `Link` dan tombol `<button>` memakai bentuk
 * yang benar-benar sama. Tanpa itu, aksi "Tambah listing" berupa tombol dan
 * "Lihat katalog" berupa tautan akan perlahan berbeda tinggi dan sudutnya.
 */
export type DashButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function dashButtonClass(variant: DashButtonVariant = "primary", extra?: string) {
  return cn("dash-btn", `dash-btn--${variant}`, extra);
}
