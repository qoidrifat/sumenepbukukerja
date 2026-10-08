import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { AdminMetricsBoard } from "@/components/admin-metrics-board";
import { type Vendor } from "@/lib/catalog";
import { qualityIssues } from "@/lib/catalog-data";
import {
  useAdminVendors,
  useCommunityMetrics,
  useOpenReports,
  type VendorRecord,
} from "@/lib/catalog-store";
import { statusInfo } from "@/lib/admin-workspace-helpers";

const EMPTY_ITEMS: VendorRecord[] = [];

/**
 * Halaman Sistem di `/admin/sistem`.
 *
 * Isinya PINDAHAN verbatim dari `Admin.tsx` (blok `AdminMetricsBoard` +
 * hook metriknya): turunan angka, susunan `metrics`/`impactMetrics`, dan
 * props papan tidak diubah — hanya tempatnya yang pindah ke rute bertingkat
 * supaya dirender di dalam `<Outlet/>` milik `AdminShell`.
 */
export function SistemPage() {
  const items = useAdminVendors() ?? EMPTY_ITEMS;
  const reports = useOpenReports() ?? [];
  const communityMetrics = useCommunityMetrics();

  const activeItems = items.filter((item) => (item.status ?? "active") === "active");
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

  return (
    <main className="admin-shell-frame mx-auto max-w-[1600px] px-3 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-10">
      <AdminMetricsBoard
        metrics={metrics}
        impactMetrics={impactMetrics}
        categoryCounts={communityMetrics?.byCategory ?? {}}
        areaCounts={communityMetrics?.byArea ?? {}}
        loadingBreakdown={!communityMetrics}
      />
    </main>
  );
}
