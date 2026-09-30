/**
 * Panel paket di Ruang pengelola.
 *
 * Dipisah dari `admin-workspace.tsx` pada Fase 9.1 Pekerjaan 6. Alasannya
 * bukan ukuran file saja: paket punya alur sendiri (buat, ubah harga, hapus)
 * yang tidak menyentuh papan metrik, antrean moderasi, atau header. Kalau
 * satu file, perubahan di sini berselisih dengan perubahan di antrean.
 *
 * Tanpa perubahan perilaku: komponen, props, dan isi JSX dipindah apa adanya.
 */
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useState, type FormEvent } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { useCatalogActions, useVendorPackages, type VendorPackage } from "@/lib/catalog-store";

import { inputClass } from "./admin-workspace";

export function AdminPackageManager({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const packages = useVendorPackages(vendorId);
  const { createPackage, removePackage } = useCatalogActions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<VendorPackage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    try {
      await createPackage({
        vendorId: vendorId as never,
        name,
        description,
        price,
        duration: duration || undefined,
        area: area || undefined,
      });
      setName("");
      setDescription("");
      setPrice("");
      setDuration("");
      setArea("");
      setMessage("Paket baru ditambahkan.");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Paket belum dapat ditambahkan.",
      );
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removePackage({ id: pendingDelete._id as never });
      setMessage(`Paket ${pendingDelete.name} dihapus.`);
      setPendingDelete(null);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Paket belum dapat dihapus.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <details className="mt-3 border-2 border-[#121212] bg-[#F5F0E5]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-base font-black text-[#1A1A1A] hover:bg-[#FFE662]">
          <span className="inline-flex items-center gap-2">
            <Package className="size-5" />
            Kelola paket {vendorName}
          </span>
          <span className="text-sm font-bold text-[#525252]">
            {packages?.length ?? 0} paket
          </span>
        </summary>

        <div className="space-y-3 border-t-2 border-[#121212] p-3 sm:p-4">
          {packages?.map((item) => (
            <div
              key={item._id}
              className="flex items-start justify-between gap-3 border-2 border-[#121212] bg-white p-3"
            >
              <div className="min-w-0">
                <p className="font-black text-[#1A1A1A]">
                  {item.name} · {item.price}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#525252]">
                  {item.description}
                </p>
                <p className="mt-1 text-sm font-bold text-[#525252]">
                  {[item.duration, item.area].filter(Boolean).join(" · ") ||
                    "Cakupan belum dicantumkan"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(item)}
                className="admin-icon-btn shrink-0"
                aria-label={`Hapus paket ${item.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama paket"
              className={inputClass}
              required
            />
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Harga, contoh: Rp75.000"
              className={inputClass}
              required
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Deskripsi paket"
              rows={2}
              className={`${inputClass} sm:col-span-2`}
              required
            />
            <input
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder="Estimasi durasi"
              className={inputClass}
            />
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="Area layanan"
              className={inputClass}
            />
            <button
              type="submit"
              className="admin-btn admin-btn-primary sm:col-span-2"
            >
              <Plus className="size-5" />
              Simpan paket
            </button>
          </form>

          {message ? (
            <p className="text-sm font-bold text-[#1A1A1A]" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </details>

      <AlertDialogPrimitive.Root
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="admin-confirm-overlay" />
          <AlertDialogPrimitive.Content className="admin-confirm-content">
            <div className="border-b-2 border-[#121212] bg-[#FFE662] p-5">
              <AlertDialogPrimitive.Title className="text-[clamp(1.25rem,3vw,1.75rem)] font-black tracking-[-0.03em] text-[#1A1A1A]">
                Hapus paket ini?
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-2 text-base leading-7 text-[#1A1A1A]">
                Paket <strong>{pendingDelete?.name}</strong> akan dihapus dari
                listing {vendorName}. Tindakan ini tidak dapat dibatalkan.
              </AlertDialogPrimitive.Description>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <AlertDialogPrimitive.Cancel
                disabled={deleting}
                className="admin-btn admin-btn-secondary"
              >
                Batalkan
              </AlertDialogPrimitive.Cancel>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="admin-btn bg-[#E9B4A7] text-[#7C2D12]"
              >
                <Trash2 className="size-5" />
                {deleting ? "Menghapus..." : "Ya, hapus paket"}
              </button>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </>
  );
}
