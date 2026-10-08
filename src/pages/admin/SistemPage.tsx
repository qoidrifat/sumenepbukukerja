import { useState } from "react";
import { useOutletContext } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { AdminHeader, inputClass } from "@/components/admin-workspace";
import { InviteLinkResult } from "@/components/admin-invite-link";
import { ThemedSelect } from "@/components/ui/themed-select";
import { staffRoleSelectOptions } from "@/lib/select-options";
import { OWNER_ACCOUNT_TITLE } from "@/lib/owner-account";
import { AdminMetricsBoard } from "@/components/admin-metrics-board";
import { type Vendor } from "@/lib/catalog";
import { qualityIssues } from "@/lib/catalog-data";
import {
  useAdminVendors,
  useCommunityMetrics,
  useCurrentAccess,
  useOpenReports,
  useStaffInvites,
  useStaffMembers,
  type VendorRecord,
} from "@/lib/catalog-store";
import { statusInfo } from "@/lib/admin-workspace-helpers";
import { useAuth } from "@/hooks/use-auth";
import { useAdminPresence } from "@/lib/admin-presence";

const EMPTY_ITEMS: VendorRecord[] = [];

/**
 * Halaman Sistem di `/admin/sistem`.
 *
 * Isinya PINDAHAN verbatim dari `Admin.tsx` (blok `AdminMetricsBoard` +
 * hook metriknya) dan dari `admin-governance.tsx` (blok "Peran pengelola"
 * + hook undangan/anggota dan mutasinya): turunan angka, susunan
 * `metrics`/`impactMetrics`, props papan, formulir invite, dan perilaku
 * visibility gating tidak diubah — hanya tempatnya yang pindah ke rute
 * bertingkat supaya dirender di dalam `<Outlet/>` milik `AdminShell`.
 * Tidak ada halaman `/admin/peran` di IA; peran/undangan hidup di sini.
 *
 * Bingkai ganda SENGAJA dilepas: shell sudah memberi `.admin-shell-frame`,
 * jadi halaman ini hanya `<div>` polos. Header milik halaman ini (bukan
 * shell): peran dari `useCurrentAccess`, nama dari sesi auth, foto dari
 * `myProfile` server, dan lonceng antrean dari konteks `<Outlet/>`.
 */
export function SistemPage() {
  const access = useCurrentAccess();
  // Nama akun sendiri hanya untuk menu header. Diambil dari `useAuth` yang
  // sudah ada, bukan query tambahan, supaya header tidak menambah permintaan
  // jaringan hanya untuk satu kalimat.
  const { user } = useAuth();
  // Foto profil TIDAK bisa diambil dari `useAuth`. Sesi auth tidak membawa
  // `profileImageStorageId`, dan memang tidak seharusnya - storage id adalah
  // kunci internal. `myProfile` menghitung URL-nya di server, jadi satu
  // query ini sudah cukup dan tidak membuka apa pun ke klien.
  const myProfile = useQuery(api.users.myProfile, {});
  // Lonceng antrean dihitung SEKALI di `AdminShell` lalu diteruskan lewat
  // konteks `<Outlet/>`; halaman mengambilnya di sini supaya badge-nya hidup
  // tanpa langganan query sendiri.
  const outlet = useOutletContext<{
    reviewQueue?: { claims: number; photos: number; reports: number; total: number };
  } | null>();
  const headerQueue = outlet?.reviewQueue ?? undefined;
  // Menandai sesi ini sebagai aktif supaya panel audit bisa menampilkan
  // "Aktif sekarang" pada baris dengan sidik jari yang sama.
  useAdminPresence();
  const items = useAdminVendors() ?? EMPTY_ITEMS;
  const reports = useOpenReports() ?? [];
  const communityMetrics = useCommunityMetrics();
  const members = useStaffMembers(Boolean(access?.canManageRoles));
  const invites = useStaffInvites(Boolean(access?.canManageRoles));
  const createInvite = useMutation(api.users.createStaffInvite);
  const acceptInvite = useMutation(api.users.acceptStaffInvite);
  const changeRole = useMutation(api.users.changeStaffRole);
  const revokeInvite = useMutation(api.users.revokeStaffInvite);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff" | "viewer">("staff");
  // Tautan lengkap, disusun dari origin browser supaya benar di
  // preview, staging, dan produksi tanpa konfigurasi tambahan.
  const [inviteLink, setInviteLink] = useState<{
    url: string;
    email: string;
    role: string;
    expiresAt: number;
  } | null>(null);
  const [acceptCode, setAcceptCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const run = async (key: string, task: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const result = await task();
      // Sebagian mutasi mengembalikan `{ ok: false }` alih-alih melempar,
      // supaya penolakannya sempat tercatat di audit. Menampilkan
      // "berhasil" untuk hasil seperti itu akan berbohong ke operator.
      if (result && typeof result === "object" && "ok" in result && (result as { ok?: unknown }).ok === false) {
        const message = (result as { message?: string }).message;
        setError(message ?? "Aksi governance belum dapat diselesaikan.");
        return;
      }
      setNotice(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Aksi governance belum dapat diselesaikan.");
    } finally {
      setBusy("");
    }
  };

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
    <div>
      <AdminHeader
        role={access?.role ?? undefined}
        isOwner={access?.isOwner ?? false}
        accountName={user?.name ?? null}
        accountImageUrl={myProfile?.imageUrl ?? null}
        reviewQueue={headerQueue}
      />
      <AdminMetricsBoard
        metrics={metrics}
        impactMetrics={impactMetrics}
        categoryCounts={communityMetrics?.byCategory ?? {}}
        areaCounts={communityMetrics?.byArea ?? {}}
        loadingBreakdown={!communityMetrics}
      />

      {/* Panel Peran pengelola hanya dirender untuk akun pemilik.
            Alasannya bukan sekadar hak akses: panel ini mencantumkan siapa
            saja yang punya peran, jadi menampilkannya kepada admin biasa
            memberi peta jalan untuk mencoba naik level. Server sudah menolak
            perubahan peran di luar akun pemilik; menyembunyikan panel ini
            membuat tampilan berhenti menjanjikan sesuatu yang memang tidak
            bisa dilakukan. */}
      {access?.isOwner ? (
      <article className="admin-panel mt-8 overflow-hidden">
        <div className="border-b-2 border-[#121212] bg-[#FFE662] p-4 sm:p-6">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">Sistem</p>
          <h2 className="mt-1 text-2xl font-black text-[#1A1A1A]">Peran pengelola</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#525252]">Semua keputusan di bawah diverifikasi ulang di server. Frontend hanya menampilkan aksi; bukan sumber kebenaran role.</p>
        </div>
        <div className="p-4 sm:p-6">
          {access.canManageRoles ? <form onSubmit={(event) => { event.preventDefault(); void run("invite", async () => { const result = await createInvite({ email, role: inviteRole });
            setInviteLink({
              url: `${window.location.origin}/invite/${result.token}`,
              email: result.email,
              role: result.role,
              expiresAt: result.expiresAt,
            });
            setEmail(""); }, "Tautan undangan dibuat. Bagikan sekali lewat kanal pribadi."); }} className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto]"><label className="sr-only" htmlFor="staff-invite-email">Email pengelola</label><input id="staff-invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@contoh.id" className={inputClass} required /><label className="sr-only" htmlFor="staff-invite-role">Peran pengelola</label><ThemedSelect id="staff-invite-role" variant="admin" value={inviteRole} onValueChange={(value) => setInviteRole(value as typeof inviteRole)} options={staffRoleSelectOptions} /><button type="submit" className="admin-btn admin-btn-primary" disabled={busy === "invite"}>Buat invite</button></form> : <p className="mt-3 text-sm text-[#525252]">Hanya admin yang dapat membuat atau mengubah peran.</p>}
          {inviteLink ? <InviteLinkResult url={inviteLink.url} email={inviteLink.email} role={inviteLink.role} expiresAt={inviteLink.expiresAt} /> : null}
          <form onSubmit={(event) => { event.preventDefault(); void run("accept", () => acceptInvite({ token: acceptCode }), "Peran akun diperbarui."); }} className="mt-3 flex gap-2"><label className="sr-only" htmlFor="staff-accept-code">Kode undangan</label><input id="staff-accept-code" value={acceptCode} onChange={(event) => setAcceptCode(event.target.value)} placeholder="Tempel kode undangan" className={inputClass} required /><button type="submit" className="admin-btn admin-btn-secondary" disabled={busy === "accept"}>Terima</button></form>
          <div className="mt-4 space-y-2">{members?.map((member) => <div key={member._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6D3D1] pb-2 text-sm"><span className="font-bold">{member.name} · {member.email}</span>{access.canManageRoles && !member.roleLocked ? <ThemedSelect aria-label={`Peran ${member.name}`} variant="admin" size="sm" className="w-auto min-w-[7.5rem]" value={member.role} onValueChange={(value) => void run(member._id, () => changeRole({ userId: member.userId as never, role: value as "admin" | "staff" | "viewer" }), "Peran diperbarui.")} options={staffRoleSelectOptions} /> : member.roleLocked ? <span className="admin-status admin-status-confirmed text-xs" title="Gelar khusus akun pemilik. Perannya hanya dapat diubah oleh pemilik akun tersebut">{OWNER_ACCOUNT_TITLE}</span> : <span className="admin-status admin-status-unclaimed text-xs">{member.role}</span>}</div>)}</div>
          {invites?.filter((invite) => !invite.acceptedAt && !invite.revokedAt).length ? <details className="admin-disclosure mt-3"><summary>Undangan aktif</summary><ul className="admin-disclosure-body space-y-2">{invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt).map((invite) => <li key={invite._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6D3D1] pb-2 text-sm last:border-b-0"><span className="min-w-0 break-all">{invite.email} · {invite.role}</span><button type="button" className="admin-btn admin-btn-danger px-2 py-1 text-xs" onClick={() => void run(invite._id, () => revokeInvite({ inviteId: invite._id }), "Undangan dicabut.")}>Cabut</button></li>)}</ul></details> : null}
        </div>
        {notice ? <p className="border-t-2 border-[#121212] bg-[#DCEBD7] px-4 py-3 text-sm font-black text-[#24533A]" role="status">{notice}</p> : null}
        {error ? <p className="border-t-2 border-[#121212] bg-[#E9B4A7] px-4 py-3 text-sm font-black text-[#7C2D12]" role="alert">{error}</p> : null}
      </article>
      ) : null}
    </div>
  );
}
