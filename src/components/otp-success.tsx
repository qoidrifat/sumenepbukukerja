// src/components/otp-success.tsx
//
// Sekuens sukses OTP sinematik: hold → converge → orbit → implode → shatter →
// flash → white hold → count → reveal (ring + check 3 detik + settle).
// Tiap fase gerak berjalan 2 detik, count + ceklis 3 detik (permintaan
// pemilik); total ~13 detik. Countdown pengalihan menyesuaikan agar sekuens
// tidak terpotong redirect.
//
// Pembagian peran (disengaja, bukan satu lib dipaksa semua):
// - framer-motion: converge spring, orbit digit, SVG ring/check, micro-settle,
//   bubbles, reduced-motion.
// - GSAP timeline: segmen implode → shatter → flash → white hold sebagai SATU
//   sequence presisi (bukan puluhan setTimeout terpisah). Cleanup via
//   gsap.context + revert agar tidak ada tween tertinggal saat unmount.
// - Fragmen berasal dari geometri kotaknya sendiri (bukan confetti pesta).
// - Ide orbit + badge "Terverifikasi" diadaptasi dari referensi vault;
//   glow-pop kotak dari referensi input (diterapkan di email-otp-flow).
//
// Frontend tidak menyentuh secret apa pun. `onDone` dipanggil tepat sekali.
import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import gsap from "gsap";

export interface OtpSuccessProps {
  email: string;
  /** Enam digit yang baru saja benar, ditampilkan mengorbit. Default titik. */
  digits?: string;
  onDone: () => void;
}

type Phase = "converge" | "orbit" | "cinematic" | "count" | "reveal";

const BOX_COUNT = 6;
// Jarak antar-pusat slot = 56px (size-14) + 12px (gap-3) = 68.
// Tetap selaras dengan ukuran slot/jarak di email-otp-flow: bila keduanya
// berubah, angka ini ikut berubah.
const SLOT_GAP = 68;
const FRAGMENTS_PER_BOX = 4;

/** Posisi awal horizontal tiap kotak relatif terhadap titik tengah. */
function getSlotOffset(index: number): number {
  return (index - (BOX_COUNT - 1) / 2) * SLOT_GAP;
}

/** Jari-jari orbit digit (px). */
const ORBIT_RADIUS = 64;

/** Posisi digit ke-i pada lingkaran, mulai dari jam 12 searah jarum jam. */
function getOrbitPosition(index: number): { x: number; y: number } {
  const angle = (index / BOX_COUNT) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * ORBIT_RADIUS, y: Math.sin(angle) * ORBIT_RADIUS };
}

/** Gelembung celebrasi deterministik (bukan Math.random: SSR/test stabil). */
function getBubbleVector(index: number): { x: number; delay: number; size: number } {
  return {
    x: ((index * 53) % 120) - 60,
    delay: 0.3 + (index % 4) * 0.15,
    size: 6 + ((index * 7) % 8),
  };
}

/**
 * Vektor ledak deterministik per fragmen (bukan Math.random: SSR dan test
 * harus deterministik, dan tidak ada hydration mismatch). Tiap kotak pecah
 * ke arah luar dari posisinya, tiap fragmen punya sudut, jarak, dan putaran
 * sendiri.
 */
function getFragmentVector(box: number, frag: number): { x: number; y: number; r: number } {
  const baseAngle = (box / BOX_COUNT) * 360 + frag * 23;
  const rad = (baseAngle * Math.PI) / 180;
  const distance = 90 + ((box * 7 + frag * 29) % 70);
  return {
    x: Math.cos(rad) * distance,
    y: Math.sin(rad) * distance,
    r: ((box * 137 + frag * 91) % 360) - 180,
  };
}

export function OtpSuccess({ email, digits = "", onDone }: OtpSuccessProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>(() => (reduceMotion ? "reveal" : "converge"));
  const [secondsLeft, setSecondsLeft] = useState(13);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const scopeRef = useRef<HTMLDivElement>(null);
  // Satu nilai kemajuan menggerakkan ANGKA dan GRADASI serentak — tidak
  // mungkin tidak sinkron karena sumbernya sama.
  const countProgress = useMotionValue(0);
  const countNumber = useTransform(countProgress, (v) => String(Math.round(v)));
  const countWidth = useTransform(countProgress, (v) => `${Math.min(100, Math.max(0, v))}%`);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Hold 200ms (anticipation) + converge 1800ms, lalu orbit digit.
  useEffect(() => {
    if (reduceMotion || phase !== "converge") return;
    const t = setTimeout(() => setPhase("orbit"), 200 + 1800);
    return () => clearTimeout(t);
  }, [phase, reduceMotion]);

  // Orbit 2000ms: digit-digit terbang ke cincin lalu berputar sekali penuh,
  // lalu serahkan ke timeline (implode).
  useEffect(() => {
    if (reduceMotion || phase !== "orbit") return;
    const t = setTimeout(() => setPhase("cinematic"), 2000);
    return () => clearTimeout(t);
  }, [phase, reduceMotion]);

  // Timeline sinematik GSAP: implode → shatter → flash → white hold.
  // Berjalan sekali saat fase "cinematic" mount; revert saat unmount.
  // onComplete masuk fase "count", bukan langsung reveal.
  useEffect(() => {
    if (reduceMotion || phase !== "cinematic") return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { overwrite: "auto" },
        onComplete: () => setPhase("count"),
      });
      // Implode: memadat agresif dengan putaran kecil. expo.in = karakter
      // "cepat lalu sangat cepat" tanpa plugin easing tambahan.
      tl.to(".otp-core", {
        scale: 0.55,
        rotation: "+=18",
        duration: 0.35,
        ease: "expo.in",
      });
      // Shatter: fragmen geometri kotak terlontar staggered. power3.out =
      // karakter "seketika lalu meluruh cepat".
      tl.to(
        ".otp-fragment",
        {
          x: (i: number, el: Element) => Number(el.getAttribute("data-x") ?? 0),
          y: (i: number, el: Element) => Number(el.getAttribute("data-y") ?? 0),
          rotation: (i: number, el: Element) => Number(el.getAttribute("data-r") ?? 0),
          scale: 0,
          opacity: 0,
          duration: 1.0,
          ease: "power3.out",
          stagger: 0.02,
        },
        ">",
      );
      // White flash singkat, lalu white hold sebagai clean reset.
      tl.to(".otp-flash", { opacity: 1, duration: 0.25, ease: "linear" });
      tl.to({}, { duration: 0.4 });
    }, scopeRef);
    return () => ctx.revert();
  }, [phase, reduceMotion]);

  // Fase count 3 detik: angka 0→100 dan gradasi biru bergerak dari SATU
  // nilai kemajuan yang sama. Setelah penuh, masuk reveal (ceklis 3 detik).
  useEffect(() => {
    if (reduceMotion || phase !== "count") return;
    countProgress.set(0);
    const controls = animate(countProgress, 100, { duration: 3, ease: [0.16, 1, 0.3, 1] });
    const t = setTimeout(() => setPhase("reveal"), 3000);
    return () => {
      controls.stop();
      clearTimeout(t);
    };
  }, [phase, reduceMotion, countProgress]);

  // Countdown setelah reveal, lalu onDone tepat sekali.
  useEffect(() => {
    if (phase !== "reveal") return;
    if (secondsLeft <= 0) {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [phase, secondsLeft]);

  return (
    <div
      ref={scopeRef}
      className="relative flex min-h-[340px] w-full flex-col items-center justify-center overflow-hidden px-4 py-8 text-center select-none"
    >
      {/* 1. HOLD + CONVERGE: kotak tertahan sejenak lalu tertarik ke tengah. */}
      {phase === "converge" && (
        <div className="relative flex items-center justify-center" aria-hidden="true">
          {Array.from({ length: BOX_COUNT }, (_, i) => (
              <motion.div
                key={i}
                initial={{ x: getSlotOffset(i), scale: 1, opacity: 1, rotate: 0 }}
                animate={{ x: 0, scale: 0.82, rotate: 8 }}
                transition={{ delay: 0.2, duration: 1.7, ease: [0.16, 1, 0.3, 1] }}
                className="absolute size-14 rounded-xl border-2 border-blue-500 bg-blue-50/80 shadow-md backdrop-blur-sm"
              />
          ))}
        </div>
      )}

      {/* 2. ORBIT: digit-digit terbang ke cincin dan berputar sekali. */}
      {phase === "orbit" && (
        <div className="relative flex size-40 items-center justify-center" aria-hidden="true">
          <motion.div
            initial={{ rotate: 0, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 360, scale: 1, opacity: 1 }}
            transition={{ duration: 2.0, ease: "linear" }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 rounded-full border-2 border-blue-300/70" />
            {Array.from({ length: BOX_COUNT }, (_, i) => {
              const pos = getOrbitPosition(i);
              return (
                <div
                  key={i}
                  style={{ left: `calc(50% + ${pos.x}px)`, top: `calc(50% + ${pos.y}px)` }}
                  className="absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border-2 border-blue-500 bg-blue-50 text-base font-black text-slate-900 shadow-md"
                >
                  {digits[i] ?? "•"}
                </div>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* 3. CINEMATIC: inti + fragmen + flash, digerakkan timeline GSAP. */}
      {phase === "cinematic" && (
        <div className="relative flex items-center justify-center" aria-hidden="true">
          <div className="otp-core absolute size-14 rounded-full bg-blue-600 shadow-[0_0_30px_#2563eb]" />
          {Array.from({ length: BOX_COUNT }, (_, box) =>
            Array.from({ length: FRAGMENTS_PER_BOX }, (_, frag) => {
              const v = getFragmentVector(box, frag);
              return (
                <div
                  key={`${box}-${frag}`}
                  data-x={Math.round(v.x)}
                  data-y={Math.round(v.y)}
                  data-r={Math.round(v.r)}
                  className={`otp-fragment absolute rounded-sm ${
                    (box + frag) % 2 === 0 ? "size-2.5 bg-blue-500" : "size-2 bg-amber-400"
                  }`}
                />
              );
            }),
          )}
          <div className="otp-flash absolute inset-0 z-20 bg-white opacity-0" />
        </div>
      )}

      {/* 4. COUNT 3 detik: angka 0→100 + latar gradasi biru yang terisi
          selaras (satu nilai kemajuan). Minimalis: hanya angka + bar. */}
      {phase === "count" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative z-10 flex w-full max-w-xs flex-col items-center gap-4"
          aria-hidden="true"
        >
          <p className="font-mono text-6xl font-black tabular-nums tracking-tight text-slate-950">
            <motion.span>{countNumber}</motion.span>
          </p>
          <div className="h-2.5 w-full overflow-hidden rounded-full border border-blue-100 bg-blue-50">
            <motion.div
              style={{ width: countWidth }}
              className="h-full rounded-full bg-gradient-to-r from-blue-700 via-blue-500 to-sky-400"
            />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Memverifikasi
          </p>
        </motion.div>
      )}

      {/* 5. REVEAL: ring berlawanan jarum jam + check 3 detik + micro-settle. */}
      {phase === "reveal" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="relative z-10 flex flex-col items-center"
        >
          {!reduceMotion &&
            Array.from({ length: 8 }, (_, i) => {
              const bubble = getBubbleVector(i);
              return (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  initial={{ x: bubble.x, y: 30, opacity: 0, scale: 0.6 }}
                  animate={{ y: -70, opacity: [0, 0.9, 0], scale: 1 }}
                  transition={{ delay: bubble.delay, duration: 1.6, ease: "easeOut" }}
                  style={{ width: bubble.size, height: bubble.size }}
                  className={`absolute bottom-1/2 rounded-full ${
                    i % 2 === 0 ? "bg-blue-400" : "bg-amber-300"
                  }`}
                />
              );
            })}
          <motion.div
            initial={{ scale: 0.82, opacity: 0 }}
            animate={{ scale: [0.82, 0.98, 1.03, 1], opacity: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 380, damping: 22, mass: 0.6 }
            }
            className="relative mb-5 flex size-20 items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.15, opacity: 1 }}
              transition={{ delay: 2.0, duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 rounded-full bg-blue-500/10 blur-xl"
            />

            <svg
              viewBox="0 0 80 80"
              className="size-20 overflow-visible"
              aria-label="Verifikasi berhasil"
              role="img"
            >
              <circle cx="40" cy="40" r="34" fill="none" stroke="#E2E8F0" strokeWidth="4" />

              {/* Ring digambar BERLAWANAN arah jarum jam, mulai dari jam 12:
                  mirror horizontal membalik arah (mulai di jam 9), lalu
                  rotasi +90 menaruh titik awal di jam 12. Lingkaran simetris
                  sehingga yang berubah hanya arah goresan. */}
              <motion.circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke="#2563EB"
                strokeWidth="4.5"
                strokeLinecap="round"
                transform="rotate(90 40 40) translate(80 0) scale(-1 1)"
                initial={reduceMotion ? { opacity: 0 } : { pathLength: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { pathLength: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 2.0, ease: [0.65, 0, 0.25, 1] }
                }
              />

              {/* Check terlahir dari stroke ring, sedikit tertunda. */}
              <motion.path
                d="M26 41.5L35.5 51L54 30.5"
                fill="none"
                stroke="#2563EB"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        pathLength: { delay: 0.8, duration: 3.0, ease: [0.65, 0, 0.25, 1] },
                        opacity: { delay: 0.8, duration: 0.05 },
                      }
                }
              />
            </svg>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.35, 1.4], opacity: [0, 0.35, 0] }}
              transition={{ delay: 3.0, duration: 0.6, ease: "easeOut" }}
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-blue-400"
            />
          </motion.div>

          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 2.6, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-1.5"
          >
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 3.0, duration: 0.4, ease: "easeOut" }}
              className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-700"
            >
              Terverifikasi
            </motion.span>
            <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
              Verifikasi OTP Berhasil
            </h2>
            <p className="text-sm font-medium text-slate-600">
              Masuk sebagai <span className="font-bold text-slate-900">{email}</span>
            </p>
            <p aria-live="polite" className="mt-3 text-xs font-semibold text-slate-400">
              Halaman akan dialihkan secara otomatis dalam ({secondsLeft}s)...
            </p>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
