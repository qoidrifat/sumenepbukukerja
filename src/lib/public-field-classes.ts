/**
 * Token gaya isian untuk area warga (publik, dashboard pemilik, widget
 * komunitas).
 *
 * Kenapa berkas sendiri, bukan di dalam berkas komponen:
 *
 * `community-widgets.tsx` dan `community-notification-center.tsx` sama-sama
 * membutuhkannya. Disimpan di dalam salah satunya berarti berkas komponen itu
 * juga meng-export nilai biasa, dan aturan `react-refresh/only-export-
 * components` akan menyala di sana karena isinya bukan lagi "komponen saja".
 * Pindah ke modul biasa, keduanya cukup mengimpor.
 *
 * `form-field.tsx` sengaja tidak memegang kelas ini. Modul itu mengatur tata
 * letak dan aksesibilitas; warna fokus tiap area adalah keputusan area itu.
 */

/** Isian teks area warga. `min-h-12` menjaga target sentuh di atas 44px. */
export const publicInputClass =
  "min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
