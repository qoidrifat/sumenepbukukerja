import { useEffect, useState } from "react";

/**
 * Kontrol tampilan yang bisa dijangkau siapa pun, bukan hanya dari satu widget.
 *
 * FASE 9.1 - MODERNISASI UI, PEKERJAAN 2
 *
 * SEBELUMNYA komponen ini hidup di dalam `community-widgets.tsx` (1131 baris)
 * dan hanya bisa ditemukan dengan menggali file itu. sekarang ia punya
 * alamat sendiri dan bisa dipasang di mana saja tanpa menarik satu widget
 * komunitas ikut terbawa.
 *
 * YANG SENGAJA TIDAK BERUBAH - dan ini yang mengikat:
 *  - Nama key localStorage: `sumenep-large-text` dan `sumenep-high-contrast`.
 *    Mengubahnya akan membuang preferensi setiap pengguna yang sudah
 *    menyimpannya, dan itu kehilangan data, bukan sekadar mengubah gaya.
 *  - Nama atribut di elemen `<html>`: `data-large-text` dan
 *    `data-high-contrast`, karena override-nya ada di `src/index.css`.
 *  - Perilaku awal: nilai dibaca dari localStorage SEBELUM render pertama
 *    (lazy initializer), supaya tidak ada kedipan layout saat halaman dimuat.
 *  - Label dan `aria-pressed` tetap sama, supaya pembaca layar announce
 *    status toggle dengan benar.
 *
 * KEPUTUSAN DESAIN TERCATAT: aplikasi ini TIDAK menawarkan dark mode.
 * Alasannya ada di `display-mode-decision.test.ts`: tidak ada blok token
 * `.dark`, tidak ada kode yang memasang kelas itu, dan palet maskot
 * (krem, kuning, oranye) tidak diremosi-kan ke gelap. Mode yang benar-benar
 * dipakai adalah dua mode aksesibilitas ini, berbasis atribut, di atas dasar
 * terang. Itu pilihan, bukan kelalaian - dan sekarang ada test yang
 * mengunci pilihannya.
 */

/**
 * Cincin fokus yang seragam untuk semua kontrol interaktif.
 *
 * Diekspor supaya `community-widgets.tsx` memakai string yang sama persis,
 * bukan salinan. Nilai ini bukan gaya: tanpa cincin fokus, pengguna keyboard
 * dan pembaca layar kehilangan penanda posisi kursor.
 */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

export function AccessibilityControls() {
  const [largeText, setLargeText] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("sumenep-large-text") === "true",
  );
  const [highContrast, setHighContrast] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("sumenep-high-contrast") === "true",
  );

  useEffect(() => {
    document.documentElement.dataset.largeText = largeText ? "true" : "false";
    document.documentElement.dataset.highContrast = highContrast ? "true" : "false";
    window.localStorage.setItem("sumenep-large-text", String(largeText));
    window.localStorage.setItem("sumenep-high-contrast", String(highContrast));
  }, [largeText, highContrast]);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Mode tampilan">
      <button
        type="button"
        aria-pressed={largeText}
        onClick={() => setLargeText((value) => !value)}
        className={`min-h-12 rounded-lg border px-3 text-sm font-extrabold ${focusRing} ${
          largeText ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"
        }`}
      >
        Teks besar
      </button>
      <button
        type="button"
        aria-pressed={highContrast}
        onClick={() => setHighContrast((value) => !value)}
        className={`min-h-12 rounded-lg border px-3 text-sm font-extrabold ${focusRing} ${
          highContrast ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"
        }`}
      >
        Kontras
      </button>
    </div>
  );
}
