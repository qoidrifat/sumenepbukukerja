/**
 * Cincin fokus yang seragam untuk semua kontrol interaktif.
 *
 * Kenapa berkas ini ada, dan kenapa bukan di dalam komponen:
 *
 *  - Nilai ini bukan gaya, melainkan kontrak aksesibilitas. Tanpa cincin
 *    fokus, pengguna keyboard dan pembaca layar kehilangan penanda posisi
 *    kursor. Karena itu isinya harus BERBEDA-SATI di seluruh aplikasi: satu
 *    salinan per berkas adalah cara paling halus untuk membuat cincin fokus
 *    di satu sudut lebih tipis dari yang di sudut lain.
 *
 *  - Semula nilai ini hidup di `src/components/display-controls.tsx` sebagai
 *    exports samping dari komponen "Teks besar"/"Kontras". Kedua tombol itu
 *    sudah dihapus dari antarmuka, jadi berkas komponennya hilang; kalau
 *    cincin fokus ikut hilang bersamanya, tiga modul yang memakainya ikut
 *    rusak. Pindah ke `src/lib` memisahkannya dari siklus hidup komponen:
 *    ini string konstanta, bukan JSX.
 *
 * Importir saat ini: `community-widgets.tsx`, `community-notification-center.tsx`,
 * `display-name-field.tsx`, `Landing.tsx`, `VendorProfile.tsx`,
 * `error-report-dialog.tsx`, dan `site-footer.tsx`.
 * `src/components/display-mode-decision.test.ts` menjaga agar salinan ini
 * tetap dipakai bersama, bukan diduplikasi diam-diam.
 */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

/**
 * Varian untuk permukaan gelap (footer, blok navy). Cincin biru dengan offset
 * putih hampir tidak terlihat di atas slate-950, jadi cincinnya ikut terang
 * dan offset-nya ikut gelap. Bedanya hanya warna; ketebalan dan radiusnya sama,
 * supaya keduanya tetap terasa sebagai satu keluarga.
 */
export const focusRingGelap =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";