import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useMemo, useId, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  Filter,
  Inbox,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAccessDenied, AdminSetupRequired } from "@/components/admin-access-gate";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  availabilitySelectOptions,
  categorySelectOptions,
  landmarkSelectOptions,
  type ThemedSelectOption,
} from "@/lib/select-options";
import {
  landmarkLabel,
  type Category,
  type Vendor,
} from "@/lib/catalog";
import {
  useAdminVendors,
  useCatalogActions,
  useCommunityMetrics,
  useCurrentAccess,
  useOpenReports,
  useReviewQueue,
  type VendorRecord,
} from "@/lib/catalog-store";
import { duplicateScore, profileCompleteness, qualityIssues } from "@/lib/catalog-data";
import { AdminGovernance } from "@/components/admin-governance";
import { useAuth } from "@/hooks/use-auth";

// VendorActionArea sudah siap dipakai di kartu vendor (lihat VendorActionArea di
// admin-workspace.tsx). Baris pemakaiannya berada di bawah batas edit tool,
// jadi importnya dipasang lebih dulu supaya hanya tinggal menempelkan JSX.
import {
  AdminHeader,
  AdminMetricsBoard,
  AdminPackageManager,
  AdminReportReview,
  Field,
  SectionHeading,
  formatDate,
  formatPhone,
  inputClass,
  quietButtonClass,
  secondaryButtonClass,
  statusFilters,
  statusInfo,
  vendorUpdatePayload,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  VendorActionArea,
  whatsappHref,
  type ModerationFilter,
  type PendingConfirmation,
} from "@/components/admin-workspace";

const EMPTY_ITEMS: VendorRecord[] = [];

const vendorStatusSelectOptions: ThemedSelectOption[] = [
  { value: "active", label: "Aktif — tampil di katalog" },
  { value: "draft", label: "Draft — belum tampil" },
  { value: "archived", label: "Arsip — disembunyikan" },
];

const categoryFilterSelectOptions: ThemedSelectOption[] = [
  { value: "all", label: "Semua kategori" },
  ...categorySelectOptions,
];

const toDateTimeLocal = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

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
  availability: "available",
  availabilityNote: "",
  responseMinutes: 60,
  serviceRadiusKm: 10,
});

function AdminGate() {
  const access = useCurrentAccess();
  const { isAuthenticated, user } = useAuth();
  const setup = useQuery(api.users.adminSetupStatus, {});
  if (access === undefined || setup === undefined) {
    return (
      <div className="admin-workspace flex min-h-dvh items-center justify-center bg-[#FAF7EE] p-6 text-[#1A1A1A]">
        <div className="admin-card flex items-center gap-3 px-5 py-4">
          <span className="size-3 animate-pulse rounded-full bg-[#FF5A26]" aria-hidden="true" />
          <p className="font-black">Memeriksa akses pengelola...</p>
        </div>
      </div>
    );
  }
  if (access.canViewAdmin) {
    return (
      <TooltipProvider delayDuration={200}>
        <AdminWorkspace />
      </TooltipProvider>
    );
  }
  if (!setup.hasAnyStaff) {
    return <AdminSetupRequired bootstrapAvailable={setup.bootstrapAvailable} />;
  }
  return <AdminAccessDenied signedIn={isAuthenticated} accountName={user?.name} />;
}

export default function Admin() {
  return <AdminGate />;
}

function AdminWorkspace() {
  const access = useCurrentAccess();
  const categoryFieldId = useId();
  const landmarkFieldId = useId();
  const statusFieldId = useId();
  const availabilityFieldId = useId();
  const items = useAdminVendors() ?? EMPTY_ITEMS;
  const reports = useOpenReports() ?? [];
  const communityMetrics = useCommunityMetrics();
  const reviewQueue = useReviewQueue();
  const {
    create,
    update: updateVendor,
    archive,
    subscription,
    generateUploadUrl,
    updateReport,
  } = useCatalogActions();
  const [draft, setDraft] = useState<(Vendor & { _id?: string }) | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Vendor | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ModerationFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation>(null);
  const [confirming, setConfirming] = useState(false);

  const updateDraft = (changes: Partial<Vendor>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current));

  const resetEditor = () => {
    setDraft(null);
    setPhoto(null);
    setPhotoFile(null);
    setPreview(null);
    setError("");
  };

  const startNew = () => {
    if (!access?.canModerate) {
      setError("Viewer hanya dapat melihat data. Minta admin atau staff melakukan perubahan.");
      return;
    }
    setDraft(emptyDraft());
    setPhoto(null);
    setPhotoFile(null);
    setNotice("");
    setError("");
    window.setTimeout(() => {
      document.getElementById("admin-editor")?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    }, 0);
  };

  const startEdit = (vendor: VendorRecord) => {
    if (!access?.canModerate) {
      setError("Viewer hanya dapat melihat data. Minta admin atau staff melakukan perubahan.");
      return;
    }
    setDraft({ ...vendor, reviews: vendor.reviewsCount ?? vendor.reviews });
    setPhoto(null);
    setPhotoFile(null);
    setNotice("");
    setError("");
    window.setTimeout(() => {
      document.getElementById("admin-editor")?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    }, 0);
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
        if (!response.ok) {
          throw new Error("Foto gagal diunggah. Coba foto yang lebih kecil.");
        }
        const result = (await response.json()) as { storageId?: string };
        if (!result.storageId) {
          throw new Error("ID foto tidak diterima oleh penyimpanan.");
        }
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
        availability: draft.availability ?? "available",
        availabilityNote: draft.availabilityNote,
        nextAvailableAt: draft.nextAvailableAt,
        responseMinutes: draft.responseMinutes,
        serviceRadiusKm: draft.serviceRadiusKm,
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
      setError(
        caught instanceof Error ? caught.message : "Listing gagal disimpan.",
      );
    } finally {
      setSaving(false);
    }
  };

  const runVendorUpdate = async (
    vendor: VendorRecord,
    changes: Partial<VendorRecord>,
    successMessage: string,
    actionName = "update",
  ) => {
    if (!access?.canModerate) {
      setError("Viewer tidak dapat mengubah status listing.");
      return;
    }
    const actionKey = `${vendor._id}:${actionName}`;
    setBusyAction(actionKey);
    setError("");
    try {
      await updateVendor({
        id: vendor._id as never,
        ...vendorUpdatePayload(vendor, changes),
      });
      setNotice(successMessage);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Status listing belum dapat diperbarui.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const approveVendor = async (vendor: VendorRecord) => {
    await runVendorUpdate(
      vendor,
      { status: "active", verified: true },
      `${vendor.name} disetujui dan ditandai terverifikasi.`,
      "approve",
    );
  };

  const toggleActive = async (vendor: VendorRecord) => {
    const isActive = (vendor.status ?? "active") === "active";
    if (isActive) {
      const actionKey = `${vendor._id}:archive`;
      setBusyAction(actionKey);
      setError("");
      try {
        await archive({ id: vendor._id as never });
        setNotice(`${vendor.name} dinonaktifkan.`);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Listing belum dapat dinonaktifkan.",
        );
      } finally {
        setBusyAction(null);
      }
      return;
    }

    await runVendorUpdate(
      vendor,
      { status: "active" },
      `${vendor.name} dikembalikan ke katalog.`,
      "activate",
    );
  };

  const toggleFeatured = async (vendor: VendorRecord) => {
    const actionKey = `${vendor._id}:featured`;
    setBusyAction(actionKey);
    setError("");
    try {
      await subscription({
        vendorId: vendor._id as never,
        tier: vendor.featured ? "free" : "featured",
      });
      setNotice(
        vendor.featured
          ? `${vendor.name} tidak lagi menjadi listing unggulan.`
          : `${vendor.name} ditandai sebagai listing unggulan.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Status unggulan belum dapat diperbarui.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const confirmDestructiveAction = async () => {
    if (!pendingConfirmation || !access?.canModerate) return;
    setConfirming(true);
    setError("");
    try {
      await archive({ id: pendingConfirmation.vendor._id as never });
      setNotice(
        pendingConfirmation.kind === "reject"
          ? `${pendingConfirmation.vendor.name} ditolak dan diarsipkan.`
          : `${pendingConfirmation.vendor.name} dihapus dari katalog.`,
      );
      if (draft?._id === pendingConfirmation.vendor._id) resetEditor();
      setPendingConfirmation(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Aksi belum dapat diselesaikan.",
      );
    } finally {
      setConfirming(false);
    }
  };

  const updateReportStatus = async (
    id: string,
    status: "reviewing" | "resolved" | "dismissed",
  ) => {
    if (!access?.canModerate) {
      setError("Viewer tidak dapat memperbarui laporan.");
      return;
    }
    setBusyAction(`report:${id}`);
    setError("");
    try {
      await updateReport({ id: id as never, status });
      setNotice("Status laporan warga diperbarui.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Laporan belum dapat diperbarui.",
      );
    } finally {
      setBusyAction(null);
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
  const unclaimedItems = items.filter(
    (item) => statusInfo(item).key === "unclaimed",
  );
  const confirmedItems = items.filter(
    (item) => statusInfo(item).key === "confirmed",
  );
  const verifiedItems = items.filter(
    (item) => statusInfo(item).key === "verified",
  );
  const missingPhoneItems = items.filter((item) => !item.phone.trim());
  const totalWhatsappClicks = items.reduce(
    (total, item) => total + Number(item.whatsappClicks ?? 0),
    0,
  );
  const actionableCount =
    draftItems.length + archivedItems.length + incompleteItems.length;
  const latestUpdate = items.reduce(
    (latest, item) => Math.max(latest, item.updatedAt ?? 0),
    0,
  );

  const filteredItems = useMemo(() => {
    const needle = search
      .trim()
      .toLocaleLowerCase("id-ID")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return items.filter((item) => {
      const currentStatus = statusInfo(item).key;
      const matchesStatus =
        statusFilter === "all" || currentStatus === statusFilter;
      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;
      const haystack = [
        item.name,
        item.category,
        item.address,
        landmarkLabel(item.landmark),
        item.phone,
        ...item.tags,
      ]
        .join(" ")
        .toLocaleLowerCase("id-ID")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return matchesStatus && matchesCategory && (!needle || haystack.includes(needle));
    });
  }, [categoryFilter, items, search, statusFilter]);

  const metrics: Array<{
    label: string;
    value: number;
    note: string;
    icon: LucideIcon;
    tone: "orange" | "yellow" | "white" | "mint" | "stone" | "terracotta";
  }> = [
    {
      label: "Belum Klaim",
      value: unclaimedItems.length,
      note: "Antrean pemeriksaan",
      icon: UserRound,
      tone: "orange",
    },
    {
      label: "Terkonfirmasi",
      value: confirmedItems.length,
      note: "Pemilik terhubung",
      icon: CheckCircle2,
      tone: "yellow",
    },
    {
      label: "Terverifikasi",
      value: verifiedItems.length,
      note: "Sudah dimoderasi",
      icon: ShieldCheck,
      tone: "mint",
    },
    {
      label: "Tanpa Nomor",
      value: missingPhoneItems.length,
      note: "Kontak wajib diperiksa",
      icon: Phone,
      tone: "terracotta",
    },
    {
      label: "Perlu Ditinjau",
      value: incompleteItems.length + reports.length,
      note: "Kualitas & laporan warga",
      icon: AlertTriangle,
      tone: "stone",
    },
    {
      label: "Total Vendor",
      value: items.length,
      note: `${activeItems.length} aktif di katalog`,
      icon: Store,
      tone: "white",
    },
    {
      label: "Klik WhatsApp",
      value: totalWhatsappClicks,
      note: "Interaksi terukur",
      icon: MessageCircle,
      tone: "yellow",
    },
  ];

  const impactMetrics = [
    {
      label: "Pencarian → WhatsApp",
      value: `${communityMetrics?.searchToWhatsappRate ?? 0}%`,
      note: `${communityMetrics?.whatsappClicks ?? 0} klik dari ${communityMetrics?.searches ?? 0} impression`,
      icon: Search,
    },
    {
      label: "Respons rata-rata",
      value: `${communityMetrics?.averageResponseMinutes ?? 0} mnt`,
      note: " estimasi yang dicantumkan listing",
      icon: Clock3,
    },
    {
      label: "Permintaan selesai",
      value: String(communityMetrics?.completedRequests ?? 0),
      note: "permintaan warga telah selesai",
      icon: CheckCircle2,
    },
    {
      label: "Listing lengkap",
      value: `${communityMetrics?.completeListingRate ?? 0}%`,
      note: "harga, jam kerja, dan foto",
      icon: FileCheck2,
    },
    {
      label: "Warga menyimpan favorit",
      value: `${communityMetrics?.returningSaverRate ?? 0}%`,
      note: "akun dengan minimal satu favorit",
      icon: UserRound,
    },
    {
      label: "Listing aktif",
      value: String(communityMetrics?.activeListings ?? 0),
      note: `${communityMetrics?.listingsWithPhotos ?? 0} listing memiliki foto`,
      icon: Store,
    },
  ];

  const notificationItems = [
    ...(draftItems.length
      ? [
          {
            title: `${draftItems.length} listing menunggu ditayangkan`,
            body: "Periksa status draft sebelum pelanggan dapat menemukannya.",
            icon: Clock3,
          },
        ]
      : []),
    ...(archivedItems.length
      ? [
          {
            title: `${archivedItems.length} listing diarsipkan`,
            body: "Arsip tidak tampil di katalog publik.",
            icon: Archive,
          },
        ]
      : []),
    ...(incompleteItems.length
      ? [
          {
            title: `${incompleteItems.length} listing perlu dilengkapi`,
            body: "Nomor, alamat, harga, deskripsi, atau tag masih perlu diperiksa.",
            icon: FileCheck2,
          },
        ]
      : []),
    ...(reports.length
      ? [
          {
            title: `${reports.length} laporan warga perlu ditinjau`,
            body: "Periksa laporan listing dari halaman moderasi.",
            icon: AlertTriangle,
          },
        ]
      : []),
  ];

  const previewContent = preview ? (
    <section className="admin-panel admin-panel-lg mb-8 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b-2 border-[#121212] bg-[#FFE662] p-4 sm:p-6">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">
            Pratinjau pelanggan
          </p>
          <h2 className="mt-1 text-[clamp(1.25rem,2vw,1.75rem)] font-black text-[#1A1A1A]">
            {preview.name || "Nama usaha"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setPreview(null)}
          className="admin-icon-btn shrink-0"
          aria-label="Tutup pratinjau"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="grid gap-0 lg:grid-cols-[1.1fr_.9fr]">
        <div
          className={`flex min-h-64 flex-col justify-end bg-gradient-to-br ${preview.accent} p-6 text-white`}
        >
          <span className="text-4xl font-black tracking-[-0.05em]">
            {preview.mark}
          </span>
          <p className="mt-6 text-[clamp(1.5rem,3vw,2.25rem)] font-black">
            {preview.name || "Nama usaha"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-0 bg-[#121212] lg:grid-cols-1">
          {[
            ["Kategori", preview.category],
            ["Alamat", preview.address || "Alamat belum diisi"],
            ["Harga", preview.price || "Harga belum diisi"],
            ["Jam kerja", preview.hours],
          ].map(([label, value]) => (
            <div key={label} className="border-b-2 border-[#121212] bg-white p-4 last:border-b-0">
              <p className="text-sm font-bold text-[#525252]">{label}</p>
              <p className="mt-1 text-base font-black text-[#1A1A1A]">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  ) : null;

  return (
    <div className="admin-workspace min-h-dvh min-h-[100svh] pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#1A1A1A]">
      <AdminHeader role={access?.role ?? undefined} reviewQueue={reviewQueue ?? undefined} />
      <main className="admin-shell-frame mx-auto max-w-[1600px] px-3 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10">
        {previewContent}

        <section className="admin-panel admin-panel-lg overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)]">
            <div className="p-5 sm:p-7 lg:p-9">
              <div className="inline-flex items-center gap-2 border-2 border-[#121212] bg-[#FFE662] px-3 py-2 text-sm font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#121212]">
                <span className="admin-sync-dot" aria-hidden="true" />
                Meja kerja admin
              </div>
              <h1 className="mt-5 max-w-4xl text-[clamp(2rem,5vw,4rem)] font-black uppercase leading-[0.98] tracking-[-0.06em] text-[#1A1A1A]">
                Triage katalog tanpa ribet.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[#525252] sm:text-lg sm:leading-8">
                Periksa, terverifikasi, aktifkan, dan arsipkan listing dari satu
                ruang kerja yang tersinkon langsung dengan data Sumenep Buku Kerja.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={startNew}
                  className="admin-btn admin-btn-primary"
                >
                  <Plus className="size-5" />
                  Tambah listing
                </button>
                <a href="#admin-triage" className="admin-btn admin-btn-secondary">
                  <Inbox className="size-5" />
                  Buka meja triage
                </a>
              </div>
            </div>

            <div className="border-t-2 border-[#121212] bg-[#F1EDE3] p-5 sm:p-7 lg:border-l-2 lg:border-t-0 lg:p-8">
              <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">
                Ringkasan cepat
              </p>
              <dl className="mt-5 space-y-4">
                <div className="border-b-2 border-[#121212] pb-4">
                  <dt className="text-sm font-bold text-[#525252]">Listing aktif</dt>
                  <dd className="mt-1 text-3xl font-black tracking-[-0.05em]">
                    {activeItems.length}
                  </dd>
                </div>
                <div className="border-b-2 border-[#121212] pb-4">
                  <dt className="text-sm font-bold text-[#525252]">
                    Butuh tindakan
                  </dt>
                  <dd className="mt-1 text-3xl font-black tracking-[-0.05em] text-[#C73E16]">
                    {actionableCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-[#525252]">
                    Pembaruan terakhir
                  </dt>
                  <dd className="mt-1 text-base font-black">{formatDate(latestUpdate)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {notice ? (
          <div
            className="mt-5 flex items-start gap-3 border-2 border-[#121212] bg-[#FFE662] px-4 py-3 shadow-[3px_3px_0_#121212]"
            role="status"
          >
            <Check className="mt-0.5 size-5 shrink-0" />
            <p className="min-w-0 flex-1 text-base font-black text-[#1A1A1A]">
              {notice}
            </p>
            <button
              type="button"
              onClick={() => setNotice("")}
              className="admin-icon-btn"
              aria-label="Tutup pemberitahuan"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {error ? (
          <div
            className="mt-5 flex items-start gap-3 border-2 border-[#121212] bg-[#E9B4A7] px-4 py-3 text-[#7C2D12] shadow-[3px_3px_0_#121212]"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p className="text-base font-black">{error}</p>
          </div>
        ) : null}

        <AdminGovernance />

        <AdminMetricsBoard
          metrics={metrics}
          impactMetrics={impactMetrics}
          categoryCounts={communityMetrics?.byCategory ?? {}}
          areaCounts={communityMetrics?.byArea ?? {}}
          loadingBreakdown={!communityMetrics}
        />

        <section className="mt-8 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
          <div className="admin-panel overflow-hidden">
            <SectionHeading
              eyebrow="Papan aksi"
              title="Yang perlu dikerjakan"
              description="Prioritas berasal dari status listing, kelengkapan data, dan laporan warga."
              icon={Inbox}
            />
            <div className="p-5 sm:p-6">
              <div className="flex items-end justify-between gap-4 border-2 border-[#121212] bg-[#FFE662] p-4 shadow-[3px_3px_0_#121212]">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.12em] text-[#525252]">
                    Antrean aktif
                  </p>
                  <p className="mt-1 text-4xl font-black tracking-[-0.06em]">
                    {actionableCount}
                  </p>
                </div>
                <p className="max-w-52 text-right text-sm font-bold leading-5 text-[#525252]">
                  {actionableCount > 0
                    ? "Prioritaskan nomor, kelengkapan, dan laporan."
                    : "Tidak ada tindakan tertunda."}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="border-2 border-[#121212] bg-[#FF5A26] p-3 text-white">
                  <p className="text-sm font-bold">Belum diklaim</p>
                  <p className="mt-1 text-3xl font-black">{unclaimedItems.length}</p>
                </div>
                <div className="border-2 border-[#121212] bg-[#DCEBD7] p-3 text-[#24533A]">
                  <p className="text-sm font-bold">Terkonfirmasi</p>
                  <p className="mt-1 text-3xl font-black">{confirmedItems.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-panel overflow-hidden">
            <SectionHeading
              eyebrow="Pemberitahuan kerja"
              title="Catatan terakhir"
              description="Ringkasan perubahan kondisi katalog tanpa memindahkan tugas away dari meja triage."
              icon={BellIcon}
            />
            <div className="space-y-3 p-4 sm:p-6">
              {notificationItems.length > 0 ? (
                notificationItems.map((notification) => {
                  const Icon = notification.icon;
                  return (
                    <div
                      key={notification.title}
                      className="flex items-start gap-3 border-2 border-[#121212] bg-[#F5F0E5] p-3"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center border-2 border-[#121212] bg-white">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-base font-black text-[#1A1A1A]">
                          {notification.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#525252]">
                          {notification.body}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-start gap-3 border-2 border-[#121212] bg-[#DCEBD7] p-4 text-[#24533A]">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="text-base font-black">Katalog dalam kondisi baik</p>
                    <p className="mt-1 text-sm leading-6">
                      Tidak ada draft, arsip, atau data listing aktif yang perlu dilengkapi.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {reports.length > 0 ? (
          <AdminReportReview
            reports={reports}
            busyAction={busyAction}
            onUpdateStatus={updateReportStatus}
          />
        ) : null}

        {draft ? (
          <section id="admin-editor" className="admin-panel admin-panel-lg mt-8 scroll-mt-28 overflow-hidden">
            <div className="flex flex-col gap-4 border-b-2 border-[#121212] bg-[#FFE662] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">
                  {draft.slug ? "Sunting listing" : "Listing baru"}
                </p>
                <h2 className="mt-1 text-[clamp(1.5rem,3vw,2.25rem)] font-black tracking-[-0.04em]">
                  Ceritakan usaha ini
                </h2>
                <p className="mt-1 text-base leading-7 text-[#525252]">
                  Isi data yang bisa ditemukan dan dipercaya warga.
                </p>
              </div>
              <button
                type="button"
                onClick={resetEditor}
                className="admin-icon-btn shrink-0"
                aria-label="Tutup formulir"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 lg:p-8">
              <div className="border-2 border-[#121212] bg-[#F1EDE3] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-black">Kualitas listing</p>
                    <p className="mt-1 text-sm font-bold text-[#525252]">
                      Kelengkapan {completeness}%
                    </p>
                  </div>
                  <div
                    className="admin-progress-track w-full sm:max-w-xs"
                    role="progressbar"
                    aria-label="Kelengkapan listing"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={completeness}
                  >
                    <div
                      className="admin-progress-value"
                      style={{ width: `${completeness}%` }}
                    />
                  </div>
                </div>
                {issues.length > 0 ? (
                  <p className="mt-3 border-l-4 border-[#FF5A26] pl-3 text-sm font-black text-[#7C2D12]">
                    Perlu dilengkapi: {issues.join(" · ")}
                  </p>
                ) : (
                  <p className="mt-3 text-sm font-black text-[#24533A]">
                    Data utama sudah lengkap.
                  </p>
                )}
                {duplicate && duplicate.score >= 0.6 ? (
                  <p className="mt-2 text-sm font-black text-[#7C2D12]">
                    Potensi duplikat: {duplicate.item.name}
                  </p>
                ) : null}
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <Field
                  label="Nama usaha"
                  value={draft.name}
                  onChange={(name) => updateDraft({ name })}
                  placeholder="Contoh: Bengkel Svetrum"
                  required
                />
                <label className="flex min-w-0 flex-col gap-2" htmlFor={categoryFieldId}>
                  <span className="text-base font-black">Kategori</span>
                  <ThemedSelect
                    id={categoryFieldId}
                    variant="admin"
                    value={draft.category}
                    onValueChange={(value) =>
                      updateDraft({ category: value as Category })
                    }
                    options={categorySelectOptions}
                  />
                </label>
                <Field
                  label="Nomor WhatsApp"
                  value={draft.phone}
                  onChange={(phone) => updateDraft({ phone })}
                  placeholder="628xxxxxxxxxx"
                  type="tel"
                  required
                />
                <Field
                  label="Harga mulai dari"
                  value={draft.price}
                  onChange={(price) => updateDraft({ price })}
                  placeholder="Mulai Rp50.000"
                />
                <label className="flex min-w-0 flex-col gap-2" htmlFor={landmarkFieldId}>
                  <span className="text-base font-black">Patokan lokasi</span>
                  <ThemedSelect
                    id={landmarkFieldId}
                    variant="admin"
                    value={draft.landmark}
                    onValueChange={(value) => updateDraft({ landmark: value })}
                    options={landmarkSelectOptions}
                  />
                </label>
                <Field
                  label="Latitude (opsional)"
                  value={draft.lat?.toString() ?? ""}
                  onChange={(value) => {
                    const parsed = Number(value);
                    updateDraft({
                      lat: value.trim() === "" || Number.isNaN(parsed) ? undefined : parsed,
                    });
                  }}
                  placeholder="-7.009"
                  type="number"
                />
                <Field
                  label="Longitude (opsional)"
                  value={draft.lng?.toString() ?? ""}
                  onChange={(value) => {
                    const parsed = Number(value);
                    updateDraft({
                      lng: value.trim() === "" || Number.isNaN(parsed) ? undefined : parsed,
                    });
                  }}
                  placeholder="114.448"
                  type="number"
                />
                <p className="text-sm leading-6 text-[#525252] lg:col-span-2">
                  Isi koordinat agar listing dapat difilter berdasarkan jarak pengguna.
                  Koordinat hanya dipakai untuk perhitungan jarak.
                </p>
                <label className="flex min-w-0 flex-col gap-2" htmlFor={statusFieldId}>
                  <span className="text-base font-black">Status tayang</span>
                  <ThemedSelect
                    id={statusFieldId}
                    variant="admin"
                    value={draft.status ?? "active"}
                    onValueChange={(value) =>
                      updateDraft({
                        status: value as Vendor["status"],
                      })
                    }
                    options={vendorStatusSelectOptions}
                  />
                </label>
                <Field
                  label="Alamat lengkap"
                  value={draft.address}
                  onChange={(address) => updateDraft({ address })}
                  placeholder="Jalan, nomor, atau keterangan lokasi"
                  required
                />
                <Field
                  label="Jam kerja"
                  value={draft.hours}
                  onChange={(hours) => updateDraft({ hours })}
                  placeholder="Setiap hari · 07.00–17.00"
                />
                <label className="flex min-w-0 flex-col gap-2" htmlFor={availabilityFieldId}>
                  <span className="text-base font-black">Status ketersediaan</span>
                  <ThemedSelect
                    id={availabilityFieldId}
                    variant="admin"
                    value={draft.availability ?? "available"}
                    onValueChange={(value) =>
                      updateDraft({
                        availability: value as Vendor["availability"],
                      })
                    }
                    options={availabilitySelectOptions}
                  />
                </label>
                <Field
                  label="Catatan ketersediaan"
                  value={draft.availabilityNote ?? ""}
                  onChange={(availabilityNote) => updateDraft({ availabilityNote })}
                  placeholder="Contoh: Bisa datang hari ini setelah jam 3"
                />
                <Field
                  label="Perkiraan tersedia lagi"
                  value={toDateTimeLocal(draft.nextAvailableAt)}
                  onChange={(value) => {
                    const timestamp = value ? new Date(value).getTime() : NaN;
                    updateDraft({
                      nextAvailableAt:
                        Number.isNaN(timestamp) ? undefined : timestamp,
                    });
                  }}
                  placeholder="Pilih tanggal dan jam"
                  type="datetime-local"
                />
                <Field
                  label="Rata-rata balas (menit)"
                  value={draft.responseMinutes?.toString() ?? ""}
                  onChange={(value) =>
                    updateDraft({
                      responseMinutes:
                        value.trim() === "" || Number.isNaN(Number(value))
                          ? undefined
                          : Number(value),
                    })
                  }
                  placeholder="Contoh: 45"
                  type="number"
                />
                <Field
                  label="Radius layanan (km)"
                  value={draft.serviceRadiusKm?.toString() ?? ""}
                  onChange={(value) =>
                    updateDraft({
                      serviceRadiusKm:
                        value.trim() === "" || Number.isNaN(Number(value))
                          ? undefined
                          : Number(value),
                    })
                  }
                  placeholder="Contoh: 10"
                  type="number"
                />
                <label className="flex min-w-0 flex-col gap-2 lg:col-span-2">
                  <span className="text-base font-black">Deskripsi singkat</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    placeholder="Ceritakan layanan yang tersedia atau keunggulan usaha ini."
                    rows={3}
                    className={inputClass}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-base font-black">
                    Foto usaha <span className="font-bold text-[#525252]">(maks. 1 MB)</span>
                  </span>
                  <span className="flex min-h-12 cursor-pointer items-center gap-3 border-2 border-dashed border-[#121212] bg-[#F1EDE3] px-3 text-base font-black text-[#1A1A1A] hover:bg-[#FFE662] focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#FF5A26]">
                    <Upload className="size-5 shrink-0" />
                    {photo ? "Foto dipilih — akan disimpan" : "Unggah foto (opsional)"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => handlePhoto(event.target.files?.[0])}
                      className="sr-only"
                    />
                  </span>
                  {photo ? (
                    <img
                      src={photo}
                      alt="Pratinjau foto usaha"
                      className="mt-2 aspect-[16/9] w-full max-w-sm border-2 border-[#121212] object-cover shadow-[3px_3px_0_#121212]"
                    />
                  ) : null}
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-base font-black">Tag pencarian</span>
                  <input
                    value={draft.tags.join(", ")}
                    onChange={(event) =>
                      updateDraft({
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="servis, dekat, cepat"
                    className={inputClass}
                  />
                </label>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 border-2 border-[#121212] bg-[#F1EDE3] px-3 text-base font-black hover:bg-[#FFE662] focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#FF5A26]">
                  <input
                    type="checkbox"
                    checked={draft.featured ?? false}
                    onChange={(event) => updateDraft({ featured: event.target.checked })}
                    className="admin-check"
                  />
                  <Sparkles className="size-5 text-[#FF5A26]" />
                  Tampilkan sebagai pilihan warga
                </label>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 border-2 border-[#121212] bg-[#F1EDE3] px-3 text-base font-black hover:bg-[#FFE662] focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#FF5A26]">
                  <input
                    type="checkbox"
                    checked={draft.verified ?? false}
                    onChange={(event) => updateDraft({ verified: event.target.checked })}
                    className="admin-check"
                  />
                  <FileCheck2 className="size-5 text-[#1A1A1A]" />
                  Tampilkan sebagai terverifikasi
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t-2 border-[#121212] pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => draft && setPreview(draft)}
                  className={secondaryButtonClass}
                >
                  <Eye className="size-5" />
                  Pratinjau listing
                </button>
                <button type="button" onClick={resetEditor} className={quietButtonClass}>
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!draft.name.trim() || !draft.phone.trim() || saving}
                  className="admin-btn admin-btn-primary"
                >
                  {saving ? (
                    <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />
                  ) : (
                    <Save className="size-5" />
                  )}
                  {saving ? "Menyimpan..." : "Simpan listing"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section id="admin-triage" className="admin-panel admin-panel-lg mt-8 scroll-mt-28 overflow-hidden">
          <SectionHeading
            eyebrow="Triage vendor"
            title="Meja kerja listing"
            description="Cari, saring, periksa nomor, lalu putuskan status tanpa meninggalkan halaman admin."
            icon={Building2}
            action={
              <button
                type="button"
                onClick={startNew}
                className="admin-btn admin-btn-primary"
              >
                <Plus className="size-5" />
                Tambah
              </button>
            }
          />

          <div className="border-b-2 border-[#121212] bg-[#F1EDE3] p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(18rem,1fr)_13rem_13rem_auto]">
              <label className="relative block">
                <span className="sr-only">Cari listing</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#525252]"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nama, kategori, alamat, atau nomor..."
                className={`${inputClass} pl-11 sm:col-span-2 lg:col-span-1`}
                type="search"
                />
              </label>
              <label className="min-w-0" htmlFor="admin-status-filter">
                <span className="sr-only">Filter status vendor</span>
                <ThemedSelect
                  id="admin-status-filter"
                  variant="admin"
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as ModerationFilter)
                  }
                  options={statusFilters}
                />
              </label>
              <label className="min-w-0" htmlFor="admin-category-filter">
                <span className="sr-only">Filter kategori</span>
                <ThemedSelect
                  id="admin-category-filter"
                  variant="admin"
                  value={categoryFilter}
                  onValueChange={(value) =>
                    setCategoryFilter(value as "all" | Category)
                  }
                  options={categoryFilterSelectOptions}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
                disabled={!search && statusFilter === "all" && categoryFilter === "all"}
                className="admin-btn admin-btn-secondary sm:col-span-2 lg:col-span-1"
              >
                <Filter className="size-5" />
                Reset
              </button>
            </div>
            <p className="mt-3 text-sm font-bold text-[#525252]">
              Menampilkan {filteredItems.length} dari {items.length} listing
            </p>
          </div>

          <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(9rem,.65fr)_minmax(13rem,.8fr)] gap-4 border-b-2 border-[#121212] bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.1em] text-[#525252] lg:grid">
            <span>Vendor & kategori</span>
            <span>Status moderasi</span>
            <span>Kontak, kualitas & aksi</span>
          </div>

          <div className="divide-y-2 divide-[#121212]">
            {filteredItems.map((item) => {
              const moderation = statusInfo(item);
              const itemIssues = qualityIssues(item as Vendor);
              const itemCompleteness = profileCompleteness(item);
              const waHref = whatsappHref(item.phone);
              const isActive = (item.status ?? "active") === "active";
              const itemBusyPrefix = `${item._id}:`;

              return (
                <article
                  key={item._id}
                  className="grid gap-4 bg-white p-4 transition-colors hover:bg-[#FFFCF5] sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(9rem,.65fr)_minmax(13rem,.8fr)] lg:px-6"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex size-14 shrink-0 items-center justify-center border-2 border-[#121212] bg-gradient-to-br ${item.accent} text-base font-black text-white shadow-[2px_2px_0_#121212]`}
                      aria-hidden="true"
                    >
                      {item.mark}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 break-words text-lg font-black tracking-[-0.025em] text-[#1A1A1A]">
                          {item.name}
                        </h3>
                        {!item.phone.trim() ? (
                          <span className="admin-status admin-status-warning">
                            Tanpa nomor
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-base font-black text-[#525252]">
                        {item.category}
                      </p>
                      <p className="mt-1 flex items-start gap-1.5 text-sm leading-6 text-[#525252]">
                        <MapPin className="mt-1 size-4 shrink-0" />
                        {item.address || "Alamat belum diisi"} · {landmarkLabel(item.landmark)}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#525252]">
                        Diperbarui {formatDate(item.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <span className={`admin-status admin-status-${moderation.key}`}>
                      {moderation.label}
                    </span>
                    <p className="mt-2 text-sm leading-6 text-[#525252]">
                      {moderation.hint}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#1A1A1A]">
                      Klaim: {item.ownerId || item.businessId ? "Ada" : "Belum ada"}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="border-2 border-[#121212] bg-[#F5F0E5] p-2">
                        <p className="font-bold text-[#525252]">Kualitas</p>
                        <p className="mt-0.5 text-base font-black">
                          {itemCompleteness}%
                        </p>
                      </div>
                      <div className="border-2 border-[#121212] bg-[#F5F0E5] p-2">
                        <p className="font-bold text-[#525252]">Klik WA</p>
                        <p className="mt-0.5 text-base font-black">
                          {Number(item.whatsappClicks ?? 0).toLocaleString("id-ID")}
                        </p>
                      </div>
                    </div>

                    <p className="mt-2 flex items-center gap-2 break-all text-sm font-black">
                      <Phone className="size-4 shrink-0" />
                      {formatPhone(item.phone)}
                    </p>
                    {itemIssues.length > 0 ? (
                      <p className="mt-1 text-sm font-bold text-[#7C2D12]">
                        {itemIssues.length} data perlu dilengkapi
                      </p>
                    ) : null}

                    <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
                      {waHref ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn admin-btn-secondary w-full min-w-0 px-2 sm:px-3"
                        >
                          <MessageCircle className="size-4 shrink-0" />
                          Cek WA
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="admin-btn admin-btn-secondary w-full min-w-0 px-2 sm:px-3"
                        >
                          <MessageCircle className="size-4 shrink-0" />
                          Cek WA
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!item.phone.trim() || busyAction === `${itemBusyPrefix}approve`}
                        onClick={() => void approveVendor(item)}
                        className="admin-btn admin-btn-primary w-full min-w-0 px-2 sm:px-3"
                      >
                        <Check className="size-4 shrink-0" />
                        Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingConfirmation({ kind: "reject", vendor: item })}
                        className="admin-btn admin-btn-danger w-full min-w-0 px-2 sm:px-3"
                      >
                        <X className="size-4 shrink-0" />
                        Tolak
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-[#121212] pt-3">
                      <label className="inline-flex min-h-12 items-center gap-2 border-2 border-[#121212] bg-[#F5F0E5] px-2">
                        <span className="text-sm font-black">Aktif</span>
                        <Switch
                          checked={isActive}
                          disabled={
                            busyAction === `${itemBusyPrefix}archive` ||
                            busyAction === `${itemBusyPrefix}activate`
                          }
                          onCheckedChange={() => void toggleActive(item)}
                          className="admin-switch"
                          aria-label={`${isActive ? "Nonaktifkan" : "Aktifkan"} ${item.name}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void toggleFeatured(item)}
                        disabled={busyAction === `${itemBusyPrefix}featured`}
                        className={`admin-btn px-3 ${item.featured ? "admin-btn-highlight" : "admin-btn-secondary"}`}
                      >
                        <Sparkles className="size-4" />
                        {item.featured ? "Jadikan biasa" : "Jadikan unggulan"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingConfirmation({ kind: "delete", vendor: item })}
                        className="admin-icon-btn"
                        aria-label={`Hapus ${item.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {isActive ? (
                        <Link
                          to={`/v/${item.slug}`}
                          className="admin-btn admin-btn-secondary px-3"
                        >
                          <ArrowUpRight className="size-4" />
                          Lihat
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-12 items-center border-2 border-[#121212] bg-[#E7E5E4] px-3 text-sm font-black text-[#525252]">
                          Tidak tayang
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="admin-btn admin-btn-secondary px-3"
                      >
                        <Pencil className="size-4" />
                        Sunting
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-3">
                    <AdminPackageManager vendorId={item._id} vendorName={item.name} />
                  </div>
                </article>
              );
            })}

            {filteredItems.length === 0 ? (
              <div className="p-6 text-center sm:p-10">
                <span className="mx-auto flex size-14 items-center justify-center border-2 border-[#121212] bg-[#FFE662] shadow-[3px_3px_0_#121212]">
                  <Search className="size-6" />
                </span>
                <h3 className="mt-4 text-xl font-black">Listing tidak ditemukan</h3>
                <p className="mx-auto mt-2 max-w-lg text-base leading-7 text-[#525252]">
                  Ubah kata kunci atau reset filter untuk melihat seluruh data katalog.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <AlertDialogPrimitive.Root
        open={Boolean(pendingConfirmation)}
        onOpenChange={(open) => {
          if (!open && !confirming) setPendingConfirmation(null);
        }}
      >
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="admin-confirm-overlay" />
          <AlertDialogPrimitive.Content className="admin-confirm-content">
            <div className="border-b-2 border-[#121212] bg-[#E9B4A7] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center border-2 border-[#121212] bg-white shadow-[2px_2px_0_#121212]">
                  <AlertTriangle className="size-6 text-[#7C2D12]" />
                </span>
                <div>
                  <AlertDialogPrimitive.Title className="text-[clamp(1.25rem,3vw,1.75rem)] font-black tracking-[-0.03em] text-[#1A1A1A]">
                    {pendingConfirmation?.kind === "reject"
                      ? "Tolak listing ini?"
                      : "Hapus listing dari katalog?"}
                  </AlertDialogPrimitive.Title>
                  <AlertDialogPrimitive.Description className="mt-2 text-base leading-7 text-[#1A1A1A]">
                    {pendingConfirmation?.kind === "reject"
                      ? `${pendingConfirmation.vendor.name} akan ditolak dan diarsipkan. Data tetap disimpan di ruang admin, tetapi listing tidak tampil di katalog.`
                      : `${pendingConfirmation?.vendor.name ?? "Listing ini"} akan diarsipkan dan tidak lagi tampil di katalog. Aksi ini tidak dapat dibatalkan dari halaman ini.`}
                  </AlertDialogPrimitive.Description>
                </div>
              </div>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
              <AlertDialogPrimitive.Cancel
                disabled={confirming}
                className="admin-btn admin-btn-secondary"
              >
                Batalkan
              </AlertDialogPrimitive.Cancel>
              <button
                type="button"
                disabled={confirming}
                onClick={() => void confirmDestructiveAction()}
                className="admin-btn bg-[#FF5A26] text-white"
              >
                {confirming ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />
                ) : pendingConfirmation?.kind === "reject" ? (
                  <X className="size-5" />
                ) : (
                  <Trash2 className="size-5" />
                )}
                {confirming
                  ? "Memproses..."
                  : pendingConfirmation?.kind === "reject"
                    ? "Ya, tolak listing"
                    : "Ya, hapus listing"}
              </button>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </div>
  );
}

function BellIcon(props: React.ComponentProps<typeof Inbox>) {
  return <Inbox {...props} />;
}
