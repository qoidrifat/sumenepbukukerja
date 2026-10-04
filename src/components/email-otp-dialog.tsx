// Dialog masuk dengan email dua tahap (Fase 9.5).
//
// Tahap "email": pengguna mengetik alamat lalu menekan Kirim OTP.
// Tahap "code": enam slot digit + hitung mundur kirim ulang; begitu enam
// digit lengkap, `signIn("otp-email", { email, code })` jalan otomatis —
// satu CTA per layar, tanpa tombol verifikasi terpisah.
//
// Setelah `signIn` sukses komponen ini TIDAK menavigasi sendiri: ia hanya
// memanggil `onVerified()`. Navigasi (dan animasi sukses) milik Task 5/6.
// Frontend tidak menyentuh secret apa pun: pengiriman kode lewat
// `api.otpEmail.requestCode`, verifikasi lewat provider `otp-email`.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, TriangleAlert } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { focusRing } from "@/lib/focus-ring";
import { useAuth } from "@/hooks/use-auth";
import { OtpSuccess } from "@/components/otp-success";

export interface EmailOtpDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialEmail?: string;
  redirect: string;
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

export function EmailOtpDialog({
  open,
  onOpenChange,
  initialEmail = "",
  redirect,
  onVerified,
}: EmailOtpDialogProps) {
  // `redirect` sengaja belum dipakai di sini: navigasi milik pemanggil
  // lewat `onVerified()` (Task 6). Disimpan sebagai prop kontrak Task 5/6.
  void redirect;

  const { signIn } = useAuth();
  const requestCode = useAction(api.otpEmail.requestCode);
  const otpStatus = useQuery(api.otpEmail.status);

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

  // Buka ulang = mulai bersih dari tahap email (prefill bila ada).
  //
  // BUKAN `useEffect` (pola `admin-profile.tsx`): aturan lint proyek melarang
  // setState sinkron di dalam efek, dan efek berjalan setelah render sehingga
  // dialog sempat tampil satu frame dengan isi lama. Render membandingkan
  // `open` dengan nilai sebelumnya dan menyesuaikan state sekali.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStage("email");
      setEmail(initialEmail);
      setVerifiedEmail(initialEmail);
      setCode("");
      setError(null);
      setSending(false);
      setVerifying(false);
      // `verifyingRef` TIDAK di-reset di sini (ref dilarang saat render):
      // aman karena tahap kembali ke "email" dan `handleSendEmail`
      // me-reset-nya di event handler sebelum tahap "code" tercapai lagi.
      setSecondsLeft(RESEND_SECONDS);
    }
  }

  // Hitung mundur lewat rantai setTimeout 1 detik.
  useEffect(() => {
    if (stage !== "code" || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((v) => Math.max(0, v - 1)), 1000);
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
      setError(toUserMessage(caught, "Email belum terkirim. Coba lagi sebentar lagi."));
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
  // alih DialogContent yang sama dengan `<OtpSuccess>`, dan `onVerified`
  // baru dipanggil dari ujung sekuens itu (tepat sekali, dijamin komponen).
  // Pemanggil (Auth) menutup + navigasi di sana, sehingga animasi sukses
  // selalu sempat terlihat sebelum halaman berganti.
  useEffect(() => {
    if (stage !== "code" || code.length !== 6 || verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    setError(null);
    signIn("otp-email", { email, code })
      .then((result) => {
        if (!result) {
          verifyingRef.current = false;
          setError("Kode salah atau kedaluwarsa. Periksa lagi lalu coba kirim ulang.");
        } else {
          setVerifiedEmail(email);
          setStage("success");
        }
      })
      .catch((caught: unknown) => {
        verifyingRef.current = false;
        setError(toUserMessage(caught, "Kode salah atau kedaluwarsa. Periksa lagi lalu coba kirim ulang."));
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [stage, code, email, signIn]);

  // Ujung sekuens sukses: tutup dialog dulu, baru beri tahu pemanggil.
  // Urutan ini penting — pemanggil langsung navigasi, dan navigasi
  // melepas Dialog dari pohon. `onVerified` tepat sekali karena
  // `<OtpSuccess>` memanggil `onDone`-nya tepat sekali.
  const handleSuccessDone = () => {
    onOpenChange(false);
    onVerified();
  };

  const otpDisabled = otpStatus?.enabled === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="rounded-2xl sm:max-w-md">
        <DialogTitle>Masuk dengan email</DialogTitle>
        <DialogDescription>
          Masukkan email untuk menerima kode verifikasi 6 digit, lalu ketik kode
          tersebut untuk masuk.
        </DialogDescription>

        {otpDisabled ? (
          <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Layanan masuk email belum tersedia. Coba lagi nanti.
          </p>
        ) : null}

        {stage === "success" ? (
          <OtpSuccess email={verifiedEmail} onDone={handleSuccessDone} />
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
              <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700">
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
              {sending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
              Kirim OTP
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4" ref={codeBoxRef}>
            <p className="text-sm leading-6 text-slate-600">
              Kode 6 digit dikirim ke <span className="font-bold text-slate-900">{email}</span>.
            </p>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                setError(null);
              }}
              disabled={verifying}
            >
              <InputOTPGroup className="gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <motion.div key={i} layoutId={`otp-slot-${i}`}>
                    <InputOTPSlot index={i} className="size-14 text-xl font-extrabold" />
                  </motion.div>
                ))}
              </InputOTPGroup>
            </InputOTP>
            {verifying ? (
              <p className="flex items-center gap-2 text-sm font-bold text-slate-600" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Memeriksa kode…
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="flex items-center gap-2 text-sm font-bold text-red-700">
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}
            {secondsLeft > 0 ? (
              <p className="text-sm text-slate-600">
                Tidak menerima OTP? Kirim ulang ({formatCountdown(secondsLeft)})
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={sending}
                className={`min-h-11 self-start rounded-lg px-1 text-sm font-extrabold text-blue-700 hover:text-blue-900 disabled:opacity-50 ${focusRing}`}
              >
                {sending ? "Mengirim…" : "Kirim OTP"}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
