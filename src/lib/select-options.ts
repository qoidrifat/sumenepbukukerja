import type { ThemedSelectOption } from "@/components/ui/themed-select"
import { categoryOptions, landmarks } from "@/lib/catalog"

export type { ThemedSelectOption }

/**
 * Option lists for the app's selects. They live here so the same value/label
 * pair is reused by every surface (landing form, dashboard, admin editor)
 * instead of being re-typed in each file.
 */
export const categorySelectOptions: ThemedSelectOption[] = categoryOptions.map(
  (item) => ({ value: item.label, label: item.label })
)

export const landmarkSelectOptions: ThemedSelectOption[] = landmarks
  .filter((item) => item.id !== "all")
  .map((item) => ({ value: item.id, label: item.label }))

export const allSumenepOption: ThemedSelectOption = {
  value: "all",
  label: "Semua Sumenep",
}

export const areaSelectOptions: ThemedSelectOption[] = [
  allSumenepOption,
  ...landmarkSelectOptions,
]

export const availabilitySelectOptions: ThemedSelectOption[] = [
  { value: "available", label: "Tersedia" },
  { value: "busy", label: "Sedang sibuk" },
  { value: "closed", label: "Tutup sementara" },
]

export const staffRoleSelectOptions: ThemedSelectOption[] = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
  { value: "viewer", label: "Viewer" },
]

export const reportReasonSelectOptions: ThemedSelectOption[] = [
  { value: "Informasi tidak akurat", label: "Informasi tidak akurat" },
  { value: "Nomor WhatsApp salah", label: "Nomor WhatsApp salah" },
  { value: "Usaha sudah tutup", label: "Usaha sudah tutup" },
  { value: "Konten tidak pantas", label: "Konten tidak pantas" },
]

export const interactionStatusSelectOptions: ThemedSelectOption[] = [
  { value: "opened", label: "Baru dibuka" },
  { value: "waiting", label: "Menunggu dibalas" },
  { value: "completed", label: "Sudah selesai" },
  { value: "dismissed", label: "Tutup" },
]

export const errorReportStatusSelectOptions: ThemedSelectOption[] = [
  { value: "open", label: "Terbuka" },
  { value: "acknowledged", label: "Ditangani" },
  { value: "resolved", label: "Selesai" },
  { value: "ignored", label: "Diabaikan" },
]

/**
 * Label peran dalam bentuk panjang, untuk tampilan yang dibaca orang awam.
 *
 * Bentuk pendek di `staffRoleSelectOptions` untuk daftar pilih yang sempit;
 * bentuk panjang ini untuk halaman penerima undangan dan pesan yang dikirim ke
 * sana. Keduanya dulu ditulis terpisah di dua file, dan itu berarti penerima
 * bisa melihat "Administrator Ruang Kerja" di kartunya lalu menerima pesan
 * yang menyebut dirinya "admin" — dan tidak tahu mana yang benar.
 */
const STAFF_ROLE_LONG_LABEL: Record<string, string> = {
  admin: "Administrator Ruang Kerja",
  staff: "Pengelola Operasional",
  viewer: "Pengelola Pemantau",
}

/** Label panjang sebuah peran, dengan cadangan agar UI tidak pernah kosong. */
export function staffRoleLongLabel(role: string | null | undefined): string {
  return STAFF_ROLE_LONG_LABEL[role ?? ""] ?? "Pengelola"
}
