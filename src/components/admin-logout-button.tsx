import { useId, useState } from "react";
import { Loader2, LogOut, TriangleAlert } from "lucide-react";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AdminDialogContent } from "@/components/admin-dialog";
import { useAdminLogout } from "@/lib/admin-logout";

/**
 * Satu-satunya jalan keluar dari ruang admin, lengkap dengan konfirmasi.
 *
 * Kenapa konfirmasi itu wajib, bukan sekadar ramah:
 *
 *  1. Tombolnya berada di MENU HEADER, satu sentuhan dari mana saja. Tanpa
 *     konfirmasi, satu getar tidak sengaja saat sedang membaca Security Desk
 *     langsung menutup ruang kerja.
 *  2. Keluar bukan sekadar pindah halaman. `logoutAdmin` mencabut sesi di
 *     server, jadi untuk kembali orang harus mengetik passcode DAN email lagi.
 *     Kehilangan sesi itu tidak bisa dipulihkan dengan tombol "kembali".
 *  3. Sebagian besar yang keluar sedang mengerjakan sesuatu. Isian yang belum
 *     disimpan hilang bersama halamannya.
 *
 * Kenapa dialognya dipisah dari tombolnya. Panel menu ikut dilepas begitu
 * item dipilih, karena panel itu akan menutupi dialog bila masih terbuka.
 * Kalau tombol dan dialognya satu komponen, melepas panel itu juga melepas
 * dialognya, lalu konfirmasi tidak pernah tampil sama sekali.
 *
 * Dua pintu masuk, bukan dua implementasi. `AdminLogoutConfirm` dipakai
 * langsung oleh header, `AdminLogoutButton` untuk tombol biasa. Keduanya
 * memanggil `useAdminLogout`, jadi tidak ada jalan keluar kedua yang bisa
 * berbeda satu langkah saja.
 */

/** Isi konfirmasi. Dipasang terpisah dari pemicunya; lihat catatan di atas. */
export function AdminLogoutConfirm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { logoutAdmin, logoutBusy, logoutFailed } = useAdminLogout();
  const titleId = useId();
  const descriptionId = useId();

  const confirm = async () => {
    const ok = await logoutAdmin();
    // Sukses selalu berakhir di redirect, jadi tidak ada yang perlu ditutup.
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (logoutBusy ? undefined : onOpenChange(next))}
    >
      <AdminDialogContent aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="border-b-2 border-[#121212] bg-[#FFE662] px-4 py-4 sm:px-5">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#525252]">
            Keamanan ruang admin
          </p>
          <DialogTitle id={titleId} className="mt-1 text-xl font-black text-[#121212]">
            Anda yakin ingin mengakhiri sesi ini?
          </DialogTitle>
          <DialogDescription
            id={descriptionId}
            className="mt-2 text-sm leading-6 text-[#1A1A1A]"
          >
            Sesi di perangkat ini akan dicabut di server, bukan sekadar dipindahkan
            halaman. Untuk membuka ruang admin lagi, Anda harus mengetik passcode
            dan memverifikasi email dari awal. Sesi di perangkat lain milik Anda
            tidak tersentuh.
          </DialogDescription>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <p className="flex items-start gap-2 border-2 border-[#121212] bg-[#E9B4A7] px-3 py-2 text-sm font-bold text-[#7C2D12]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Apa pun yang sudah Anda isikan ke formulir tetapi belum disimpan akan
            hilang bersama halaman ini.
          </p>

          {logoutFailed ? (
            <p
              className="mt-3 border-2 border-[#121212] bg-white px-3 py-2 text-sm font-black text-[#7C2D12]"
              role="alert"
            >
              Sesi tidak dapat dicabut. Coba lagi sebentar.
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={logoutBusy}
              className="admin-btn admin-btn-secondary order-2 w-full sm:order-1 sm:w-auto"
            >
              Batal, lanjut bekerja
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={logoutBusy}
              className="admin-btn admin-btn-danger order-1 w-full sm:order-2 sm:w-auto"
            >
              {logoutBusy ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="size-5" aria-hidden="true" />
              )}
              {logoutBusy ? "Mengakhiri sesi..." : "Ya, akhiri sesi ini"}
            </button>
          </div>
        </div>
      </AdminDialogContent>
    </Dialog>
  );
}

/**
 * Tombol keluar lengkap dengan konfirmasinya, untuk tempat yang tombolnya
 * tidak perlu dilepas dari DOM (panel Sesi Anda).
 */
export function AdminLogoutButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="admin-btn admin-btn-danger inline-flex min-h-12"
        onClick={() => setOpen(true)}
      >
        <LogOut className="size-5" aria-hidden="true" />
        Keluar dari ruang admin
      </button>
      <AdminLogoutConfirm open={open} onOpenChange={setOpen} />
    </>
  );
}
