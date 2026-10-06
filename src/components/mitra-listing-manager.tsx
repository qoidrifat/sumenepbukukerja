import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  Archive,
  ArrowRight,
  Edit3,
  ImagePlus,
  Package,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { FormField, TextField } from "@/components/form-field";
import {
  landmarkLabel,
  type Category,
  type Vendor,
} from "@/lib/catalog";
import {
  useCatalogActions,
  useImageUpload,
  useMyClaims,
  useOwnerVendors,
  useVendorPackages,
  type VendorRecord,
} from "@/lib/catalog-store";
import { CategoryMascot } from "@/components/category-mascot";
import { EmptyStateCard } from "@/components/empty-state-card";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  areaSelectOptions,
  availabilitySelectOptions,
  categorySelectOptions,
  type ThemedSelectOption,
} from "@/lib/select-options";
import {
  ClaimListingPanel,
  OwnerGalleryManager,
  OwnerListingHistory,
} from "@/components/community-widgets";
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  registerOfflineHandlers,
  useOfflineQueue,
} from "@/lib/offline-queue";

type OwnerAvailability = NonNullable<Vendor["availability"]>;

type OwnerDraft = {
  id?: string;
  name: string;
  category: Category;
  description: string;
  address: string;
  landmark: string;
  price: string;
  hours: string;
  phone: string;
  tagsText: string;
  status: "draft" | "active" | "archived";
  availability: OwnerAvailability;
  availabilityNote: string;
  nextAvailableAt: string;
  responseMinutes: string;
  serviceRadiusKm: string;
  photoId?: string;
};

const ownerInputClass =
  "min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

/**
 * Batas bawah "perkiraan tersedia lagi": waktu SEKARANG, dalam bentuk lokal.
 *
 * Field ini menjawab "kapan saya bisa dilayani lagi" — jawaban di masa lalu
 * tidak pernah masuk akal, dan tanpa batas bawah orang bisa menyimpan jam
 * 08.00 pagi yang sudah lewat. Pergeseran zona waktu dilakukan
 * eksplisit karena `toISOString()` selalu UTC.
 */
function minAvailableAtLocal(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * Balikan waktu yang tersimpan, dalam bahasa Indonesia.
 *
 * Sama seperti di form permintaan: kontrol `datetime-local` memakai lokalitas
 * perangkat, jadi isian `28/09/2026 18.30` bisa dibaca berbeda oleh orang
 * lain. Baris ini membuat apa yang benar-benar tersimpan terlihat.
 */
function formatDraftAvailability(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

const ownerStatusSelectOptions: ThemedSelectOption[] = [
  { value: "active", label: "Tayang" },
  { value: "draft", label: "Simpan sebagai draft" },
  { value: "archived", label: "Nonaktif" },
];

const emptyOwnerDraft = (): OwnerDraft => ({
  name: "",
  category: "Jasa Umum",
  description: "",
  address: "",
  landmark: "all",
  price: "",
  hours: "Setiap hari · 07.00–17.00",
  phone: "",
  tagsText: "",
  status: "active",
  availability: "available",
  availabilityNote: "",
  nextAvailableAt: "",
  responseMinutes: "60",
  serviceRadiusKm: "10",
});

const toDateTimeInput = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

const ownerDraftFromVendor = (vendor: VendorRecord): OwnerDraft => ({
  id: vendor._id,
  name: vendor.name,
  category: vendor.category,
  description: vendor.description,
  address: vendor.address,
  landmark: vendor.landmark,
  price: vendor.price,
  hours: vendor.hours,
  phone: vendor.phone,
  tagsText: vendor.tags.join(", "),
  status: vendor.status,
  availability: vendor.availability ?? "available",
  availabilityNote: vendor.availabilityNote ?? "",
  nextAvailableAt: toDateTimeInput(vendor.nextAvailableAt),
  responseMinutes: vendor.responseMinutes ? String(vendor.responseMinutes) : "",
  serviceRadiusKm: vendor.serviceRadiusKm ? String(vendor.serviceRadiusKm) : "",
  photoId: vendor.photoId,
});

const ownerListingPayload = (draft: OwnerDraft, photoId = draft.photoId) => ({
  name: draft.name.trim(),
  category: draft.category,
  description: draft.description.trim(),
  address: draft.address.trim(),
  landmark: draft.landmark,
  price: draft.price.trim(),
  hours: draft.hours.trim(),
  phone: draft.phone.replace(/\D/g, ""),
  tags: draft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
  status: draft.status,
  availability: draft.availability,
  availabilityNote: draft.availabilityNote.trim() || undefined,
  nextAvailableAt: draft.nextAvailableAt ? new Date(draft.nextAvailableAt).getTime() : undefined,
  responseMinutes: draft.responseMinutes ? Number(draft.responseMinutes) : undefined,
  serviceRadiusKm: draft.serviceRadiusKm ? Number(draft.serviceRadiusKm) : undefined,
  photoId,
});

function MitraPackageEditor({ vendorId }: { vendorId: string }) {
  const packages = useVendorPackages(vendorId);
  const { createPackage, removePackage } = useCatalogActions();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
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
      setMessage("Paket tersimpan dan langsung tampil di listing.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Paket belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex items-center gap-2">
        <Package className="size-5 text-blue-700" />
        <h3 className="font-black text-slate-950">Paket layanan</h3>
      </div>
      {packages === undefined ? (
        <p className="mt-3 text-sm font-semibold text-slate-600">Memuat paket...</p>
      ) : packages.length > 0 ? (
        <div className="mt-3 space-y-2">
          {packages.map((item) => (
            <div key={item._id} className="flex items-start justify-between gap-3 rounded-lg border border-blue-100 bg-white p-3">
              <div className="min-w-0">
                <p className="font-extrabold text-slate-950">{item.name} · {item.price}</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p>
                {(item.duration || item.area) ? (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {[item.duration, item.area].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Hapus paket ${item.name}?`)) return;
                  void removePackage({ id: item._id as never }).catch((caught) => {
                    setMessage(caught instanceof Error ? caught.message : "Paket belum dapat dihapus.");
                  });
                }}
                className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-extrabold text-red-700 hover:bg-red-50"
                aria-label={`Hapus paket ${item.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-600">Belum ada paket. Tambahkan harga dan cakupan agar warga lebih mudah memilih.</p>
      )}
      <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-2">
        <TextField label="Nama paket" value={name} onValueChange={setName} controlClassName={ownerInputClass} placeholder="Nama paket" required />
        <TextField label="Harga paket" value={price} onValueChange={setPrice} controlClassName={ownerInputClass} placeholder="Harga awal" required />
        <TextField as="textarea" rows={2} label="Deskripsi paket" value={description} onValueChange={setDescription} controlClassName={ownerInputClass} className="sm:col-span-2" required minLength={5} />
        <TextField label="Estimasi durasi paket" value={duration} onValueChange={setDuration} controlClassName={ownerInputClass} placeholder="Estimasi durasi" />
        <TextField label="Cakupan area paket" value={area} onValueChange={setArea} controlClassName={ownerInputClass} placeholder="Cakupan area" />
        <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50 sm:col-span-2">
          <Plus className="size-4" />{saving ? "Menyimpan..." : "Tambah paket"}
        </button>
      </form>
      {message ? <p className="mt-2 text-sm font-bold text-blue-700" role="status">{message}</p> : null}
    </div>
  );
}

export function MitraListingManager() {
  const { online } = useOfflineQueue();
  const owned = useOwnerVendors();
  const claims = useMyClaims();
  // Mengelola listing yang sudah tayang butuh klaim yang disetujui admin, jadi
  // listing milik sendiri juga harus bisa diklaim.
  const provenVendorIds = new Set(
    (claims ?? [])
      .filter((claim) => claim.status === "verified")
      .map((claim) => String(claim.vendorId)),
  );
  const { create, update, archive, availability, generateUploadUrl } = useCatalogActions();
  const uploadImageFile = useImageUpload();
  const categoryFieldId = useId();
  const areaFieldId = useId();
  const statusFieldId = useId();
  const availabilityFieldId = useId();
  const [draft, setDraft] = useState<OwnerDraft | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!online) return;
    const handlers = {
      availability: async (payload: Record<string, unknown>) => {
        if (typeof payload.vendorId !== "string" || typeof payload.availability !== "string") return;
        await availability({
          vendorId: payload.vendorId as never,
          availability: payload.availability as "available" | "busy" | "closed",
          availabilityNote: typeof payload.availabilityNote === "string" ? payload.availabilityNote : undefined,
          nextAvailableAt: typeof payload.nextAvailableAt === "number" ? payload.nextAvailableAt : undefined,
          responseMinutes: typeof payload.responseMinutes === "number" ? payload.responseMinutes : undefined,
          serviceRadiusKm: typeof payload.serviceRadiusKm === "number" ? payload.serviceRadiusKm : undefined,
        });
      },
    };
    registerOfflineHandlers(handlers);
    void flushOfflineQueue(handlers);
  }, [availability, online]);

  const updateDraft = (changes: Partial<OwnerDraft>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setError("");
  };

  const resetDraft = () => {
    setDraft(null);
    setPhotoFile(null);
    setError("");
  };

  const startNew = () => {
    setDraft(emptyOwnerDraft());
    setPhotoFile(null);
    setNotice("");
    setError("");
  };

  const startEdit = (vendor: VendorRecord) => {
    setDraft(ownerDraftFromVendor(vendor));
    setPhotoFile(null);
    setNotice("");
    setError("");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !draft.phone.trim() || !draft.description.trim()) {
      setError("Nama, nomor WhatsApp, dan deskripsi wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      let photoId = draft.photoId;
      if (photoFile) {
        // Satu alur unggah: downscale bila perlu, dedup lewat peta blob. Aturan
        // ukuran/jenis tidak ditulis ulang di sini — semuanya di
        // `@/lib/image-upload`, sama seperti yang dipakai server.
        const uploaded = await uploadImageFile(photoFile, () => generateUploadUrl());
        photoId = uploaded.storageId;
      }
      const payload = ownerListingPayload(draft, photoId);
      if (draft.id) {
        await update({ id: draft.id as never, ...payload });
      } else {
        await create(payload);
      }
      setNotice(draft.id ? "Listing berhasil diperbarui dan sedang menunggu sinkronisasi." : "Listing berhasil dibuat sebagai draft dan menunggu moderasi admin.");
      resetDraft();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const changeAvailability = async (vendor: VendorRecord, next: OwnerAvailability) => {
    setBusyId(vendor._id);
    setError("");
    try {
      await availability({
        vendorId: vendor._id as never,
        availability: next,
        availabilityNote: vendor.availabilityNote,
        nextAvailableAt: vendor.nextAvailableAt,
        responseMinutes: vendor.responseMinutes,
        serviceRadiusKm: vendor.serviceRadiusKm,
      });
      setNotice(`Status ${vendor.name} diperbarui.`);
    } catch (caught) {
      enqueueOfflineMutation("availability", {
        vendorId: vendor._id,
        availability: next,
        availabilityNote: vendor.availabilityNote,
        nextAvailableAt: vendor.nextAvailableAt,
        responseMinutes: vendor.responseMinutes,
        serviceRadiusKm: vendor.serviceRadiusKm,
      });
      setError(caught instanceof Error ? caught.message : "Status disimpan lokal dan akan dikirim saat online.");
    } finally {
      setBusyId(null);
    }
  };

  const archiveListing = async (vendor: VendorRecord) => {
    if (!window.confirm(`Nonaktifkan listing ${vendor.name}?`)) return;
    setBusyId(vendor._id);
    setError("");
    try {
      await archive({ id: vendor._id as never });
      setNotice(`${vendor.name} dinonaktifkan dari katalog.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing belum dapat dinonaktifkan.");
    } finally {
      setBusyId(null);
    }
  };

  const activateListing = async (vendor: VendorRecord) => {
    setBusyId(vendor._id);
    setError("");
    try {
      const draft = ownerDraftFromVendor(vendor);
      await update({
        id: vendor._id as never,
        ...ownerListingPayload({ ...draft, status: "draft" }, vendor.photoId),
      });
      setNotice(`${vendor.name} dikirim ke moderasi. Admin akan memeriksa sebelum tayang.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing belum dapat diaktifkan.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section id="listing-saya" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Ruang mitra</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.035em] text-slate-950">Kelola listing Anda</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Perbarui harga, jam, ketersediaan, foto, dan paket. Perubahan langsung tersinkron ke katalog publik.</p>
        </div>
        <button type="button" onClick={startNew} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700">
          <Plus className="size-4" />Tambah listing
        </button>
      </div>

      {notice ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700" role="status">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">{error}</p> : null}

      {owned === undefined ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">Memuat listing milik Anda...</p>
      ) : owned.length > 0 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {owned.map((vendor) => (
            <article key={vendor._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-extrabold text-blue-700">
                    <CategoryMascot category={vendor.category} size="xs" animated={false} />
                    {vendor.category}
                  </p>
                  <h3 className="mt-1 truncate text-lg font-black text-slate-950">{vendor.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{landmarkLabel(vendor.landmark)} · {vendor.price}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${vendor.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                  {vendor.status === "active" ? "Tayang" : vendor.status === "draft" ? "Draft" : "Nonaktif"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <ThemedSelect
                  aria-label={`Status ketersediaan ${vendor.name}`}
                  size="sm"
                  className="w-auto min-w-[9.5rem]"
                  value={vendor.availability ?? "available"}
                  disabled={busyId === vendor._id}
                  onValueChange={(value) => void changeAvailability(vendor, value as OwnerAvailability)}
                  options={availabilitySelectOptions}
                />
                <button type="button" onClick={() => startEdit(vendor)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 hover:bg-blue-50"><Edit3 className="size-4" />Edit</button>
                {vendor.status === "active" ? (
                  <button type="button" disabled={busyId === vendor._id} onClick={() => void archiveListing(vendor)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><Archive className="size-4" />Nonaktifkan</button>
                ) : (
                  <button type="button" disabled={busyId === vendor._id} onClick={() => void activateListing(vendor)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><RotateCcw className="size-4" />Ajukan moderasi</button>
                )}
                {vendor.status === "active" ? <Link to={`/v/${vendor.slug}`} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-extrabold text-blue-700 hover:bg-blue-50">Lihat listing <ArrowRight className="size-4" /></Link> : null}
              </div>
              {provenVendorIds.has(vendor._id) ? null : (
                <ClaimListingPanel
                  vendorId={vendor._id}
                  vendorName={vendor.name}
                  phone={vendor.phone}
                  address={vendor.address}
                  ownedByMe
                  returnTo="/dashboard"
                />
              )}
              <OwnerGalleryManager vendorId={vendor._id} vendorName={vendor.name} />
              <OwnerListingHistory vendorId={vendor._id} vendorName={vendor.name} />
            </article>
          ))}
        </div>
      ) : (
        <EmptyStateCard title="Belum ada listing milik Anda" body="Tambahkan usaha Anda agar warga dapat menemukan dan menghubungi Anda." actionLabel="Tambah listing" onAction={startNew} />
      )}

      {draft ? (
        <form onSubmit={save} className="mt-6 rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-950">{draft.id ? "Edit listing" : "Listing baru"}</h3>
              <p className="mt-1 text-sm text-slate-600">Isi data yang tampil di halaman publik.</p>
            </div>
            <button type="button" onClick={resetDraft} className="flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-white" aria-label="Batal edit listing"><X className="size-5" /></button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextField label="Nama usaha *" value={draft.name} onValueChange={(name) => updateDraft({ name })} controlClassName={ownerInputClass} span required />
            <FormField label="Kategori" control={() => <ThemedSelect id={categoryFieldId} value={draft.category} onValueChange={(value) => updateDraft({ category: value as Category })} options={categorySelectOptions} />} />
            <FormField label="Area" control={() => <ThemedSelect id={areaFieldId} value={draft.landmark} onValueChange={(value) => updateDraft({ landmark: value })} options={areaSelectOptions} />} />
            <TextField label="Alamat *" value={draft.address} onValueChange={(address) => updateDraft({ address })} controlClassName={ownerInputClass} placeholder="Alamat usaha" span required />
            <TextField as="textarea" rows={3} label="Deskripsi *" value={draft.description} onValueChange={(description) => updateDraft({ description })} controlClassName={ownerInputClass} controlClassNameExtra="min-h-28 py-3" span required minLength={10} />
            <TextField label="Harga awal" value={draft.price} onValueChange={(price) => updateDraft({ price })} controlClassName={ownerInputClass} placeholder="Mulai Rp..." />
            <TextField label="Nomor WhatsApp *" value={draft.phone} onValueChange={(phone) => updateDraft({ phone })} controlClassName={ownerInputClass} inputMode="tel" placeholder="08xxxxxxxxxx" required />
            <TextField label="Jam kerja" value={draft.hours} onValueChange={(hours) => updateDraft({ hours })} controlClassName={ownerInputClass} placeholder="Setiap hari · 07.00–17.00" span />
            <FormField label="Status listing" control={() => <ThemedSelect id={statusFieldId} value={draft.status} onValueChange={(value) => updateDraft({ status: value as OwnerDraft["status"] })} options={ownerStatusSelectOptions} />} />
            <FormField label="Ketersediaan" control={() => <ThemedSelect id={availabilityFieldId} value={draft.availability} onValueChange={(value) => updateDraft({ availability: value as OwnerAvailability })} options={availabilitySelectOptions} />} />
            <TextField
              type="datetime-local"
              label="Perkiraan tersedia lagi"
              value={draft.nextAvailableAt}
              onValueChange={(nextAvailableAt) => updateDraft({ nextAvailableAt })}
              controlClassName={ownerInputClass}
              controlClassNameExtra="field-datetime field-datetime--public"
              min={minAvailableAtLocal()}
              hint={draft.nextAvailableAt ? `Tersimpan: ${formatDraftAvailability(draft.nextAvailableAt)}` : "Format mengikuti kalender perangkat Anda."}
            />
            <TextField type="number" min="1" label="Rata-rata balas (menit)" value={draft.responseMinutes} onValueChange={(responseMinutes) => updateDraft({ responseMinutes })} controlClassName={ownerInputClass} />
            <TextField type="number" min="1" label="Radius layanan (km)" value={draft.serviceRadiusKm} onValueChange={(serviceRadiusKm) => updateDraft({ serviceRadiusKm })} controlClassName={ownerInputClass} />
            <TextField label="Tag pencarian" value={draft.tagsText} onValueChange={(tagsText) => updateDraft({ tagsText })} controlClassName={ownerInputClass} placeholder="Tukang, cat, perbaikan" />
            <TextField label="Catatan ketersediaan" value={draft.availabilityNote} onValueChange={(availabilityNote) => updateDraft({ availabilityNote })} controlClassName={ownerInputClass} placeholder="Contoh: sedang banyak pesanan" />
            <FormField label="Foto listing" span control={({ id }) => (
              <span className="flex min-h-12 items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600">
                <ImagePlus className="size-5 text-blue-600" />
                <input id={id} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} className="min-w-0 flex-1 text-sm" />
              </span>
            )} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50"><Save className="size-4" />{saving ? "Menyimpan..." : "Simpan listing"}</button>
            <button type="button" onClick={resetDraft} className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">Batal</button>
          </div>
        </form>
      ) : null}
      {draft?.id ? <MitraPackageEditor key={draft.id} vendorId={draft.id} /> : null}
    </section>
  );
}
