import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * Cangkang artikel hukum (Kebijakan Privasi, Syarat & Ketentuan).
 *
 * Halaman teks-statis yang bisa dibaca tanpa masuk: judul, tanggal
 * pembaruan, ringkasan, isi berstruktur, dan tautan kembali. Meta dan
 * Google mensyaratkan URL-URL ini live untuk dialog login dan rincian
 * aplikasi — jadi isinya fakta operasional nyata, bukan template generik.
 */
export function LegalArticle({
  eyebrow,
  title,
  description,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="notebook-paper flex min-h-dvh min-h-[100svh] flex-col px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="inline-flex min-h-12 items-center rounded-lg px-1 text-base font-extrabold text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          ← Beranda
        </Link>
        <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.14em] text-blue-700">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[clamp(1.8rem,5vw,2.6rem)] font-black leading-[1.1] tracking-[-0.04em] text-slate-950">
          {title}
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-700">{description}</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          Diperbarui {updated}.
        </p>
        <article className="mt-8 space-y-8 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm sm:p-8 [&_h2]:text-lg [&_h2]:font-black [&_h2]:tracking-[-0.02em] [&_h2]:text-slate-950 [&_p]:mt-2 [&_p]:text-base [&_p]:leading-7 [&_p]:text-slate-700 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-base [&_ul]:leading-7 [&_ul]:text-slate-700">
          {children}
        </article>
      </div>
    </main>
  );
}
