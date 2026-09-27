import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  useAdminSecurityEvents,
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
import { formatDate, inputClass } from "./admin-workspace";
import { ThemedSelect } from "@/components/ui/themed-select";
import { staffRoleSelectOptions } from "@/lib/select-options";

export function AdminGovernance() {
  const access = useCurrentAccess();
  const claims = usePendingClaims(Boolean(access?.canViewAdmin));
  const photos = usePhotosForModeration(Boolean(access?.canViewAdmin));
  const members = useStaffMembers(Boolean(access?.canManageRoles));
  const invites = useStaffInvites(Boolean(access?.canManageRoles));
  const audit = useAuditLogs();
  const history = useRecentListingHistory(Boolean(access?.canViewAdmin));
  const securityEvents = useAdminSecurityEvents(Boolean(access?.canViewAdmin));
  const analytics = useAnalyticsMetrics();
  const whatsapp = useWhatsappStatus();
  const reviewClaim = useMutation(api.claims.reviewVendorClaim);
  const moderatePhoto = useMutation(api.community.moderateVendorPhoto);
  const createInvite = useMutation(api.users.createStaffInvite);
  const acceptInvite = useMutation(api.users.acceptStaffInvite);
  const changeRole = useMutation(api.users.changeStaffRole);
  const revokeInvite = useMutation(api.users.revokeStaffInvite);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "staff" | "viewer">("staff");
  const [token, setToken] = useState("");
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
      await task();
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
        </article>

        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Klaim listing ({claims?.length ?? 0})</h3>
          {claims?.length ? <div className="mt-3 space-y-3">{claims.map((claim) => <div key={claim._id} className="border-2 border-[#121212] bg-[#F5F0E5] p-3"><p className="font-black text-[#1A1A1A]">{claim.vendorName}</p><p className="mt-1 text-sm text-[#525252]">{claim.requesterName} · {claim.requesterEmail}</p><p className="mt-1 text-sm text-[#525252]">{claim.businessAddress} · {claim.whatsappPhone}</p>{claim.evidenceUrl ? <a href={claim.evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-black text-blue-700 underline">Lihat bukti foto</a> : <p className="mt-1 text-xs text-[#525252]">Tidak ada bukti foto terlampir.</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy === claim._id || !access.canModerate} onClick={() => void run(claim._id, () => reviewClaim({ claimId: claim._id as never, decision: "verified" }), "Klaim disetujui dan pemilik ditugaskan.")} className="admin-btn bg-[#DCEBD7] px-3 text-[#24533A] disabled:opacity-50">Setujui</button><button type="button" disabled={busy === claim._id || !access.canModerate} onClick={() => void run(claim._id, () => reviewClaim({ claimId: claim._id as never, decision: "rejected", reviewNote: "Bukti belum sesuai" }), "Klaim ditolak dan dicatat di audit.")} className="admin-btn admin-btn-danger px-3 disabled:opacity-50">Tolak</button></div></div>)}</div> : <p className="mt-3 text-sm text-[#525252]">Tidak ada klaim menunggu.</p>}
        </article>

        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Moderasi foto ({photos?.length ?? 0})</h3>
          {photos?.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{photos.map((photo) => <div key={photo._id} className="overflow-hidden border-2 border-[#121212] bg-[#F5F0E5]"><img src={photo.url ?? ""} alt={photo.caption || "Foto listing"} className="aspect-video w-full object-cover" /><div className="p-2"><p className="text-sm font-black">{photo.vendorName}</p><div className="mt-2 flex gap-2"><button type="button" disabled={busy === photo._id || !access.canModerate} onClick={() => void run(photo._id, () => moderatePhoto({ id: photo._id as never, decision: "approved" }), "Foto disetujui.")} className="admin-btn bg-[#DCEBD7] px-2 text-xs text-[#24533A] disabled:opacity-50">Setujui</button><button type="button" disabled={busy === photo._id || !access.canModerate} onClick={() => void run(photo._id, () => moderatePhoto({ id: photo._id as never, decision: "rejected", note: "Tidak relevan" }), "Foto ditolak.")} className="admin-btn admin-btn-danger px-2 text-xs disabled:opacity-50">Tolak</button></div></div></div>)}</div> : <p className="mt-3 text-sm text-[#525252]">Tidak ada foto menunggu moderasi.</p>}
        </article>

        <article className="border-2 border-[#121212] bg-white p-4">
          <h3 className="text-lg font-black text-[#1A1A1A]">Peran pengelola</h3>
          {access.canManageRoles ? <form onSubmit={(event) => { event.preventDefault(); void run("invite", async () => { const result = await createInvite({ email, role: inviteRole }); setToken(result.token ?? ""); setEmail(""); }, "Kode undangan dibuat. Bagikan sekali melalui kanal aman."); }} className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto]"><label className="sr-only" htmlFor="staff-invite-email">Email pengelola</label><input id="staff-invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@contoh.id" className={inputClass} required /><label className="sr-only" htmlFor="staff-invite-role">Peran pengelola</label><ThemedSelect id="staff-invite-role" variant="admin" value={inviteRole} onValueChange={(value) => setInviteRole(value as typeof inviteRole)} options={staffRoleSelectOptions} /><button type="submit" className="admin-btn admin-btn-primary" disabled={busy === "invite"}>Buat invite</button></form> : <p className="mt-3 text-sm text-[#525252]">Hanya admin yang dapat membuat atau mengubah peran.</p>}
          {token ? <div className="mt-3 border-2 border-[#121212] bg-[#FFE662] p-3"><p className="text-xs font-black uppercase">Kode sekali pakai</p><code className="mt-1 block break-all text-sm">{token}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(token)} className="admin-btn admin-btn-secondary mt-2 px-2 text-xs">Salin kode</button></div> : null}
          <form onSubmit={(event) => { event.preventDefault(); void run("accept", () => acceptInvite({ token: acceptCode }), "Peran akun diperbarui."); }} className="mt-3 flex gap-2"><label className="sr-only" htmlFor="staff-accept-code">Kode undangan</label><input id="staff-accept-code" value={acceptCode} onChange={(event) => setAcceptCode(event.target.value)} placeholder="Tempel kode undangan" className={inputClass} required /><button type="submit" className="admin-btn admin-btn-secondary" disabled={busy === "accept"}>Terima</button></form>
          <div className="mt-4 space-y-2">{members?.map((member) => <div key={member._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6D3D1] pb-2 text-sm"><span className="font-bold">{member.name} · {member.email}</span>{access.canManageRoles ? <ThemedSelect aria-label={`Peran ${member.name}`} variant="admin" size="sm" className="w-auto min-w-[7.5rem]" value={member.role} onValueChange={(value) => void run(member._id, () => changeRole({ userId: member.userId as never, role: value as "admin" | "staff" | "viewer" }), "Peran diperbarui.")} options={staffRoleSelectOptions} /> : <span className="rounded-full bg-[#F1EDE3] px-2 py-1 text-xs font-black">{member.role}</span>}</div>)}</div>
          {invites?.filter((invite) => !invite.acceptedAt && !invite.revokedAt).length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-black">Undangan aktif</summary><ul className="mt-2 space-y-2">{invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt).map((invite) => <li key={invite._id} className="flex items-center justify-between gap-2"><span>{invite.email} · {invite.role}</span>{access.canManageRoles ? <button type="button" className="font-black text-red-700" onClick={() => void run(invite._id, () => revokeInvite({ inviteId: invite._id }), "Undangan dicabut.")}>Cabut</button> : null}</li>)}</ul></details> : null}
        </article>

        <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
          <h3 className="text-lg font-black text-[#1A1A1A]">Ringkasan analytics</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(analytics?.events ?? {}).map(([key, value]) => <div key={key} className="border-2 border-[#121212] bg-[#F5F0E5] p-3"><p className="text-xs font-bold text-[#525252]">{key}</p><p className="mt-1 text-xl font-black">{String(value)}</p></div>)}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold text-[#525252]"><span>Tanpa harga: {analytics?.listingsWithoutPrice ?? 0}</span><span>Tanpa foto: {analytics?.listingsWithoutPhotos ?? 0}</span><span>Tanpa jam: {analytics?.listingsWithoutHours ?? 0}</span><span>Paling responsif: {analytics?.topProviders?.[0]?.name ?? "Belum ada data"}</span></div>
        </article>

        <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
          <h3 className="text-lg font-black text-[#1A1A1A]">Riwayat perubahan listing</h3>
          {history?.length ? <div className="mt-3 max-h-64 space-y-2 overflow-auto">{history.map((entry) => <article key={entry._id} className="border-b border-[#D6D3D1] pb-2 text-sm"><p className="font-black text-[#1A1A1A]">{entry.vendorName} · {formatDate(entry.createdAt)}</p>{entry.changes.map((change) => <p key={`${entry._id}-${change.field}`} className="mt-1 text-[#525252]"><span className="font-bold">{change.field}</span>: {change.oldValue ?? "—"} → {change.newValue ?? "—"}</p>)}</article>)}</div> : <p className="mt-3 text-sm text-[#525252]">Belum ada riwayat perubahan listing.</p>}
        </article>

        <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
          <h3 className="text-lg font-black text-[#1A1A1A]">Percobaan masuk ruang admin</h3>
          <p className="mt-1 text-sm text-[#525252]">
            Jejak percobaan passcode pada halaman <code>/auth?returnTo=/admin</code>.
            Nilai sudah disamarkan di server. IP tidak dikumpulkan karena platform
            tidak mengekspos IP klien.
          </p>
          {securityEvents?.length ? (
            <div className="mt-3 max-h-72 space-y-2 overflow-auto">
              {securityEvents.map((event) => (
                <div
                  key={event._id}
                  className={`border-2 p-3 text-sm ${
                    event.outcome === "success"
                      ? "border-emerald-300 bg-emerald-50"
                      : event.outcome === "locked"
                        ? "border-red-300 bg-red-50"
                        : "border-amber-300 bg-amber-50"
                  }`}
                >
                  <p className="font-black uppercase tracking-wide">
                    {event.outcome === "success"
                      ? "Berhasil"
                      : event.outcome === "locked"
                        ? "Terkunci"
                        : "Gagal"}
                    <span className="ml-2 font-bold normal-case text-[#525252]">
                      {formatDate(event.createdAt)}
                    </span>
                  </p>
                  <dl className="mt-1 space-y-0.5 text-[#525252]">
                    {event.userAgent ? (
                      <div className="flex gap-1">
                        <dt className="font-bold">Perangkat:</dt>
                        <dd className="min-w-0 break-all">{event.userAgent}</dd>
                      </div>
                    ) : null}
                    {event.timezone ? (
                      <div className="flex gap-1">
                        <dt className="font-bold">Zona waktu:</dt>
                        <dd>{event.timezone}</dd>
                      </div>
                    ) : null}
                    {event.locale ? (
                      <div className="flex gap-1">
                        <dt className="font-bold">Bahasa:</dt>
                        <dd>{event.locale}</dd>
                      </div>
                    ) : null}
                    {event.reportedIp ? (
                      <div className="flex gap-1">
                        <dt className="font-bold">IP:</dt>
                        <dd>{event.reportedIp}</dd>
                      </div>
                    ) : null}
                    {event.emailMasked ? (
                      <div className="flex gap-1">
                        <dt className="font-bold">Email:</dt>
                        <dd>{event.emailMasked}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#525252]">Belum ada percobaan tercatat.</p>
          )}
        </article>

        <article className="border-2 border-[#121212] bg-white p-4 xl:col-span-2">
          <h3 className="text-lg font-black text-[#1A1A1A]">Audit log terbaru</h3>
          <div className="mt-3 max-h-64 overflow-auto">{audit?.length ? audit.map((entry) => <div key={entry._id} className="border-b border-[#D6D3D1] py-2 text-sm"><p className="font-black">{entry.action}</p><p className="text-[#525252]">{formatDate(entry.createdAt)}{entry.vendorId ? ` · listing ${entry.vendorId}` : ""}</p></div>) : <p className="text-sm text-[#525252]">Belum ada aktivitas tercatat.</p>}</div>
        </article>
      </div>
      {notice ? <p className="border-t-2 border-[#121212] bg-[#DCEBD7] px-4 py-3 text-sm font-black text-[#24533A]" role="status">{notice}</p> : null}
      {error ? <p className="border-t-2 border-[#121212] bg-[#E9B4A7] px-4 py-3 text-sm font-black text-[#7C2D12]" role="alert">{error}</p> : null}
    </section>
  );
}
