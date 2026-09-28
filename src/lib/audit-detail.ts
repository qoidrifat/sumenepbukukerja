import { sha256Hex } from "./security-context";

/**
 * Rincian audit log untuk meja kerja admin.
 *
 * Semua fungsi di sini MURNI dan jalan di server maupun klien, karena label
 * yang sama dipakai saat server membentuk baris audit dan saat panel merendernya.
 * Kalau dipisah, yang berbeda biasanya bukan yang terlihat di baris
 * terbaru: yang berbeda adalah baris lama yang jarang dibuka, dan justru
 * baris itulah yang paling perlu dipercaya.
 */

/**
 * Label bahasa manusia untuk setiap aksi audit.
 *
 * `staff.role_changed` menjawab pertanyaan "apa?" tapi bukan "apaartinya".
 * Log audit dibaca saat ada yang dipertanyakan, dan pada saat itu `role_changed`
 * justru bagian yang paling tidak menjelaskan.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "listing.created": "Listing dibuat",
  "listing.claim_submitted": "Klaim pemilik diajukan",
  "listing.claim_approved": "Klaim pemilik disetujui",
  "listing.claim_rejected": "Klaim pemilik ditolak",
  "listing.archived": "Listing diarsipkan",
  "listing.published": "Listing diterbitkan",
  "listing.status_changed": "Status listing diubah",
  "listing.updated": "Listing diperbarui",
  "listing.verified": "Listing diverifikasi",
  "request.status_changed": "Status permintaan diubah",
  "photo.uploaded": "Foto diunggah",
  "photo.moderated": "Foto dimoderasi",
  "report.moderated": "Laporan dimoderasi",
  "staff.invited": "Pengelolaraya diundang",
  "staff.role_changed": "Peran pengelola diubah",
  "staff.role_change_blocked": "Percobaan ubah peran pemilik DITOLAK",
  "staff.invite_accepted": "Undangan diterima",
  "staff.invite_rejected": "Undangan ditolak",
  "admin.invite_created": "Tautan undangan dibuat",
  "admin.logout": "Sesi admin diakhiri",
  "admin.passcode_changed": "Passcode admin diganti",
  "admin.session_revoked": "Sesi admin dicabut",
  "admin.security_viewed": "Security Desk dibuka",
  "admin.security_detail_viewed": "Rincian keamanan dibuka",
  "error_report.created": "Laporan error dibuat",
  "error_report.status": "Status laporan error diubah",
};

/** Label aksi, dengan cadangan ke kode mentah bila ada aksi baru. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

/**
 * Kelompok warna untuk chip aksi.
 *
 * Empat warna token admin saja (`admin-status-*`), bukan warna baru: kalau
 * audit log memakai palet sendiri, ia akan terlihat seperti laporan dari
 * aplikasi lain, bukan bagian dari meja kerja ini.
 */
export type AuditTone = "verified" | "confirmed" | "inactive" | "unclaimed";

export function auditActionTone(action: string): AuditTone {
  if (action.startsWith("error_report.")) return "inactive";
  if (action.startsWith("admin.")) return "confirmed";
  if (action.startsWith("staff.")) return "confirmed";
  if (action.startsWith("listing.")) return "verified";
  return "unclaimed";
}

/** Kelas chip admin untuk sebuah aksi. */
export function auditActionChipClass(action: string): string {
  return `admin-status admin-status-${auditActionTone(action)}`;
}

/**
 * Nomor sesi ringkas untuk ditampilkan.
 *
 * Id sesi Convex Auth tidak ditampilkan mentah: yang disimpan dan yang
 * ditampilkan adalah turunan SHA-256, jadi reference ini tidak bisa dipakai untuk masuk sesi. Korelasi tetap
 * mungkin karena hasilnya deterministik, dan inilah gunanya — saat ada yang dipertanyakan, dua baris audit dengan
 * `ses_` yang sama hampir selalu berasal dari satu perangkat yang sama.
 */
export async function sessionRefOf(sessionId: string | null | undefined): Promise<string | null> {
  const trimmed = (sessionId ?? "").trim();
  if (!trimmed) return null;
  const digest = await sha256Hex(`audit-session:${trimmed}`);
  return `ses_${digest.slice(0, 8).toUpperCase()}`;
}

/** Inisial untuk kotak nama pelaku, maksimal dua huruf. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  return `${(parts[0] ?? "").slice(0, 1)}${(parts[1] ?? "").slice(0, 1)}`.toUpperCase();
}

/**
 * Ringkas nilai audit untuk tampilan.
 *
 * Nilai disimpan sebagai JSON, jadi bisa berupa objek panjang. Menampilkannya
 * mentah membuat panel jadi tembok teks; memotongnya membuat baris lama
 * tampak sama dengan yang baru.
 */
export function formatAuditValue(value: string | null | undefined, limit = 120): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  let text = trimmed;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") text = parsed;
    else if (parsed === null || parsed === undefined) return null;
    else text = JSON.stringify(parsed);
  } catch {
    // Bukan JSON: biarkan apa adanya, bukan salah parse.
  }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Nama manusia untuk kunci metadata yang sering muncul. */
export const AUDIT_METADATA_LABEL: Record<string, string> = {
  source: "Sumber",
  severity: "Tingkat",
  errorCode: "Kode error",
  feature: "Fitur",
  operation: "Operasi",
  fingerprint: "Sidik jari",
  occurrences: "Kemunculan",
  from: "Dari",
  to: "Ke",
  role: "Peran",
  email: "Email",
  reason: "Alasan",
  sessionRef: "Sesi",
  deviceId: "Perangkat",
  ipFamily: "Keluarga IP",
  ipSource: "Sumber IP",
  generation: "Generasi",
  revokedTickets: "Tiket dicabut",
};

/** Label kunci metadata, dengan cadangan ke kunci aslinya. */
export function auditMetadataLabel(key: string): string {
  return AUDIT_METADATA_LABEL[key] ?? key;
}
