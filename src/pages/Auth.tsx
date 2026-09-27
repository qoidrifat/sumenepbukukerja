import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
/* Sumber logo yang sama dengan navbar dan admin: /brand/logo-mark.svg. */
const BRAND_LOGO = "/brand/logo-mark.svg";
import { useAuth } from "@/hooks/use-auth";
import { AnimatedContent, GlassSurface, ScrollReveal, ShinyText } from "@/components/react-bits";
import { useAdminPasscodeGate } from "@/lib/admin-gate-client";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/** Halaman auth khusus menampilkan passcode hanya bila tujuan akhirnya /admin. */
function isAdminDestination(redirect: string) {
  return redirect === "/admin" || redirect.startsWith("/admin/");
}

const formatLockRemaining = (lockedUntil: number) => {
  const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
  if (minutes >= 60) return `${Math.ceil(minutes / 60)} jam`;
  return `${minutes} menit`;
};

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const adminGateRequired = isAdminDestination(redirect);
  // Rute dan tujuan dikirim ke audit log supaya jejak_passcode punya konteks
  // halaman mana yang dicoba. Keduanya bukan bahan keputusan keamanan.
  const gate = useAdminPasscodeGate({
    route: "/auth",
    returnTo: searchParams.get("returnTo"),
  });
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passcodeGranted = gate.state.kind === "granted" ? gate.state : null;
  const needsPasscode = adminGateRequired && passcodeGranted === null;

  // Baris atas dan kartu berbagi satu lebar kolom, sehingga keduanya duduk di
  // sumbu tengah yang sama dan tidak terlihat melayang ke dua arah.
  const shellWidth = needsPasscode
    ? "mx-auto w-full max-w-md sm:max-w-xl lg:max-w-2xl"
    : "mx-auto w-full max-w-md sm:max-w-lg";

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect);
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handlePasscodeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const granted = await gate.submit(passcode);
    if (granted) {
      setPasscode("");
      setStep("signIn");
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "");
      // Tukar tiket sekali pakai dulu, supaya email yang diverifikasi jelas
      // berasal dari orang yang baru saja lolos passcode.
      if (passcodeGranted) {
        const ok = await gate.redeem(passcodeGranted.ticket, email);
        if (!ok) {
          setError(
            "Sesi passcode sudah tidak berlaku. Muat ulang halaman dan coba lagi.",
          );
          gate.reset();
          setIsLoading(false);
          return;
        }
      }
      await signIn("email-otp", formData);
      setStep({ email });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kode verifikasi gagal dikirim. Coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch {
      setError("Kode yang dimasukkan belum tepat. Silakan periksa kembali.");
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mode tamu belum dapat dibuka. Coba lagi.");
      setIsLoading(false);
    }
  };

  return (
    <main className="notebook-paper flex min-h-dvh min-h-[100svh] flex-col px-4 py-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <div className={`${shellWidth} flex items-center justify-between gap-4`}>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="-ml-2 flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <ArrowLeft className="size-5" />Kembali
        </button>
        <span className="rounded-full border border-blue-200 bg-white/80 px-3 py-2 text-sm font-extrabold text-blue-700">
          <ShinyText
            text={adminGateRequired ? "Akses pengelola" : "Akun warga"}
            color="#1d4ed8"
            shineColor="#93c5fd"
            speed={4.5}
          />
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center px-2 py-8 sm:py-10">
        <ScrollReveal className={shellWidth}>
          <GlassSurface tint="light" className="w-full rounded-2xl p-0 shadow-lg">
          <Card className="w-full border-slate-200 bg-white/95 p-0 shadow-lg sm:p-2">
            <AnimatedContent animationKey={needsPasscode ? "passcode" : step === "signIn" ? "email" : step.email}>
          {needsPasscode ? (
            <>
              <CardHeader className="text-center">
                <span className="mx-auto flex size-16 items-center justify-center rounded-2xl border-2 border-slate-900 bg-blue-50 text-blue-700 shadow-[3px_3px_0_#0f172a]">
                  <Lock className="size-8" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">
                  Langkah 1 dari 2
                </p>
                <CardTitle className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
                  Passcode pengelola
                </CardTitle>
                <CardDescription className="text-base leading-7">
                  Ruang /admin dikunci. Masukkan passcode 먼저, baru lanjut ke
                  verifikasi email.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handlePasscodeSubmit}>
                <CardContent>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-extrabold text-slate-800">Passcode</span>
                    <span className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-blue-600" />
                      <Input
                        name="passcode"
                        type={showPasscode ? "text" : "password"}
                        value={passcode}
                        onChange={(event) => setPasscode(event.target.value)}
                        placeholder="••••••••••••••••"
                        autoComplete="off"
                        autoFocus
                        className="min-h-12 pl-11 pr-12 text-base"
                        disabled={gate.state.kind === "checking" || gate.state.kind === "locked"}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasscode((current) => !current)}
                        className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        aria-label={showPasscode ? "Sembunyikan passcode" : "Tampilkan passcode"}
                      >
                        {showPasscode ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    </span>
                  </label>

                  {gate.state.kind === "invalid" ? (
                    <p className="mt-3 flex items-start gap-2 text-sm font-bold text-red-700" role="alert">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{gate.state.message}</span>
                    </p>
                  ) : null}

                  {gate.state.kind === "unconfigured" ? (
                    <p className="mt-3 flex items-start gap-2 text-sm font-bold text-amber-800" role="alert">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        {gate.state.message} Isi environment{" "}
                        <code className="rounded bg-slate-100 px-1">ADMIN_PASSCODE_HASH</code> di
                        dashboard Convex.
                      </span>
                    </p>
                  ) : null}

                  {gate.state.kind === "locked" ? (
                    <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4">
                      <p className="flex items-center gap-2 text-sm font-black text-red-900">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                        Akses dicatat dan dikunci {formatLockRemaining(gate.state.lockedUntil)}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-red-800">
                        Sistem menyimpan jejak percobaan ini dan pengelola dapat
                        meninjaunya di panel admin. Data yang tersimpan:
                      </p>
                      <dl className="mt-3 space-y-1.5 text-sm text-red-900">
                        {gate.state.alert.userAgent ? (
                          <div>
                            <dt className="inline font-black">Perangkat: </dt>
                            <dd className="inline break-all">{gate.state.alert.userAgent}</dd>
                          </div>
                        ) : null}
                        {gate.state.alert.timezone ? (
                          <div>
                            <dt className="inline font-black">Zona waktu: </dt>
                            <dd className="inline">{gate.state.alert.timezone}</dd>
                          </div>
                        ) : null}
                        {gate.state.alert.locale ? (
                          <div>
                            <dt className="inline font-black">Bahasa: </dt>
                            <dd className="inline">{gate.state.alert.locale}</dd>
                          </div>
                        ) : null}
                        {gate.state.alert.reportedIp ? (
                          <div>
                            <dt className="inline font-black">IP: </dt>
                            <dd className="inline">{gate.state.alert.reportedIp}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt className="inline font-black">Percobaan gagal: </dt>
                          <dd className="inline">{gate.state.alert.failedAttempts}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-sm text-red-800">
                        Alamat IP tidak dikirim: platform tidak mengekspos IP klien,
                        jadi tidak dikarang agar log tidak tampak lengkap padahal
                        kosong.
                      </p>
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button
                    type="submit"
                    className="min-h-12 w-full text-base"
                    disabled={gate.state.kind === "checking" || gate.state.kind === "locked"}
                  >
                    {gate.state.kind === "checking" ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-5" />
                    )}
                    {gate.state.kind === "checking" ? "Memeriksa..." : "Verifikasi passcode"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12 w-full text-base"
                    onClick={() => navigate("/")}
                  >
                    Kembali ke katalog
                  </Button>
                </CardFooter>
              </form>
            </>
          ) : step === "signIn" ? (
            <>
              <CardHeader className="text-center">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mx-auto flex min-h-12 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  aria-label="Buka beranda Sumenep Buku Kerja"
                >
                  <img src={BRAND_LOGO} alt="" width={64} height={64} className="rounded-xl" />
                </button>
                <CardTitle className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">
                  Masuk ke Buku Kerja
                </CardTitle>
                <CardDescription className="text-base leading-7">
                  {passcodeGranted
                    ? "Passcode lolos. Sekarang verifikasi email untuk membuka ruang Anda."
                    : "Simpan listing favorit dan sinkronkan dari perangkat mana pun."}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleEmailSubmit}>
                <CardContent>
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-extrabold text-slate-800">Email</span>
                    <span className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-blue-600" />
                      <Input
                        name="email"
                        placeholder="nama@email.com"
                        type="email"
                        autoComplete="email"
                        className="min-h-12 pl-11 text-base"
                        disabled={isLoading}
                        required
                      />
                    </span>
                  </label>
                  {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
                  <Button type="submit" className="mt-5 min-h-12 w-full text-base" disabled={isLoading}>
                    {isLoading ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
                    Kirim kode masuk
                  </Button>
                  <div className="my-5 flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">atau</span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <Button type="button" variant="outline" className="min-h-12 w-full text-base" onClick={handleGuestLogin} disabled={isLoading}>
                    <UserRound className="size-5" />Masuk sebagai tamu
                  </Button>
                </CardContent>
              </form>
            </>
          ) : (
            <>                <CardHeader className="text-center">
                {passcodeGranted ? (
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Passcode terverifikasi
                  </p>
                ) : null}
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Kode 6 digit</p>
                <CardTitle className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">Periksa email Anda</CardTitle>
                <CardDescription className="break-all text-base leading-7">
                  Kami mengirim kode ke {step.email}.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent>
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />
                  <div className="flex justify-center py-3 sm:py-4">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && otp.length === 6 && !isLoading) {
                          const form = (event.target as HTMLElement).closest("form");
                          if (form) form.requestSubmit();
                        }
                      }}
                    >
                      <InputOTPGroup className="[&_[data-slot=input-otp-slot]]:h-10 [&_[data-slot=input-otp-slot]]:w-10 [&_[data-slot=input-otp-slot]]:text-base sm:[&_[data-slot=input-otp-slot]]:h-12 sm:[&_[data-slot=input-otp-slot]]:w-12 sm:[&_[data-slot=input-otp-slot]]:text-lg">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {error ? <p className="mt-3 text-center text-sm font-bold text-red-700">{error}</p> : null}
                  <p className="mt-4 text-center text-sm leading-6 text-slate-600">
                    Tidak menerima kode?{" "}
                    <button type="button" onClick={() => setStep("signIn")} className="min-h-12 rounded-lg px-2 font-extrabold text-blue-700 hover:bg-blue-50">
                      Kirim ulang
                    </button>
                  </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                  <Button type="submit" className="min-h-12 w-full text-base" disabled={isLoading || otp.length !== 6}>
                    {isLoading ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
                    {isLoading ? "Memverifikasi..." : "Verifikasi kode"}
                  </Button>
                  <Button type="button" variant="ghost" className="min-h-12 w-full text-base" onClick={() => setStep("signIn")} disabled={isLoading}>
                    Gunakan email lain
                  </Button>
                </CardFooter>
              </form>
            </>
          )}
            </AnimatedContent>
          </Card>
          </GlassSurface>
        </ScrollReveal>
      </div>
    </main>
  );
}

export default function AuthPage(props: AuthProps) {
  return <Auth {...props} />;
}
