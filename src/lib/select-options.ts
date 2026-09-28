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
