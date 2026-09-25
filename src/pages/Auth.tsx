import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Mail, UserRound } from "lucide-react";
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
import logo from "@/assets/logo.svg";
import { useAuth } from "@/hooks/use-auth";

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

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect);
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "");
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
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-extrabold text-slate-800 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <ArrowLeft className="size-5" />Kembali
        </button>
        <span className="rounded-full border border-blue-200 bg-white/80 px-3 py-2 text-sm font-extrabold text-blue-700">
          Akun warga
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center py-8">
        <Card className="w-full max-w-md border-slate-200 bg-white/95 p-0 shadow-lg">
          {step === "signIn" ? (
            <>
              <CardHeader className="text-center">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mx-auto flex min-h-12 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  aria-label="Buka beranda Sumenep Buku Kerja"
                >
                  <img src={logo} alt="" width={56} height={56} className="rounded-xl" />
                </button>
                <CardTitle className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">
                  Masuk ke Buku Kerja
                </CardTitle>
                <CardDescription className="text-base leading-7">
                  Simpan listing favorit dan sinkronkan dari perangkat mana pun.
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
            <>
              <CardHeader className="text-center">
                <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-blue-600">Kode 6 digit</p>
                <CardTitle className="mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">Periksa email Anda</CardTitle>
                <CardDescription className="break-all text-base leading-7">
                  Kami mengirim kode ke {step.email}.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent>
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />
                  <div className="flex justify-center py-2">
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
                      <InputOTPGroup>
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
        </Card>
      </div>
    </main>
  );
}

export default function AuthPage(props: AuthProps) {
  return <Auth {...props} />;
}
