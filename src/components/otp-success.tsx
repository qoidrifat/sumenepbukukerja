// Sekuens sukses OTP premium (terminal alur masuk email).
//
// Dipakai Task 6 sebagai tahap sukses: `<OtpSuccess email onDone />`.
// Komponen ini TIDAK menavigasi sendiri: ia hanya memanggil `onDone()`
// setelah hitung mundur selesai. Tidak ada elemen interaktif di sini
// (teks saja), jadi tidak ada cincin fokus.
//
// Pilihan animasi (fallback yang diizinkan brief): kotak-kotak fase
// `merging` dirender ulang secara lokal dengan `layoutId` yang sama
// seperti slot Dialog Task 4 (`otp-slot-${i}`), lalu dianimasikan menuju
// tengah + menyusut. Shared-element lintas komponen hanya mulus bila
// kedua sisi hidup dalam satu pohon motion yang sama; Dialog dan tahap
// sukses dirender di tempat berbeda, jadi animasi lokal ekuivalen ini
// yang terbukti mulus tanpa kopling antar-komponen. Yang dipertahankan
// persis: timing 600ms + stagger 0.04 + spring 320/26.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";

export interface OtpSuccessProps {
  email: string;
  onDone: () => void;
}

type Phase = "merging" | "burst" | "done";

const WARNA = ["#2563EB", "#F59E0B", "#93C5FD", "#ffffff"];
const MERGE_MS = 600;
const BURST_MS = 650;
const COUNTDOWN_START = 3;
const COUNTDOWN_MS = 1000;
const STAGGER = 0.04;
// Jarak antar-pusat slot = 56px (`size-14`) + 12px (`gap-3`) = 68.
// Tetap selaras dengan ukuran slot/jarak di email-otp-dialog: bila
// keduanya berubah, angka ini ikut berubah.
const SLOT_GAP = 68;

/** Jarak tiap kotak dari tengah barisan (6 slot, tengah di antara indeks 2 dan 3). */
function targetX(index: number): number {
  return (2.5 - index) * SLOT_GAP;
}

export function OtpSuccess({ email, onDone }: OtpSuccessProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>(() => (reduceMotion ? "done" : "merging"));
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_START);
  // Guard agar onDone() tepat sekali: tanpa ini efek bisa menembak ulang
  // bila identitas onDone berubah atau efek berjalan ganda (StrictMode dev).
  const doneRef = useRef(false);

  // merging (600ms) → burst. Reduced-motion melewati fase ini.
  useEffect(() => {
    if (reduceMotion || phase !== "merging") return;
    const timer = setTimeout(() => setPhase("burst"), MERGE_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion, phase]);

  // burst: kotak tunggal membesar 0→1 (0.25s) + confetti. Reduced-motion melewati fase ini.
  useEffect(() => {
    if (reduceMotion || phase !== "burst") return;
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: WARNA });
    const kiri = setTimeout(
      () => confetti({ particleCount: 40, angle: 60, spread: 60, origin: { x: 0 }, colors: WARNA }),
      250,
    );
    const kanan = setTimeout(
      () => confetti({ particleCount: 40, angle: 120, spread: 60, origin: { x: 1 }, colors: WARNA }),
      400,
    );
    const lanjut = setTimeout(() => setPhase("done"), BURST_MS);
    return () => {
      clearTimeout(kiri);
      clearTimeout(kanan);
      clearTimeout(lanjut);
    };
  }, [reduceMotion, phase]);

  // done: hitung mundur rantai pewaktu 1 detik, lalu onDone() tepat sekali.
  useEffect(() => {
    if (phase !== "done") return;
    if (secondsLeft <= 0) {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((v) => Math.max(0, v - 1)), COUNTDOWN_MS);
    return () => clearTimeout(timer);
  }, [phase, secondsLeft, onDone]);

  return (
    <div className="flex flex-col items-center gap-5 px-6 py-8 text-center">
      {phase === "merging" ? (
        <div className="flex items-center justify-center gap-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <motion.div
              key={i}
              layoutId={`otp-slot-${i}`}
              initial={{ x: 0, scale: 1, opacity: 1 }}
              animate={{ x: targetX(i), scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 26, delay: i * STAGGER }}
              className="size-14 rounded-xl border-2 border-blue-600 bg-blue-50"
            />
          ))}
        </div>
      ) : null}

      {phase === "burst" ? (
        <motion.div
          layoutId="otp-merged"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
          className="size-16 rounded-2xl bg-blue-600"
        />
      ) : null}

      {phase === "done" ? (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-3"
        >
          <motion.svg
            viewBox="0 0 64 64"
            role="img"
            aria-label="Verifikasi OTP Berhasil"
            className="size-16"
          >
            <motion.circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#2563EB"
              strokeWidth="4"
              initial={reduceMotion ? { opacity: 0 } : { pathLength: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { pathLength: 1 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
            />
            <motion.path
              d="M20 33l8 8 16-16"
              fill="none"
              stroke="#2563EB"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduceMotion ? { opacity: 0 } : { pathLength: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { pathLength: 1 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
            />
          </motion.svg>
          <h2 className="text-xl font-black tracking-tight text-slate-900">
            Verifikasi OTP Berhasil
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            Masuk sebagai <span className="font-bold text-slate-900">{email}</span>.
          </p>
          <p aria-live="polite" className="text-sm leading-6 text-slate-600">
            Halaman akan dialihkan secara otomatis dalam ({secondsLeft})
          </p>
        </motion.div>
      ) : null}
    </div>
  );
}
