import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  Archive,
  ArrowRight,
  Bookmark,
  Edit3,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  categoryOptions,
  landmarkLabel,
  landmarks,
  type Category,
  type Vendor,
} from "@/lib/catalog";
import {
  useCatalogVendors,
  useCatalogActions,
  useFavorites,
  useOwnerVendors,
  useVendorPackages,
  type VendorRecord,
} from "@/lib/catalog-store";
import { categoryActionLabel } from "@/lib/catalog-data";
import { useAuth } from "@/hooks/use-auth";
import { generateWhatsAppLink, recommendedWhatsAppIntent } from "@/lib/whatsapp";
import { useNavigate } from "react-router";
import { AnimatedContent, BorderGlow, Counter, GlassIcons, ScrollReveal } from "@/components/react-bits";
import { AccessibilityControls, InteractionHistory, MyRequestHistory, NotificationCenter, OwnerGalleryManager, OwnerRequestWorkspace, PwaControls } from "@/components/community-widgets";

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

function OwnerPackageEditor({ vendorId }: { vendorId: string }) {
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
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama paket" className={ownerInputClass} required />
        <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Harga awal" className={ownerInputClass} required />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Deskripsi paket" rows={2} className={`${ownerInputClass} sm:col-span-2`} required minLength={5} />
        <input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="Estimasi durasi" className={ownerInputClass} />
        <input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Cakupan area" className={ownerInputClass} />
        <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50 sm:col-span-2">
          <Plus className="size-4" />{saving ? "Menyimpan..." : "Tambah paket"}
        </button>
      </form>
      {message ? <p className="mt-2 text-sm font-bold text-blue-700" role="status">{message}</p> : null}
    </div>
  );
}

function OwnerListingManager() {
  const owned = useOwnerVendors();
  const { create, update, archive, availability, generateUploadUrl } = useCatalogActions();
  const [draft, setDraft] = useState<OwnerDraft | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
        if (photoFile.size > 1_000_000) throw new Error("Ukuran foto maksimal 1 MB.");
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": photoFile.type || "image/jpeg" },
          body: photoFile,
        });
        if (!response.ok) throw new Error("Foto gagal diunggah. Coba foto yang lebih kecil.");
        const uploaded = (await response.json()) as { storageId?: string };
        if (!uploaded.storageId) throw new Error("ID foto belum diterima.");
        photoId = uploaded.storageId;
      }
      const payload = ownerListingPayload(draft, photoId);
      if (draft.id) {
        await update({ id: draft.id as never, ...payload });
      } else {
        await create(payload);
      }
      setNotice(draft.id ? "Listing berhasil diperbarui." : "Listing berhasil dibuat.");
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
      setError(caught instanceof Error ? caught.message : "Status belum dapat diperbarui.");
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
                  <p className="text-sm font-extrabold text-blue-700">{vendor.category}</p>
                  <h3 className="mt-1 truncate text-lg font-black text-slate-950">{vendor.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{landmarkLabel(vendor.landmark)} · {vendor.price}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${vendor.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                  {vendor.status === "active" ? "Tayang" : vendor.status === "draft" ? "Draft" : "Nonaktif"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Status ketersediaan ${vendor.name}`}
                  value={vendor.availability ?? "available"}
                  disabled={busyId === vendor._id}
                  onChange={(event) => void changeAvailability(vendor, event.target.value as OwnerAvailability)}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm font-extrabold text-slate-700"
                >
                  <option value="available">Tersedia</option>
                  <option value="busy">Sedang sibuk</option>
                  <option value="closed">Tutup sementara</option>
                </select>
                <button type="button" onClick={() => startEdit(vendor)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 hover:bg-blue-50"><Edit3 className="size-4" />Edit</button>
                {vendor.status === "active" ? (
                  <button type="button" disabled={busyId === vendor._id} onClick={() => void archiveListing(vendor)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><Archive className="size-4" />Nonaktifkan</button>
                ) : (
                  <button type="button" disabled={busyId === vendor._id} onClick={() => void activateListing(vendor)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 text-sm font-extrabold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><RotateCcw className="size-4" />Ajukan moderasi</button>
                )}
                {vendor.status === "active" ? <Link to={`/v/${vendor.slug}`} className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-extrabold text-blue-700 hover:bg-blue-50">Lihat listing <ArrowRight className="size-4" /></Link> : null}
              </div>
              <OwnerGalleryManager vendorId={vendor._id} vendorName={vendor.name} />
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <Store className="mx-auto size-8 text-blue-600" />
          <p className="mt-3 font-black text-slate-950">Belum ada listing milik Anda</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">Tambahkan usaha Anda agar warga dapat menemukan dan menghubungi Anda.</p>
        </div>
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
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-extrabold text-slate-800">Nama usaha *</span><input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} className={ownerInputClass} required /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Kategori</span><select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value as Category })} className={ownerInputClass}>{categoryOptions.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Area</span><select value={draft.landmark} onChange={(event) => updateDraft({ landmark: event.target.value })} className={ownerInputClass}><option value="all">Semua Sumenep</option>{landmarks.filter((item) => item.id !== "all").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-extrabold text-slate-800">Alamat *</span><input value={draft.address} onChange={(event) => updateDraft({ address: event.target.value })} className={ownerInputClass} placeholder="Alamat usaha" required /></label>
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-extrabold text-slate-800">Deskripsi *</span><textarea value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} className={`${ownerInputClass} min-h-28 py-3`} rows={3} required minLength={10} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Harga awal</span><input value={draft.price} onChange={(event) => updateDraft({ price: event.target.value })} className={ownerInputClass} placeholder="Mulai Rp..." /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Nomor WhatsApp *</span><input value={draft.phone} onChange={(event) => updateDraft({ phone: event.target.value })} className={ownerInputClass} inputMode="tel" placeholder="08xxxxxxxxxx" required /></label>
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-extrabold text-slate-800">Jam kerja</span><input value={draft.hours} onChange={(event) => updateDraft({ hours: event.target.value })} className={ownerInputClass} placeholder="Setiap hari · 07.00–17.00" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Status listing</span><select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as OwnerDraft["status"] })} className={ownerInputClass}><option value="active">Tayang</option><option value="draft">Simpan sebagai draft</option><option value="archived">Nonaktif</option></select></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Ketersediaan</span><select value={draft.availability} onChange={(event) => updateDraft({ availability: event.target.value as OwnerAvailability })} className={ownerInputClass}><option value="available">Tersedia</option><option value="busy">Sedang sibuk</option><option value="closed">Tutup sementara</option></select></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Perkiraan tersedia lagi</span><input type="datetime-local" value={draft.nextAvailableAt} onChange={(event) => updateDraft({ nextAvailableAt: event.target.value })} className={ownerInputClass} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Rata-rata balas (menit)</span><input type="number" min="1" value={draft.responseMinutes} onChange={(event) => updateDraft({ responseMinutes: event.target.value })} className={ownerInputClass} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Radius layanan (km)</span><input type="number" min="1" value={draft.serviceRadiusKm} onChange={(event) => updateDraft({ serviceRadiusKm: event.target.value })} className={ownerInputClass} /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Tag pencarian</span><input value={draft.tagsText} onChange={(event) => updateDraft({ tagsText: event.target.value })} className={ownerInputClass} placeholder="Tukang, cat, perbaikan" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-sm font-extrabold text-slate-800">Catatan ketersediaan</span><input value={draft.availabilityNote} onChange={(event) => updateDraft({ availabilityNote: event.target.value })} className={ownerInputClass} placeholder="Contoh: sedang banyak pesanan" /></label>
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-sm font-extrabold text-slate-800">Foto listing</span><span className="flex min-h-12 items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600"><ImagePlus className="size-5 text-blue-600" /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} className="min-w-0 flex-1 text-sm" /></span></label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-extrabold text-white hover:bg-blue-700 disabled:opacity-50"><Save className="size-4" />{saving ? "Menyimpan..." : "Simpan listing"}</button>
            <button type="button" onClick={resetDraft} className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50">Batal</button>
          </div>
        </form>
      ) : null}
      {draft?.id ? <OwnerPackageEditor key={draft.id} vendorId={draft.id} /> : null}
    </section>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const vendors = useCatalogVendors();
  const favorites = useFavorites();
  const { click, interaction } = useCatalogActions();
  const savedVendors = vendors.filter((vendor) => favorites.isSaved(vendor.slug));

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="min-h-dvh min-h-[100svh] bg-[#f7f8fc] px-4 py-6 text-foreground sm:px-6 sm:py-10 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
              Ruang warga
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-4xl">
              Halo{user?.name ? `, ${user.name}` : ""}.
            </h1>
            <p className="mt-2 text-base leading-7 text-slate-600">
              Simpan usaha yang sering Anda gunakan dan lanjutkan chatting dari satu tempat.
            </p>
          </div>
          <Button type="button" onClick={handleSignOut} variant="outline" className="min-h-12 self-start rounded-lg text-base">
            <LogOut className="size-4" />Keluar
          </Button>
        </header>

        <ScrollReveal>
          <GlassIcons
            ariaLabel="Akses cepat ruang warga"
            items={[
              { label: "Cari usaha", icon: <Search className="size-5" />, color: "blue", onClick: () => navigate("/#katalog") },
              { label: "Kelola listing", icon: <Settings2 className="size-5" />, color: "violet", onClick: () => document.getElementById("listing-saya")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
            ]}
          />
        </ScrollReveal>

        <AccessibilityControls />
        <PwaControls />

        <section className="grid gap-4 sm:grid-cols-3">
          <BorderGlow className="h-full rounded-xl" intensity={0.08}>
          <Card className="h-full border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Store className="size-5" />
              </div>
              <CardTitle className="text-lg">Katalog lokal</CardTitle>
            </CardHeader>
            <CardContent>
              <Counter value={vendors.length} className="text-3xl font-black text-slate-950" />
              <p className="mt-1 text-sm text-muted-foreground">usaha tersedia</p>
            </CardContent>
          </Card>
          </BorderGlow>
          <BorderGlow className="h-full rounded-xl" glowColor="180,83,9" intensity={0.08}>
          <Card className="h-full border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Bookmark className="size-5" />
              </div>
              <CardTitle className="text-lg">Tersimpan</CardTitle>
            </CardHeader>
            <CardContent>
              <Counter value={savedVendors.length} className="text-3xl font-black text-slate-950" />
              <p className="mt-1 text-sm text-muted-foreground">listing pilihan Anda</p>
            </CardContent>
          </Card>
          </BorderGlow>
          <BorderGlow className="h-full rounded-xl" glowColor="4,120,87" intensity={0.08}>
          <Card className="h-full border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <LayoutDashboard className="size-5" />
              </div>
              <CardTitle className="text-lg">Mulai lagi</CardTitle>
            </CardHeader>
            <CardContent>
              <Link to="/#katalog" className="inline-flex min-h-12 items-center gap-2 text-base font-extrabold text-blue-700">
                Cari jasa <ArrowRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
          </BorderGlow>
        </section>

        <OwnerListingManager />
        <OwnerRequestWorkspace />

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Daftar tersimpan</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.035em] text-slate-950">Lanjutkan dari favorit Anda</h2>
            </div>
            <Link to="/#katalog" className="hidden min-h-12 items-center gap-2 rounded-lg px-3 text-base font-extrabold text-blue-700 sm:flex">
              Cari lainnya <ArrowRight className="size-4" />
            </Link>
          </div>

          <AnimatedContent animationKey={savedVendors.map((vendor) => vendor.slug).join("-") || "kosong"}>
          {savedVendors.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedVendors.map((vendor) => {
                const landmark = landmarkLabel(vendor.landmark);
                const href = generateWhatsAppLink({
                  phone: vendor.phone,
                  vendorName: vendor.name,
                  category: vendor.category,
                  landmark,
                  intent: recommendedWhatsAppIntent(vendor.category),
                });
                return (
                  <article key={vendor.slug} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${vendor.accent} text-sm font-black text-white`}>{vendor.mark}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-blue-700">{vendor.category}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">Koleksi: {favorites.collectionFor(vendor.slug)}</p>
                        <h3 className="mt-1 text-lg font-black leading-snug text-slate-950">{vendor.name}</h3>
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-2 text-base leading-6 text-slate-600">{vendor.description}</p>
                    <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-600"><MapPin className="size-4 text-blue-600" />{landmark}</p>
                    <div className="mt-auto grid grid-cols-[1fr_3rem] gap-2 pt-5">
                      <a href={href} target="_blank" rel="noreferrer" onClick={() => { if (vendor._id) { void click({ id: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); void interaction({ vendorId: vendor._id as never, kind: "whatsapp" }).catch(() => undefined); } }} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-base font-extrabold text-[#082f1e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                        <MessageCircle className="size-5" />{categoryActionLabel[vendor.category]}
                      </a>
                      <Link to={`/v/${vendor.slug}`} className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50" aria-label={`Lihat ${vendor.name}`}>
                        <ArrowRight className="size-5" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Card className="border-dashed border-slate-300 bg-white shadow-none">
              <CardContent className="flex flex-col items-center py-10 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Bookmark className="size-6" /></span>
                <h3 className="mt-4 text-xl font-black text-slate-950">Belum ada listing tersimpan</h3>
                <p className="mt-2 max-w-md text-base leading-7 text-slate-600">Klik ikon bookmark pada listing untuk menyimpannya di perangkat dan menyinkronkannya setelah Anda masuk.</p>
                <Button asChild className="mt-5 min-h-12 rounded-lg text-base">
                  <Link to="/#katalog">Jelajahi katalog <ArrowRight className="size-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          )}
          </AnimatedContent>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <InteractionHistory />
          <NotificationCenter />
        </div>
        <MyRequestHistory />
      </div>
    </main>
  );
}
