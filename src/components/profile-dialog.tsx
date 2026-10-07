import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Camera, Trash2, UserRound } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { staffRoleLongLabel } from "@/lib/select-options";
import {
  MAX_IMAGE_LABEL,
  formatBytes,
  uploadWithDedup,
} from "@/lib/image-upload";
import { focusRing } from "@/lib/focus-ring";
import { dashButtonClass } from "@/lib/dash-button-class";
import { publicInputClass } from "@/lib/public-field-classes";

/**
 * Pengaturan profil warga di tema publik.
 *
 * Logika state disalin dari dialog profil pengelola: isi-ulang-saat-render
 * lewat pola `wasOpen` (bukan `useEffect`), `pending` storage id,
 * `shaPending` + skip-query peta blob, `removePhoto` sebagai niat eksplisit,
 * `picked`, `error`/`notice`/`busy`, `fileRef`, `pickPhoto` via
 * `uploadWithDedup`, dan `save` via mutation profil.
 *
 * Hanya tampilannya yang berbeda: rangka `ui/dialog` dengan lapisan permukaan
 * `dash-dialog-content` (lihat komentar blok "Dialog warga & mitra" di
 * `index.css`) - jadi dialog ini memakai garis, sudut, dan bayangan yang sama
 * dengan kartu di Ruang Warga, bukan material bawaan shadcn.
 *
 * `open`/`onOpenChange` dikendalikan PEMANGGIL, bukan state internal,
 * supaya dialog boleh hidup di luar subtree yang bisa dicabut pemicunya.
 */
export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const profile = useQuery(api.users.myProfile, {});
  const updateProfile = useMutation(api.users.updateMyProfile);
  const generateUploadUrl = useMutation(api.users.generateProfileUploadUrl);
  const recordBlob = useMutation(api.storage.recordUploadedBlob);
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  // sha berkas yang dipilih, sementara menunggu jawaban peta blob.
  const [shaPending, setShaPending] = useState<string | null>(null);
  const lookupBlob = useQuery(
    // Peta blob hanya ditanya saat dibutuhkan — hook ini "skip" sampai
    // `shaPending` terisi oleh `pickPhoto`.
    api.storage.lookupBlobBySha,
    shaPending ? { sha256: shaPending } : "skip",
  );

  // "Hapus foto" adalah NIAT, bukan kesimpulan dari keadaan. Hanya aksi
  // eksplisit yang menyalakannya, supaya menyimpan dua kali tidak ikut
  // menghapus foto yang baru saja disimpan.
  const [removePhoto, setRemovePhoto] = useState(false);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameId = "profile-dialog-name";
  const hintId = "profile-dialog-hint";

  // Formulir diisi ulang tepat saat dialog DIBUKA. BUKAN `useEffect`:
  // render membandingkan `open` dengan nilai sebelumnya, dan bila berubah,
  // state disesuaikan SEKALI pada render yang sama. Tidak ada efek, tidak
  // ada render tambahan, dan tidak ada kedipan isi lama.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(profile?.name ?? "");
      setPending(null);
      setRemovePhoto(false);
      setPicked(null);
      setError("");
      setNotice("");
    }
  }

  const displayName = profile?.name?.trim() || profile?.email?.split("@")[0] || "Profil";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setNotice("");
    setShaPending(null);
    setPicked({ name: file.name, size: file.size });

    try {
      const result = await uploadWithDedup(file, {
        // Peta diperiksa lewat query di atas; kalau jawabannya belum sampai,
        // unggah biasa tetap jalan — dedup adalah optimasi, bukan gerbang.
        lookup: async ({ sha256 }) => {
          setShaPending(sha256);
          return lookupBlob ?? null;
        },
        record: async (args) => {
          await recordBlob(args);
          setShaPending(null);
        },
        generateUploadUrl: () => generateUploadUrl(),
      });
      setPending(result.storageId);
      setRemovePhoto(false);
      setPicked({ name: result.fileName, size: result.afterBytes });
      setNotice(
        result.reused
          ? "Foto identik sudah ada di server — tidak diunggah ulang. Siap disimpan."
          : result.resized
            ? `Foto diperkecil ${formatBytes(result.beforeBytes)} → ${formatBytes(result.afterBytes)}. Siap disimpan.`
            : "Foto baru siap disimpan. Tekan Simpan profil.",
      );
    } catch (caught) {
      setPending(null);
      setPicked(null);
      setShaPending(null);
      setError(caught instanceof Error ? caught.message : "Foto belum berhasil diunggah. Coba lagi.");
    }
  };

  const save = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await updateProfile({
        name,
        imageStorageId: pending ?? undefined,
        removeImage: removePhoto ? true : undefined,
      });
      setNotice("Profil tersimpan.");
      setPending(null);
      setRemovePhoto(false);
      setPicked(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profil belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="dash-dialog-overlay"
        className="dash-dialog-content max-w-[calc(100%-1.5rem)] sm:max-w-md"
      >
        {/* `pe` disengaja dipisah dari `ps` (bukan `px` + `pe`) supaya nilainya
            tidak ditimpa lagi oleh `sm:px-6` pada layar >=640px: aturan
            ber-`@media` selalu berada setelah utilitas dasar di stylesheet.
            Ruang 64px ini memberi tempat tombol tutup 44px milik primitif,
            tanpa itu deskripsi dua baris bisa tersambung di bawah tombolnya. */}
        <div className="border-b border-slate-200/70 py-4 ps-5 pe-16 sm:ps-6">
          <p className="dash-eyebrow">
            Akun
          </p>
          <DialogTitle className="dash-title mt-2 text-lg">
            Profil saya
          </DialogTitle>
          <DialogDescription id={hintId} className="dash-sub mt-1.5 text-sm">
            Nama dan foto profil tampil di ruang warga Anda.
            Email tidak bisa diubah di sini.
          </DialogDescription>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-200/60 bg-blue-50 text-xl font-extrabold text-blue-700">
              {profile?.imageUrl ? (
                <img src={profile.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                initials || <UserRound className="size-7" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <span className="dash-pill dash-pill--blue">
                {profile?.role ? staffRoleLongLabel(profile.role) : "Warga"}
              </span>
              <p className="dash-sub mt-1.5 break-all text-sm">{profile?.email}</p>
            </div>
          </div>

          <div>
            <label
              className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-slate-500"
              htmlFor={nameId}
            >
              Nama profil
            </label>
            <input
              id={nameId}
              className={`mt-1.5 ${publicInputClass}`}
              value={name}
              maxLength={80} // = MAX_PROFILE_NAME_length server
              onChange={(event) => setName(event.target.value)}
              placeholder="Nama yang tampil di ruang warga"
              aria-describedby={hintId}
            />
          </div>

          <div>
            <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Foto profil
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={dashButtonClass("secondary", focusRing)}
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="size-4" aria-hidden="true" />
                Pilih foto
              </button>
              {profile?.hasImage || pending ? (
                <button
                  type="button"
                  className={dashButtonClass("danger", focusRing)}
                  onClick={() => {
                    setPending(null);
                    setPicked(null);
                    setNotice("");
                    setError("");
                    setRemovePhoto(true);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Hapus foto
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Maksimal {MAX_IMAGE_LABEL}, berkas gambar. Foto disimpan di server
              dan hanya tautan sementara yang dikirim ke peramban.
            </p>
            {picked && pending ? (
              <p className="mt-2 break-all text-xs font-bold text-slate-500">
                {picked.name}, {formatBytes(picked.size)}, siap disimpan
              </p>
            ) : null}            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                void pickPhoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200/80 bg-red-50/80 px-3.5 py-2.5 text-sm font-bold text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3.5 py-2.5 text-sm font-bold text-emerald-800" role="status">
              {notice}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className={dashButtonClass("secondary", `order-2 w-full sm:order-1 sm:w-auto ${focusRing}`)}
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </button>
            <button
              type="button"
              className={dashButtonClass("primary", `order-1 w-full sm:order-2 sm:w-auto ${focusRing}`)}
              disabled={busy || name.trim().length < 2}
              onClick={() => void save()}
            >
              {busy ? "Menyimpan..." : "Simpan profil"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
