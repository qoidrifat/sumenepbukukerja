import { Skeleton } from "@/components/ui/skeleton";

/**
 * FASE 9.1 - PEKERJAAN 5: satu bentuk "sedang memuat" untuk seluruh admin.
 *
 * SEBELUMNYA ada lima status memuat yang masing-masing menulis baris teks
 * sendiri: "Memuat audit log...", "Memuat laporan error...", "Memuat
 * ringkasan...", "Memuat data area...", "Memuat konteks sesi...". Semuanya
 * diganti seluruh panel dengan satu baris, padahal isinya bisa tujuh sampai
 * dua puluh baris. Akibatnya panel melompat begitu data datang, dan
 * pengelola yang sedang memindai dengan mata tertinggal beberapa baris.
 *
 * Yang DIPERBAIKI di sini adalah bentuk, bukan kata-katanya. Pola ini sudah
 * dipakai `AdminQueueEmptyState` di `admin-governance.tsx` untuk keadaan
 * "antrean kosong"; file ini adalah pasangan Loading-nya, supaya satu panel
 * punya satu bahasa.
 *
 * AKSESIBILITAS - dua hal yang sering terbalik:
 *  - Placeholder diberi `aria-hidden`, karena "kotak abu-abu" bukan informasi.
 *    Kalau tidak disembunyikan, pembaca layar membacakan enam elemen kosong
 *    di awal setiap pemuatan, dan itu lebih buruk daripada tidak ada apa-apa.
 *  - Teks status yang SEBENARNYAuseful tetap ada di panel masing-masing
 *    (yang punya `role="status"`). Tulisan ini murni susun_ATAS.
 *
 * `prefers-reduced-motion` tidak perlu ditangani di sini: `Skeleton` memakai
 * animasi denyut dari Tailwind, dan `animate-pulse` sudah dihormati oleh
 * prefers-reduced-motion di build ini. Kalau nanti berubah, ubah di
 * `ui/skeleton.tsx` satu kali, bukan di lima tempat.
 */

type Variant = "list" | "detail";

export function AdminLoadingSkeleton({
  label,
  variant = "list",
  rows = 4,
  className = "",
}: {
  /**
   * Pesan status yang DIWUJIBKAN. Ini bukan aksesoris.
   *
   * Regression test `admin-audit-log.test.ts` menangkap kalau pesan ini
   * hilang, dan itu benar: yang dilindungi adalah pemakai yang butuh tahu
   * panel sedang memuat, bukan sekadar bentuknya. Karena itu placeholder
   * disembunyikan dari pembaca layar, tapi pesannya tidak. Hapus props ini
   * dan test akan gagal - itu memang abstinence yang disengaja.
   *
   * Teksnya memakai kalimat yang sama seperti sebelumnya, supaya tidak ada
   * perubahan copy yang tidak disengaja.
   */
  label: string;
  variant?: Variant;
  /** Jumlah baris placeholder. Default kecil supaya panel tidak melompat jauh. */
  rows?: number;
  className?: string;
}) {
  const status = (
    <p role="status" className="mt-3 text-sm font-bold text-[#525252]">
      {label}
    </p>
  );
  if (variant === "detail") {
    return (
      <>
        {status}
        <div className={`mt-2 space-y-2 ${className}`} aria-hidden="true">
        {[70, 90, 55, 80].map((width, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-4 w-28 shrink-0" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${width}%` }} />
          </div>
        ))}
        </div>
      </>
    );
  }
  return (
    <>
      {status}
      <div className={`mt-2 space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-1.5 border-2 border-[#EDEAE0] p-3">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
      </div>
    </>
  );
}
