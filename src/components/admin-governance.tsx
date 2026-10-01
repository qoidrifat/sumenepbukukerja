import { useState } from "react";
import { InviteLinkResult } from "@/components/admin-invite-link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  useAdminHandoffPreview,
  useAnalyticsMetrics,
  useAuditLogs,
  useCurrentAccess,
  usePendingClaims,
  usePhotosForModeration,
  useRecentListingHistory,
  useStaffInvites,
  useStaffMembers,
  useWhatsappStatus,
} from "@/lib/catalog-store";
import { TimeStampLabel, inputClass } from "./admin-workspace";
import { AdminSecurityLog } from "./admin-security-log";
import { AdminSessionActions } from "./admin-session-actions";
import { AdminErrorReports } from "./admin-error-reports";
import { AdminAuditLog } from "./admin-audit-log";
import {
  ADMIN_EMPTY_MASCOT_SIZE,
  AdminEmptyMascot,
  type AdminEmptyMascotVariant,
} from "@/components/admin-empty-mascot";
import { ThemedSelect } from "@/components/ui/themed-select";
import { staffRoleSelectOptions } from "@/lib/select-options";
import { OWNER_ACCOUNT_TITLE } from "@/lib/owner-account";
import { AdminLoadingSkeleton } from "@/components/admin-loading-skeleton";

/**
 * Status visual untuk satu kartu antrean admin: `loading` saat query masih
 * berjalan, `empty` saat queue sudah terkonfirmasi 0. Wajar kalau query error:
 * `useQuery` melempar error ke RootErrorBoundary, jadi state kosong tidak pernah
 * ditampilkan sebagai "semua beres".
 */
function AdminQueueEmptyState({
  status,
  variant,
  loadingLabel,
  emptyCopy,
  emptyHint,
}: {
  status: "loading" | "empty";
  variant: AdminEmptyMascotVariant;
  loadingLabel: string;
  emptyCopy: string;
  emptyHint: string;
}) {
  if (status === "loading") {
    return (
      <div
        className="mt-3 flex flex-col gap-3 border-2 border-dashed border-[#121212] bg-[#F5F0E5] p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
        role="status"
        aria-busy="true"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-2/5 rounded-[2px] bg-[#E7E5E4]" aria-hidden="true" />
          <div className="h-3 w-1/4 rounded-[2px] bg-[#E7E5E4] motion-safe:animate-pulse" aria-hidden="true" />
          <span className="sr-only">{loadingLabel}</span>
        </div>
        <div className={ADMIN_EMPTY_MASCOT_SIZE} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-2 border-dashed border-[#121212] bg-[#F5F0E5] p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#525252]">{emptyCopy}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#525252]">{emptyHint}</p>
      </div>
      <AdminEmptyMascot variant={variant} className="self-end sm:self-center" />
    </div>
  );
}

export function AdminGovernance() {
  const access = useCurrentAccess();
  const claims = usePendingClaims(Boolean(access?.canViewAdmin));
  const photos = usePhotosForModeration(Boolean(access?.canViewAdmin));
  const members = useStaffMembers(Boolean(access?.canManageRoles));
  const invites = useStaffInvites(Boolean(access?.canManageRoles));
  const audit = useAuditLogs();
  const history = useRecentListingHistory(Boolean(access?.canViewAdmin));
  const analytics = useAnalyticsMetrics();
  const whatsapp = useWhatsappStatus();
  // Handoff admin hanya boleh dirender di ruang kelola: query-nya melempar
  // untuk akun biasa, jadi `useQuery` di sini dijaga oleh gerbang di atas.
  const handoff = useAdminHandoffPreview();
  const reviewClaim = useMutation(api.claims.reviewVendorClaim);
  const moderatePhoto = useMutation(api.community.moderateVendorPhoto);
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

  if (access === undefined) return null;
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

  return (
    <section className="admin-panel mt-8 overflow-hidden" aria-labelledby="governance-title">
      <div className="border-b-2 border-[#121212] bg-[#FFE662] p-4 sm:p-6">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-[#525252]">Governance & monitoring</p>
        <h2 id="governance-title" className="mt-1 text-2xl font-black text-[#1A1A1A]">Kelola akses, moderasi, dan status provider</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#525252]">Semua keputusan di bawah diverifikasi ulang di server. Frontend hanya menampilkan aksi; bukan sumber kebenaran role.</p>
      </div>
      <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-2">
        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Konfigurasi WhatsApp Business</h3>
          <p className="mt-2 text-sm leading-6 text-[#525252]">Masukkan key melalui tab Keys/API keys. Token tidak pernah ditampilkan atau disimpan di audit log.</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="border-2 border-[#121212] bg-[#F1EDE3] p-3"><dt className="font-bold text-[#525252]">Provider</dt><dd className="mt-1 font-black">{whatsapp?.configured ? `Terhubung (${whatsapp.provider})` : "Belum dikonfigurasi"}</dd><p className="mt-1 text-xs font-bold text-[#525252]">Meta: {whatsapp?.metaConfigured ? `aktif …${whatsapp.metaPhoneNumberId}` : "belum"} · Twilio: {whatsapp?.twilioConfigured ? "aktif" : "belum"}</p></div>
            <div className="border-2 border-[#121212] bg-[#F1EDE3] p-3"><dt className="font-bold text-[#525252]">Webhook status</dt><dd className="mt-1 font-black">{whatsapp?.webhookConfigured ? "Aktif" : "Belum aktif"}</dd>{whatsapp?.webhookUrl ? <p className="mt-2 break-all text-xs font-bold text-[#525252]">URL untuk Twilio/Meta: <span className="text-[#1A1A1A]">{whatsapp.webhookUrl}</span></p> : null}</div>
            <div className="border-2 border-[#121212] bg-[#F1EDE3] p-3"><dt className="font-bold text-[#525252]">Nomor_FROM</dt><dd className="mt-1 break-all font-black">{whatsapp?.maskedFrom ?? "—"}</dd></div>
            <div className="border-2 border-[#121212] bg-[#F1EDE3] p-3"><dt className="font-bold text-[#525252]">Delivery</dt><dd className="mt-1 font-black">Queued {whatsapp?.deliveryCounts.queued ?? 0} · Sent {whatsapp?.deliveryCounts.sent ?? 0} · Delivered {whatsapp?.deliveryCounts.delivered ?? 0} · Failed {whatsapp?.deliveryCounts.failed ?? 0}</dd></div>
          </dl>
          <p className="mt-3 text-xs font-bold text-[#525252]">Meta: WHATSAPP_ACCESS_TOKEN · WHATSAPP_PHONE_NUMBER_ID · WHATSAPP_APP_SECRET · WHATSAPP_VERIFY_TOKEN · WHATSAPP_TEMPLATE_NAME (opsional) · META_GRAPH_VERSION (opsional)</p>
          <p className="mt-1 text-xs font-bold text-[#525252]">Twilio: TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_WHATSAPP_FROM · TWILIO_WHATSAPP_CONTENT_SID (opsional)</p>
          <p className="mt-3 text-xs font-bold text-[#525252]">Pengaturan di atas hanya untuk notifikasi warga. Komunikasi ke admin tidak memakai provider ini — lihat panel handoff di bawah.</p>
        </article>

        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Handoff WhatsApp admin</h3>
          <p className="mt-2 text-sm leading-6 text-[#525252]">
            Notifikasi untuk admin tidak lagi dikirim dari server. Aplikasi menyiapkan tautan click-to-chat
            dan pengelola yang menekan kirim di aplikasi WhatsApp masing-masing.
          </p>
          {handoff ? (
            <>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="border-2 border-[#121212] bg-[#F1EDE3] p-3">
                  <dt className="font-bold text-[#525252]">Nomor tujuan</dt>
                  <dd className="mt-1 font-black">{handoff.recipient}</dd>
                  <p className="mt-1 text-xs font-bold text-[#525252]">
                    {handoff.recipientVerified ? "Bentuk internasional valid." : "Bentuk nomor tidak valid."}
                  </p>
                </div>
                <div className="border-2 border-[#121212] bg-[#F1EDE3] p-3">
                  <dt className="font-bold text-[#525252]">Ringkasan {handoff.date}</dt>
                  <dd className="mt-1 font-black">
                    {handoff.summary.openErrorReports} error · {handoff.summary.newRequests} permintaan · {handoff.summary.activeAdminSessions} sesi
                  </dd>
                </div>
                <div className="border-2 border-[#121212] bg-[#F1EDE3] p-3 sm:col-span-2">
                  <dt className="font-bold text-[#525252]">Handoff disiapkan</dt>
                  <dd className="mt-1 font-black">{handoff.handoffCount}</dd>
                  <p className="mt-1 text-xs font-bold text-[#525252]">Terpisah dari angka pengiriman warga, jadi tidak mengubah makna Delivery di atas.</p>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={handoff.url}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="admin-handoff-cta"
                  className="admin-btn admin-btn-highlight px-4"
                >
                  Buka WhatsApp admin
                </a>
                <code className="max-w-full break-all text-xs text-[#525252]">{handoff.baseUrl}</code>
              </div>
              <p className="mt-3 text-xs font-bold text-[#525252]">
                {handoff.evidence.generated}. {handoff.evidence.payload}. {handoff.evidence.boundary}.
              </p>
            </>
          ) : (
            <AdminLoadingSkeleton label="Memuat ringkasan…" rows={3} />
          )}
        </article>

        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Klaim listing ({claims ? claims.length : "…"})</h3>
          {claims?.length ? <div className="mt-3 space-y-3">{claims.map((claim) => <div key={claim._id} className="border-2 border-[#121212] bg-[#F5F0E5] p-3"><p className="font-black text-[#1A1A1A]">{claim.vendorName}</p><p className="mt-1 text-sm text-[#525252]">{claim.requesterName} · {claim.requesterEmail}</p><p className="mt-1 text-sm text-[#525252]">{claim.businessAddress} · {claim.whatsappPhone}</p>{claim.evidenceUrl ? <a href={claim.evidenceUrl} target="_blank" rel="noreferrer" className="admin-link mt-2 inline-block text-sm">Lihat bukti foto</a> : <p className="mt-1 text-xs text-[#525252]">Tidak ada bukti foto terlampir.</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy === claim._id || !access.canModerate} onClick={() => void run(claim._id, () => reviewClaim({ claimId: claim._id as never, decision: "verified" }), "Klaim disetujui dan pemilik ditugaskan.")} className="admin-btn admin-btn-success px-3 disabled:opacity-50">Setujui</button><button type="button" disabled={busy === claim._id || !access.canModerate} onClick={() => void run(claim._id, () => reviewClaim({ claimId: claim._id as never, decision: "rejected", reviewNote: "Bukti belum sesuai" }), "Klaim ditolak dan dicatat di audit.")} className="admin-btn admin-btn-danger px-3 disabled:opacity-50">Tolak</button></div></div>)}</div> : <AdminQueueEmptyState status={claims === undefined ? "loading" : "empty"} variant="claims" loadingLabel="Memuat antrean klaim" emptyCopy="Tidak ada klaim menunggu." emptyHint="Semua beres untuk sekarang." />}
        </article>

        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Moderasi foto ({photos ? photos.length : "…"})</h3>
          {photos?.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{photos.map((photo) => <div key={photo._id} className="overflow-hidden border-2 border-[#121212] bg-[#F5F0E5]"><img src={photo.url ?? ""} alt={photo.caption || "Foto listing"} className="aspect-video w-full object-cover" /><div className="p-2"><p className="text-sm font-black">{photo.vendorName}</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy === photo._id || !access.canModerate} onClick={() => void run(photo._id, () => moderatePhoto({ id: photo._id as never, decision: "approved" }), "Foto disetujui.")} className="admin-btn admin-btn-success px-2 text-xs disabled:opacity-50">Setujui</button><button type="button" disabled={busy === photo._id || !access.canModerate} onClick={() => void run(photo._id, () => moderatePhoto({ id: photo._id as never, decision: "rejected", note: "Tidak relevan" }), "Foto ditolak.")} className="admin-btn admin-btn-danger px-2 text-xs disabled:opacity-50">Tolak</button></div></div></div>)}</div> : <AdminQueueEmptyState status={photos === undefined ? "loading" : "empty"} variant="photos" loadingLabel="Memuat antrean foto" emptyCopy="Tidak ada foto menunggu moderasi." emptyHint="Tidak ada yang perlu ditinjau." />}
        </article>

        {/* Panel Peran pengelola hanya dirender untuk akun pemilik.
              Alasannya bukan sekadar hak akses: panel ini mencantumkan siapa
              saja yang punya peran, jadi menampilkannya kepada admin biasa
              memberi peta jalan untuk mencoba naik level. Server sudah menolak
              perubahan peran di luar akun pemilik; menyembunyikan panel ini
              membuat tampilan berhenti menjanjikan sesuatu yang memang tidak
              bisa dilakukan. */}
        {access.isOwner ? (
        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Peran pengelola</h3>
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
        </article>
        ) : null}

        <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
          <h3 className="text-lg font-black text-[#1A1A1A]">Ringkasan analytics</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(analytics?.events ?? {}).map(([key, value]) => <div key={key} className="border-2 border-[#121212] bg-[#F5F0E5] p-3"><p className="text-xs font-bold text-[#525252]">{key}</p><p className="mt-1 text-xl font-black">{String(value)}</p></div>)}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold text-[#525252]"><span>Tanpa harga: {analytics?.listingsWithoutPrice ?? 0}</span><span>Tanpa foto: {analytics?.listingsWithoutPhotos ?? 0}</span><span>Tanpa jam: {analytics?.listingsWithoutHours ?? 0}</span><span>Paling responsif: {analytics?.topProviders?.[0]?.name ?? "Belum ada data"}</span></div>
        </article>

        <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
          <h3 className="text-lg font-black text-[#1A1A1A]">Riwayat perubahan listing</h3>
          {history?.length ? <div className="mt-3 max-h-64 space-y-2 overflow-auto">{history.map((entry) => <article key={entry._id} className="border-b border-[#D6D3D1] pb-2 text-sm"><p className="font-black text-[#1A1A1A]">{entry.vendorName} · <TimeStampLabel timestamp={entry.createdAt} /></p>{entry.changes.map((change) => <p key={`${entry._id}-${change.field}`} className="mt-1 text-[#525252]"><span className="font-bold">{change.field}</span>: {change.oldValue ?? "—"} → {change.newValue ?? "—"}</p>)}</article>)}</div> : <p className="mt-3 text-sm text-[#525252]">Belum ada riwayat perubahan listing.</p>}
        </article>

        <AdminSessionActions />

        <AdminSecurityLog />

        <AdminErrorReports />

        <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
          <h3 className="text-lg font-black text-[#1A1A1A]">Audit log terbaru</h3>
          <p className="mt-1 text-xs leading-5 text-[#525252]">
            Setiap baris mencatat siapa yang mengubah, email dan nomor sesinya, serta nilai
            sebelum dan sesudah. Rincian metadata dibuka per baris.
          </p>
          <AdminAuditLog entries={audit ?? undefined} />
        </article>
      </div>
      {notice ? <p className="border-t-2 border-[#121212] bg-[#DCEBD7] px-4 py-3 text-sm font-black text-[#24533A]" role="status">{notice}</p> : null}
      {error ? <p className="border-t-2 border-[#121212] bg-[#E9B4A7] px-4 py-3 text-sm font-black text-[#7C2D12]" role="alert">{error}</p> : null}
    </section>
  );
}
