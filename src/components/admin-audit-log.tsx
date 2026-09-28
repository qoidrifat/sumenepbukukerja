import type { ReactNode } from "react";
import { ArrowRight, MonitorSmartphone, UserRound } from "lucide-react";
import { TimeStampLabel } from "@/components/admin-workspace";
import {
  auditActionChipClass,
  auditActionLabel,
  auditMetadataLabel,
  formatAuditValue,
  initialsOf,
} from "@/lib/audit-detail";

/**
 * Audit log terbaru di meja kerja admin.
 *
 * Sebelumnya tiap baris hanya menampilkan `staff.role_changed` dan waktu.
 * Itu menjawab "apa yang dicatat", bukan pertanyaan yang muncul saat log
 * dibuka: siapa yang melakukan, dari email mana, sesi yang mana, dan dari nilai
 * apa ke nilai apa. Log yang tidak bisa menjawab tiga pertanyaan pertama tidak
 * bisa dipakai ketika ada yang dipertanyakan — dan tepat saat itu ia paling
 * dibutuhkan.
 *
 * Tampilan memakai token yang sama dengan panel lain (`.admin-status`, garis
 * 2px, radius 2px), jadi posisinya di antara Security Desk dan Security Log
 * terasa seperti bagian dari satu meja kerja, bukan widget yang dititipkan.
 */

/** Satu baris audit, bentuk yang dipakai panel ini. */
export type AuditLogEntry = {
  _id: string;
  action: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  actorRole?: string;
  // URL foto TERKINI milik akun pelaku, dihitung server saat log dibaca.
  // Sengaja bukan id storage: blob foto lama selalu dihapus saat diganti, jadi
  // id lama hanya akan menghasilkan tautan mati.
  actorImageUrl?: string;
  sessionRef?: string;
  vendorId?: string;
  requestId?: string;
  entityId?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
  createdAt: number;
};

/** Ringkas id panjang supaya tidak memenuhi baris di layar sempit. */
function shortId(value: string, keep = 8): string {
  return value.length > keep ? `${value.slice(0, keep)}…` : value;
}

/** Label peran yang tampil di panel. */
function roleLabel(role?: string): string {
  if (role === "admin") return "Admin";
  if (role === "staff") return "Pengelola";
  if (role === "viewer") return "Pemantau";
  return "Warga";
}

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-[#525252]">
        {icon}
        {label}
      </p>
      <div className="mt-1 text-sm leading-6 text-[#1A1A1A]">{children}</div>
    </div>
  );
}

export function AdminAuditLog({
  entries,
  emptyHint = "Belum ada aktivitas tercatat.",
}: {
  entries: AuditLogEntry[] | undefined;
  emptyHint?: string;
}) {
  if (entries && entries.length === 0) {
    return <p className="mt-3 text-sm text-[#525252]">{emptyHint}</p>;
  }
  if (!entries) {
    return <p className="mt-3 text-sm text-[#525252]">Memuat audit log...</p>;
  }

  return (
    <div className="mt-3 max-h-[32rem] space-y-2 overflow-auto pr-1">
      {entries.map((entry) => {
        const before = formatAuditValue(entry.oldValue);
        const after = formatAuditValue(entry.newValue);
        const metadata = Object.entries(entry.metadata ?? {}).filter(
          ([, value]) => value !== undefined && value !== "",
        );
        const target = entry.vendorId
          ? { label: "Listing", value: shortId(entry.vendorId) }
          : entry.requestId
            ? { label: "Permintaan", value: shortId(entry.requestId) }
            : entry.entityId
              ? { label: "Entitas", value: shortId(entry.entityId) }
              : null;
        const actorName =
          entry.actorName?.trim() || entry.actorEmail?.split("@")[0] || "Tanpa pelaku";
        const hasDetail = Boolean(before || after || metadata.length || entry.actorId);

        return (
          <article
            key={entry._id}
            data-slot="audit-entry"
            className="rounded-[2px] border-2 border-[#121212] bg-white p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-black text-[#1A1A1A]">{auditActionLabel(entry.action)}</p>
                <p className="mt-0.5 font-mono text-[0.65rem] text-[#525252]">{entry.action}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={auditActionChipClass(entry.action)}>{roleLabel(entry.actorRole)}</span>
                <TimeStampLabel
                  timestamp={entry.createdAt}
                  withSeconds
                  className="text-xs text-[#525252]"
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 border-t border-[#D6D3D1] pt-3 sm:grid-cols-3">
              <Field icon={<UserRound className="size-3.5" aria-hidden="true" />} label="Pelaku">
                <div className="flex items-start gap-2">
                  {entry.actorImageUrl ? (
                    <img
                      src={entry.actorImageUrl}
                      alt=""
                      loading="lazy"
                      className="size-8 shrink-0 rounded-[2px] border-2 border-[#121212] bg-[#FFE662] object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-[2px] border-2 border-[#121212] bg-[#FFE662] text-xs font-black text-[#121212]"
                    >
                      {initialsOf(actorName)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-black">{actorName}</p>
                    {entry.actorEmail ? (
                      <p className="break-all font-mono text-xs text-[#525252]">
                        {entry.actorEmail}
                      </p>
                    ) : (
                      <p className="text-xs text-[#525252]">Email tidak tercatat</p>
                    )}
                    {entry.actorId ? (
                      <p className="mt-0.5 break-all font-mono text-[0.65rem] text-[#525252]">
                        id {shortId(entry.actorId, 12)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Field>

              <Field
                icon={<MonitorSmartphone className="size-3.5" aria-hidden="true" />}
                label="Nomor sesi"
              >
                {entry.sessionRef ? (
                  <p className="font-mono">{entry.sessionRef}</p>
                ) : (
                  <p className="text-xs text-[#525252]">Tanpa sesi (sistem atau catatan lama)</p>
                )}
              </Field>

              <Field
                icon={<ArrowRight className="size-3.5" aria-hidden="true" />}
                label="Objek"
              >
                {target ? (
                  <p>
                    <span className="font-bold">{target.label}</span>{" "}
                    <span className="break-all font-mono text-xs">{target.value}</span>
                  </p>
                ) : (
                  <p className="text-xs text-[#525252]">Tanpa objek tertaut</p>
                )}
              </Field>
            </div>

            {hasDetail ? (
              <details className="mt-3 border-t border-[#D6D3D1] pt-2">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.12em] text-[#525252]">
                  Rincian perubahan
                </summary>
                <div className="mt-2 space-y-2">
                  {before || after ? (
                    <p className="break-words text-sm text-[#1A1A1A]">
                      <span className="font-black">Nilai:</span>{" "}
                      <span className="font-mono text-xs text-[#525252]">{before ?? "—"}</span>
                      <ArrowRight
                        className="mx-1 inline size-3.5 align-[-2px] text-[#525252]"
                        aria-hidden="true"
                      />
                      <span className="font-mono text-xs">{after ?? "—"}</span>
                    </p>
                  ) : null}
                  {metadata.length ? (
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {metadata.map(([key, value]) => (
                        <li
                          key={key}
                          className="rounded-[2px] border border-[#D6D3D1] bg-[#F1EDE3] px-2 py-1 text-xs"
                        >
                          <span className="font-black">{auditMetadataLabel(key)}: </span>
                          <span className="break-all font-mono">{String(value)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
