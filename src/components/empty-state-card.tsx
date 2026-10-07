import { BrandMascot } from "@/components/brand-mascot";
import { dashButtonClass } from "@/lib/dash-button-class";

/**
 * Filled-state seragam untuk kedua dashboard: judul, kalimat ajakan, dan satu
 * aksi primer di dalam bingkai setinggi kartu yang berisi.
 *
 * Catatan yang gampang hilang saat berkas ini disentuh lagi: `bg-white` di
 * elemen pembungkus BUKAN sisa gaya lama. §8b `public/brand/mascot-spec.md`
 * hanya mengizinkan sekumpulan latar untuk BrandMascot, dan
 * `mascot-placement.test.ts` membaca latar itu sebagai token `bg-*` terakhir
 * sebelum call-site maskot di berkas ini. Menghapus `bg-white` membuat
 * latar maskot terbaca sebagai string kosong dan kontraknya gagal.
 * Warnanya sama dengan permukaan `.dash-panel`, jadi tidak ada perubahan
 * tampilan - yang dijaga adalah keterbacaan kontraknya.
 */
export function EmptyStateCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="dash-panel flex h-full flex-col items-center justify-center bg-white px-6 py-10 text-center sm:px-8 sm:py-12">
      <BrandMascot state="empty" size="md" animated={false} className="mx-auto" />
      <p className="dash-title mt-5 text-lg">{title}</p>
      <p className="dash-sub mt-2 max-w-sm text-sm">{body}</p>
      <button type="button" onClick={onAction} className={dashButtonClass("primary", "mt-5")}>
        {actionLabel}
      </button>
    </div>
  );
}
