import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router";
import { BrandMascot } from "@/components/brand-mascot";
import { loaderRouteFor, loaderSequence } from "@/lib/mascot-loader";

/**
 * Loading screen bermaskot untuk transisi rute.
 *
 * Tiap halaman/rute memakai maskot + ekspresi berbeda; satu layar tidak
 * pernah menampilkan dua maskot. Ekspresi (lihat-kanan-kiri, kedip, senyum,
 * sedih) semuanya berasal dari sistem yang sudah ada — sapuan tatap +
 * kedip bawaan BrandMascot, senyum dari state `hello`/`success`, sedih dari
 * state `empty` — yang diorkestrasi di sini bergantian tiap 600ms
 * (4 ketuk = 2,4 detik per loop). Tidak ada wajah baru yang digambar:
 * geometri beku Phase 2/3 dan test-nya tetap berlaku.
 *
 * Disiplin gerak repo: satu rantai pewaktu ber-cleanup (bukan pewaktu
 * periodik), tanpa listener, tanpa bisa difokuskan keyboard, hanya
 * transform/opacity.
 * `prefers-reduced-motion` = satu pose diam + ekspresi tetap terbaca
 * sebagai bentuk. Maskot dekoratif (`aria-hidden`); pesan dibawa teks
 * caption dalam `role="status"`.
 */

const BEAT_MS = 600;

export function MascotLoader() {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion() ?? false;
  const route = useMemo(() => loaderRouteFor(pathname), [pathname]);
  const sequence = useMemo(() => loaderSequence(route.base), [route.base]);
  const [beat, setBeat] = useState(0);

  // Satu rantai timeout (bukan interval): tiap ketuk menjadwalkan ketuk
  // berikutnya, cleanup membatalkan yang tertunda saat unmount/ganti rute.
  useEffect(() => {
    if (reduceMotion || sequence.length <= 1) return;
    const timer = window.setTimeout(() => {
      setBeat((current) => (current + 1) % sequence.length);
    }, BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [beat, sequence, reduceMotion]);

  return (
    <div
      role="status"
      className="flex min-h-dvh min-h-[100svh] flex-col items-center justify-center gap-5 bg-[#f7f8fc] px-4"
    >
      <BrandMascot
        state={reduceMotion ? route.base : (sequence[beat % sequence.length] ?? route.base)}
        size="lg"
        tone={route.tone}
        animated={!reduceMotion}
      />
      <p className="text-base font-semibold text-slate-600">{route.caption}</p>
      {!reduceMotion ? (
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              className="size-2 rounded-full bg-blue-500"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.2, ease: "easeInOut" }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
