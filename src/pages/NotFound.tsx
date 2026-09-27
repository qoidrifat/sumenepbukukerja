import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

import { BrandMascot } from "@/components/brand-mascot";

export default function NotFound() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="notebook-paper flex min-h-dvh min-h-[100svh] items-center justify-center px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-950">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-lg rounded-2xl border border-blue-200 bg-white/95 p-6 text-center shadow-lg sm:p-9"
      >
        {/* Karakter brand, bukan ikon pustaka generik: ini satu-satunya
            tempat di 404 yang boleh bicara, dan dia sedang "mencari". */}
        <BrandMascot state="empty" size="md" className="mx-auto" />
        <p className="mt-6 text-sm font-extrabold uppercase tracking-[0.16em] text-blue-600">Halaman tidak ditemukan</p>
        <h1 className="mt-2 text-5xl font-black tracking-[-0.07em] text-slate-950">404</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-slate-600">
          Catatan yang Anda cari mungkin sudah dipindahkan atau tidak pernah ada di Buku Kerja.
        </p>
        <Link
          to="/#katalog"
          className="mx-auto mt-7 flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-base font-extrabold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="size-5" />Kembali ke katalog
        </Link>
      </motion.section>
    </main>
  );
}
