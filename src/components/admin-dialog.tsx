import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AdminDialogContentProps = React.ComponentProps<typeof DialogContent>;

/**
 * Dialog admin - satu pintu masuk untuk semua pop-up di ruang pengelola.
 *
 * Ada dua alasan komponen ini ada, dan keduanya bisa dibuktikan.
 *
 * 1. TEMA. `DialogContent` dirender lewat portal Radix ke `document.body`, jadi
 *    ia berada DI LUAR `.admin-workspace` dan tidak mewarisi satu pun aturan
 *    admin. Menulis `className="admin-dialog-content"` di tiga tempat berarti
 *    tiga tempat yang bisa lupa. Di sini scope-nya melekat pada komponennya:
 *    memakai `AdminDialogContent` otomatis sudah bertema admin, dan test bisa
 *    memverifikasi seluruh dialog dengan satu IMPORT.
 *
 * 2. ANDROID - DIALOG YANG MENUTUP DIRI SENDIRI. Gejalanya nyata dan hanya
 *    muncul di Android: menekan menu Profil, dialog terbuka, lalu hilang
 *    sendiri tanpa pengguna menyentuh Tutup, Escape, atau latarnya.
 *
 *    Catatan koreksi, karena versi catatan ini sebelumnya menyalahkan
 *    keyboard Android dan itu SALAH. Penyebab sebenarnya ada di luar dialog
 *    ini, di tiga hal yang semuanya ada di `admin-workspace.tsx`:
 *
 *      a. Dialog profil dirender DI DALAM panel menu. Begitu panel menutup,
 *         `AnimatePresence` mencabut dialog itu beserta portalnya.
 *      b. Klik pada pemicunya sendiri yang menutup panel, di handler yang
 *         sama yang membuka dialog. Jadi dialog tidak pernah punya alasan
 *         untuk tetap hidup - ia mati bersama animasi keluar panel, tanpa
 *         menunggu ketukan apa pun.
 *      c. Dialog dirender lewat portal ke `document.body`, sehingga isinya
 *         berada DI LUAR header. Penutup menu berbasis `pointerdown` milik
 *         header membaca setiap ketukan di dalam dialog sebagai "di luar".
 *
 *    (a) dan (b) juga menjelaskan desktop, dan sebenarnya menjelaskan
 *    kedua device: dialog hanya hidup selama animasi keluar panel, sementara
 *    animasi MASUK dialog sendiri berdurasi 200 ms. Durasinya nyaris sama,
 *    jadi dialog mati tepat ketika ia baru selesai memudar masuk. Komponen
 *    ini karena itu bukan penyebabnya, dan memperbaiki penjaga di sini saja
 *    tidak akan pernah menutup bug itu.
 *
 *    Tiga hal di bawah tetap dipertahankan, karena masing-masing menutup
 *    kelas bug tersendiri yang nyata pada dialog admin:
 *    - `onOpenAutoFocus` dibatalkan, lalu fokus diarahkan ke PANEL dialog,
 *      bukan ke isian. Efeknya keyboard tidak muncul sampai pengguna sendiri
 *      menyentuh isian yang memang ia tuju.
 *    - `onFocusOutside` dibatalkan, jadi pergeseran fokus karena keyboard
 *      tidak bisa menutup dialog.
 *    - `onInteractOutside` dibatalkan, jadi ketukan yang lolos ke lapisan
 *      luar saat keyboard sedang naik juga tidak menutupnya.
 *
 *    PENTING: ketiga penjaga di atas bekerja di DALAM Radix. Penutup menu di
 *    (c) adalah `document.addEventListener` terpisah milik komponen lain, dan
 *    tidak satu pun `preventDefault` di sini yang bisa mencegahnya.
 *
 *    Yang tersisa untuk menutup dialog adalah tombol Batal/Tutup dan tombol
 *    Escape, keduanya selalu ada. Menukar klik-di-luar dengan klik-tutup yang
 *    disengaja adalah harga yang sepadan untuk dialog yang bisa menutup diri.
 */
export function AdminDialogContent({
  className,
  showCloseButton = false,
  ...props
}: AdminDialogContentProps) {
  return (
    <DialogContent
      className={cn("admin-dialog-content", className)}
      overlayClassName="admin-dialog-overlay"
      showCloseButton={showCloseButton}
      data-admin-dialog=""
      onOpenAutoFocus={(event) => {
        // `currentTarget` dibaca sinkron: setelah handler selesai, React
        // sudah mengosongkan referensinya.
        const panel = event.currentTarget as HTMLElement | null;
        event.preventDefault();
        panel?.focus({ preventScroll: true });
      }}
      onFocusOutside={(event) => event.preventDefault()}
      onInteractOutside={(event) => event.preventDefault()}
      {...props}
    />
  );
}