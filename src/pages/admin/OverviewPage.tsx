import { useNavigate } from "react-router";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileEdit,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/admin-workspace";
import { AdminWorkspaceHero } from "@/components/admin-workspace-hero";
import { type Vendor } from "@/lib/catalog";
import { qualityIssues } from "@/lib/catalog-data";
import {
  useAdminVendors,
  useOpenReports,
  type VendorRecord,
} from "@/lib/catalog-store";
import { statusInfo, type QueueFilter } from "@/lib/admin-workspace-helpers";
import { useAdminPresence } from "@/lib/admin-presence";

const EMPTY_ITEMS: VendorRecord[] = [];

/**
 * Halaman Ringkasan di `/admin` (rute indeks ruang pengelola).
 *
 * Isinya PINDAHAN verbatim dari `Admin.tsx` (blok `AdminWorkspaceHero` +
 * papan aksi "Yang perlu dikerjakan" + catatan "Catatan terakhir" beserta
 * turunan angkanya): susunan shortcut, predikat hitungan, dan copy
 * pemberitahuan tidak diubah — hanya tempatnya yang pindah ke rute
 * bertingkat supaya dirender di dalam `<Outlet/>` milik `AdminShell`.
 *
 * Dua tombol hero yang dulu melompat ke `#admin-triage` sekarang menaut ke
 * `/admin/katalog`, karena meja triage-nya pindah halaman. "Tambah listing"
 * membuka halaman katalog (editornya hidup di sana); shortcut antrean
 * membuka halaman yang sama dan penyaringannya dilakukan di sana.
 *
 * Header kini milik `AdminShell` (sticky di puncak viewport); halaman ini
 * hanya menyajikan isi.
 */
export function OverviewPage() {
  // Menandai sesi ini sebagai aktif supaya panel audit bisa menampilkan
  // "Aktif sekarang" pada baris dengan sidik jari yang sama.
  useAdminPresence();
  const navigate = useNavigate();
  const items = useAdminVendors() ?? EMPTY_ITEMS;
  const reports = useOpenReports() ?? [];

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
  const actionableCount =
    draftItems.length + archivedItems.length + incompleteItems.length;
  /**
   * Shortcut di bawah angka "Butuh tindakan".
   *
   * Angkanya dihitung dengan predikat yang sama dengan filter meja triage, jadi
   * isi shortcut dan isi tabel tidak akan pernah berbeda. Antrean dengan
   * jumlah 0 disembunyikan: menautkan ke tabel yang sudah kosong hanya menambah
   * satu klik tanpa menambah pekerjaan apa pun.
   */
  const actionShortcuts = (
    [
      {
        queue: "draft" as const,
        label: "Listing berstatus draft",
        count: draftItems.length,
        icon: FileEdit,
      },
      {
        queue: "archived" as const,
        label: "Listing diarsipkan",
        count: archivedItems.length,
        icon: Archive,
      },
      {
        queue: "incomplete" as const,
        label: "Data belum lengkap",
        count: incompleteItems.length,
        icon: AlertTriangle,
      },
    ] satisfies ReadonlyArray<{ queue: QueueFilter; label: string; count: number; icon: LucideIcon }>
  ).filter((shortcut) => shortcut.count > 0);
  const latestUpdate = items.reduce(
    (latest, item) => Math.max(latest, item.updatedAt ?? 0),
    0,
  );

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

  return (
    <div>
      <AdminWorkspaceHero
        activeCount={activeItems.length}
        actionableCount={actionableCount}
        latestUpdate={latestUpdate}
        shortcuts={actionShortcuts}
        onCreate={() =>
          navigate("/admin/katalog", { state: { createNew: true } })
        }
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
            icon={Inbox}
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
    </div>
  );
}
