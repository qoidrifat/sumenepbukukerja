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
 *    muncul di Android: menekan menu Profil, dialog terbuka, keyboard
 *    langsung muncul, lalu dialog menutup di detik yang sama.
 *
 *    Rantainya: Radix memfokuskan elemen tabbable pertama saat dialog dibuka,
 *    yaitu isian teks. Di Android, memfokuskan isian itu memunculkan keyboard
 *    yang mengubah tinggi viewport, sehingga layout dialog digeser. FocusScope
 *    membaca pergeseran itu sebagai "fokus keluar" - yang oleh Radix
 *    diperlakukan sebagai interaksi di luar dialog, sehingga dialog ditutup.
 *    Di iOS dan desktop tidak terjadi karena keduanya tidak memunculkan
 *    keyboard otomatis dengan cara yang sama.
 *
 *    Tiga hal di bawah menutup semua jalurnya:
 *    - `onOpenAutoFocus` dibatalkan, lalu fokus diarahkan ke PANEL dialog,
 *      bukan ke isian. Efeknya keyboard tidak muncul sampai pengguna sendiri
 *      menyentuh isian yang memang ia tuju.
 *    - `onFocusOutside` dibatalkan, jadi pergeseran fokus karena keyboard
 *      tidak bisa menutup dialog.
 *    - `onInteractOutside` dibatalkan, jadi ketukan yang lolos ke lapisan
 *      luar saat keyboard sedang naik juga tidak menutupnya.
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