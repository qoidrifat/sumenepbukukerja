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

/**
 * Pengaturan profil pengelola.
 *
 * Tiga hal yang sengaja dibuat begitu:
 *  - Aturan ukuran dan jenis foto TIDAK ditulis di sini. Keduanya datang dari
 *    `@/lib/image-upload`, modul yang sama yang dipakai server — jadi
 *    peringatan di peramban dan penolakan di server tidak mungkin berbunyi
 *    berbeda untuk berkas yang sama.
 *  - Jenis dan ukuran yang MENGIKAT dibaca server dari metadata storage, bukan
 *    dari `File` di sisi klien. Nama berkas dan `type` bisa dipalsukan; metadata
 *    storage tidak. Pemeriksaan di peramban hanya untuk umpan balik instan.
 *  - Email sengaja tidak bisa diubah di sini. Mengganti email berarti reset
 *    password dan verifikasi ulang, jadi membukanya di panel profil hanya
 *    menciptakan akun yang tidak bisa masuk lagi.
 *
 * Dialog-nya memakai `admin-dialog-content`/`admin-dialog-overlay`, scope yang
 * sama dengan form passcode. Tanpa scope itu, seluruh kelas admin di dalamnya
 * tidak akan cocok — dialog akan tampil seperti komponen aplikasi lain di
 * tengah ruang yang serba Warm Brutalism.
 */

const MAX_NAME_LENGTH = 80;

/**
 * Pemicu pengaturan profil.
 *
 * Dua bentuk, satu dialog. `header` adalah tombol avatar yang lama; `menu`
 * adalah baris menu yang lebarnya penuh. Keduanya memanggil `openProfile`
 * yang sama persis, jadi tidak ada dua keadaan form yang bisa berbeda.
 *
 * `onOpenChange` dipakai pemanggil menu header untuk menutup panelnya sendiri
 * saat dialog dibuka. Tanpa itu, panel menu tetap menutupi separuh layar
 * di atas dialog yang baru terbuka.
 */
export function AdminProfile({
  variant = "header",
  onOpenChange,
}: {
  variant?: "header" | "menu";
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const profile = useQuery(api.users.myProfile, {});
  const updateProfile = useMutation(api.users.updateMyProfile);
  const generateUploadUrl = useMutation(api.users.generateProfileUploadUrl);
  const recordBlob = useMutation(api.storage.recordUploadedBlob);
  const [open, setOpen] = useState(false);
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

  // "Hapus foto" adalah NIAT, bukan kesimpulan dari keadaan. Sebelumnya niat
  // itu disimpulkan dari `!pending && profile?.hasImage` — dan begitu foto baru
  // selesai tersimpan, `hasImage` jadi true sementara `pending` sudah null,
  // sehingga menekan "Simpan profil" untuk kedua kalinya menghapus foto yang
  // baru saja disimpan. Sekarang hanya aksi eksplisit yang menyalakannya.
  const [removePhoto, setRemovePhoto] = useState(false);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameId = "admin-profile-name";
  const hintId = "admin-profile-hint";

  // Formulir diisi ulang tepat saat dialog DIBUKA, bukan lewat efek.
  // Efek yang memanggil setState secara sinkron dipanggil ulang dua kali
  // dalam render, dan yang kedua sering membuat panel berkedip.
  const openProfile = () => {
    setName(profile?.name ?? "");
    setPending(null);
    setRemovePhoto(false);
    setPicked(null);
    setError("");
    setNotice("");
    setOpen(true);
    onOpenChange?.(false);
  };

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
    <>
      {variant === "menu" ? (
        <button
          type="button"
          role="menuitem"
          onClick={openProfile}
          className="admin-menu-item"
          aria-label="Atur profil"
        >
          <UserRound className="size-5 shrink-0" aria-hidden="true" />
          Profil
        </button>
      ) : (
        <button
          type="button"
          onClick={openProfile}
          className="flex shrink-0 items-center gap-2 rounded-[2px] border-2 border-[#121212] bg-white px-2 py-1.5 shadow-[2px_2px_0_0_#121212] transition-transform hover:bg-[#FFE662] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A26]"
          aria-label="Atur profil"
          title="Atur profil"
        >
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-[2px] border-2 border-[#121212] bg-[#FFE662] text-xs font-black text-[#121212]">
            {profile?.imageUrl ? (
              <img src={profile.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              initials || <UserRound className="size-4" />
            )}
          </span>
          <UserRound className="size-5 shrink-0 text-[#121212]" aria-hidden="true" />
          <span className="hidden text-sm font-black text-[#1A1A1A] sm:inline">Profil</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="admin-dialog-content mx-auto"
          overlayClassName="admin-dialog-overlay"
          showCloseButton={false}
        >
          <div className="border-b-2 border-[#121212] bg-[#FFE662] px-4 py-4 sm:px-5">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#525252]">
              Akun pengelola
            </p>
            <DialogTitle className="mt-1 text-xl font-black text-[#121212]">
              Atur profil
            </DialogTitle>
            <DialogDescription id={hintId} className="mt-2 text-sm leading-6 text-[#1A1A1A]">
              Nama dan foto profil muncul di panel Sesi Anda dan di jejak audit.
              Email tidak bisa diubah di sini.
            </DialogDescription>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border-2 border-[#121212] bg-[#FFE662] text-xl font-black text-[#121212]">
                {profile?.imageUrl ? (
                  <img src={profile.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  initials || <UserRound className="size-7" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-[#1A1A1A]">
                  {profile?.role ? staffRoleLongLabel(profile.role) : "Pengelola"}
                </p>
                <p className="break-all text-sm text-[#525252]">{profile?.email}</p>
              </div>
            </div>

            <div>
              <label
                className="text-xs font-black uppercase tracking-[0.1em] text-[#525252]"
                htmlFor={nameId}
              >
                Nama profil
              </label>
              <input
                id={nameId}
                className="admin-input mt-1.5"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nama yang tampil di ruang kerja"
                aria-describedby={hintId}
              />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#525252]">
                Foto profil
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary px-3 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="size-4" aria-hidden="true" />
                  Pilih foto
                </button>
                {profile?.hasImage || pending ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn-quiet px-3 text-xs"
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
              <p className="mt-2 text-xs leading-5 text-[#525252]">
                Maksimal {MAX_IMAGE_LABEL}, berkas gambar. Foto disimpan di server
                dan hanya tautan sementara yang dikirim ke peramban.
              </p>
              {picked && pending ? (
                <p className="mt-2 break-all text-xs font-bold text-[#525252]">
                  {picked.name}, {formatBytes(picked.size)}, siap disimpan
                </p>
              ) : null}
              <input
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
              <p className="rounded-[2px] border-2 border-[#121212] bg-[#E9B4A7] px-3 py-2 text-sm font-black text-[#7C2D12]" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-[2px] border-2 border-[#121212] bg-[#DCEBD7] px-3 py-2 text-sm font-black text-[#24533A]" role="status">
                {notice}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="admin-btn admin-btn-secondary order-2 w-full sm:order-1 sm:w-auto"
                onClick={() => setOpen(false)}
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={busy || name.trim().length < 2}
                onClick={() => void save()}
                className="admin-btn admin-btn-primary order-1 w-full sm:order-2 sm:w-auto"
              >
                {busy ? "Menyimpan..." : "Simpan profil"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
