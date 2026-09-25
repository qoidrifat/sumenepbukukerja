import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  Check,
  CheckCircle2,
  FileCheck2,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { CodedBell, CodedSparkline, CodedStacked } from "@/components/codedvisuals";
import { BorderGlow, Counter, GlassSurface, ScrollReveal } from "@/components/react-bits";
import { categoryOptions, landmarks, type Category, type Vendor } from "@/lib/catalog";
import { useAdminVendors, useCatalogActions } from "@/lib/catalog-store";
import { duplicateScore, profileCompleteness, qualityIssues } from "@/lib/catalog-data";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

const inputClass =
  "min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const emptyDraft = (): Vendor => ({
  slug: "",
  name: "",
  category: "Jasa Umum",
  description: "",
  address: "",
  landmark: "all",
  price: "",
  hours: "Setiap hari · 07.00–17.00",
  phone: "",
  rating: "Baru",
  reviews: 0,
  accent: "from-blue-600 to-cyan-400",
  mark: "SB",
  tags: [],
  status: "active",
  featured: false,
  verified: false,
});

function AdminHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          to="/"
          className={`flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-blue-50 ${focusRing}`}
        >
          <ArrowLeft className="size-5" />
          Kembali ke katalog
        </Link>
        <span className="text-lg font-black tracking-[-0.04em] text-slate-950">
          Sumenep <span className="text-blue-600">Buku</span> Kerja
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-sm font-extrabold text-amber-800">
            Admin
          </span>
        </span>
      </div>
    </header>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-extrabold text-slate-800">
        {label}
        {required ? <span className="ml-1 text-blue-600">*</span> : null}
      </span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "emerald" | "slate";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-800",
    amber: "bg-amber-50 text-amber-800",
    emerald: "bg-emerald-50 text-emerald-800",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className={`mt-2 inline-flex rounded-lg px-2 py-1 text-2xl font-black ${tones[tone]}`}>
        <Counter value={value} />
      </p>
    </div>
  );
}

export default function Admin() {
  const items = useAdminVendors() ?? [];
  const {
    create,
    update: updateVendor,
    archive,
    subscription,
    generateUploadUrl,
  } = useCatalogActions();
  const [draft, setDraft] = useState<(Vendor & { _id?: string }) | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Vendor | null>(null);

  const updateDraft = (changes: Partial<Vendor>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const resetEditor = () => {
    setDraft(null);
    setPhoto(null);
    setPhotoFile(null);
    setError("");
  };

  const startNew = () => {
    setDraft(emptyDraft());
    setPhoto(null);
    setPhotoFile(null);
    setNotice("");
    setError("");
  };

  const startEdit = (vendor: Vendor) => {
    setDraft({ ...vendor, reviews: vendor.reviewsCount ?? vendor.reviews });
    setPhoto(null);
    setPhotoFile(null);
    setNotice("");
    setError("");
  };

  const handlePhoto = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("Ukuran foto maksimal 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(typeof reader.result === "string" ? reader.result : null);
      setPhotoFile(file);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!draft || !draft.name.trim() || !draft.phone.trim()) return;
    setSaving(true);
    setError("");

    try {
      const mark = draft.mark || draft.name.slice(0, 2).toUpperCase();
      let photoId = draft.photoId;

      if (photoFile) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": photoFile.type || "image/jpeg" },
          body: photoFile,
        });
        if (!response.ok) throw new Error("Foto gagal diunggah. Coba foto yang lebih kecil.");
        const result = (await response.json()) as { storageId?: string };
        if (!result.storageId) throw new Error("ID foto tidak diterima oleh penyimpanan.");
        photoId = result.storageId;
      }

      const next = {
        name: draft.name.trim(),
        category: draft.category,
        description: draft.description.trim(),
        address: draft.address.trim(),
        landmark: draft.landmark,
        lat: draft.lat,
        lng: draft.lng,
        price: draft.price.trim(),
        hours: draft.hours.trim(),
        phone: draft.phone.replace(/\D/g, ""),
        rating: draft.rating,
        accent: draft.accent,
        mark,
        tags: draft.tags.length ? draft.tags : [draft.category],
        status: draft.status ?? "active",
        featured: draft.featured ?? false,
        verified: draft.verified ?? false,
        photoId,
      };

      if (draft._id) {
        await updateVendor({ id: draft._id as never, ...next });
      } else {
        await create(next);
      }

      setNotice(
        draft._id
          ? "Listing berhasil diperbarui."
          : "Listing baru sudah tayang di katalog.",
      );
      resetEditor();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (slug: string) => {
    const item = items.find((candidate) => candidate.slug === slug);
    if (!item?._id || !window.confirm("Hapus listing ini dari katalog?")) return;

    try {
      await archive({ id: item._id as never });
      if (draft?._id === item._id) resetEditor();
      setNotice("Listing berhasil diarsipkan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Listing gagal diarsipkan.");
    }
  };

  const completeness = draft ? profileCompleteness(draft) : 0;
  const issues = draft ? qualityIssues(draft) : [];
  const duplicate = draft
    ? items
        .filter((item) => item._id !== draft._id)
        .map((item) => ({ item, score: duplicateScore(draft, item) }))
        .sort((a, b) => b.score - a.score)[0]
    : undefined;

  const activeItems = items.filter((item) => (item.status ?? "active") === "active");
  const draftItems = items.filter((item) => item.status === "draft");
  const archivedItems = items.filter((item) => item.status === "archived");
  const incompleteItems = activeItems.filter(
    (item) => qualityIssues(item as Vendor).length > 0,
  );
  const actionableCount = draftItems.length + archivedItems.length + incompleteItems.length;
  const totalWhatsappClicks = items.reduce(
    (total, item) => total + Number(item.whatsappClicks ?? 0),
    0,
  );
  const totalShareClicks = items.reduce(
    (total, item) => total + Number(item.shareClicks ?? 0),
    0,
  );

  const clickPoints = useMemo(() => {
    const values = activeItems
      .map((item) => Number(item.whatsappClicks ?? 0))
      .sort((a, b) => b - a)
      .slice(0, 8);
    if (values.length < 2) return [0, 0];
    const max = Math.max(...values, 1);
    return values.map((value) => value / max);
  }, [activeItems]);

  const fanCount = items.length >= 9 ? 9 : items.length >= 7 ? 7 : items.length >= 5 ? 5 : 3;
  const notificationItems = [
    ...(draftItems.length
      ? [{ title: `${draftItems.length} listing menunggu ditayangkan`, body: "Periksa status draft sebelum pelanggan dapat menemukannya.", tone: "amber" as const }]
      : []),
    ...(archivedItems.length
      ? [{ title: `${archivedItems.length} listing diarsipkan`, body: "Arsip tidak tampil di katalog publik.", tone: "slate" as const }]
      : []),
    ...(incompleteItems.length
      ? [{ title: `${incompleteItems.length} listing perlu dilengkapi`, body: "Nomor, alamat, harga, deskripsi, atau tag masih perlu diperiksa.", tone: "amber" as const }]
      : []),
  ];

  const previewContent = preview ? (
    <section className="mb-8 rounded-xl border border-blue-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
            Pratinjau pelanggan
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{preview.name || "Nama usaha"}</h2>
        </div>
        <button
          type="button"
          onClick={() => setPreview(null)}
          className={`flex size-12 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 ${focusRing}`}
          aria-label="Tutup pratinjau"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className={`mt-4 aspect-[16/9] rounded-xl bg-gradient-to-br ${preview.accent} p-5 text-white`}>
        <span className="text-3xl font-black">{preview.mark}</span>
        <p className="mt-4 text-2xl font-black">{preview.name || "Nama usaha"}</p>
        <p className="mt-1 text-base">{preview.description || "Deskripsi usaha akan tampil di sini."}</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <p className="text-sm font-bold text-slate-700">{preview.category}</p>
        <p className="text-sm font-bold text-slate-700">{preview.address || "Alamat belum diisi"}</p>
        <p className="text-sm font-bold text-slate-700">{preview.price || "Harga belum diisi"}</p>
        <p className="text-sm font-bold text-slate-700">{preview.hours}</p>
      </div>
    </section>
  ) : null;

  return (
    <div className="min-h-dvh min-h-[100svh] bg-[#f7f8fc] pb-safe-nav lg:pb-10">
      <AdminHeader />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        {previewContent}

        <section className="grid items-center gap-6 lg:grid-cols-[1fr_20rem]">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
              Ruang pengelola
            </p>
            <h1 className="mt-2 text-[clamp(2rem,4vw,3.5rem)] font-black tracking-[-0.055em] text-slate-950">
              Kelola Buku Kerja
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
              Tambahkan, sunting, atau hapus catatan usaha yang muncul di katalog warga Sumenep.
            </p>
            <button
              type="button"
              onClick={startNew}
              className={`mt-6 flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-base font-extrabold text-white hover:bg-blue-700 ${focusRing}`}
            >
              <Plus className="size-5" />Tambah listing
            </button>
          </div>
          <div className="hidden h-64 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm sm:block">
            <CodedStacked
              category="mixed"
              count={fanCount}
              label={`${items.length} catatan katalog`}
              animated
              trigger="inView"
              className="h-full"
            />
          </div>
        </section>

        {notice ? (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-base font-bold text-blue-800">
            <Check className="size-5" />
            {notice}
            <button
              type="button"
              onClick={() => setNotice("")}
              className={`ml-auto flex size-9 items-center justify-center rounded-lg hover:bg-blue-100 ${focusRing}`}
              aria-label="Tutup pemberitahuan"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base font-bold text-red-800">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            {error}
          </div>
        ) : null}

        <section className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <BorderGlow className="rounded-2xl" glowColor="37,99,235" intensity={0.1}>
            <div className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
                  Ringkasan interaksi
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Data nyata dari katalog</h2>
              </div>
              <div className="min-w-[17rem]">
                <CodedSparkline
                  title="Klik WhatsApp"
                  value={String(totalWhatsappClicks)}
                  change={`${totalShareClicks} share`}
                  trend="neutral"
                  points={clickPoints}
                  animated
                  trigger="inView"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6">
              <StatCard label="Aktif" value={activeItems.length} tone="emerald" />
              <StatCard label="Draft" value={draftItems.length} tone="amber" />
              <StatCard label="Arsip" value={archivedItems.length} tone="slate" />
              <StatCard label="Perlu lengkapi" value={incompleteItems.length} tone="blue" />
            </div>
            <p className="px-5 pb-5 text-xs leading-5 text-slate-500 sm:px-6 sm:pb-6">
              Grafik menampilkan distribusi klik WhatsApp antar listing aktif, bukan tren waktu. Nilainya langsung berasal dari query katalog.
            </p>
            </div>
          </BorderGlow>

          <GlassSurface tint="light" className="rounded-2xl p-5 shadow-sm sm:p-6">
            <div className="grid items-center gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="h-40 sm:h-44">
                <CodedBell count={actionableCount} animated trigger="inView" hover className="h-full" />
              </div>
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
                  Notifikasi pengelola
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {actionableCount > 0 ? `${actionableCount} hal perlu dilihat` : "Semua listing beres"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Dihitung dari status draft, arsip, dan kelengkapan data saat ini.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {notificationItems.length > 0 ? notificationItems.map((notification) => (
                <div key={notification.title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {notification.tone === "amber" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  ) : (
                    <Archive className="mt-0.5 size-4 shrink-0 text-slate-600" />
                  )}
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">{notification.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{notification.body}</p>
                  </div>
                </div>
              )) : (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-sm font-extrabold text-emerald-900">Tidak ada tindakan tertunda</p>
                    <p className="mt-1 text-sm leading-5 text-emerald-800">Katalog aktif sudah memiliki kelengkapan yang wajar.</p>
                  </div>
                </div>
              )}
            </div>
          </GlassSurface>
        </section>

        {draft ? (
          <section className="mt-8 rounded-xl border border-blue-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
                  {draft.slug ? "Sunting listing" : "Listing baru"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Ceritakan usaha ini</h2>
              </div>
              <button
                type="button"
                onClick={resetEditor}
                className={`flex size-12 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 ${focusRing}`}
                aria-label="Tutup formulir"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">Kualitas listing</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">Kelengkapan {completeness}%</p>
                  </div>
                  <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completeness}%` }} />
                  </div>
                </div>
                {issues.length > 0 ? (
                  <p className="mt-3 text-sm font-bold text-amber-800">Perlu dilengkapi: {issues.join(" · ")}</p>
                ) : null}
                {duplicate && duplicate.score >= 0.6 ? (
                  <p className="mt-2 text-sm font-bold text-red-700">Duplikat mungkin: {duplicate.item.name}</p>
                ) : null}
              </div>

              <Field label="Nama usaha" value={draft.name} onChange={(name) => updateDraft({ name })} placeholder="Contoh: Bengkel Svetrum" required />
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-extrabold text-slate-800">Kategori</span>
                <select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value as Category })} className={inputClass}>
                  {categoryOptions.map((item) => <option key={item.label}>{item.label}</option>)}
                </select>
              </label>
              <Field label="Nomor WhatsApp" value={draft.phone} onChange={(phone) => updateDraft({ phone })} placeholder="628xxxxxxxxxx" type="tel" required />
              <Field label="Harga mulai dari" value={draft.price} onChange={(price) => updateDraft({ price })} placeholder="Mulai Rp50.000" />
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-extrabold text-slate-800">Patokan lokasi</span>
                <select value={draft.landmark} onChange={(event) => updateDraft({ landmark: event.target.value })} className={inputClass}>
                  {landmarks.filter((item) => item.id !== "all").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <Field
                label="Latitude (opsional)"
                value={draft.lat?.toString() ?? ""}
                onChange={(value) => {
                  const parsed = Number(value);
                  updateDraft({ lat: value.trim() === "" || Number.isNaN(parsed) ? undefined : parsed });
                }}
                placeholder="-7.009"
                type="number"
              />
              <Field
                label="Longitude (opsional)"
                value={draft.lng?.toString() ?? ""}
                onChange={(value) => {
                  const parsed = Number(value);
                  updateDraft({ lng: value.trim() === "" || Number.isNaN(parsed) ? undefined : parsed });
                }}
                placeholder="114.448"
                type="number"
              />
              <p className="text-sm leading-6 text-slate-500 lg:col-span-2">Isi koordinat agar listing ini dapat difilter berdasarkan jarak pengguna. Koordinat hanya dipakai untuk perhitungan jarak.</p>
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-extrabold text-slate-800">Status</span>
                <select value={draft.status ?? "active"} onChange={(event) => updateDraft({ status: event.target.value as Vendor["status"] })} className={inputClass}>
                  <option value="active">Aktif — tampil di katalog</option>
                  <option value="draft">Draft — belum tampil</option>
                  <option value="archived">Arsip — disembunyikan</option>
                </select>
              </label>
              <Field label="Alamat lengkap" value={draft.address} onChange={(address) => updateDraft({ address })} placeholder="Jalan, nomor, atau keterangan lokasi" required />
              <Field label="Jam kerja" value={draft.hours} onChange={(hours) => updateDraft({ hours })} placeholder="Setiap hari · 07.00–17.00" />
              <label className="flex min-w-0 flex-col gap-2 lg:col-span-2">
                <span className="text-sm font-extrabold text-slate-800">Deskripsi singkat</span>
                <textarea value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Ceritakan layanan yang tersedia atau keunggulan usaha ini." rows={3} className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-base leading-6 text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-extrabold text-slate-800">
                  Foto usaha <span className="font-medium text-slate-500">(maks. 1 MB)</span>
                </span>
                <span className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 text-base font-bold text-blue-700 hover:bg-blue-100">
                  <Upload className="size-5" />
                  {photo ? "Foto dipilih — akan disimpan" : "Unggah foto (opsional)"}
                  <input type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} className="sr-only" />
                </span>
                {photo ? <img src={photo} alt="Pratinjau foto usaha" className="mt-2 aspect-[16/9] w-full max-w-sm rounded-lg object-cover" /> : null}
              </label>
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-sm font-extrabold text-slate-800">Tag pencarian</span>
                <input value={draft.tags.join(", ")} onChange={(event) => updateDraft({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="servis, dekat, cepat" className={inputClass} />
              </label>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-800">
                <input type="checkbox" checked={draft.featured ?? false} onChange={(event) => updateDraft({ featured: event.target.checked })} className="size-5 accent-blue-600" />
                <Sparkles className="size-5 text-amber-600" />Tampilkan sebagai pilihan warga
              </label>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-base font-bold text-slate-800">
                <input type="checkbox" checked={draft.verified ?? false} onChange={(event) => updateDraft({ verified: event.target.checked })} className="size-5 accent-blue-600" />
                <FileCheck2 className="size-5 text-blue-600" />Tampilkan sebagai terverifikasi
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => draft && setPreview(draft)} className={`min-h-12 rounded-lg border border-slate-300 px-5 text-base font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}>Pratinjau listing</button>
              <button type="button" onClick={resetEditor} className={`min-h-12 rounded-lg border border-slate-300 px-5 text-base font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}>Batal</button>
              <button type="button" onClick={save} disabled={!draft.name.trim() || !draft.phone.trim() || saving} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-base font-extrabold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}>
                {saving ? <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="size-5" />}
                {saving ? "Menyimpan..." : "Simpan listing"}
              </button>
            </div>
          </section>
        ) : null}

        <ScrollReveal>
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <ImagePlus className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">Listing di katalog</h2>
              <p className="text-sm font-medium text-slate-600">{items.length} catatan</p>
            </div>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {items.map((item) => (
              <div key={item.slug} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex size-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.accent} text-sm font-black text-white`}>{item.mark}</div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-extrabold text-slate-950">{item.name}</p>
                    <p className="mt-1 text-sm font-medium text-slate-600">{item.category} · {item.address || "Alamat belum diisi"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link to={`/v/${item.slug}`} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 text-base font-extrabold text-blue-700 hover:bg-blue-50 ${focusRing}`}>Lihat</Link>
                  <button type="button" onClick={() => startEdit(item as Vendor)} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-base font-extrabold text-slate-700 hover:bg-slate-50 ${focusRing}`}><Pencil className="size-4" />Sunting</button>
                  <button type="button" onClick={() => item._id && void subscription({ vendorId: item._id as never, tier: item.featured ? "free" : "featured" })} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-amber-200 px-4 text-base font-extrabold text-amber-800 hover:bg-amber-50 ${focusRing}`}>{item.featured ? "Jadikan biasa" : "Jadikan unggulan"}</button>
                  <button type="button" onClick={() => remove(item.slug)} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 text-base font-extrabold text-red-700 hover:bg-red-50 ${focusRing}`}><Trash2 className="size-4" />Hapus</button>
                </div>
              </div>
            ))}
          </div>
          </section>
        </ScrollReveal>
      </main>
    </div>
  );
}
