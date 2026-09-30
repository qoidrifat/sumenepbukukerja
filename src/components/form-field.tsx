/**
 * Skema field form bersama untuk area warga.
 *
 * SEBELUM ADA FILE INI
 * -------------------
 * Form listing pemilik (11 isian), form paket (5 isian), form permintaan
 * warga (7 isian), dan form klaim (4 isian) masing-masing menulis ulang
 * `<label><span>Nama</span><input .../></label>` dengan sendirinya. Empat
 * salinan, empat gaya, dan tidak satu pun punya `id` yang menghubungkan
 * label ke kontrol.
 *
 * Yang rusak bukan tampilannya — semuanya "cukup bagus". Yang rusak adalah
 * konsistensi: jarak label ke kontrol 1.5rem di satu form dan 0.5rem di form
 * lain, penanda wajib ditulis di dalam teks label di satu form dan di luar di form
 * lain, dan pesan bantuan yang menempel lewat `aria-describedby` hanya di dua
 * field dari dua puluh. Skema ini bikin ketiganya jadi satu keputusan.
 *
 * YANG SENGAJA TIDAK DIUBAH
 * -------------------------
 * `controlClassName` diteruskan apa adanya ke kontrol. Gaya input bukan milik
 * modul ini: `ownerInputClass` (Dashboard) dan `inputClass` (komunitas) punya
 * warna fokus dan radius yang sudah disetujui, dan memindahkan palet ke sini
 * berarti satu diff besar dengan nol manfaat. Modul ini mengatur TATA LETAK
 * dan AKSESIBILITAS, bukan warna.
 */

import { useId } from "react";

import { cn } from "@/lib/utils";

const LABEL_CLASS = "text-sm font-extrabold text-slate-800";
const OPTIONAL_CLASS = "font-medium text-slate-500";
const HINT_CLASS = "text-xs font-medium text-slate-500";

type FieldShellProps = {
  /** Teks label. Boleh berisi penanda wajib atau keterangan opsional. */
  label: React.ReactNode;
  /** Melebar penuh satu baris di dalam grid `sm:grid-cols-2`. */
  span?: boolean;
  /** Penjelasan singkat yang ikut terbaca pembaca layar lewat `aria-describedby`. */
  hint?: React.ReactNode;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined }) => React.ReactNode;
};

/**
 * Kerangka satu field: label, kontrol, dan keterangan.
 *
 * `children` menerima id yang sudah dibangkitkan supaya kontrol selalu
 * terhubung ke label-nya. Sebelumnya sebagian field mengandalkan asosiasi
 * implisit (label membungkus input) dan sebagian lagi `htmlFor` — dua
 * mekanisme, dan yang kedua salah begitu markup-nya di-refactor sedikit saja.
 */
export function FormFieldShell({
  label,
  span,
  hint,
  className,
  children,
}: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", span && "sm:col-span-2", className)}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children({ id, describedBy: hintId })}
      {hint ? (
        <span id={hintId} className={HINT_CLASS}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type FormFieldProps = {
  label: React.ReactNode;
  span?: boolean;
  hint?: React.ReactNode;
  className?: string;
  /** Umumnya `id` dari komponen selectControlled yang sudah ada. */
  control: (ids: { id: string; describedBy: string | undefined }) => React.ReactNode;
};

/** Field yang kendalienya bukan input teks, misalnya select kustom. */
export function FormField({ label, span, hint, className, control }: FormFieldProps) {
  return (
    <FormFieldShell label={label} span={span} hint={hint} className={className}>
      {control}
    </FormFieldShell>
  );
}

type TextFieldProps = {
  label: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  /** Kelas gaya kontrol apa adanya — lihat catatan di kepala berkas. */
  controlClassName: string;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  as?: "input" | "textarea";
  rows?: number;
  span?: boolean;
  required?: boolean;
  min?: string;
  minLength?: number;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: React.ReactNode;
  /** Kelas tambahan pada pembungkus field, mis. `sm:col-span-2`. */
  className?: string;
  /** Kelas tambahan pada kontrol, mis. `min-h-28 py-3` untuk textarea. */
  controlClassNameExtra?: string;
};

/**
 * Field teks yang Controlled: `value` + `onValueChange`.
 *
 * Pola controlled dipakai karena seluruh form di area warga memang controlled.
 * Menulis `value={x} onChange={(e) => setX(e.target.value)}` di 20 tempat
 * berarti 20 kesempatan salah nama state; di sini pemanggil cukup menulis
 * `onValueChange={setTitle}`.
 */
export function TextField({
  label,
  value,
  onValueChange,
  controlClassName,
  placeholder,
  type = "text",
  as = "input",
  rows,
  span,
  required,
  min,
  minLength,
  maxLength,
  inputMode,
  hint,
  className,
  controlClassNameExtra,
}: TextFieldProps) {
  const shared = {
    value,
    required,
    placeholder,
    min,
    minLength,
    maxLength,
    inputMode,
    className: controlClassNameExtra
      ? `${controlClassName} ${controlClassNameExtra}`
      : controlClassName,
  };
  return (
    <FormFieldShell label={label} span={span} hint={hint} className={className}>
      {({ id, describedBy }) =>
        as === "textarea" ? (
          <textarea
            {...shared}
            id={id}
            aria-describedby={describedBy}
            rows={rows ?? 3}
            onChange={(event) => onValueChange(event.target.value)}
          />
        ) : (
          <input
            {...shared}
            id={id}
            type={type}
            aria-describedby={describedBy}
            onChange={(event) => onValueChange(event.target.value)}
          />
        )
      }
    </FormFieldShell>
  );
}

type CheckFieldProps = {
  label: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  span?: boolean;
  className?: string;
};

/**
 * Kotak centang berlabel panjang, misalnya "Gunakan lokasi saya untuk
 * pencocokan jarak". Bentuknya baris penuh dengan latar, bukan kolom
 * label-di-atas-kontrol seperti field teks, jadi ia punya komponen sendiri
 * alih-alih dipaksa masuk `TextField`.
 */
export function CheckField({
  label,
  checked,
  onCheckedChange,
  span,
  className,
}: CheckFieldProps) {
  return (
    <label
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700",
        span && "sm:col-span-2",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="size-4 accent-blue-600"
      />
      {label}
    </label>
  );
}

/** Penanda field opsional, supaya penulisan "(opsional)" konsisten antar form. */
export function OptionalNote() {
  return <span className={OPTIONAL_CLASS}>(opsional)</span>;
}
