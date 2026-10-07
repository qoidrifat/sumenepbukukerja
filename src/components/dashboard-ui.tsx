import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Counter } from "@/components/react-bits";

/**
 * Primitif bersama untuk Ruang Warga dan Ruang Mitra.
 *
 * Kenapa satu berkas, bukan kelas Tailwind yang ditulis ulang di tiap halaman:
 *
 *  - Dua dashboard ini memang satu keluarga. Sebelum ini, setiap kartu
 *    menuliskan sendiri `rounded-2xl border border-slate-200 bg-white shadow-sm`,
 *    dan setiap tombol menuliskan sendiri biru + radius + tinggi minimumnya.
 *    Hasilnya bukan "seragam", tapi "hampir seragam": sudut satu kartu 12px,
 *    kartu sebelahnya 16px, dan bayangannya berbeda-beda tanpa alasan.
 *    Sekarang permukaannya satu definisi.
 *
 *  - Semua nilai visual hidup di `index.css` (blok "Ruang warga & mitra:
 *    lapisan permukaan premium"), bukan di sini. Berkas ini hanya memasang
 *    kelasnya. Artinya mode kontras tinggi dan reduce-motion cukup ditangani
 *    di satu tempat, dan tidak ada komponen yang bisa diam-diam melewatinya.
 *
 *  - Padding SENGAJA tidak diatur di lapisan CSS itu. `p-5 sm:p-6` di sini
 *    tetap utility Tailwind, jadi komponen yang perlu lebih rapat atau lebih
 *    lega cukup menimpanya tanpa harus melawan spesifisitas.
 *
 * Kanvas memakai `#F7F8FC`, bukan warna baru: itu latar yang diizinkan §8b
 * untuk BrandMascot, dan kartu kosong di kedua dashboard memuat maskot itu.
 * Yang membuat halaman terasa premium bukan warna kanvasnya, melainkan
 * kabut ambient, garis rambut, dan bayangan berlapis di atasnya.
 */

type Tone = "blue" | "amber" | "emerald" | "slate" | "ink";
type PillTone = "blue" | "green" | "amber" | "red" | "neutral";

export function DashShell({ children, className, ...rest }: ComponentPropsWithoutRef<"main">) {
  return (
    <main
      className={cn("dash-shell min-h-dvh min-h-[100svh] bg-[#f7f8fc] text-foreground", className)}
      {...rest}
    >
      {children}
    </main>
  );
}

/**
 * Bilah tipis yang menempel di atas. Sengaja HANYA memuat identitas ruang dan
 * satu aksi: sapaan besar hidup di `DashHero` di bawahnya. Bilah setinggi
 * layar yang menempel akan memakan tinggi pandang ponsel dan menutupi isi
 * yang justru sedang dibaca.
 */
export function DashBar({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <header className="dash-topbar">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-extrabold tracking-[-0.02em] text-slate-950">{label}</span>
          {hint ? <span className="hidden truncate text-xs font-bold uppercase tracking-[0.12em] text-slate-500 sm:inline">{hint}</span> : null}
        </div>
        {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
      </div>
    </header>
  );
}

/** Kontainer isi: satu lebar maksimum, satu ritme jarak, dipakai kedua ruang. */
export function DashBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12 lg:px-10", className)}>
      {children}
    </div>
  );
}

export function DashHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-2xl">
        <p className="dash-eyebrow">{eyebrow}</p>
        <h1 className="dash-display mt-3 text-[clamp(1.9rem,4.4vw,2.9rem)]">{title}</h1>
        <p className="dash-sub mt-3 text-base">{description}</p>
      </div>
      {actions ? <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">{actions}</div> : null}
    </div>
  );
}

export function DashSection({
  id,
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  grid,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Kelas grid untuk baris berjenjang; lihat `.dash-stagger`. */
  grid?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="dash-eyebrow">{eyebrow}</p> : null}
          <h2 className="dash-title mt-2 text-xl sm:text-2xl">{title}</h2>
          {description ? <p className="dash-sub mt-1.5 max-w-2xl text-sm">{description}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {grid ? <div className={cn("dash-stagger", grid)}>{children}</div> : children}
    </section>
  );
}

export function DashPanel({
  className,
  interactive = false,
  soft = false,
  ...rest
}: ComponentPropsWithoutRef<"div"> & { interactive?: boolean; soft?: boolean }) {
  return (
    <div
      className={cn("dash-panel", interactive && "dash-panel--interactive", soft && "dash-panel--soft", className)}
      {...rest}
    />
  );
}

export function DashIcon({ tone = "blue", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("dash-icon", `dash-icon--${tone}`, className)} aria-hidden="true">
      {children}
    </span>
  );
}

export function DashPill({ tone = "neutral", className, children }: { tone?: PillTone; className?: string; children: ReactNode }) {
  return <span className={cn("dash-pill", `dash-pill--${tone}`, className)}>{children}</span>;
}

/**
 * Satu angka ringkasan. `featured` membuat kartu itu membentang dua kolom di
 * layar lebar - inilah yang mengubah baris empat kartu sama besar menjadi
 * bento yang punya titik masuk mata.
 *
 * Ketika nilai belum ada, yang dirender adalah kerangka `role="status"` dengan
 * tinggi yang sama seperti angkanya. Tanpa itu, kartu ikut tumbuh saat data
 * datang dan seluruh baris di bawahnya bergeser (CLS).
 */
export function DashStat({
  icon,
  tone = "blue",
  label,
  value,
  hint,
  action,
  featured = false,
  index = 0,
}: {
  icon: ReactNode;
  tone?: Tone;
  label: string;
  value?: number;
  hint: string;
  action?: ReactNode;
  featured?: boolean;
  index?: number;
}) {
  return (
    <article
      className={cn("dash-panel dash-panel--interactive flex h-full flex-col p-5 sm:p-6", featured && "xl:col-span-2")}
      style={{ "--dash-i": index } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <DashIcon tone={tone}>{icon}</DashIcon>
        {featured ? <DashPill tone="neutral">Ringkasan</DashPill> : null}
      </div>
      <p className="mt-5 text-sm font-bold text-slate-600">{label}</p>
      {value === undefined ? (
        <span
          role="status"
          aria-label={`Memuat ${label.toLowerCase()}`}
          className="mt-2 block h-10 w-24 rounded-md bg-slate-200 motion-safe:animate-pulse"
        />
      ) : (
        <Counter value={value} className="dash-num mt-2 text-4xl" />
      )}
      <p className="dash-sub mt-1 text-sm">{hint}</p>
      {action ? <div className="mt-5 border-t border-slate-200/80 pt-3">{action}</div> : null}
    </article>
  );
}
