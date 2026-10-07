// Alur masuk dengan email dua tahap (dipakai halaman /auth/email).
//
// Diekstrak dari `EmailOtpDialog` (Fase 9.5, kini dihapus): isi yang sama
// persis tanpa pembungkus Dialog — halaman penuh, bukan popup.
//
// Tahap "email": pengguna mengetik alamat lalu menekan Kirim OTP.
// Tahap "code": enam slot digit + hitung mundur kirim ulang; begitu enam
// digit lengkap, `signIn("otp-email", { email, code })` jalan otomatis —
// satu CTA per layar, tanpa tombol verifikasi terpisah.
//
// Setelah `signIn` sukses komponen ini TIDAK menavigasi sendiri: tahap
// `"success"` merender `<OtpSuccess>` dan `onVerified()` dipanggil dari
// ujung sekuens itu. Navigasi milik pemanggil (halaman).
// Frontend tidak menyentuh secret apa pun: pengiriman kode lewat
// `api.otpEmail.requestCode`, verifikasi lewat provider `otp-email`.

import { useEffect, useRef, useState } from "react";
import { motion, useAnimation, useReducedMotion } from "framer-motion";
import { Loader2, TriangleAlert } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOtpStatus } from "@/hooks/use-otp-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { focusRing } from "@/lib/focus-ring";
import { useAuth } from "@/hooks/use-auth";
import { OtpSuccess } from "@/components/otp-success";

export interface EmailOtpFlowProps {
  initialEmail?: string;
  onVerified: () => void;
}

type Stage = "email" | "code" | "success";

const RESEND_SECONDS = 60;

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Pesan Convex (ConvexError) tiba sebagai `data`; selain itu pakai message. */
function toUserMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string" && data.trim()) return data;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function EmailOtpFlow({ initialEmail = "", onVerified }: EmailOtpFlowProps) {
  const { signIn } = useAuth();
  const requestCode = useAction(api.otpEmail.requestCode);

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState(initialEmail);
  const [verifiedEmail, setVerifiedEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const verifyingRef = useRef(false);
  const codeBoxRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const shakeControls = useAnimation();

  // Kode salah = kotak bergoyang (ala vault), lalu bisa diketik ulang.
  // Tanpa remount (fokus tidak hilang), tanpa gerak bila reduced-motion.
  useEffect(() => {
    if (!error || stage !== "code" || reduceMotion) return;
    void shakeControls.start({
      x: [0, -12, 12, -8, 8, 0],
      transition: { duration: 0.4, ease: "easeOut" },
    });
  }, [error, stage, reduceMotion, shakeControls]);

  // Hitung mundur lewat rantai setTimeout 1 detik.
  useEffect(() => {
    if (stage !== "code" || secondsLeft <= 0) return;
    const timer = setTimeout(
      () => setSecondsLeft((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [stage, secondsLeft]);

  // Masuk tahap kode = fokus ke slot pertama.
  useEffect(() => {
    if (stage !== "code") return;
    codeBoxRef.current?.querySelector("input")?.focus();
  }, [stage]);

  const sendCode = async (targetEmail: string): Promise<boolean> => {
    setSending(true);
    setError(null);
    try {
      const result = await requestCode({ email: targetEmail });
      setSecondsLeft(Math.max(0, Math.ceil(result.retryAfterMs / 1000)));
      return true;
    } catch (caught) {
      setError(
        toUserMessage(caught, "Email belum terkirim. Coba lagi sebentar lagi."),
      );
      return false;
    } finally {
      setSending(false);
    }
  };

  const handleSendEmail = async () => {
    const ok = await sendCode(email);
    if (ok) {
      setCode("");
      verifyingRef.current = false;
      setStage("code");
    }
  };

  const handleResend = async () => {
    await sendCode(email);
  };

  // Enam digit lengkap = verifikasi otomatis, tanpa tombol terpisah.
  //
  // Sukses TIDAK memanggil `onVerified` di sini: tahap `"success"` mengambil
  // alih lewat `<OtpSuccess>`, dan `onVerified` baru dipanggil dari ujung
  // sekuens itu (tepat sekali, dijamin komponen).
  useEffect(() => {
    if (stage !== "code" || code.length !== 6 || verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setError(null);
    signIn("otp-email", { email, code })
      .then((result) => {
        if (!result) {
          verifyingRef.current = false;
          setError(
            "Kode salah atau kedaluwarsa. Periksa lagi lalu coba kirim ulang.",
          );
        } else {
          setVerifiedEmail(email);
          setStage("success");
        }
      })
      .catch((caught: unknown) => {
        verifyingRef.current = false;
        setError(
          toUserMessage(
            caught,
            "Kode salah atau kedaluwarsa. Periksa lagi lalu coba kirim ulang.",
          ),
        );
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [stage, code, email, signIn]);

  // Ujung sekuens sukses: langsung beri tahu pemanggil (tak ada dialog yang
  // perlu ditutup — pemanggil menavigasi pergi).
  const handleSuccessDone = () => {
    onVerified();
  };

  const { enabled: otpLive, known: otpKnown } = useOtpStatus();
  // Mati hanya bila server SUDAH menjawab mati. Belum-terjawab (loading)
  // atau gagal bukan mati: kirim tetap dicoba, server yang memutuskan.
  const otpDisabled = otpKnown && !otpLive;

  return (
    <div>
      <h2 className="sr-only">Masuk dengan email</h2>
      <p className="sr-only">
        Masukkan email untuk menerima kode verifikasi 6 digit, lalu ketik kode tersebut untuk masuk.
      </p>

      {otpDisabled ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm font-bold text-red-700"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          Layanan masuk email belum tersedia. Coba lagi nanti.
        </p>
      ) : null}

      {stage === "success" ? (
        <OtpSuccess email={verifiedEmail} digits={code} onDone={handleSuccessDone} />
      ) : stage === "email" ? (
        <div className="flex flex-col gap-3">
          <Label htmlFor="otp-email">Email</Label>
          <Input
            id="otp-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            disabled={sending}
            className={`min-h-11 ${focusRing}`}
          />
          {error ? (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm font-bold text-red-700"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={() => void handleSendEmail()}
            disabled={sending || otpDisabled}
            className={`min-h-12 w-full ${focusRing}`}
          >
            {sending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : null}
            Kirim OTP
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4" ref={codeBoxRef}>
          {/* Saat verifikasi berjalan, kepala + kirim-ulang memudar-geser
              keluar (ala layar sukses sumber 1); indikator memeriksa menggantikan. */}
          <motion.p
            animate={{ opacity: verifying ? 0 : 1, y: verifying ? 10 : 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            aria-hidden={verifying}
            className={`text-center text-sm leading-6 text-slate-600 ${verifying ? "pointer-events-none select-none" : ""}`}
          >
            Kode 6 digit dikirim ke{" "}
            <span className="font-bold text-slate-900">{email}</span>.
          </motion.p>
          <motion.div animate={shakeControls} className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(value) => {
              setCode(value);
              setError(null);
            }}
            disabled={verifying}
          >
            <InputOTPGroup className="justify-center gap-3">
              {Array.from({ length: 6 }, (_, i) => {
                const filled = code[i] !== undefined && code[i] !== "";
                return (
                  <motion.div
                    key={i}
                    layoutId={`otp-slot-${i}`}
                    initial={{ opacity: 0, y: 14, scale: 0.9 }}
                    animate={filled ? "pop" : "enter"}
                    variants={{
                      enter: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        transition: { delay: 0.05 * i, duration: 0.3, ease: "easeOut" },
                      },
                      pop: { scale: [1, 1.14, 1], transition: { duration: 0.28, ease: "easeOut" } },
                    }}
                  >
                    <InputOTPSlot
                      index={i}
                      className={`size-14 text-xl font-extrabold transition-shadow sm:size-16 sm:text-2xl ${
                        filled
                          ? "border-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.25),0_0_22px_rgba(37,99,235,0.5)]"
                          : ""
                      }`}
                    />
                  </motion.div>
                );
              })}
            </InputOTPGroup>
          </InputOTP>
          </motion.div>
          {verifying ? (
            <p
              className="flex w-full items-center justify-center gap-2 text-sm font-bold text-slate-600"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Memeriksa kode…
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm font-bold text-red-700"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {secondsLeft > 0 ? (
            <motion.p
              animate={{ opacity: verifying ? 0 : 1, y: verifying ? 10 : 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              aria-hidden={verifying}
              className={`w-full text-center text-sm text-slate-600 ${verifying ? "pointer-events-none select-none" : ""}`}
            >
              Tidak menerima OTP? Kirim ulang ({formatCountdown(secondsLeft)})
            </motion.p>
          ) : (
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={sending}
              className={`min-h-11 self-center rounded-lg px-1 text-sm font-extrabold text-blue-700 hover:text-blue-900 disabled:opacity-50 ${focusRing}`}
            >
              {sending ? "Mengirim…" : "Kirim OTP"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
